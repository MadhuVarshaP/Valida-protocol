"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, StatCard } from "@/components/Cards";
import { Badge, Button, EmptyState } from "@/components/UI";
import { useValidaProgram } from "@/hooks/useValidaProgram";
import { fetchConfig, fetchAllPatches, type PatchAccount } from "@/lib/solana/valida";
import { explorerAddress } from "@/lib/solana/constants";
import { patchPda } from "@/lib/solana/pdas";
import {
  sha256OfBytes,
  fetchFileBytes,
  fileHashHex,
  isLocalCid,
  storageBackend,
} from "@/lib/solana/ipfs";
import {
  Package,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Download,
  Hash,
  CheckCircle2,
  XCircle,
  ExternalLink,
  AlertTriangle,
  HardDriveDownload,
  FileUp,
} from "lucide-react";

type Phase =
  | "idle"
  | "downloading"
  | "hashing"
  | "matched"
  | "mismatch"
  | "installing"
  | "installed"
  | "error";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "",
  downloading: "Downloading patch package from IPFS…",
  hashing: "Recomputing SHA-256 and comparing to the on-chain hash…",
  matched: "Integrity verified — hash matches the Solana record.",
  mismatch: "BLOCKED — file hash does not match the on-chain record.",
  installing: "Installing patch…",
  installed: "Patch installed. Integrity proven against Solana devnet.",
  error: "",
};

export default function VerifyInstallPage() {
  const { program } = useValidaProgram();
  const manualRef = useRef<HTMLInputElement>(null);

  const [patches, setPatches] = useState<PatchAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string>("");
  const [computedHash, setComputedHash] = useState<string | null>(null);

  const backend = storageBackend();

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const config = await fetchConfig(program);
      if (!config) {
        setError("Program not initialized on this cluster.");
        return;
      }
      const all = await fetchAllPatches(program, Number(config.patchCount));
      setPatches(all);
      setSelectedId((prev) => prev ?? all[all.length - 1]?.patchId ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load patches.");
    } finally {
      setIsLoading(false);
    }
  }, [program]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => patches.find((p) => p.patchId === selectedId) ?? null,
    [patches, selectedId]
  );

  const onChainHash = selected ? fileHashHex(selected.fileHash) : null;

  const resetVerification = () => {
    setPhase("idle");
    setMessage("");
    setComputedHash(null);
  };

  useEffect(() => {
    resetVerification();
  }, [selectedId]);

  /** Core integrity check: hash the bytes and compare to the on-chain file_hash. */
  const verifyBytes = async (buffer: ArrayBuffer): Promise<boolean> => {
    if (!selected) return false;
    setPhase("hashing");
    const { hex } = await sha256OfBytes(buffer);
    setComputedHash(hex);
    const matches = hex.toLowerCase() === fileHashHex(selected.fileHash).toLowerCase();
    setPhase(matches ? "matched" : "mismatch");
    setMessage(PHASE_LABEL[matches ? "matched" : "mismatch"]);
    return matches;
  };

  const handleVerifyFromIpfs = async () => {
    if (!selected) return;
    resetVerification();
    try {
      setPhase("downloading");
      setMessage(PHASE_LABEL.downloading);
      const buffer = await fetchFileBytes(selected.ipfsCid);
      await verifyBytes(buffer);
    } catch (err: unknown) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Could not download the patch file.");
    }
  };

  const handleVerifyFromFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked || !selected) return;
    resetVerification();
    try {
      await verifyBytes(await picked.arrayBuffer());
    } catch (err: unknown) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Could not read the file.");
    } finally {
      if (manualRef.current) manualRef.current.value = "";
    }
  };

  const handleInstall = async () => {
    setPhase("installing");
    setMessage(PHASE_LABEL.installing);
    await new Promise((r) => setTimeout(r, 900));
    setPhase("installed");
    setMessage(PHASE_LABEL.installed);
  };

  const canInstall = phase === "matched" && selected?.isVerified === true;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-[#1A1A1A] leading-tight tracking-tight">Device Verify &amp; Install</h1>
            <p className="text-[#1A1A1A]/70 font-medium">
              The device side of BPMS — pull a patch&apos;s hash straight from Solana, re-download the file, recompute SHA-256, and only install if it matches.
            </p>
          </div>
          <Button variant="outline" onClick={() => void load()} className="gap-2">
            <RefreshCw size={15} /> Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <StatCard icon={Package} label="Patches On-Chain" value={patches.length} />
          <StatCard icon={ShieldCheck} label="Admin-Verified" value={patches.filter((p) => p.isVerified).length} />
          <StatCard icon={HardDriveDownload} label="Storage Backend" value={backend === "Pinata IPFS" ? "IPFS" : "Local"} />
        </div>

        {isLoading ? (
          <Card>
            <div className="flex items-center justify-center py-12">
              <div className="h-10 w-10 rounded-full border-4 border-[#A9FD5F] border-t-transparent animate-spin" />
            </div>
          </Card>
        ) : error ? (
          <Card>
            <div className="flex items-center gap-3 py-8 justify-center text-[#1A1A1A]/60">
              <AlertTriangle size={18} /> <p className="text-sm">{error}</p>
            </div>
          </Card>
        ) : patches.length === 0 ? (
          <Card>
            <EmptyState icon={Package} title="No patches on-chain yet" description="Publish a patch from the Patch Publishing page first, then verify it here." />
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Patch picker */}
            <div className="lg:col-span-1">
              <Card title="Available Patches" subtitle="Select one to verify">
                <div className="space-y-2">
                  {patches.map((p) => (
                    <button
                      key={p.patchId}
                      onClick={() => setSelectedId(p.patchId)}
                      data-testid={`verify-pick-${p.patchId}`}
                      className={`w-full text-left p-3 rounded-xl border transition-colors ${
                        selectedId === p.patchId
                          ? "border-[#A9FD5F] bg-[#A9FD5F]/20"
                          : "border-[#1A1A1A]/10 bg-white hover:bg-[#EDEDED]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-[#1A1A1A]">{p.softwareName}</span>
                        {p.isVerified ? <Badge variant="success">VERIFIED</Badge> : <Badge variant="neutral">UNVERIFIED</Badge>}
                      </div>
                      <span className="text-[10px] text-[#1A1A1A]/50 font-bold uppercase tracking-widest">
                        #{p.patchId} · build {p.version}
                      </span>
                    </button>
                  ))}
                </div>
              </Card>
            </div>

            {/* Verification panel */}
            <div className="lg:col-span-2">
              {selected && (
                <Card title={`Patch #${selected.patchId} — ${selected.softwareName} ${selected.version}`} subtitle="On-chain integrity record">
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-3">
                      <HashRow label="On-chain SHA-256 (file_hash)" value={onChainHash ?? ""} icon={<Hash size={11} />} />
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#1A1A1A]/50">IPFS CID</p>
                        <code className="block text-[10px] font-mono text-[#1A1A1A] break-all bg-[#EDEDED] rounded-lg p-2">
                          {selected.ipfsCid}{isLocalCid(selected.ipfsCid) ? "  (local content store)" : ""}
                        </code>
                      </div>
                      <div className="flex items-center gap-4 flex-wrap text-xs">
                        <span className="flex items-center gap-1.5 font-bold text-[#1A1A1A]/60">
                          Admin status:
                          {selected.isVerified ? (
                            <span className="text-emerald-600 flex items-center gap-1"><ShieldCheck size={13} /> verify_patch ✓</span>
                          ) : (
                            <span className="text-amber-600 flex items-center gap-1"><ShieldAlert size={13} /> not yet verified</span>
                          )}
                        </span>
                        <a
                          href={explorerAddress(patchPda(selected.patchId).toBase58())}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#1A1A1A]/50 hover:underline flex items-center gap-1 font-mono"
                        >
                          view PatchRecord account <ExternalLink size={11} />
                        </a>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button variant="primary" className="gap-2" onClick={() => void handleVerifyFromIpfs()} data-testid="verify-from-ipfs"
                        isLoading={phase === "downloading" || phase === "hashing"}>
                        <Download size={15} /> Download &amp; Verify Hash
                      </Button>
                      <Button variant="outline" className="gap-2" onClick={() => manualRef.current?.click()} data-testid="verify-from-file">
                        <FileUp size={15} /> Verify a Local File
                      </Button>
                      <input ref={manualRef} type="file" className="hidden" onChange={(e) => void handleVerifyFromFile(e)} />
                    </div>

                    {computedHash && (
                      <HashRow
                        label="Recomputed SHA-256 (from the downloaded bytes)"
                        value={computedHash}
                        icon={<Hash size={11} />}
                        tone={phase === "mismatch" ? "bad" : phase === "matched" ? "good" : undefined}
                      />
                    )}

                    {phase !== "idle" && (
                      <VerdictBanner phase={phase} message={message} />
                    )}

                    {phase === "matched" && !selected.isVerified && (
                      <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                        <ShieldAlert size={14} className="text-amber-600 shrink-0" />
                        <p className="text-xs text-amber-700">
                          Hash is authentic, but this patch has not been admin-verified on-chain (<code>verify_patch</code>). Install is held until it is.
                        </p>
                      </div>
                    )}

                    {(phase === "matched" || phase === "installing" || phase === "installed") && (
                      <Button
                        variant="primary"
                        className="w-full gap-2"
                        disabled={phase === "installed" || !canInstall}
                        isLoading={phase === "installing"}
                        onClick={() => void handleInstall()}
                        data-testid="install-btn"
                      >
                        <CheckCircle2 size={15} />
                        {phase === "installed" ? "Installed" : "Install Patch"}
                      </Button>
                    )}
                  </div>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function HashRow({ label, value, icon, tone }: { label: string; value: string; icon?: React.ReactNode; tone?: "good" | "bad" }) {
  const ring = tone === "good" ? "border-emerald-300 bg-emerald-50" : tone === "bad" ? "border-rose-300 bg-rose-50" : "border-transparent bg-[#EDEDED]";
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#1A1A1A]/50 flex items-center gap-1">{icon}{label}</p>
      <code className={`block text-[10px] font-mono text-[#1A1A1A] break-all rounded-lg p-2 border ${ring}`}>{value}</code>
    </div>
  );
}

function VerdictBanner({ phase, message }: { phase: Phase; message: string }) {
  if (phase === "mismatch") {
    return (
      <div className="flex items-center gap-3 p-4 bg-rose-50 rounded-xl border border-rose-300" data-testid="verdict-mismatch">
        <XCircle size={20} className="text-rose-600 shrink-0" />
        <p className="text-sm font-bold text-rose-700">{message}</p>
      </div>
    );
  }
  if (phase === "matched" || phase === "installed") {
    return (
      <div className="flex items-center gap-3 p-4 bg-[#A9FD5F]/20 rounded-xl border border-[#A9FD5F]" data-testid="verdict-matched">
        <CheckCircle2 size={20} className="text-[#1A1A1A] shrink-0" />
        <p className="text-sm font-bold text-[#1A1A1A]">{message}</p>
      </div>
    );
  }
  if (phase === "error") {
    return (
      <div className="flex items-center gap-3 p-4 bg-rose-50 rounded-xl border border-rose-200">
        <AlertTriangle size={18} className="text-rose-600 shrink-0" />
        <p className="text-sm text-rose-700">{message}</p>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
      <div className="h-3.5 w-3.5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin shrink-0" />
      <p className="text-xs text-blue-700 font-medium">{message}</p>
    </div>
  );
}
