"use client";

import React, { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StatCard, Card } from "@/components/Cards";
import { Badge } from "@/components/UI";
import {
    Package,
    Cpu,
    CheckCircle2,
    XCircle,
    TrendingUp,
    Activity,
    Clock
} from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { apiGet } from "@/lib/api";
import Link from "next/link";

type Metrics = {
    totalPatches: number;
    activeDevices: number;
    totalLogs: number;
    successLogs: number;
    successRate: number;
};

type InstallationLog = {
    _id: string;
    deviceAddress: string;
    patchId: number;
    status: "success" | "failure";
    timestamp: string;
};

type PatchMeta = {
    _id: string;
    patchId: number;
    softwareName: string;
    version: string;
    releaseTime: string;
};

export default function AdminDashboard() {
    const { address } = useWallet();
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const [logs, setLogs] = useState<InstallationLog[]>([]);
    const [patches, setPatches] = useState<PatchMeta[]>([]);

    useEffect(() => {
        if (!address) return;
        let cancelled = false;

        async function load() {
            const [metricsRes, logsRes, patchesRes] = await Promise.all([
                apiGet("/api/admin/metrics", address),
                apiGet("/api/admin/logs?limit=6", address),
                apiGet("/api/admin/patches", address),
            ]);

            if (cancelled) return;
            setMetrics(metricsRes as Metrics);
            setLogs(((logsRes as { logs?: InstallationLog[] }).logs || []));
            setPatches(((patchesRes as { patches?: PatchMeta[] }).patches || []));
        }

        void load();
        return () => {
            cancelled = true;
        };
    }, [address]);

    const totalPatches = metrics?.totalPatches ?? 0;
    const activeDevices = metrics?.activeDevices ?? 0;
    const successfulInstalls = metrics?.successLogs ?? 0;
    const failedInstalls = Math.max((metrics?.totalLogs ?? 0) - successfulInstalls, 0);
    const complianceRate = Math.round((metrics?.successRate ?? 0) * 100);
    const totalEvents = metrics?.totalLogs ?? 0;
    const failureRate = totalEvents === 0 ? 0 : Math.round((failedInstalls / totalEvents) * 100);
    const latestPatch = patches[0]
        ? `${patches[0].softwareName} v${patches[0].version}`
        : "—";
    const patchById = new Map(patches.map((p) => [p.patchId, p]));

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8">
                {/* Page Header */}
                <div className="flex flex-col gap-2">
                    <h1 className="text-4xl font-black tracking-tight text-[#1A1A1A]/90">System Overview</h1>
                    <p className="text-[#1A1A1A]/70 font-medium">Global patch management and infrastructure health summary.</p>
                </div>

                {/* Stat Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                    <StatCard
                        icon={Package}
                        label="Total Patches"
                        value={totalPatches}
                    />
                    <StatCard
                        icon={Cpu}
                        label="Active Devices"
                        value={activeDevices}
                    />
                    <StatCard
                        icon={CheckCircle2}
                        label="Successful Installs"
                        value={successfulInstalls}
                        trendType="up"
                    />
                    <StatCard
                        icon={XCircle}
                        label="Failed Installs"
                        value={failedInstalls}
                        trendType="down"
                    />
                    <StatCard
                        icon={TrendingUp}
                        label="Compliance Rate"
                        value={`${complianceRate}%`}
                    />
                </div>

                {/* Main Dashboard Content */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Recent Activity Table */}
                    <div className="lg:col-span-2">
                        <Card title="Recent Network Activity" subtitle="Live feed of patch deployments across the network.">
                            <div className="table-container">
                                <table className="w-full">
                                    <thead>
                                        <tr>
                                            <th>Event Type</th>
                                            <th>Patch</th>
                                            <th>Device Address</th>
                                            <th>Status</th>
                                            <th>Timestamp</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log) => (
                                            <tr key={log._id} className="group hover:bg-white/2">
                                                <td className="font-semibold text-[#1A1A1A]/80">
                                                    <div className="flex items-center gap-2">
                                                        <Activity size={14} className="text-[#1A1A1A]" />
                                                        Patch Installation
                                                    </div>
                                                </td>
                                                <td className="text-sm text-[#1A1A1A]/80">
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold">
                                                            {patchById.get(log.patchId)?.softwareName || `Patch #${log.patchId}`}
                                                        </span>
                                                        <span className="text-[10px] text-[#1A1A1A]/50 font-mono">
                                                            v{patchById.get(log.patchId)?.version || "unknown"} · #P00{log.patchId}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="text-sm text-[#1A1A1A]/50 font-mono">
                                                    {log.deviceAddress.slice(0, 6)}...{log.deviceAddress.slice(-4)}
                                                </td>
                                                <td>
                                                    <Badge variant={log.status === "success" ? "success" : "error"}>
                                                        {log.status}
                                                    </Badge>
                                                </td>
                                                <td className="text-xs text-[#1A1A1A]/50">
                                                    <div className="flex items-center gap-1">
                                                        <Clock size={12} />
                                                        {new Date(log.timestamp).toLocaleString()}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </div>

                    {/* Right Panel: Health Summary */}
                    <div className="flex flex-col gap-6">
                        <Card title="System Health" className="border-[#1A1A1A]/10 shadow-emerald-500/5">
                            <div className="space-y-6">
                                <div className="space-y-3">
                                    <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-[#1A1A1A]/50">
                                        <span>Installation Success Rate</span>
                                        <span className="text-[#1A1A1A]">{complianceRate}%</span>
                                    </div>
                                    <div className="h-2 w-full bg-[#EDEDED] rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${complianceRate}%` }} />
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-[#1A1A1A]/50">
                                        <span>Installation Failure Rate</span>
                                        <span className="text-blue-500">{failureRate}%</span>
                                    </div>
                                    <div className="h-2 w-full bg-[#EDEDED] rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${failureRate}%` }} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#1A1A1A]/5">
                                    <div className="p-3 bg-white rounded-xl">
                                        <p className="text-[10px] uppercase font-bold text-[#1A1A1A]/50 tracking-wider">Latest Patch</p>
                                        <p className="text-sm font-bold mt-1 text-[#1A1A1A]">{latestPatch}</p>
                                    </div>
                                    <div className="p-3 bg-white rounded-xl">
                                        <p className="text-[10px] uppercase font-bold text-[#1A1A1A]/70 tracking-wider">Total Events</p>
                                        <p className="text-sm font-bold mt-1 text-[#1A1A1A]">{totalEvents}</p>
                                    </div>
                                </div>
                            </div>
                        </Card>

                        <Link href="/admin/logs">
                            <div className="glass p-6 rounded-2xl border border-emerald-500/10 flex items-center justify-between group cursor-pointer hover:bg-[#A9FD5F]/30 transition-all">
                                <div>
                                    <h4 className="font-bold text-[#1A1A1A] tracking-tight">Generate Audit Report</h4>
                                    <p className="text-xs text-[#1A1A1A]/50 mt-1 font-medium">Open logs page and export CSV.</p>
                                </div>
                                <div className="bg-[#A9FD5F] w-10 h-10 rounded-xl flex items-center justify-center text-[#1A1A1A] group-hover:scale-110 transition-transform">
                                    <TrendingUp size={18} />
                                </div>
                            </div>
                        </Link>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
