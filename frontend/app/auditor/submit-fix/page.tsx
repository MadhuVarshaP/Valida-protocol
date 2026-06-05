"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/Cards";
import { Button, Badge, EmptyState } from "@/components/UI";
import { useWallet } from "@/context/WalletContext";
import { getContractWithSigner } from "@/lib/ethers";
import { BrowserProvider, Contract, solidityPackedKeccak256, hexlify } from "ethers";
import {
    vulnContractAbi,
    getVulnContractAddress,
    parseSubmission,
    TEMPLATE_TYPES,
    VulnSubmission,
} from "@/lib/vulnerabilityContractAbi";
import { encryptAndUploadVulnerability } from "@/lib/ipfsService";
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
    Upload,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

const explorerBase = process.env.NEXT_PUBLIC_EXPLORER_BASE_URL ?? "https://explorer-testnet.iopn.io";

function templateLabel(t: number) { return TEMPLATE_TYPES.find(x => x.value === t)?.label ?? `Type ${t}`; }

type FixPhase = "idle" | "committing" | "committed" | "revealing" | "done" | "error";

type FixState = {
    submissionId: number;
    phase: FixPhase;
    salt: string;
    commitment: string;
    description: string;
    commitTxHash?: string;
    revealTxHash?: string;
    ipfsCid?: string;
    error?: string;
    fileDownloaded: boolean;
};

type EligibleSubmission = VulnSubmission & { alreadySubmitted: boolean };

export default function AuditorSubmitFixPage() {
    const { address } = useWallet();
    const [eligible, setEligible] = useState<EligibleSubmission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [contractError, setContractError] = useState<string | null>(null);
    const [fixState, setFixState] = useState<FixState | null>(null);
    const revealFileRef = useRef<HTMLInputElement>(null);
    const activeRevealId = useRef<number | null>(null);

    const loadEligible = useCallback(async () => {
        if (!address) return;
        setIsLoading(true);
        setContractError(null);
        try {
            const contractAddress = getVulnContractAddress();
            const eth = (window as unknown as { ethereum?: object }).ethereum;
            if (!eth) throw new Error("No wallet provider");
            const provider = new BrowserProvider(eth as Parameters<typeof BrowserProvider>[0]);
            const contract = new Contract(contractAddress, vulnContractAbi, provider);

            const count = Number(await contract.submissionCount());
            const results: EligibleSubmission[] = [];

            for (let i = 1; i <= count; i++) {
                const raw = await contract.getSubmission(i);
                const sub = parseSubmission(raw);
                if (sub.auditor.toLowerCase() === address.toLowerCase() && sub.status === 4) {
                    const auditorLed = await contract.isAuditorLedFix(i) as boolean;
                    if (auditorLed) {
                        const fixSub = await contract.fixSubmissions(i);
                        const alreadySubmitted = Number(fixSub.submittedAt) > 0;
                        results.push({ ...sub, alreadySubmitted });
                    }
                }
            }
            setEligible(results);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setContractError(msg.includes("VULN_CONTRACT_ADDRESS") ? "Contract not configured." : "Failed to load assignments.");
        } finally {
            setIsLoading(false);
        }
    }, [address]);

    useEffect(() => { void loadEligible(); }, [loadEligible]);

    const initFixForm = (submissionId: number) => {
        const saltBytes = new Uint8Array(32);
        crypto.getRandomValues(saltBytes);
        const salt = hexlify(saltBytes);
        setFixState({
            submissionId,
            phase: "idle",
            salt,
            commitment: "",
            description: "",
            fileDownloaded: false,
        });
    };

    const updateDescription = (description: string) => {
        setFixState(prev => {
            if (!prev) return null;
            let commitment = "";
            try {
                if (description.trim() && prev.salt) {
                    commitment = solidityPackedKeccak256(["string", "bytes32"], [description, prev.salt]);
                }
            } catch { /* ignore */ }
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
            note: "Keep this file safe — you need it to reveal the fix details on-chain.",
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `fix-secret-${fixState.submissionId}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setFixState(prev => prev ? { ...prev, fileDownloaded: true } : null);
    };

    const handleCommit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fixState?.description.trim() || !fixState.fileDownloaded) return;

        setFixState(prev => prev ? { ...prev, phase: "committing", error: undefined } : null);
        try {
            const contractAddress = getVulnContractAddress();
            const contract = await getContractWithSigner(contractAddress, vulnContractAbi);
            const tx = await contract.submitFixCommitment(fixState.submissionId, fixState.commitment);
            const receipt = await tx.wait();
            setFixState(prev => prev ? { ...prev, phase: "committed", commitTxHash: receipt?.hash ?? tx.hash } : null);
            await loadEligible();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setFixState(prev => prev ? {
                ...prev,
                phase: "error",
                error: msg.includes("user rejected") ? "Transaction rejected." : `Commit failed: ${msg}`,
            } : null);
        }
    };

    const startReveal = (submissionId: number) => {
        activeRevealId.current = submissionId;
        revealFileRef.current?.click();
    };

    const handleRevealFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || activeRevealId.current === null) return;

        const submissionId = activeRevealId.current;
        setFixState(prev => prev ? { ...prev, phase: "revealing", error: undefined } : {
            submissionId,
            phase: "revealing",
            salt: "",
            commitment: "",
            description: "",
            fileDownloaded: true,
        });

        try {
            const text = await file.text();
            const json = JSON.parse(text) as {
                submissionId: number | string;
                salt: string;
                description: string;
                commitment: string;
            };

            if (Number(json.submissionId) !== submissionId) {
                setFixState(prev => prev ? { ...prev, phase: "error", error: "File is for a different submission ID." } : null);
                return;
            }

            // Upload encrypted fix details to IPFS
            const ipfsCid = await encryptAndUploadVulnerability(json.description, submissionId);

            // Call verifyFixCommitment on-chain
            const contractAddress = getVulnContractAddress();
            const contract = await getContractWithSigner(contractAddress, vulnContractAbi);
            const tx = await contract.verifyFixCommitment(submissionId, json.description, json.salt, ipfsCid);
            const receipt = await tx.wait();

            setFixState(prev => prev ? {
                ...prev,
                phase: "done",
                revealTxHash: receipt?.hash ?? tx.hash,
                ipfsCid,
            } : null);
            await loadEligible();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setFixState(prev => prev ? {
                ...prev,
                phase: "error",
                error: msg.includes("user rejected") ? "Transaction rejected." : `Reveal failed: ${msg}`,
            } : null);
        } finally {
            if (revealFileRef.current) revealFileRef.current.value = "";
        }
    };

    const commitment = useMemo(() => {
        if (!fixState?.description.trim() || !fixState.salt) return "";
        return fixState.commitment;
    }, [fixState?.description, fixState?.salt, fixState?.commitment]);

    return (
        <DashboardLayout>
            <input
                ref={revealFileRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => void handleRevealFile(e)}
            />

            <div className="flex flex-col gap-8 max-w-2xl">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-4xl font-black tracking-tight text-[#1A1A1A]/90">Submit Fix</h1>
                        <p className="text-[#1A1A1A]/70 font-medium mt-2">
                            Commit and reveal fix proposals for vulnerabilities assigned to you (Step 8B).
                        </p>
                    </div>
                    <Button variant="outline" onClick={() => void loadEligible()} className="gap-2">
                        <RefreshCw size={15} />
                        Refresh
                    </Button>
                </div>

                {/* Fix state banner */}
                {fixState && (fixState.phase === "done" || fixState.phase === "error") && (
                    <Card>
                        {fixState.phase === "done" ? (
                            <div className="space-y-4">
                                <div className="flex items-start gap-4 p-4 bg-[#A9FD5F]/20 rounded-xl border border-[#A9FD5F]">
                                    <CheckCircle2 size={20} className="text-[#1A1A1A] shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-black text-[#1A1A1A]">Fix revealed for #{fixState.submissionId}</p>
                                        <p className="text-sm text-[#1A1A1A]/70 mt-1">
                                            The admin will verify the fix and mark it verified before releasing the fix incentive.
                                        </p>
                                    </div>
                                </div>
                                {fixState.ipfsCid && (
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#1A1A1A]/50 mb-1">IPFS CID</p>
                                        <code className="text-xs font-mono text-[#1A1A1A]/60 break-all">{fixState.ipfsCid}</code>
                                    </div>
                                )}
                                {fixState.revealTxHash && (
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#1A1A1A]/50">Transaction</p>
                                        <a href={`${explorerBase}/tx/${fixState.revealTxHash}`} target="_blank" rel="noreferrer"
                                            className="flex items-center gap-2 p-3 bg-[#EDEDED] rounded-xl hover:bg-[#A9FD5F]/30 transition-colors group">
                                            <code className="text-xs font-mono text-[#1A1A1A] break-all flex-1">{fixState.revealTxHash}</code>
                                            <ExternalLink size={14} className="shrink-0 text-[#1A1A1A]/50 group-hover:text-[#1A1A1A]" />
                                        </a>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 p-4 bg-rose-50 rounded-xl border border-rose-200">
                                <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                                <p className="text-sm text-rose-700">{fixState.error}</p>
                            </div>
                        )}
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
                        {eligible.map(sub => (
                            <Card key={sub.id}>
                                <div className="space-y-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-lg font-black text-[#1A1A1A]">#{sub.id}</span>
                                                <span className="text-sm font-semibold text-[#1A1A1A]/60">{templateLabel(sub.templateType)}</span>
                                            </div>
                                            <p className="text-sm text-[#1A1A1A]/70 mt-1">
                                                {sub.affectedSoftware} <span className="font-mono text-xs">v{sub.affectedVersion}</span>
                                            </p>
                                        </div>
                                        {sub.alreadySubmitted ? (
                                            <Badge variant="info">COMMITTED</Badge>
                                        ) : (
                                            <Badge variant="warning">FIX IN PROGRESS</Badge>
                                        )}
                                    </div>

                                    {sub.alreadySubmitted ? (
                                        /* Committed — show reveal option */
                                        <div className="space-y-3">
                                            <p className="text-sm text-[#1A1A1A]/50 italic">
                                                Fix commitment submitted. Upload your secret file to reveal the fix details on-chain.
                                            </p>
                                            <Button
                                                variant="secondary"
                                                onClick={() => startReveal(sub.id)}
                                                disabled={fixState?.submissionId === sub.id && fixState.phase === "revealing"}
                                                className="w-full gap-2"
                                            >
                                                {fixState?.submissionId === sub.id && fixState.phase === "revealing" ? (
                                                    <>
                                                        <div className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                                        Revealing...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Upload size={15} /> Upload Secret File & Reveal Fix
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    ) : fixState?.submissionId === sub.id ? (
                                        /* Active commit form */
                                        <form onSubmit={(e) => void handleCommit(e)} className="space-y-4">
                                            {/* Step 1 */}
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
                                                    onChange={e => updateDescription(e.target.value)}
                                                    className="w-full bg-white border border-[#1A1A1A]/10 rounded-xl px-4 py-3 text-[#1A1A1A] placeholder:text-[#1A1A1A]/50 focus:outline-none focus:border-[#1A1A1A]/30 transition-all resize-none"
                                                />
                                            </div>

                                            {/* Step 2 — salt */}
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

                                            {/* Step 3 — commitment hash */}
                                            <div className="p-4 bg-[#EDEDED]/30 rounded-xl border border-[#1A1A1A]/10 space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="h-5 w-5 rounded-full bg-[#1A1A1A] text-white text-xs font-bold flex items-center justify-center shrink-0">3</span>
                                                    <span className="text-sm font-semibold text-[#1A1A1A]">Commitment hash (goes on-chain)</span>
                                                </div>
                                                <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-[#1A1A1A]/10">
                                                    <Hash size={13} className="text-[#1A1A1A]/30 shrink-0" />
                                                    <code className={cn(
                                                        "text-xs font-mono break-all flex-1",
                                                        commitment ? "text-[#1A1A1A]/80" : "text-[#1A1A1A]/30 italic"
                                                    )}>
                                                        {commitment || "fill in fix description above"}
                                                    </code>
                                                </div>
                                            </div>

                                            {/* Download gate */}
                                            <div className={cn(
                                                "p-4 rounded-xl border-2 transition-all",
                                                fixState.fileDownloaded ? "bg-[#A9FD5F]/20 border-[#A9FD5F]" : "bg-amber-50 border-amber-200"
                                            )}>
                                                <div className="flex items-start gap-3">
                                                    {fixState.fileDownloaded
                                                        ? <CheckCircle2 size={18} className="text-[#1A1A1A] shrink-0 mt-0.5" />
                                                        : <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                                                    }
                                                    <p className={cn("text-sm font-medium", fixState.fileDownloaded ? "text-[#1A1A1A]" : "text-amber-800")}>
                                                        {fixState.fileDownloaded
                                                            ? "Secret file downloaded — you can commit"
                                                            : "Download your secret file before committing"}
                                                    </p>
                                                </div>
                                                {!fixState.fileDownloaded && (
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={downloadSecretFile}
                                                        disabled={!fixState.description.trim()}
                                                        className="mt-3 gap-2 w-full"
                                                    >
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
                                                <Button
                                                    type="submit"
                                                    variant="primary"
                                                    isLoading={fixState.phase === "committing"}
                                                    disabled={!fixState.description.trim() || !fixState.fileDownloaded}
                                                    className="flex-1 gap-2"
                                                >
                                                    <CloudUpload size={15} />
                                                    Submit Fix Commitment
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    onClick={() => setFixState(null)}
                                                >
                                                    Cancel
                                                </Button>
                                            </div>
                                        </form>
                                    ) : (
                                        <Button
                                            variant="secondary"
                                            onClick={() => initFixForm(sub.id)}
                                            className="w-full gap-2"
                                        >
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
