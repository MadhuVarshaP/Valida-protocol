const { ethers } = require("ethers");
const abi = require("./contractAbi.json");

let provider;
let contractReadOnly;
let contractAddress;

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function initBlockchain() {
  const rpcUrl = getRequiredEnv("RPC_URL");
  contractAddress = getRequiredEnv("CONTRACT_ADDRESS");

  provider = new ethers.JsonRpcProvider(rpcUrl);
  contractReadOnly = new ethers.Contract(contractAddress, abi, provider);
}

function getReadOnlyContract() {
  if (!contractReadOnly) {
    throw new Error("Blockchain not initialized");
  }
  return contractReadOnly;
}

function getProvider() {
  if (!provider) {
    throw new Error("Blockchain provider not initialized");
  }
  return provider;
}

function getContractAddress() {
  if (!contractAddress) {
    throw new Error("Blockchain contract address not initialized");
  }
  return contractAddress;
}

function getContractAbi() {
  return abi;
}

async function getContractAdminAddress() {
  if (!provider || !contractAddress) {
    throw new Error("Blockchain not initialized");
  }

  // Try common admin getter selectors:
  // owner() => 0x8da5cb5b, admin() => 0xf851a440
  const selectors = ["0x8da5cb5b", "0xf851a440"];
  for (const selector of selectors) {
    try {
      const result = await provider.call({
        to: contractAddress,
        data: selector
      });
      if (typeof result === "string" && result !== "0x" && result.length >= 66) {
        const padded = "0x" + result.slice(-40);
        return normalizeAddress(padded);
      }
    } catch (_) {
      // Try the next selector.
    }
  }

  if (process.env.CONTRACT_ADMIN_ADDRESS) {
    return normalizeAddress(process.env.CONTRACT_ADMIN_ADDRESS);
  }
  if (process.env.ADMIN_WALLET_ADDRESS) {
    return normalizeAddress(process.env.ADMIN_WALLET_ADDRESS);
  }

  throw new Error("Unable to resolve contract admin address");
}

function normalizeAddress(address) {
  try {
    return ethers.getAddress(address).toLowerCase();
  } catch (_) {
    const a = String(address || "").trim().toLowerCase();
    return a.startsWith("0x") ? a : "0x" + a;
  }
}

module.exports = {
  initBlockchain,
  getReadOnlyContract,
  getProvider,
  getContractAddress,
  getContractAbi,
  getContractAdminAddress,
  normalizeAddress
};