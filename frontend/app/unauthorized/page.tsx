"use client";

import React from "react";
import { useWallet } from "@/context/WalletContext";
import { ShieldX, LogOut } from "lucide-react";
import { Button } from "@/components/UI";
import { motion } from "framer-motion";
import { useToast } from "@/context/ToastContext";

export default function UnauthorizedPage() {
    const { address, disconnectWallet } = useWallet();
    const { showToast } = useToast();
    const [submittingRole, setSubmittingRole] = React.useState<"publisher" | "device" | null>(null);

    async function requestAccess(role: "publisher" | "device") {
        if (!address || submittingRole) return;
        setSubmittingRole(role);
        try {
            const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
            const response = await fetch(`${baseUrl}/api/request/${role}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    walletAddress: address,
                }),
            });
            const payload = (await response.json()) as { message?: string; error?: string };
            if (!response.ok) {
                const msg = payload.error || "Failed to submit request";
                if (msg.toLowerCase().includes("already pending")) {
                    showToast(msg, "warning");
                } else {
                    showToast(msg, "error");
                }
                return;
            }
            showToast(payload.message || "Request submitted", "success");
        } catch {
            showToast("Failed to submit request", "error");
        } finally {
            setSubmittingRole(null);
        }
    }

    return (
        <div className="min-h-screen bg-[#EDEDED] flex items-center justify-center p-6">
            <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-rose-500/50 to-transparent" />

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass-dark border border-rose-500/20 max-w-md w-full p-10 rounded-3xl text-center shadow-[0_0_50px_rgba(244,63,94,0.1)]"
            >
                <div className="bg-rose-500/10 w-20 h-20 rounded-2xl flex items-center justify-center text-rose-500 mx-auto mb-8 animate-pulse">
                    <ShieldX size={40} />
                </div>

                <h1 className="text-3xl font-bold text-[#1A1A1A] mb-4 tracking-tight">Access Restricted</h1>
                <p className="text-[#1A1A1A]/70 mb-8 leading-relaxed">
                    The wallet address <span className="text-rose-400 font-mono text-sm break-all">{address}</span> is not registered in the BPMS network. Request publisher or device access and wait for admin approval.
                </p>

                <div className="space-y-4">
                    <Button
                        onClick={() => void requestAccess("publisher")}
                        isLoading={submittingRole === "publisher"}
                        disabled={submittingRole !== null && submittingRole !== "publisher"}
                        className="w-full py-6 rounded-2xl text-base"
                    >
                        Request Publisher Access
                    </Button>
                    <Button
                        onClick={() => void requestAccess("device")}
                        isLoading={submittingRole === "device"}
                        disabled={submittingRole !== null && submittingRole !== "device"}
                        variant="outline"
                        className="w-full py-6 rounded-2xl text-base"
                    >
                        Request Device Access
                    </Button>
                    <Button
                        onClick={disconnectWallet}
                        variant="danger"
                        className="w-full py-6 rounded-2xl text-base group"
                    >
                        <LogOut className="mr-2 group-hover:-translate-x-1 transition-transform" size={18} />
                        Disconnect Wallet
                    </Button>
                    <p className="text-xs text-[#1A1A1A]/50 font-medium">Access is granted by admin after on-chain role authorization</p>
                </div>
            </motion.div>
        </div>
    );
}
