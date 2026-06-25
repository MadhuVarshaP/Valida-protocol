"use client";

import React, { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, StatCard } from "@/components/Cards";
import { Button, EmptyState } from "@/components/UI";
import { useValidaProgram } from "@/hooks/useValidaProgram";
import { useConnection } from "@solana/wallet-adapter-react";
import { fetchConfig, fetchAllEscrows, type EscrowAccountView } from "@/lib/solana/valida";
import { configPda } from "@/lib/solana/pdas";
import { LAMPORTS_PER_SOL } from "@/lib/solana/constants";
import { Coins, RefreshCw, AlertTriangle, CheckCircle2, PiggyBank, ShieldX, TrendingUp } from "lucide-react";

const sol = (l: bigint | number) => (Number(l) / LAMPORTS_PER_SOL).toFixed(4);

export default function AdminEscrowPage() {
  const { program } = useValidaProgram();
  const { connection } = useConnection();
  const [records, setRecords] = useState<EscrowAccountView[]>([]);
  const [treasury, setTreasury] = useState<number>(0);
  const [requiredStake, setRequiredStake] = useState<bigint>(BigInt(0));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const config = await fetchConfig(program);
      if (!config) {
        setError("Program not initialized.");
        return;
      }
      setRequiredStake(config.requiredStake);
      const escrowMap = await fetchAllEscrows(program, Number(config.submissionCount));
      const list = Object.values(escrowMap).sort((a, b) => b.submissionId - a.submissionId);
      setRecords(list);
      setTreasury(await connection.getBalance(configPda()));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load escrow data.");
    } finally {
      setIsLoading(false);
    }
  }, [program, connection]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const totalStaked = records.reduce((sum, r) => sum + (r.stakeReturned || r.slashed ? BigInt(0) : r.stakedAmount), BigInt(0));
  const slashedCount = records.filter((r) => r.slashed).length;
  const bountyReleasedCount = records.filter((r) => r.bountyReleased).length;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-[#1A1A1A]/90">Escrow Management</h1>
            <p className="text-[#1A1A1A]/70 font-medium mt-2">
              Per-submission staking and payment records, plus the bounty treasury balance.
            </p>
          </div>
          <Button variant="outline" onClick={() => void loadData()} className="gap-2">
            <RefreshCw size={15} /> Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
          <StatCard icon={PiggyBank} label="Treasury (config)" value={`${sol(treasury)} SOL`} />
          <StatCard icon={TrendingUp} label="Active Staked" value={`${sol(totalStaked)} SOL`} />
          <StatCard icon={Coins} label="Bounties Released" value={bountyReleasedCount} />
          <StatCard icon={ShieldX} label="Slashed" value={slashedCount} />
        </div>

        <Card title="Escrow Records" subtitle="Per-submission staking and payment history">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-10 w-10 rounded-full border-4 border-[#A9FD5F] border-t-transparent animate-spin" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertTriangle size={24} className="text-[#1A1A1A]/40" />
              <p className="text-sm text-[#1A1A1A]/60 max-w-sm">{error}</p>
            </div>
          ) : records.length === 0 ? (
            <EmptyState icon={Coins} title="No escrow records" description="Records are created when auditors stake SOL on a submission." />
          ) : (
            <div className="table-container">
              <table className="w-full">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Auditor</th>
                    <th>Staked</th>
                    <th>Bounty</th>
                    <th>Fix Inc.</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((rec) => (
                    <tr key={rec.submissionId} className="hover:bg-white/2">
                      <td className="font-bold font-mono text-[#1A1A1A]">#{rec.submissionId}</td>
                      <td className="font-mono text-xs text-[#1A1A1A]/60">{rec.auditor.slice(0, 8)}...{rec.auditor.slice(-6)}</td>
                      <td className="font-mono text-sm">{sol(rec.stakedAmount)} SOL</td>
                      <td className="text-sm">
                        {rec.bountyReleased ? (
                          <span className="flex items-center gap-1 text-[#1A1A1A]"><CheckCircle2 size={12} /> {sol(rec.bountyAmount)}</span>
                        ) : (
                          <span className="text-[#1A1A1A]/30">—</span>
                        )}
                      </td>
                      <td className="text-sm">
                        {rec.fixIncentiveReleased ? (
                          <span className="flex items-center gap-1 text-[#1A1A1A]"><CheckCircle2 size={12} /> {sol(rec.fixIncentiveAmount)}</span>
                        ) : (
                          <span className="text-[#1A1A1A]/30">—</span>
                        )}
                      </td>
                      <td>
                        {rec.slashed ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">SLASHED</span>
                        ) : rec.bountyReleased ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#A9FD5F]/30 text-[#1A1A1A] border border-[#A9FD5F]">PAID</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">ACTIVE</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Pool Info" subtitle="Current program state">
          <div className="space-y-3 text-sm">
            {[
              { label: "Treasury Balance", value: `${sol(treasury)} SOL` },
              { label: "Required Stake", value: `${sol(requiredStake)} SOL` },
              { label: "Bounties Released", value: `${bountyReleasedCount} submissions` },
              { label: "Stakes Slashed", value: `${slashedCount} submissions` },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between p-2 rounded-lg hover:bg-[#EDEDED]/50">
                <span className="text-[#1A1A1A]/60">{label}</span>
                <span className="font-mono font-semibold text-[#1A1A1A]">{value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
