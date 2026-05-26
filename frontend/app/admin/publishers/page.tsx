"use client";

import React, { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/Cards";
import { Badge, Button } from "@/components/UI";
import { Modal, FormInput } from "@/components/Forms";
import { Plus, AlertCircle, ShieldCheck, Ban } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import { bpmsContractAbi } from "@/lib/contractAbi";
import { getContractWithSigner, getFrontendContractAddress } from "@/lib/ethers";

type Publisher = {
    walletAddress: string;
    role: "publisher";
    status: "active" | "revoked";
    createdAt: string;
};

export default function AdminPublishers() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [address, setAddress] = useState("");
    const [publishers, setPublishers] = useState<Publisher[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [revokingWallet, setRevokingWallet] = useState<string | null>(null);
    const { address: adminAddress } = useWallet();
    const { showToast } = useToast();

    const fetchPublishers = useCallback(async () => {
        if (!adminAddress) return;
        setIsLoading(true);
        try {
            const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
            const response = await fetch(`${baseUrl}/api/admin/publishers`, {
                headers: {
                    "x-wallet-address": adminAddress,
                },
                cache: "no-store",
            });
            const data = (await response.json()) as { publishers?: Publisher[]; error?: string };
            if (!response.ok) {
                throw new Error(data.error || "Failed to fetch publishers");
            }
            setPublishers(data.publishers || []);
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Failed to fetch publishers", "error");
        } finally {
            setIsLoading(false);
        }
    }, [adminAddress, showToast]);

    useEffect(() => {
        void fetchPublishers();
    }, [fetchPublishers]);

    async function syncAuthorizedPublisher(walletAddress: string) {
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        let lastError = "Failed to sync authorized publisher";

        for (let attempt = 1; attempt <= 4; attempt++) {
            const response = await fetch(`${baseUrl}/api/admin/authorize-publisher`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-wallet-address": adminAddress || "",
                },
                body: JSON.stringify({ walletAddress }),
            });
            const payload = (await response.json()) as { error?: string };
            if (response.ok) return;

            lastError = payload.error || lastError;
            const waitingOnChain =
                response.status === 400 &&
                typeof payload.error === "string" &&
                payload.error.toLowerCase().includes("not authorized on-chain yet");
            if (!waitingOnChain || attempt === 4) {
                throw new Error(lastError);
            }
            await new Promise((resolve) => setTimeout(resolve, 1200));
        }
    }

    async function handleAuthorizePublisher() {
        if (!adminAddress || !address || isSubmitting) return;
        setIsSubmitting(true);
        try {
            const contractAddress = getFrontendContractAddress();
            const contract = await getContractWithSigner(contractAddress, bpmsContractAbi);
            const tx = await contract.authorizePublisher(address.trim());
            await tx.wait();

            await syncAuthorizedPublisher(address.trim());
            showToast("Publisher authorized successfully", "success");
            setAddress("");
            setIsModalOpen(false);
            await fetchPublishers();
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Authorization failed", "error");
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleRevokePublisher(walletAddress: string) {
        if (!adminAddress || revokingWallet) return;
        setRevokingWallet(walletAddress);
        try {
            const contractAddress = getFrontendContractAddress();
            const contract = await getContractWithSigner(contractAddress, bpmsContractAbi);
            const tx = await contract.revokePublisher(walletAddress);
            await tx.wait();

            const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
            const response = await fetch(`${baseUrl}/api/admin/revoke-publisher`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-wallet-address": adminAddress,
                },
                body: JSON.stringify({ walletAddress }),
            });
            const payload = (await response.json()) as { error?: string };
            if (!response.ok) {
                throw new Error(payload.error || "Failed to sync publisher revocation");
            }

            showToast("Publisher revoked on-chain and synced", "success");
            await fetchPublishers();
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Revoke failed", "error");
        } finally {
            setRevokingWallet(null);
        }
    }

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-2">
                        <h1 className="text-4xl font-black text-[#1A1A1A] leading-tight tracking-tight">Publisher Network</h1>
                        <p className="text-[#1A1A1A]/70 font-medium">Authorize developers and distribute patches through cryptographical identities.</p>
                    </div>
                    <div className="flex gap-4">
                        <Button onClick={() => setIsModalOpen(true)} className="px-6 rounded-xl flex items-center gap-2 font-bold shadow-lg shadow-emerald-500/10">
                            <Plus size={18} />
                            Authorize Publisher
                        </Button>
                    </div>
                </div>

                <Card>
                    <div className="table-container">
                        <table className="w-full">
                            <thead>
                                <tr>
                                    <th>Publisher Identity</th>
                                    <th>Role</th>
                                    <th>Permission Status</th>
                                    <th>Added</th>
                                    <th className="text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={5} className="text-[#1A1A1A]/70">Loading publishers...</td>
                                    </tr>
                                ) : publishers.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="text-[#1A1A1A]/70">No authorized publishers found.</td>
                                    </tr>
                                ) : publishers.map((pub) => (
                                    <tr key={pub.walletAddress} className="group hover:bg-white/1">
                                        <td className="font-mono text-[#1A1A1A]/80 text-sm">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-[#EDEDED] flex items-center justify-center text-[#1A1A1A]/50 group-hover:bg-blue-500/10 group-hover:text-blue-500 transition-all">
                                                    <ShieldCheck size={18} />
                                                </div>
                                                <span className="font-semibold tracking-tight">
                                                    {pub.walletAddress.slice(0, 10)}...{pub.walletAddress.slice(-8)}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="text-sm font-bold text-[#1A1A1A]/80 uppercase">
                                            {pub.role}
                                        </td>
                                        <td>
                                            <Badge variant="success">
                                                {pub.status === "active" ? "authorized" : pub.status}
                                            </Badge>
                                        </td>
                                        <td className="text-xs text-[#1A1A1A]/70">
                                            {new Date(pub.createdAt).toLocaleDateString()}
                                        </td>
                                        <td className="text-right">
                                            <Button
                                                variant="danger"
                                                className="min-w-24"
                                                isLoading={revokingWallet === pub.walletAddress}
                                                disabled={Boolean(revokingWallet) && revokingWallet !== pub.walletAddress}
                                                onClick={() => void handleRevokePublisher(pub.walletAddress)}
                                            >
                                                <Ban size={14} className="mr-1" />
                                                Revoke
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>

                {/* Modal */}
                <Modal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    title="Grant Publisher Authorization"
                    footer={
                        <>
                            <Button onClick={() => setIsModalOpen(false)} variant="ghost" className="rounded-xl px-8">Discard</Button>
                            <Button
                                onClick={() => void handleAuthorizePublisher()}
                                isLoading={isSubmitting}
                                className="rounded-xl px-12"
                            >
                                Authorize Address
                            </Button>
                        </>
                    }
                >
                    <div className="space-y-6">
                        <p className="text-[#1A1A1A]/70 text-sm leading-relaxed">
                            Grant patch-publishing permissions to a new entity. They will be able to upload, sign, and distribute software updates to authorized endpoints.
                        </p>
                        <FormInput
                            label="Publisher Public Address"
                            placeholder="0x..."
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                        />
                        <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex items-start gap-4">
                            <AlertCircle size={20} className="text-amber-500 mt-1 shrink-0" />
                            <p className="text-xs text-amber-500/80 leading-relaxed font-medium">
                                Authorizing an address allows it to deploy executable code to all endpoints. Ensure the identity has been verified via hardware-based KYC.
                            </p>
                        </div>
                    </div>
                </Modal>
            </div>
        </DashboardLayout>
    );
}
