# Valida Protocol — Solana Program (Anchor)

## What This Is

This directory contains the Anchor smart contracts for the Valida Protocol deployed on Solana Devnet. Valida Protocol is a decentralized system for patch management and vulnerability disclosure with cryptographic commit-reveal mechanics and a two-incentive payout model. The frontend and backend live in the parent repository (`/frontend`, `/backend`) and connect to these contracts via the generated IDL in `target/idl/valida.json`.

## Accounts

| Account | PDA Seeds | Description |
|---|---|---|
| `ProgramConfig` | `[b"config"]` | Admin pubkey, required stake, global submission + patch counters |
| `PatchRecord` | `[b"patch", patch_id (le8)]` | Published software patch: name, version, IPFS CID, file hash |
| `VulnerabilitySubmission` | `[b"vuln", submission_id (le8)]` | Full lifecycle state for one vulnerability disclosure |
| `EscrowAccount` | `[b"escrow", submission_id (le8)]` | Stake + bounty + fix-incentive payment tracking |
| `UsedNonce` | `[b"nonce", nonce (le8)]` | Created on first use; existence prevents replay attacks |

## Instruction → Workflow Mapping

| Instruction | Protocol Step | Notes |
|---|---|---|
| `initialize` | Step 1 | Creates ProgramConfig, sets admin + required stake |
| `stake_and_submit` | Step 2 + 3 | Auditor stakes SOL + submits commitment (details stay private) |
| `verify_submission` | Step 4 | Admin reviews and marks submission Verified |
| `release_bounty` | **Step 5 — INCENTIVE #1** | Bounty paid for *finding* the bug; stake returned |
| `reveal_and_verify` | Step 6 | Auditor reveals full details; commitment checked on-chain |
| `decide_resolution` | Step 7 | Admin chooses 8A (team fixes) or 8B (auditor fixes) |
| `submit_fix_commitment` | Step 8B | Auditor submits commitment to their fix (8B path only) |
| `verify_fix` | Step 9a | Admin verifies the fix |
| `release_fix_incentive` | **Step 9b — INCENTIVE #2** | Fix incentive paid for *fixing* the bug (8B path only) |
| `mark_published` | Step 10 | Final state: submission marked Published |

The two incentives are **independent**:
- **Incentive #1** (`release_bounty`) — requires `status == Verified (1)` — rewards finding the bug
- **Incentive #2** (`release_fix_incentive`) — requires `status == FixVerified (5)` AND `auditor_led == true` — rewards fixing the bug

## Prerequisites

- Rust + Cargo: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Anchor 0.30.0: `cargo install --git https://github.com/coral-xyz/anchor avm --locked && avm install 0.30.0 && avm use 0.30.0`
- Solana CLI 1.18.x: `sh -c "$(curl -sSfL https://release.solana.com/v1.18.0/install)"`
- Node.js 18+ and Yarn
- Funded Devnet wallet: `solana-keygen new && solana config set --url devnet && solana airdrop 2`

## Install

```bash
cd solana
yarn install
```

## Build

```bash
anchor build
```

## Test

```bash
anchor test
```

Tests cover: initialize, patch publish/verify, full vulnerability lifecycle (7 steps including both incentives), rejection + stake slash, fraud detection, replay attack prevention, and payment gate enforcement.

## Deploy to Devnet

```bash
bash scripts/deploy.sh
```

## After Deploy

1. Copy the Program ID from the deploy output
2. Update `declare_id!("...")` in `programs/valida/src/lib.rs`
3. Update `[programs.devnet] valida = "..."` in `Anchor.toml`
4. Run `anchor build` again to regenerate the IDL with the correct program ID
5. Copy `target/idl/valida.json` to the frontend (`frontend/lib/validaIdl.json`)

## Devnet Deployment

- **Program ID:** `9X7c6fLEyYs9iLpzxmode3oimFWBedyToni858GDkMjq`
- **Explorer:** `https://explorer.solana.com/address/9X7c6fLEyYs9iLpzxmode3oimFWBedyToni858GDkMjq?cluster=devnet`

## Relationship to EVM Contracts

The `/contract` directory contains the original EVM implementation (`ValidaVulnerability.sol`, `ValidaEscrow.sol`, `valida.sol`). This Solana program mirrors the identical 12-step workflow under the Valida Protocol name. The Solana version is the primary deployment target for the Superteam grant submission.
