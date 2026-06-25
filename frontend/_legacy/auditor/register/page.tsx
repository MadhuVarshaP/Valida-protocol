"use client";

import React, { useEffect, useState, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/Cards";
import { Badge } from "@/components/UI";
import { Button } from "@/components/UI";
import { useWallet } from "@/context/WalletContext";
import { BrowserProvider, Contract } from "ethers";
import { vulnContractAbi, getVulnContractAddress } from "@/lib/vulnerabilityContractAbi";
import { ShieldCheck, Copy, Clock, AlertTriangle, RefreshCw } from "lucide-react";

type RegistrationStatus = "loading" | "registered" | "pending" | "unregistered" | "no-contract";

export default function AuditorRegisterPage() {
    const { address } = useWallet();
    const [status, setStatus] = useState<RegistrationStatus>("loading");
    const [copied, setCopied] = useState(false);

    const checkStatus = useCallback(async () => {
        if (!address) return;
        setStatus("loading");

        let contractAddress: string;
        try {
            contractAddress = getVulnContractAddress();
        } catch {
            setStatus("no-contract");
            return;
        }

        if (typeof window === "undefined") return;
        try {
            const eth = (window as unknown as { ethereum?: object }).ethereum;
            if (!eth) { setStatus("unregistered"); return; }
            const provider = new BrowserProvider(eth as Parameters<typeof BrowserProvider>[0]);
            const contract = new Contract(contractAddress, vulnContractAbi, provider);
            const isRegistered = await contract.registeredAuditors(address) as boolean;
            if (isRegistered) {
                setStatus("registered");
                localStorage.removeItem(`auditor_pending_${address}`);
            } else {
                const pending = localStorage.getItem(`auditor_pending_${address}`);
                setStatus(pending ? "pending" : "unregistered");
            }
        } catch {
            setStatus("unregistered");
        }
    }, [address]);

    useEffect(() => { void checkStatus(); }, [checkStatus]);

    const copyAddress = () => {
        if (!address) return;
        void navigator.clipboard.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const markPending = () => {
        if (!address) return;
        localStorage.setItem(`auditor_pending_${address}`, "true");
        setStatus("pending");
    };

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8 max-w-2xl">
                <div>
                    <h1 className="text-4xl font-black tracking-tight text-[#1A1A1A]/90">Auditor Registration</h1>
                    <p className="text-[#1A1A1A]/70 font-medium mt-2">
                        Register your wallet as a security auditor to submit vulnerability reports on the Valida platform.
                    </p>
                </div>

                <Card>
                    {status === "loading" && (
                        <div className="flex items-center justify-center py-12">
                            <div className="h-10 w-10 rounded-full border-4 border-[#A9FD5F] border-t-transparent animate-spin" />
                        </div>
                    )}

                    {status === "no-contract" && (
                        <div className="flex flex-col items-center py-10 gap-3 text-center">
                            <div className="bg-rose-100 p-4 rounded-2xl">
                                <AlertTriangle size={28} className="text-rose-600" />
                            </div>
                            <h2 className="text-xl font-bold text-[#1A1A1A]">Contract Not Configured</h2>
                            <p className="text-sm text-[#1A1A1A]/60 max-w-sm">
                                <code className="bg-[#EDEDED] px-1.5 py-0.5 rounded text-xs">NEXT_PUBLIC_VULN_CONTRACT_ADDRESS</code> is
                                not set. Ask the admin to deploy ValidaVulnerability and configure the env variable.
                            </p>
                        </div>
                    )}

                    {status === "registered" && (
                        <div className="flex flex-col items-center py-10 gap-4 text-center">
                            <div className="bg-[#A9FD5F] p-5 rounded-2xl">
                                <ShieldCheck size={36} className="text-[#1A1A1A]" />
                            </div>
                            <h2 className="text-2xl font-black text-[#1A1A1A]">You&apos;re a Registered Auditor</h2>
                            <p className="text-[#1A1A1A]/60 max-w-sm">
                                Your wallet has been approved on-chain. You can now submit vulnerability reports.
                            </p>
                            <Badge variant="success">ACTIVE AUDITOR</Badge>
                        </div>
                    )}

                    {(status === "unregistered" || status === "pending") && (
                        <div className="space-y-6">
                            {status === "pending" ? (
                                <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
                                    <Clock size={20} className="text-blue-600 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-bold text-blue-800 text-sm">Awaiting Admin Approval</p>
                                        <p className="text-blue-700 text-sm mt-1">
                                            You&apos;ve notified the admin. Refresh this page after they approve your wallet on-chain.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-start gap-4 p-4 bg-amber-50 rounded-xl border border-amber-200">
                                    <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-bold text-amber-800 text-sm">Admin Approval Required</p>
                                        <p className="text-amber-700 text-sm mt-1">
                                            Auditor registration requires the system admin to call <code className="bg-amber-100 px-1 rounded text-xs">registerAuditor()</code> on-chain with your wallet address.
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <p className="text-sm font-semibold text-[#1A1A1A]/70 ml-1">Your Wallet Address</p>
                                <div className="flex items-center gap-3 p-4 bg-[#EDEDED] rounded-xl border border-[#1A1A1A]/10">
                                    <code className="flex-1 text-sm font-mono text-[#1A1A1A] break-all">{address}</code>
                                    <Button variant="outline" size="sm" onClick={copyAddress}>
                                        <Copy size={14} className="mr-1.5" />
                                        {copied ? "Copied!" : "Copy"}
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <p className="text-sm font-semibold text-[#1A1A1A]/70 ml-1">Registration steps</p>
                                <ol className="space-y-2.5 text-sm text-[#1A1A1A]/70">
                                    {[
                                        "Copy your wallet address above",
                                        "Share it with the system admin",
                                        "Admin calls registerAuditor() on ValidaVulnerability contract",
                                        "Refresh this page to confirm your approved status",
                                    ].map((step, i) => (
                                        <li key={i} className="flex items-center gap-3">
                                            <span className="bg-[#1A1A1A] text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">
                                                {i + 1}
                                            </span>
                                            {step}
                                        </li>
                                    ))}
                                </ol>
                            </div>

                            <div className="flex flex-col gap-3 pt-2">
                                {status === "unregistered" && (
                                    <Button variant="secondary" onClick={markPending} className="w-full">
                                        I&apos;ve notified the admin — Mark as pending
                                    </Button>
                                )}
                                <Button variant="outline" onClick={() => void checkStatus()} className="w-full gap-2">
                                    <RefreshCw size={15} />
                                    Refresh Registration Status
                                </Button>
                            </div>
                        </div>
                    )}
                </Card>
            </div>
        </DashboardLayout>
    );
}
