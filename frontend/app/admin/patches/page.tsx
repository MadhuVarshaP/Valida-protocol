"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, StatCard } from "@/components/Cards";
import { Badge, Button, EmptyState } from "@/components/UI";
import { FormInput } from "@/components/Forms";
import { useZyraProgram } from "@/hooks/useZyraProgram";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { SystemProgram } from "@solana/web3.js";
import { fetchConfig, fetchAllPatches, type PatchAccount } from "@/lib/solana/zyra";
import { configPda, patchPda } from "@/lib/solana/pdas";
import { explorerTx } from "@/lib/solana/constants";
import { sha256OfBytes, uploadFileToIPFS, storageBackend } from "@/lib/solana/ipfs";
import { Package, CheckCircle2, Clock, RefreshCw, ExternalLink, AlertTriangle, ShieldCheck, Upload, FileUp, Hash, Database } from "lucide-react";

type PublishPhase = "idle" | "hashing" | "uploading" | "committing";

const PHASE_LABEL: Record<PublishPhase, string> = {
  idle: "",
  hashing: "Computing SHA-256 of the patch file…",
  uploading: "Pinning the patch file to IPFS…",
  committing: "Committing { CID, hash } on Solana devnet…",
};

export default function AdminPatches() {
  const { program } = useZyraProgram();
  const anchorWallet = useAnchorWallet();
  const fileRef = useRef<HTMLInputElement>(null);

  const [patches, setPatches] = useState<PatchAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<{ action: string; sig: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [phase, setPhase] = useState<PublishPhase>("idle");

  const [form, setForm] = useState({ softwareName: "", version: "" });
  const [file, setFile] = useState<File | null>(null);
  const [fileHashHex, setFileHashHex] = useState<string | null>(null);

  const backend = storageBackend();

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const config = await fetchConfig(program);
      if (!config) {
        setError("Program not initialized.");
        return;
      }
      setPatches(await fetchAllPatches(program, Number(config.patchCount)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load patches.");
    } finally {
      setIsLoading(false);
    }
  }, [program]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (f: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [f]: e.target.value }));

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    setFile(picked);
    setFileHashHex(null);
    if (!picked) return;
    // Hash immediately so the presenter can show the integrity hash before publishing.
    const { hex } = await sha256OfBytes(await picked.arrayBuffer());
    setFileHashHex(hex);
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!anchorWallet) {
      alert("Connect the admin wallet first.");
      return;
    }
    if (!form.softwareName.trim() || !form.version.trim()) {
      setError("Software name and version are required.");
      return;
    }
    if (!file) {
      setError("Select the patch file to publish — its SHA-256 is what gets committed on-chain.");
      return;
    }
    setBusy("publish");
    setError(null);
    try {
      const config = await fetchConfig(program);
      if (!config) throw new Error("Program not initialized.");
      const patchId = Number(config.patchCount);

      // 1. SHA-256 the real file bytes — this is the on-chain integrity hash.
      setPhase("hashing");
      const buffer = await file.arrayBuffer();
      const { bytes, hex } = await sha256OfBytes(buffer);
      setFileHashHex(hex);

      // 2. Store the file on IPFS (Pinata when configured, local content store otherwise).
      setPhase("uploading");
      const { cid } = await uploadFileToIPFS(file);

      // 3. Commit { ipfs_cid, file_hash } on Solana devnet — a real transaction.
      setPhase("committing");
      const sig = await program.methods
        .publishPatch(form.softwareName.trim(), form.version.trim(), cid, bytes)
        .accountsPartial({ patch: patchPda(patchId), config: configPda(), admin: anchorWallet.publicKey, systemProgram: SystemProgram.programId })
        .rpc();

      setTx({ action: `publish patch #${patchId} (${form.softwareName.trim()} ${form.version.trim()})`, sig });
      setForm({ softwareName: "", version: "" });
      setFile(null);
      setFileHashHex(null);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setBusy(null);
      setPhase("idle");
    }
  };

  const handleVerify = async (patchId: number) => {
    if (!anchorWallet) {
      alert("Connect the admin wallet first.");
      return;
    }
    setBusy(`verify-${patchId}`);
    try {
      const sig = await program.methods
        .verifyPatch(new BN(patchId))
        .accountsPartial({ patch: patchPda(patchId), config: configPda(), admin: anchorWallet.publicKey })
        .rpc();
      setTx({ action: `verify patch #${patchId}`, sig });
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Verify failed.");
    } finally {
      setBusy(null);
    }
  };

  const verified = patches.filter((p) => p.isVerified).length;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-[#1A1A1A] leading-tight tracking-tight">Patch Publishing</h1>
            <p className="text-[#1A1A1A]/70 font-medium">BPMS layer — store the patch file on IPFS and commit its SHA-256 hash on Solana devnet. Devices verify that hash before installing.</p>
          </div>
          <Button variant="outline" onClick={() => void load()} className="gap-2">
            <RefreshCw size={15} /> Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <StatCard icon={Package} label="Total Patches" value={patches.length} />
          <StatCard icon={ShieldCheck} label="Verified" value={verified} trendType="up" />
          <StatCard icon={Clock} label="Awaiting Verification" value={patches.length - verified} />
        </div>

        {tx && (
          <div className="flex items-center gap-4 p-4 bg-[#A9FD5F]/20 rounded-xl border border-[#A9FD5F]">
            <CheckCircle2 size={18} className="text-[#1A1A1A] shrink-0" />
            <p className="text-sm font-bold text-[#1A1A1A] flex-1">Confirmed on Solana devnet: {tx.action}</p>
            <a href={explorerTx(tx.sig)} target="_blank" rel="noreferrer" className="text-xs font-mono text-[#1A1A1A]/60 flex items-center gap-1 hover:underline">
              {tx.sig.slice(0, 20)}... <ExternalLink size={11} />
            </a>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <Card title="Publish Patch" subtitle="File → IPFS → hash on-chain">
              <form onSubmit={(e) => void handlePublish(e)} className="space-y-4">
                <FormInput label="Software Name" placeholder="e.g. OpenSSL" value={form.softwareName} onChange={set("softwareName")} data-testid="patch-software" />
                <FormInput label="Version" placeholder="e.g. 3.1.0" value={form.version} onChange={set("version")} data-testid="patch-version" />

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#1A1A1A]/50">Patch File</label>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-[#1A1A1A]/20 bg-[#EDEDED] hover:bg-[#A9FD5F]/20 transition-colors text-left"
                    data-testid="patch-file-btn"
                  >
                    <FileUp size={18} className="text-[#1A1A1A]/60 shrink-0" />
                    <span className="text-sm font-medium text-[#1A1A1A] truncate">
                      {file ? `${file.name} (${(file.size / 1024).toFixed(1)} KB)` : "Choose the patch binary / package…"}
                    </span>
                  </button>
                  <input ref={fileRef} type="file" className="hidden" onChange={(e) => void onPickFile(e)} data-testid="patch-file" />
                </div>

                {fileHashHex && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#1A1A1A]/50 flex items-center gap-1">
                      <Hash size={11} /> SHA-256 (to be committed on-chain)
                    </p>
                    <code className="block text-[10px] font-mono text-[#1A1A1A] break-all bg-[#EDEDED] rounded-lg p-2" data-testid="patch-computed-hash">
                      {fileHashHex}
                    </code>
                  </div>
                )}

                <div className="flex items-center gap-2 text-[11px] font-bold text-[#1A1A1A]/50">
                  <Database size={12} />
                  Storage backend: <span className="text-[#1A1A1A]">{backend}</span>
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 bg-rose-50 rounded-lg border border-rose-200">
                    <AlertTriangle size={14} className="text-rose-600 shrink-0" />
                    <p className="text-xs text-rose-700">{error}</p>
                  </div>
                )}

                {phase !== "idle" && (
                  <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="h-3.5 w-3.5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin shrink-0" />
                    <p className="text-xs text-blue-700 font-medium">{PHASE_LABEL[phase]}</p>
                  </div>
                )}

                <Button type="submit" variant="primary" isLoading={busy === "publish"} className="w-full gap-2" data-testid="patch-publish">
                  <Upload size={15} /> Publish Patch On-Chain
                </Button>
              </form>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card title="On-Chain Patches" subtitle="All patches anchored in the program">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-10 w-10 rounded-full border-4 border-[#A9FD5F] border-t-transparent animate-spin" />
                </div>
              ) : patches.length === 0 ? (
                <EmptyState icon={Package} title="No patches yet" description="Publish your first patch using the form." />
              ) : (
                <div className="table-container">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Software / Version</th>
                        <th>IPFS CID</th>
                        <th>Status</th>
                        <th className="text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patches.map((p) => (
                        <tr key={p.patchId} className="group hover:bg-white/1" data-testid={`patch-${p.patchId}`}>
                          <td className="font-mono text-[#1A1A1A] text-xs font-bold">#{p.patchId}</td>
                          <td>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-[#1A1A1A]">{p.softwareName}</span>
                              <span className="text-[10px] text-[#1A1A1A]/50 font-bold uppercase tracking-widest mt-0.5">Build {p.version}</span>
                            </div>
                          </td>
                          <td className="text-xs font-mono text-[#1A1A1A]/60">{p.ipfsCid.slice(0, 18)}…</td>
                          <td>
                            {p.isVerified ? <Badge variant="success">VERIFIED</Badge> : <Badge variant="neutral">UNVERIFIED</Badge>}
                          </td>
                          <td className="text-right">
                            {p.isVerified ? (
                              <span className="text-xs text-emerald-600 font-bold flex items-center gap-1 justify-end">
                                <CheckCircle2 size={12} /> Safe to distribute
                              </span>
                            ) : (
                              <Button variant="secondary" size="sm" isLoading={busy === `verify-${p.patchId}`} onClick={() => void handleVerify(p.patchId)} data-testid={`verify-patch-${p.patchId}`}>
                                Verify
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
