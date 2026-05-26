require("dotenv").config();

const axios = require("axios");
const crypto = require("crypto");
const { ethers } = require("ethers");
const contractAbi = require("../config/contractAbi.json");

const API_BASE = process.env.API_BASE_URL || "http://localhost:3001";
const WALLET_ADDRESS = process.env.DEVICE_WALLET_ADDRESS;
const DEVICE_PRIVATE_KEY = process.env.DEVICE_PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const IPFS_GATEWAY =
  process.env.IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs";

function sha256Hex(inputBuffer) {
  return `0x${crypto
    .createHash("sha256")
    .update(inputBuffer)
    .digest("hex")}`;
}

function authHeaders() {
  return {
    "x-wallet-address": WALLET_ADDRESS
  };
}

async function fetchAvailablePatches() {
  const response = await axios.get(`${API_BASE}/api/device/patches`, {
    headers: authHeaders()
  });
  return response.data.patches || [];
}

async function fetchPatchMetadata(patchId) {
  const response = await axios.get(`${API_BASE}/api/device/patch/${patchId}`, {
    headers: authHeaders()
  });
  return response.data;
}

async function fetchPatchChainIntegrity(patchId) {
  const response = await axios.get(
    `${API_BASE}/api/device/patch/${patchId}/chain-integrity`,
    {
      headers: authHeaders()
    }
  );
  return response.data;
}

async function downloadPatchBuffer(ipfsHash) {
  const url = `${IPFS_GATEWAY}/${ipfsHash}`;
  const response = await axios.get(url, { responseType: "arraybuffer" });
  return Buffer.from(response.data);
}

async function reportInstallation(patchId, success, txMeta = {}) {
  await axios.post(
    `${API_BASE}/api/device/report`,
    {
      deviceAddress: WALLET_ADDRESS,
      patchId,
      status: success ? "success" : "failure",
      txHash: txMeta.txHash,
      logIndex: txMeta.logIndex
    },
    {
      headers: authHeaders()
    }
  );
}

function findPatchInstalledLogIndex(contract, receipt, contractAddress) {
  const addr = String(contractAddress || "").toLowerCase();
  if (!receipt?.logs) return undefined;
  for (const log of receipt.logs) {
    if (String(log.address || "").toLowerCase() !== addr) continue;
    try {
      const parsed = contract.interface.parseLog({
        topics: log.topics,
        data: log.data
      });
      if (parsed?.name === "PatchInstalled") {
        return Number(log.index);
      }
    } catch (_) {
      continue;
    }
  }
  return undefined;
}

async function reportInstallationOnChain(contract, patchId, success) {
  const tx = await contract.reportInstallation(patchId, success);
  const receipt = await tx.wait();
  return {
    txHash: String(tx.hash).toLowerCase(),
    logIndex: findPatchInstalledLogIndex(contract, receipt, CONTRACT_ADDRESS)
  };
}

async function run() {
  if (!WALLET_ADDRESS) {
    throw new Error("DEVICE_WALLET_ADDRESS is required");
  }
  if (!DEVICE_PRIVATE_KEY) {
    throw new Error("DEVICE_PRIVATE_KEY is required");
  }
  if (!RPC_URL || !CONTRACT_ADDRESS) {
    throw new Error("RPC_URL and CONTRACT_ADDRESS are required");
  }

  console.log(
    `Device Agent starting for wallet: ${WALLET_ADDRESS}`
  );
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(DEVICE_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, contractAbi, signer);

  if (signer.address.toLowerCase() !== WALLET_ADDRESS.toLowerCase()) {
    throw new Error("DEVICE_PRIVATE_KEY does not match DEVICE_WALLET_ADDRESS");
  }

  const patches = await fetchAvailablePatches();

  if (!patches.length) {
    console.log("No active patches available");
    return;
  }

  console.log(`Found ${patches.length} active patches`);

  for (const patch of patches) {
    try {
      console.log(`\nProcessing patch ${patch.patchId}...`);

      const metadata = await fetchPatchMetadata(patch.patchId);
      const chainIntegrity = await fetchPatchChainIntegrity(patch.patchId);
      console.log(
        `Downloaded metadata: ${patch.softwareName} v${patch.version}`
      );

      const patchBuffer = await downloadPatchBuffer(metadata.ipfsHash);
      const calculatedHash = sha256Hex(patchBuffer).toLowerCase();

      console.log(`Expected hash:   ${String(chainIntegrity.fileHash).toLowerCase()}`);
      console.log(`Calculated hash: ${calculatedHash}`);

      const isValid =
        calculatedHash === String(chainIntegrity.fileHash).toLowerCase();

      if (!isValid) {
        console.log(`❌ Patch ${patch.patchId} rejected: hash mismatch`);
        const txMeta = await reportInstallationOnChain(contract, patch.patchId, false);
        await reportInstallation(patch.patchId, false, txMeta);
        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log(`✅ Patch ${patch.patchId} installed successfully`);
      const txMeta = await reportInstallationOnChain(contract, patch.patchId, true);
      await reportInstallation(patch.patchId, true, txMeta);
    } catch (error) {
      console.error(
        `❌ Patch ${patch.patchId} failed: ${error.message}`
      );
      const txMeta = await reportInstallationOnChain(contract, patch.patchId, false).catch(
        () => ({})
      );
      await reportInstallation(patch.patchId, false, txMeta).catch(() => {});
    }
  }
}

run()
  .then(() => {
    console.log("\n✅ Device agent completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Device agent failed", error.message);
    process.exit(1);
  });
