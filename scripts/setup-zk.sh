#!/bin/bash
# ============================================================
# Zeno Phase 4 — ZK Trusted Setup & Verifier Generation
# ============================================================
# Prerequisites:
#   npm install -g circom snarkjs
#   npm install circomlib  (in project root)
#
# This script:
#   1. Compiles the AuthBypass circuit
#   2. Runs Powers of Tau ceremony (development — use a real ceremony for production)
#   3. Generates Groth16 proving key
#   4. Exports verification key
#   5. Generates AuthBypassVerifier.sol (replaces the placeholder)
#
# Run from project root:
#   bash scripts/setup-zk.sh
# ============================================================

set -e

CIRCUIT_NAME="AuthBypass"
BUILD_DIR="build/circuits"
CONTRACT_DIR="contract"
CIRCUITS_DIR="circuits"

echo "▶ Creating build directory..."
mkdir -p "$BUILD_DIR"

# ── Step 1: Compile the circuit ─────────────────────────────────────────────
echo "▶ Compiling ${CIRCUIT_NAME}.circom..."
circom "${CIRCUITS_DIR}/${CIRCUIT_NAME}.circom" \
  --r1cs \
  --wasm \
  --sym \
  -l node_modules \
  -o "$BUILD_DIR"

echo "   ✓ Circuit compiled → ${BUILD_DIR}/${CIRCUIT_NAME}.r1cs"
echo "   ✓ WASM witness generator → ${BUILD_DIR}/${CIRCUIT_NAME}_js/"

# ── Step 2: Powers of Tau ceremony (development — NOT for production) ───────
echo ""
echo "▶ Running Powers of Tau ceremony (development mode)..."
echo "   ⚠  For production: use a verified ceremony (e.g. Hermez, Perpetual Powers of Tau)"

snarkjs powersoftau new bn128 12 \
  "${BUILD_DIR}/pot12_0000.ptau" -v

snarkjs powersoftau contribute \
  "${BUILD_DIR}/pot12_0000.ptau" \
  "${BUILD_DIR}/pot12_0001.ptau" \
  --name="Zeno Dev Contributor" -v \
  -e="zeno-platform-entropy-$(date +%s)"

snarkjs powersoftau prepare phase2 \
  "${BUILD_DIR}/pot12_0001.ptau" \
  "${BUILD_DIR}/pot12_final.ptau" -v

echo "   ✓ Powers of Tau complete → ${BUILD_DIR}/pot12_final.ptau"

# ── Step 3: Groth16 setup ───────────────────────────────────────────────────
echo ""
echo "▶ Running Groth16 setup..."

snarkjs groth16 setup \
  "${BUILD_DIR}/${CIRCUIT_NAME}.r1cs" \
  "${BUILD_DIR}/pot12_final.ptau" \
  "${BUILD_DIR}/${CIRCUIT_NAME}_0000.zkey"

snarkjs zkey contribute \
  "${BUILD_DIR}/${CIRCUIT_NAME}_0000.zkey" \
  "${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey" \
  --name="Zeno" -v \
  -e="zeno-zkey-entropy-$(date +%s)"

echo "   ✓ Final zkey → ${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey"

# ── Step 4: Export verification key ─────────────────────────────────────────
echo ""
echo "▶ Exporting verification key..."

snarkjs zkey export verificationkey \
  "${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey" \
  "${BUILD_DIR}/verification_key.json"

echo "   ✓ Verification key → ${BUILD_DIR}/verification_key.json"

# ── Step 5: Generate Solidity verifier (replaces placeholder) ───────────────
echo ""
echo "▶ Generating Solidity verifier contract..."

snarkjs zkey export solidityverifier \
  "${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey" \
  "${CONTRACT_DIR}/${CIRCUIT_NAME}Verifier.sol"

echo "   ✓ Verifier contract → ${CONTRACT_DIR}/${CIRCUIT_NAME}Verifier.sol"

# ── Step 6: Copy WASM and zkey to frontend public folder ────────────────────
echo ""
echo "▶ Copying circuit files to frontend public..."
mkdir -p "frontend/public/circuits/${CIRCUIT_NAME}_js"

cp "${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey" \
   "frontend/public/circuits/${CIRCUIT_NAME}_final.zkey"

cp "${BUILD_DIR}/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm" \
   "frontend/public/circuits/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm"

cp "${BUILD_DIR}/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}_js/witness_calculator.js" \
   "frontend/public/circuits/${CIRCUIT_NAME}_js/witness_calculator.js" 2>/dev/null || true

echo "   ✓ Circuit WASM → frontend/public/circuits/${CIRCUIT_NAME}_js/"
echo "   ✓ Proving key  → frontend/public/circuits/${CIRCUIT_NAME}_final.zkey"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Setup complete!"
echo ""
echo "  Next steps:"
echo "  1. Deploy AuthBypassVerifier.sol to Base Sepolia"
echo "  2. Deploy ZenoZKVerifier.sol with ZenoVulnerability address"
echo "  3. Call addTemplate(1, <AuthBypassVerifier address>) on ZenoZKVerifier"
echo "  4. Call setZKVerifier(<ZenoZKVerifier address>) on ZenoVulnerability"
echo "  5. Set NEXT_PUBLIC_ZK_VERIFIER_ADDRESS in frontend .env"
echo "════════════════════════════════════════════════════════════"
