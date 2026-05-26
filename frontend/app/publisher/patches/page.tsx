"use client";

import React, { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/Cards";
import { Button } from "@/components/UI";
import { Modal } from "@/components/Forms";
import {
    PlusCircle,
    Eye
} from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useToast } from "@/context/ToastContext";

type Patch = {
    _id: string;
    patchId: number;
    softwareName: string;
    version: string;
    active: boolean;
    installCount?: number;
    successRate?: number;
    ipfsHash: string;
    fileHash: string;
    releaseTime: string;
    publisher: string;
};

export default function PublisherPatches() {
    const { address } = useWallet();
    const router = useRouter();
    const { showToast } = useToast();
    const [selectedPatch, setSelectedPatch] = useState<Patch | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [myPatches, setMyPatches] = useState<Patch[]>([]);

    useEffect(() => {
        if (!address) return;
        let cancelled = false;
        async function load() {
            try {
                const data = await apiGet("/api/publisher/patches", address);
                if (!cancelled) setMyPatches(((data as { patches?: Patch[] }).patches || []));
            } catch (e) {
                const message = e instanceof Error ? e.message : "Unable to load publisher patches";
                if (message.toLowerCase().includes("insufficient permissions")) {
                    showToast("This wallet does not have publisher access. Please login with an authorized publisher wallet.", "error");
                    router.push("/unauthorized");
                } else {
                    showToast(message, "error");
                }
                if (!cancelled) setMyPatches([]);
            }
        }
        void load();
        return () => { cancelled = true; };
    }, [address, router, showToast]);

    const handleOpenDetails = (patch: Patch) => {
        setSelectedPatch(patch);
        setIsModalOpen(true);
    };

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-2">
                        <h1 className="text-4xl font-black text-[#1A1A1A] leading-tight tracking-tight">Software Inventory</h1>
                        <p className="text-[#1A1A1A]/70 font-medium">History of your published artifacts and distribution metrics.</p>
                    </div>
                    <Link href="/publisher/publish">
                        <Button className="px-8 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/10">
                            <PlusCircle size={20} />
                            Publish New Version
                        </Button>
                    </Link>
                </div>

                {/* Patches Table */}
                <Card>
                    <div className="table-container">
                        <table className="w-full">
                            <thead>
                                <tr>
                                    <th>Identity Hash</th>
                                    <th>Software</th>
                                    <th>Distribution Status</th>
                                    <th>Installed Count</th>
                                    <th>Reliability %</th>
                                    <th className="text-right">Intelligence</th>
                                </tr>
                            </thead>
                            <tbody>
                                {myPatches.map((patch) => (
                                    <tr key={patch._id} className="group hover:bg-white/1">
                                        <td className="font-mono text-[#1A1A1A] text-xs font-bold">
                                            #P00{patch.patchId}
                                        </td>
                                        <td>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-[#1A1A1A] tracking-tight">{patch.softwareName}</span>
                                                <span className="text-[10px] text-[#1A1A1A]/50 font-bold uppercase tracking-widest mt-0.5">Build V{patch.version}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <div className={`h-1.5 w-1.5 rounded-full ${patch.active ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                                                <span className={`text-[11px] font-bold uppercase tracking-wider ${patch.active ? "text-[#1A1A1A]" : "text-rose-500"}`}>
                                                    {patch.active ? "Broadcasting" : "Halted & Revoked"}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="text-sm font-bold text-[#1A1A1A]/80">
                                            <div className="bg-white w-fit px-3 py-1 rounded-lg border border-[#1A1A1A]/5">
                                                {patch.installCount || 0} <span className="text-xs text-[#1A1A1A]/50 ml-1">Nodes</span>
                                            </div>
                                        </td>
                                        <td className="text-sm font-bold">
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 max-w-[80px] h-1.5 bg-[#EDEDED] rounded-full overflow-hidden">
                                                    <div className="h-full bg-emerald-500" style={{ width: `${patch.successRate || 0}%` }} />
                                                </div>
                                                <span className="text-[#1A1A1A]">{Math.round(patch.successRate || 0)}%</span>
                                            </div>
                                        </td>
                                        <td className="text-right">
                                            <Button onClick={() => handleOpenDetails(patch)} variant="ghost" size="icon" className="hover:bg-[#A9FD5F] transition-all">
                                                <Eye size={18} className="text-[#1A1A1A]/70 group-hover:text-[#1A1A1A]" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>

                {/* Patch Intelligence Modal */}
                {selectedPatch && (
                    <Modal
                        isOpen={isModalOpen}
                        onClose={() => setIsModalOpen(false)}
                        title="Artifact Distribution Intelligence"
                    >
                        <div className="space-y-8">
                            <div className="space-y-3">
                                <p className="text-xs text-[#1A1A1A]/70">Release Time: {new Date(selectedPatch.releaseTime).toLocaleString()}</p>
                                <p className="text-xs text-[#1A1A1A]/70">Install Count: {selectedPatch.installCount || 0}</p>
                                <p className="text-xs text-[#1A1A1A]/70">Success Rate: {Math.round(selectedPatch.successRate || 0)}%</p>
                                <p className="text-xs text-[#1A1A1A]/70 break-all">IPFS: {selectedPatch.ipfsHash}</p>
                                <p className="text-xs text-[#1A1A1A]/70 break-all">File Hash: {selectedPatch.fileHash}</p>
                            </div>
                        </div>
                    </Modal>
                )}
            </div>
        </DashboardLayout>
    );
}
