"use client";

import React, { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/Cards";
import {
    ShieldCheck,
    Monitor,
    TrendingDown,
    Database
} from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { apiGet } from "@/lib/api";

type Analytics = {
    totalPatches: number;
    activePatches: number;
    totalLogs: number;
    successLogs: number;
    failureLogs: number;
    successRate: number;
};

export default function PublisherAnalytics() {
    const { address } = useWallet();
    const [analytics, setAnalytics] = useState<Analytics | null>(null);

    useEffect(() => {
        if (!address) return;
        let cancelled = false;
        async function load() {
            const data = await apiGet("/api/publisher/analytics", address);
            if (!cancelled) setAnalytics(data as Analytics);
        }
        void load();
        return () => { cancelled = true; };
    }, [address]);

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8">
                <div className="flex flex-col gap-2">
                    <h1 className="text-4xl font-black text-[#1A1A1A] leading-tight tracking-tight">Deployment Intelligence</h1>
                    <p className="text-[#1A1A1A]/70 font-medium">Deep analytics and telemetry for your blockchain-verified artifacts.</p>
                </div>

                {/* Top Summary Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {[
                        { label: "Total Patches", value: analytics?.totalPatches ?? 0, icon: Monitor, color: "text-[#1A1A1A]" },
                        { label: "Active Patches", value: analytics?.activePatches ?? 0, icon: Database, color: "text-blue-500" },
                        { label: "Failures", value: analytics?.failureLogs ?? 0, icon: TrendingDown, color: "text-rose-500" },
                        { label: "Success Rate", value: `${Math.round(analytics?.successRate ?? 0)}%`, icon: ShieldCheck, color: "text-[#1A1A1A]" },
                    ].map((stat, i) => (
                        <div key={i} className="glass p-5 rounded-2xl border border-[#1A1A1A]/5 relative overflow-hidden group">
                            <div className="flex justify-between items-start mb-6">
                                <div className={`p-4 rounded-xl bg-white ${stat.color} group-hover:scale-110 transition-transform duration-500`}>
                                    <stat.icon size={22} />
                                </div>
                            </div>
                            <p className="text-[10px] uppercase font-bold text-[#1A1A1A]/50 tracking-wider mb-2 font-inter">{stat.label}</p>
                            <p className="text-3xl font-black text-[#1A1A1A]">{stat.value}</p>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 gap-8">
                    <Card title="Installation Velocity" className="min-h-[400px]">
                        <div className="p-6 space-y-3">
                            <p className="text-sm text-[#1A1A1A]/80">Total Install Reports: {analytics?.totalLogs ?? 0}</p>
                            <p className="text-sm text-[#1A1A1A]">Successful Installs: {analytics?.successLogs ?? 0}</p>
                            <p className="text-sm text-rose-500">Failed Installs: {analytics?.failureLogs ?? 0}</p>
                        </div>
                    </Card>
                </div>
            </div>
        </DashboardLayout>
    );
}
