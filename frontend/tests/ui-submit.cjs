/**
 * UI end-to-end test — auditor submit vertical slice.
 *
 * Drives the running Next.js app (http://localhost:3000) with Playwright using
 * the in-app Burner wallet (no browser extension), fills the Submit Vulnerability
 * form, signs + sends `stakeAndSubmit` to Solana devnet, and then verifies the
 * on-chain VulnerabilitySubmission account was actually created.
 *
 * Run:  node tests/ui-submit.cjs
 */
const { chromium } = require("playwright");
const anchor = require("@coral-xyz/anchor");
const { Connection, PublicKey, Keypair } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const RPC = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("8ndCjxUiatZDPJjxe22cwTSUALHWbfT88Pn2Up18yfLe");

// Funded test auditor (solana/.test-auditor.json)
const AUDITOR_SK = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "solana", ".test-auditor.json"), "utf8")
);

function vulnPda(id) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vuln"), new anchor.BN(id).toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  )[0];
}
function configPda() {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID)[0];
}

(async () => {
  const connection = new Connection(RPC, "confirmed");
  const idl = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "lib", "solana", "idl", "valida.json"), "utf8")
  );
  const dummy = Keypair.generate();
  const provider = new anchor.AnchorProvider(
    connection,
    {
      publicKey: dummy.publicKey,
      signTransaction: async (t) => t,
      signAllTransactions: async (t) => t,
    },
    { commitment: "confirmed" }
  );
  const program = new anchor.Program(idl, provider);

  const cfgBefore = await program.account.programConfig.fetch(configPda());
  const expectedId = Number(cfgBefore.submissionCount);
  console.log(`▶ Expected new submission_id = ${expectedId}`);
  console.log(`  auditor = ${Keypair.fromSecretKey(Uint8Array.from(AUDITOR_SK)).publicKey.toBase58()}`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ acceptDownloads: true });

  // Inject burner identity + auto-select the burner wallet before any app code runs.
  await ctx.addInitScript(
    ([sk]) => {
      window.localStorage.setItem("valida_burner_sk", JSON.stringify(sk));
      window.localStorage.setItem("walletName", '"Burner (Devnet)"');
    },
    [AUDITOR_SK]
  );

  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console.error: " + m.text());
  });

  console.log("▶ Loading /auditor/submit …");
  await page.goto(`${BASE}/auditor/submit`, { waitUntil: "networkidle" });

  // Wait for the burner to auto-connect (required stake resolves from chain).
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="submit-vulnerability"]');
      return !!el; // page rendered
    },
    { timeout: 30000 }
  );

  // Fill the form.
  console.log("▶ Filling submission form …");
  await page.selectOption('[data-testid="template-type"]', "1"); // Authentication Bypass
  await page.fill('[data-testid="affected-software"]', "OpenSSL");
  await page.fill('[data-testid="affected-version"]', "3.1.0");
  // severity = Critical (value 1) — click the radio label
  await page.click('label:has-text("Critical")');
  const desc = `UI-test RCE via buffer overflow @ ${new Date().toISOString()}`;
  await page.fill('[data-testid="description"]', desc);
  await page.fill('[data-testid="system-code-hash"]', "ui-test-system-fingerprint");

  // Download the secret file (gates submission).
  const dl = page.waitForEvent("download");
  await page.click('[data-testid="download-secret"]');
  await (await dl).path();
  console.log("▶ Secret file downloaded (submission unlocked)");

  // Submit — this signs with the burner and sends to devnet.
  console.log("▶ Submitting (stakeAndSubmit → devnet) …");
  await page.click('[data-testid="submit-vulnerability"]');

  // Either success heading or an inline error.
  const outcome = await Promise.race([
    page
      .waitForSelector('text=Submission Confirmed', { timeout: 90000 })
      .then(() => "success"),
    page
      .waitForSelector('[data-testid="submit-error"]', { timeout: 90000 })
      .then(() => "error"),
  ]);

  if (outcome === "error") {
    const msg = await page.textContent('[data-testid="submit-error"]');
    console.error("✗ UI reported error:", msg);
    console.error("page errors:", errors.slice(0, 5));
    await browser.close();
    process.exit(1);
  }

  // Grab the tx signature from the explorer link.
  const txHref = await page.getAttribute('a[href*="explorer.solana.com/tx"]', "href");
  const sig = txHref.split("/tx/")[1].split("?")[0];
  console.log(`✓ UI shows "Submission Confirmed"`);
  console.log(`  tx: https://explorer.solana.com/tx/${sig}?cluster=devnet`);

  await browser.close();

  // ── On-chain verification ──────────────────────────────────────────────────
  console.log("▶ Verifying on-chain …");
  const pda = vulnPda(expectedId);
  const sub = await program.account.vulnerabilitySubmission.fetch(pda);
  const cfgAfter = await program.account.programConfig.fetch(configPda());

  const checks = [
    ["submission account exists at expected PDA", !!sub],
    ["status == Pending (0)", sub.status === 0],
    ["template_type == 1 (AuthBypass)", sub.templateType === 1],
    ["severity == 1 (Critical)", sub.severity === 1],
    ["affected_software == OpenSSL", sub.affectedSoftware === "OpenSSL"],
    ["affected_version == 3.1.0", sub.affectedVersion === "3.1.0"],
    [
      "auditor == burner pubkey",
      sub.auditor.toBase58() ===
        Keypair.fromSecretKey(Uint8Array.from(AUDITOR_SK)).publicKey.toBase58(),
    ],
    ["submission_count incremented", Number(cfgAfter.submissionCount) === expectedId + 1],
  ];

  let allPass = true;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${name}`);
    if (!ok) allPass = false;
  }

  console.log(
    `\n${allPass ? "✅ PASS" : "❌ FAIL"} — submission #${expectedId} via the UI, stake=${(
      Number((await program.account.escrowAccount.fetch(
        PublicKey.findProgramAddressSync(
          [Buffer.from("escrow"), new anchor.BN(expectedId).toArrayLike(Buffer, "le", 8)],
          PROGRAM_ID
        )[0]
      )).stakedAmount) / 1e9
    ).toFixed(4)} SOL`
  );
  process.exit(allPass ? 0 : 1);
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
