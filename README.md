# Valida Protocol

> Decentralized patch management and vulnerability disclosure on EVM + Solana

Valida Protocol is a full-stack, blockchain-based system for secure software patch distribution and responsible vulnerability disclosure. It replaces trust-based patch pipelines with on-chain integrity proofs, cryptographic commit-reveal mechanics, and a two-incentive bounty model that rewards both finding and fixing security bugs.

---

## Table of Contents

1. [What Valida Protocol Does](#what-valida-protocol-does)
2. [Architecture Overview](#architecture-overview)
3. [The 12-Step Workflow](#the-12-step-workflow)
4. [Repository Structure](#repository-structure)
5. [Tech Stack](#tech-stack)
6. [Smart Contracts (EVM)](#smart-contracts-evm)
7. [Solana Program](#solana-program)
8. [Zero-Knowledge Circuits](#zero-knowledge-circuits)
9. [Backend API](#backend-api)
10. [Frontend](#frontend)
11. [Environment Variables](#environment-variables)
12. [Local Development](#local-development)
13. [Deployment](#deployment)
14. [Solana Deployment Status](#solana-deployment-status)
15. [Roles & Permissions](#roles--permissions)
16. [Security Model](#security-model)

---

## What Valida Protocol Does

| Problem | Valida's Solution |
|---|---|
| Patches can be tampered with in transit | SHA-256 file hash stored on-chain; devices verify before applying |
| Vulnerability reports reveal exploits prematurely | Commit-reveal: auditor submits a hash, details stay private until paid |
| No economic incentive to find AND fix bugs | Two independent on-chain payments — one for finding, one for fixing |
| Patch provenance is opaque | IPFS CID anchored to blockchain; full audit trail |
| Bug reports can be fabricated | keccak256 commitment checked on-chain at reveal time |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Valida Protocol                            │
├──────────────┬──────────────────────┬──────────────────────────────┤
│   Frontend   │      Backend API     │        Blockchains           │
│  (Next.js)   │  (Express + MongoDB) │                              │
│              │                      │  ┌─────────┐  ┌───────────┐ │
│  4 Roles:    │  REST endpoints for  │  │   EVM   │  │  Solana   │ │
│  - Admin     │  auth, patches,      │  │ (IOPN   │  │  Devnet   │ │
│  - Publisher │  devices, logs       │  │Testnet) │  │  Anchor   │ │
│  - Auditor   │                      │  └────┬────┘  └─────┬─────┘ │
│  - Device    │  Syncs events from   │       │             │       │
│              │  chain → MongoDB     │       └──────┬──────┘       │
└──────┬───────┴──────────────────────┴──────────────┼──────────────┘
       │                                             │
       │  Wallet connection (RainbowKit + wagmi)     │
       │  IPFS storage via Pinata                    │
       └─────────────────────────────────────────────┘
```

---

## The 12-Step Workflow

Valida Protocol implements a structured 12-step lifecycle for every vulnerability disclosure:

```
Step 1  ──  Admin deploys and initializes the protocol
Step 2  ──  Auditor discovers a vulnerability
Step 3  ──  Auditor stakes SOL/ETH + submits commitment hash
             (details stay private — only keccak256(details + salt) is on-chain)
Step 4  ──  Admin reviews metadata, marks submission Verified
Step 5  ──  ★ INCENTIVE #1: Bounty paid to auditor for finding the bug
             Stake returned. Status must be Verified(1) — enforced on-chain.
Step 6  ──  Auditor reveals full details + IPFS CID
             On-chain: keccak256(revealed details + salt) == stored commitment
Step 7  ──  Admin decides resolution path:
             8A → internal team patches
             8B → auditor fixes (auditor_led = true)
Step 8A ──  Development team patches the software (off-chain work)
Step 8B ──  Auditor submits fix commitment (if auditor_led)
Step 9  ──  Admin verifies the fix is complete
             ★ INCENTIVE #2: Fix incentive paid (8B path only)
             Status must be FixVerified(5) — enforced on-chain.
Step 10 ──  Admin publishes the patched software
             SHA-256 hash + IPFS CID stored on-chain
Step 11 ──  Devices poll for verified patches, verify hash before applying
Step 12 ──  All events queryable on-chain; full immutable audit trail
```

**The two incentives are completely independent.** Incentive #1 is for finding the bug; Incentive #2 is for fixing it. They can go to different parties.

---

## Repository Structure

```
valida-protocol/
├── frontend/                    # Next.js 14 frontend (App Router)
│   ├── app/
│   │   ├── admin/               # Admin dashboard (patches, devices, publishers, logs)
│   │   ├── auditor/             # Auditor registration + submission portal
│   │   ├── device/              # Device dashboard + patch installation
│   │   ├── publisher/           # Patch publishing interface
│   │   └── page.tsx             # Landing page
│   ├── components/              # Shared UI components
│   ├── context/                 # Wallet, Web3, Toast providers
│   ├── lib/                     # ABI files, ethers helpers, IPFS, wagmi config
│   └── data/                    # Mock data for development
│
├── backend/                     # Express.js REST API
│   ├── config/                  # Blockchain + DB config
│   ├── controllers/             # Admin, device, publisher controllers
│   ├── models/                  # Mongoose models (User, Patch, Device, etc.)
│   ├── routes/                  # API route definitions
│   ├── services/                # Chain sync, IPFS, hash, event services
│   ├── middleware/              # JWT auth middleware
│   └── device-agent/            # On-device patch agent script
│
├── contract/                    # Solidity smart contracts (EVM)
│   ├── valida.sol               # Core patch management contract (ValidaProtocol)
│   ├── ValidaVulnerability.sol  # Vulnerability lifecycle — 12 steps
│   ├── ValidaEscrow.sol         # Staking + bounty + fix incentive payments
│   ├── ValidaZKVerifier.sol     # ZK proof template verification
│   └── AuthBypassVerifier.sol   # Groth16 verifier for AuthBypass template
│
├── circuits/                    # Circom ZK circuits
│   └── AuthBypass.circom        # Poseidon-based AuthBypass proof circuit
│
├── solana/                      # Anchor program (Solana)
│   ├── programs/valida/src/
│   │   ├── lib.rs               # Program entry, events, #[program] dispatcher
│   │   ├── state.rs             # Account structs with space calculations
│   │   ├── errors.rs            # ValidaError enum (12 error codes)
│   │   └── instructions/
│   │       ├── patch.rs         # initialize, publish_patch, verify_patch
│   │       └── vulnerability.rs # Full 12-step workflow instructions
│   ├── tests/valida.ts          # TypeScript test suite (7 scenarios)
│   ├── scripts/deploy.sh        # Devnet deployment script
│   └── Anchor.toml
│
└── scripts/                     # Deployment + ZK setup scripts
    ├── deploy.js                # EVM multi-contract deployment
    └── setup-zk.sh              # ZK trusted setup + Groth16 verifier export
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, TailwindCSS |
| Wallet (EVM) | RainbowKit + wagmi + ethers.js |
| Blockchain (EVM) | Solidity 0.8.20, IOPN Testnet |
| Blockchain (Solana) | Anchor 0.30.0, Solana Devnet |
| Storage | IPFS via Pinata |
| ZK Proofs | Circom 2.0, SnarkJS, Groth16, Poseidon hash |
| Backend | Express.js, MongoDB (Mongoose), JWT auth |
| API | REST; chain event sync via ethers.js listeners |

---

## Smart Contracts (EVM)

Deployed on **IOPN Testnet** (EVM-compatible).

### ValidaProtocol (`valida.sol`)
Core patch management. Tracks publishers, devices, and patch records.

| Function | Description |
|---|---|
| `registerPublisher(addr)` | Admin grants publishing rights |
| `registerDevice(addr)` | Admin registers a device |
| `publishPatch(name, version, cid, hash)` | Publisher anchors a patch on-chain |
| `verifyPatch(patchId)` | Admin marks patch safe for distribution |
| `getPatch(patchId)` | Returns patch metadata |

### ValidaVulnerability (`ValidaVulnerability.sol`)
The 12-step vulnerability lifecycle.

| Function | Step | Description |
|---|---|---|
| `submitVulnerability(commitment, ...)` | 3 | Submit commitment hash + metadata |
| `verifySubmission(id)` | 4 | Admin marks Verified |
| `rejectSubmission(id)` | — | Admin rejects, slash stake |
| `revealVulnerability(id, details, salt, cid)` | 6 | Auditor reveals, on-chain verification |
| `decideResolution(id, auditorLed)` | 7 | Admin chooses 8A or 8B |
| `submitFixCommitment(id, fixHash)` | 8B | Auditor commits to fix |
| `verifyFix(id)` | 9 | Admin verifies fix |
| `markPublished(id)` | 10 | Admin publishes patched version |

### ValidaEscrow (`ValidaEscrow.sol`)
Staking, bounty, and fix incentive payments.

- `stakeAndLink(submissionId)` — lock auditor stake
- `releaseBounty(id, amount)` — **INCENTIVE #1** (requires status = Verified)
- `releaseFixIncentive(id, amount)` — **INCENTIVE #2** (requires status = FixVerified)
- `fraudSlash(id)` — slash stake on commitment mismatch

### ValidaZKVerifier (`ValidaZKVerifier.sol`)
Routes ZK proof verification to per-template Groth16 verifiers. Supports 5 vulnerability templates:

| ID | Template |
|---|---|
| 1 | AuthBypass |
| 2 | HashMismatch |
| 3 | PrivilegeEscalation |
| 4 | ReplayAttack |
| 5 | LogicError |

---

## Solana Program

The Anchor program mirrors the complete EVM workflow natively on Solana.

**Program ID:** `8ndCjxUiatZDPJjxe22cwTSUALHWbfT88Pn2Up18yfLe`
**Network:** Solana Devnet
**Status:** Built and ready — awaiting devnet SOL for deployment (see [Solana Deployment Status](#solana-deployment-status))

### On-Chain Accounts

| Account | PDA Seeds | Space | Purpose |
|---|---|---|---|
| `ProgramConfig` | `[b"config"]` | 65 B | Admin, required stake, global counters |
| `PatchRecord` | `[b"patch", id (le8)]` | 318 B | Patch metadata + IPFS CID |
| `VulnerabilitySubmission` | `[b"vuln", id (le8)]` | 405 B | Full lifecycle state |
| `EscrowAccount` | `[b"escrow", id (le8)]` | 77 B | Stake + payment tracking |
| `UsedNonce` | `[b"nonce", nonce (le8)]` | 18 B | Replay-attack prevention |

### Instructions → Workflow Steps

| Instruction | Step | Notes |
|---|---|---|
| `initialize` | 1 | Creates ProgramConfig |
| `stake_and_submit` | 2 + 3 | Transfers stake SOL, creates submission |
| `verify_submission` | 4 | Admin only, status Pending → Verified |
| `release_bounty` | **5 — INCENTIVE #1** | Requires status == 1. Bounty + stake returned. |
| `reveal_and_verify` | 6 | keccak check on-chain |
| `decide_resolution` | 7 | Sets auditor_led flag (8A vs 8B) |
| `submit_fix_commitment` | 8B | Auditor-led path only |
| `verify_fix` | 9a | Admin only |
| `release_fix_incentive` | **9b — INCENTIVE #2** | Requires status == 5 AND auditor_led |
| `mark_published` | 10 | Final state |

### Events Emitted

`ProgramInitialized` · `PatchPublished` · `PatchVerified` · `VulnerabilitySubmitted` · `SubmissionVerified` · `SubmissionRejected` · `BountyReleased` · `VulnerabilityRevealed` · `FraudDetected` · `ResolutionDecided` · `FixCommitmentSubmitted` · `FixVerified` · `FixIncentiveReleased` · `PatchPublishedForSubmission`

---

## Zero-Knowledge Circuits

**Location:** `circuits/AuthBypass.circom`
**Library:** Circom 2.0 + Poseidon hash (circomlib)

The AuthBypass circuit proves knowledge of a vulnerability without revealing it:

```
Private inputs: vulnerability_hash, salt, severity_level
Public inputs:  commitment (= Poseidon(vulnerability_hash, salt))
                severity_threshold

Constraint: Poseidon(vulnerability_hash, salt) == commitment
            severity_level >= severity_threshold
```

Additional templates (HashMismatch, PrivilegeEscalation, ReplayAttack, LogicError) follow the same pattern and are routed by `ValidaZKVerifier.sol`.

**Setup:**
```bash
bash scripts/setup-zk.sh   # Generates proving/verification keys + Groth16 Solidity verifier
```

---

## Backend API

**Stack:** Express.js · MongoDB (Mongoose) · JWT

**Base URL:** `http://localhost:3001/api`

### Endpoint Groups

| Prefix | Auth | Purpose |
|---|---|---|
| `/api/public` | None | Health check, public patch list |
| `/api/admin` | Admin JWT | Manage publishers, devices, patches, logs |
| `/api/publisher` | Publisher JWT | Publish patches, upload to IPFS |
| `/api/device` | Device JWT | Fetch verified patches, log installations |

### Data Models

| Model | Fields |
|---|---|
| `User` | address, role (admin/publisher/auditor/device), nonce |
| `Patch` | name, version, ipfsCid, fileHash, publisher, isVerified, txHash |
| `Device` | address, owner, registeredAt, lastSeen |
| `InstallationLog` | device, patch, status, timestamp |
| `AccessRequest` | requester, role, status, approvedBy |

### Chain Sync Services

- `chainSyncService.js` — reads past events from `ValidaProtocol` and syncs to MongoDB
- `eventSyncService.js` — listens for live `PatchPublished` / `PatchVerified` events

---

## Frontend

**Stack:** Next.js 14 App Router · TypeScript · TailwindCSS · RainbowKit · wagmi

**Live URL:** `https://valida-protocol.vercel.app`

### Pages by Role

| Path | Role | Description |
|---|---|---|
| `/` | Public | Landing page, protocol overview |
| `/admin/patches` | Admin | View + verify all patches |
| `/admin/publishers` | Admin | Approve/revoke publishers |
| `/admin/devices` | Admin | Registered device management |
| `/admin/requests` | Admin | Access request queue |
| `/admin/logs` | Admin | Installation audit log |
| `/publisher/publish` | Publisher | Upload patch to IPFS + publish on-chain |
| `/auditor/register` | Auditor | Register + start vulnerability submission |
| `/device/dashboard` | Device | Status + patch queue |
| `/device/patches` | Device | Download + install patches |

### Wallet Integration

- **EVM:** RainbowKit + wagmi (MetaMask, WalletConnect, Coinbase Wallet)
- **Network:** IOPN Testnet (EVM chain ID configured in `frontend/lib/wagmi.ts`)
- **IPFS:** Files uploaded via Pinata; CID stored on-chain

---

## Environment Variables

### Frontend (`frontend/.env`)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_NAME=Valida Protocol
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<your_id>
NEXT_PUBLIC_RPC_URL=https://rpc-testnet.iopn.io
NEXT_PUBLIC_EXPLORER_BASE_URL=https://explorer-testnet.iopn.io

# EVM Contracts
NEXT_PUBLIC_CONTRACT_ADDRESS=<ValidaProtocol address>
NEXT_PUBLIC_VULN_CONTRACT_ADDRESS=<ValidaVulnerability address>
NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=<ValidaEscrow address>
NEXT_PUBLIC_ZK_VERIFIER_ADDRESS=<ValidaZKVerifier address>

# IPFS
NEXT_PUBLIC_PINATA_JWT=<pinata_jwt>
NEXT_PUBLIC_IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs
```

### Backend (`backend/.env`)

```env
PORT=3001
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/valida
JWT_SECRET=<strong_secret>
BLOCKCHAIN_RPC_URL=https://rpc-testnet.iopn.io
CORS_ALLOWED_ORIGINS=https://valida-protocol.vercel.app,http://localhost:3000
AUTH_MESSAGE=Valida Protocol wallet verification
```

---

## Local Development

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 18+ | `https://nodejs.org` |
| Rust | stable | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Solana CLI | 1.18.x | `sh -c "$(curl -sSfL https://release.solana.com/v1.18.0/install)"` |
| Anchor | 0.30.0 | `cargo install avm && avm install 0.30.0 && avm use 0.30.0` |
| Circom | 2.0+ | `npm install -g circom` |

### 1. Frontend

```bash
cd frontend
cp .env.example .env          # fill in your values
npm install
npm run dev                   # http://localhost:3000
```

### 2. Backend

```bash
cd backend
cp .env.example .env          # fill in your values
npm install
node server.js                # http://localhost:3001
```

### 3. Solana Program

```bash
cd solana
yarn install
anchor build                  # compiles + generates IDL at target/idl/valida.json
anchor test                   # runs all 7 test scenarios against localnet
```

### 4. EVM Contracts

```bash
# Requires Hardhat or Foundry
cd scripts
node deploy.js                # deploys ValidaVulnerability, ValidaEscrow, ValidaZKVerifier
```

### 5. ZK Setup (Phase 4 only)

```bash
bash scripts/setup-zk.sh     # trusted setup → proving key → Groth16 verifier
```

---

## Deployment

### EVM (IOPN Testnet)

```bash
node scripts/deploy.js
# Outputs contract addresses → update frontend/.env
```

### Solana Devnet

```bash
# Step 1 — Fund your deployer wallet (one-time)
# Wallet: FuRV8d2tuypdz4GJgXCKXXsx75knwj76ttcPGinJcNMx
# Visit: https://faucet.solana.com — request 5 SOL (requires GitHub login)
# Or: solana airdrop 2 --url devnet   (CLI, rate-limited to 2 SOL/day)

# Step 2 — Deploy
cd solana
anchor deploy --provider.cluster devnet

# Step 3 — Copy IDL to frontend
cp target/idl/valida.json ../frontend/lib/validaIdl.json
```

---

## Solana Deployment Status

| Item | Value |
|---|---|
| **Program Name** | `valida` |
| **Program ID** | `8ndCjxUiatZDPJjxe22cwTSUALHWbfT88Pn2Up18yfLe` |
| **Network** | Solana Devnet |
| **Build Status** | Compiled — `target/deploy/valida.so` ready (315 KB) |
| **IDL** | Generated — `solana/target/idl/valida.json` |
| **Deployment Status** | **Pending** — deployer wallet needs ~3 SOL |
| **Deployer Wallet** | `FuRV8d2tuypdz4GJgXCKXXsx75knwj76ttcPGinJcNMx` |
| **Explorer (after deploy)** | `https://explorer.solana.com/address/8ndCjxUiatZDPJjxe22cwTSUALHWbfT88Pn2Up18yfLe?cluster=devnet` |

**To deploy now:**
1. Go to `https://faucet.solana.com`
2. Enter `FuRV8d2tuypdz4GJgXCKXXsx75knwj76ttcPGinJcNMx`
3. Request 5 SOL (GitHub login required for amounts above 2 SOL)
4. Run: `cd solana && anchor deploy --provider.cluster devnet`

---

## Roles & Permissions

| Role | How Assigned | Capabilities |
|---|---|---|
| **Admin** | Deployer address | Everything — verify patches, manage users, release payments |
| **Publisher** | Admin grants via `registerPublisher` | Upload patches to IPFS, publish on-chain |
| **Auditor** | Self-registers | Submit vulnerability commitments, receive bounties |
| **Device** | Admin grants via `registerDevice` | Poll for patches, download and install, log installations |

---

## Security Model

**Patch integrity** — SHA-256 of every patch file is stored on-chain. Devices recompute the hash before applying. A tampered file is rejected before execution.

**Commit-reveal** — Vulnerability details are never exposed until the auditor is paid. The on-chain commitment `keccak256(details || salt)` is checked at reveal time. A mismatch sets `fraud_detected = true` and slashes the auditor's stake.

**Replay protection** — Each submission uses a unique nonce. A `UsedNonce` PDA (Solana) / `usedNonces` mapping (EVM) prevents the same nonce from being submitted twice.

**Payment gates** — Smart contracts enforce status preconditions before any lamport/ETH transfer:
- `release_bounty` requires `status == Verified (1)`
- `release_fix_incentive` requires `status == FixVerified (5)` AND `auditor_led == true`
- No amount of off-chain coordination can bypass these on-chain guards.

**ZK proofs (Phase 4)** — Auditors can optionally attach a Groth16 zero-knowledge proof that they possess a valid vulnerability matching the committed template, without revealing any details. The `ValidaZKVerifier` contract routes proofs to per-template Groth16 verifiers.

---

## License

MIT — see `LICENSE` for details.

---

*Built for the Superteam grant submission. Valida Protocol is in active development — Solana program and EVM contracts are on testnets only.*
