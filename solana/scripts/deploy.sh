#!/bin/bash
set -e

echo "Step 1 — Building Valida Protocol Anchor program..."
anchor build

echo ""
echo "Step 2 — Deploying to Devnet..."
anchor deploy --provider.cluster devnet

echo ""
echo "Step 3 — Running tests on Devnet..."
anchor test --provider.cluster devnet

echo ""
echo "========================================"
echo "Valida Protocol deployment complete."
echo "Next steps:"
echo "1. Copy the Program ID printed above"
echo "2. Update declare_id!(...) in programs/valida/src/lib.rs"
echo "3. Update [programs.devnet] valida = \"...\" in Anchor.toml"
echo "4. Run: anchor build   (to regenerate IDL with correct program ID)"
echo "5. Copy target/idl/valida.json to frontend/lib/validaIdl.json"
echo "========================================"
