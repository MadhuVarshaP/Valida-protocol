"use client";

import React, { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, StatCard } from "@/components/Cards";
import { Badge, Button, EmptyState } from "@/components/UI";
import { FormInput } from "@/components/Forms";
import { getContractWithSigner } from "@/lib/ethers";
import { BrowserProvider, Contract, isAddress, parseEther } from "ethers";
import {
    vulnContractAbi,
    getVulnContractAddress,
    parseSubmissionFull,
    TEMPLATE_TYPES,
    SEVERITIES,
    STATUS_LABELS,
    STATUS_BADGE_VARIANTS,
    FullVulnSubmission,
} from "@/lib/vulnerabilityContractAbi";
import {
    escrowContractAbi,
    getEscrowContractAddress,
    parseEscrowRecord,
    EscrowRecord,
} from "@/lib/escrowContractAbi";
import {
    ShieldAlert,
    CheckCircle2,
    XCircle,
    Clock,
    ExternalLink,
    RefreshCw,
    UserPlus,
    AlertTriangle,
    Eye,
    Wrench,
    BadgeDollarSign,
    FlaskConical,
    ShieldX,
    ShieldCheck,
    Zap,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

const explorerBase = process.env.NEXT_PUBLIC_EXPLORER_BASE_URL ?? "https://explorer-testnet.iopn.io";

function templateLabel(t: number) { return TEMPLATE_TYPES.find(x => x.value === t)?.label ?? `Type ${t}`; }
function severityBadgeClass(s: number) { return SEVERITIES.find(x => x.value === s)?.badgeClass ?? ""; }
function severityLabel(s: number) { return SEVERITIES.find(x => x.value === s)?.label ?? `Severity ${s}`; }

type TxFeedback = { submissionId: number; action: string; txHash: string } | null;
type ActionLoading = { submissionId: number; action: string } | null;

export default function AdminVulnerabilitiesPage() {
    const [submissions, setSubmissions] = useState<FullVulnSubmission[]>([]);
    const [escrowRecords, setEscrowRecords] = useState<Record<number, EscrowRecord>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [contractError, setContractError] = useState<string | null>(null);
    const [txFeedback, setTxFeedback] = useState<TxFeedback>(null);
    const [actionLoading, setActionLoading] = useState<ActionLoading>(null);

    const [auditorAddress, setAuditorAddress] = useState("");
    const [registerLoading, setRegisterLoading] = useState(false);
    const [registerError, setRegisterError] = useState<string | null>(null);
    const [registerTx, setRegisterTx] = useState<string | null>(null);

    const loadSubmissions = useCallback(async () => {
        setIsLoading(true);
        setContractError(null);
        try {
            const vulnAddress = getVulnContractAddress();
            const escrowAddress = getEscrowContractAddress();
            const eth = (window as unknown as { ethereum?: object }).ethereum;
            if (!eth) throw new Error("No wallet provider");
            const provider = new BrowserProvider(eth as Parameters<typeof BrowserProvider>[0]);
            const vulnContract = new Contract(vulnAddress, vulnContractAbi, provider);
            const escrowContract = new Contract(escrowAddress, escrowContractAbi, provider);

            const count = Number(await vulnContract.submissionCount());
            const all: FullVulnSubmission[] = [];
            const records: Record<number, EscrowRecord> = {};

            for (let i = 1; i <= count; i++) {
                const raw = await vulnContract.getSubmissionFull(i);
                all.push(parseSubmissionFull(raw));
                try {
                    const escrowRaw = await escrowContract.getEscrowRecord(i);
                    records[i] = parseEscrowRecord(escrowRaw);
                } catch { /* escrow record may not exist yet */ }
            }
            setSubmissions(all.reverse());
            setEscrowRecords(records);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setContractError(msg.includes("VULN_CONTRACT_ADDRESS") ? "Contract not configured." : "Failed to load submissions.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { void loadSubmissions(); }, [loadSubmissions]);

    const runAction = async (
        submissionId: number,
        action: string,
        contractFn: () => Promise<{ wait: () => Promise<{ hash?: string } | null>; hash: string }>
    ) => {
        setActionLoading({ submissionId, action });
        try {
            const tx = await contractFn();
            const receipt = await tx.wait();
            setTxFeedback({ submissionId, action, txHash: receipt?.hash ?? tx.hash });
            await loadSubmissions();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            alert(msg.includes("user rejected") ? "Transaction rejected." : `Failed: ${msg}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleVerify = (id: number) =>
        runAction(id, "verify", async () => {
            const c = await getContractWithSigner(getVulnContractAddress(), vulnContractAbi);
            return c.verifySubmission(id);
        });

    const handleReject = (id: number) =>
        runAction(id, "reject", async () => {
            const c = await getContractWithSigner(getVulnContractAddress(), vulnContractAbi);
            return c.rejectSubmission(id);
        });

    const handleReleaseBounty = (id: number, bountyEth: string) =>
        runAction(id, "release-bounty", async () => {
            const escrowAddr = getEscrowContractAddress();
            const c = await getContractWithSigner(escrowAddr, escrowContractAbi);
            // Set bounty amount then release in sequence
            const amountWei = parseEther(bountyEth || "0");
            await (await c.setBountyAmount(id, amountWei)).wait();
            return c.releaseBounty(id);
        });

    const handleSlash = (id: number) =>
        runAction(id, "slash", async () => {
            const c = await getContractWithSigner(getEscrowContractAddress(), escrowContractAbi);
            return c.slash(id);
        });

    const handleSkipFixIncentive = (id: number) =>
        runAction(id, "skip-incentive", async () => {
            const c = await getContractWithSigner(getEscrowContractAddress(), escrowContractAbi);
            return c.skipFixIncentive(id);
        });

    const handleDecideResolution = (id: number, auditorLed: boolean) =>
        runAction(id, auditorLed ? "assign-auditor" : "assign-internal", async () => {
            const c = await getContractWithSigner(getVulnContractAddress(), vulnContractAbi);
            return c.decideResolution(id, auditorLed);
        });

    const handleMarkFixVerified = (id: number) =>
        runAction(id, "fix-verified", async () => {
            const c = await getContractWithSigner(getVulnContractAddress(), vulnContractAbi);
            return c.markFixVerified(id);
        });

    const handleReleaseFixIncentive = (id: number, bountyEth: string) =>
        runAction(id, "fix-incentive", async () => {
            const escrowAddr = getEscrowContractAddress();
            const c = await getContractWithSigner(escrowAddr, escrowContractAbi);
            const amountWei = parseEther(bountyEth || "0");
            await (await c.setFixIncentiveAmount(id, amountWei)).wait();
            return c.releaseFixIncentive(id);
        });

    const handleRegisterAuditor = async (e: React.FormEvent) => {
        e.preventDefault();
        setRegisterError(null);
        if (!isAddress(auditorAddress.trim())) { setRegisterError("Invalid Ethereum address."); return; }
        setRegisterLoading(true);
        try {
            const c = await getContractWithSigner(getVulnContractAddress(), vulnContractAbi);
            const tx = await c.registerAuditor(auditorAddress.trim());
            const receipt = await tx.wait();
            setRegisterTx(receipt?.hash ?? tx.hash);
            setAuditorAddress("");
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setRegisterError(msg.includes("user rejected") ? "Transaction rejected." : `Failed: ${msg}`);
        } finally {
            setRegisterLoading(false);
        }
    };

    const isActionLoading = (id: number, action: string) =>
        actionLoading?.submissionId === id && actionLoading.action === action;

    const pending = submissions.filter(s => s.status === 0).length;
    const verified = submissions.filter(s => s.status === 1).length;
    const inProgress = submissions.filter(s => s.status === 4).length;

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-4xl font-black tracking-tight text-[#1A1A1A]/90">Vulnerability Portal</h1>
                        <p className="text-[#1A1A1A]/70 font-medium mt-2">
                            Review, verify, and manage all incoming security vulnerability reports.
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
                            <a href={`${explorerBase}/tx/${txFeedback.txHash}`} target="_blank" rel="noreferrer"
                                className="text-xs font-mono text-[#1A1A1A]/60 flex items-center gap-1 mt-0.5 hover:underline">
                                {txFeedback.txHash.slice(0, 26)}... <ExternalLink size={11} />
                            </a>
                        </div>
                        <button onClick={() => setTxFeedback(null)} className="text-[#1A1A1A]/40 hover:text-[#1A1A1A] text-xs">✕</button>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2">
                        <Card title="Incoming Reports" subtitle="All vulnerability submissions from registered auditors">
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
                                <EmptyState icon={ShieldAlert} title="No reports yet" description="Registered auditors can submit vulnerability reports from the Auditor portal." />
                            ) : (
                                <div className="space-y-4">
                                    {submissions.map(sub => (
                                        <SubmissionRow
                                            key={sub.id}
                                            sub={sub}
                                            escrowRecord={escrowRecords[sub.id] ?? null}
                                            explorerBase={explorerBase}
                                            isActionLoading={isActionLoading}
                                            onVerify={() => void handleVerify(sub.id)}
                                            onReject={() => void handleReject(sub.id)}
                                            onReleaseBounty={(eth) => void handleReleaseBounty(sub.id, eth)}
                                            onSlash={() => void handleSlash(sub.id)}
                                            onSkipFixIncentive={() => void handleSkipFixIncentive(sub.id)}
                                            onAssignInternal={() => void handleDecideResolution(sub.id, false)}
                                            onAssignAuditor={() => void handleDecideResolution(sub.id, true)}
                                            onMarkFixVerified={() => void handleMarkFixVerified(sub.id)}
                                            onReleaseFixIncentive={(eth) => void handleReleaseFixIncentive(sub.id, eth)}
                                        />
                                    ))}
                                </div>
                            )}
                        </Card>
                    </div>

                    <div className="flex flex-col gap-6">
                        <Card title="Register Auditor" subtitle="Approve a wallet as a security auditor on-chain">
                            <form onSubmit={(e) => void handleRegisterAuditor(e)} className="space-y-4">
                                <FormInput
                                    label="Auditor Wallet Address"
                                    placeholder="0x..."
                                    value={auditorAddress}
                                    onChange={e => { setAuditorAddress(e.target.value); setRegisterError(null); setRegisterTx(null); }}
                                />
                                {registerError && (
                                    <div className="flex items-center gap-2 p-3 bg-rose-50 rounded-lg border border-rose-200">
                                        <AlertTriangle size={14} className="text-rose-600 shrink-0" />
                                        <p className="text-xs text-rose-700">{registerError}</p>
                                    </div>
                                )}
                                {registerTx && (
                                    <div className="flex items-center gap-2 p-3 bg-[#A9FD5F]/20 rounded-lg border border-[#A9FD5F]">
                                        <CheckCircle2 size={14} className="text-[#1A1A1A] shrink-0" />
                                        <div>
                                            <p className="text-xs font-bold text-[#1A1A1A]">Auditor registered</p>
                                            <a href={`${explorerBase}/tx/${registerTx}`} target="_blank" rel="noreferrer"
                                                className="text-[10px] font-mono text-[#1A1A1A]/60 hover:underline flex items-center gap-1">
                                                {registerTx.slice(0, 16)}... <ExternalLink size={9} />
                                            </a>
                                        </div>
                                    </div>
                                )}
                                <Button type="submit" variant="primary" isLoading={registerLoading} className="w-full gap-2">
                                    <UserPlus size={15} />
                                    Register Auditor On-Chain
                                </Button>
                            </form>
                        </Card>

                        <Card title="Workflow Steps" subtitle="Status transition reference">
                            <div className="space-y-2 text-xs text-[#1A1A1A]/60">
                                {[
                                    { step: "Step 4", label: "Verify or Reject pending submission" },
                                    { step: "Step 5", label: "Release bounty from escrow (sets + releases)" },
                                    { step: "Step 7", label: "Auditor reveals via IPFS — commitment verified on-chain" },
                                    { step: "Step 8A/B", label: "Decide: Internal fix (skip incentive) vs Auditor fix" },
                                    { step: "Step 9", label: "Verify fix, then release fix incentive" },
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
    escrowRecord,
    explorerBase,
    isActionLoading,
    onVerify,
    onReject,
    onReleaseBounty,
    onSlash,
    onSkipFixIncentive,
    onAssignInternal,
    onAssignAuditor,
    onMarkFixVerified,
    onReleaseFixIncentive,
}: {
    sub: FullVulnSubmission;
    escrowRecord: EscrowRecord | null;
    explorerBase: string;
    isActionLoading: (id: number, action: string) => boolean;
    onVerify: () => void;
    onReject: () => void;
    onReleaseBounty: (eth: string) => void;
    onSlash: () => void;
    onSkipFixIncentive: () => void;
    onAssignInternal: () => void;
    onAssignAuditor: () => void;
    onMarkFixVerified: () => void;
    onReleaseFixIncentive: (eth: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [bountyInput, setBountyInput] = useState("0.1");
    const [incentiveInput, setIncentiveInput] = useState("0.05");

    return (
        <div className="border border-[#1A1A1A]/10 rounded-xl overflow-hidden">
            <div
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-[#EDEDED]/30 transition-colors"
                onClick={() => setExpanded(e => !e)}
            >
                <span className="font-black text-[#1A1A1A] font-mono w-8 shrink-0">#{sub.id}</span>

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
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200 uppercase">
                            FRAUD
                        </span>
                    )}
                    {sub.commitmentVerified && !sub.fraudDetected && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#A9FD5F]/30 text-[#1A1A1A] border border-[#A9FD5F] uppercase">
                            VERIFIED
                        </span>
                    )}
                    {sub.zkProofVerified && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200 uppercase">
                            ZK
                        </span>
                    )}
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border", severityBadgeClass(sub.severity))}>
                        {severityLabel(sub.severity)}
                    </span>
                    <Badge variant={STATUS_BADGE_VARIANTS[sub.status] as "success" | "warning" | "error" | "info" | "neutral"}>
                        {STATUS_LABELS[sub.status]}
                    </Badge>
                </div>
            </div>

            {expanded && (
                <div className="border-t border-[#1A1A1A]/10 p-4 space-y-4 bg-[#EDEDED]/10">
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

                        {/* Phase 3 info */}
                        {sub.commitmentVerified && (
                            <div className="p-3 bg-white rounded-lg col-span-2">
                                <p className="text-[#1A1A1A]/50 font-bold uppercase tracking-wider mb-1">Commitment</p>
                                <div className="flex items-center gap-2">
                                    <ShieldCheck size={13} className="text-[#1A1A1A] shrink-0" />
                                    <span className="text-[#1A1A1A] font-medium">Verified on-chain</span>
                                    {sub.revealedIPFSCid && (
                                        <code className="text-[10px] font-mono text-[#1A1A1A]/50 ml-auto">{sub.revealedIPFSCid.slice(0, 16)}...</code>
                                    )}
                                </div>
                            </div>
                        )}
                        {sub.fraudDetected && (
                            <div className="p-3 bg-rose-50 rounded-lg col-span-2 border border-rose-200">
                                <div className="flex items-center gap-2">
                                    <ShieldX size={13} className="text-rose-600 shrink-0" />
                                    <span className="text-rose-700 font-bold">Fraud detected — commitment mismatch. Stake auto-slashed.</span>
                                </div>
                            </div>
                        )}

                        {/* Escrow record */}
                        {escrowRecord && (
                            <div className="p-3 bg-white rounded-lg col-span-2">
                                <p className="text-[#1A1A1A]/50 font-bold uppercase tracking-wider mb-1">Escrow</p>
                                <div className="flex gap-4 text-[#1A1A1A] font-mono text-xs">
                                    <span>Staked: {escrowRecord.stakedAmount > 0n ? `${Number(escrowRecord.stakedAmount) / 1e18} ETH` : "—"}</span>
                                    <span>Bounty: {escrowRecord.bountyAmount > 0n ? `${Number(escrowRecord.bountyAmount) / 1e18} ETH` : "—"}</span>
                                    {escrowRecord.slashed && <span className="text-rose-600 font-bold">SLASHED</span>}
                                </div>
                            </div>
                        )}

                        <div className="p-3 bg-white rounded-lg col-span-2">
                            <p className="text-[#1A1A1A]/50 font-bold uppercase tracking-wider mb-1">Commitment (on-chain)</p>
                            <code className="text-[10px] font-mono text-[#1A1A1A]/60 break-all">{sub.commitment}</code>
                        </div>
                    </div>

                    {/* Actions by status */}
                    <div className="flex flex-wrap gap-2">
                        {/* Status 0 — Pending */}
                        {sub.status === 0 && (
                            <>
                                <Button variant="success" size="sm" isLoading={isActionLoading(sub.id, "verify")} onClick={onVerify} className="gap-1.5">
                                    <CheckCircle2 size={13} /> Verify
                                </Button>
                                <Button variant="danger" size="sm" isLoading={isActionLoading(sub.id, "reject")} onClick={onReject} className="gap-1.5">
                                    <XCircle size={13} /> Reject
                                </Button>
                            </>
                        )}

                        {/* Status 1 — Verified: release bounty from escrow */}
                        {sub.status === 1 && !sub.bountyPaid && (
                            <div className="w-full flex items-center gap-2">
                                <div className="flex-1">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#1A1A1A]/50 mb-1 block">Bounty amount (ETH)</label>
                                    <input
                                        type="number"
                                        step="0.001"
                                        min="0"
                                        value={bountyInput}
                                        onChange={e => setBountyInput(e.target.value)}
                                        onClick={e => e.stopPropagation()}
                                        className="w-full bg-white border border-[#1A1A1A]/10 rounded-lg px-3 py-2 text-sm font-mono text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]/30"
                                    />
                                </div>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    isLoading={isActionLoading(sub.id, "release-bounty")}
                                    onClick={() => onReleaseBounty(bountyInput)}
                                    className="gap-1.5 self-end"
                                >
                                    <BadgeDollarSign size={13} /> Release Bounty
                                </Button>
                            </div>
                        )}
                        {sub.status === 1 && sub.bountyPaid && (
                            <span className="text-xs text-[#1A1A1A]/50 italic flex items-center gap-1">
                                <CheckCircle2 size={12} /> Bounty released — waiting for auditor to reveal
                            </span>
                        )}

                        {/* Status 2 — Rejected: slash stake */}
                        {sub.status === 2 && escrowRecord && !escrowRecord.slashed && (
                            <Button
                                variant="danger"
                                size="sm"
                                isLoading={isActionLoading(sub.id, "slash")}
                                onClick={onSlash}
                                className="gap-1.5"
                            >
                                <ShieldX size={13} /> Slash Stake
                            </Button>
                        )}
                        {sub.status === 2 && escrowRecord?.slashed && (
                            <span className="text-xs text-rose-500 italic flex items-center gap-1">
                                <XCircle size={12} /> Stake slashed
                            </span>
                        )}

                        {/* Status 3 — Revealed: decide resolution path */}
                        {sub.status === 3 && (
                            <div className="w-full">
                                <p className="text-xs font-bold text-[#1A1A1A]/60 mb-2 uppercase tracking-wider">
                                    Step 7: Choose resolution path
                                </p>
                                <div className="flex gap-2">
                                    <Button variant="primary" size="sm" isLoading={isActionLoading(sub.id, "assign-internal")} onClick={onAssignInternal} className="gap-1.5">
                                        <FlaskConical size={13} /> 8A — Internal Fix
                                    </Button>
                                    <Button variant="secondary" size="sm" isLoading={isActionLoading(sub.id, "assign-auditor")} onClick={onAssignAuditor} className="gap-1.5">
                                        <Eye size={13} /> 8B — Assign to Auditor
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Status 4 — Fix In Progress */}
                        {sub.status === 4 && (
                            <div className="w-full flex flex-wrap gap-2">
                                <Button variant="secondary" size="sm" isLoading={isActionLoading(sub.id, "fix-verified")} onClick={onMarkFixVerified} className="gap-1.5">
                                    <CheckCircle2 size={13} /> Verify Fix
                                </Button>
                                <Button variant="outline" size="sm" isLoading={isActionLoading(sub.id, "skip-incentive")} onClick={onSkipFixIncentive} className="gap-1.5">
                                    <Zap size={13} /> Skip Fix Incentive (8A)
                                </Button>
                            </div>
                        )}

                        {/* Status 5 — Fix Verified: release fix incentive */}
                        {sub.status === 5 && !sub.fixIncentivePaid && (
                            <div className="w-full flex items-center gap-2">
                                <div className="flex-1">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#1A1A1A]/50 mb-1 block">Fix incentive amount (ETH)</label>
                                    <input
                                        type="number"
                                        step="0.001"
                                        min="0"
                                        value={incentiveInput}
                                        onChange={e => setIncentiveInput(e.target.value)}
                                        onClick={e => e.stopPropagation()}
                                        className="w-full bg-white border border-[#1A1A1A]/10 rounded-lg px-3 py-2 text-sm font-mono text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]/30"
                                    />
                                </div>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    isLoading={isActionLoading(sub.id, "fix-incentive")}
                                    onClick={() => onReleaseFixIncentive(incentiveInput)}
                                    className="gap-1.5 self-end"
                                >
                                    <BadgeDollarSign size={13} /> Release Fix Incentive
                                </Button>
                            </div>
                        )}
                        {sub.status === 5 && sub.fixIncentivePaid && (
                            <span className="text-xs text-[#1A1A1A]/50 italic flex items-center gap-1">
                                <CheckCircle2 size={12} /> Fix incentive released
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
