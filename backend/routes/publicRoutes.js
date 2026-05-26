const express = require("express");
const User = require("../models/User");
const AccessRequest = require("../models/AccessRequest");
const { normalizeAddress } = require("../config/blockchain");
const { ensureUserFromChain } = require("../services/userService");

const router = express.Router();

async function getRejectionCount(walletAddress) {
  return AccessRequest.countDocuments({
    walletAddress,
    status: "rejected"
  });
}

function rejectIfBlocked(rejectCount, res) {
  if (rejectCount >= 2) {
    res.status(403).json({
      error:
        "This wallet has been blocked due to repeated rejected access requests (2 strikes). Contact admin to unblock.",
      status: "blocked",
      rejectedCount: rejectCount
    });
    return true;
  }
  return false;
}

router.get("/user/role/:walletAddress", async (req, res, next) => {
  try {
    const walletAddress = req.params.walletAddress;

    if (!walletAddress) {
      return res.status(400).json({ error: "Wallet address required" });
    }

    const normalized = normalizeAddress(walletAddress);
    let user = await User.findOne({ walletAddress: normalized });

    if (!user) {
      user = await ensureUserFromChain(normalized);
    }

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({
      walletAddress: normalized,
      role: user.role,
      status: user.status
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/request/publisher", async (req, res, next) => {
  try {
    const walletAddress = req.body?.walletAddress;
    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress is required" });
    }

    const normalized = normalizeAddress(walletAddress);
    const existingUser = await User.findOne({ walletAddress: normalized });
    if (existingUser?.status === "active" && existingUser?.role === "device") {
      return res.status(409).json({
        error:
          "This wallet is already registered as a device. One wallet can be either a device or a publisher (not both).",
        status: "already-active-other-role",
        role: existingUser.role
      });
    }

    const rejectedCount = await getRejectionCount(normalized);
    if (rejectIfBlocked(rejectedCount, res)) return;

    const pendingAnyRole = await AccessRequest.findOne({
      walletAddress: normalized,
      status: "pending"
    });

    if (pendingAnyRole && pendingAnyRole.requestedRole !== "publisher") {
      return res.status(409).json({
        error: `Access request already pending for ${pendingAnyRole.requestedRole}. One wallet can have only one pending role request at a time.`,
        status: "pending-other-role",
        request: pendingAnyRole
      });
    }

    if (existingUser?.role === "publisher" && existingUser?.status === "active") {
      return res.status(200).json({
        message: "Wallet is already an active publisher",
        status: "already-active",
        request: null
      });
    }

    const existingPending = await AccessRequest.findOne({
      walletAddress: normalized,
      requestedRole: "publisher",
      status: "pending"
    });

    if (existingPending) {
      return res.status(200).json({
        message: "Publisher access request already pending",
        status: "pending",
        request: existingPending
      });
    }

    const request = await AccessRequest.create({
      walletAddress: normalized,
      requestedRole: "publisher",
      status: "pending"
    });

    return res.status(201).json({
      message: "Publisher access request submitted",
      warning:
        rejectedCount === 1
          ? "Warning: This wallet has 1 previous rejected request. One more rejection will block future requests."
          : null,
      status: "pending",
      rejectedCount,
      request
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/request/device", async (req, res, next) => {
  try {
    const walletAddress = req.body?.walletAddress;
    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress is required" });
    }

    const normalized = normalizeAddress(walletAddress);
    const existingUser = await User.findOne({ walletAddress: normalized });
    if (existingUser?.status === "active" && existingUser?.role === "publisher") {
      return res.status(409).json({
        error:
          "This wallet is already registered as a publisher. One wallet can be either a device or a publisher (not both).",
        status: "already-active-other-role",
        role: existingUser.role
      });
    }

    const rejectedCount = await getRejectionCount(normalized);
    if (rejectIfBlocked(rejectedCount, res)) return;

    const pendingAnyRole = await AccessRequest.findOne({
      walletAddress: normalized,
      status: "pending"
    });

    if (pendingAnyRole && pendingAnyRole.requestedRole !== "device") {
      return res.status(409).json({
        error: `Access request already pending for ${pendingAnyRole.requestedRole}. One wallet can have only one pending role request at a time.`,
        status: "pending-other-role",
        request: pendingAnyRole
      });
    }

    if (existingUser?.role === "device" && existingUser?.status === "active") {
      return res.status(200).json({
        message: "Wallet is already an active device",
        status: "already-active",
        request: null
      });
    }

    const existingPending = await AccessRequest.findOne({
      walletAddress: normalized,
      requestedRole: "device",
      status: "pending"
    });

    if (existingPending) {
      return res.status(200).json({
        message: "Device access request already pending",
        status: "pending",
        request: existingPending
      });
    }

    const request = await AccessRequest.create({
      walletAddress: normalized,
      requestedRole: "device",
      status: "pending"
    });

    return res.status(201).json({
      message: "Device access request submitted",
      warning:
        rejectedCount === 1
          ? "Warning: This wallet has 1 previous rejected request. One more rejection will block future requests."
          : null,
      status: "pending",
      rejectedCount,
      request
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
