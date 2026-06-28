import { keccak_256 } from "@noble/hashes/sha3.js";

/**
 * Commit-reveal hashing for Zyra.
 *
 * The on-chain program verifies the reveal with:
 *     keccak::hashv(&[details.as_bytes(), &salt])
 * so the commitment the client stores must be exactly
 *     keccak256( utf8(details) || salt[32] ).
 */

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("invalid hex length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array | number[]): string {
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Generate a random 32-byte salt as a 0x-prefixed hex string. */
export function generateSalt(): string {
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  return bytesToHex(salt);
}

/** keccak256(utf8(details) || salt) → 32-byte array (program arg form). */
export function computeCommitmentBytes(details: string, saltHex: string): number[] {
  const salt = hexToBytes(saltHex);
  const detailBytes = new TextEncoder().encode(details);
  const combined = new Uint8Array(detailBytes.length + salt.length);
  combined.set(detailBytes, 0);
  combined.set(salt, detailBytes.length);
  return Array.from(keccak_256(combined));
}

/** Same as above but returns 0x hex for display / secret-file storage. */
export function computeCommitmentHex(details: string, saltHex: string): string {
  return bytesToHex(computeCommitmentBytes(details, saltHex));
}

/**
 * System-code hash: if the input is already a 32-byte hex value use it directly,
 * otherwise keccak256 the UTF-8 string. Returns a 32-byte array (program arg form).
 */
export function computeSystemCodeHashBytes(input: string): number[] {
  const trimmed = input.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) return Array.from(hexToBytes(trimmed));
  return Array.from(keccak_256(new TextEncoder().encode(trimmed)));
}

/** Random 32-byte value (e.g. fix commitments) as a 0x hex string. */
export function randomHash32(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return bytesToHex(b);
}
