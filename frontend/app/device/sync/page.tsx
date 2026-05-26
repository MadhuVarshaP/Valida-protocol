"use client";

import React, { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/Cards";
import { Badge, Button } from "@/components/UI";
import {
    CheckCircle2,
    XCircle,
    Loader2,
    Database,
    RefreshCw,
    Package
} from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { apiGet } from "@/lib/api";

type Log = {
    _id: string;
    patchId: number;
    status: "success" | "failure";
    timestamp: string;
};

type Stats = {
    successLogs: number;
    failureLogs: number;
    successRate: number;
    updatesAvailable: number;
    activePatchesOnRegistry: number;
};

export default function DeviceSync() {
    const { address } = useWallet();
    const [loading, setLoading] = useState(false);
    const [myLogs, setMyLogs] = useState<Log[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);

    async function refresh() {
        if (!address) return;
        setLoading(true);
        try {
            const [logData, statsData] = await Promise.all([
                apiGet("/api/device/history", address),
                apiGet("/api/device/stats", address),
            ]);
            setMyLogs(((logData as { logs?: Log[] }).logs || []).slice(0, 10));
            setStats((statsData as Stats) || null);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void refresh();
    }, [address]);

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div className="flex flex-col gap-2">
                    <h1 className="text-4xl font-black text-[#1A1A1A] leading-tight tracking-tighter">Synchronization Timeline</h1>
                    <p className="text-[#1A1A1A]/70 font-medium font-inter">
                        Real data mirror from backend history/stats endpoints used by the dashboard.
                    </p>
                    </div>
                    <Button onClick={() => void refresh()} isLoading={loading} className="gap-2">
                        <RefreshCw size={16} />
                        Refresh sync data
                    </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    <Card title="Sync Snapshot" subtitle="Calculated by backend">
                        <div className="space-y-3 pt-2 text-sm">
                            <div className="p-3 rounded-lg bg-white border border-[#1A1A1A]/10 flex items-center justify-between">
                                <span className="text-[#1A1A1A]/70">Registry patches</span>
                                <div className="flex items-center gap-2">
                                    <Package size={14} className="text-blue-400" />
                                    <span className="font-bold text-[#1A1A1A]">{stats?.activePatchesOnRegistry ?? 0}</span>
                                </div>
                            </div>
                            <div className="p-3 rounded-lg bg-white border border-[#1A1A1A]/10 flex items-center justify-between">
                                <span className="text-[#1A1A1A]/70">Updates available</span>
                                <Badge variant="warning">{stats?.updatesAvailable ?? 0}</Badge>
                            </div>
                            <div className="p-3 rounded-lg bg-white border border-[#1A1A1A]/10 flex items-center justify-between">
                                <span className="text-[#1A1A1A]/70">Success rate</span>
                                <Badge variant="success">{stats?.successRate ?? 0}%</Badge>
                            </div>
                            <div className="p-3 rounded-lg bg-white border border-[#1A1A1A]/10 flex items-center justify-between">
                                <span className="text-[#1A1A1A]/70">Failures</span>
                                <Badge variant={(stats?.failureLogs ?? 0) > 0 ? "error" : "neutral"}>
                                    {stats?.failureLogs ?? 0}
                                </Badge>
                            </div>
                        </div>
                    </Card>

                    <div className="space-y-6 lg:col-span-2">
                        <Card title="Activity Progression" subtitle="From /api/device/history" className="h-full">
                            <div className="space-y-3 relative before:absolute before:inset-y-0 before:left-3 before:w-px before:bg-[#1A1A1A]/5">
                                {loading ? (
                                    <div className="py-8 flex items-center gap-2 text-[#1A1A1A]/50">
                                        <Loader2 size={16} className="animate-spin" /> Loading history...
                                    </div>
                                ) : myLogs.length > 0 ? (
                                    <div className="space-y-6">
                                        {myLogs.slice(0, 8).map((log) => (
                                            <div key={log._id} className="flex gap-6 relative group">
                                                <div className={`w-6 h-6 rounded-full border-2 border-slate-900 flex items-center justify-center z-10 ${log.status === "success" ? "bg-emerald-500" : "bg-rose-500"}`}>
                                                    {log.status === "success" ? <CheckCircle2 size={12} className="text-[#1A1A1A]" /> : <XCircle size={12} className="text-[#1A1A1A]" />}
                                                </div>
                                                <div className="flex-1 group-hover:pl-2 transition-all">
                                                    <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest">
                                                        <span className="text-[#1A1A1A] tracking-tight">Patch #P00{log.patchId} Sync</span>
                                                        <span className="text-[10px] text-slate-600 font-mono">{new Date(log.timestamp).toLocaleString()}</span>
                                                    </div>
                                                    <p className="text-[10px] text-[#1A1A1A]/50 font-bold uppercase tracking-widest mt-1">Status: {log.status.toUpperCase()}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-[#1A1A1A]/50 py-8">No installation history yet.</p>
                                )}
                            </div>
                        </Card>

                        <div className="glass-dark p-6 rounded-2xl border border-[#1A1A1A]/5 space-y-4">
                            <div className="flex items-start gap-4">
                                <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
                                    <Database size={20} />
                                </div>
                                <div>
                                    <h4 className="text-xs font-bold text-[#1A1A1A] tracking-widest uppercase mb-1">Decentralized Storage</h4>
                                    <p className="text-[10px] font-medium text-[#1A1A1A]/50 leading-relaxed font-inter">
                                        Dashboard and sync now use the same real backend sources for consistency.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
