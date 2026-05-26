"use client";

import React, { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/Cards";
import { Badge, Button } from "@/components/UI";
import {
    Search,
    Download
} from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { apiGet } from "@/lib/api";

type InstallationLog = {
    _id: string;
    deviceAddress: string;
    patchId: number;
    status: "success" | "failure";
    source?: "api" | "chain";
    timestamp: string;
};

type PatchMeta = {
    _id: string;
    patchId: number;
    softwareName: string;
    version: string;
};

export default function AdminLogs() {
    const { address } = useWallet();
    const [logs, setLogs] = useState<InstallationLog[]>([]);
    const [patches, setPatches] = useState<PatchMeta[]>([]);
    const [deviceFilter, setDeviceFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");

    useEffect(() => {
        if (!address) return;
        let cancelled = false;

        async function load() {
            const params = new URLSearchParams();
            params.set("limit", "300");
            if (deviceFilter.trim()) params.set("device", deviceFilter.trim());
            if (statusFilter !== "all") params.set("status", statusFilter);
            const [logData, patchData] = await Promise.all([
                apiGet(`/api/admin/logs?${params.toString()}`, address),
                apiGet("/api/admin/patches", address),
            ]);
            if (!cancelled) {
                setLogs(((logData as { logs?: InstallationLog[] }).logs || []));
                setPatches(((patchData as { patches?: PatchMeta[] }).patches || []));
            }
        }

        void load();
        return () => {
            cancelled = true;
        };
    }, [address, deviceFilter, statusFilter]);

    function exportCsv() {
        if (!logs.length) return;
        const patchById = new Map(patches.map((p) => [p.patchId, p]));
        const header = ["timestamp", "deviceAddress", "patchId", "softwareName", "version", "status", "source"];
        const rows = logs.map((log) => [
            new Date(log.timestamp).toISOString(),
            log.deviceAddress,
            String(log.patchId),
            patchById.get(log.patchId)?.softwareName || "",
            patchById.get(log.patchId)?.version || "",
            log.status,
            log.source || "api",
        ]);
        const csv = [header, ...rows]
            .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
            .join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `bpms-admin-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }
    const patchById = new Map(patches.map((p) => [p.patchId, p]));

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-2">
                        <h1 className="text-4xl font-black text-[#1A1A1A] leading-tight tracking-tight">Audit Infrastructure</h1>
                        <p className="text-[#1A1A1A]/70 font-medium">Immutable sequence of all network operations and patch synchronizations.</p>
                    </div>
                    <div className="flex gap-4">
                        <Button
                            variant="outline"
                            className="text-[14px] font-bold px-8 py-5 rounded-full border border-[#1A1A1A] bg-white text-[#1A1A1A] hover:bg-[#A9FD5F] hover:scale-[1.03] transition-all flex items-center shadow-none hover:shadow-none gap-2"
                            onClick={exportCsv}
                            disabled={logs.length === 0}
                        >
                            <Download size={18} />
                            Export CSV
                        </Button>
                    </div>
                </div>

                <div className="glass p-4 rounded-2xl border border-[#1A1A1A]/5 grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="relative">
                        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1A1A1A]/50" />
                        <input
                            value={deviceFilter}
                            onChange={(e) => setDeviceFilter(e.target.value)}
                            placeholder="Filter by device address..."
                            className="w-full bg-[#1A1A1A]/10 border border-[#1A1A1A]/5 rounded-xl px-12 py-2 text-xs focus:outline-none"
                        />
                    </div>
                    <div className="relative">
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full bg-[#1A1A1A]/10 border border-[#1A1A1A]/5 rounded-xl px-4 py-2 text-xs focus:outline-none appearance-none text-[#1A1A1A]/70 font-bold uppercase tracking-wider"
                        >
                            <option value="all">All Status</option>
                            <option value="success">Success</option>
                            <option value="failure">Failure</option>
                        </select>
                    </div>
                </div>

                <Card title="Global Network Logs" subtitle="Installation events mirrored from backend and on-chain reports.">
                    <div className="space-y-1">
                        {logs.map((log) => (
                            <div key={log._id} className="group flex items-center justify-between p-4 rounded-xl hover:bg-white/2 border border-transparent hover:border-[#1A1A1A]/5 transition-all">
                                <div className="flex items-center gap-6">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-[#1A1A1A] tracking-tight">
                                                PATCH INSTALLATION
                                            </span>
                                            <Badge variant={log.status === "success" ? "success" : "error"} className="px-1.5 py-0 text-[8px]">
                                                {log.status}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-[#1A1A1A]/50 font-medium tracking-tight">
                                            Device <span className="text-[#1A1A1A]/70 font-mono">{log.deviceAddress.slice(0, 8)}...{log.deviceAddress.slice(-6)}</span>{" "}
                                            reported{" "}
                                            <span className="text-[#1A1A1A]/80">
                                                {patchById.get(log.patchId)?.softwareName || `Patch #${log.patchId}`}
                                            </span>{" "}
                                            <span className="text-[#1A1A1A]/70 font-mono">
                                                (v{patchById.get(log.patchId)?.version || "unknown"} · #P00{log.patchId})
                                            </span>{" "}
                                            via {log.source || "api"}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-8">
                                    <div className="flex flex-col items-end gap-1">
                                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Network Timestamp</span>
                                        <span className="text-xs font-mono text-[#1A1A1A]/70">{new Date(log.timestamp).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>
        </DashboardLayout>
    );
}
