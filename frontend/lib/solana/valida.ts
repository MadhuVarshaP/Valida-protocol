import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import type { Valida } from "./idl/valida-types";
import idlJson from "./idl/valida.json";
import { RPC_ENDPOINT } from "./constants";
import { configPda, vulnPda, escrowPda } from "./pdas";

// Anchor's MethodsBuilder needs the IDL object at runtime; the Valida type
// only provides compile-time shape.
const IDL = idlJson as Valida;

export interface MinimalWallet {
  publicKey: PublicKey;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signTransaction: (tx: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signAllTransactions: (txs: any[]) => Promise<any[]>;
}

export function getConnection(): Connection {
  return new Connection(RPC_ENDPOINT, "confirmed");
}

/** Read-write program bound to a connected wallet (signs transactions). */
export function getProgram(
  wallet: MinimalWallet,
  connection: Connection = getConnection()
): Program<Valida> {
  const provider = new AnchorProvider(connection, wallet as never, {
    commitment: "confirmed",
  });
  return new Program(IDL, provider);
}

/** Read-only program for fetching accounts without a connected wallet. */
export function getReadonlyProgram(
  connection: Connection = getConnection()
): Program<Valida> {
  const dummy = Keypair.generate();
  const wallet: MinimalWallet = {
    publicKey: dummy.publicKey,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
  };
  const provider = new AnchorProvider(connection, wallet as never, {
    commitment: "confirmed",
  });
  return new Program(IDL, provider);
}

// ── Account shapes (camelCase, as Anchor decodes them) ──────────────────────────

export interface ProgramConfigAccount {
  admin: PublicKey;
  requiredStake: bigint;
  submissionCount: bigint;
  patchCount: bigint;
  bump: number;
}

export interface SubmissionAccount {
  submissionId: number;
  auditor: string;
  commitment: number[];
  templateType: number;
  severity: number;
  affectedSoftware: string;
  affectedVersion: string;
  status: number;
  bountyPaid: boolean;
  fixIncentivePaid: boolean;
  nonce: string;
  systemCodeHash: number[];
  auditorLed: boolean;
  fixCommitment: number[];
  commitmentVerified: boolean;
  fraudDetected: boolean;
  revealedIpfsCid: string;
  submittedAt: number;
  pda: string;
}

export interface EscrowAccountView {
  submissionId: number;
  auditor: string;
  stakedAmount: bigint;
  bountyAmount: bigint;
  fixIncentiveAmount: bigint;
  stakeReturned: boolean;
  bountyReleased: boolean;
  fixIncentiveReleased: boolean;
  slashed: boolean;
}

export interface PatchAccount {
  authority: string;
  softwareName: string;
  version: string;
  ipfsCid: string;
  fileHash: number[];
  isVerified: boolean;
  publishedAt: number;
  pda: string;
  patchId: number;
}

/** Retry a flaky RPC call (getProgramAccounts is heavily rate-limited on public devnet). */
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    }
  }
  throw lastErr;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toNum(x: any): number {
  return typeof x?.toNumber === "function" ? x.toNumber() : Number(x);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toBig(x: any): bigint {
  return BigInt(x?.toString?.() ?? x);
}

export async function fetchConfig(
  program: Program<Valida>
): Promise<ProgramConfigAccount | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any = await withRetry(() => (program.account as any).programConfig.fetchNullable(configPda()));
  if (!raw) return null;
  return {
    admin: raw.admin,
    requiredStake: toBig(raw.requiredStake),
    submissionCount: toBig(raw.submissionCount),
    patchCount: toBig(raw.patchCount),
    bump: raw.bump,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseSubmission(raw: any, pda: PublicKey): SubmissionAccount {
  return {
    submissionId: toNum(raw.submissionId),
    auditor: raw.auditor.toBase58(),
    commitment: Array.from(raw.commitment),
    templateType: raw.templateType,
    severity: raw.severity,
    affectedSoftware: raw.affectedSoftware,
    affectedVersion: raw.affectedVersion,
    status: raw.status,
    bountyPaid: raw.bountyPaid,
    fixIncentivePaid: raw.fixIncentivePaid,
    nonce: raw.nonce.toString(),
    systemCodeHash: Array.from(raw.systemCodeHash),
    auditorLed: raw.auditorLed,
    fixCommitment: Array.from(raw.fixCommitment),
    commitmentVerified: raw.commitmentVerified,
    fraudDetected: raw.fraudDetected,
    revealedIpfsCid: raw.revealedIpfsCid,
    submittedAt: toNum(raw.submittedAt),
    pda: pda.toBase58(),
  };
}

export async function fetchSubmission(
  program: Program<Valida>,
  submissionId: number
): Promise<SubmissionAccount | null> {
  const pda = vulnPda(submissionId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await (program.account as any).vulnerabilitySubmission.fetchNullable(pda);
  return raw ? parseSubmission(raw, pda) : null;
}

/**
 * Fetch submissions 0..count-1 with one getMultipleAccounts request (via
 * Anchor's fetchMultiple over derived PDAs). getMultipleAccounts is far more
 * reliable on the public devnet endpoint than getProgramAccounts.
 */
export async function fetchAllSubmissions(
  program: Program<Valida>,
  count = 0
): Promise<SubmissionAccount[]> {
  if (!count) return [];
  const pdas = Array.from({ length: count }, (_, i) => vulnPda(i));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raws = (await withRetry(() => (program.account as any).vulnerabilitySubmission.fetchMultiple(pdas))) as any[];
  return raws
    .map((raw, i) => (raw ? parseSubmission(raw, pdas[i]) : null))
    .filter((s): s is SubmissionAccount => s !== null);
}

/** Escrow accounts 0..count-1, indexed by submission_id (one getMultipleAccounts request). */
export async function fetchAllEscrows(
  program: Program<Valida>,
  count = 0
): Promise<Record<number, EscrowAccountView>> {
  const out: Record<number, EscrowAccountView> = {};
  if (!count) return out;
  const pdas = Array.from({ length: count }, (_, i) => escrowPda(i));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raws = (await withRetry(() => (program.account as any).escrowAccount.fetchMultiple(pdas))) as any[];
  raws.forEach((raw) => {
    if (!raw) return;
    out[toNum(raw.submissionId)] = {
      submissionId: toNum(raw.submissionId),
      auditor: raw.auditor.toBase58(),
      stakedAmount: toBig(raw.stakedAmount),
      bountyAmount: toBig(raw.bountyAmount),
      fixIncentiveAmount: toBig(raw.fixIncentiveAmount),
      stakeReturned: raw.stakeReturned,
      bountyReleased: raw.bountyReleased,
      fixIncentiveReleased: raw.fixIncentiveReleased,
      slashed: raw.slashed,
    };
  });
  return out;
}

export async function fetchEscrow(
  program: Program<Valida>,
  submissionId: number
): Promise<EscrowAccountView | null> {
  const pda = escrowPda(submissionId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await (program.account as any).escrowAccount.fetchNullable(pda);
  if (!raw) return null;
  return {
    submissionId: toNum(raw.submissionId),
    auditor: raw.auditor.toBase58(),
    stakedAmount: toBig(raw.stakedAmount),
    bountyAmount: toBig(raw.bountyAmount),
    fixIncentiveAmount: toBig(raw.fixIncentiveAmount),
    stakeReturned: raw.stakeReturned,
    bountyReleased: raw.bountyReleased,
    fixIncentiveReleased: raw.fixIncentiveReleased,
    slashed: raw.slashed,
  };
}

export async function fetchPatch(
  program: Program<Valida>,
  patchId: number
): Promise<PatchAccount | null> {
  const { patchPda } = await import("./pdas");
  const pda = patchPda(patchId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await (program.account as any).patchRecord.fetchNullable(pda);
  if (!raw) return null;
  return {
    authority: raw.authority.toBase58(),
    softwareName: raw.softwareName,
    version: raw.version,
    ipfsCid: raw.ipfsCid,
    fileHash: Array.from(raw.fileHash),
    isVerified: raw.isVerified,
    publishedAt: toNum(raw.publishedAt),
    pda: pda.toBase58(),
    patchId,
  };
}

/**
 * Fetch every patch 0..count-1. Patch counts are tiny so the per-id fetch keeps
 * the real patch_id (needed to derive the PDA for verify_patch) without RPC
 * pressure.
 */
export async function fetchAllPatches(
  program: Program<Valida>,
  count: number
): Promise<PatchAccount[]> {
  const ids = Array.from({ length: count }, (_, i) => i);
  const results = await Promise.all(ids.map((id) => fetchPatch(program, id)));
  return results.filter((p): p is PatchAccount => p !== null);
}
