"use client";

import React, { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StatCard, Card } from "@/components/Cards";
import { Badge, Button } from "@/components/UI";
import {
  Package,
  ShieldAlert,
  CheckCircle2,
  Rocket,
  TrendingUp,
  RefreshCw,
  Coins,
} from "lucide-react";
import Link from "next/link";
import { useZyraProgram } from "@/hooks/useZyraProgram";
import { useConnection } from "@solana/wallet-adapter-react";
import { fetchConfig, type SubmissionAccount, type ProgramConfigAccount } from "@/lib/solana/zyra";
import { fetchAllSubmissions } from "@/lib/solana/zyra";
import { configPda } from "@/lib/solana/pdas";
import {
  STATUS_LABELS,
  STATUS_BADGE_VARIANTS,
  TEMPLATE_TYPES,
  LAMPORTS_PER_SOL,
  PROGRAM_ID,
  explorerAddress,
  CLUSTER,
} from "@/lib/solana/constants";
import { ExternalLink } from "lucide-react";

function templateLabel(t: number) {
  return TEMPLATE_TYPES.find((x) => x.value === t)?.label ?? `Type ${t}`;
}

function ConfigRow({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#1A1A1A]/40 mb-1">{label}</p>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 p-2 bg-[#EDEDED] rounded-lg hover:bg-[#A9FD5F]/30 transition-colors group"
      >
        <code className="text-[11px] font-mono text-[#1A1A1A] break-all flex-1">{value}</code>
        <ExternalLink size={12} className="shrink-0 text-[#1A1A1A]/40 group-hover:text-[#1A1A1A]" />
      </a>
    </div>
  );
}

function ConfigStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 bg-[#EDEDED] rounded-lg text-center">
      <p className="text-[9px] font-bold uppercase tracking-wider text-[#1A1A1A]/40">{label}</p>
      <p className="text-sm font-black text-[#1A1A1A] mt-0.5">{value}</p>
    </div>
  );
}

export default function AdminDashboard() {
  const { program } = useZyraProgram();
  const { connection } = useConnection();
  const [subs, setSubs] = useState<SubmissionAccount[]>([]);
  const [config, setConfig] = useState<ProgramConfigAccount | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [treasury, setTreasury] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const patchCount = config ? Number(config.patchCount) : 0;

  const load = useCallback(async () => {
    setIsLoading(true);
    setConfigError(null);
    try {
      const cfg = await fetchConfig(program);
      setConfig(cfg);
      if (!cfg) {
        setConfigError("ProgramConfig not found — the program is not initialized on this cluster.");
        return;
      }
      setSubs((await fetchAllSubmissions(program, Number(cfg.submissionCount))).reverse());
      setTreasury(await connection.getBalance(configPda()));
    } catch (err: unknown) {
      setConfigError(err instanceof Error ? err.message : "Failed to read ProgramConfig.");
    } finally {
      setIsLoading(false);
    }
  }, [program, connection]);

  useEffect(() => {
    void load();
  }, [load]);

  const published = subs.filter((s) => s.status === 6).length;
  const verified = subs.filter((s) => s.status >= 1 && s.status !== 2).length;
  const recent = subs.slice(0, 6);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl font-black tracking-tight text-[#1A1A1A]/90">System Overview</h1>
            <p className="text-[#1A1A1A]/70 font-medium">Zyra Protocol on Solana devnet — vulnerability disclosure and patch integrity.</p>
          </div>
          <Button variant="outline" onClick={() => void load()} className="gap-2">
            <RefreshCw size={15} /> Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          <StatCard icon={ShieldAlert} label="Submissions" value={subs.length} />
          <StatCard icon={CheckCircle2} label="Verified+" value={verified} trendType="up" />
          <StatCard icon={Rocket} label="Published" value={published} trendType="up" />
          <StatCard icon={Package} label="Patches" value={patchCount} />
          <StatCard icon={Coins} label="Treasury (SOL)" value={(treasury / LAMPORTS_PER_SOL).toFixed(3)} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <Card title="Recent Submissions" subtitle="Latest vulnerability reports on-chain">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-10 w-10 rounded-full border-4 border-[#A9FD5F] border-t-transparent animate-spin" />
                </div>
              ) : recent.length === 0 ? (
                <div className="py-10 text-center text-sm text-[#1A1A1A]/50">No submissions yet.</div>
              ) : (
                <div className="table-container">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Type</th>
                        <th>Software</th>
                        <th>Auditor</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((s) => (
                        <tr key={s.submissionId} className="group hover:bg-white/2">
                          <td className="font-bold font-mono text-[#1A1A1A]">#{s.submissionId}</td>
                          <td className="text-sm text-[#1A1A1A]/70">{templateLabel(s.templateType)}</td>
                          <td className="text-sm font-semibold text-[#1A1A1A]">{s.affectedSoftware} <span className="font-mono text-xs text-[#1A1A1A]/50">v{s.affectedVersion}</span></td>
                          <td className="text-xs font-mono text-[#1A1A1A]/50">{s.auditor.slice(0, 6)}...{s.auditor.slice(-4)}</td>
                          <td>
                            <Badge variant={STATUS_BADGE_VARIANTS[s.status] as "success" | "warning" | "error" | "info" | "neutral"}>
                              {STATUS_LABELS[s.status]}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card title="On-chain Program Config" subtitle="Live read from the deployed program account">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-8 w-8 rounded-full border-4 border-[#A9FD5F] border-t-transparent animate-spin" />
                </div>
              ) : configError ? (
                <p className="text-sm text-rose-600 py-4">{configError}</p>
              ) : config ? (
                <div className="space-y-3" data-testid="program-config">
                  <ConfigRow
                    label="Program ID"
                    value={PROGRAM_ID.toBase58()}
                    href={explorerAddress(PROGRAM_ID.toBase58())}
                  />
                  <ConfigRow
                    label="Config PDA"
                    value={configPda().toBase58()}
                    href={explorerAddress(configPda().toBase58())}
                  />
                  <ConfigRow
                    label="On-chain Admin"
                    value={config.admin.toBase58()}
                    href={explorerAddress(config.admin.toBase58())}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <ConfigStat label="Required Stake" value={`${Number(config.requiredStake) / LAMPORTS_PER_SOL} SOL`} />
                    <ConfigStat label="Submissions" value={config.submissionCount.toString()} />
                    <ConfigStat label="Patches" value={config.patchCount.toString()} />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="h-2 w-2 rounded-full bg-[#A9FD5F] animate-pulse" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#1A1A1A]/50">
                      Solana {CLUSTER} · live
                    </span>
                  </div>
                </div>
              ) : null}
            </Card>

            <Card title="Workflow Shortcuts" subtitle="Jump to the action you need">
              <div className="space-y-3">
                {[
                  { href: "/admin/vulnerabilities", label: "Vulnerability Portal", desc: "Verify, bounty, resolve, publish", icon: ShieldAlert },
                  { href: "/admin/patches", label: "Patch Inventory", desc: "Publish + verify patches", icon: Package },
                  { href: "/admin/escrow", label: "Escrow & Treasury", desc: "Stakes and payouts", icon: Coins },
                ].map((l) => (
                  <Link key={l.href} href={l.href}>
                    <div className="glass p-4 rounded-2xl border border-emerald-500/10 flex items-center justify-between group cursor-pointer hover:bg-[#A9FD5F]/30 transition-all">
                      <div>
                        <h4 className="font-bold text-[#1A1A1A] tracking-tight">{l.label}</h4>
                        <p className="text-xs text-[#1A1A1A]/50 mt-1 font-medium">{l.desc}</p>
                      </div>
                      <div className="bg-[#A9FD5F] w-10 h-10 rounded-xl flex items-center justify-center text-[#1A1A1A] group-hover:scale-110 transition-transform">
                        <l.icon size={18} />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
