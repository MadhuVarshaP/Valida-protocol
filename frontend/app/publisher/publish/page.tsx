"use client";

import React, { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/Cards";
import { Button, Badge } from "@/components/UI";
import { FormInput } from "@/components/Forms";
import {
    ShieldCheck,
    Database,
    Loader2,
    FileCode,
    Hash,
    Info
} from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { useRouter } from "next/navigation";
import { useToast } from "@/context/ToastContext";
import { bpmsContractAbi } from "@/lib/contractAbi";
import { getContractWithSigner, getFrontendContractAddress, getSigner } from "@/lib/ethers";

const PATCH_FILE_ACCEPT = ".exe,.msi,.dmg,.pkg,.deb,.rpm,.bin,.zip,.tar,.gz,.img,.iso,.tar.gz";
const ALLOWED_PATCH_EXTENSIONS = new Set([".exe", ".msi", ".dmg", ".pkg", ".deb", ".rpm", ".bin", ".zip", ".tar", ".gz", ".img", ".iso"]);

export default function PublisherPublish() {
    const { address } = useWallet();
    const { showToast } = useToast();
    const [formData, setFormData] = useState({
        namespace: "",
        version: "",
        platform: "",
        ipfs: "",
        fileHash: "",
    });
    const [patchFile, setPatchFile] = useState<File | null>(null);
    const [uploadedArtifactMeta, setUploadedArtifactMeta] = useState<{
        artifactFileName?: string;
        artifactMimeType?: string;
    } | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [publishPhase, setPublishPhase] = useState<
        "idle" | "signing" | "confirming" | "syncing" | "done"
    >("idle");
    const router = useRouter();

    const handlePatchFileChange = (file: File | null) => {
        if (!file) {
            setPatchFile(null);
            setUploadedArtifactMeta(null);
            return;
        }
        const name = file.name.toLowerCase().trim();
        const dotIndex = name.lastIndexOf(".");
        const extension = dotIndex >= 0 ? name.slice(dotIndex) : "";
        const isTarGz = name.endsWith(".tar.gz");
        if (!isTarGz && !ALLOWED_PATCH_EXTENSIONS.has(extension)) {
            showToast("Unsupported file type. Allowed: .exe, .msi, .dmg, .pkg, .deb, .rpm, .bin, .zip, .tar.gz, .img, .iso", "error");
            setPatchFile(null);
            setUploadedArtifactMeta(null);
            return;
        }
        setPatchFile(file);
        setUploadedArtifactMeta(null);
    };

    const handleUpload = async () => {
        if (!address || !patchFile) return;
        setIsUploading(true);
        try {
            const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
            if (baseUrl.includes("vercel.app") && patchFile.size > 4_500_000) {
                throw new Error(
                    "This backend host rejects large multipart uploads (>~4.5MB). Use a non-serverless backend URL for large .pkg files."
                );
            }
            const form = new FormData();
            form.append("patchFile", patchFile);
            const response = await fetch(`${baseUrl}/api/publisher/upload`, {
                method: "POST",
                headers: { "x-wallet-address": address },
                body: form,
            });
            const raw = await response.text();
            let payload = {} as {
                ipfsHash?: string;
                fileHash?: string;
                artifactFileName?: string;
                artifactMimeType?: string;
                error?: string;
            };
            try {
                payload = raw ? (JSON.parse(raw) as typeof payload) : payload;
            } catch {
                payload = { error: raw || "Upload failed" };
            }
            if (!response.ok) {
                throw new Error(payload.error || `Upload failed (HTTP ${response.status})`);
            }
            setFormData((prev) => ({
                ...prev,
                ipfs: payload.ipfsHash || "",
                fileHash: payload.fileHash || "",
            }));
            setUploadedArtifactMeta({
                artifactFileName: payload.artifactFileName || patchFile.name,
                artifactMimeType: payload.artifactMimeType || patchFile.type || "application/octet-stream",
            });
            showToast("File uploaded. IPFS + SHA256 generated.", "success");
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Upload failed", "error");
        } finally {
            setIsUploading(false);
        }
    };

    const handlePublish = async () => {
        if (!address) return;
        setIsPublishing(true);
        setPublishPhase("signing");
        try {
            const namespace = formData.namespace.trim();
            const version = formData.version.trim();
            const platform = formData.platform.trim();
            const ipfsHash = formData.ipfs.trim();
            const fileHash = formData.fileHash.trim();

            if (!namespace || !version || !platform || !ipfsHash || !fileHash) {
                throw new Error("All fields are required before publishing.");
            }

            /* ---- Step 1: on-chain transaction ---- */
            const contractAddress = getFrontendContractAddress();
            const signer = await getSigner();
            const signerAddress = (await signer.getAddress()).toLowerCase();
            const contract = await getContractWithSigner(contractAddress, bpmsContractAbi);

            const tx = await contract.publishPatch(namespace, version, ipfsHash, fileHash);
            setPublishPhase("confirming");

            await tx.wait();

            /* ---- Step 2: send txHash to backend — backend reads everything from chain ---- */
            setPublishPhase("syncing");
            const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
            const response = await fetch(`${baseUrl}/api/publisher/publish`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-wallet-address": signerAddress,
                },
                body: JSON.stringify({
                    txHash: tx.hash,
                    targetPlatform: platform,
                    artifactFileName: uploadedArtifactMeta?.artifactFileName || patchFile?.name || undefined,
                    artifactMimeType:
                        uploadedArtifactMeta?.artifactMimeType ||
                        patchFile?.type ||
                        "application/octet-stream",
                }),
            });
            const payload = (await response.json()) as { error?: string };
            if (!response.ok) {
                throw new Error(payload.error || "Backend sync failed");
            }

            setPublishPhase("done");
            showToast("Patch published and synced successfully!", "success");
            router.push("/publisher/patches");
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Publish failed", "error");
        } finally {
            setPublishPhase("idle");
            setIsPublishing(false);
        }
    };

    const statusLabel = {
        idle: "Awaiting input",
        signing: "Confirm in wallet…",
        confirming: "Confirming on chain…",
        syncing: "Syncing to backend…",
        done: "Published!",
    }[publishPhase];

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8">
                <div className="flex flex-col gap-2">
                    <h1 className="text-4xl font-black text-[#1A1A1A] leading-tight tracking-tight">Deploy Artifact</h1>
                    <p className="text-[#1A1A1A]/70 font-medium">Verify software integrity and commit patch hash to the immutable registry.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                    <Card title="Publishing Terminal" subtitle="All fields are required for cryptographic verification.">
                        <div className="space-y-6 pt-4">
                            <FormInput
                                label="Software Namespace"
                                placeholder="e.g. VSCode-OSX-Arm64"
                                value={formData.namespace}
                                onChange={(e) => setFormData({ ...formData, namespace: e.target.value })}
                            />

                            <div className="grid grid-cols-2 gap-6">
                                <FormInput
                                    label="Build Version"
                                    placeholder="e.g. 1.85.2"
                                    value={formData.version}
                                    onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                                />
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-[#1A1A1A]/70 ml-1">Target Platform</label>
                                    <select
                                        value={formData.platform}
                                        onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                                        className="w-full bg-white border border-[#1A1A1A]/10 rounded-xl px-4 py-3 text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]/30 appearance-none text-sm font-bold uppercase tracking-widest"
                                    >
                                        <option value="">Select platform</option>
                                        <option value="windows">windows</option>
                                        <option value="linux">linux</option>
                                        <option value="arm64">arm64</option>
                                        <option value="drone-os">drone-os</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-6 pt-4 border-t border-[#1A1A1A]/5">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-[#1A1A1A]/70 ml-1">Patch File Upload</label>
                                    <input
                                        type="file"
                                        accept={PATCH_FILE_ACCEPT}
                                        onChange={(e) => handlePatchFileChange(e.target.files?.[0] || null)}
                                        className="w-full bg-white border border-[#1A1A1A]/10 rounded-xl px-4 py-3 text-[#1A1A1A] text-xs"
                                    />
                                    <Button
                                        onClick={() => void handleUpload()}
                                        isLoading={isUploading}
                                        disabled={!patchFile}
                                        className="w-full rounded-xl"
                                    >
                                        Upload and Generate IPFS + SHA256
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-[#1A1A1A]/70 ml-1 flex items-center gap-2">
                                        <Database size={16} className="text-blue-500/60" />
                                        IPFS Gateway Hash (CID)
                                    </label>
                                    <input
                                        readOnly
                                        className="w-full bg-white border border-[#1A1A1A]/10 rounded-xl px-4 py-3 text-[#1A1A1A] placeholder:text-slate-700 font-mono text-xs focus:outline-none transition-all"
                                        placeholder="QmYxpizjUMmEc2D22m5BAbC...1234"
                                        value={formData.ipfs}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-[#1A1A1A]/70 ml-1 flex items-center gap-2">
                                        <Hash size={16} className="text-[#1A1A1A]/60" />
                                        Build Integrity Hash (SHA-256)
                                    </label>
                                    <input
                                        readOnly
                                        className="w-full bg-white border border-[#1A1A1A]/10 rounded-xl px-4 py-3 text-[#1A1A1A] placeholder:text-slate-700 font-mono text-xs focus:outline-none transition-all"
                                        placeholder="0x9a8f...2e3cBA49...771B"
                                        value={formData.fileHash}
                                    />
                                </div>
                            </div>

                            <div className="pt-8 flex gap-4">
                                <Button variant="ghost" className="flex-1 rounded-xl py-6 font-bold" onClick={() => router.back()}>Cancel Operation</Button>
                                <Button
                                    className="flex-2 rounded-xl py-6 font-black uppercase tracking-widest hover:bg-[#A9FD5F] hover:text-black flex items-center shadow-none hover:shadow-none"
                                    isLoading={isPublishing}
                                    onClick={handlePublish}
                                    disabled={!formData.namespace || !formData.version || !formData.platform || !formData.ipfs || !formData.fileHash}
                                >
                                    Commit to Network
                                </Button>
                            </div>
                        </div>
                    </Card>

                    <div className="space-y-6 sticky top-28">
                        <div className="glass p-8 rounded-3xl border border-[#1A1A1A]/5 shadow-2xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-[#A9FD5F]/30 blur-3xl rounded-full" />

                            <div className="flex justify-between items-start mb-10">
                                <div className="p-4 bg-[#A9FD5F] rounded-2xl group-hover:scale-110 transition-transform duration-500">
                                    <ShieldCheck size={32} className="text-[#1A1A1A]" />
                                </div>
                                {/* <div className="flex flex-col items-end gap-1">
                                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Protocol Version</span>
                                    <span className="text-xs font-mono text-[#1A1A1A]/80">BPMS-1.0-SEC</span>
                                </div> */}
                            </div>

                            <div className="space-y-8">
                                <div className="space-y-2">
                                    <h3 className="text-3xl font-black text-[#1A1A1A] tracking-tighter">
                                        {formData.namespace || "Software Namespace"}
                                    </h3>
                                    <div className="flex items-center gap-3">
                                        <Badge variant="success">Build V{formData.version || "0.0.0"}</Badge>
                                        <Badge variant="info">{(formData.platform || "platform").toUpperCase()}</Badge>
                                    </div>
                                </div>

                                <div className="space-y-4 pt-4 border-t border-[#1A1A1A]/5">
                                    <div className="flex items-center gap-3 text-[#1A1A1A]/50">
                                        <FileCode size={16} />
                                        <p className="text-xs font-mono truncate max-w-xs">{formData.ipfs || "CID not specified"}</p>
                                    </div>
                                    <div className="flex items-center gap-3 text-[#1A1A1A]/50">
                                        <Hash size={16} />
                                        <p className="text-xs font-mono truncate max-w-xs">{formData.fileHash || "SHA-256 awaiting input"}</p>
                                    </div>
                                </div>

                                <div className="p-4 bg-white border border-[#1A1A1A]/5 rounded-2xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Loader2 size={16} className={`text-[#1A1A1A] ${publishPhase !== "idle" ? "animate-spin" : "opacity-20"}`} />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-[#1A1A1A]/50">Status</span>
                                    </div>
                                    <span className="text-xs font-bold text-[#1A1A1A] uppercase tracking-tight">
                                        {statusLabel}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-[#1A1A1A]/10 rounded-2xl border border-[#1A1A1A]/5 flex gap-4 items-start">
                            <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg">
                                <Info size={16} />
                            </div>
                            <div>
                                <h5 className="text-[11px] font-black text-[#1A1A1A]/50 uppercase tracking-widest mb-1">Infrastructure Notice</h5>
                                <p className="text-xs text-[#1A1A1A]/70 font-medium leading-relaxed">
                                    Once committed, the build metadata is pinned globally across IPFS cluster nodes. Changes require a new version release.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
