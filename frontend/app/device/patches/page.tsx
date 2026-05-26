"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/Cards";
import { Badge, Button } from "@/components/UI";
import { Modal } from "@/components/Forms";
import { useRouter } from "next/navigation";
import {
    Eye,
    ShieldCheck,
    Lock,
    History,
    Loader2,
    AlertCircle,
    CheckCircle2
} from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import { apiGet, apiPost } from "@/lib/api";
import { isVersionNewer } from "@/lib/versionCompare";
import { normalizeHash, sha256OfBuffer } from "@/lib/patchIntegrity";
import { bpmsContractAbi } from "@/lib/contractAbi";
import { getContractWithSigner, getFrontendContractAddress } from "@/lib/ethers";

type DeviceProfile = {
    currentSoftwareNamespace?: string;
    currentVersion?: string;
    targetPlatform?: string;
    displayName?: string;
};

type PatchRec = {
    _id: string;
    patchId: number;
    softwareName: string;
    version: string;
    targetPlatform?: string;
    ipfsHash: string;
    fileHash: string;
    releaseTime: string;
};

type ChainIntegrity = {
    patchId: number;
    fileHash: string;
    softwareName: string;
    version: string;
    ipfsHash: string;
    active: boolean;
};

type InstallPhase = "idle" | "downloading" | "verifying" | "installing" | "reporting" | "success" | "error";

function findPatchInstalledLogIndex(
    contract: { interface: { parseLog: (log: { topics: string[]; data: string }) => { name?: string } | null } },
    receipt: { logs?: ReadonlyArray<{ address: string; topics: readonly string[]; data: string; index: number }> },
    contractAddress: string
): number | undefined {
    const addr = contractAddress.toLowerCase();
    if (!receipt.logs) return undefined;
    for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== addr) continue;
        try {
            const p = contract.interface.parseLog({
                topics: [...log.topics],
                data: log.data
            });
            if (p?.name === "PatchInstalled") return Number(log.index);
        } catch {
            continue;
        }
    }
    return undefined;
}

function isApplicable(patch: PatchRec, profile: DeviceProfile | null) {
    if (!profile) return false;
    const ns = String(profile.currentSoftwareNamespace || "").trim();
    const ver = String(profile.currentVersion || "").trim();
    const dPlat = String(profile.targetPlatform || "").trim().toLowerCase();
    const pPlat = String(patch.targetPlatform || "").trim().toLowerCase();
    if (ns && patch.softwareName !== ns) return false;
    if (dPlat && pPlat && dPlat !== pPlat) return false;
    return isVersionNewer(patch.version, ver);
}

export default function DevicePatches() {
    const { address } = useWallet();
    const router = useRouter();
    const { showToast } = useToast();
    const [selectedPatch, setSelectedPatch] = useState<PatchRec | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [patches, setPatches] = useState<PatchRec[]>([]);
    const [profile, setProfile] = useState<DeviceProfile | null>(null);
    const [loading, setLoading] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const [integrity, setIntegrity] = useState<ChainIntegrity | null>(null);
    const [integrityLoading, setIntegrityLoading] = useState(false);
    const [integrityError, setIntegrityError] = useState<string | null>(null);
    const [installingPatchId, setInstallingPatchId] = useState<number | null>(null);
    const [installPhase, setInstallPhase] = useState<InstallPhase>("idle");
    const [installMessage, setInstallMessage] = useState("");

    const load = useCallback(async () => {
        if (!address) return;
        setLoading(true);
        try {
            const me = (await apiGet("/api/device/me", address).catch(() => ({ device: null }))) as {
                device?: DeviceProfile | null;
            };
            const profileFromApi = me.device || null;
            setProfile(profileFromApi);
            if (!profileFromApi) {
                setPatches([]);
                return;
            }
            const patchRes = (await apiGet("/api/device/patches", address)) as { patches?: PatchRec[] };
            setPatches(patchRes.patches || []);
        } catch (e) {
            const message = e instanceof Error ? e.message : "Unable to load device patches";
            if (message.toLowerCase().includes("insufficient permissions")) {
                showToast("This wallet does not have device access. Please login with a registered device wallet.", "error");
                router.push("/unauthorized");
            } else {
                showToast(message, "error");
            }
            setProfile(null);
            setPatches([]);
        } finally {
            setLoading(false);
        }
    }, [address, router, showToast]);

    useEffect(() => {
        void load();
    }, [load]);

    const handleOpenDetails = async (patch: PatchRec) => {
        setSelectedPatch(patch);
        setIsModalOpen(true);
        setInstallPhase("idle");
        setInstallMessage("");
        setIntegrityLoading(true);
        setIntegrityError(null);
        setIntegrity(null);
        try {
            const row = (await apiGet(`/api/device/patch/${patch.patchId}/chain-integrity`, address)) as ChainIntegrity;
            setIntegrity(row);
        } catch (e) {
            setIntegrityError(e instanceof Error ? e.message : "Unable to load chain integrity");
        } finally {
            setIntegrityLoading(false);
        }
    };

    const visiblePatches = useMemo(
        () => (showAll ? patches : patches.filter((p) => isApplicable(p, profile))),
        [showAll, patches, profile]
    );

    async function installPatchFromModal() {
        if (!selectedPatch || !address || installingPatchId !== null) return;
        const contractAddress = getFrontendContractAddress();
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        setInstallingPatchId(selectedPatch.patchId);
        try {
            setInstallPhase("downloading");
            setInstallMessage("Downloading patch package from IPFS...");
            const dl = await fetch(`${baseUrl}/api/device/patch/${selectedPatch.patchId}/download`, {
                headers: { "x-wallet-address": address }
            });
            if (!dl.ok) throw new Error("Unable to download patch");
            const buf = await dl.arrayBuffer();

            setInstallPhase("verifying");
            setInstallMessage("Verifying SHA-256 hash against on-chain file hash...");
            const localHash = normalizeHash(await sha256OfBuffer(buf));
            const contract = await getContractWithSigner(contractAddress, bpmsContractAbi);
            const onChain = await contract.patches(selectedPatch.patchId);
            const chainHash = normalizeHash(String(onChain.fileHash));
            if (localHash !== chainHash) {
                await apiPost("/api/device/report", { patchId: selectedPatch.patchId, status: "failure" }, address).catch(() => undefined);
                throw new Error("Integrity check failed. File hash does not match blockchain.");
            }

            setInstallPhase("installing");
            setInstallMessage("Installing patch...");
            await new Promise((resolve) => setTimeout(resolve, 900));

            setInstallPhase("reporting");
            setInstallMessage("Reporting installation to blockchain...");
            const tx = await contract.reportInstallation(selectedPatch.patchId, true);
            const receipt = await tx.wait();
            if (!receipt) throw new Error("No transaction receipt received");
            const logIndex = findPatchInstalledLogIndex(contract, receipt, contractAddress);

            await apiPost(
                "/api/device/report",
                { patchId: selectedPatch.patchId, status: "success", txHash: tx.hash, logIndex: logIndex ?? undefined },
                address
            );

            setInstallPhase("success");
            setInstallMessage("Patch installed and synced.");
            showToast("Patch installed successfully.", "success");
            await load();
        } catch (e) {
            setInstallPhase("error");
            setInstallMessage(e instanceof Error ? e.message : "Install failed");
            showToast(e instanceof Error ? e.message : "Install failed", "error");
        } finally {
            setInstallingPatchId(null);
        }
    }

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-2">
                        <h1 className="text-4xl font-black text-[#1A1A1A] leading-tight tracking-tighter">
                            Patch Registry View
                        </h1>
                        <p className="text-[#1A1A1A]/70 font-medium font-inter">
                            Same source as dashboard: registry patches + device profile applicability.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={() => setShowAll((v) => !v)} variant="outline">
                            {showAll ? "Show applicable only" : "Show all active patches"}
                        </Button>
                        <Button onClick={() => void load()} isLoading={loading}>
                            Refresh
                        </Button>
                    </div>
                </div>

                <Card title="System profile snapshot" subtitle="Pulled from /api/device/me">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                        <div className="p-3 rounded-lg bg-white border border-[#1A1A1A]/10">
                            <p className="text-[#1A1A1A]/50 text-[10px] uppercase font-bold">Display name</p>
                            <p className="text-[#1A1A1A] font-semibold">{profile?.displayName || "—"}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-white border border-[#1A1A1A]/10">
                            <p className="text-[#1A1A1A]/50 text-[10px] uppercase font-bold">Namespace</p>
                            <p className="text-[#1A1A1A] font-semibold">{profile?.currentSoftwareNamespace || "—"}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-white border border-[#1A1A1A]/10">
                            <p className="text-[#1A1A1A]/50 text-[10px] uppercase font-bold">Current version</p>
                            <p className="text-[#1A1A1A] font-semibold">{profile?.currentVersion || "—"}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-white border border-[#1A1A1A]/10">
                            <p className="text-[#1A1A1A]/50 text-[10px] uppercase font-bold">Target platform</p>
                            <p className="text-[#1A1A1A] font-semibold">{profile?.targetPlatform || "—"}</p>
                        </div>
                    </div>
                </Card>

                <Card>
                    <div className="table-container">
                        <table className="w-full">
                            <thead>
                                <tr>
                                    <th>Patch Identity</th>
                                    <th>Software Name</th>
                                    <th>Platform</th>
                                    <th>Registry Build</th>
                                    <th>Release Date</th>
                                    <th>Applicability</th>
                                    <th>Integrity Status</th>
                                    <th className="text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visiblePatches.map((patch) => (
                                        <tr key={patch._id} className="group hover:bg-white/1">
                                            <td className="font-mono text-[#1A1A1A] text-xs font-bold uppercase tracking-widest">
                                                #P0-0{patch.patchId}
                                            </td>
                                            <td>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-[#1A1A1A] tracking-tight">{patch.softwareName}</span>
                                                    <span className="text-[10px] text-[#1A1A1A]/50 font-bold uppercase tracking-widest mt-0.5 font-inter">DECENTRALIZED BINARY</span>
                                                </div>
                                            </td>
                                            <td className="text-xs font-bold text-[#1A1A1A]/70 uppercase">
                                                {patch.targetPlatform || "—"}
                                            </td>
                                            <td className="text-sm font-bold text-[#1A1A1A]/80">
                                                V{patch.version}
                                            </td>
                                            <td className="text-xs text-[#1A1A1A]/50 font-medium">
                                                {new Date(patch.releaseTime).toLocaleString()}
                                            </td>
                                            <td>
                                                {isApplicable(patch, profile) ? (
                                                    <Badge variant="warning">New update available</Badge>
                                                ) : (
                                                    <Badge variant="neutral">Not applicable</Badge>
                                                )}
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <ShieldCheck size={14} className="text-[#1A1A1A]/50" />
                                                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#1A1A1A]/70">
                                                        Verify in details
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button onClick={() => handleOpenDetails(patch)} variant="ghost" size="icon" className="hover:bg-[#A9FD5F] transition-all group/btn">
                                                        <Eye size={18} className="text-[#1A1A1A]/50 group-hover/btn:text-[#1A1A1A]" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {loading && (
                        <div className="py-8 text-center text-[#1A1A1A]/50 text-sm flex items-center justify-center gap-2">
                            <Loader2 size={16} className="animate-spin" />
                            Loading registry patches...
                        </div>
                    )}

                    {!loading && visiblePatches.length === 0 && (
                        <div className="py-24 text-center">
                            <div className="flex flex-col items-center gap-4 py-8 opacity-20">
                                <History size={48} className="text-[#1A1A1A]/50" />
                                <p className="text-xs font-black uppercase tracking-widest text-[#1A1A1A]/50">
                                    No patches in this view
                                </p>
                            </div>
                        </div>
                    )}
                </Card>

                {/* Patch Detail Modal for Device */}
                {selectedPatch && (
                    <Modal
                        isOpen={isModalOpen}
                        onClose={() => setIsModalOpen(false)}
                        title="Artifact Manifest Verification"
                    >
                        <div className="space-y-8">
                            <div className="p-5 bg-[#A9FD5F]/30 border border-emerald-500/10 rounded-2xl flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-[#A9FD5F] text-[#1A1A1A] rounded-xl">
                                        <Lock size={20} />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-[#1A1A1A] tracking-tight">Status: Integrity Check</h4>
                                        {integrityLoading ? (
                                            <p className="text-[10px] text-[#1A1A1A]/70 font-bold uppercase tracking-widest mt-0.5 flex items-center gap-1">
                                                <Loader2 size={12} className="animate-spin" /> Verifying against blockchain
                                            </p>
                                        ) : integrityError ? (
                                            <p className="text-[10px] text-rose-400 font-bold uppercase tracking-widest mt-0.5 flex items-center gap-1">
                                                <AlertCircle size={12} /> {integrityError}
                                            </p>
                                        ) : integrity ? (
                                            normalizeHash(integrity.fileHash) === normalizeHash(selectedPatch.fileHash) ? (
                                                <p className="text-[10px] text-[#1A1A1A]/80 font-bold uppercase tracking-widest mt-0.5 flex items-center gap-1">
                                                    <CheckCircle2 size={12} /> SHA-256 hash matches on-chain file hash
                                                </p>
                                            ) : (
                                                <p className="text-[10px] text-rose-400 font-bold uppercase tracking-widest mt-0.5 flex items-center gap-1">
                                                    <AlertCircle size={12} /> Hash mismatch with on-chain integrity record
                                                </p>
                                            )
                                        ) : (
                                            <p className="text-[10px] text-[#1A1A1A]/70 font-bold uppercase tracking-widest mt-0.5">
                                                Integrity state unavailable
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-[#1A1A1A]/50 uppercase tracking-widest ml-1">IPFS Storage Proof</label>
                                    <div className="bg-[#EDEDED] p-3 rounded-xl border border-[#1A1A1A]/5 font-mono text-[10px] text-[#1A1A1A]/70 break-all leading-relaxed">
                                        {selectedPatch.ipfsHash}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-[#1A1A1A]/50 uppercase tracking-widest ml-1">Binary Identifier (Hash)</label>
                                    <div className="bg-[#EDEDED] p-3 rounded-xl border border-[#1A1A1A]/5 font-mono text-[10px] text-[#1A1A1A]/70 break-all leading-relaxed">
                                        {selectedPatch.fileHash}
                                    </div>
                                </div>
                                {integrity && (
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-[#1A1A1A]/50 uppercase tracking-widest ml-1">
                                            On-chain File Hash
                                        </label>
                                        <div className="bg-[#EDEDED] p-3 rounded-xl border border-[#1A1A1A]/5 font-mono text-[10px] text-[#1A1A1A]/70 break-all leading-relaxed">
                                            {integrity.fileHash}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <Card className="bg-white border-[#1A1A1A]/5 mt-4" title="Distributor Manifest">
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center text-[11px]">
                                        <span className="text-[#1A1A1A]/50 font-bold uppercase tracking-wider">Certification Date</span>
                                        <span className="text-[#1A1A1A]/80 font-mono">{new Date(selectedPatch.releaseTime).toLocaleString()}</span>
                                    </div>
                                </div>
                            </Card>

                            <Button
                                className="w-full py-4 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl shadow-emerald-500/10"
                                onClick={() => {
                                    void installPatchFromModal();
                                }}
                                isLoading={installingPatchId === selectedPatch.patchId}
                                disabled={installingPatchId !== null}
                            >
                                Install Patch
                            </Button>
                            {installPhase !== "idle" && (
                                <p
                                    className={`text-xs font-medium ${
                                        installPhase === "error"
                                            ? "text-rose-400"
                                            : installPhase === "success"
                                              ? "text-[#1A1A1A]"
                                              : "text-[#1A1A1A]/70"
                                    }`}
                                >
                                    {installMessage}
                                </p>
                            )}
                            <Button
                                variant="ghost"
                                className="w-full py-3 rounded-xl font-bold text-xs uppercase tracking-widest"
                                onClick={() => {
                                    setIsModalOpen(false);
                                    router.push("/device/dashboard");
                                }}
                            >
                                Open full dashboard flow
                            </Button>
                        </div>
                    </Modal>
                )}
            </div>
        </DashboardLayout>
    );
}
