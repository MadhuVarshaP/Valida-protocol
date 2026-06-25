"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, StatCard } from "@/components/Cards";
import { Badge, Button, EmptyState } from "@/components/UI";
import { LifecycleTimeline } from "@/components/LifecycleTimeline";
import { useWallet } from "@/context/WalletContext";
import { useValidaProgram } from "@/hooks/useValidaProgram";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { fetchConfig, fetchAllSubmissions, type SubmissionAccount } from "@/lib/solana/valida";
import { vulnPda } from "@/lib/solana/pdas";
import {
  computeCommitmentHex,
  hexToBytes,
  bytesToHex,
} from "@/lib/solana/commitment";
import {
  TEMPLATE_TYPES,
  SEVERITIES,
  STATUS_LABELS,
  STATUS_BADGE_VARIANTS,
  explorerTx,
} from "@/lib/solana/constants";
import {
  Bug,
  Clock,
  AlertTriangle,
  Upload,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  CloudUpload,
} from "lucide-react";

function templateLabel(t: number) {
  return TEMPLATE_TYPES.find((x) => x.value === t)?.label ?? `Type ${t}`;
}
function severityLabel(s: number) {
  return SEVERITIES.find((x) => x.value === s)?.label ?? `Severity ${s}`;
}
function severityBadgeClass(s: number) {
  return SEVERITIES.find((x) => x.value === s)?.badgeClass ?? "";
}

type RevealPhase = "idle" | "file-verifying" | "revealing" | "done" | "error";
type RevealState = {
  submissionId: number;
  phase: RevealPhase;
  error?: string;
  txHash?: string;
};

export default function AuditorDashboardPage() {
  const { address } = useWallet();
  const { program } = useValidaProgram();
  const anchorWallet = useAnchorWallet();

  const [submissions, setSubmissions] = useState<SubmissionAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [contractError, setContractError] = useState<string | null>(null);
  const [revealState, setRevealState] = useState<RevealState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeRevealId = useRef<number | null>(null);

  const loadSubmissions = useCallback(async () => {
    if (!address) return;
    setIsLoading(true);
    setContractError(null);
    try {
      const config = await fetchConfig(program);
      if (!config) {
        setSubmissions([]);
        return;
      }
      const all = await fetchAllSubmissions(program, Number(config.submissionCount));
      const mine = all.filter((s) => s.auditor === address);
      setSubmissions(mine.reverse());
    } catch (err: unknown) {
      setContractError(err instanceof Error ? err.message : "Failed to load submissions.");
    } finally {
      setIsLoading(false);
    }
  }, [address, program]);

  useEffect(() => {
    void loadSubmissions();
  }, [loadSubmissions]);

  const startReveal = (submissionId: number) => {
    activeRevealId.current = submissionId;
    setRevealState({ submissionId, phase: "idle" });
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || activeRevealId.current === null || !anchorWallet) return;
    const submissionId = activeRevealId.current;
    setRevealState({ submissionId, phase: "file-verifying" });

    try {
      const json = JSON.parse(await file.text()) as {
        submissionId: number | string;
        salt: string;
        description: string;
      };
      if (Number(json.submissionId) !== submissionId) {
        setRevealState({ submissionId, phase: "error", error: "File is for a different submission ID." });
        return;
      }

      // Verify the commitment matches the on-chain value before sending.
      const sub = submissions.find((s) => s.submissionId === submissionId);
      const onChain = sub ? bytesToHex(sub.commitment) : "";
      const computed = computeCommitmentHex(json.description, json.salt);
      if (sub && computed.toLowerCase() !== onChain.toLowerCase()) {
        setRevealState({
          submissionId,
          phase: "error",
          error: "Commitment mismatch — file may be corrupted or from a different submission.",
        });
        return;
      }

      setRevealState({ submissionId, phase: "revealing" });
      const saltBytes = Array.from(hexToBytes(json.salt));
      const ipfsCid = `valida-reveal-${submissionId}`; // IPFS optional for the demo

      const sig = await program.methods
        .revealAndVerify(new BN(submissionId), json.description, saltBytes, ipfsCid)
        .accountsPartial({ submission: vulnPda(submissionId), auditor: anchorWallet.publicKey })
        .rpc();

      setRevealState({ submissionId, phase: "done", txHash: sig });
      await loadSubmissions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setRevealState({
        submissionId,
        phase: "error",
        error: msg.includes("rejected") ? "Transaction rejected." : `Reveal failed: ${msg}`,
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const pending = submissions.filter((s) => s.status === 0).length;
  const verified = submissions.filter((s) => s.status === 1).length;
  const revealed = submissions.filter((s) => s.status >= 3).length;

  return (
    <DashboardLayout>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => void handleFileUpload(e)}
        data-testid="reveal-file-input"
      />

      <div className="flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-[#1A1A1A]/90">My Submissions</h1>
            <p className="text-[#1A1A1A]/70 font-medium mt-2">Track and manage your vulnerability reports.</p>
          </div>
          <Button variant="outline" onClick={() => void loadSubmissions()} className="gap-2">
            <RefreshCw size={15} />
            Refresh
          </Button>
        </div>

        <LifecycleTimeline currentStep={6} />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <StatCard icon={Bug} label="Total Submissions" value={submissions.length} />
          <StatCard icon={Clock} label="Pending Review" value={pending} />
          <StatCard icon={ShieldCheck} label="Verified / Revealed" value={verified + revealed} trendType="up" />
        </div>

        {revealState && revealState.phase !== "idle" && (
          <div className={`flex items-start gap-4 p-4 rounded-xl border ${
            revealState.phase === "error" ? "bg-rose-50 border-rose-200" :
            revealState.phase === "done" ? "bg-[#A9FD5F]/20 border-[#A9FD5F]" :
            "bg-blue-50 border-blue-200"
          }`}>
            {["file-verifying", "revealing"].includes(revealState.phase) && (
              <div className="h-5 w-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin shrink-0 mt-0.5" />
            )}
            {revealState.phase === "done" && <CheckCircle2 size={18} className="text-[#1A1A1A] shrink-0 mt-0.5" />}
            {revealState.phase === "error" && <XCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />}
            <div className="flex-1">
              {revealState.phase === "file-verifying" && <p className="text-sm font-semibold text-blue-800">Verifying commitment…</p>}
              {revealState.phase === "revealing" && <p className="text-sm font-semibold text-blue-800">Sending reveal transaction…</p>}
              {revealState.phase === "done" && (
                <>
                  <p className="text-sm font-semibold text-[#1A1A1A]" data-testid="reveal-done">Vulnerability revealed successfully</p>
                  {revealState.txHash && (
                    <a href={explorerTx(revealState.txHash)} target="_blank" rel="noreferrer"
                      className="text-xs font-mono text-[#1A1A1A]/60 flex items-center gap-1 mt-1 hover:underline">
                      {revealState.txHash.slice(0, 24)}... <ExternalLink size={11} />
                    </a>
                  )}
                </>
              )}
              {revealState.phase === "error" && <p className="text-sm font-semibold text-rose-700" data-testid="reveal-error">{revealState.error}</p>}
            </div>
            <button onClick={() => setRevealState(null)} className="text-[#1A1A1A]/40 hover:text-[#1A1A1A] text-xs">✕</button>
          </div>
        )}

        <Card title="Vulnerability Reports" subtitle="All submissions linked to your wallet">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-10 w-10 rounded-full border-4 border-[#A9FD5F] border-t-transparent animate-spin" />
            </div>
          ) : contractError ? (
            <div className="flex items-center gap-3 py-8 justify-center text-[#1A1A1A]/60">
              <AlertTriangle size={18} />
              <p className="text-sm">{contractError}</p>
            </div>
          ) : submissions.length === 0 ? (
            <EmptyState icon={Bug} title="No submissions yet" description="Submit your first vulnerability report to see it here." />
          ) : (
            <div className="table-container">
              <table className="w-full">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Software</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((sub) => (
                    <tr key={sub.submissionId} className="group hover:bg-white/2" data-testid={`my-submission-${sub.submissionId}`}>
                      <td className="font-bold text-[#1A1A1A] font-mono">#{sub.submissionId}</td>
                      <td className="text-sm text-[#1A1A1A]/70">{templateLabel(sub.templateType)}</td>
                      <td className="text-sm">
                        <div className="font-semibold text-[#1A1A1A]">{sub.affectedSoftware}</div>
                        <div className="text-xs text-[#1A1A1A]/50 font-mono">{sub.affectedVersion}</div>
                      </td>
                      <td>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${severityBadgeClass(sub.severity)}`}>
                          {severityLabel(sub.severity)}
                        </span>
                      </td>
                      <td>
                        <Badge variant={STATUS_BADGE_VARIANTS[sub.status] as "success" | "warning" | "error" | "info" | "neutral"} data-testid={`my-status-${sub.submissionId}`}>
                          {STATUS_LABELS[sub.status]}
                        </Badge>
                      </td>
                      <td className="text-xs text-[#1A1A1A]/50">{new Date(sub.submittedAt * 1000).toLocaleDateString()}</td>
                      <td>
                        {sub.status === 1 && sub.bountyPaid && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => startReveal(sub.submissionId)}
                            disabled={revealState?.submissionId === sub.submissionId && ["file-verifying", "revealing"].includes(revealState.phase)}
                            className="gap-1.5"
                            data-testid={`reveal-${sub.submissionId}`}
                          >
                            <CloudUpload size={13} />
                            Reveal Details
                          </Button>
                        )}
                        {sub.status === 1 && !sub.bountyPaid && <span className="text-xs text-[#1A1A1A]/40 italic">Awaiting bounty payment</span>}
                        {sub.status === 0 && <span className="text-xs text-[#1A1A1A]/40 italic">Awaiting review</span>}
                        {sub.status === 2 && <span className="text-xs text-rose-500 font-medium">Rejected</span>}
                        {sub.status === 4 && (
                          <a href="/auditor/submit-fix" className="text-xs font-medium text-blue-600 hover:underline flex items-center gap-1">
                            <Upload size={11} /> Submit Fix
                          </a>
                        )}
                        {(sub.status === 3 || sub.status >= 5) && (
                          <span className="text-xs text-[#1A1A1A]/40 italic">{STATUS_LABELS[sub.status]}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
