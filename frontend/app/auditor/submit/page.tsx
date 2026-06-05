"use client";

import React, { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/Cards";
import { Button, Badge } from "@/components/UI";
import { FormInput } from "@/components/Forms";
import { useWallet } from "@/context/WalletContext";
import { getContractWithSigner } from "@/lib/ethers";
import {
    vulnContractAbi,
    getVulnContractAddress,
    TEMPLATE_TYPES,
    SEVERITIES,
} from "@/lib/vulnerabilityContractAbi";
import { escrowContractAbi, getEscrowContractAddress } from "@/lib/escrowContractAbi";
import {
    solidityPackedKeccak256,
    keccak256,
    toUtf8Bytes,
    hexlify,
    formatEther,
    BrowserProvider,
    Contract,
} from "ethers";
import {
    AlertTriangle,
    Download,
    ExternalLink,
    ShieldAlert,
    Coins,
    Lock,
    Hash,
    Layers,
    CheckCircle2,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

type FormState = {
    templateType: number;
    affectedSoftware: string;
    affectedVersion: string;
    severity: number;
    description: string;
    systemCodeHash: string;
};

type SubmitResult = {
    submissionId: number;
    txHash: string;
    salt: string;
    commitment: string;
    description: string;
};

const INITIAL_FORM: FormState = {
    templateType: 0,
    affectedSoftware: "",
    affectedVersion: "",
    severity: 0,
    description: "",
    systemCodeHash: "",
};

export default function AuditorSubmitPage() {
    const { address } = useWallet();
    const [form, setForm] = useState<FormState>(INITIAL_FORM);
    const [salt, setSalt] = useState<string>("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<SubmitResult | null>(null);
    const [fileDownloaded, setFileDownloaded] = useState(false);
    const [requiredStake, setRequiredStake] = useState<bigint | null>(null);
    const [stakeLoading, setStakeLoading] = useState(true);

    const explorerBase = process.env.NEXT_PUBLIC_EXPLORER_BASE_URL ?? "https://explorer-testnet.iopn.io";

    useEffect(() => {
        const saltBytes = new Uint8Array(32);
        crypto.getRandomValues(saltBytes);
        setSalt(hexlify(saltBytes));
    }, []);

    useEffect(() => {
        const fetchStake = async () => {
            try {
                const eth = (window as unknown as { ethereum?: object }).ethereum;
                if (!eth) return;
                const provider = new BrowserProvider(eth as Parameters<typeof BrowserProvider>[0]);
                const escrow = new Contract(getEscrowContractAddress(), escrowContractAbi, provider);
                const stake = await escrow.requiredStake() as bigint;
                setRequiredStake(stake);
            } catch {
                setRequiredStake(null);
            } finally {
                setStakeLoading(false);
            }
        };
        void fetchStake();
    }, []);

    const set = (field: keyof FormState) => (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => {
        setForm(prev => ({ ...prev, [field]: e.target.value }));
        if (field === "description") setFileDownloaded(false);
    };

    const commitment = useMemo(() => {
        if (!form.description.trim() || !salt) return "";
        try {
            return solidityPackedKeccak256(["string", "bytes32"], [form.description, salt]);
        } catch {
            return "";
        }
    }, [form.description, salt]);

    const computeSystemCodeHash = (input: string): string => {
        const trimmed = input.trim();
        if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) return trimmed;
        return keccak256(toUtf8Bytes(trimmed));
    };

    const buildSecretPayload = () => ({
        submissionId: "pending",
        salt,
        commitment,
        description: form.description,
        submittedAt: new Date().toISOString(),
        auditor: address,
        note: "Keep this file secret — you need it to reveal your vulnerability after admin verification.",
    });

    const downloadSecretFile = () => {
        const blob = new Blob([JSON.stringify(buildSecretPayload(), null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "vulnerability-secret-draft.json";
        a.click();
        URL.revokeObjectURL(url);
        setFileDownloaded(true);
    };

    const validate = (): string | null => {
        if (!form.templateType) return "Select a vulnerability type";
        if (!form.affectedSoftware.trim()) return "Affected software is required";
        if (!form.affectedVersion.trim()) return "Affected version is required";
        if (!form.severity) return "Select a severity level";
        if (!form.description.trim()) return "Vulnerability description is required";
        if (!form.systemCodeHash.trim()) return "System code hash is required";
        if (!fileDownloaded) return "Download your secret file before submitting";
        return null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        const validationError = validate();
        if (validationError) { setError(validationError); return; }

        setIsSubmitting(true);
        try {
            const vulnAddress = getVulnContractAddress();
            const escrowAddress = getEscrowContractAddress();

            const nonce = BigInt(Date.now()) * 1_000_000n + BigInt(Math.floor(Math.random() * 1_000_000));
            const systemCodeHash = computeSystemCodeHash(form.systemCodeHash);

            // Get next submission ID
            const eth = (window as unknown as { ethereum?: object }).ethereum;
            const provider = new BrowserProvider(eth as Parameters<typeof BrowserProvider>[0]);
            const vulnRead = new Contract(vulnAddress, vulnContractAbi, provider);
            const nextId = Number(await vulnRead.submissionCount()) + 1;

            // Step 1: Stake ETH in escrow
            const escrowContract = await getContractWithSigner(escrowAddress, escrowContractAbi);
            const stakeTx = await escrowContract.stake(nextId, { value: requiredStake ?? 0n });
            await stakeTx.wait();

            // Step 2: Submit vulnerability commitment
            const vulnContract = await getContractWithSigner(vulnAddress, vulnContractAbi);
            const tx = await vulnContract.submitVulnerability(
                commitment,
                form.templateType,
                form.severity,
                form.affectedSoftware.trim(),
                form.affectedVersion.trim(),
                nonce,
                systemCodeHash
            );
            const receipt = await tx.wait();

            let submissionId = nextId;
            if (receipt?.logs) {
                for (const log of receipt.logs) {
                    try {
                        const parsed = vulnContract.interface.parseLog(log);
                        if (parsed?.name === "VulnerabilitySubmitted") {
                            submissionId = Number(parsed.args[0]);
                            break;
                        }
                    } catch { /* skip */ }
                }
            }

            const submitResult: SubmitResult = {
                submissionId,
                txHash: receipt?.hash ?? tx.hash,
                salt,
                commitment,
                description: form.description,
            };

            // Auto-download the final JSON with the confirmed submission ID
            const finalPayload = { ...buildSecretPayload(), submissionId, txHash: submitResult.txHash };
            const blob = new Blob([JSON.stringify(finalPayload, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `vulnerability-${submissionId}.json`;
            a.click();
            URL.revokeObjectURL(url);

            if (address) {
                const stored = JSON.parse(localStorage.getItem(`vuln_submissions_${address}`) ?? "[]") as SubmitResult[];
                stored.push(submitResult);
                localStorage.setItem(`vuln_submissions_${address}`, JSON.stringify(stored));
            }

            setResult(submitResult);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg.includes("user rejected") ? "Transaction rejected by wallet." : `Transaction failed: ${msg}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (result) {
        return (
            <DashboardLayout>
                <div className="flex flex-col gap-8 max-w-2xl">
                    <div>
                        <h1 className="text-4xl font-black tracking-tight text-[#1A1A1A]/90">Submission Confirmed</h1>
                        <p className="text-[#1A1A1A]/70 font-medium mt-2">Your vulnerability has been staked and committed on-chain.</p>
                    </div>
                    <Card>
                        <div className="space-y-6">
                            <div className="flex items-start gap-4 p-5 bg-[#A9FD5F]/20 rounded-xl border-2 border-[#A9FD5F]">
                                <Download size={22} className="text-[#1A1A1A] shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-black text-[#1A1A1A]">Final secret file downloaded automatically</p>
                                    <p className="text-[#1A1A1A]/70 text-sm mt-1">
                                        <code className="bg-[#A9FD5F]/30 px-1 rounded">vulnerability-{result.submissionId}.json</code> is in your downloads folder. Keep it safe — you need it to reveal later.
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-[#EDEDED] rounded-xl">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#1A1A1A]/50">Submission ID</p>
                                    <p className="text-2xl font-black text-[#1A1A1A] mt-1">#{result.submissionId}</p>
                                </div>
                                <div className="p-4 bg-[#EDEDED] rounded-xl">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#1A1A1A]/50">Status</p>
                                    <Badge variant="neutral" className="mt-2">PENDING REVIEW</Badge>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-[#1A1A1A]/50">Transaction Hash</p>
                                <a
                                    href={`${explorerBase}/tx/${result.txHash}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-2 p-3 bg-[#EDEDED] rounded-xl hover:bg-[#A9FD5F]/30 transition-colors group"
                                >
                                    <code className="text-xs font-mono text-[#1A1A1A] break-all flex-1">{result.txHash}</code>
                                    <ExternalLink size={14} className="shrink-0 text-[#1A1A1A]/50 group-hover:text-[#1A1A1A]" />
                                </a>
                            </div>

                            <Button
                                variant="outline"
                                onClick={() => { setResult(null); setForm(INITIAL_FORM); setFileDownloaded(false); }}
                                className="w-full"
                            >
                                Submit Another Vulnerability
                            </Button>
                        </div>
                    </Card>
                </div>
            </DashboardLayout>
        );
    }

    const formIsComplete = form.description.trim().length > 0;
    const canSubmit = fileDownloaded && formIsComplete;

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8 max-w-2xl">
                <div>
                    <h1 className="text-4xl font-black tracking-tight text-[#1A1A1A]/90">Submit Vulnerability</h1>
                    <p className="text-[#1A1A1A]/70 font-medium mt-2">
                        Stake ETH, commit your vulnerability details, and download your secret key file.
                    </p>
                </div>

                {/* Staking info */}
                <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
                    <Coins size={18} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-amber-800 font-semibold text-sm">
                            Required stake:{" "}
                            {stakeLoading
                                ? "loading..."
                                : requiredStake !== null
                                    ? `${formatEther(requiredStake)} ETH`
                                    : "unavailable — check escrow contract config"}
                        </p>
                        <p className="text-amber-700 text-xs mt-1">
                            Held in escrow and returned when bounty is released after verification. Fraudulent commitments are slashed.
                        </p>
                    </div>
                </div>

                <Card>
                    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-8">

                        {/* Target System fields */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-[#1A1A1A]/40 uppercase tracking-wider">Target System</h3>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-[#1A1A1A]/70 ml-1">Vulnerability Type</label>
                                <select
                                    value={form.templateType}
                                    onChange={set("templateType")}
                                    className="w-full bg-white border border-[#1A1A1A]/10 rounded-xl px-4 py-3 text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]/30 transition-all"
                                >
                                    <option value={0} disabled>Select vulnerability type...</option>
                                    {TEMPLATE_TYPES.map(t => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <FormInput
                                    label="Affected Software"
                                    placeholder="e.g. Ubuntu, OpenSSL"
                                    value={form.affectedSoftware}
                                    onChange={set("affectedSoftware")}
                                />
                                <FormInput
                                    label="Affected Version"
                                    placeholder="e.g. 22.04, 3.0.1"
                                    value={form.affectedVersion}
                                    onChange={set("affectedVersion")}
                                />
                            </div>

                            <div className="space-y-3">
                                <label className="text-sm font-semibold text-[#1A1A1A]/70 ml-1">Severity</label>
                                <div className="flex gap-3">
                                    {SEVERITIES.map(s => (
                                        <label
                                            key={s.value}
                                            className={cn(
                                                "flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all font-semibold text-sm",
                                                form.severity === s.value
                                                    ? s.badgeClass + " border-current"
                                                    : "border-[#1A1A1A]/10 text-[#1A1A1A]/60 hover:border-[#1A1A1A]/20"
                                            )}
                                        >
                                            <input
                                                type="radio"
                                                name="severity"
                                                value={s.value}
                                                checked={form.severity === s.value}
                                                onChange={() => setForm(prev => ({ ...prev, severity: s.value }))}
                                                className="sr-only"
                                            />
                                            {s.label}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-[#1A1A1A]/70 ml-1">System Code Hash</label>
                                <input
                                    type="text"
                                    placeholder="0x... or any string (auto-hashed)"
                                    value={form.systemCodeHash}
                                    onChange={set("systemCodeHash")}
                                    className="w-full bg-white border border-[#1A1A1A]/10 rounded-xl px-4 py-3 text-[#1A1A1A] font-mono text-sm placeholder:text-[#1A1A1A]/50 focus:outline-none focus:border-[#1A1A1A]/30 transition-all"
                                />
                            </div>
                        </div>

                        {/* 3-step commitment scheme */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-[#1A1A1A]/40 uppercase tracking-wider">Commitment Scheme</h3>

                            {/* Step 1 */}
                            <div className="p-4 bg-[#EDEDED]/30 rounded-xl border border-[#1A1A1A]/10 space-y-3">
                                <div className="flex items-center gap-2">
                                    <span className="h-6 w-6 rounded-full bg-[#1A1A1A] text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
                                    <span className="text-sm font-semibold text-[#1A1A1A]">Enter your vulnerability details</span>
                                    <span className="text-[10px] bg-rose-100 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ml-auto shrink-0">
                                        SECRET
                                    </span>
                                </div>
                                <textarea
                                    rows={6}
                                    placeholder="Describe the vulnerability — steps to reproduce, impact, affected code paths, proof of concept, etc. This is never sent on-chain in plaintext."
                                    value={form.description}
                                    onChange={set("description")}
                                    className="w-full bg-white border border-[#1A1A1A]/10 rounded-xl px-4 py-3 text-[#1A1A1A] placeholder:text-[#1A1A1A]/50 focus:outline-none focus:border-[#1A1A1A]/30 transition-all resize-none"
                                />
                                <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                                    <ShieldAlert size={14} className="text-amber-600 shrink-0" />
                                    <p className="text-xs text-amber-700 font-medium">
                                        Only the keccak256 commitment hash of this description is stored on-chain.
                                    </p>
                                </div>
                            </div>

                            {/* Step 2 */}
                            <div className="p-4 bg-[#EDEDED]/30 rounded-xl border border-[#1A1A1A]/10 space-y-3">
                                <div className="flex items-center gap-2">
                                    <span className="h-6 w-6 rounded-full bg-[#1A1A1A] text-white text-xs font-bold flex items-center justify-center shrink-0">2</span>
                                    <span className="text-sm font-semibold text-[#1A1A1A]">A secret salt has been generated automatically</span>
                                </div>
                                <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-[#1A1A1A]/10">
                                    <Lock size={13} className="text-[#1A1A1A]/30 shrink-0" />
                                    <code className="text-xs font-mono text-[#1A1A1A]/50 break-all flex-1">{salt || "generating..."}</code>
                                </div>
                                <p className="text-xs text-[#1A1A1A]/40 ml-1">
                                    Random 32-byte value included in your secret file. Prevents dictionary attacks against the commitment.
                                </p>
                            </div>

                            {/* Step 3 */}
                            <div className="p-4 bg-[#EDEDED]/30 rounded-xl border border-[#1A1A1A]/10 space-y-3">
                                <div className="flex items-center gap-2">
                                    <span className="h-6 w-6 rounded-full bg-[#1A1A1A] text-white text-xs font-bold flex items-center justify-center shrink-0">3</span>
                                    <span className="text-sm font-semibold text-[#1A1A1A]">Your commitment hash (this goes on-chain)</span>
                                </div>
                                <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-[#1A1A1A]/10">
                                    <Hash size={13} className="text-[#1A1A1A]/30 shrink-0" />
                                    <code className={cn(
                                        "text-xs font-mono break-all flex-1",
                                        commitment ? "text-[#1A1A1A]/80" : "text-[#1A1A1A]/30 italic"
                                    )}>
                                        {commitment || "fill in description above to compute"}
                                    </code>
                                </div>
                                <p className="text-xs text-[#1A1A1A]/40 ml-1">
                                    <code className="bg-[#EDEDED] px-1 rounded">keccak256(abi.encodePacked(description, salt))</code>
                                </p>
                            </div>
                        </div>

                        {/* Download gate */}
                        <div className={cn(
                            "p-5 rounded-xl border-2 transition-all",
                            fileDownloaded ? "bg-[#A9FD5F]/20 border-[#A9FD5F]" : "bg-amber-50 border-amber-200"
                        )}>
                            <div className="flex items-start gap-3">
                                {fileDownloaded
                                    ? <CheckCircle2 size={20} className="text-[#1A1A1A] shrink-0 mt-0.5" />
                                    : <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                                }
                                <div className="flex-1">
                                    <p className={cn("font-bold text-sm", fileDownloaded ? "text-[#1A1A1A]" : "text-amber-800")}>
                                        {fileDownloaded
                                            ? "Secret file downloaded — submission unlocked"
                                            : "Download your secret file before submitting — you will need this to reveal"}
                                    </p>
                                    <p className={cn("text-xs mt-1", fileDownloaded ? "text-[#1A1A1A]/60" : "text-amber-700")}>
                                        {fileDownloaded
                                            ? "Keep vulnerability-secret-draft.json safe. A final file with the confirmed ID is auto-downloaded after submission."
                                            : "This file contains your description and salt. Without it you cannot reveal your vulnerability and will lose your stake."}
                                    </p>
                                </div>
                            </div>
                            {!fileDownloaded && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={downloadSecretFile}
                                    disabled={!formIsComplete}
                                    className="mt-3 gap-2 w-full"
                                >
                                    <Download size={15} />
                                    {formIsComplete ? "Download Secret File" : "Fill in description above first"}
                                </Button>
                            )}
                        </div>

                        {error && (
                            <div className="flex items-center gap-3 p-4 bg-rose-50 rounded-xl border border-rose-200">
                                <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                                <p className="text-sm text-rose-700">{error}</p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Button
                                type="submit"
                                variant="primary"
                                size="lg"
                                isLoading={isSubmitting}
                                disabled={!canSubmit}
                                className="w-full gap-2"
                            >
                                <Layers size={18} />
                                {isSubmitting
                                    ? "Staking & submitting..."
                                    : canSubmit
                                        ? `Stake ${requiredStake !== null ? formatEther(requiredStake) : "?"} ETH & Submit`
                                        : "Download secret file to enable submission"}
                            </Button>
                            {!canSubmit && !isSubmitting && (
                                <p className="text-xs text-center text-[#1A1A1A]/40">
                                    {!formIsComplete
                                        ? "Fill in the vulnerability description to continue."
                                        : "Download the secret file above to unlock submission."}
                                </p>
                            )}
                        </div>
                    </form>
                </Card>
            </div>
        </DashboardLayout>
    );
}
