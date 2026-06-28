# Zyra Protocol

**Decentralized patch management and on-chain vulnerability disclosure — built on Solana.**

Zyra Protocol is a two-phase system for securing software distribution and rewarding security researchers:

- **Phase 1 — Patch Management** (originally shipped on Base Sepolia EVM) — publishers anchor software patches on-chain with SHA-256 integrity proofs; devices verify hashes before applying updates.
- **Phase 2 — Vulnerability Discovery + ZK** (now shipped on Solana Devnet via Anchor) — auditors submit cryptographic commitments to vulnerabilities, collect bounties for finding bugs, reveal full details on-chain, and earn a second incentive for fixing them. ZK circuits let auditors prove vulnerability knowledge without disclosing exploitable details prematurely.

---

## Evolution of the Protocol

```
Phase 1 — Base Sepolia (EVM)           Phase 2 — Solana Devnet (Anchor)
─────────────────────────────          ──────────────────────────────────────
ZyraProtocol.sol                     programs/zyra  (this repo, /solana)
  ├─ Publisher registration            ├─ stake_and_submit       (Step 2+3)
  ├─ Patch publishing + IPFS CID       ├─ verify_submission       (Step 4)
  ├─ Device registration               ├─ release_bounty          (Step 5 ★)
  └─ On-chain hash verification        ├─ reveal_and_verify       (Step 6)
                                       ├─ decide_resolution       (Step 7)
ZyraVulnerability.sol                ├─ submit_fix_commitment   (Step 8B)
ZyraEscrow.sol                       ├─ verify_fix              (Step 9a)
ZyraZKVerifier.sol                   ├─ release_fix_incentive   (Step 9b ★)
AuthBypassVerifier.sol (Groth16)       ├─ mark_published          (Step 10)
AuthBypass.circom (Poseidon)           └─ publish_patch           (Step 10)

★ INCENTIVE #1 = bounty for finding the bug (requires status = Verified)
★ INCENTIVE #2 = incentive for fixing the bug (requires status = FixVerified)
```

The EVM contracts remain in `/contract` for reference; the **Solana program is the primary build target** for this grant submission.

---

## Repository Structure

```
zyra-protocol/
│
├── solana/                          ← PRIMARY: Anchor program (Solana Devnet)
│   ├── programs/zyra/src/
│   │   ├── lib.rs                   Program entry, all 14 on-chain events
│   │   ├── state.rs                 5 account structs with space calculations
│   │   ├── errors.rs                ZyraError — 12 typed error codes
│   │   └── instructions/
│   │       ├── patch.rs             initialize, publish_patch, verify_patch
│   │       └── vulnerability.rs     Full 12-step workflow (Steps 2–10)
│   ├── tests/zyra.ts              TypeScript tests — 7 scenarios
│   ├── scripts/deploy.sh            Devnet deployment script
│   ├── Anchor.toml
│   └── README.md                    Solana-specific docs
│
├── contract/                        EVM contracts (Phase 1, Base Sepolia)
│   ├── zyra.sol                   ZyraProtocol — patch management
│   ├── ZyraVulnerability.sol      Vulnerability lifecycle (EVM mirror)
│   ├── ZyraEscrow.sol             Staking + bounty payments (EVM)
│   ├── ZyraZKVerifier.sol         ZK proof routing (EVM)
│   └── AuthBypassVerifier.sol       Groth16 verifier (auto-generated)
│
├── circuits/
│   └── AuthBypass.circom            Poseidon-based ZK circuit
│
├── frontend/                        Next.js 14 frontend (App Router)
│   ├── app/                         Role-based pages (admin/publisher/auditor/device)
│   ├── lib/                         Contract ABIs, wagmi config, IPFS helpers
│   └── context/                     Wallet, Web3, Toast providers
│
├── backend/                         Express.js REST API
│   ├── models/                      Mongoose models (User, Patch, Device, Log)
│   ├── controllers/                 Admin, publisher, device controllers
│   ├── services/                    Chain sync, IPFS, hash verification
│   └── routes/                      API route definitions
│
└── scripts/
    ├── deploy.js                    EVM multi-contract deployment
    └── setup-zk.sh                  ZK trusted setup + verifier export
```

---

## Solana Program

### Program Details

| | |
|---|---|
| **Program ID** | `8ndCjxUiatZDPJjxe22cwTSUALHWbfT88Pn2Up18yfLe` |
| **Network** | Solana Devnet |
| **Framework** | Anchor 0.30.0 |
| **Build status** | Compiled — `target/deploy/zyra.so` (315 KB) |
| **IDL** | `solana/target/idl/zyra.json` |
| **Explorer** | [View on Solana Explorer](https://explorer.solana.com/address/8ndCjxUiatZDPJjxe22cwTSUALHWbfT88Pn2Up18yfLe?cluster=devnet) *(live after deploy)* |

> **Deployment pending** — deployer wallet needs ~3 SOL from [faucet.solana.com](https://faucet.solana.com). Once funded: `cd solana && anchor deploy --provider.cluster devnet`

### On-Chain Accounts

| Account | PDA Seeds | Bytes | Purpose |
|---|---|---|---|
| `ProgramConfig` | `[b"config"]` | 65 | Admin pubkey, required stake, global counters |
| `PatchRecord` | `[b"patch", patch_id (le8)]` | 318 | Software patch — name, version, IPFS CID, SHA-256 |
| `VulnerabilitySubmission` | `[b"vuln", submission_id (le8)]` | 405 | Full 12-step lifecycle state |
| `EscrowAccount` | `[b"escrow", submission_id (le8)]` | 77 | Stake + bounty + fix-incentive payment tracking |
| `UsedNonce` | `[b"nonce", nonce (le8)]` | 18 | Replay-attack prevention — existence = used |

### Instructions

| Instruction | Step | Access | Description |
|---|---|---|---|
| `initialize` | 1 | Admin | Create ProgramConfig, set required stake |
| `publish_patch` | 10 | Admin | Anchor patch + IPFS CID on-chain |
| `verify_patch` | 10 | Admin | Mark patch safe for distribution |
| `stake_and_submit` | 2 + 3 | Auditor | Lock SOL stake + submit commitment hash |
| `verify_submission` | 4 | Admin | Review metadata, advance to Verified |
| `reject_submission` | — | Admin | Reject + slash stake to treasury |
| `release_bounty` | **5** | Admin | **INCENTIVE #1** — bounty for finding the bug |
| `reveal_and_verify` | 6 | Auditor | Reveal details; on-chain keccak check |
| `decide_resolution` | 7 | Admin | Choose 8A (team fixes) or 8B (auditor fixes) |
| `submit_fix_commitment` | 8B | Auditor | Commit to fix (8B path only) |
| `verify_fix` | 9a | Admin | Confirm fix is complete |
| `release_fix_incentive` | **9b** | Admin | **INCENTIVE #2** — incentive for fixing the bug |
| `mark_published` | 10 | Admin | Set final Published status |

### Events Emitted

Every instruction emits a corresponding on-chain event for indexing:

`ProgramInitialized` · `PatchPublished` · `PatchVerified` · `VulnerabilitySubmitted` · `SubmissionVerified` · `SubmissionRejected` · `BountyReleased` · `VulnerabilityRevealed` · `FraudDetected` · `ResolutionDecided` · `FixCommitmentSubmitted` · `FixVerified` · `FixIncentiveReleased` · `PatchPublishedForSubmission`

### The Commit-Reveal Security Model

```
Submit phase (public):
  commitment = keccak256(vulnerability_details || salt)
  → stored on-chain; details stay private

Reveal phase (after bounty paid):
  on-chain check: keccak256(revealed_details || salt) == stored commitment
  → mismatch → fraud_detected = true → stake slashed
```

Replay attacks are prevented by the `UsedNonce` PDA — attempting to reuse a nonce fails because `init` on an already-existing account is rejected by the runtime.

---

## The 12-Step Workflow

```
  Auditor                Admin                On-chain
    │                      │                     │
    │  [Step 2+3]           │                     │
    ├─ stake SOL ──────────►│                     │
    ├─ submit commitment ───────────────────────►│ VulnerabilitySubmission (Pending)
    │                      │  [Step 4]           │
    │                      ├─ verify ────────────►│ status = Verified
    │                      │                     │
    │                      │  [Step 5 ★ BOUNTY]  │
    │◄── bounty + stake ───┤─ release_bounty ────►│ bounty_paid = true
    │                      │                     │
    │  [Step 6]             │                     │
    ├─ reveal details ──────────────────────────►│ commitment verified on-chain
    │  (keccak check)       │                     │ status = Revealed
    │                      │  [Step 7]           │
    │                      ├─ decide 8A/8B ──────►│ auditor_led = true/false
    │                      │                     │
    │  [Step 8B, if led]    │                     │
    ├─ submit fix hash ─────────────────────────►│ fix_commitment stored
    │                      │  [Step 9a]          │
    │                      ├─ verify fix ────────►│ status = FixVerified
    │                      │                     │
    │                      │  [Step 9b ★ FIX $]  │
    │◄── fix incentive ────┤─ release_incentive ─►│ fix_incentive_paid = true
    │                      │                     │
    │                      │  [Step 10]          │
    │                      ├─ publish patch ──────►│ status = Published
```

---

## ZK Circuits (Phase 2)

**File:** `circuits/AuthBypass.circom`
**Libraries:** Circom 2.0, circomlib (Poseidon, comparators), SnarkJS, Groth16

The AuthBypass circuit lets an auditor prove they have a valid vulnerability matching a template — without revealing the actual exploit:

```
Private inputs : vulnerability_hash, salt, severity_level
Public inputs  : commitment = Poseidon(vulnerability_hash, salt)
                 severity_threshold

Constraints    : Poseidon(vulnerability_hash, salt) === commitment
                 severity_level >= severity_threshold
```

The on-chain `ZyraZKVerifier.sol` routes proofs to per-template Groth16 verifiers. Five templates are supported: `AuthBypass`, `HashMismatch`, `PrivilegeEscalation`, `ReplayAttack`, `LogicError`.

---

## Phase 1 — Base Sepolia Deployment (EVM)

The original patch management contracts were deployed on **Base Sepolia** testnet:

| Contract | Address |
|---|---|
| `ZyraProtocol` | `0x75A2609ADB4999d37Da288079fF900BAAaf69A0c` |
| `ZyraVulnerability` | `0x28eE8cD0d0406a54074e41b27E22E5Cb92999090` |
| `ZyraEscrow` | `0x36dC504Bd77C93d1Ae65828874d77aa1775a8A67` |
| `ZyraZKVerifier` | `0x6D358d20190Dd33ec397ac3c61F5920126F92DB4` |
| `AuthBypassVerifier` | `0x7451f4D6E4f1FCAA2A761723018487ddC278524a` |

Explorer: `https://sepolia.basescan.org`

These contracts are now superseded by the Solana program for the vulnerability discovery and incentive workflow. The Solidity source is preserved in `/contract` for reference and EVM compatibility.

---

## Local Development

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | 18+ |
| Rust + Cargo | stable |
| Solana CLI | 1.18.x |
| Anchor CLI | 0.30.0 |
| Circom | 2.0+ (optional — Phase 2 ZK only) |

### Solana Program

```bash
cd solana
yarn install
anchor build           # compile + generate IDL → target/idl/zyra.json
anchor test            # run all 7 test scenarios on localnet
```

### Frontend

```bash
cd frontend
cp .env.example .env   # fill in your values — never commit .env
npm install
npm run dev            # http://localhost:3000
```

### Backend

```bash
cd backend
cp .env.example .env   # fill in your values — never commit .env
npm install
node server.js         # http://localhost:3001
```

---

## Deployment

### Deploy Solana Program to Devnet

```bash
# 1. Fund deployer wallet — visit https://faucet.solana.com
#    Wallet: FuRV8d2tuypdz4GJgXCKXXsx75knwj76ttcPGinJcNMx
#    Request 5 SOL (GitHub login required for amounts > 2 SOL)

# 2. Deploy
cd solana
anchor deploy --provider.cluster devnet

# 3. After deploy — copy IDL to frontend
cp target/idl/zyra.json ../frontend/lib/zyraIdl.json
```

### Deploy EVM Contracts (optional, Base Sepolia)

```bash
# Set DEPLOYER_PRIVATE_KEY in your local .env (never commit it)
node scripts/deploy.js
```

---

## Environment Variables

Copy `.env.example` files and fill in your own values. **Never commit `.env` files.**

```
frontend/.env.example   →   frontend/.env
backend/.env.example    →   backend/.env
```

The `.gitignore` at the repo root excludes all `.env` files. If you accidentally stage one, run:
```bash
git rm --cached frontend/.env backend/.env
```

---

## Security Notes

- **Commit-reveal** — vulnerability details are never on-chain until the auditor is paid. The keccak256 commitment is the only thing stored at submission time.
- **Payment gates** — `release_bounty` requires `status == Verified (1)` on-chain; `release_fix_incentive` requires `status == FixVerified (5)`. These checks happen before any lamport transfer — no off-chain workaround is possible.
- **Replay protection** — each submission nonce creates a `UsedNonce` PDA. Reusing a nonce fails at the Anchor account init level.
- **Fraud slash** — if a revealed commitment doesn't match, `fraud_detected = true` and the auditor's stake is slashed to the treasury.
- **Credentials** — rotate any API keys (Pinata, WalletConnect) and database credentials if you believe they were exposed in prior commits. Use environment variables exclusively; no secrets belong in source files.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contracts (Solana) | Rust, Anchor 0.30.0 |
| Smart contracts (EVM) | Solidity 0.8.20 |
| ZK proofs | Circom 2.0, SnarkJS, Groth16, Poseidon |
| Frontend | Next.js 14, TypeScript, TailwindCSS, RainbowKit, wagmi |
| Backend | Express.js, MongoDB, Mongoose, JWT |
| Storage | IPFS via Pinata |
| EVM network | Base Sepolia (testnet) |
| Solana network | Devnet |

---

*Zyra Protocol is in active development. All deployments are on testnets. Built for the Superteam Solana grant.*
