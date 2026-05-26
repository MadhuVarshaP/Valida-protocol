"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/Cards";
import { Badge, Button } from "@/components/UI";
import { Search, Activity, TrendingUp, Clock, Ban } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { apiGet } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { bpmsContractAbi } from "@/lib/contractAbi";
import { getContractWithSigner, getFrontendContractAddress } from "@/lib/ethers";

type Patch = {
    _id: string;
    patchId: number;
    softwareName: string;
    version: string;
    publisher: string;
    active: boolean;
    releaseTime: string;
    installCount: number;
    successRate: number;
};

export default function AdminPatches() {
    const { address } = useWallet();
    const { showToast } = useToast();
    const [filter, setFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [patches, setPatches] = useState<Patch[]>([]);
    const [disablingPatchId, setDisablingPatchId] = useState<number | null>(null);

    const fetchPatches = useCallback(async () => {
        if (!address) return;
        const data = await apiGet("/api/admin/patches", address);
        setPatches(((data as { patches?: Patch[] }).patches || []));
    }, [address]);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            if (!address) return;
            const data = await apiGet("/api/admin/patches", address);
            if (!cancelled) {
                setPatches(((data as { patches?: Patch[] }).patches || []));
            }
        }
        void load();
        return () => { cancelled = true; };
    }, [address]);

    async function handleDisablePatch(patch: Patch) {
        if (!address || disablingPatchId !== null || !patch.active) return;
        setDisablingPatchId(patch.patchId);
        try {
            const contractAddress = getFrontendContractAddress();
            const contract = await getContractWithSigner(contractAddress, bpmsContractAbi);
            const tx = await contract.disablePatch(patch.patchId);
            await tx.wait();

            const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
            const response = await fetch(`${baseUrl}/api/admin/disable-patch`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-wallet-address": address
                },
                body: JSON.stringify({ patchId: patch.patchId })
            });
            const payload = (await response.json()) as { error?: string };
            if (!response.ok) {
                throw new Error(payload.error || "Failed to sync patch disable");
            }

            showToast(`Patch #${patch.patchId} disabled and synced`, "success");
            await fetchPatches();
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Disable patch failed", "error");
        } finally {
            setDisablingPatchId(null);
        }
    }

    const filteredPatches = useMemo(() => patches.filter((p) => {
        if (filter === "all") return true;
        if (filter === "active") return p.active;
        if (filter === "disabled") return !p.active;
        return true;
    }).filter((p) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return p.softwareName.toLowerCase().includes(q) || String(p.patchId).includes(q);
    }), [patches, filter, search]);

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-2">
                        <h1 className="text-4xl font-black text-[#1A1A1A] leading-tight tracking-tight">Patch Inventory</h1>
                        <p className="text-[#1A1A1A]/70 font-medium">Verify software integrity and manage patch distribution across the fleet.</p>
                    </div>
                    <div className="flex gap-4">
                        <div className="relative group">
                            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1A1A1A]/50 group-focus-within:text-[#1A1A1A] transition-colors" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by ID or software..."
                                className="bg-white border border-[#1A1A1A]/5 rounded-xl px-12 py-3 text-sm focus:outline-none focus:border-[#1A1A1A]/30 w-full md:w-80 transition-all"
                            />
                        </div>
                    </div>
                </div>

                {/* Global Patch Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {[
                        { label: "Active Deployments", value: patches.filter((p) => p.active).length, color: "text-[#1A1A1A]", icon: Activity },
                        { label: "Disabled Patches", value: patches.filter((p) => !p.active).length, color: "text-rose-500", icon: Ban },
                        {
                            label: "Avg. Success",
                            value: `${patches.length ? Math.round(patches.reduce((acc, p) => acc + p.successRate, 0) / patches.length) : 0}%`,
                            color: "text-blue-500",
                            icon: TrendingUp
                        },
                        {
                            label: "New Release",
                            value: patches[0] ? new Date(patches[0].releaseTime).toLocaleDateString() : "-",
                            color: "text-amber-500",
                            icon: Clock
                        },
                    ].map((stat, i) => (
                        <div key={i} className="glass p-5 rounded-2xl border border-[#1A1A1A]/5 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] uppercase font-bold text-[#1A1A1A]/50 tracking-wider mb-2">{stat.label}</p>
                                <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
                            </div>
                            <div className="p-3 bg-white rounded-xl text-[#1A1A1A]/70">
                                <stat.icon size={20} />
                            </div>
                        </div>
                    ))}
                </div>

                {/* Filtering Tabs */}
                <div className="flex items-center gap-1 bg-[#1A1A1A]/20 w-fit p-1 rounded-xl border border-[#1A1A1A]/5">
                    {[
                        { label: "All Software", id: "all" },
                        { label: "Active Only", id: "active" },
                        { label: "Disabled", id: "disabled" },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setFilter(tab.id)}
                            className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${filter === tab.id ? "bg-white text-[#1A1A1A] shadow-lg shadow-emerald-500/10" : "text-[#1A1A1A]/50 hover:text-[#1A1A1A]/80"}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Advanced Patches Table */}
                <Card>
                    <div className="table-container">
                        <table className="w-full">
                            <thead>
                                <tr>
                                    <th>Patch ID</th>
                                    <th>Software & Version</th>
                                    <th>Publisher Address</th>
                                    <th>Distribution Status</th>
                                    <th>Total Installs / Success Rate</th>
                                    <th className="text-right">Deployment Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPatches.map((patch) => (
                                    <tr key={patch._id} className="group hover:bg-white/1">
                                        <td className="font-mono text-[#1A1A1A] text-xs font-bold">
                                            #P00{patch.patchId}
                                        </td>
                                        <td>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-[#1A1A1A] tracking-tight">{patch.softwareName}</span>
                                                <span className="text-[10px] text-[#1A1A1A]/50 font-bold uppercase tracking-widest mt-0.5">Build {patch.version}</span>
                                            </div>
                                        </td>
                                        <td className="text-xs font-mono text-[#1A1A1A]/70">
                                            {patch.publisher.slice(0, 10)}...{patch.publisher.slice(-8)}
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <div className={`h-1.5 w-1.5 rounded-full ${patch.active ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                                                <span className={`text-[11px] font-bold uppercase tracking-wider ${patch.active ? "text-[#1A1A1A]" : "text-rose-500"}`}>
                                                    {patch.active ? "Global Distribution" : "Halted & Revoked"}
                                                </span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-[#1A1A1A]/80">{patch.installCount} Nodes</span>
                                                    <span className="text-[10px] font-bold text-[#1A1A1A]">{patch.successRate}% OK</span>
                                                </div>
                                                <div className="w-24 h-1.5 bg-[#EDEDED] rounded-full overflow-hidden">
                                                    <div className="h-full bg-emerald-500" style={{ width: `${patch.successRate}%` }} />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="text-right">
                                            {patch.active ? (
                                                <Button
                                                    variant="danger"
                                                    className="min-w-28"
                                                    isLoading={disablingPatchId === patch.patchId}
                                                    disabled={disablingPatchId !== null && disablingPatchId !== patch.patchId}
                                                    onClick={() => void handleDisablePatch(patch)}
                                                >
                                                    Disable
                                                </Button>
                                            ) : (
                                                <Badge variant="error">disabled</Badge>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
        </DashboardLayout>
    );
}
