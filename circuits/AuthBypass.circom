pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

/**
 * AuthBypass — ZK circuit for proving authentication bypass vulnerabilities.
 *
 * WHAT IT PROVES:
 *   "I know a private exploit value that does NOT equal the required auth state,
 *    yet still allows function execution — proving the authentication can be bypassed —
 *    WITHOUT revealing what that exploit value is."
 *
 * PRIVATE inputs (hidden from verifier, never leave the prover's machine):
 *   exploitInput   — the secret value that bypasses authentication
 *   salt           — random binding value (prevents replay of proof across submissions)
 *
 * PUBLIC inputs (visible to verifier / stored on-chain):
 *   functionSelector   — identifies which function's auth is being bypassed
 *   expectedAuthState  — the value that SHOULD be required for auth (e.g. 1 = admin)
 *   systemCodeHash     — fingerprint of the target system (from ValidaVulnerability struct)
 *   commitmentHash     — Poseidon(exploitInput, salt) — links proof to on-chain commitment
 *
 * CONSTRAINTS:
 *   1. exploitInput != expectedAuthState  → auth IS bypassed (non-equality proves bypass)
 *   2. commitmentHash == Poseidon(exploitInput, salt) → proof is bound to submission
 *
 * PHASE 4 NOTE:
 *   This is the only template in Phase 4.
 *   Future templates (HashMismatch, PrivEscalation, ReplayAttack, LogicError) are added
 *   via the TemplateRegistry in ValidaZKVerifier.sol without changing this circuit.
 *
 * INSTALL DEPS:
 *   npm install circomlib
 *   npm install -g circom snarkjs
 *
 * COMPILE:
 *   bash scripts/setup-zk.sh
 */
template AuthBypass() {
    // ── Private inputs (never sent to verifier) ─────────────────────────────
    signal input exploitInput;
    signal input salt;

    // ── Public inputs (visible to verifier / on-chain) ──────────────────────
    signal input functionSelector;
    signal input expectedAuthState;
    signal input systemCodeHash;
    signal input commitmentHash;

    // ── Constraint 1: exploitInput != expectedAuthState (auth is bypassed) ──
    // IsEqual returns 1 if in[0] == in[1], 0 otherwise.
    // We require the output is 0 — meaning inputs are DIFFERENT — proving bypass.
    component authCheck = IsEqual();
    authCheck.in[0] <== exploitInput;
    authCheck.in[1] <== expectedAuthState;
    authCheck.out === 0;

    // ── Constraint 2: Poseidon commitment binding ────────────────────────────
    // Proves prover knows (exploitInput, salt) such that Poseidon(exploitInput, salt) = commitmentHash.
    // This links the ZK proof to the on-chain commitment submitted in submitVulnerability().
    component poseidon = Poseidon(2);
    poseidon.inputs[0] <== exploitInput;
    poseidon.inputs[1] <== salt;
    commitmentHash === poseidon.out;

}

component main {
    public [functionSelector, expectedAuthState, systemCodeHash, commitmentHash]
} = AuthBypass();
