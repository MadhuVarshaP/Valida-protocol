/**
 * Zyra Protocol — Devnet demo seed.
 *
 * Walks one submission through the full 12-step lifecycle (auditor-led /
 * 8B path, so both incentive payments and the second ZK proof are visible)
 * directly against the deployed Anchor program — no UI/browser involved.
 * Run this once before a grant demo recording so /demo-walkthrough always
 * has a fully-published sample submission to show.
 *
 * Reuses the same admin (~/.config/solana/id.json) and auditor
 * (../../solana/.test-auditor.json) keypairs as frontend/tests/ui-full-demo.cjs,
 * so the auditor identity also works if you load it into the in-app Burner
 * wallet during a live demo.
 *
 * Run:  cd frontend && node scripts/seed-demo-data.cjs
 */
const anchor = require("@coral-xyz/anchor");
const {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const { keccak_256 } = require("@noble/hashes/sha3.js");
const fs = require("fs");
const os = require("os");
const path = require("path");

const RPC = process.env.RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("8ndCjxUiatZDPJjxe22cwTSUALHWbfT88Pn2Up18yfLe");
const SOLANA_DIR = path.join(__dirname, "..", "..", "solana");
const AUDITOR_KEYPAIR_PATH = path.join(SOLANA_DIR, ".test-auditor.json");
const WALLET_PATH =
  process.env.ANCHOR_WALLET || path.join(os.homedir(), ".config", "solana", "id.json");

const BOUNTY = Math.round(0.05 * LAMPORTS_PER_SOL);
const FIX_INCENTIVE = Math.round(0.025 * LAMPORTS_PER_SOL);

const u64le = (n) => new anchor.BN(n).toArrayLike(Buffer, "le", 8);
const pdaFor = (prefix, idBn) =>
  PublicKey.findProgramAddressSync([Buffer.from(prefix), u64le(idBn)], PROGRAM_ID)[0];
const configPda = () => PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID)[0];

function commitment(details, salt) {
  return Array.from(keccak_256(Buffer.concat([Buffer.from(details, "utf8"), Buffer.from(salt)])));
}
function randomBytes32() {
  return Uint8Array.from({ length: 32 }, () => Math.floor(Math.random() * 256));
}
function explorer(sig) {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

async function retry(fn, attempts = 6) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = String(e.message || e);
      if (msg.includes("custom program error") || msg.includes("Error Code")) throw e;
      await new Promise((r) => setTimeout(r, Math.min(2500 * (i + 1), 10000)));
    }
  }
  throw lastErr;
}

let step = 0;
const log = (m) => console.log(`\n[${++step}] ${m}`);
const ok = (m, sig) => console.log(`    ✓ ${m}${sig ? `\n      tx: ${explorer(sig)}` : ""}`);

(async () => {
  console.log("═══════════════════════════════════════════════════════");
  console.log(" ZYRA — DEVNET DEMO SEED");
  console.log("═══════════════════════════════════════════════════════");

  const connection = new Connection(RPC, "confirmed");
  const admin = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH, "utf8")))
  );

  let auditor;
  if (fs.existsSync(AUDITOR_KEYPAIR_PATH)) {
    auditor = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(AUDITOR_KEYPAIR_PATH, "utf8")))
    );
  } else {
    auditor = Keypair.generate();
    fs.writeFileSync(AUDITOR_KEYPAIR_PATH, JSON.stringify(Array.from(auditor.secretKey)));
    console.log(`Generated new auditor keypair at ${AUDITOR_KEYPAIR_PATH}`);
  }

  const adminWallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, adminWallet, { commitment: "confirmed" });
  const idl = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "lib", "solana", "idl", "zyra.json"), "utf8")
  );
  const program = new anchor.Program(idl, provider);

  console.log(` admin   = ${admin.publicKey.toBase58()}`);
  console.log(` auditor = ${auditor.publicKey.toBase58()}`);

  const config = await retry(() => program.account.programConfig.fetch(configPda()));
  const sid = config.submissionCount;
  console.log(` submission_id = ${sid.toString()}\n`);

  // ── Funding ────────────────────────────────────────────────────────────
  log("Funding treasury + auditor gas (from admin wallet)");
  const treasuryBal = await connection.getBalance(configPda());
  const auditorBal = await connection.getBalance(auditor.publicKey);
  const tx = new Transaction();
  if (treasuryBal < BOUNTY + FIX_INCENTIVE + 0.02 * LAMPORTS_PER_SOL) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: admin.publicKey,
        toPubkey: configPda(),
        lamports: BOUNTY + FIX_INCENTIVE + Math.round(0.02 * LAMPORTS_PER_SOL),
      })
    );
  }
  if (auditorBal < 0.04 * LAMPORTS_PER_SOL) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: admin.publicKey,
        toPubkey: auditor.publicKey,
        lamports: Math.round(0.08 * LAMPORTS_PER_SOL),
      })
    );
  }
  if (tx.instructions.length > 0) {
    const sig = await retry(() => provider.sendAndConfirm(tx, [admin]));
    ok("funded treasury / auditor", sig);
  } else {
    ok("treasury + auditor already funded — skipped");
  }

  const vulnPda = pdaFor("vuln", sid);
  const escrowPda = pdaFor("escrow", sid);

  const details = `Devnet demo seed — buffer overflow in TLS record parser @ ${Date.now()}`;
  const salt = randomBytes32();
  const commit = commitment(details, salt);
  const nonce = new anchor.BN(Date.now());

  log("Step 2+3 — stake_and_submit");
  let sig = await retry(() =>
    program.methods
      .stakeAndSubmit(
        commit, 1, 1, "OpenSSL", "3.1.0",
        nonce, Array.from(randomBytes32()), new anchor.BN(Math.max(Number(config.requiredStake), 1))
      )
      .accounts({
        submission: vulnPda,
        escrow: escrowPda,
        usedNonce: pdaFor("nonce", nonce),
        config: configPda(),
        auditor: auditor.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([auditor])
      .rpc()
  );
  ok(`submission #${sid.toString()} created — status=Pending`, sig);

  log("Step 4 — verify_submission");
  sig = await retry(() =>
    program.methods
      .verifySubmission(sid)
      .accounts({ submission: vulnPda, config: configPda(), admin: admin.publicKey })
      .rpc()
  );
  ok("status=Verified", sig);

  log("Step 5 — release_bounty (INCENTIVE #1)");
  sig = await retry(() =>
    program.methods
      .releaseBounty(sid, new anchor.BN(BOUNTY))
      .accounts({
        submission: vulnPda, escrow: escrowPda, config: configPda(),
        auditor: auditor.publicKey, admin: admin.publicKey,
      })
      .rpc()
  );
  ok("bounty released, stake returned", sig);

  log("Step 6 — reveal_and_verify");
  sig = await retry(() =>
    program.methods
      .revealAndVerify(sid, details, Array.from(salt), "QmDevnetDemoSeedRevealCid")
      .accounts({ submission: vulnPda, auditor: auditor.publicKey })
      .signers([auditor])
      .rpc()
  );
  ok("keccak256 commitment verified on-chain, status=Revealed", sig);

  log("Step 7 — decide_resolution (8B, auditor-led)");
  sig = await retry(() =>
    program.methods
      .decideResolution(sid, true)
      .accounts({ submission: vulnPda, config: configPda(), admin: admin.publicKey })
      .rpc()
  );
  ok("status=FixInProgress, auditor_led=true", sig);

  log("Step 8B — submit_fix_commitment");
  sig = await retry(() =>
    program.methods
      .submitFixCommitment(sid, Array.from(randomBytes32()))
      .accounts({ submission: vulnPda, auditor: auditor.publicKey })
      .signers([auditor])
      .rpc()
  );
  ok("fix commitment anchored on-chain", sig);

  log("Step 9a — verify_fix");
  sig = await retry(() =>
    program.methods
      .verifyFix(sid)
      .accounts({ submission: vulnPda, config: configPda(), admin: admin.publicKey })
      .rpc()
  );
  ok("status=FixVerified", sig);

  log("Step 9b — release_fix_incentive (INCENTIVE #2)");
  sig = await retry(() =>
    program.methods
      .releaseFixIncentive(sid, new anchor.BN(FIX_INCENTIVE))
      .accounts({
        submission: vulnPda, escrow: escrowPda, config: configPda(),
        auditor: auditor.publicKey, admin: admin.publicKey,
      })
      .rpc()
  );
  ok("fix incentive released", sig);

  log("Step 10 — mark_published");
  sig = await retry(() =>
    program.methods
      .markPublished(sid)
      .accounts({ submission: vulnPda, config: configPda(), admin: admin.publicKey })
      .rpc()
  );
  ok("status=Published — lifecycle complete", sig);

  const final = await program.account.vulnerabilitySubmission.fetch(vulnPda);
  console.log("\n═══════════════════════════════════════════════════════");
  console.log(` ✅ Seeded submission #${sid.toString()} — status=${final.status} (Published)`);
  console.log(` View at: https://explorer.solana.com/address/${vulnPda.toBase58()}?cluster=devnet`);
  console.log(` Open /demo-walkthrough in the app — it will pick this submission up automatically.`);
  console.log("═══════════════════════════════════════════════════════");
  process.exit(0);
})().catch((e) => {
  console.error("\nFATAL:", e);
  process.exit(1);
});
