"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/Cards";
import { Button } from "@/components/UI";
import { FormInput } from "@/components/Forms";
import { useWallet } from "@/context/WalletContext";
import { getContractWithSigner } from "@/lib/ethers";
import { BrowserProvider, Contract, keccak256, toUtf8Bytes } from "ethers";
import {
    vulnContractAbi,
    getVulnContractAddress,
    parseSubmission,
    VulnSubmission,
} from "@/lib/vulnerabilityContractAbi";
import {
    zkVerifierContractAbi,
    getZKVerifierAddress,
    ZK_TEMPLATES,
} from "@/lib/zkProofContractAbi";
import {
    Cpu,
    AlertTriangle,
    CheckCircle2,
    ExternalLink,
    RefreshCw,
    ShieldCheck,
    Info,
    Zap,
} from "lucide-react";

const explorerBase = process.env.NEXT_PUBLIC_EXPLORER_BASE_URL ?? "https://explorer-testnet.iopn.io";

type ProofGenPhase =
    | "idle"
    | "computing-witness"
    | "generating-proof"
    | "submitting"
    | "done"
    | "error";

type ProofGenState = {
    phase: ProofGenPhase;
    message?: string;
    txHash?: string;
    error?: string;
};

type ZKInput = {
    exploitInput: string;
    salt: string;
    functionSelector: string;
    expectedAuthState: string;
    systemCodeHash: string;
};

const TEMPLATE_1 = ZK_TEMPLATES[1];

export default function AuditorGenerateProofPage() {
    const { address } = useWallet();
    const [submissions, setSubmissions] = useState<VulnSubmission[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [isLoadingSubs, setIsLoadingSubs] = useState(true);
    const [proofState, setProofState] = useState<ProofGenState>({ phase: "idle" });
    const workerRef = useRef<Worker | null>(null);

    const [input, setInput] = useState<ZKInput>({
        exploitInput: "",
        salt: "",
        functionSelector: "",
        expectedAuthState: "",
        systemCodeHash: "",
    });

    const loadSubmissions = useCallback(async () => {
        if (!address) return;
        setIsLoadingSubs(true);
        try {
            const vulnAddr = getVulnContractAddress();
            const eth = (window as unknown as { ethereum?: object }).ethereum;
            if (!eth) return;
            const provider = new BrowserProvider(eth as Parameters<typeof BrowserProvider>[0]);
            const contract = new Contract(vulnAddr, vulnContractAbi, provider);
            const count = Number(await contract.submissionCount());
            const mine: VulnSubmission[] = [];
            for (let i = 1; i <= count; i++) {
                const raw = await contract.getSubmission(i);
                const sub = parseSubmission(raw);
                if (sub.auditor.toLowerCase() === address.toLowerCase() && sub.status === 0) {
                    mine.push(sub);
                }
            }
            setSubmissions(mine.reverse());
        } catch { /* silently fail */ }
        finally { setIsLoadingSubs(false); }
    }, [address]);

    useEffect(() => { void loadSubmissions(); }, [loadSubmissions]);

    // Terminate worker on unmount
    useEffect(() => () => { workerRef.current?.terminate(); }, []);

    const setField = (field: keyof ZKInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setInput(prev => ({ ...prev, [field]: e.target.value }));

    const validate = (): string | null => {
        if (!selectedId) return "Select a submission";
        if (!input.exploitInput.trim()) return "Exploit input is required";
        if (!input.salt.trim()) return "Salt is required (32-byte hex or string)";
        if (!input.functionSelector.trim()) return "Function selector is required";
        if (!input.expectedAuthState.trim()) return "Expected auth state is required";
        if (!input.systemCodeHash.trim()) return "System code hash is required";
        return null;
    };

    const toField = (val: string): bigint => {
        const trimmed = val.trim();
        if (/^0x[0-9a-fA-F]+$/.test(trimmed)) return BigInt(trimmed);
        if (/^\d+$/.test(trimmed)) return BigInt(trimmed);
        // Hash string inputs
        return BigInt(keccak256(toUtf8Bytes(trimmed)));
    };

    const handleGenerateProof = async (e: React.FormEvent) => {
        e.preventDefault();
        const validationError = validate();
        if (validationError) { setProofState({ phase: "error", error: validationError }); return; }

        setProofState({ phase: "computing-witness", message: "Initializing circuit..." });

        try {
            const exploitVal = toField(input.exploitInput);
            const saltVal = toField(input.salt);
            const funcSel = toField(input.functionSelector);
            const authState = toField(input.expectedAuthState);
            const codeHash = toField(input.systemCodeHash);

            const circuitInput = {
                exploitInput: exploitVal.toString(),
                salt: saltVal.toString(),
                functionSelector: funcSel.toString(),
                expectedAuthState: authState.toString(),
                systemCodeHash: codeHash.toString(),
                commitmentHash: "0", // computed by circuit via Poseidon
            };

            // Run proof generation in Web Worker
            const worker = new Worker("/workers/proofWorker.js");
            workerRef.current = worker;

            await new Promise<void>((resolve, reject) => {
                worker.onmessage = async (ev) => {
                    const { type, message, proof, publicSignals, calldata, error } = ev.data as {
                        type: string;
                        message?: string;
                        proof?: unknown;
                        publicSignals?: string[];
                        calldata?: string;
                        error?: string;
                    };

                    if (type === "STATUS") {
                        setProofState({ phase: "generating-proof", message });
                    } else if (type === "ERROR") {
                        reject(new Error(error));
                    } else if (type === "DONE" && calldata && publicSignals) {
                        // Parse calldata: [a, b, c, inputs]
                        // snarkjs exports as: ["0x..","0x.."], [["0x..","0x.."],["0x..","0x.."]], ["0x..","0x.."], ["0x..","0x..","0x..","0x.."]
                        const parsed = JSON.parse(`[${calldata}]`) as [
                            [string, string],
                            [[string, string], [string, string]],
                            [string, string],
                            string[]
                        ];
                        const [a, b, c, inputs] = parsed;

                        const toU256 = (s: string) => BigInt(s);
                        const proofA: [bigint, bigint] = [toU256(a[0]), toU256(a[1])];
                        const proofB: [[bigint, bigint], [bigint, bigint]] = [
                            [toU256(b[0][0]), toU256(b[0][1])],
                            [toU256(b[1][0]), toU256(b[1][1])],
                        ];
                        const proofC: [bigint, bigint] = [toU256(c[0]), toU256(c[1])];
                        const proofSignals: [bigint, bigint, bigint, bigint] = [
                            toU256(inputs[0]),
                            toU256(inputs[1]),
                            toU256(inputs[2]),
                            toU256(inputs[3]),
                        ];

                        setProofState({ phase: "submitting", message: "Submitting proof on-chain..." });

                        try {
                            const zkContract = await getContractWithSigner(getZKVerifierAddress(), zkVerifierContractAbi);
                            const tx = await zkContract.submitZKProof(
                                selectedId,
                                proofA,
                                proofB,
                                proofC,
                                proofSignals,
                                1 // template type = AuthBypass
                            );
                            const receipt = await tx.wait();
                            setProofState({ phase: "done", txHash: receipt?.hash ?? tx.hash });
                            resolve();
                        } catch (err) {
                            reject(err);
                        }
                    }
                };

                worker.onerror = (ev) => reject(new Error(ev.message));

                worker.postMessage({
                    type: "GENERATE_PROOF",
                    payload: {
                        input: circuitInput,
                        wasmPath: TEMPLATE_1.circuitWasm,
                        zkeyPath: TEMPLATE_1.circuitZkey,
                    },
                });
            });

            worker.terminate();
            workerRef.current = null;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setProofState({
                phase: "error",
                error: msg.includes("user rejected") ? "Transaction rejected." : `Proof generation failed: ${msg}`,
            });
            workerRef.current?.terminate();
            workerRef.current = null;
        }
    };

    const isGenerating = ["computing-witness", "generating-proof", "submitting"].includes(proofState.phase);

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8 max-w-2xl">
                <div>
                    <h1 className="text-4xl font-black tracking-tight text-[#1A1A1A]/90">Generate ZK Proof</h1>
                    <p className="text-[#1A1A1A]/70 font-medium mt-2">
                        Prove an authentication bypass without revealing your exploit input.
                    </p>
                </div>

                <div className="flex items-start gap-3 p-4 bg-purple-50 rounded-xl border border-purple-200">
                    <Info size={18} className="text-purple-600 shrink-0 mt-0.5" />
                    <div className="text-sm text-purple-700">
                        <p className="font-semibold">Groth16 proof on bn128 curve (Template 1: AuthBypass)</p>
                        <p className="mt-1 text-purple-600">
                            The circuit proves <code className="bg-purple-100 px-1 rounded text-xs">exploitInput ≠ expectedAuthState</code> and
                            that <code className="bg-purple-100 px-1 rounded text-xs">Poseidon(exploitInput, salt) = commitmentHash</code> —
                            without revealing <code className="bg-purple-100 px-1 rounded text-xs">exploitInput</code>.
                        </p>
                        <p className="mt-1 text-purple-600">Proof generation runs in a Web Worker and may take 30–90 seconds.</p>
                    </div>
                </div>

                {/* Result */}
                {proofState.phase === "done" && (
                    <div className="flex items-start gap-4 p-5 bg-[#A9FD5F]/20 rounded-xl border-2 border-[#A9FD5F]">
                        <CheckCircle2 size={22} className="text-[#1A1A1A] shrink-0 mt-0.5" />
                        <div>
                            <p className="font-black text-[#1A1A1A]">Proof verified on-chain!</p>
                            <p className="text-[#1A1A1A]/70 text-sm mt-1">
                                The ZK verifier confirmed your proof. The submission status was automatically advanced to Verified.
                            </p>
                            {proofState.txHash && (
                                <a href={`${explorerBase}/tx/${proofState.txHash}`} target="_blank" rel="noreferrer"
                                    className="mt-2 flex items-center gap-1 text-xs font-mono text-[#1A1A1A]/60 hover:underline">
                                    {proofState.txHash.slice(0, 26)}... <ExternalLink size={11} />
                                </a>
                            )}
                        </div>
                    </div>
                )}

                {proofState.phase === "error" && (
                    <div className="flex items-center gap-3 p-4 bg-rose-50 rounded-xl border border-rose-200">
                        <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                        <p className="text-sm text-rose-700">{proofState.error}</p>
                    </div>
                )}

                {/* Progress */}
                {isGenerating && (
                    <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
                        <div className="h-5 w-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin shrink-0" />
                        <div>
                            <p className="text-sm font-semibold text-blue-800">{proofState.message ?? "Generating proof..."}</p>
                            <p className="text-xs text-blue-600 mt-0.5">
                                {proofState.phase === "computing-witness" && "Loading circuit and computing witness..."}
                                {proofState.phase === "generating-proof" && "Running Groth16 prover (this is the slow step)..."}
                                {proofState.phase === "submitting" && "Broadcasting proof transaction..."}
                            </p>
                        </div>
                    </div>
                )}

                <Card>
                    <form onSubmit={(e) => void handleGenerateProof(e)} className="space-y-6">

                        {/* Submission selector */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-semibold text-[#1A1A1A]/70 ml-1">Target Submission</label>
                                <button
                                    type="button"
                                    onClick={() => void loadSubmissions()}
                                    className="text-xs text-[#1A1A1A]/50 hover:text-[#1A1A1A] flex items-center gap-1"
                                >
                                    <RefreshCw size={11} /> Refresh
                                </button>
                            </div>
                            {isLoadingSubs ? (
                                <div className="h-12 bg-[#EDEDED] rounded-xl animate-pulse" />
                            ) : (
                                <select
                                    value={selectedId ?? ""}
                                    onChange={e => setSelectedId(Number(e.target.value) || null)}
                                    className="w-full bg-white border border-[#1A1A1A]/10 rounded-xl px-4 py-3 text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]/30 transition-all"
                                >
                                    <option value="">Select a pending submission...</option>
                                    {submissions.map(s => (
                                        <option key={s.id} value={s.id}>
                                            #{s.id} — {s.affectedSoftware} v{s.affectedVersion}
                                        </option>
                                    ))}
                                </select>
                            )}
                            {submissions.length === 0 && !isLoadingSubs && (
                                <p className="text-xs text-[#1A1A1A]/40 ml-1">No pending submissions found for your wallet.</p>
                            )}
                        </div>

                        {/* Circuit inputs */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-[#1A1A1A]/40 uppercase tracking-wider">Circuit Inputs</h3>

                            <div className="p-4 bg-rose-50 rounded-xl border border-rose-200 space-y-3">
                                <p className="text-xs font-bold text-rose-700 uppercase tracking-wider">Private (never leaves your browser)</p>
                                <FormInput
                                    label="Exploit Input"
                                    placeholder="The value that bypasses authentication (hex or integer)"
                                    value={input.exploitInput}
                                    onChange={setField("exploitInput")}
                                />
                                <FormInput
                                    label="Salt"
                                    placeholder="32-byte hex salt or string (same salt as your commitment)"
                                    value={input.salt}
                                    onChange={setField("salt")}
                                />
                            </div>

                            <div className="p-4 bg-[#EDEDED]/30 rounded-xl border border-[#1A1A1A]/10 space-y-3">
                                <p className="text-xs font-bold text-[#1A1A1A]/40 uppercase tracking-wider">Public (go on-chain)</p>
                                <FormInput
                                    label="Function Selector"
                                    placeholder="4-byte selector hex or integer (e.g. 0x12345678)"
                                    value={input.functionSelector}
                                    onChange={setField("functionSelector")}
                                />
                                <FormInput
                                    label="Expected Auth State"
                                    placeholder="The expected authenticated value the system checks against"
                                    value={input.expectedAuthState}
                                    onChange={setField("expectedAuthState")}
                                />
                                <FormInput
                                    label="System Code Hash"
                                    placeholder="keccak256 of the target code (0x hex or string)"
                                    value={input.systemCodeHash}
                                    onChange={setField("systemCodeHash")}
                                />
                            </div>
                        </div>

                        <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl border border-amber-200">
                            <ShieldCheck size={16} className="text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-700">
                                Circuit file paths: <code className="bg-amber-100 px-1 rounded">{TEMPLATE_1.circuitWasm}</code> and <code className="bg-amber-100 px-1 rounded">{TEMPLATE_1.circuitZkey}</code>.
                                Run <code className="bg-amber-100 px-1 rounded">scripts/setup-zk.sh</code> first to generate these files.
                            </p>
                        </div>

                        <Button
                            type="submit"
                            variant="primary"
                            size="lg"
                            isLoading={isGenerating}
                            disabled={isGenerating}
                            className="w-full gap-2"
                        >
                            <Zap size={18} />
                            {isGenerating ? proofState.message ?? "Generating..." : "Generate & Submit ZK Proof"}
                        </Button>
                    </form>
                </Card>
            </div>
        </DashboardLayout>
    );
}
