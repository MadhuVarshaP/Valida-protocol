"use client";

import React, { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StatCard, Card } from "@/components/Cards";
import { Badge, Button } from "@/components/UI";
import {
    Package,
    CheckCircle2,
    Activity,
    ExternalLink,
    PlusCircle,
    BarChart3,
    TrendingUp,
    Monitor,
    ShieldCheck
} from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import Link from "next/link";
import { apiGet } from "@/lib/api";

type Patch = {
    _id: string;
    patchId: number;
    softwareName: string;
    version: string;
    active: boolean;
    installCount?: number;
    successRate?: number;
};

type Log = {
    _id: string;
    deviceAddress: string;
    patchId: number;
    status: "success" | "failure";
    timestamp: string;
    txHash?: string;
};

type Analytics = {
    totalPatches: number;
    activePatches: number;
    successRate: number;
};

export default function PublisherDashboard() {
    const { address } = useWallet();
    const [patches, setPatches] = useState<Patch[]>([]);
    const [logs, setLogs] = useState<Log[]>([]);
    const [analytics, setAnalytics] = useState<Analytics | null>(null);
    const explorerBase = process.env.NEXT_PUBLIC_EXPLORER_BASE_URL || "https://sepolia.basescan.org";

    useEffect(() => {
        if (!address) return;
        let cancelled = false;
        async function load() {
            const [p, l, a] = await Promise.all([
                apiGet("/api/publisher/patches", address),
                apiGet("/api/publisher/logs", address),
                apiGet("/api/publisher/analytics", address)
            ]);
            if (cancelled) return;
            setPatches(((p as { patches?: Patch[] }).patches || []));
            setLogs(((l as { logs?: Log[] }).logs || []).slice(0, 6));
            setAnalytics(a as Analytics);
        }
        void load();
        return () => {
            cancelled = true;
        };
    }, [address]);

    const totalInstalls = patches.reduce((acc, p) => acc + (p.installCount || 0), 0);

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8">
                {/* Page Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-2">
                        <h1 className="text-4xl font-black text-[#1A1A1A] leading-tight tracking-tight">Publisher Terminal</h1>
                        <p className="text-[#1A1A1A]/70 font-medium">Manage your software releases and monitor endpoint distribution.</p>
                    </div>
                    <Link href="/publisher/publish">
                        <Button size="lg" className="px-8 rounded-xl font-bold gap-2">
                            <PlusCircle size={20} />
                            Publish New Version
                        </Button>
                    </Link>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard
                        icon={Package}
                        label="My Patches"
                        value={analytics?.totalPatches || 0}
                    />
                    <StatCard
                        icon={CheckCircle2}
                        label="Active Distribution"
                        value={analytics?.activePatches || 0}
                        className="border-emerald-500/10 shadow-emerald-500/5"
                    />
                    <StatCard
                        icon={Monitor}
                        label="Total Nodes"
                        value={totalInstalls.toLocaleString()}
                    />
                    <StatCard
                        icon={TrendingUp}
                        label="Avg. Reliability"
                        value={`${Math.round(analytics?.successRate || 0)}%`}
                    />
                </div>

                {/* Dashboard Content */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Recent Installations Table */}
                    <div className="lg:col-span-2 space-y-8">
                        <Card title="Distribution Flow" subtitle="Real-time installation confirmations for your software.">
                            <div className="table-container">
                                <table className="w-full">
                                    <thead>
                                        <tr>
                                            <th>Software</th>
                                            <th>Device Hash</th>
                                            <th>Integrity Status</th>
                                            <th>Timestamp</th>
                                            <th className="text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.length > 0 ? (
                                            logs.map((log) => {
                                                const patch = patches.find((p) => p.patchId === log.patchId);
                                                return (
                                                    <tr key={log._id} className="group hover:bg-white/1">
                                                        <td>
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-bold text-[#1A1A1A]">{patch?.softwareName || `Patch #${log.patchId}`}</span>
                                                                <span className="text-[10px] text-[#1A1A1A]/50 font-bold uppercase tracking-widest mt-0.5">V{patch?.version}</span>
                                                            </div>
                                                        </td>
                                                        <td className="text-xs font-mono text-[#1A1A1A]/70">
                                                            {log.deviceAddress.slice(0, 10)}...{log.deviceAddress.slice(-8)}
                                                        </td>
                                                        <td>
                                                            <Badge variant={log.status === "success" ? "success" : "error"}>
                                                                {log.status}
                                                            </Badge>
                                                        </td>
                                                        <td className="text-xs text-[#1A1A1A]/50 font-mono">
                                                            {new Date(log.timestamp).toLocaleString()}
                                                        </td>
                                                        <td className="text-right">
                                                            {log.txHash ? (
                                                                <a
                                                                    href={`${explorerBase.replace(/\/$/, "")}/tx/${log.txHash}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="p-2 text-slate-600 hover:text-[#1A1A1A] transition-colors inline-flex"
                                                                >
                                                                    <ExternalLink size={16} />
                                                                </a>
                                                            ) : (
                                                                <span className="p-2 text-slate-700 inline-flex">
                                                                    <ExternalLink size={16} />
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan={5} className="py-20 text-center">
                                                    <div className="flex flex-col items-center gap-4 py-8">
                                                        <Activity size={32} className="text-slate-700" />
                                                        <p className="text-[#1A1A1A]/50 font-bold uppercase tracking-widest text-xs">No Recent Distribution Events</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <Link href="/publisher/patches">
                                <button className="w-full py-4 mt-6 text-xs font-black uppercase tracking-widest text-[#1A1A1A]/50 hover:text-[#1A1A1A] border-t border-[#1A1A1A]/5 transition-all">
                                    Access Version History
                                </button>
                            </Link>
                        </Card>
                    </div>

                    {/* Adoption Chart Placeholder & Patch Breakdown */}
                    <div className="space-y-6">
                        <Card title="Version Performance" className="border-blue-500/10 shadow-blue-500/5">
                            <div className="space-y-6">
                                {patches.slice(0, 3).map((patch, i) => (
                                    <div key={i} className="space-y-2">
                                        <div className="flex justify-between items-center text-xs font-black uppercase tracking-tighter">
                                            <span className="text-[#1A1A1A]/70">{patch.softwareName} <span className="text-slate-600 font-bold ml-1">{patch.version}</span></span>
                                            <span className="text-blue-500">{Math.round(patch.successRate || 0)}% OK</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-white rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${patch.successRate || 0}%` }} />
                                        </div>
                                    </div>
                                ))}

                                <div className="pt-4 border-t border-[#1A1A1A]/5">
                                    <Link href="/publisher/analytics">
                                        <div className="p-4 bg-[#A9FD5F]/30 border border-emerald-500/10 rounded-2xl flex items-center justify-between group cursor-pointer hover:bg-[#A9FD5F] transition-all">
                                            <div className="flex items-center gap-4">
                                                <BarChart3 size={20} className="text-[#1A1A1A]" />
                                                <h4 className="text-xs font-bold text-[#1A1A1A] tracking-widest uppercase">Deep Analytics</h4>
                                            </div>
                                            <TrendingUp size={16} className="text-[#1A1A1A] opacity-40 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                                        </div>
                                    </Link>
                                </div>
                            </div>
                        </Card>

                        <div className="glass-dark p-6 rounded-2xl border border-[#1A1A1A]/5 space-y-4">
                            <div>
                                <h4 className="font-bold text-[#1A1A1A] tracking-tight flex items-center gap-2">
                                    <ShieldCheck size={16} className="text-[#1A1A1A]" />
                                    Identity Protocol
                                </h4>
                                <p className="text-xs font-medium text-[#1A1A1A]/50 mt-1 leading-relaxed">Your wallet hash is registered as an AUTHORIZED artifact signer.</p>
                            </div>
                            <div className="bg-white border border-[#1A1A1A]/5 p-3 rounded-xl font-mono text-[10px] text-[#1A1A1A]/70 truncate">
                                {address}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
