import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

/** u64 little-endian Buffer, matching `id.to_le_bytes()` on-chain. */
function u64le(n: number | bigint | BN): Buffer {
  return new BN(n.toString()).toArrayLike(Buffer, "le", 8);
}

export function configPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID)[0];
}

export function patchPda(patchId: number | bigint | BN): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("patch"), u64le(patchId)],
    PROGRAM_ID
  )[0];
}

export function vulnPda(submissionId: number | bigint | BN): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vuln"), u64le(submissionId)],
    PROGRAM_ID
  )[0];
}

export function escrowPda(submissionId: number | bigint | BN): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), u64le(submissionId)],
    PROGRAM_ID
  )[0];
}

export function noncePda(nonce: number | bigint | BN): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("nonce"), u64le(nonce)],
    PROGRAM_ID
  )[0];
}
