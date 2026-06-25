"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, StatCard } from "@/components/Cards";
import { Badge, Button, EmptyState } from "@/components/UI";
import { LifecycleTimeline } from "@/components/LifecycleTimeline";
import { useValidaProgram } from "@/hooks/useValidaProgram";
import {
  fetchConfig,
  fetchAllSubmissions,
  type SubmissionAccount,
} from "@/lib/solana/valida";
import {
  STATUS_LABELS,
  STATUS_BADGE_VARIANTS,
  explorerAddress,
  lifecycleStepForSubmission,
} from "@/lib/solana/constants";
import { vulnPda } from "@/lib/solana/pdas";
import {
  RefreshCw,
  AlertTriangle,
  ShieldAlert,
  ExternalLink,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

type StepDef = {
  step: number;
  title: string;
  description: string;
  tag: "INCENTIVE #1" | "INCENTIVE #2" | null;
  href: ((id: number) => string) | null;
  cta: string;
};

const STEPS: StepDef[] = [
  { step: 1, title: "Identify vulnerability", description: "Auditor identifies a real vulnerability in the target software off-chain.", tag: null, href: null, cta: "" },
  { step: 2, title: "Generate ZK proof", description: "Auditor writes up the details and a commitment hash (keccak256) is computed client-side.", tag: null, href: () => "/auditor/submit", cta: "Open Submit Vulnerability" },
  { step: 3, title: "Submit proof", description: "stake_and_submit anchors the commitment + stake on-chain.", tag: null, href: () => "/auditor/submit", cta: "Open Submit Vulnerability" },
  { step: 4, title: "Team verifies", description: "Admin reviews and calls verify_submission (or rejects, slashing the stake).", tag: null, href: (id) => `/admin/vulnerabilities#submission-${id}`, cta: "Open Vulnerability Portal" },
  { step: 5, title: "Bounty paid", description: "Admin calls release_bounty — the auditor's stake is returned plus the bounty.", tag: "INCENTIVE #1", href: (id) => `/admin/vulnerabilities#submission-${id}`, cta: "Open Vulnerability Portal" },
  { step: 6, title: "Vulnerability revealed", description: "Auditor uploads their secret file; reveal_and_verify checks keccak256(details||salt) on-chain.", tag: null, href: () => "/auditor/dashboard", cta: "Open My Submissions" },
  { step: 7, title: "Resolution decided", description: "Admin calls decide_resolution — 8A (internal team) or 8B (auditor develops the fix).", tag: null, href: (id) => `/admin/vulnerabilities#submission-${id}`, cta: "Open Vulnerability Portal" },
  { step: 8, title: "Fix developed", description: "8A: admin verifies the internal fix directly. 8B: auditor submits a second ZK commitment for the fix.", tag: null, href: null, cta: "" },
  { step: 9, title: "Fix verified + incentive paid", description: "Admin calls verify_fix, then release_fix_incentive for the auditor-led (8B) path.", tag: "INCENTIVE #2", href: (id) => `/admin/vulnerabilities#submission-${id}`, cta: "Open Vulnerability Portal" },
  { step: 10, title: "Patch published", description: "Admin calls mark_published — the submission's lifecycle is complete on-chain.", tag: null, href: (id) => `/admin/vulnerabilities#submission-${id}`, cta: "Open Vulnerability Portal" },
  { step: 11, title: "Devices verify & install", description: "Off-chain device firmware flow — not part of this Solana devnet demo.", tag: null, href: null, cta: "" },
  { step: 12, title: "Lifecycle recorded", description: "The full history is permanently queryable from the submission + escrow PDAs above.", tag: null, href: null, cta: "" },
];

export default function DemoWalkthroughPage() {
  const { program } = useValidaProgram();
  const [submissions, setSubmissions] = useState<SubmissionAccount[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const config = await fetchConfig(program);
      if (!config) {
        setSubmissions([]);
        return;
      }
      const all = await fetchAllSubmissions(program, Number(config.submissionCount));
      setSubmissions(all);

      // Prefer a fully-published, auditor-led (8B) submission — it demonstrates
      // every step including the second ZK proof. Fall back to whatever is
      // furthest along the lifecycle.
      const published8B = all.find((s) => s.status === 6 && s.auditorLed);
      const published = all.find((s) => s.status === 6);
      const best =
        published8B ??
        published ??
        [...all].sort(
          (a, b) => lifecycleStepForSubmission(b) - lifecycleStepForSubmission(a)
        )[0];
      setSelectedId((prev) => prev ?? best?.submissionId ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load submissions.");
    } finally {
      setIsLoading(false);
    }
  }, [program]);

  useEffect(() => {
    void load();
  }, [load]);

  const sample = useMemo(
    () => submissions.find((s) => s.submissionId === selectedId) ?? null,
    [submissions, selectedId]
  );
  const currentStep = sample ? lifecycleStepForSubmission(sample) : 1;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-[#1A1A1A]/90">Demo Walkthrough</h1>
            <p className="text-[#1A1A1A]/70 font-medium mt-2">
              The full 12-step lifecycle, jump-linked to real on-chain data for a grant demo.
            </p>
          </div>
          <Button variant="outline" onClick={() => void load()} className="gap-2">
            <RefreshCw size={15} />
            Refresh
          </Button>
        </div>

        {isLoading ? (
          <Card>
            <div className="flex items-center justify-center py-12">
              <div className="h-10 w-10 rounded-full border-4 border-[#A9FD5F] border-t-transparent animate-spin" />
            </div>
          </Card>
        ) : error ? (
          <Card>
            <div className="flex items-center gap-3 py-8 justify-center text-[#1A1A1A]/60">
              <AlertTriangle size={18} />
              <p className="text-sm">{error}</p>
            </div>
          </Card>
        ) : submissions.length === 0 ? (
          <Card>
            <EmptyState
              icon={ShieldAlert}
              title="No submissions on-chain yet"
              description="Run `node scripts/seed-demo-data.cjs` from the frontend directory to create one full sample submission, or submit one manually from the Auditor portal."
              action={<Button variant="primary" onClick={() => (window.location.href = "/auditor/submit")}>Open Submit Vulnerability</Button>}
            />
          </Card>
        ) : (
          <>
            <Card title="Sample submission" subtitle="Drives every jump-link below">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#1A1A1A]/50">
                    Submission
                  </label>
                  <select
                    value={selectedId ?? ""}
                    onChange={(e) => setSelectedId(Number(e.target.value))}
                    className="bg-white border border-[#1A1A1A]/10 rounded-lg px-3 py-2 text-sm font-mono text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]/30"
                  >
                    {submissions.map((s) => (
                      <option key={s.submissionId} value={s.submissionId}>
                        #{s.submissionId} — {STATUS_LABELS[s.status]}
                        {s.status >= 4 ? (s.auditorLed ? " (8B auditor)" : " (8A internal)") : ""}
                      </option>
                    ))}
                  </select>
                  {sample && (
                    <Badge variant={STATUS_BADGE_VARIANTS[sample.status] as "success" | "warning" | "error" | "info" | "neutral"}>
                      {STATUS_LABELS[sample.status]}
                    </Badge>
                  )}
                  {sample && (
                    <a
                      href={explorerAddress(vulnPda(sample.submissionId).toBase58())}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-mono text-[#1A1A1A]/50 hover:underline flex items-center gap-1"
                    >
                      view account <ExternalLink size={11} />
                    </a>
                  )}
                </div>
                {sample && <LifecycleTimeline currentStep={currentStep} auditorLed={sample.status >= 4 ? sample.auditorLed : undefined} />}
              </div>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <StatCard icon={ShieldAlert} label="Submissions on-chain" value={submissions.length} />
              <StatCard icon={CheckCircle2} label="Fully published" value={submissions.filter((s) => s.status === 6).length} />
              <StatCard icon={CheckCircle2} label="Current step" value={`${currentStep} / 12`} trendType="up" />
            </div>

            <Card title="12-step checklist" subtitle="Jump straight to any step with the sample submission in view">
              <div className="space-y-2">
                {STEPS.map((s) => {
                  const done = s.step < currentStep;
                  const isCurrent = s.step === currentStep;
                  return (
                    <div
                      key={s.step}
                      className={`flex items-center gap-4 p-3 rounded-xl border ${
                        isCurrent
                          ? "border-purple-300 bg-purple-50"
                          : done
                            ? "border-[#A9FD5F]/40 bg-[#A9FD5F]/10"
                            : "border-[#1A1A1A]/5 bg-white"
                      }`}
                    >
                      <span
                        className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          done
                            ? "bg-[#A9FD5F] text-[#1A1A1A]"
                            : isCurrent
                              ? "bg-purple-600 text-white"
                              : "bg-[#EDEDED] text-[#1A1A1A]/40"
                        }`}
                      >
                        {s.step}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-[#1A1A1A]">{s.title}</span>
                          {s.tag && (
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                                s.tag === "INCENTIVE #1"
                                  ? "bg-blue-100 text-blue-700 border-blue-200"
                                  : "bg-emerald-100 text-emerald-700 border-emerald-200"
                              }`}
                            >
                              {s.tag}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#1A1A1A]/50 mt-0.5">{s.description}</p>
                      </div>
                      {s.href && sample && (
                        <a
                          href={s.href(sample.submissionId)}
                          className="shrink-0 text-xs font-bold text-[#1A1A1A] bg-[#EDEDED] hover:bg-[#A9FD5F] px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors"
                        >
                          {s.cta} <ArrowRight size={12} />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
