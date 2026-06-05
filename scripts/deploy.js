/**
 * Zeno Platform — Deployment Script
 * Deploys ZenoVulnerability, ZenoEscrow, ZenoZKVerifier and links them.
 *
 * Usage:
 *   node scripts/deploy.js
 *
 * Requirements:
 *   - DEPLOYER_PRIVATE_KEY in environment
 *   - RPC_URL in environment (e.g. Base Sepolia)
 *   - Compiled contract JSON artifacts in build/artifacts/ (use hardhat or solc)
 *
 * Install ethers:
 *   npm install ethers dotenv
 */

require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// ── Config ──────────────────────────────────────────────────────────────────
const RPC_URL = process.env.RPC_URL || "https://sepolia.base.org";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const REQUIRED_STAKE = ethers.parseEther(process.env.REQUIRED_STAKE_ETH || "0.01");

if (!PRIVATE_KEY) {
    console.error("❌ DEPLOYER_PRIVATE_KEY not set in environment");
    process.exit(1);
}

function loadArtifact(contractName) {
    const artifactPath = path.join(
        __dirname,
        "../build/artifacts",
        `${contractName}.json`
    );
    if (!fs.existsSync(artifactPath)) {
        console.error(`❌ Artifact not found: ${artifactPath}`);
        console.error("   Run your compiler (hardhat compile / solc) first.");
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

async function deploy(signer, artifact, ...args) {
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
    console.log(`   Deploying ${artifact.contractName || "contract"}...`);
    const contract = await factory.deploy(...args);
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    console.log(`   ✓ Deployed at: ${address}`);
    return { contract, address };
}

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const signer = new ethers.Wallet(PRIVATE_KEY, provider);
    const deployerAddress = await signer.getAddress();
    const network = await provider.getNetwork();
    const balance = await provider.getBalance(deployerAddress);

    console.log("════════════════════════════════════════════════════════════");
    console.log("  Zeno Platform — Deployment");
    console.log("════════════════════════════════════════════════════════════");
    console.log(`  Network:  ${network.name} (chainId: ${network.chainId})`);
    console.log(`  Deployer: ${deployerAddress}`);
    console.log(`  Balance:  ${ethers.formatEther(balance)} ETH`);
    console.log(`  Stake:    ${ethers.formatEther(REQUIRED_STAKE)} ETH required\n`);

    // ── 1. Deploy ZenoVulnerability ──────────────────────────────────────────
    console.log("▶ Step 1 of 4: Deploying ZenoVulnerability...");
    const vulnArtifact = loadArtifact("ZenoVulnerability");
    const { contract: vuln, address: vulnAddress } = await deploy(signer, vulnArtifact);

    // ── 2. Deploy ZenoEscrow (linked to ZenoVulnerability) ──────────────────
    console.log("\n▶ Step 2 of 4: Deploying ZenoEscrow...");
    const escrowArtifact = loadArtifact("ZenoEscrow");
    const { contract: escrow, address: escrowAddress } = await deploy(
        signer, escrowArtifact, vulnAddress, REQUIRED_STAKE
    );

    // ── 3. Link escrow contract on ZenoVulnerability ─────────────────────────
    console.log("\n▶ Step 3 of 4: Linking contracts...");
    let tx = await vuln.setEscrowContract(escrowAddress);
    await tx.wait();
    console.log(`   ✓ ZenoVulnerability.setEscrowContract(${escrowAddress})`);

    // ── 4. Deploy ZenoZKVerifier (Phase 4) ───────────────────────────────────
    console.log("\n▶ Step 4 of 4: Deploying ZenoZKVerifier (Phase 4)...");
    let zkVerifierAddress = null;
    try {
        const zkArtifact = loadArtifact("ZenoZKVerifier");
        const { contract: zkVerifier, address: zkAddr } = await deploy(
            signer, zkArtifact, vulnAddress
        );
        zkVerifierAddress = zkAddr;

        tx = await vuln.setZKVerifier(zkVerifierAddress);
        await tx.wait();
        console.log(`   ✓ ZenoVulnerability.setZKVerifier(${zkVerifierAddress})`);

        // If AuthBypassVerifier is available, register it
        try {
            const authArtifact = loadArtifact("AuthBypassVerifier");
            const { address: authVerifierAddress } = await deploy(signer, authArtifact);
            tx = await zkVerifier.addTemplate(1, authVerifierAddress);
            await tx.wait();
            console.log(`   ✓ ZenoZKVerifier.addTemplate(1 = AuthBypass, ${authVerifierAddress})`);
        } catch {
            console.log("   ⚠  AuthBypassVerifier not available — run scripts/setup-zk.sh first");
        }
    } catch {
        console.log("   ⚠  ZenoZKVerifier artifact not found — Phase 4 skipped");
        console.log("       Run scripts/setup-zk.sh then recompile to enable ZK verification");
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log("\n════════════════════════════════════════════════════════════");
    console.log("  Deployment Complete — add these to your frontend .env:");
    console.log("════════════════════════════════════════════════════════════");
    console.log(`NEXT_PUBLIC_VULN_CONTRACT_ADDRESS=${vulnAddress}`);
    console.log(`NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=${escrowAddress}`);
    if (zkVerifierAddress) {
        console.log(`NEXT_PUBLIC_ZK_VERIFIER_ADDRESS=${zkVerifierAddress}`);
    }
    console.log("");
    console.log("  Next steps:");
    console.log("  1. Fund the bounty pool: escrow.fundBountyPool{value: X ETH}()");
    console.log("  2. Register admin as auditor if testing: vuln.registerAuditor(adminAddress)");
    if (!zkVerifierAddress) {
        console.log("  3. Phase 4: run scripts/setup-zk.sh, redeploy ZenoZKVerifier");
    }
    console.log("════════════════════════════════════════════════════════════\n");

    // Write addresses to a deployment manifest
    const manifest = {
        network: network.name,
        chainId: network.chainId.toString(),
        deployedAt: new Date().toISOString(),
        contracts: {
            ZenoVulnerability: vulnAddress,
            ZenoEscrow: escrowAddress,
            ZenoZKVerifier: zkVerifierAddress,
        }
    };
    fs.writeFileSync("deployment.json", JSON.stringify(manifest, null, 2));
    console.log("  Manifest saved → deployment.json");
}

main().catch(err => {
    console.error("Deployment failed:", err);
    process.exit(1);
});
