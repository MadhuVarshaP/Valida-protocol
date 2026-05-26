const { getReadOnlyContract, normalizeAddress } = require("../config/blockchain");
const User = require("../models/User");
const { ensureUserFromChain } = require("../services/userService");

function extractAuthPayload(req) {
  return {
    walletAddress:
      req.headers["x-wallet-address"] ||
      req.body.walletAddress ||
      req.query.walletAddress
  };
}

async function requireAuth(req, res, next) {
  try {
    const authBypass = process.env.AUTH_BYPASS === "true";
    const { walletAddress } = extractAuthPayload(req);

    if (!walletAddress) {
      return res.status(401).json({ error: "Wallet address is required" });
    }

    const normalizedAddress = normalizeAddress(walletAddress);

    let user = await User.findOne({ walletAddress: normalizedAddress });
    if (!user) {
      user = await ensureUserFromChain(normalizedAddress);
    }
    if (!user || user.status !== "active") {
      return res
        .status(403)
        .json({
          error: "User not registered or not active",
          hint: "Admin must register this wallet first"
        });
    }

    req.auth = {
      walletAddress: normalizedAddress,
      role: user.role,
      user
    };

    return next();
  } catch (error) {
    return res.status(500).json({ error: "Authentication failed", detail: error.message });
  }
}

function requireRole(allowedRoles) {
  return async (req, res, next) => {
    if (!req.auth) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const accepted = Array.isArray(allowedRoles)
      ? allowedRoles
      : [allowedRoles];

    if (!accepted.includes(req.auth.role)) {
      return res.status(403).json({
        error: "Insufficient permissions",
        requiredRole: accepted,
        yourRole: req.auth.role
      });
    }

    // Enforce on-chain role membership for runtime-sensitive roles.
    if (req.auth.role === "publisher" || req.auth.role === "device") {
      try {
        const contract = getReadOnlyContract();
        if (req.auth.role === "publisher") {
          const authorized = await contract.authorizedPublishers(req.auth.walletAddress);
          if (!authorized) {
            return res.status(403).json({
              error: "Publisher role is not active on-chain",
              hint: "Ask admin to authorize this wallet on-chain and sync"
            });
          }
        }
        if (req.auth.role === "device") {
          const registered = await contract.registeredDevices(req.auth.walletAddress);
          if (!registered) {
            return res.status(403).json({
              error: "Device role is not active on-chain",
              hint: "Ask admin to register this wallet on-chain and sync"
            });
          }
        }
      } catch (error) {
        // In non-strict mode, fall back to DB role checks to keep UX usable
        // when RPC is temporarily unavailable/misconfigured.
        const strictChainEnforcement = process.env.CHAIN_ROLE_ENFORCEMENT === "strict";
        if (strictChainEnforcement) {
          return res.status(503).json({
            error: "Blockchain role verification unavailable",
            detail: error.message
          });
        }
      }
    }

    return next();
  };
}

module.exports = {
  requireAuth,
  requireRole
};