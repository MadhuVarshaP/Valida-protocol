"use client";

import React, { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, StatCard } from "@/components/Cards";
import { Badge, Button, EmptyState } from "@/components/UI";
import { BrowserProvider, Contract } from "ethers";
import { zkVerifierContractAbi, getZKVerifierAddress, ZKProof, ZK_TEMPLATES } from "@/lib/zkProofContractAbi";
import { RefreshCw, AlertTriangle, ShieldCheck, Cpu, CheckCircle2, Clock } from "lucide-react";

const explorerBase = process.env.NEXT_PUBLIC_EXPLORER_BASE_URL ?? "https://explorer-testnet.iopn.io";

function templateName(t: number): string {
    return ZK_TEMPLATES[t as keyof typeof ZK_TEMPLATES]?.name ?? `Template ${t}`;
}

type ZKRow = ZKProof & { submissionId: number };

export default function AdminZKProofsPage() {
    const [proofs, setProofs] = useState<ZKRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [contractError, setContractError] = useState<string | null>(null);

    const loadProofs = useCallback(async () => {
        setIsLoading(true);
        setContractError(null);
        try {
            const zkAddr = getZKVerifierAddress();
            const eth = (window as unknown as { ethereum?: object }).ethereum;
            if (!eth) throw new Error("No wallet provider");
            const provider = new BrowserProvider(eth as Parameters<typeof BrowserProvider>[0]);
            const zkContract = new Contract(zkAddr, zkVerifierContractAbi, provider);

            // Scan recent ZKProofVerified events to find submission IDs
            const filter = zkContract.filters.ZKProofVerified();
            const events = await zkContract.queryFilter(filter, -10000);

            const seen = new Set<number>();
            const rows: ZKRow[] = [];

            for (const event of events) {
                const id = Number((event as unknown as { args: [bigint, string, number] }).args[0]);
                if (seen.has(id)) continue;
                seen.add(id);
                try {
                    const raw = await zkContract.getZKProof(id);
                    rows.push({
                        submissionId: id,
                        prover: raw.prover as string,
                        a: [BigInt(raw.a[0]), BigInt(raw.a[1])],
                        b: [[BigInt(raw.b[0][0]), BigInt(raw.b[0][1])], [BigInt(raw.b[1][0]), BigInt(raw.b[1][1])]],
                        c: [BigInt(raw.c[0]), BigInt(raw.c[1])],
                        publicSignals: [
                            BigInt(raw.publicSignals[0]),
                            BigInt(raw.publicSignals[1]),
                            BigInt(raw.publicSignals[2]),
                            BigInt(raw.publicSignals[3]),
                        ],
                        verified: raw.verified as boolean,
                        templateType: Number(raw.templateType),
                        verifiedAt: Number(raw.verifiedAt),
                    });
                } catch { /* skip */ }
            }

            setProofs(rows.reverse());
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setContractError(
                msg.includes("ZK_VERIFIER_ADDRESS") ? "ZK Verifier contract not configured." : "Failed to load ZK proofs."
            );
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { void loadProofs(); }, [loadProofs]);

    const verified = proofs.filter(p => p.verified).length;

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-4xl font-black tracking-tight text-[#1A1A1A]/90">ZK Proof Submissions</h1>
                        <p className="text-[#1A1A1A]/70 font-medium mt-2">
                            Zero-knowledge proof submissions from auditors using Groth16 circuits.
                        </p>
                    </div>
                    <Button variant="outline" onClick={() => void loadProofs()} className="gap-2">
                        <RefreshCw size={15} />
                        Refresh
                    </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <StatCard icon={Cpu} label="Total ZK Proofs" value={proofs.length} />
                    <StatCard icon={ShieldCheck} label="Verified" value={verified} trendType="up" />
                    <StatCard icon={Clock} label="Pending" value={proofs.length - verified} />
                </div>

                <Card title="ZK Proof Records" subtitle="All on-chain Groth16 proof submissions and verification status">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="h-10 w-10 rounded-full border-4 border-[#A9FD5F] border-t-transparent animate-spin" />
                        </div>
                    ) : contractError ? (
                        <div className="flex flex-col items-center gap-3 py-10 text-center">
                            <AlertTriangle size={24} className="text-[#1A1A1A]/40" />
                            <p className="text-sm text-[#1A1A1A]/60 max-w-sm">{contractError}</p>
                        </div>
                    ) : proofs.length === 0 ? (
                        <EmptyState
                            icon={Cpu}
                            title="No ZK proofs yet"
                            description="Auditors can submit Groth16 proofs from the Generate Proof page."
                        />
                    ) : (
                        <div className="space-y-4">
                            {proofs.map(proof => (
                                <ZKProofRow key={proof.submissionId} proof={proof} explorerBase={explorerBase} />
                            ))}
                        </div>
                    )}
                </Card>
            </div>
        </DashboardLayout>
    );
}

function ZKProofRow({ proof, explorerBase }: { proof: ZKRow; explorerBase: string }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="border border-[#1A1A1A]/10 rounded-xl overflow-hidden">
            <div
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-[#EDEDED]/30 transition-colors"
                onClick={() => setExpanded(e => !e)}
            >
                <span className="font-black text-[#1A1A1A] font-mono w-8 shrink-0">#{proof.submissionId}</span>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-[#1A1A1A]">{templateName(proof.templateType)}</span>
                        <span className="text-xs text-[#1A1A1A]/50">Template {proof.templateType}</span>
                    </div>
                    <p className="text-xs text-[#1A1A1A]/40 font-mono mt-0.5">
                        {proof.prover.slice(0, 8)}...{proof.prover.slice(-6)}
                    </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={proof.verified ? "success" : "warning"}>
                        {proof.verified ? "VERIFIED" : "PENDING"}
                    </Badge>
                </div>
            </div>

            {expanded && (
                <div className="border-t border-[#1A1A1A]/10 p-4 space-y-4 bg-[#EDEDED]/10">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-3 bg-white rounded-lg">
                            <p className="text-[#1A1A1A]/50 font-bold uppercase tracking-wider mb-1">Verified At</p>
                            <p className="text-[#1A1A1A] font-medium">
                                {proof.verifiedAt > 0 ? new Date(proof.verifiedAt * 1000).toLocaleString() : "—"}
                            </p>
                        </div>
                        <div className="p-3 bg-white rounded-lg">
                            <p className="text-[#1A1A1A]/50 font-bold uppercase tracking-wider mb-1">Template</p>
                            <p className="text-[#1A1A1A] font-medium">{templateName(proof.templateType)} (ID: {proof.templateType})</p>
                        </div>

                        {/* Public signals */}
                        <div className="p-3 bg-white rounded-lg col-span-2">
                            <p className="text-[#1A1A1A]/50 font-bold uppercase tracking-wider mb-2">Public Signals</p>
                            <div className="space-y-1">
                                {["functionSelector", "expectedAuthState", "systemCodeHash", "commitmentHash"].map((name, i) => (
                                    <div key={name} className="flex items-start gap-2">
                                        <span className="text-[#1A1A1A]/40 w-36 shrink-0">{name}</span>
                                        <code className="text-[10px] font-mono text-[#1A1A1A]/70 break-all">
                                            {proof.publicSignals[i].toString(16).padStart(64, "0")}
                                        </code>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Proof components */}
                        <div className="p-3 bg-white rounded-lg col-span-2">
                            <p className="text-[#1A1A1A]/50 font-bold uppercase tracking-wider mb-2">Proof (a, b, c)</p>
                            <div className="space-y-1 font-mono text-[10px] text-[#1A1A1A]/50 break-all">
                                <div><span className="text-[#1A1A1A]/70 font-bold mr-2">a:</span>[{proof.a[0].toString().slice(0, 12)}..., {proof.a[1].toString().slice(0, 12)}...]</div>
                                <div><span className="text-[#1A1A1A]/70 font-bold mr-2">c:</span>[{proof.c[0].toString().slice(0, 12)}..., {proof.c[1].toString().slice(0, 12)}...]</div>
                            </div>
                        </div>
                    </div>

                    {proof.verified && (
                        <div className="flex items-center gap-2 p-3 bg-[#A9FD5F]/20 rounded-lg border border-[#A9FD5F]">
                            <CheckCircle2 size={14} className="text-[#1A1A1A] shrink-0" />
                            <p className="text-sm font-semibold text-[#1A1A1A]">
                                Proof verified on-chain — submission auto-advanced to Verified status.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
