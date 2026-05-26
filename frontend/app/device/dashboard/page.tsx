"use client";

import React, { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/Cards";
import { Badge, Button } from "@/components/UI";
import { FormInput } from "@/components/Forms";
import {
    Package,
    ShieldCheck,
    AlertCircle,
    Download,
    Fingerprint,
    Cpu,
    Activity,
    CheckCircle2,
    XCircle,
    Loader2,
    RefreshCw,
    SlidersHorizontal
} from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import { bpmsContractAbi } from "@/lib/contractAbi";
import { getContractWithSigner, getFrontendContractAddress } from "@/lib/ethers";
import { normalizeHash, sha256OfBuffer } from "@/lib/patchIntegrity";
import { isVersionNewer } from "@/lib/versionCompare";

type DeviceRow = {
    deviceId: string;
    status?: string;
    lastSeen?: string;
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
    artifactFileName?: string;
    artifactMimeType?: string;
    active?: boolean;
};

type LogRow = {
    _id: string;
    patchId: number;
    status: "success" | "failure";
    timestamp: string;
    txHash?: string;
};

type Stats = {
    device: DeviceRow | null;
    successLogs: number;
    failureLogs: number;
    successRate: number;
    updatesAvailable: number;
    activePatchesOnRegistry: number;
};

type InstallPhase =
    | "idle"
    | "checking"
    | "preparing"
    | "approving"
    | "downloading"
    | "verifying"
    | "installing"
    | "reporting"
    | "success"
    | "error";

const PHASE_PROGRESS: Record<InstallPhase, number> = {
    idle: 0,
    checking: 12,
    preparing: 24,
    downloading: 35,
    verifying: 55,
    approving: 62,
    installing: 72,
    reporting: 88,
    success: 100,
    error: 0
};

function triggerBrowserDownload(bytes: ArrayBuffer, filename: string, mimeType = "application/octet-stream") {
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function extensionFromMimeType(contentType: string) {
    const normalized = contentType.split(";")[0].trim().toLowerCase();
    const extMap: Record<string, string> = {
        "application/zip": "zip",
        "application/x-zip-compressed": "zip",
        "application/octet-stream": "bin",
        "application/x-msdownload": "exe",
        "application/vnd.microsoft.portable-executable": "exe",
        "application/x-apple-diskimage": "dmg",
        "application/vnd.debian.binary-package": "deb",
        "application/x-rpm": "rpm",
        "application/gzip": "gz",
        "application/x-gzip": "gz",
        "application/x-tar": "tar",
        "application/x-7z-compressed": "7z"
    };
    return extMap[normalized] || "bin";
}

function parseFilenameFromContentDisposition(contentDisposition: string | null): string | null {
    if (!contentDisposition) return null;
    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
        try {
            return decodeURIComponent(utf8Match[1].replace(/^"(.*)"$/, "$1"));
        } catch {
            /* fall through to basic filename parsing */
        }
    }
    const basicMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
    return basicMatch?.[1] || null;
}

function isGenericFilename(name: string | null): boolean {
    if (!name) return true;
    const normalized = name.trim().toLowerCase();
    return normalized === "blob" || normalized === "download" || normalized === "file";
}

function inferExtensionFromBytes(bytes: ArrayBuffer): string | null {
    const view = new Uint8Array(bytes.slice(0, 8));
    if (view.length >= 4 && view[0] === 0x50 && view[1] === 0x4b && view[2] === 0x03 && view[3] === 0x04) {
        return "zip";
    }
    if (view.length >= 2 && view[0] === 0x4d && view[1] === 0x5a) {
        return "exe";
    }
    if (view.length >= 4 && view[0] === 0x7f && view[1] === 0x45 && view[2] === 0x4c && view[3] === 0x46) {
        return "elf";
    }
    if (view.length >= 2 && view[0] === 0x23 && view[1] === 0x21) {
        return "sh";
    }
    return null;
}

function getDownloadFilename(
    patch: PatchRec,
    contentDisposition: string | null,
    contentType: string,
    bytes: ArrayBuffer
) {
    const parsedName = parseFilenameFromContentDisposition(contentDisposition);
    if (parsedName && !isGenericFilename(parsedName)) return parsedName;
    if (patch.artifactFileName && !isGenericFilename(patch.artifactFileName)) {
        return patch.artifactFileName;
    }
    const safeBase = `${patch.softwareName.replace(/[^a-z0-9._-]+/gi, "_")}-v${patch.version}`;
    const fromMime = extensionFromMimeType(patch.artifactMimeType || contentType);
    const extension = fromMime === "bin" ? inferExtensionFromBytes(bytes) || fromMime : fromMime;
    return `${safeBase}.${extension}`;
}

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

function matchesProfile(patch: PatchRec, device: DeviceRow | null) {
    if (!device) return true;
    const ns = String(device.currentSoftwareNamespace || "").trim();
    const currentVer = String(device.currentVersion || "").trim();
    const targetPlatform = String(device.targetPlatform || "").trim().toLowerCase();
    const patchPlatform = String(patch.targetPlatform || "").trim().toLowerCase();
    if (ns && patch.softwareName !== ns) return false;
    if (targetPlatform && patchPlatform && patchPlatform !== targetPlatform) return false;
    return isVersionNewer(patch.version, currentVer);
}

export default function DeviceDashboard() {
    const { address } = useWallet();
    const { showToast } = useToast();

    const [deviceMissing, setDeviceMissing] = useState(false);
    const [device, setDevice] = useState<DeviceRow | null>(null);
    const [profileNs, setProfileNs] = useState("");
    const [profileVer, setProfileVer] = useState("");
    const [profilePlat, setProfilePlat] = useState("");
    const [profileName, setProfileName] = useState("");
    const [savingProfile, setSavingProfile] = useState(false);

    const [stats, setStats] = useState<Stats | null>(null);
    const [logs, setLogs] = useState<LogRow[]>([]);
    const [upToDate, setUpToDate] = useState(true);
    const [recommended, setRecommended] = useState<PatchRec | null>(null);
    const [availableUpdates, setAvailableUpdates] = useState<PatchRec[]>([]);
    const [allPatches, setAllPatches] = useState<PatchRec[]>([]);
    const [showAllPatches, setShowAllPatches] = useState(false);
    const [filterSoftware, setFilterSoftware] = useState("");
    const [filterPlatform, setFilterPlatform] = useState("");
    const [updateHint, setUpdateHint] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);

    const [phase, setPhase] = useState<InstallPhase>("idle");
    const [phaseMessage, setPhaseMessage] = useState("");
    const [installing, setInstalling] = useState(false);
    const [installingPatchId, setInstallingPatchId] = useState<number | null>(null);
    const [failedPatchId, setFailedPatchId] = useState<number | null>(null);

    const loadAll = useCallback(async () => {
        if (!address) return;
        let loadedDevice: DeviceRow | null = null;
        try {
            const me = await apiGet("/api/device/me", address).catch(() => null) as
                | { device?: DeviceRow }
                | null;
            if (!me?.device) {
                setDeviceMissing(true);
                setDevice(null);
            } else {
                setDeviceMissing(false);
                setDevice(me.device);
                loadedDevice = me.device;
                setProfileNs(me.device.currentSoftwareNamespace || "");
                setProfileVer(me.device.currentVersion || "");
                setProfilePlat(me.device.targetPlatform || "");
                setProfileName(me.device.displayName || "");
            }
        } catch {
            setDeviceMissing(true);
        }

        try {
            const [statsRes, logsRes, checkRes, patchesRes] = await Promise.all([
                apiGet("/api/device/stats", address),
                apiGet("/api/device/history", address),
                apiGet("/api/device/update-check", address).catch(() => ({ upToDate: true, recommendedPatch: null })),
                apiGet("/api/device/patches", address).catch(() => ({ patches: [] }))
            ]);
            setStats(statsRes as Stats);
            setLogs(((logsRes as { logs?: LogRow[] }).logs || []).slice(0, 12));
            const chk = checkRes as {
                upToDate: boolean;
                recommendedPatch: PatchRec | null;
                hint?: string;
            };
            setUpToDate(Boolean(chk.upToDate));
            setRecommended(chk.recommendedPatch || null);
            setUpdateHint(typeof chk.hint === "string" ? chk.hint : null);
            const activePatches = ((patchesRes as { patches?: PatchRec[] }).patches || []);
            setAllPatches(activePatches);
            const profile = loadedDevice || null;
            const applicable = activePatches.filter((p) => matchesProfile(p, profile));
            applicable.sort((a, b) => (isVersionNewer(a.version, b.version) ? -1 : 1));
            setAvailableUpdates(applicable);
        } catch {
            /* stats may fail if device record missing */
        }
    }, [address]);

    useEffect(() => {
        void loadAll();
    }, [loadAll]);

    async function saveProfile() {
        if (!address || deviceMissing) return;
        setSavingProfile(true);
        try {
            const res = (await apiPatch(
                "/api/device/profile",
                {
                    currentSoftwareNamespace: profileNs.trim(),
                    currentVersion: profileVer.trim(),
                    targetPlatform: profilePlat.trim().toLowerCase(),
                    displayName: profileName.trim()
                },
                address
            )) as { device: DeviceRow };
            setDevice(res.device);
            showToast("Device profile saved", "success");
            await loadAll();
        } catch (e) {
            showToast(e instanceof Error ? e.message : "Save failed", "error");
        } finally {
            setSavingProfile(false);
        }
    }

    async function checkForUpdates() {
        if (!address || deviceMissing) return;
        setChecking(true);
        setPhase("checking");
        setPhaseMessage("Checking registry for applicable patches…");
        try {
            const chk = (await apiGet("/api/device/update-check", address)) as {
                upToDate: boolean;
                recommendedPatch: PatchRec | null;
                hint?: string;
            };
            setUpToDate(chk.upToDate);
            setRecommended(chk.recommendedPatch || null);
            setUpdateHint(typeof chk.hint === "string" ? chk.hint : null);
            if (chk.upToDate || !chk.recommendedPatch) {
                showToast("Your system is up to date.", "success");
            } else {
                showToast(
                    `Update available: ${chk.recommendedPatch.softwareName} v${chk.recommendedPatch.version}`,
                    "info"
                );
            }
            await loadAll();
        } catch (e) {
            showToast(e instanceof Error ? e.message : "Check failed", "error");
        } finally {
            setChecking(false);
            setPhase("idle");
            setPhaseMessage("");
        }
    }

    async function runInstallPipeline(targetPatch?: PatchRec) {
        const patchToInstall = targetPatch || recommended;
        if (!address || !patchToInstall || deviceMissing) return;
        setInstalling(true);
        setInstallingPatchId(patchToInstall.patchId);
        setFailedPatchId(null);
        setPhase("preparing");
        setPhaseMessage("Preparing patch (fetching from IPFS)…");
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        const contractAddress = getFrontendContractAddress();

        try {
            const dl = await fetch(
                `${baseUrl}/api/device/patch/${patchToInstall.patchId}/download`,
                { headers: { "x-wallet-address": address } }
            );
            if (!dl.ok) {
                throw new Error("Download failed — check IPFS gateway or patch CID");
            }
            const buf = await dl.arrayBuffer();
            const responseContentType = dl.headers.get("content-type") || "application/octet-stream";
            const responseDisposition = dl.headers.get("content-disposition");
            const effectiveDownloadType = patchToInstall.artifactMimeType || responseContentType;

            setPhase("verifying");
            setPhaseMessage("Computing SHA-256 and comparing to on-chain fileHash…");
            const localHash = normalizeHash(await sha256OfBuffer(buf));

            const contract = await getContractWithSigner(contractAddress, bpmsContractAbi);
            const onChain = await contract.patches(patchToInstall.patchId);
            const chainHash = normalizeHash(String(onChain.fileHash));

            if (localHash !== chainHash) {
                setPhase("error");
                setPhaseMessage("Integrity check failed — hash mismatch. Update aborted.");
                showToast("Integrity check failed. File does not match blockchain hash.", "error");
                setFailedPatchId(patchToInstall.patchId);
                try {
                    await apiPost(
                        "/api/device/report",
                        { patchId: patchToInstall.patchId, status: "failure" },
                        address
                    );
                } catch {
                    /* best-effort log */
                }
                setInstalling(false);
                setInstallingPatchId(null);
                setTimeout(() => {
                    setPhase("idle");
                    setPhaseMessage("");
                }, 4500);
                return;
            }

            setPhase("approving");
            setPhaseMessage("Approve and sign the on-chain transaction (gas fees)…");
            const tx = await contract.reportInstallation(patchToInstall.patchId, true);
            const receipt = await tx.wait();
            if (!receipt) throw new Error("No receipt from network");

            const logIndex = findPatchInstalledLogIndex(contract, receipt, contractAddress);

            setPhase("downloading");
            setPhaseMessage("Downloading patch artifact…");
            triggerBrowserDownload(
                buf,
                getDownloadFilename(patchToInstall, responseDisposition, responseContentType, buf),
                effectiveDownloadType
            );

            setPhase("installing");
            setPhaseMessage("Simulating install (replace binaries / run installer)…");
            await new Promise((r) => setTimeout(r, 900));

            setPhase("reporting");
            setPhaseMessage("Syncing installation report to backend…");
            await apiPost(
                "/api/device/report",
                {
                    patchId: patchToInstall.patchId,
                    status: "success",
                    txHash: tx.hash,
                    logIndex: logIndex ?? undefined
                },
                address
            );

            setPhase("success");
            setPhaseMessage("Installation recorded on-chain and synced to backend.");
            showToast("Update installed and reported successfully.", "success");
            setRecommended(null);
            setUpToDate(true);
            await loadAll();
        } catch (e) {
            setPhase("error");
            setPhaseMessage(e instanceof Error ? e.message : "Installation failed");
            showToast(e instanceof Error ? e.message : "Installation failed", "error");
            setFailedPatchId(patchToInstall.patchId);
            setInstalling(false);
            setInstallingPatchId(null);
            setTimeout(() => {
                setPhase("idle");
                setPhaseMessage("");
            }, 4500);
            return;
        }
        setInstalling(false);
        setInstallingPatchId(null);
        setTimeout(() => {
            setPhase("idle");
            setPhaseMessage("");
        }, 3500);
    }

    const progress = PHASE_PROGRESS[phase];
    const lastLog = logs[0];

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Badge variant="warning" className="uppercase text-[10px]">
                                Patch agent
                            </Badge>
                        </div>
                        <h1 className="text-4xl font-black text-[#1A1A1A] tracking-tight">
                            Device control panel
                        </h1>
                        <p className="text-[#1A1A1A]/70 font-medium max-w-xl">
                            Check → fetch → verify (SHA-256 vs chain) → install (simulated) →
                            <code className="text-[#1A1A1A]/90 mx-1">reportInstallation</code> → backend log.
                        </p>
                    </div>
                </div>

                {deviceMissing && (
                    <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm">
                        No device record in the backend. Ask an admin to register this wallet on-chain and sync via{" "}
                        <span className="font-mono">Register Device</span>.
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <Card
                        className="lg:col-span-1"
                        title="Identity"
                        subtitle="Wallet + registration status"
                    >
                        <div className="space-y-4 pt-4">
                            <div className="p-3 rounded-xl bg-white border border-[#1A1A1A]/5">
                                <p className="text-[10px] uppercase font-bold text-[#1A1A1A]/50 mb-1">
                                    Wallet
                                </p>
                                <p className="text-xs font-mono text-[#1A1A1A] break-all">{address}</p>
                            </div>
                            {device && (
                                <>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div>
                                            <p className="text-[10px] text-[#1A1A1A]/50 uppercase font-bold">
                                                Device ID
                                            </p>
                                            <p className="font-mono text-[#1A1A1A]">{device.deviceId}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-[#1A1A1A]/50 uppercase font-bold">
                                                Status
                                            </p>
                                            <Badge variant="success">{device.status || "registered"}</Badge>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-[#1A1A1A]/50">
                                        Last seen:{" "}
                                        {device.lastSeen
                                            ? new Date(device.lastSeen).toLocaleString()
                                            : "—"}
                                    </p>
                                </>
                            )}
                        </div>
                    </Card>

                    <Card
                        className="lg:col-span-2"
                        title="System profile"
                        subtitle="Used to filter patches (namespace, platform, current version)"
                    >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                            <FormInput
                                label="Display name"
                                value={profileName}
                                onChange={(e) => setProfileName(e.target.value)}
                                placeholder="Drone fleet A-12"
                            />
                            <FormInput
                                label="Software namespace"
                                value={profileNs}
                                onChange={(e) => setProfileNs(e.target.value)}
                                placeholder="Must match patch software name"
                            />
                            <FormInput
                                label="Current version"
                                value={profileVer}
                                onChange={(e) => setProfileVer(e.target.value)}
                                placeholder="e.g. 1.0.5"
                            />
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-[#1A1A1A]/70 ml-1">
                                    Target platform
                                </label>
                                <select
                                    value={profilePlat}
                                    onChange={(e) => setProfilePlat(e.target.value)}
                                    className="w-full bg-white border border-[#1A1A1A]/10 rounded-xl px-4 py-3 text-[#1A1A1A] text-sm"
                                >
                                    <option value="">Any / not set</option>
                                    <option value="windows">windows</option>
                                    <option value="linux">linux</option>
                                    <option value="arm64">arm64</option>
                                    <option value="drone-os">drone-os</option>
                                </select>
                            </div>
                        </div>
                        <Button
                            className="mt-4"
                            disabled={deviceMissing || savingProfile}
                            isLoading={savingProfile}
                            onClick={() => void saveProfile()}
                        >
                            Save profile
                        </Button>
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="p-5 rounded-xl border border-[#1A1A1A]/5 bg-white/40 flex items-center gap-4">
                        <Cpu className="text-amber-500 shrink-0" size={28} />
                        <div>
                            <p className="text-[10px] uppercase font-bold text-[#1A1A1A]/50">Current version</p>
                            <p className="text-xl font-black text-[#1A1A1A]">
                                {profileVer || "—"}
                            </p>
                        </div>
                    </div>
                    <div className="p-5 rounded-xl border border-[#1A1A1A]/5 bg-white/40 flex items-center gap-4">
                        <Package className="text-blue-500 shrink-0" size={28} />
                        <div>
                            <p className="text-[10px] uppercase font-bold text-[#1A1A1A]/50">Updates available</p>
                            <p className="text-xl font-black text-[#1A1A1A]">
                                {stats?.updatesAvailable ?? 0}
                            </p>
                        </div>
                    </div>
                    <div className="p-5 rounded-xl border border-[#1A1A1A]/5 bg-white/40 flex items-center gap-4">
                        <Activity className="text-[#1A1A1A] shrink-0" size={28} />
                        <div>
                            <p className="text-[10px] uppercase font-bold text-[#1A1A1A]/50">Last install</p>
                            <p className="text-sm font-bold text-[#1A1A1A]">
                                {lastLog
                                    ? `${lastLog.status === "success" ? "✓" : "✗"} patch #${lastLog.patchId}`
                                    : "No history"}
                            </p>
                            <p className="text-[10px] text-[#1A1A1A]/50 font-mono">
                                {lastLog ? new Date(lastLog.timestamp).toLocaleString() : ""}
                            </p>
                        </div>
                    </div>
                </div>

                <Card
                    title="Patch status"
                    subtitle={upToDate ? "Up to date" : "A newer build matches your profile"}
                >
                    <div className="pt-4 space-y-4">
                        {updateHint && (
                            <p className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                                {updateHint}
                            </p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 ">
                            {upToDate ? (
                                <Badge variant="success" className="inline-flex items-center justify-between gap-2 py-1">
                                    <CheckCircle2 size={14} /> Up to date
                                </Badge>
                            ) : (
                                <Badge variant="warning" className="inline-flex items-center justify-between gap-2 py-1">
                                    <AlertCircle size={14} /> Update available
                                </Badge>
                            )}
                        </div>

                        {recommended && (
                            <div className="p-4 rounded-xl border border-emerald-500/25 bg-[#A9FD5F]/30 space-y-2">
                                <p className="text-sm font-bold text-[#1A1A1A]">
                                    {recommended.softwareName}{" "}
                                    <span className="text-[#1A1A1A]">v{recommended.version}</span>
                                </p>
                                <p className="text-xs text-[#1A1A1A]/50 font-mono">
                                    Patch #{recommended.patchId} · IPFS {recommended.ipfsHash.slice(0, 18)}…
                                </p>
                            </div>
                        )}

                        <div className="space-y-3">
                            <p className="text-xs uppercase tracking-widest font-bold text-[#1A1A1A]/50">
                                Available updates
                            </p>
                            {availableUpdates.length === 0 ? (
                                <p className="text-sm text-[#1A1A1A]/50">No applicable updates found.</p>
                            ) : (
                                availableUpdates.map((patch) => (
                                    <div
                                        key={patch.patchId}
                                        className="p-3 rounded-xl border border-[#1A1A1A]/10 bg-white/40 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                                    >
                                        <div>
                                            <p className="text-sm font-bold text-[#1A1A1A]">
                                                {patch.softwareName} <span className="text-[#1A1A1A]">v{patch.version}</span>
                                            </p>
                                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                                <Badge variant="warning" className="text-[10px]">
                                                    New update available
                                                </Badge>
                                                {patch.targetPlatform && (
                                                    <Badge variant="neutral" className="text-[10px] font-mono">
                                                        {patch.targetPlatform}
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-xs text-[#1A1A1A]/50 font-mono">
                                                Patch #{patch.patchId} · IPFS {patch.ipfsHash.slice(0, 18)}…
                                            </p>
                                        </div>
                                        <Button
                                            onClick={() => void runInstallPipeline(patch)}
                                            disabled={
                                                deviceMissing ||
                                                checking ||
                                                (installingPatchId !== null && installingPatchId !== patch.patchId)
                                            }
                                            isLoading={installingPatchId === patch.patchId}
                                            className="gap-2 bg-emerald-600 hover:bg-emerald-500 md:min-w-40"
                                        >
                                            <Download size={16} />
                                            Install update
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="pt-2 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-xs uppercase tracking-widest font-bold text-[#1A1A1A]/50 flex items-center gap-2">
                                    <SlidersHorizontal size={14} />
                                    Patch catalog
                                </p>
                                <Button
                                    onClick={() => setShowAllPatches((v) => !v)}
                                    className="h-8 px-3 text-xs"
                                    disabled={deviceMissing || installing || checking}
                                >
                                    {showAllPatches ? "Show applicable only" : "Show all patches"}
                                </Button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <FormInput
                                    label="Filter by software"
                                    value={filterSoftware}
                                    onChange={(e) => setFilterSoftware(e.target.value)}
                                    placeholder="e.g. drone firmware"
                                />
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-[#1A1A1A]/70 ml-1">
                                        Platform
                                    </label>
                                    <select
                                        value={filterPlatform}
                                        onChange={(e) => setFilterPlatform(e.target.value)}
                                        className="w-full bg-white border border-[#1A1A1A]/10 rounded-xl px-4 py-3 text-[#1A1A1A] text-sm"
                                    >
                                        <option value="">Any</option>
                                        <option value="windows">windows</option>
                                        <option value="linux">linux</option>
                                        <option value="arm64">arm64</option>
                                        <option value="drone-os">drone-os</option>
                                    </select>
                                </div>
                                <div className="flex items-end gap-2">
                                    <Button
                                        onClick={() => {
                                            setFilterSoftware("");
                                            setFilterPlatform("");
                                        }}
                                        className="h-11"
                                        disabled={deviceMissing || installing || checking}
                                    >
                                        Clear filters
                                    </Button>
                                </div>
                            </div>

                            {(() => {
                                const normalizedFilterSoftware = filterSoftware.trim().toLowerCase();
                                const normalizedFilterPlatform = filterPlatform.trim().toLowerCase();
                                const base = showAllPatches ? allPatches : availableUpdates;
                                const patchCatalog = base.filter((p) => {
                                    if (normalizedFilterSoftware) {
                                        const s = `${p.softwareName}`.toLowerCase();
                                        if (!s.includes(normalizedFilterSoftware)) return false;
                                    }
                                    if (normalizedFilterPlatform) {
                                        const pl = `${p.targetPlatform || ""}`.toLowerCase();
                                        if (pl !== normalizedFilterPlatform) return false;
                                    }
                                    return true;
                                });

                                if (patchCatalog.length === 0) {
                                    return (
                                        <p className="text-sm text-[#1A1A1A]/50">
                                            No patches match the current filters.
                                        </p>
                                    );
                                }

                                return (
                                    <div className="space-y-2">
                                        {patchCatalog.map((patch) => (
                                            <div
                                                key={`catalog-${patch.patchId}`}
                                                className="p-3 rounded-xl border border-[#1A1A1A]/60 bg-[#1A1A1A]/10 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                                            >
                                                <div>
                                                    <p className="text-sm font-bold text-[#1A1A1A]">
                                                        {patch.softwareName}{" "}
                                                        <span className="text-[#1A1A1A]">v{patch.version}</span>
                                                    </p>
                                                    <p className="text-xs text-[#1A1A1A]/50 font-mono">
                                                        Patch #{patch.patchId}
                                                        {patch.targetPlatform ? ` · ${patch.targetPlatform}` : ""} · IPFS{" "}
                                                        {patch.ipfsHash.slice(0, 18)}…
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        onClick={() => void runInstallPipeline(patch)}
                                                        disabled={
                                                            deviceMissing ||
                                                            checking ||
                                                            (installingPatchId !== null &&
                                                                installingPatchId !== patch.patchId)
                                                        }
                                                        isLoading={installingPatchId === patch.patchId}
                                                        className="gap-2 bg-emerald-600 hover:bg-emerald-500 md:min-w-40"
                                                    >
                                                        <Download size={16} />
                                                        Install
                                                    </Button>
                                                    {failedPatchId === patch.patchId && (
                                                        <Button
                                                            onClick={() => void runInstallPipeline(patch)}
                                                            disabled={deviceMissing || checking || installingPatchId !== null}
                                                            className="gap-2"
                                                        >
                                                            <RefreshCw size={16} />
                                                            Retry
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Button
                                onClick={() => void checkForUpdates()}
                                isLoading={checking}
                                disabled={deviceMissing}
                                className="gap-2"
                            >
                                <Fingerprint size={18} />
                                Check for updates
                            </Button>
                        </div>

                        {(installing || phase !== "idle") && phase !== "checking" && (
                            <div className="space-y-2 pt-2">
                                <div className="flex justify-between text-[10px] uppercase font-bold text-[#1A1A1A]/50">
                                    <span>Progress</span>
                                    <span>{phase}</span>
                                </div>
                                <div className="h-2 bg-[#EDEDED] rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-500 ${
                                            phase === "error" ? "bg-rose-500" : "bg-emerald-500"
                                        }`}
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                                <p className="text-xs text-[#1A1A1A]/70 flex items-center gap-2">
                                    {installing && phase !== "error" && phase !== "success" && (
                                        <Loader2 size={14} className="animate-spin text-[#1A1A1A]" />
                                    )}
                                    {phaseMessage}
                                </p>
                            </div>
                        )}
                    </div>
                </Card>

                <Card title="Installation history" subtitle="Backend mirror of reports (incl. chain sync)">
                    <div className="overflow-x-auto pt-2">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-[10px] uppercase text-[#1A1A1A]/50 border-b border-[#1A1A1A]/5">
                                    <th className="pb-2 pr-4">Patch</th>
                                    <th className="pb-2 pr-4">Version</th>
                                    <th className="pb-2 pr-4">Status</th>
                                    <th className="pb-2">Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log) => (
                                    <tr key={log._id} className="border-b border-[#1A1A1A]/5">
                                        <td className="py-3 font-mono text-[#1A1A1A]">
                                            #{log.patchId}
                                        </td>
                                        <td className="py-3 text-[#1A1A1A]/70">—</td>
                                        <td className="py-3">
                                            {log.status === "success" ? (
                                                <span className="text-[#1A1A1A] flex items-center gap-1">
                                                    <ShieldCheck size={14} /> Success
                                                </span>
                                            ) : (
                                                <span className="text-rose-400 flex items-center gap-1">
                                                    <XCircle size={14} /> Failure
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-3 text-xs text-[#1A1A1A]/50 font-mono">
                                            {new Date(log.timestamp).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {logs.length === 0 && (
                            <p className="text-center text-[#1A1A1A]/50 text-sm py-8">
                                No installation events yet.
                            </p>
                        )}
                    </div>
                </Card>
            </div>
        </DashboardLayout>
    );
}
