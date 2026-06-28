"use client";

import React, { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/Cards";
import { Button, Badge, EmptyState } from "@/components/UI";
import { LifecycleTimeline } from "@/components/LifecycleTimeline";
import { useWallet } from "@/context/WalletContext";
import { useZyraProgram } from "@/hooks/useZyraProgram";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { fetchConfig, fetchAllSubmissions, type SubmissionAccount } from "@/lib/solana/zyra";
import { vulnPda } from "@/lib/solana/pdas";
import { generateSalt, computeCommitmentHex, computeCommitmentBytes } from "@/lib/solana/commitment";
import { TEMPLATE_TYPES, explorerTx } from "@/lib/solana/constants";
import {
  Wrench,
  AlertTriangle,
  Download,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  CloudUpload,
  Lock,
  Hash,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
function templateLabel(t: number) {
  return TEMPLATE_TYPES.find((x) => x.value === t)?.label ?? `Type ${t}`;
}

type FixPhase = "idle" | "committing" | "done" | "error";
type FixState = {
  submissionId: number;
  phase: FixPhase;
  salt: string;
  commitment: string;
  description: string;
  commitTxHash?: string;
  error?: string;
  fileDownloaded: boolean;
};
type EligibleSubmission = SubmissionAccount & { alreadyCommitted: boolean };

export default function AuditorSubmitFixPage() {
  const { address } = useWallet();
  const { program } = useZyraProgram();
  const anchorWallet = useAnchorWallet();

  const [eligible, setEligible] = useState<EligibleSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [contractError, setContractError] = useState<string | null>(null);
  const [fixState, setFixState] = useState<FixState | null>(null);

  const loadEligible = useCallback(async () => {
    if (!address) return;
    setIsLoading(true);
    setContractError(null);
    try {
      const config = await fetchConfig(program);
      if (!config) {
        setEligible([]);
        return;
      }
      const all = await fetchAllSubmissions(program, Number(config.submissionCount));
      const mine = all
        .filter((s) => s.auditor === address && s.status === 4 && s.auditorLed)
        .map((s) => ({ ...s, alreadyCommitted: s.fixCommitment.some((b) => b !== 0) }));
      setEligible(mine);
    } catch (err: unknown) {
      setContractError(err instanceof Error ? err.message : "Failed to load assignments.");
    } finally {
      setIsLoading(false);
    }
  }, [address, program]);

  useEffect(() => {
    void loadEligible();
  }, [loadEligible]);

  const initFixForm = (submissionId: number) => {
    setFixState({
      submissionId,
      phase: "idle",
      salt: generateSalt(),
      commitment: "",
      description: "",
      fileDownloaded: false,
    });
  };

  const updateDescription = (description: string) => {
    setFixState((prev) => {
      if (!prev) return null;
      let commitment = "";
      try {
        if (description.trim() && prev.salt) commitment = computeCommitmentHex(description, prev.salt);
      } catch {
        /* ignore */
      }
      return { ...prev, description, commitment, fileDownloaded: false };
    });
  };

  const downloadSecretFile = () => {
    if (!fixState) return;
    const payload = {
      type: "fix",
      submissionId: fixState.submissionId,
      salt: fixState.salt,
      commitment: fixState.commitment,
      description: fixState.description,
      generatedAt: new Date().toISOString(),
      auditor: address,
      note: "Fix proposal secret — keep alongside your records.",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fix-secret-${fixState.submissionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setFixState((prev) => (prev ? { ...prev, fileDownloaded: true } : null));
  };

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fixState?.description.trim() || !fixState.fileDownloaded || !anchorWallet) return;
    setFixState((prev) => (prev ? { ...prev, phase: "committing", error: undefined } : null));
    try {
      const commitmentBytes = computeCommitmentBytes(fixState.description, fixState.salt);
      const sig = await program.methods
        .submitFixCommitment(new BN(fixState.submissionId), commitmentBytes)
        .accountsPartial({ submission: vulnPda(fixState.submissionId), auditor: anchorWallet.publicKey })
        .rpc();
      setFixState((prev) => (prev ? { ...prev, phase: "done", commitTxHash: sig } : null));
      await loadEligible();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFixState((prev) =>
        prev
          ? { ...prev, phase: "error", error: msg.includes("rejected") ? "Transaction rejected." : `Commit failed: ${msg}` }
          : null
      );
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8 max-w-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-[#1A1A1A]/90">Submit Fix</h1>
            <p className="text-[#1A1A1A]/70 font-medium mt-2">
              Commit a fix proposal for vulnerabilities assigned to you (Step 8B).
            </p>
          </div>
          <Button variant="outline" onClick={() => void loadEligible()} className="gap-2">
            <RefreshCw size={15} />
            Refresh
          </Button>
        </div>

        <LifecycleTimeline currentStep={8} auditorLed />

        {fixState && fixState.phase === "done" && (
          <Card>
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-4 bg-[#A9FD5F]/20 rounded-xl border border-[#A9FD5F]">
                <CheckCircle2 size={20} className="text-[#1A1A1A] shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-[#1A1A1A]" data-testid="fix-done">Fix commitment submitted for #{fixState.submissionId}</p>
                  <p className="text-sm text-[#1A1A1A]/70 mt-1">
                    The admin will verify the fix and then release the fix incentive.
                  </p>
                </div>
              </div>
              {fixState.commitTxHash && (
                <a href={explorerTx(fixState.commitTxHash)} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 p-3 bg-[#EDEDED] rounded-xl hover:bg-[#A9FD5F]/30 transition-colors group">
                  <code className="text-xs font-mono text-[#1A1A1A] break-all flex-1">{fixState.commitTxHash}</code>
                  <ExternalLink size={14} className="shrink-0 text-[#1A1A1A]/50 group-hover:text-[#1A1A1A]" />
                </a>
              )}
            </div>
          </Card>
        )}

        {isLoading ? (
          <Card>
            <div className="flex items-center justify-center py-12">
              <div className="h-10 w-10 rounded-full border-4 border-[#A9FD5F] border-t-transparent animate-spin" />
            </div>
          </Card>
        ) : contractError ? (
          <Card>
            <div className="flex items-center gap-3 py-8 justify-center text-[#1A1A1A]/60">
              <AlertTriangle size={18} />
              <p className="text-sm">{contractError}</p>
            </div>
          </Card>
        ) : eligible.length === 0 ? (
          <Card>
            <EmptyState
              icon={Wrench}
              title="No fix assignments"
              description="You have no vulnerabilities in FixInProgress with auditor-led resolution assigned to your wallet."
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {eligible.map((sub) => (
              <Card key={sub.submissionId}>
                <div className="space-y-4" data-testid={`fix-card-${sub.submissionId}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-black text-[#1A1A1A]">#{sub.submissionId}</span>
                        <span className="text-sm font-semibold text-[#1A1A1A]/60">{templateLabel(sub.templateType)}</span>
                      </div>
                      <p className="text-sm text-[#1A1A1A]/70 mt-1">
                        {sub.affectedSoftware} <span className="font-mono text-xs">v{sub.affectedVersion}</span>
                      </p>
                    </div>
                    {sub.alreadyCommitted ? <Badge variant="info">COMMITTED</Badge> : <Badge variant="warning">FIX IN PROGRESS</Badge>}
                  </div>

                  {sub.alreadyCommitted ? (
                    <p className="text-sm text-[#1A1A1A]/50 italic">
                      Fix commitment submitted on-chain. Waiting for the admin to verify the fix and release the incentive.
                    </p>
                  ) : fixState?.submissionId === sub.submissionId && fixState.phase !== "done" ? (
                    <form onSubmit={(e) => void handleCommit(e)} className="space-y-4">
                      <div className="p-4 bg-[#EDEDED]/30 rounded-xl border border-[#1A1A1A]/10 space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="h-5 w-5 rounded-full bg-[#1A1A1A] text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
                          <span className="text-sm font-semibold text-[#1A1A1A]">Describe the fix</span>
                          <span className="text-[10px] bg-rose-100 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ml-auto shrink-0">SECRET</span>
                        </div>
                        <textarea
                          rows={5}
                          placeholder="Describe the fix in detail — code changes, patches, config updates, rationale..."
                          value={fixState.description}
                          onChange={(e) => updateDescription(e.target.value)}
                          data-testid="fix-description"
                          className="w-full bg-white border border-[#1A1A1A]/10 rounded-xl px-4 py-3 text-[#1A1A1A] placeholder:text-[#1A1A1A]/50 focus:outline-none focus:border-[#1A1A1A]/30 transition-all resize-none"
                        />
                      </div>

                      <div className="p-4 bg-[#EDEDED]/30 rounded-xl border border-[#1A1A1A]/10 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="h-5 w-5 rounded-full bg-[#1A1A1A] text-white text-xs font-bold flex items-center justify-center shrink-0">2</span>
                          <span className="text-sm font-semibold text-[#1A1A1A]">Auto-generated salt</span>
                        </div>
                        <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-[#1A1A1A]/10">
                          <Lock size={13} className="text-[#1A1A1A]/30 shrink-0" />
                          <code className="text-xs font-mono text-[#1A1A1A]/50 break-all flex-1">{fixState.salt}</code>
                        </div>
                      </div>

                      <div className="p-4 bg-[#EDEDED]/30 rounded-xl border border-[#1A1A1A]/10 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="h-5 w-5 rounded-full bg-[#1A1A1A] text-white text-xs font-bold flex items-center justify-center shrink-0">3</span>
                          <span className="text-sm font-semibold text-[#1A1A1A]">Fix commitment hash (goes on-chain)</span>
                        </div>
                        <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-[#1A1A1A]/10">
                          <Hash size={13} className="text-[#1A1A1A]/30 shrink-0" />
                          <code className={cn("text-xs font-mono break-all flex-1", fixState.commitment ? "text-[#1A1A1A]/80" : "text-[#1A1A1A]/30 italic")}>
                            {fixState.commitment || "fill in fix description above"}
                          </code>
                        </div>
                      </div>

                      <div className={cn("p-4 rounded-xl border-2 transition-all", fixState.fileDownloaded ? "bg-[#A9FD5F]/20 border-[#A9FD5F]" : "bg-amber-50 border-amber-200")}>
                        <div className="flex items-start gap-3">
                          {fixState.fileDownloaded ? <CheckCircle2 size={18} className="text-[#1A1A1A] shrink-0 mt-0.5" /> : <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />}
                          <p className={cn("text-sm font-medium", fixState.fileDownloaded ? "text-[#1A1A1A]" : "text-amber-800")}>
                            {fixState.fileDownloaded ? "Secret file downloaded — you can commit" : "Download your secret file before committing"}
                          </p>
                        </div>
                        {!fixState.fileDownloaded && (
                          <Button type="button" variant="outline" size="sm" onClick={downloadSecretFile} disabled={!fixState.description.trim()} data-testid="fix-download" className="mt-3 gap-2 w-full">
                            <Download size={14} />
                            {fixState.description.trim() ? "Download Secret File" : "Fill in fix description first"}
                          </Button>
                        )}
                      </div>

                      {fixState.phase === "error" && fixState.error && (
                        <div className="flex items-center gap-2 p-3 bg-rose-50 rounded-xl border border-rose-200">
                          <AlertTriangle size={14} className="text-rose-600 shrink-0" />
                          <p className="text-sm text-rose-700">{fixState.error}</p>
                        </div>
                      )}

                      <div className="flex gap-3">
                        <Button type="submit" variant="primary" isLoading={fixState.phase === "committing"} disabled={!fixState.description.trim() || !fixState.fileDownloaded} className="flex-1 gap-2" data-testid="fix-commit">
                          <CloudUpload size={15} />
                          Submit Fix Commitment
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setFixState(null)}>Cancel</Button>
                      </div>
                    </form>
                  ) : (
                    <Button variant="secondary" onClick={() => initFixForm(sub.submissionId)} className="w-full gap-2" data-testid={`write-fix-${sub.submissionId}`}>
                      <Wrench size={15} />
                      Write Fix Proposal
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
