const User = require("../models/User");
const {
  getContractAdminAddress,
  getReadOnlyContract,
  normalizeAddress
} = require("../config/blockchain");

async function upsertUser(walletAddress, role, status = "active") {
  const normalizedAddress = normalizeAddress(walletAddress);
  return User.findOneAndUpdate(
    { walletAddress: normalizedAddress },
    { walletAddress: normalizedAddress, role, status },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function ensureAdminUser() {
  const adminWallet = process.env.ADMIN_WALLET_ADDRESS;
  if (!adminWallet) {
    return;
  }
  await upsertUser(adminWallet, "admin", "active");
}

async function resolveRoleFromChain(walletAddress) {
  const normalizedAddress = normalizeAddress(walletAddress);
  const contract = getReadOnlyContract();

  try {
    const adminAddress = await getContractAdminAddress();
    if (adminAddress === normalizedAddress) {
      return "admin";
    }
  } catch (_) {
    // Continue trying other role checks.
  }

  try {
    const isPublisher = await contract.authorizedPublishers(normalizedAddress);
    if (isPublisher) {
      return "publisher";
    }
  } catch (_) {
    // Continue trying other role checks.
  }

  try {
    const isDevice = await contract.registeredDevices(normalizedAddress);
    if (isDevice) {
      return "device";
    }
  } catch (_) {
    // Fall through to unauthorized.
  }

  return null;
}

async function ensureUserFromChain(walletAddress) {
  const normalizedAddress = normalizeAddress(walletAddress);
  const existing = await User.findOne({ walletAddress: normalizedAddress });
  if (existing) {
    return existing;
  }

  const role = await resolveRoleFromChain(normalizedAddress);
  if (!role) {
    return null;
  }

  return upsertUser(normalizedAddress, role, "active");
}

module.exports = {
  upsertUser,
  ensureAdminUser,
  resolveRoleFromChain,
  ensureUserFromChain
};