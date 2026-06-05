"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, StatCard } from "@/components/Cards";
import { Badge, Button, EmptyState } from "@/components/UI";
import { useWallet } from "@/context/WalletContext";
import { getContractWithSigner } from "@/lib/ethers";
import { BrowserProvider, Contract, solidityPackedKeccak256 } from "ethers";
import {
    vulnContractAbi,
    getVulnContractAddress,
    parseSubmission,
    TEMPLATE_TYPES,
    SEVERITIES,
    STATUS_LABELS,
    STATUS_BADGE_VARIANTS,
    VulnSubmission,
} from "@/lib/vulnerabilityContractAbi";
import { encryptAndUploadVulnerability } from "@/lib/ipfsService";
import {
    Bug,
    CheckCircle2,
    Clock,
    AlertTriangle,
    Upload,
    ExternalLink,
    RefreshCw,
    ShieldCheck,
    XCircle,
    CloudUpload,
} from "lucide-react";

const explorerBase = process.env.NEXT_PUBLIC_EXPLORER_BASE_URL ?? "https://explorer-testnet.iopn.io";

function templateLabel(t: number) { return TEMPLATE_TYPES.find(x => x.value === t)?.label ?? `Type ${t}`; }
function severityLabel(s: number) { return SEVERITIES.find(x => x.value === s)?.label ?? `Severity ${s}`; }
function severityBadgeClass(s: number) { return SEVERITIES.find(x => x.value === s)?.badgeClass ?? ""; }

type RevealPhase =
    | "idle"
    | "file-verifying"
    | "ipfs-uploading"
    | "revealing"
    | "done"
    | "error";

type RevealState = {
    submissionId: number;
    phase: RevealPhase;
    error?: string;
    txHash?: string;
    ipfsCid?: string;
};

export default function AuditorDashboardPage() {
    const { address } = useWallet();
    const [submissions, setSubmissions] = useState<VulnSubmission[]>([]);
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
            const contractAddress = getVulnContractAddress();
            const eth = (window as unknown as { ethereum?: object }).ethereum;
            if (!eth) throw new Error("No wallet provider found");
            const provider = new BrowserProvider(eth as Parameters<typeof BrowserProvider>[0]);
            const contract = new Contract(contractAddress, vulnContractAbi, provider);

            const count = Number(await contract.submissionCount());
            const mine: VulnSubmission[] = [];
            for (let i = 1; i <= count; i++) {
                const raw = await contract.getSubmission(i);
                const sub = parseSubmission(raw);
                if (sub.auditor.toLowerCase() === address.toLowerCase()) {
                    mine.push(sub);
                }
            }
            setSubmissions(mine.reverse());
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setContractError(msg.includes("VULN_CONTRACT_ADDRESS") ? "Contract not configured." : "Failed to load submissions.");
        } finally {
            setIsLoading(false);
        }
    }, [address]);

    useEffect(() => { void loadSubmissions(); }, [loadSubmissions]);

    const startReveal = (submissionId: number) => {
        activeRevealId.current = submissionId;
        setRevealState({ submissionId, phase: "idle" });
        fileInputRef.current?.click();
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || activeRevealId.current === null) return;

        const submissionId = activeRevealId.current;
        setRevealState({ submissionId, phase: "file-verifying" });

        try {
            const text = await file.text();
            const json = JSON.parse(text) as {
                submissionId: number | string;
                salt: string;
                description: string;
            };

            if (Number(json.submissionId) !== submissionId) {
                setRevealState({ submissionId, phase: "error", error: "File is for a different submission ID." });
                return;
            }

            // Verify commitment matches on-chain (Phase 3 scheme: solidityPackedKeccak256)
            const contractAddress = getVulnContractAddress();
            const eth = (window as unknown as { ethereum?: object }).ethereum;
            const provider = new BrowserProvider(eth as Parameters<typeof BrowserProvider>[0]);
            const contract = new Contract(contractAddress, vulnContractAbi, provider);
            const onChainCommitment = await contract.getSubmissionCommitment(submissionId) as string;

            const computed = solidityPackedKeccak256(
                ["string", "bytes32"],
                [json.description, json.salt]
            );

            if (computed.toLowerCase() !== onChainCommitment.toLowerCase()) {
                setRevealState({
                    submissionId,
                    phase: "error",
                    error: "Commitment mismatch — file may be corrupted or from a different submission.",
                });
                return;
            }

            // Phase 3: encrypt details and upload to IPFS
            setRevealState({ submissionId, phase: "ipfs-uploading" });
            const ipfsCid = await encryptAndUploadVulnerability(json.description, submissionId);

            // Call revealAndVerify on-chain
            setRevealState({ submissionId, phase: "revealing", ipfsCid });
            const writable = await getContractWithSigner(contractAddress, vulnContractAbi);
            const tx = await writable.revealAndVerify(submissionId, json.description, json.salt, ipfsCid);
            const receipt = await tx.wait();

            setRevealState({ submissionId, phase: "done", txHash: receipt?.hash ?? tx.hash, ipfsCid });
            await loadSubmissions();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setRevealState({
                submissionId,
                phase: "error",
                error: msg.includes("user rejected") ? "Transaction rejected." : `Reveal failed: ${msg}`,
            });
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const revealPhaseLabel: Record<RevealPhase, string> = {
        idle: "",
        "file-verifying": "Verifying commitment...",
        "ipfs-uploading": "Encrypting and uploading to IPFS...",
        revealing: "Sending reveal transaction...",
        done: "Vulnerability revealed successfully",
        error: "",
    };

    const pending = submissions.filter(s => s.status === 0).length;
    const verified = submissions.filter(s => s.status === 1).length;
    const revealed = submissions.filter(s => s.status >= 3).length;

    return (
        <DashboardLayout>
            <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => void handleFileUpload(e)}
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

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <StatCard icon={Bug} label="Total Submissions" value={submissions.length} />
                    <StatCard icon={Clock} label="Pending Review" value={pending} />
                    <StatCard icon={ShieldCheck} label="Verified / Revealed" value={verified + revealed} trendType="up" />
                </div>

                {/* Reveal progress banner */}
                {revealState && revealState.phase !== "idle" && (
                    <div className={`flex items-start gap-4 p-4 rounded-xl border ${
                        revealState.phase === "error" ? "bg-rose-50 border-rose-200" :
                        revealState.phase === "done" ? "bg-[#A9FD5F]/20 border-[#A9FD5F]" :
                        "bg-blue-50 border-blue-200"
                    }`}>
                        {["file-verifying", "ipfs-uploading", "revealing"].includes(revealState.phase) && (
                            <div className="h-5 w-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin shrink-0 mt-0.5" />
                        )}
                        {revealState.phase === "done" && <CheckCircle2 size={18} className="text-[#1A1A1A] shrink-0 mt-0.5" />}
                        {revealState.phase === "error" && <XCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />}

                        <div className="flex-1">
                            {revealState.phase !== "error" && revealState.phase !== "done" && (
                                <p className="text-sm font-semibold text-blue-800">{revealPhaseLabel[revealState.phase]}</p>
                            )}
                            {revealState.phase === "ipfs-uploading" && (
                                <p className="text-xs text-blue-600 mt-1">Encrypting details with AES-GCM and pinning to IPFS...</p>
                            )}
                            {revealState.phase === "done" && (
                                <>
                                    <p className="text-sm font-semibold text-[#1A1A1A]">{revealPhaseLabel.done}</p>
                                    {revealState.ipfsCid && (
                                        <p className="text-xs font-mono text-[#1A1A1A]/50 mt-0.5">
                                            IPFS: <code>{revealState.ipfsCid}</code>
                                        </p>
                                    )}
                                    {revealState.txHash && (
                                        <a href={`${explorerBase}/tx/${revealState.txHash}`} target="_blank" rel="noreferrer"
                                            className="text-xs font-mono text-[#1A1A1A]/60 flex items-center gap-1 mt-1 hover:underline">
                                            {revealState.txHash.slice(0, 24)}... <ExternalLink size={11} />
                                        </a>
                                    )}
                                </>
                            )}
                            {revealState.phase === "error" && (
                                <p className="text-sm font-semibold text-rose-700">{revealState.error}</p>
                            )}
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
                        <EmptyState
                            icon={Bug}
                            title="No submissions yet"
                            description="Submit your first vulnerability report to see it here."
                        />
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
                                    {submissions.map(sub => (
                                        <tr key={sub.id} className="group hover:bg-white/2">
                                            <td className="font-bold text-[#1A1A1A] font-mono">#{sub.id}</td>
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
                                                <Badge variant={STATUS_BADGE_VARIANTS[sub.status] as "success" | "warning" | "error" | "info" | "neutral"}>
                                                    {STATUS_LABELS[sub.status]}
                                                </Badge>
                                            </td>
                                            <td className="text-xs text-[#1A1A1A]/50">
                                                {new Date(sub.submittedAt * 1000).toLocaleDateString()}
                                            </td>
                                            <td>
                                                {/* Reveal action: only when Verified AND bounty paid */}
                                                {sub.status === 1 && sub.bountyPaid && (
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() => startReveal(sub.id)}
                                                        disabled={revealState?.submissionId === sub.id && ["file-verifying", "ipfs-uploading", "revealing"].includes(revealState.phase)}
                                                        className="gap-1.5"
                                                    >
                                                        <CloudUpload size={13} />
                                                        Reveal Details
                                                    </Button>
                                                )}
                                                {sub.status === 1 && !sub.bountyPaid && (
                                                    <span className="text-xs text-[#1A1A1A]/40 italic">Awaiting bounty payment</span>
                                                )}
                                                {sub.status === 0 && (
                                                    <span className="text-xs text-[#1A1A1A]/40 italic">Awaiting review</span>
                                                )}
                                                {sub.status === 2 && (
                                                    <span className="text-xs text-rose-500 font-medium">Rejected</span>
                                                )}
                                                {sub.status === 4 && (
                                                    <a href="/auditor/submit-fix" className="text-xs font-medium text-blue-600 hover:underline flex items-center gap-1">
                                                        <Upload size={11} /> Submit Fix
                                                    </a>
                                                )}
                                                {(sub.status === 3 || sub.status >= 5) && (
                                                    <span className="text-xs text-[#1A1A1A]/40 italic">
                                                        {STATUS_LABELS[sub.status]}
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
        </DashboardLayout>
    );
}
