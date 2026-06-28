"use client";

import React, { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, StatCard } from "@/components/Cards";
import { Badge, Button, EmptyState } from "@/components/UI";
import { LifecycleTimeline } from "@/components/LifecycleTimeline";
import { useZyraProgram } from "@/hooks/useZyraProgram";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  fetchConfig,
  fetchAllSubmissions,
  fetchAllEscrows,
  type SubmissionAccount,
  type EscrowAccountView,
} from "@/lib/solana/zyra";
import { configPda, vulnPda, escrowPda } from "@/lib/solana/pdas";
import {
  TEMPLATE_TYPES,
  SEVERITIES,
  STATUS_LABELS,
  STATUS_BADGE_VARIANTS,
  explorerTx,
  LAMPORTS_PER_SOL,
  lifecycleStepForSubmission,
} from "@/lib/solana/constants";
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Eye,
  Wrench,
  BadgeDollarSign,
  FlaskConical,
  ShieldX,
  ShieldCheck,
  Coins,
  Rocket,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function templateLabel(t: number) {
  return TEMPLATE_TYPES.find((x) => x.value === t)?.label ?? `Type ${t}`;
}
function severityBadgeClass(s: number) {
  return SEVERITIES.find((x) => x.value === s)?.badgeClass ?? "";
}
function severityLabel(s: number) {
  return SEVERITIES.find((x) => x.value === s)?.label ?? `Severity ${s}`;
}
const sol = (lamports: bigint | number) => (Number(lamports) / LAMPORTS_PER_SOL).toString();
const toLamports = (s: string) => new BN(Math.round(parseFloat(s || "0") * LAMPORTS_PER_SOL));

type TxFeedback = { submissionId: number; action: string; txHash: string } | null;
type ActionLoading = { submissionId: number; action: string } | null;

export default function AdminVulnerabilitiesPage() {
  const { program } = useZyraProgram();
  const anchorWallet = useAnchorWallet();
  const { connection } = useConnection();

  const [submissions, setSubmissions] = useState<SubmissionAccount[]>([]);
  const [escrows, setEscrows] = useState<Record<number, EscrowAccountView>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [contractError, setContractError] = useState<string | null>(null);
  const [txFeedback, setTxFeedback] = useState<TxFeedback>(null);
  const [actionLoading, setActionLoading] = useState<ActionLoading>(null);

  const [treasuryBalance, setTreasuryBalance] = useState<number | null>(null);
  const [fundAmount, setFundAmount] = useState("0.1");
  const [fundLoading, setFundLoading] = useState(false);
  const [fundTx, setFundTx] = useState<string | null>(null);

  const loadSubmissions = useCallback(async () => {
    setIsLoading(true);
    setContractError(null);
    try {
      const config = await fetchConfig(program);
      if (!config) {
        setContractError("Program is not initialized yet.");
        setSubmissions([]);
        return;
      }
      const count = Number(config.submissionCount);
      const all = await fetchAllSubmissions(program, count);
      const records = await fetchAllEscrows(program, count);
      setSubmissions([...all].reverse());
      setEscrows(records);
      setTreasuryBalance(await connection.getBalance(configPda()));
    } catch (err: unknown) {
      setContractError(
        err instanceof Error ? err.message : "Failed to load submissions."
      );
    } finally {
      setIsLoading(false);
    }
  }, [program, connection]);

  useEffect(() => {
    void loadSubmissions();
  }, [loadSubmissions]);

  const runAction = async (
    submissionId: number,
    action: string,
    send: () => Promise<string>
  ) => {
    if (!anchorWallet) {
      alert("Connect the admin wallet first.");
      return;
    }
    setActionLoading({ submissionId, action });
    try {
      const sig = await send();
      setTxFeedback({ submissionId, action, txHash: sig });
      await loadSubmissions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg.includes("rejected") ? "Transaction rejected." : `Failed: ${msg}`);
    } finally {
      setActionLoading(null);
    }
  };

  const admin = () => anchorWallet!.publicKey;

  const handleVerify = (id: number) =>
    runAction(id, "verify", () =>
      program.methods
        .verifySubmission(new BN(id))
        .accountsPartial({ submission: vulnPda(id), config: configPda(), admin: admin() })
        .rpc()
    );

  const handleReject = (id: number) =>
    runAction(id, "reject", () =>
      program.methods
        .rejectSubmission(new BN(id))
        .accountsPartial({
          submission: vulnPda(id),
          escrow: escrowPda(id),
          config: configPda(),
          admin: admin(),
        })
        .rpc()
    );

  const handleReleaseBounty = (id: number, auditor: string, amountSol: string) =>
    runAction(id, "release-bounty", () =>
      program.methods
        .releaseBounty(new BN(id), toLamports(amountSol))
        .accountsPartial({
          submission: vulnPda(id),
          escrow: escrowPda(id),
          config: configPda(),
          auditor: new PublicKey(auditor),
          admin: admin(),
        })
        .rpc()
    );

  const handleDecideResolution = (id: number, auditorLed: boolean) =>
    runAction(id, auditorLed ? "assign-auditor" : "assign-internal", () =>
      program.methods
        .decideResolution(new BN(id), auditorLed)
        .accountsPartial({ submission: vulnPda(id), config: configPda(), admin: admin() })
        .rpc()
    );

  const handleVerifyFix = (id: number) =>
    runAction(id, "fix-verified", () =>
      program.methods
        .verifyFix(new BN(id))
        .accountsPartial({ submission: vulnPda(id), config: configPda(), admin: admin() })
        .rpc()
    );

  const handleReleaseFixIncentive = (id: number, auditor: string, amountSol: string) =>
    runAction(id, "fix-incentive", () =>
      program.methods
        .releaseFixIncentive(new BN(id), toLamports(amountSol))
        .accountsPartial({
          submission: vulnPda(id),
          escrow: escrowPda(id),
          config: configPda(),
          auditor: new PublicKey(auditor),
          admin: admin(),
        })
        .rpc()
    );

  const handleMarkPublished = (id: number) =>
    runAction(id, "publish", () =>
      program.methods
        .markPublished(new BN(id))
        .accountsPartial({ submission: vulnPda(id), config: configPda(), admin: admin() })
        .rpc()
    );

  const handleFundTreasury = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!anchorWallet) {
      alert("Connect the admin wallet first.");
      return;
    }
    setFundLoading(true);
    setFundTx(null);
    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: anchorWallet.publicKey,
          toPubkey: configPda(),
          lamports: Number(toLamports(fundAmount)),
        })
      );
      tx.feePayer = anchorWallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const signed = await anchorWallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");
      setFundTx(sig);
      setTreasuryBalance(await connection.getBalance(configPda()));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Funding failed");
    } finally {
      setFundLoading(false);
    }
  };

  const isActionLoading = (id: number, action: string) =>
    actionLoading?.submissionId === id && actionLoading.action === action;

  const pending = submissions.filter((s) => s.status === 0).length;
  const verified = submissions.filter((s) => s.status === 1).length;
  const inProgress = submissions.filter((s) => s.status === 4).length;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-[#1A1A1A]/90">Vulnerability Portal</h1>
            <p className="text-[#1A1A1A]/70 font-medium mt-2">
              Review, verify, and manage all incoming security vulnerability reports on Solana devnet.
            </p>
          </div>
          <Button variant="outline" onClick={() => void loadSubmissions()} className="gap-2">
            <RefreshCw size={15} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
          <StatCard icon={ShieldAlert} label="Total Reports" value={submissions.length} />
          <StatCard icon={Clock} label="Pending Review" value={pending} />
          <StatCard icon={CheckCircle2} label="Verified" value={verified} trendType="up" />
          <StatCard icon={Wrench} label="Fix In Progress" value={inProgress} />
        </div>

        {txFeedback && (
          <div className="flex items-center gap-4 p-4 bg-[#A9FD5F]/20 rounded-xl border border-[#A9FD5F]">
            <CheckCircle2 size={18} className="text-[#1A1A1A] shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-[#1A1A1A]">
                Action &quot;{txFeedback.action}&quot; confirmed for #{txFeedback.submissionId}
              </p>
              <a href={explorerTx(txFeedback.txHash)} target="_blank" rel="noreferrer"
                className="text-xs font-mono text-[#1A1A1A]/60 flex items-center gap-1 mt-0.5 hover:underline">
                {txFeedback.txHash.slice(0, 26)}... <ExternalLink size={11} />
              </a>
            </div>
            <button onClick={() => setTxFeedback(null)} className="text-[#1A1A1A]/40 hover:text-[#1A1A1A] text-xs">✕</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <Card title="Incoming Reports" subtitle="All vulnerability submissions from auditors">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-10 w-10 rounded-full border-4 border-[#A9FD5F] border-t-transparent animate-spin" />
                </div>
              ) : contractError ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <AlertTriangle size={24} className="text-[#1A1A1A]/40" />
                  <p className="text-sm text-[#1A1A1A]/60 max-w-sm">{contractError}</p>
                </div>
              ) : submissions.length === 0 ? (
                <EmptyState icon={ShieldAlert} title="No reports yet" description="Auditors can submit vulnerability reports from the Auditor portal." />
              ) : (
                <div className="space-y-4">
                  {submissions.map((sub) => (
                    <SubmissionRow
                      key={sub.submissionId}
                      sub={sub}
                      escrow={escrows[sub.submissionId] ?? null}
                      isActionLoading={isActionLoading}
                      onVerify={() => void handleVerify(sub.submissionId)}
                      onReject={() => void handleReject(sub.submissionId)}
                      onReleaseBounty={(amt) => void handleReleaseBounty(sub.submissionId, sub.auditor, amt)}
                      onAssignInternal={() => void handleDecideResolution(sub.submissionId, false)}
                      onAssignAuditor={() => void handleDecideResolution(sub.submissionId, true)}
                      onVerifyFix={() => void handleVerifyFix(sub.submissionId)}
                      onReleaseFixIncentive={(amt) => void handleReleaseFixIncentive(sub.submissionId, sub.auditor, amt)}
                      onPublish={() => void handleMarkPublished(sub.submissionId)}
                    />
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card title="Bounty Treasury" subtitle="Fund the program config so bounties + fix incentives can be paid">
              <div className="space-y-4">
                <div className="p-4 bg-[#EDEDED] rounded-xl">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#1A1A1A]/50">Treasury balance (config PDA)</p>
                  <p className="text-2xl font-black text-[#1A1A1A] mt-1">
                    {treasuryBalance !== null ? `${sol(treasuryBalance)} SOL` : "—"}
                  </p>
                </div>
                <form onSubmit={(e) => void handleFundTreasury(e)} className="space-y-3">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#1A1A1A]/50 block">Amount to fund (SOL)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    className="w-full bg-white border border-[#1A1A1A]/10 rounded-lg px-3 py-2 text-sm font-mono text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]/30"
                  />
                  {fundTx && (
                    <a href={explorerTx(fundTx)} target="_blank" rel="noreferrer"
                      className="text-[10px] font-mono text-[#1A1A1A]/60 hover:underline flex items-center gap-1">
                      Funded: {fundTx.slice(0, 16)}... <ExternalLink size={9} />
                    </a>
                  )}
                  <Button type="submit" variant="primary" isLoading={fundLoading} className="w-full gap-2">
                    <Coins size={15} /> Fund Treasury
                  </Button>
                </form>
              </div>
            </Card>

            <Card title="Workflow Steps" subtitle="Status transition reference">
              <div className="space-y-2 text-xs text-[#1A1A1A]/60">
                {[
                  { step: "Step 4", label: "Verify or Reject (reject slashes the stake)" },
                  { step: "Step 5", label: "Release bounty — INCENTIVE #1 (returns stake too)" },
                  { step: "Step 6", label: "Auditor reveals — commitment verified on-chain" },
                  { step: "Step 7", label: "Decide: 8A internal fix vs 8B auditor fix" },
                  { step: "Step 9", label: "Verify fix, then release fix incentive #2 (8B)" },
                  { step: "Step 10", label: "Mark published — lifecycle complete" },
                ].map(({ step, label }) => (
                  <div key={step} className="flex items-start gap-2 p-2 rounded-lg hover:bg-[#EDEDED]/50">
                    <span className="font-bold text-[#1A1A1A] shrink-0">{step}</span>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function SubmissionRow({
  sub,
  escrow,
  isActionLoading,
  onVerify,
  onReject,
  onReleaseBounty,
  onAssignInternal,
  onAssignAuditor,
  onVerifyFix,
  onReleaseFixIncentive,
  onPublish,
}: {
  sub: SubmissionAccount;
  escrow: EscrowAccountView | null;
  isActionLoading: (id: number, action: string) => boolean;
  onVerify: () => void;
  onReject: () => void;
  onReleaseBounty: (amt: string) => void;
  onAssignInternal: () => void;
  onAssignAuditor: () => void;
  onVerifyFix: () => void;
  onReleaseFixIncentive: (amt: string) => void;
  onPublish: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [bountyInput, setBountyInput] = useState("0.05");
  const [incentiveInput, setIncentiveInput] = useState("0.025");
  const id = sub.submissionId;

  return (
    <div
      id={`submission-${id}`}
      className="border border-[#1A1A1A]/10 rounded-xl overflow-hidden"
      data-testid={`submission-${id}`}
    >
      <div
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-[#EDEDED]/30 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="font-black text-[#1A1A1A] font-mono w-8 shrink-0">#{id}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-[#1A1A1A]">{sub.affectedSoftware}</span>
            <span className="font-mono text-xs text-[#1A1A1A]/50">v{sub.affectedVersion}</span>
            <span className="text-xs text-[#1A1A1A]/50">· {templateLabel(sub.templateType)}</span>
          </div>
          <p className="text-xs text-[#1A1A1A]/40 font-mono mt-0.5">
            {sub.auditor.slice(0, 8)}...{sub.auditor.slice(-6)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {sub.fraudDetected && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200 uppercase">FRAUD</span>
          )}
          {sub.commitmentVerified && !sub.fraudDetected && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#A9FD5F]/30 text-[#1A1A1A] border border-[#A9FD5F] uppercase">VERIFIED</span>
          )}
          <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border", severityBadgeClass(sub.severity))}>
            {severityLabel(sub.severity)}
          </span>
          <Badge
            variant={STATUS_BADGE_VARIANTS[sub.status] as "success" | "warning" | "error" | "info" | "neutral"}
            data-testid={`status-${id}`}
          >
            {STATUS_LABELS[sub.status]}
          </Badge>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[#1A1A1A]/10 p-4 space-y-4 bg-[#EDEDED]/10">
          <LifecycleTimeline
            currentStep={lifecycleStepForSubmission(sub)}
            auditorLed={sub.status >= 4 ? sub.auditorLed : undefined}
            compact
          />
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-white rounded-lg">
              <p className="text-[#1A1A1A]/50 font-bold uppercase tracking-wider mb-1">Submitted</p>
              <p className="text-[#1A1A1A] font-medium">{new Date(sub.submittedAt * 1000).toLocaleString()}</p>
            </div>
            <div className="p-3 bg-white rounded-lg">
              <p className="text-[#1A1A1A]/50 font-bold uppercase tracking-wider mb-1">Incentives</p>
              <p className="text-[#1A1A1A] font-medium">
                Bounty: {sub.bountyPaid ? "✅" : "⏳"} &nbsp; Fix: {sub.fixIncentivePaid ? "✅" : "⏳"}
              </p>
            </div>

            {sub.commitmentVerified && (
              <div className="p-3 bg-white rounded-lg col-span-2">
                <p className="text-[#1A1A1A]/50 font-bold uppercase tracking-wider mb-1">Commitment</p>
                <div className="flex items-center gap-2">
                  <ShieldCheck size={13} className="text-[#1A1A1A] shrink-0" />
                  <span className="text-[#1A1A1A] font-medium">Verified on-chain (keccak256)</span>
                  {sub.revealedIpfsCid && (
                    <code className="text-[10px] font-mono text-[#1A1A1A]/50 ml-auto">{sub.revealedIpfsCid.slice(0, 16)}...</code>
                  )}
                </div>
              </div>
            )}
            {sub.fraudDetected && (
              <div className="p-3 bg-rose-50 rounded-lg col-span-2 border border-rose-200">
                <div className="flex items-center gap-2">
                  <ShieldX size={13} className="text-rose-600 shrink-0" />
                  <span className="text-rose-700 font-bold">Fraud detected — commitment mismatch.</span>
                </div>
              </div>
            )}

            {escrow && (
              <div className="p-3 bg-white rounded-lg col-span-2">
                <p className="text-[#1A1A1A]/50 font-bold uppercase tracking-wider mb-1">Escrow</p>
                <div className="flex gap-4 text-[#1A1A1A] font-mono text-xs flex-wrap">
                  <span>Staked: {sol(escrow.stakedAmount)} SOL</span>
                  <span>Bounty: {escrow.bountyReleased ? `${sol(escrow.bountyAmount)} SOL` : "—"}</span>
                  <span>Fix: {escrow.fixIncentiveReleased ? `${sol(escrow.fixIncentiveAmount)} SOL` : "—"}</span>
                  {escrow.slashed && <span className="text-rose-600 font-bold">SLASHED</span>}
                  {escrow.stakeReturned && <span className="text-emerald-600 font-bold">STAKE RETURNED</span>}
                </div>
              </div>
            )}

            <div className="p-3 bg-white rounded-lg col-span-2">
              <p className="text-[#1A1A1A]/50 font-bold uppercase tracking-wider mb-1">Auditor</p>
              <code className="text-[10px] font-mono text-[#1A1A1A]/60 break-all">{sub.auditor}</code>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Status 0 — Pending */}
            {sub.status === 0 && (
              <>
                <Button variant="success" size="sm" isLoading={isActionLoading(id, "verify")} onClick={onVerify} className="gap-1.5" data-testid={`verify-${id}`}>
                  <CheckCircle2 size={13} /> Verify
                </Button>
                <Button variant="danger" size="sm" isLoading={isActionLoading(id, "reject")} onClick={onReject} className="gap-1.5" data-testid={`reject-${id}`}>
                  <XCircle size={13} /> Reject &amp; Slash
                </Button>
              </>
            )}

            {/* Status 1 — Verified: release bounty */}
            {sub.status === 1 && !sub.bountyPaid && (
              <div className="w-full flex items-center gap-2">
                <div className="flex-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#1A1A1A]/50 mb-1 block">Bounty amount (SOL)</label>
                  <input type="number" step="0.001" min="0" value={bountyInput}
                    onChange={(e) => setBountyInput(e.target.value)} onClick={(e) => e.stopPropagation()}
                    data-testid={`bounty-input-${id}`}
                    className="w-full bg-white border border-[#1A1A1A]/10 rounded-lg px-3 py-2 text-sm font-mono text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]/30" />
                </div>
                <Button variant="secondary" size="sm" isLoading={isActionLoading(id, "release-bounty")}
                  onClick={() => onReleaseBounty(bountyInput)} className="gap-1.5 self-end" data-testid={`release-bounty-${id}`}>
                  <BadgeDollarSign size={13} /> Release Bounty
                </Button>
              </div>
            )}
            {sub.status === 1 && sub.bountyPaid && (
              <span className="text-xs text-[#1A1A1A]/50 italic flex items-center gap-1" data-testid={`awaiting-reveal-${id}`}>
                <CheckCircle2 size={12} /> Bounty released — waiting for auditor to reveal
              </span>
            )}

            {sub.status === 2 && (
              <span className="text-xs text-rose-500 italic flex items-center gap-1">
                <XCircle size={12} /> Rejected — stake slashed
              </span>
            )}

            {/* Status 3 — Revealed: decide resolution */}
            {sub.status === 3 && (
              <div className="w-full">
                <p className="text-xs font-bold text-[#1A1A1A]/60 mb-2 uppercase tracking-wider">Step 7: Choose resolution path</p>
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" isLoading={isActionLoading(id, "assign-internal")} onClick={onAssignInternal} className="gap-1.5" data-testid={`assign-internal-${id}`}>
                    <FlaskConical size={13} /> 8A — Internal Fix
                  </Button>
                  <Button variant="secondary" size="sm" isLoading={isActionLoading(id, "assign-auditor")} onClick={onAssignAuditor} className="gap-1.5" data-testid={`assign-auditor-${id}`}>
                    <Eye size={13} /> 8B — Assign to Auditor
                  </Button>
                </div>
              </div>
            )}

            {/* Status 4 — Fix In Progress */}
            {sub.status === 4 && (
              <Button variant="secondary" size="sm" isLoading={isActionLoading(id, "fix-verified")} onClick={onVerifyFix} className="gap-1.5" data-testid={`verify-fix-${id}`}>
                <CheckCircle2 size={13} /> Verify Fix
              </Button>
            )}

            {/* Status 5 — Fix Verified */}
            {sub.status === 5 && sub.auditorLed && !sub.fixIncentivePaid && (
              <div className="w-full flex items-center gap-2">
                <div className="flex-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#1A1A1A]/50 mb-1 block">Fix incentive (SOL)</label>
                  <input type="number" step="0.001" min="0" value={incentiveInput}
                    onChange={(e) => setIncentiveInput(e.target.value)} onClick={(e) => e.stopPropagation()}
                    data-testid={`incentive-input-${id}`}
                    className="w-full bg-white border border-[#1A1A1A]/10 rounded-lg px-3 py-2 text-sm font-mono text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]/30" />
                </div>
                <Button variant="secondary" size="sm" isLoading={isActionLoading(id, "fix-incentive")}
                  onClick={() => onReleaseFixIncentive(incentiveInput)} className="gap-1.5 self-end" data-testid={`release-fix-incentive-${id}`}>
                  <BadgeDollarSign size={13} /> Release Fix Incentive
                </Button>
              </div>
            )}
            {sub.status === 5 && (!sub.auditorLed || sub.fixIncentivePaid) && (
              <Button variant="primary" size="sm" isLoading={isActionLoading(id, "publish")} onClick={onPublish} className="gap-1.5" data-testid={`publish-${id}`}>
                <Rocket size={13} /> Mark Published (Step 10)
              </Button>
            )}

            {sub.status === 6 && (
              <span className="text-xs text-emerald-600 font-bold italic flex items-center gap-1" data-testid={`published-${id}`}>
                <Rocket size={12} /> Published — lifecycle complete
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
