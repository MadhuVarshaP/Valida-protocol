/**
 * Full 12-step demo — driven entirely through the UI on Solana devnet.
 *
 * Switches between the auditor and admin identities (both via the in-app Burner
 * wallet) and walks the complete lifecycle:
 *   1. Auditor: stake + submit  → Pending
 *   2. Admin:   verify           → Verified
 *   3. Admin:   release bounty    → bountyPaid (INCENTIVE #1, stake returned)
 *   4. Auditor: reveal (upload secret file) → Revealed (keccak256 verified)
 *   5. Admin:   decide 8B (auditor-led) → FixInProgress
 *   6. Auditor: submit fix commitment
 *   7. Admin:   verify fix        → FixVerified
 *   8. Admin:   release fix incentive (INCENTIVE #2)
 *   9. Admin:   mark published    → Published
 * Then asserts the final on-chain state.
 *
 * Run:  node tests/ui-full-demo.cjs
 */
const { chromium } = require("playwright");
const anchor = require("@coral-xyz/anchor");
const {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const fs = require("fs");
const os = require("os");
const path = require("path");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const RPC = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("8ndCjxUiatZDPJjxe22cwTSUALHWbfT88Pn2Up18yfLe");
const SOLANA_DIR = path.join(__dirname, "..", "..", "solana");

const ADMIN_SK = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".config/solana/id.json"), "utf8"));
const AUDITOR_SK = JSON.parse(fs.readFileSync(path.join(SOLANA_DIR, ".test-auditor.json"), "utf8"));
const adminKp = Keypair.fromSecretKey(Uint8Array.from(ADMIN_SK));
const auditorKp = Keypair.fromSecretKey(Uint8Array.from(AUDITOR_SK));

const u64le = (n) => new anchor.BN(n).toArrayLike(Buffer, "le", 8);
const configPda = () => PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID)[0];
const vulnPda = (id) => PublicKey.findProgramAddressSync([Buffer.from("vuln"), u64le(id)], PROGRAM_ID)[0];
const escrowPda = (id) => PublicKey.findProgramAddressSync([Buffer.from("escrow"), u64le(id)], PROGRAM_ID)[0];

let step = 0;
const log = (m) => console.log(`\n[${++step}] ${m}`);
const ok = (m) => console.log(`    ✓ ${m}`);

async function setIdentity(page, sk) {
  await page.evaluate((skArr) => {
    window.localStorage.setItem("zyra_burner_sk", JSON.stringify(skArr));
    window.localStorage.setItem("walletName", '"Burner (Devnet)"');
  }, sk);
}

// Wait for a chain-derived element, clicking the page's Refresh button between
// polls to absorb devnet RPC-replica lag (the browser may hit a replica that is
// a few seconds behind the node that just confirmed our transaction).
async function waitChain(page, selector, timeout = 120000) {
  const start = Date.now();
  let i = 0;
  while (Date.now() - start < timeout) {
    if (await page.locator(selector).count()) {
      await page.locator(selector).first().waitFor({ state: "visible" });
      return;
    }
    // Refresh only every other poll to avoid compounding RPC rate limits.
    if (i % 2 === 1) {
      const refresh = page.locator('button:has-text("Refresh")');
      if (await refresh.count()) await refresh.first().click().catch(() => {});
    }
    i++;
    await page.waitForTimeout(5000);
  }
  const header = await page.locator("header").innerText().catch(() => "-");
  const rows = await page.locator('[data-testid^="submission-"]').count();
  console.log(`  [waitChain DEBUG] url=${page.url()} header="${header.replace(/\n+/g, " ")}" rows=${rows}`);
  throw new Error("timeout waiting for " + selector);
}

(async () => {
  const connection = new Connection(RPC, "confirmed");
  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "lib/solana/idl/zyra.json"), "utf8"));
  const provider = new anchor.AnchorProvider(
    connection,
    { publicKey: adminKp.publicKey, signTransaction: async (t) => t, signAllTransactions: async (t) => t },
    { commitment: "confirmed" }
  );
  const program = new anchor.Program(idl, provider);

  const cfg = await program.account.programConfig.fetch(configPda());
  const N = Number(cfg.submissionCount);
  console.log(`Target submission_id = ${N}`);
  console.log(`admin   = ${adminKp.publicKey.toBase58()}`);
  console.log(`auditor = ${auditorKp.publicKey.toBase58()}`);

  // Infra: ensure the treasury can pay bounty (0.05) + fix incentive (0.025).
  const treasury = await connection.getBalance(configPda());
  if (treasury < 0.1 * LAMPORTS_PER_SOL) {
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: adminKp.publicKey, toPubkey: configPda(), lamports: 0.12 * LAMPORTS_PER_SOL })
    );
    const sig = await connection.sendTransaction(tx, [adminKp]);
    await connection.confirmTransaction(sig, "confirmed");
    console.log(`Funded treasury 0.12 SOL (${sig.slice(0, 12)}…)`);
  }
  // Ensure auditor has gas.
  if ((await connection.getBalance(auditorKp.publicKey)) < 0.04 * LAMPORTS_PER_SOL) {
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: adminKp.publicKey, toPubkey: auditorKp.publicKey, lamports: 0.08 * LAMPORTS_PER_SOL })
    );
    const sig = await connection.sendTransaction(tx, [adminKp]);
    await connection.confirmTransaction(sig, "confirmed");
    console.log(`Topped up auditor 0.08 SOL`);
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  PAGEERR:", e.message));

  const downloads = [];
  page.on("download", async (d) => {
    const p = path.join(os.tmpdir(), `zyra-${Date.now()}-${d.suggestedFilename()}`);
    await d.saveAs(p);
    downloads.push({ name: d.suggestedFilename(), path: p });
  });

  // Establish the origin, then we can write localStorage between navigations.
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });

  // ── 1. AUDITOR submits ──────────────────────────────────────────────────────
  log("AUDITOR — stake & submit");
  await setIdentity(page, AUDITOR_SK);
  await page.goto(`${BASE}/auditor/submit`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="submit-vulnerability"]', { timeout: 30000 });
  await page.selectOption('[data-testid="template-type"]', "1");
  await page.fill('[data-testid="affected-software"]', "OpenSSL");
  await page.fill('[data-testid="affected-version"]', "3.1.0");
  await page.click('label:has-text("Critical")');
  await page.fill('[data-testid="description"]', `Full-demo RCE in TLS handshake @ ${Date.now()}`);
  await page.fill('[data-testid="system-code-hash"]', "full-demo-system");
  await page.click('[data-testid="download-secret"]');
  await page.click('[data-testid="submit-vulnerability"]');
  await page.waitForSelector("text=Submission Confirmed", { timeout: 90000 });
  ok(`submitted #${N}`);

  const secretFile = downloads.find((d) => d.name === `vulnerability-${N}.json`);
  if (!secretFile) throw new Error(`secret file vulnerability-${N}.json was not downloaded`);
  ok(`captured secret file ${secretFile.name}`);

  // ── 2. ADMIN verify ─────────────────────────────────────────────────────────
  log("ADMIN — verify submission");
  await setIdentity(page, ADMIN_SK);
  await page.goto(`${BASE}/admin/vulnerabilities`, { waitUntil: "networkidle" });
  await waitChain(page, `[data-testid="verify-${N}"]`);
  await page.click(`[data-testid="verify-${N}"]`);
  await waitChain(page, `[data-testid="release-bounty-${N}"]`);
  ok("status → Verified");

  // ── 3. ADMIN release bounty (INCENTIVE #1) ──────────────────────────────────
  log("ADMIN — release bounty (INCENTIVE #1)");
  await page.fill(`[data-testid="bounty-input-${N}"]`, "0.05");
  await page.click(`[data-testid="release-bounty-${N}"]`);
  await waitChain(page, `[data-testid="awaiting-reveal-${N}"]`);
  ok("bounty released, stake returned");

  // ── 4. AUDITOR reveal ───────────────────────────────────────────────────────
  log("AUDITOR — reveal details (upload secret file)");
  await setIdentity(page, AUDITOR_SK);
  await page.goto(`${BASE}/auditor/dashboard`, { waitUntil: "networkidle" });
  await waitChain(page, `[data-testid="reveal-${N}"]`);
  // Clicking the Reveal button sets activeRevealId then opens the file chooser.
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.click(`[data-testid="reveal-${N}"]`),
  ]);
  await chooser.setFiles(secretFile.path);
  await Promise.race([
    page.waitForSelector('[data-testid="reveal-done"]', { timeout: 90000 }),
    page
      .waitForSelector('[data-testid="reveal-error"]', { timeout: 90000 })
      .then(async () => {
        throw new Error("reveal error: " + (await page.textContent('[data-testid="reveal-error"]')));
      }),
  ]);
  ok("revealed — keccak256 commitment verified on-chain");

  // ── 5. ADMIN decide 8B ──────────────────────────────────────────────────────
  log("ADMIN — decide resolution 8B (auditor-led)");
  await setIdentity(page, ADMIN_SK);
  await page.goto(`${BASE}/admin/vulnerabilities`, { waitUntil: "networkidle" });
  await waitChain(page, `[data-testid="assign-auditor-${N}"]`);
  await page.click(`[data-testid="assign-auditor-${N}"]`);
  await waitChain(page, `[data-testid="verify-fix-${N}"]`);
  ok("status → FixInProgress (auditor-led)");

  // ── 6. AUDITOR submit fix commitment ────────────────────────────────────────
  log("AUDITOR — submit fix commitment (8B)");
  await setIdentity(page, AUDITOR_SK);
  await page.goto(`${BASE}/auditor/submit-fix`, { waitUntil: "networkidle" });
  await waitChain(page, `[data-testid="write-fix-${N}"]`);
  await page.click(`[data-testid="write-fix-${N}"]`);
  await page.fill('[data-testid="fix-description"]', "Patch: bounds-check the TLS record length before copy.");
  await page.click('[data-testid="fix-download"]');
  await page.click('[data-testid="fix-commit"]');
  await page.waitForSelector('[data-testid="fix-done"]', { timeout: 90000 });
  ok("fix commitment anchored on-chain");

  // ── 7. ADMIN verify fix ─────────────────────────────────────────────────────
  log("ADMIN — verify fix");
  await setIdentity(page, ADMIN_SK);
  await page.goto(`${BASE}/admin/vulnerabilities`, { waitUntil: "networkidle" });
  await waitChain(page, `[data-testid="verify-fix-${N}"]`);
  await page.click(`[data-testid="verify-fix-${N}"]`);
  await waitChain(page, `[data-testid="release-fix-incentive-${N}"]`);
  ok("status → FixVerified");

  // ── 8. ADMIN release fix incentive (INCENTIVE #2) ───────────────────────────
  log("ADMIN — release fix incentive (INCENTIVE #2)");
  await page.fill(`[data-testid="incentive-input-${N}"]`, "0.025");
  await page.click(`[data-testid="release-fix-incentive-${N}"]`);
  await waitChain(page, `[data-testid="publish-${N}"]`);
  ok("fix incentive released");

  // ── 9. ADMIN mark published ─────────────────────────────────────────────────
  log("ADMIN — mark published (Step 10)");
  await page.click(`[data-testid="publish-${N}"]`);
  await waitChain(page, `[data-testid="published-${N}"]`);
  ok("status → Published");

  await browser.close();

  // ── Final on-chain assertions ───────────────────────────────────────────────
  log("Verifying final on-chain state");
  const sub = await program.account.vulnerabilitySubmission.fetch(vulnPda(N));
  const esc = await program.account.escrowAccount.fetch(escrowPda(N));
  const checks = [
    ["status == Published (6)", sub.status === 6],
    ["commitment_verified", sub.commitmentVerified === true],
    ["fraud_detected == false", sub.fraudDetected === false],
    ["bounty_paid (INCENTIVE #1)", sub.bountyPaid === true],
    ["auditor_led (8B)", sub.auditorLed === true],
    ["fix_incentive_paid (INCENTIVE #2)", sub.fixIncentivePaid === true],
    ["escrow bounty_released", esc.bountyReleased === true],
    ["escrow stake_returned", esc.stakeReturned === true],
    ["escrow fix_incentive_released", esc.fixIncentiveReleased === true],
  ];
  let allPass = true;
  for (const [name, good] of checks) {
    console.log(`    ${good ? "✓" : "✗"} ${name}`);
    if (!good) allPass = false;
  }
  console.log(
    `\n${allPass ? "✅ FULL DEMO PASS" : "❌ FAIL"} — submission #${N} walked all 12 steps through the UI on devnet.`
  );
  process.exit(allPass ? 0 : 1);
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
