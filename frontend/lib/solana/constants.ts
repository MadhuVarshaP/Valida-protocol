import { PublicKey } from "@solana/web3.js";

/** Deployed Valida program on Solana Devnet. */
export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ||
    "8ndCjxUiatZDPJjxe22cwTSUALHWbfT88Pn2Up18yfLe"
);

export const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";

export const CLUSTER = "devnet" as const;

export const LAMPORTS_PER_SOL = 1_000_000_000;

/** Block-explorer helpers (Solana Explorer, devnet). */
export const explorerTx = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`;
export const explorerAddress = (addr: string) =>
  `https://explorer.solana.com/address/${addr}?cluster=${CLUSTER}`;

/** Vulnerability template types — must match the on-chain u8 encoding. */
export const TEMPLATE_TYPES = [
  { value: 1, label: "Authentication Bypass" },
  { value: 2, label: "Hash Mismatch" },
  { value: 3, label: "Privilege Escalation" },
  { value: 4, label: "Replay Attack" },
  { value: 5, label: "Logic Error" },
] as const;

export const SEVERITIES = [
  { value: 1, label: "Critical", badgeClass: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: 2, label: "High", badgeClass: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: 3, label: "Medium", badgeClass: "bg-blue-100 text-blue-700 border-blue-200" },
] as const;

/** On-chain status u8 → label. Mirrors the program's status codes. */
export const STATUS_LABELS = [
  "Pending",       // 0
  "Verified",      // 1
  "Rejected",      // 2
  "Revealed",      // 3
  "Fix In Progress", // 4
  "Fix Verified",  // 5
  "Published",     // 6
] as const;

export const STATUS_BADGE_VARIANTS = [
  "neutral", // 0 Pending
  "info",    // 1 Verified
  "error",   // 2 Rejected
  "warning", // 3 Revealed
  "warning", // 4 Fix In Progress
  "success", // 5 Fix Verified
  "success", // 6 Published
] as const;

export function templateLabel(v: number): string {
  return TEMPLATE_TYPES.find((t) => t.value === v)?.label ?? `Type ${v}`;
}
export function severityLabel(v: number): string {
  return SEVERITIES.find((s) => s.value === v)?.label ?? `Sev ${v}`;
}
export function statusLabel(v: number): string {
  return STATUS_LABELS[v] ?? `Status ${v}`;
}

/** Maps a submission's on-chain status to its position (1-12) in the lifecycle timeline. */
export function lifecycleStepForSubmission(sub: {
  status: number;
  bountyPaid: boolean;
  fixIncentivePaid: boolean;
  auditorLed: boolean;
}): number {
  switch (sub.status) {
    case 0: // Pending
    case 2: // Rejected — terminated at the verification gate
      return 4;
    case 1: // Verified
      return sub.bountyPaid ? 6 : 5;
    case 3: // Revealed
      return 7;
    case 4: // FixInProgress
      return 8;
    case 5: // FixVerified
      return sub.auditorLed && !sub.fixIncentivePaid ? 9 : 10;
    case 6: // Published
      return 10;
    default:
      return 1;
  }
}
