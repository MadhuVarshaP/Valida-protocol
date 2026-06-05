// Web Worker for SnarkJS Groth16 proof generation
// Runs off the main thread to avoid blocking the UI during heavy computation

importScripts("https://cdn.jsdelivr.net/npm/snarkjs@0.7.3/build/snarkjs.min.js");

self.onmessage = async (e) => {
    const { type, payload } = e.data;

    if (type !== "GENERATE_PROOF") return;

    const { input, wasmPath, zkeyPath } = payload;

    try {
        self.postMessage({ type: "STATUS", message: "Computing witness..." });
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);

        self.postMessage({ type: "STATUS", message: "Formatting proof for on-chain submission..." });

        // Convert proof to calldata format expected by the Solidity verifier
        const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);

        self.postMessage({ type: "DONE", proof, publicSignals, calldata });
    } catch (err) {
        self.postMessage({ type: "ERROR", message: err?.message ?? String(err) });
    }
};
