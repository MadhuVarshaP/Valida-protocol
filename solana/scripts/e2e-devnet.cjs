/**
 * Valida Protocol — Devnet End-to-End Test
 *
 * Exercises the deployed program (8ndCjxUiatZDPJjxe22cwTSUALHWbfT88Pn2Up18yfLe)
 * against Solana Devnet using the local CLI wallet as admin + treasury funder.
 *
 * Coverage:
 *   A. initialize (skipped if config already exists)
 *   B. publish_patch + verify_patch                (Step 10 patch flow)
 *   C. Full 12-step vulnerability lifecycle        (Steps 2-10, both incentives)
 *   D. Payment gates  — release_bounty / release_fix_incentive before eligible
 *   E. Access control — non-admin cannot verify_submission
 *   F. Replay attack  — reusing a nonce is rejected
 *   G. Rejection      — reject_submission slashes the stake
 *
 * Run:  cd solana && yarn node scripts/e2e-devnet.cjs
 */

const anchor = require("@coral-xyz/anchor");
const {
  Keypair,
  PublicKey,
  SystemProgram,
  Connection,
  LAMPORTS_PER_SOL,
  Transaction,
} = require("@solana/web3.js");
const { keccak_256 } = require("@noble/hashes/sha3.js");
const fs = require("fs");
const os = require("os");
const path = require("path");

const RPC = process.env.RPC_URL || "https://api.devnet.solana.com";
const IDL_PATH = path.join(__dirname, "..", "target", "idl", "valida.json");
const WALLET_PATH =
  process.env.ANCHOR_WALLET ||
  path.join(os.homedir(), ".config", "solana", "id.json");

const BOUNTY = Math.round(0.05 * LAMPORTS_PER_SOL);
const FIX_INCENTIVE = Math.round(0.025 * LAMPORTS_PER_SOL);
const REQUIRED_STAKE = Math.round(0.01 * LAMPORTS_PER_SOL);

const results = [];
let passed = 0;
let failed = 0;

function explorer(sig) {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

function ok(name, sig) {
  passed++;
  results.push({ name, status: "PASS", sig: sig || "" });
  console.log(`  ✓ ${name}${sig ? `\n      tx: ${explorer(sig)}` : ""}`);
}

function fail(name, err) {
  failed++;
  results.push({ name, status: "FAIL", sig: "" });
  console.log(`  ✗ ${name}\n      ${String(err).slice(0, 300)}`);
}

function commitment(details, salt) {
  return Array.from(
    keccak_256(Buffer.concat([Buffer.from(details, "utf8"), Buffer.from(salt)]))
  );
}

function randomBytes32() {
  return Uint8Array.from({ length: 32 }, () => Math.floor(Math.random() * 256));
}

async function retry(fn, label, attempts = 8) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = String(e.message || e);
      // Program errors are deterministic — don't retry those
      if (msg.includes("custom program error") || msg.includes("Error Code") || msg.includes("Simulation failed")) throw e;
      console.log(`    (rpc retry ${i + 1}/${attempts} for ${label}: ${msg.slice(0, 80)})`);
      await new Promise((r) => setTimeout(r, Math.min(3000 * (i + 1), 12000)));
    }
  }
  throw lastErr;
}

async function expectFailure(thunk, expectSubstrings, name) {
  try {
    // retry() passes through deterministic program errors immediately,
    // but absorbs transient devnet RPC failures
    await retry(thunk, name);
    fail(name, "expected the instruction to fail, but it succeeded");
    return;
  } catch (e) {
    const msg = String(e.message || e);
    const matched = expectSubstrings.some((s) => msg.includes(s));
    if (matched) {
      passed++;
      results.push({ name, status: "PASS", sig: "" });
      console.log(`  ✓ ${name}\n      rejected with: ${msg.match(/Error Code: \w+|custom program error: \w+/)?.[0] || msg.slice(0, 90)}`);
    } else {
      fail(name, `failed, but with unexpected error: ${msg.slice(0, 200)}`);
    }
  }
}

(async () => {
  console.log("════════════════════════════════════════════════════════════");
  console.log(" VALIDA PROTOCOL — DEVNET END-TO-END TEST");
  console.log("════════════════════════════════════════════════════════════\n");

  const connection = new Connection(RPC, "confirmed");
  const admin = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH, "utf8")))
  );
  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));
  const program = new anchor.Program(idl, provider);
  const programId = program.programId;
  const BN = anchor.BN;
  const fetchAcct = (ns) => (pk) => retry(() => ns.fetch(pk), "fetch account");
  const getBal = (pk) => retry(() => connection.getBalance(pk), "get balance");

  console.log(` Program : ${programId.toBase58()}`);
  console.log(` Admin   : ${admin.publicKey.toBase58()}`);
  const adminBalStart = await retry(
    () => connection.getBalance(admin.publicKey),
    "admin balance"
  );
  console.log(` Balance : ${(adminBalStart / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId
  );

  const pdaFor = (prefix, idBn) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from(prefix), idBn.toArrayLike(Buffer, "le", 8)],
      programId
    )[0];

  // ── A. initialize ──────────────────────────────────────────────────────────
  console.log("── A. initialize (Step 1) ──");
  let config = await retry(() => program.account.programConfig.fetchNullable(configPda), "fetch config");
  if (config === null) {
    const sig = await retry(
      () =>
        program.methods
          .initialize(new BN(REQUIRED_STAKE))
          .accounts({
            config: configPda,
            signer: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc(),
      "initialize"
    );
    config = await fetchAcct(program.account.programConfig)(configPda);
    ok("initialize — ProgramConfig created", sig);
  } else {
    console.log("  • ProgramConfig already initialized — skipping initialize");
    if (config.admin.toBase58() !== admin.publicKey.toBase58()) {
      console.log(`  !! on-chain admin is ${config.admin.toBase58()} — this wallet cannot act as admin. Aborting.`);
      process.exit(1);
    }
    passed++;
    results.push({ name: "initialize — config exists, admin matches", status: "PASS", sig: "" });
  }
  console.log(
    `  config: admin=${config.admin.toBase58().slice(0, 8)}… requiredStake=${config.requiredStake.toString()} submissions=${config.submissionCount} patches=${config.patchCount}\n`
  );
  const stakeAmount = Math.max(Number(config.requiredStake), REQUIRED_STAKE) * 2;

  // ── Funding: auditor wallet + config treasury ───────────────────────────────
  console.log("── Funding test accounts (from admin wallet, no airdrops) ──");
  const auditor = Keypair.generate();
  console.log(`  auditor (ephemeral): ${auditor.publicKey.toBase58()}`);
  {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: admin.publicKey,
        toPubkey: auditor.publicKey,
        lamports: Math.round(0.12 * LAMPORTS_PER_SOL),
      }),
      SystemProgram.transfer({
        fromPubkey: admin.publicKey,
        toPubkey: configPda,
        lamports: BOUNTY + FIX_INCENTIVE + Math.round(0.02 * LAMPORTS_PER_SOL),
      })
    );
    const sig = await retry(
      () => provider.sendAndConfirm(tx, [admin]),
      "funding"
    );
    ok("fund auditor (0.12 SOL) + config treasury (0.095 SOL)", sig);
  }
  console.log();

  // ── B. Patch flow ───────────────────────────────────────────────────────────
  console.log("── B. publish_patch + verify_patch (Step 10 patch flow) ──");
  try {
    config = await fetchAcct(program.account.programConfig)(configPda);
    const patchId = config.patchCount;
    const patchPda = pdaFor("patch", patchId);
    const fileHash = Array.from(randomBytes32());

    const sig1 = await retry(
      () =>
        program.methods
          .publishPatch("OpenSSL", "3.1.0", "QmDevnetE2EPatchCid0001", fileHash)
          .accounts({
            patch: patchPda,
            config: configPda,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc(),
      "publish_patch"
    );
    let patch = await fetchAcct(program.account.patchRecord)(patchPda);
    if (patch.isVerified !== false) throw new Error("patch should start unverified");
    ok(`publish_patch — patch_id=${patchId}`, sig1);

    const sig2 = await retry(
      () =>
        program.methods
          .verifyPatch(patchId)
          .accounts({ patch: patchPda, config: configPda, admin: admin.publicKey })
          .rpc(),
      "verify_patch"
    );
    patch = await fetchAcct(program.account.patchRecord)(patchPda);
    if (patch.isVerified !== true) throw new Error("is_verified not set");
    ok("verify_patch — is_verified=true", sig2);
  } catch (e) {
    fail("patch flow", e);
  }
  console.log();

  // ── C. Full 12-step vulnerability lifecycle ────────────────────────────────
  console.log("── C. Full vulnerability lifecycle (Steps 2–10) ──");
  const details =
    "Remote code execution via buffer overflow in SSL handshake parser";
  const salt = randomBytes32();
  const commit = commitment(details, salt);
  const nonce = new BN(Date.now());

  config = await fetchAcct(program.account.programConfig)(configPda);
  const sid = config.submissionCount;
  const vulnPda = pdaFor("vuln", sid);
  const escrowPda = pdaFor("escrow", sid);
  const noncePda = pdaFor("nonce", nonce);
  console.log(`  submission_id=${sid}  vuln PDA: ${vulnPda.toBase58()}`);

  try {
    // Step 2+3 — stake_and_submit
    const sig = await retry(
      () =>
        program.methods
          .stakeAndSubmit(
            commit, 1, 1, "OpenSSL", "3.1.0",
            nonce, Array.from(randomBytes32()), new BN(stakeAmount)
          )
          .accounts({
            submission: vulnPda,
            escrow: escrowPda,
            usedNonce: noncePda,
            config: configPda,
            auditor: auditor.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([auditor])
          .rpc(),
      "stake_and_submit"
    );
    const sub = await fetchAcct(program.account.vulnerabilitySubmission)(vulnPda);
    if (sub.status !== 0) throw new Error(`status=${sub.status}, expected Pending(0)`);
    ok(`Step 2+3 stake_and_submit — stake=${stakeAmount} lamports, status=Pending`, sig);
  } catch (e) {
    fail("Step 2+3 stake_and_submit", e);
    throw e; // everything downstream depends on this
  }

  // ── D. Payment gates (before verification) ─────────────────────────────────
  console.log("\n── D. Payment-gate + access-control checks ──");
  await expectFailure(
    () => program.methods
      .releaseBounty(sid, new BN(BOUNTY))
      .accounts({
        submission: vulnPda, escrow: escrowPda, config: configPda,
        auditor: auditor.publicKey, admin: admin.publicKey,
      })
      .rpc(),
    ["BountyNotYetEligible", "6003", "6000"],
    "GATE: release_bounty blocked while status=Pending"
  );
  await expectFailure(
    () => program.methods
      .releaseFixIncentive(sid, new BN(FIX_INCENTIVE))
      .accounts({
        submission: vulnPda, escrow: escrowPda, config: configPda,
        auditor: auditor.publicKey, admin: admin.publicKey,
      })
      .rpc(),
    ["FixIncentiveNotYetEligible", "6004", "6001"],
    "GATE: release_fix_incentive blocked while status=Pending"
  );
  await expectFailure(
    () => program.methods
      .verifySubmission(sid)
      .accounts({ submission: vulnPda, config: configPda, admin: auditor.publicKey })
      .signers([auditor])
      .rpc(),
    ["UnauthorizedAdmin", "ConstraintRaw", "2003"],
    "ACCESS: non-admin cannot verify_submission"
  );

  // ── F. Replay attack ────────────────────────────────────────────────────────
  console.log("\n── F. Replay-attack prevention ──");
  {
    const cfgNow = await fetchAcct(program.account.programConfig)(configPda);
    const sid2 = cfgNow.submissionCount;
    await expectFailure(
      () => program.methods
        .stakeAndSubmit(
          Array.from(randomBytes32()), 2, 2, "curl", "7.88.0",
          nonce, // SAME nonce as the live submission — UsedNonce PDA exists
          Array.from(randomBytes32()), new BN(stakeAmount)
        )
        .accounts({
          submission: pdaFor("vuln", sid2),
          escrow: pdaFor("escrow", sid2),
          usedNonce: noncePda,
          config: configPda,
          auditor: auditor.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([auditor])
        .rpc(),
      ["already in use", "0x0"],
      "REPLAY: reusing a consumed nonce is rejected"
    );
  }

  // ── C (continued) — happy path Steps 4 → 10 ────────────────────────────────
  console.log("\n── C. Lifecycle continued ──");
  try {
    // Step 4 — verify_submission
    let sig = await retry(
      () =>
        program.methods
          .verifySubmission(sid)
          .accounts({ submission: vulnPda, config: configPda, admin: admin.publicKey })
          .rpc(),
      "verify_submission"
    );
    let sub = await fetchAcct(program.account.vulnerabilitySubmission)(vulnPda);
    if (sub.status !== 1) throw new Error(`status=${sub.status}, expected Verified(1)`);
    ok("Step 4 verify_submission — status=Verified", sig);

    // Step 5 — release_bounty (INCENTIVE #1)
    const balBefore = await getBal(auditor.publicKey);
    sig = await retry(
      () =>
        program.methods
          .releaseBounty(sid, new BN(BOUNTY))
          .accounts({
            submission: vulnPda, escrow: escrowPda, config: configPda,
            auditor: auditor.publicKey, admin: admin.publicKey,
          })
          .rpc(),
      "release_bounty"
    );
    const balAfter = await getBal(auditor.publicKey);
    const received = balAfter - balBefore;
    if (received < BOUNTY + stakeAmount)
      throw new Error(`auditor received ${received}, expected >= ${BOUNTY + stakeAmount}`);
    ok(`Step 5 release_bounty ★ INCENTIVE #1 — auditor received ${received} lamports (bounty + returned stake)`, sig);

    // Step 6 — reveal_and_verify (real keccak256 commitment check on-chain)
    sig = await retry(
      () =>
        program.methods
          .revealAndVerify(sid, details, Array.from(salt), "QmRevealedVulnDetailsCid01")
          .accounts({ submission: vulnPda, auditor: auditor.publicKey })
          .signers([auditor])
          .rpc(),
      "reveal_and_verify"
    );
    sub = await fetchAcct(program.account.vulnerabilitySubmission)(vulnPda);
    if (sub.status !== 3 || !sub.commitmentVerified || sub.fraudDetected)
      throw new Error(`bad post-reveal state: status=${sub.status}`);
    ok("Step 6 reveal_and_verify — keccak256 commitment verified on-chain, status=Revealed", sig);

    // Step 7 — decide_resolution → 8B auditor-led
    sig = await retry(
      () =>
        program.methods
          .decideResolution(sid, true)
          .accounts({ submission: vulnPda, config: configPda, admin: admin.publicKey })
          .rpc(),
      "decide_resolution"
    );
    sub = await fetchAcct(program.account.vulnerabilitySubmission)(vulnPda);
    if (sub.status !== 4 || !sub.auditorLed) throw new Error("expected FixInProgress + auditor_led");
    ok("Step 7 decide_resolution — 8B path (auditor-led), status=FixInProgress", sig);

    // Step 8B — submit_fix_commitment
    const fixCommit = Array.from(randomBytes32());
    sig = await retry(
      () =>
        program.methods
          .submitFixCommitment(sid, fixCommit)
          .accounts({ submission: vulnPda, auditor: auditor.publicKey })
          .signers([auditor])
          .rpc(),
      "submit_fix_commitment"
    );
    ok("Step 8B submit_fix_commitment — fix hash anchored", sig);

    // Step 9a — verify_fix
    sig = await retry(
      () =>
        program.methods
          .verifyFix(sid)
          .accounts({ submission: vulnPda, config: configPda, admin: admin.publicKey })
          .rpc(),
      "verify_fix"
    );
    sub = await fetchAcct(program.account.vulnerabilitySubmission)(vulnPda);
    if (sub.status !== 5) throw new Error(`status=${sub.status}, expected FixVerified(5)`);
    ok("Step 9a verify_fix — status=FixVerified", sig);

    // Step 9b — release_fix_incentive (INCENTIVE #2)
    const balBefore2 = await getBal(auditor.publicKey);
    sig = await retry(
      () =>
        program.methods
          .releaseFixIncentive(sid, new BN(FIX_INCENTIVE))
          .accounts({
            submission: vulnPda, escrow: escrowPda, config: configPda,
            auditor: auditor.publicKey, admin: admin.publicKey,
          })
          .rpc(),
      "release_fix_incentive"
    );
    const got = (await getBal(auditor.publicKey)) - balBefore2;
    if (got < FIX_INCENTIVE) throw new Error(`auditor received ${got} < ${FIX_INCENTIVE}`);
    ok(`Step 9b release_fix_incentive ★ INCENTIVE #2 — auditor received ${got} lamports`, sig);

    // Step 10 — mark_published
    sig = await retry(
      () =>
        program.methods
          .markPublished(sid)
          .accounts({ submission: vulnPda, config: configPda, admin: admin.publicKey })
          .rpc(),
      "mark_published"
    );
    sub = await fetchAcct(program.account.vulnerabilitySubmission)(vulnPda);
    if (sub.status !== 6) throw new Error(`status=${sub.status}, expected Published(6)`);
    ok("Step 10 mark_published — status=Published, lifecycle complete", sig);
  } catch (e) {
    fail("lifecycle (steps 4-10)", e);
  }

  // ── G. Rejection + slash ────────────────────────────────────────────────────
  console.log("\n── G. reject_submission slashes the stake ──");
  try {
    const cfgNow = await fetchAcct(program.account.programConfig)(configPda);
    const sidR = cfgNow.submissionCount;
    const vulnR = pdaFor("vuln", sidR);
    const escrowR = pdaFor("escrow", sidR);
    const nonceR = new BN(Date.now() + 7777);

    const sig1 = await retry(
      () =>
        program.methods
          .stakeAndSubmit(
            Array.from(randomBytes32()), 3, 2, "nginx", "1.24.0",
            nonceR, Array.from(randomBytes32()), new BN(stakeAmount)
          )
          .accounts({
            submission: vulnR,
            escrow: escrowR,
            usedNonce: pdaFor("nonce", nonceR),
            config: configPda,
            auditor: auditor.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([auditor])
          .rpc(),
      "stake_and_submit (reject case)"
    );
    ok(`submission_id=${sidR} created for rejection test`, sig1);

    const balBefore = await getBal(auditor.publicKey);
    const sig2 = await retry(
      () =>
        program.methods
          .rejectSubmission(sidR)
          .accounts({
            submission: vulnR, escrow: escrowR, config: configPda,
            admin: admin.publicKey,
          })
          .rpc(),
      "reject_submission"
    );
    const subR = await fetchAcct(program.account.vulnerabilitySubmission)(vulnR);
    const escR = await fetchAcct(program.account.escrowAccount)(escrowR);
    const balAfter = await getBal(auditor.publicKey);
    if (subR.status !== 2) throw new Error(`status=${subR.status}, expected Rejected(2)`);
    if (!escR.slashed) throw new Error("escrow.slashed should be true");
    if (balAfter > balBefore) throw new Error("auditor must not be refunded on slash");
    ok("reject_submission — status=Rejected, stake slashed to treasury", sig2);
  } catch (e) {
    fail("rejection + slash", e);
  }

  // ── Sweep auditor funds back to admin ──────────────────────────────────────
  console.log("\n── Cleanup: sweep ephemeral auditor wallet back to admin ──");
  try {
    const bal = await getBal(auditor.publicKey);
    const fee = 5000;
    if (bal > fee) {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: auditor.publicKey,
          toPubkey: admin.publicKey,
          lamports: bal - fee,
        })
      );
      const sig = await retry(
        () => provider.sendAndConfirm(tx, [auditor]),
        "sweep"
      );
      console.log(`  swept ${(bal - fee) / LAMPORTS_PER_SOL} SOL back → ${explorer(sig)}`);
    }
  } catch (e) {
    console.log(`  sweep failed (non-fatal): ${String(e).slice(0, 120)}`);
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const adminBalEnd = await retry(
    () => connection.getBalance(admin.publicKey),
    "final balance"
  );
  console.log("\n════════════════════════════════════════════════════════════");
  console.log(" RESULTS");
  console.log("════════════════════════════════════════════════════════════");
  for (const r of results) {
    console.log(` ${r.status === "PASS" ? "✓" : "✗"} [${r.status}] ${r.name}`);
  }
  console.log("────────────────────────────────────────────────────────────");
  console.log(` ${passed} passed, ${failed} failed`);
  console.log(
    ` net SOL spent: ${((adminBalStart - adminBalEnd) / LAMPORTS_PER_SOL).toFixed(5)} SOL`
  );
  console.log(
    ` program: https://explorer.solana.com/address/${programId.toBase58()}?cluster=devnet`
  );
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error("\nFATAL:", e);
  process.exit(1);
});
