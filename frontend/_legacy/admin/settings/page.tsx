"use client";

import React, { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/Cards";
import { Button } from "@/components/UI";
import {
    Globe,
    Cpu,
    Users,
    Package,
    Key,
    RefreshCw
} from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import { apiGet } from "@/lib/api";

type Metrics = {
    totalPatches: number;
    activeDevices: number;
};

type PublishersResponse = { count: number };

export default function AdminSettings() {
    const { address } = useWallet();
    const { showToast } = useToast();
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const [publisherCount, setPublisherCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);

    const loadMetrics = useCallback(async () => {
        if (!address) return;
        const [metricsRes, publishersRes] = await Promise.all([
            apiGet("/api/admin/metrics", address),
            apiGet("/api/admin/publishers", address)
        ]);
        setMetrics(metricsRes as Metrics);
        setPublisherCount((publishersRes as PublishersResponse).count || 0);
    }, [address]);

    useEffect(() => {
        if (!address) return;
        let cancelled = false;
        loadMetrics().then(() => { if (cancelled) return; });
        return () => { cancelled = true; };
    }, [address, loadMetrics]);

    async function handleSyncChain() {
        if (!address || isSyncing) return;
        setIsSyncing(true);
        try {
            const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
            const response = await fetch(`${baseUrl}/api/admin/sync-chain`, {
                method: "POST",
                headers: { "x-wallet-address": address },
            });
            const data = (await response.json()) as {
                synced?: number;
                skipped?: number;
                total?: number;
                error?: string;
            };
            if (!response.ok) throw new Error(data.error || "Sync failed");
            showToast(
                `Chain sync: ${data.synced} new, ${data.skipped} existing, ${data.total} on-chain`,
                "success"
            );
            await loadMetrics();
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Sync failed", "error");
        } finally {
            setIsSyncing(false);
        }
    }

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8">
                <div className="flex flex-col gap-2">
                    <h1 className="text-4xl font-black text-[#1A1A1A] leading-tight tracking-tighter">Network Protocol</h1>
                    <p className="text-[#1A1A1A]/70 font-medium font-inter">Global parameters and decentralized infrastructure configuration.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* System Info Section */}
                    <div className="space-y-6">
                        <Card title="Blockchain Registry" subtitle="Core contract and network binding parameters.">
                            <div className="space-y-6 pt-4">
                                <div className="p-4 bg-[#1A1A1A]/10 rounded-2xl border border-[#1A1A1A]/5 space-y-4">
                                    <div className="flex justify-between items-center">
                                        <p className="text-[10px] uppercase font-bold text-[#1A1A1A]/50 tracking-wider">Registry Contract Address</p>
                                        <span className="text-[10px] bg-[#A9FD5F] text-[#1A1A1A] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest">Verified</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Globe size={16} className="text-[#1A1A1A]/50" />
                                        <span className="text-xs font-mono text-[#1A1A1A]/80">
                                            {process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "Not configured"}
                                        </span>
                                    </div>
                                </div>
                                <Button
                                    variant="outline"
                                    className="w-full rounded-xl py-3 border-[#1A1A1A]/5 text-[#1A1A1A]/70 hover:text-[#1A1A1A] transition-all text-[11px] font-bold uppercase tracking-widest"
                                    onClick={handleSyncChain}
                                    isLoading={isSyncing}
                                >
                                    <RefreshCw size={14} className="mr-2" />
                                    Sync All Patches from Chain
                                </Button>
                            </div>
                        </Card>

                    </div>

                    {/* Role Summary & Danger Zone */}
                    <div className="space-y-6">
                        <Card title="Registry Distribution" subtitle="Active identities authorized in the PKI infrastructure.">
                            <div className="grid grid-cols-2 gap-4 mt-4">
                                {[
                                    { label: "Admin Hash", count: 1, icon: Key, color: "text-[#1A1A1A]" },
                                    { label: "Publisher Nodes", count: publisherCount, icon: Users, color: "text-blue-500" },
                                    { label: "Device Certificates", count: metrics?.activeDevices || 0, icon: Cpu, color: "text-amber-500" },
                                    { label: "Patch Records", count: metrics?.totalPatches || 0, icon: Package, color: "text-[#1A1A1A]/50" },
                                ].map((item, i) => (
                                    <div key={i} className="p-4 bg-[#1A1A1A]/10 rounded-2xl border border-[#1A1A1A]/5">
                                        <div className="flex items-center gap-3 mb-3">
                                            <item.icon size={16} className={item.color} />
                                            <p className="text-[10px] uppercase font-black text-[#1A1A1A]/50 tracking-wider font-inter">{item.label}</p>
                                        </div>
                                        <p className="text-2xl font-black text-[#1A1A1A]">{item.count}</p>
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
