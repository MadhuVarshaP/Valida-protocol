"use client";

import React, { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, StatCard } from "@/components/Cards";
import { Button, EmptyState } from "@/components/UI";
import { getContractWithSigner } from "@/lib/ethers";
import { BrowserProvider, Contract, formatEther, parseEther } from "ethers";
import {
    escrowContractAbi,
    getEscrowContractAddress,
    parseEscrowRecord,
    EscrowRecord,
} from "@/lib/escrowContractAbi";
import {
    vulnContractAbi,
    getVulnContractAddress,
} from "@/lib/vulnerabilityContractAbi";
import {
    Coins,
    RefreshCw,
    AlertTriangle,
    CheckCircle2,
    ExternalLink,
    PiggyBank,
    ShieldX,
    TrendingUp,
} from "lucide-react";

const explorerBase = process.env.NEXT_PUBLIC_EXPLORER_BASE_URL ?? "https://explorer-testnet.iopn.io";

type EscrowRow = EscrowRecord & { submissionId: number };

export default function AdminEscrowPage() {
    const [records, setRecords] = useState<EscrowRow[]>([]);
    const [bountyPool, setBountyPool] = useState<bigint>(0n);
    const [contractBalance, setContractBalance] = useState<bigint>(0n);
    const [requiredStake, setRequiredStake] = useState<bigint>(0n);
    const [isLoading, setIsLoading] = useState(true);
    const [contractError, setContractError] = useState<string | null>(null);
    const [fundAmount, setFundAmount] = useState("0.5");
    const [isFunding, setIsFunding] = useState(false);
    const [fundTx, setFundTx] = useState<string | null>(null);
    const [txFeedback, setTxFeedback] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        setContractError(null);
        try {
            const escrowAddr = getEscrowContractAddress();
            const vulnAddr = getVulnContractAddress();
            const eth = (window as unknown as { ethereum?: object }).ethereum;
            if (!eth) throw new Error("No wallet provider");
            const provider = new BrowserProvider(eth as Parameters<typeof BrowserProvider>[0]);
            const escrowContract = new Contract(escrowAddr, escrowContractAbi, provider);
            const vulnContract = new Contract(vulnAddr, vulnContractAbi, provider);

            const [pool, balance, stake, count] = await Promise.all([
                escrowContract.bountyPool() as Promise<bigint>,
                escrowContract.contractBalance() as Promise<bigint>,
                escrowContract.requiredStake() as Promise<bigint>,
                vulnContract.submissionCount() as Promise<bigint>,
            ]);

            setBountyPool(pool);
            setContractBalance(balance);
            setRequiredStake(stake);

            const rows: EscrowRow[] = [];
            for (let i = 1; i <= Number(count); i++) {
                try {
                    const raw = await escrowContract.getEscrowRecord(i);
                    const rec = parseEscrowRecord(raw);
                    if (rec.auditor !== "0x0000000000000000000000000000000000000000") {
                        rows.push({ ...rec, submissionId: i });
                    }
                } catch { /* no record for this ID */ }
            }
            setRecords(rows.reverse());
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setContractError(msg.includes("ESCROW_CONTRACT_ADDRESS") ? "Escrow contract not configured." : "Failed to load escrow data.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { void loadData(); }, [loadData]);

    const handleFundPool = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsFunding(true);
        setFundTx(null);
        try {
            const c = await getContractWithSigner(getEscrowContractAddress(), escrowContractAbi);
            const tx = await c.fundBountyPool({ value: parseEther(fundAmount || "0") });
            const receipt = await tx.wait();
            setFundTx(receipt?.hash ?? tx.hash);
            await loadData();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            alert(msg.includes("user rejected") ? "Transaction rejected." : `Fund failed: ${msg}`);
        } finally {
            setIsFunding(false);
        }
    };

    const totalStaked = records.reduce((sum, r) => sum + r.stakedAmount, 0n);
    const slashedCount = records.filter(r => r.slashed).length;
    const bountyReleasedCount = records.filter(r => r.bountyReleased).length;

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-4xl font-black tracking-tight text-[#1A1A1A]/90">Escrow Management</h1>
                        <p className="text-[#1A1A1A]/70 font-medium mt-2">
                            Manage the bounty pool, staked funds, and per-submission escrow records.
                        </p>
                    </div>
                    <Button variant="outline" onClick={() => void loadData()} className="gap-2">
                        <RefreshCw size={15} />
                        Refresh
                    </Button>
                </div>

                {txFeedback && (
                    <div className="flex items-center gap-4 p-4 bg-[#A9FD5F]/20 rounded-xl border border-[#A9FD5F]">
                        <CheckCircle2 size={18} className="text-[#1A1A1A] shrink-0" />
                        <p className="text-sm font-bold text-[#1A1A1A] flex-1">{txFeedback}</p>
                        <button onClick={() => setTxFeedback(null)} className="text-[#1A1A1A]/40 hover:text-[#1A1A1A] text-xs">✕</button>
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
                    <StatCard icon={PiggyBank} label="Bounty Pool" value={`${Number(formatEther(bountyPool)).toFixed(4)} ETH`} />
                    <StatCard icon={Coins} label="Contract Balance" value={`${Number(formatEther(contractBalance)).toFixed(4)} ETH`} />
                    <StatCard icon={TrendingUp} label="Total Staked (active)" value={`${Number(formatEther(totalStaked)).toFixed(4)} ETH`} />
                    <StatCard icon={ShieldX} label="Slashed" value={slashedCount} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2">
                        <Card title="Escrow Records" subtitle="Per-submission staking and payment history">
                            {isLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <div className="h-10 w-10 rounded-full border-4 border-[#A9FD5F] border-t-transparent animate-spin" />
                                </div>
                            ) : contractError ? (
                                <div className="flex flex-col items-center gap-3 py-10 text-center">
                                    <AlertTriangle size={24} className="text-[#1A1A1A]/40" />
                                    <p className="text-sm text-[#1A1A1A]/60 max-w-sm">{contractError}</p>
                                </div>
                            ) : records.length === 0 ? (
                                <EmptyState icon={Coins} title="No escrow records" description="Records are created when auditors stake ETH on a submission." />
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
                                            {records.map(rec => (
                                                <tr key={rec.submissionId} className="hover:bg-white/2">
                                                    <td className="font-bold font-mono text-[#1A1A1A]">#{rec.submissionId}</td>
                                                    <td className="font-mono text-xs text-[#1A1A1A]/60">
                                                        {rec.auditor.slice(0, 8)}...{rec.auditor.slice(-6)}
                                                    </td>
                                                    <td className="font-mono text-sm">
                                                        {formatEther(rec.stakedAmount)} ETH
                                                    </td>
                                                    <td className="text-sm">
                                                        {rec.bountyReleased ? (
                                                            <span className="flex items-center gap-1 text-[#1A1A1A]">
                                                                <CheckCircle2 size={12} className="text-[#1A1A1A]" />
                                                                {formatEther(rec.bountyAmount)}
                                                            </span>
                                                        ) : rec.bountyAmount > 0n ? (
                                                            <span className="text-[#1A1A1A]/50">{formatEther(rec.bountyAmount)} (pending)</span>
                                                        ) : (
                                                            <span className="text-[#1A1A1A]/30">—</span>
                                                        )}
                                                    </td>
                                                    <td className="text-sm">
                                                        {rec.fixIncentiveReleased ? (
                                                            <span className="flex items-center gap-1 text-[#1A1A1A]">
                                                                <CheckCircle2 size={12} /> {formatEther(rec.fixIncentiveAmount)}
                                                            </span>
                                                        ) : rec.fixIncentiveSkipped ? (
                                                            <span className="text-[#1A1A1A]/40 text-xs italic">skipped</span>
                                                        ) : (
                                                            <span className="text-[#1A1A1A]/30">—</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {rec.slashed ? (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                                                                SLASHED
                                                            </span>
                                                        ) : rec.bountyReleased ? (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#A9FD5F]/30 text-[#1A1A1A] border border-[#A9FD5F]">
                                                                PAID
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                                                                ACTIVE
                                                            </span>
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

                    <div className="flex flex-col gap-6">
                        {/* Fund bounty pool */}
                        <Card title="Fund Bounty Pool" subtitle="Add ETH to the pool used for bounty payouts">
                            <form onSubmit={(e) => void handleFundPool(e)} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-[#1A1A1A]/70 ml-1">Amount (ETH)</label>
                                    <input
                                        type="number"
                                        step="0.001"
                                        min="0.001"
                                        value={fundAmount}
                                        onChange={e => setFundAmount(e.target.value)}
                                        className="w-full bg-white border border-[#1A1A1A]/10 rounded-xl px-4 py-3 text-[#1A1A1A] font-mono text-sm focus:outline-none focus:border-[#1A1A1A]/30 transition-all"
                                    />
                                </div>

                                {fundTx && (
                                    <div className="flex items-center gap-2 p-3 bg-[#A9FD5F]/20 rounded-lg border border-[#A9FD5F]">
                                        <CheckCircle2 size={14} className="text-[#1A1A1A] shrink-0" />
                                        <div>
                                            <p className="text-xs font-bold text-[#1A1A1A]">Pool funded</p>
                                            <a href={`${explorerBase}/tx/${fundTx}`} target="_blank" rel="noreferrer"
                                                className="text-[10px] font-mono text-[#1A1A1A]/60 hover:underline flex items-center gap-1">
                                                {fundTx.slice(0, 16)}... <ExternalLink size={9} />
                                            </a>
                                        </div>
                                    </div>
                                )}

                                <Button type="submit" variant="primary" isLoading={isFunding} className="w-full gap-2">
                                    <PiggyBank size={15} />
                                    Fund Bounty Pool
                                </Button>
                            </form>
                        </Card>

                        {/* Pool summary */}
                        <Card title="Pool Info" subtitle="Current escrow contract state">
                            <div className="space-y-3 text-sm">
                                {[
                                    { label: "Bounty Pool Available", value: `${Number(formatEther(bountyPool)).toFixed(4)} ETH` },
                                    { label: "Required Stake", value: `${Number(formatEther(requiredStake)).toFixed(4)} ETH` },
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
                </div>
            </div>
        </DashboardLayout>
    );
}
