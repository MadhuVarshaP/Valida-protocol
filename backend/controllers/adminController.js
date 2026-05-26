const { getReadOnlyContract, normalizeAddress } = require("../config/blockchain");
const User = require("../models/User");
const Device = require("../models/Device");
const AccessRequest = require("../models/AccessRequest");
const InstallationLog = require("../models/InstallationLog");
const Patch = require("../models/Patch");
const { syncAllPatchesFromChain } = require("../services/chainSyncService");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getRejectedCount(walletAddress) {
  return AccessRequest.countDocuments({ walletAddress, status: "rejected" });
}

function isBlocked(rejectedCount) {
  return Number(rejectedCount || 0) >= 2;
}

async function registerDevice(req, res, next) {
  try {
    const { walletAddress, deviceId, deviceType, location, requestId } = req.body;

    if (!walletAddress || !deviceId) {
      return res
        .status(400)
        .json({ error: "walletAddress and deviceId are required" });
    }

    const normalized = normalizeAddress(walletAddress);
    const rejectedCount = await getRejectedCount(normalized);
    if (isBlocked(rejectedCount)) {
      return res.status(403).json({
        error:
          "Wallet is blocked due to repeated rejected access requests (2 strikes).",
        status: "blocked",
        rejectedCount
      });
    }
    const existingUser = await User.findOne({ walletAddress: normalized });
    if (existingUser?.status === "active" && existingUser?.role === "publisher") {
      return res.status(409).json({
        error:
          "Wallet is already an active publisher. One wallet can be either a device or a publisher (not both).",
        status: "already-active-other-role",
        role: existingUser.role
      });
    }
    const contract = getReadOnlyContract();
    let isRegisteredOnChain = false;
    for (let attempt = 1; attempt <= 20; attempt++) {
      isRegisteredOnChain = await contract.registeredDevices(normalized);
      if (isRegisteredOnChain) break;
      if (attempt < 20) {
        await sleep(1200);
      }
    }
    if (!isRegisteredOnChain) {
      return res.status(400).json({
        error:
          "Device not registered on-chain yet. If the wallet tx just succeeded, wait a few seconds and retry. Also verify frontend and backend point to the same contract/network."
      });
    }

    await User.findOneAndUpdate(
      { walletAddress: normalized },
      { walletAddress: normalized, role: "device", status: "active" },
      { upsert: true, new: true }
    );

    const device = await Device.findOneAndUpdate(
      { walletAddress: normalized },
      {
        walletAddress: normalized,
        deviceId: String(deviceId).trim(),
        deviceType,
        location,
        status: "registered",
        lastSeen: new Date()
      },
      { upsert: true, new: true }
    );

    if (requestId) {
      await AccessRequest.findByIdAndUpdate(requestId, {
        status: "approved",
        reviewedBy: req.auth.walletAddress,
        reviewedAt: new Date()
      });
    } else {
      await AccessRequest.updateMany(
        {
          walletAddress: normalized,
          requestedRole: "device",
          status: "pending"
        },
        {
          status: "approved",
          reviewedBy: req.auth.walletAddress,
          reviewedAt: new Date()
        }
      );
    }

    return res.status(201).json({
      message: "Device registration synced successfully",
      device
    });
  } catch (error) {
    return next(error);
  }
}

async function revokeDevice(req, res, next) {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress is required" });
    }

    const normalized = normalizeAddress(walletAddress);
    const contract = getReadOnlyContract();
    let stillRegistered = true;
    // Give RPC/indexer a short window to reflect the just-mined revoke tx.
    for (let attempt = 1; attempt <= 20; attempt++) {
      stillRegistered = await contract.registeredDevices(normalized);
      if (!stillRegistered) break;
      if (attempt < 20) {
        await sleep(1200);
      }
    }
    if (stillRegistered) {
      return res.status(400).json({
        error:
          "Device is still registered on-chain. Call revokeDevice() from the admin wallet first, then sync again."
      });
    }

    const [device, user] = await Promise.all([
      Device.findOneAndUpdate(
        { walletAddress: normalized },
        { status: "revoked", lastSeen: new Date() },
        { new: true }
      ),
      User.findOneAndUpdate(
        { walletAddress: normalized, role: "device" },
        { status: "revoked" },
        { new: true }
      )
    ]);

    if (!device && !user) {
      return res.status(404).json({
        error: "No synced device found for this wallet address"
      });
    }

    return res.json({
      message: "Device revocation synced successfully",
      walletAddress: normalized
    });
  } catch (error) {
    return next(error);
  }
}

async function revokePublisher(req, res, next) {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress is required" });
    }

    const normalized = normalizeAddress(walletAddress);
    const contract = getReadOnlyContract();
    const stillAuthorized = await contract.authorizedPublishers(normalized);
    if (stillAuthorized) {
      return res.status(400).json({
        error:
          "Publisher is still authorized on-chain. Call revokePublisher() from the admin wallet first, then sync again."
      });
    }

    const updated = await User.findOneAndUpdate(
      { walletAddress: normalized, role: "publisher" },
      { status: "revoked" },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        error: "No active publisher user found for this wallet address"
      });
    }

    return res.json({
      message: "Publisher revocation synced successfully",
      walletAddress: normalized
    });
  } catch (error) {
    return next(error);
  }
}

async function disablePatch(req, res, next) {
  try {
    const patchId = Number(req.body?.patchId);
    if (!Number.isFinite(patchId) || patchId <= 0) {
      return res.status(400).json({ error: "Valid patchId is required" });
    }

    const contract = getReadOnlyContract();
    const chainPatch = await contract.patches(patchId);
    const chainPatchId = Number(chainPatch.id);
    if (!chainPatchId || chainPatchId <= 0) {
      return res.status(404).json({ error: "Patch not found on-chain" });
    }
    if (Boolean(chainPatch.active)) {
      return res.status(400).json({
        error:
          "Patch is still active on-chain. Call disablePatch() from the admin wallet first, then sync again."
      });
    }

    const patch = await Patch.findOneAndUpdate(
      { patchId: chainPatchId },
      {
        $set: {
          namespace: chainPatch.softwareName,
          softwareName: chainPatch.softwareName,
          version: chainPatch.version,
          publisher: normalizeAddress(chainPatch.publisher),
          ipfsHash: chainPatch.ipfsHash,
          fileHash: String(chainPatch.fileHash).toLowerCase(),
          active: false,
          releaseTime: new Date(Number(chainPatch.releaseTime) * 1000)
        },
        $setOnInsert: {
          targetPlatform: ""
        }
      },
      { upsert: true, new: true }
    );

    return res.json({
      message: "Patch disable synced successfully",
      patch
    });
  } catch (error) {
    return next(error);
  }
}

async function authorizePublisher(req, res, next) {
  try {
    const { walletAddress, requestId } = req.body;

    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress is required" });
    }

    const normalized = normalizeAddress(walletAddress);
    const rejectedCount = await getRejectedCount(normalized);
    if (isBlocked(rejectedCount)) {
      return res.status(403).json({
        error:
          "Wallet is blocked due to repeated rejected access requests (2 strikes).",
        status: "blocked",
        rejectedCount
      });
    }
    const existingUser = await User.findOne({ walletAddress: normalized });
    if (existingUser?.status === "active" && existingUser?.role === "device") {
      return res.status(409).json({
        error:
          "Wallet is already an active device. One wallet can be either a device or a publisher (not both).",
        status: "already-active-other-role",
        role: existingUser.role
      });
    }
    const contract = getReadOnlyContract();
    let isAuthorizedOnChain = false;
    // Give RPC/indexer a short window to reflect the just-mined tx.
    for (let attempt = 1; attempt <= 20; attempt++) {
      isAuthorizedOnChain = await contract.authorizedPublishers(normalized);
      if (isAuthorizedOnChain) break;
      if (attempt < 20) {
        await sleep(1200);
      }
    }
    if (!isAuthorizedOnChain) {
      return res.status(400).json({
        error:
          "Publisher not authorized on-chain yet. If the wallet tx just succeeded, wait a few seconds and retry. Also verify frontend and backend point to the same contract/network."
      });
    }

    await User.findOneAndUpdate(
      { walletAddress: normalized },
      { walletAddress: normalized, role: "publisher", status: "active" },
      { upsert: true, new: true }
    );

    if (requestId) {
      await AccessRequest.findByIdAndUpdate(requestId, {
        status: "approved",
        reviewedBy: req.auth.walletAddress,
        reviewedAt: new Date()
      });
    } else {
      await AccessRequest.updateMany(
        {
          walletAddress: normalized,
          requestedRole: "publisher",
          status: "pending"
        },
        {
          status: "approved",
          reviewedBy: req.auth.walletAddress,
          reviewedAt: new Date()
        }
      );
    }

    return res.status(201).json({
      message: "Publisher authorization synced successfully",
      walletAddress: normalized
    });
  } catch (error) {
    return next(error);
  }
}

async function getPublishers(_req, res, next) {
  try {
    const publishers = await User.find({ role: "publisher", status: "active" })
      .sort({ createdAt: -1 })
      .select("walletAddress role status createdAt");

    return res.json({ count: publishers.length, publishers });
  } catch (error) {
    return next(error);
  }
}

async function getPublisherRequests(req, res, next) {
  try {
    const statusParam = req.query.status != null ? String(req.query.status).toLowerCase() : "all";
    const roleParam = req.query.role != null ? String(req.query.role).toLowerCase() : "publisher";
    const filter = {};

    if (["publisher", "device"].includes(roleParam)) {
      filter.requestedRole = roleParam;
    }

    if (["pending", "approved", "rejected"].includes(statusParam)) {
      filter.status = statusParam;
    }

    const requests = await AccessRequest.find(filter).sort({ createdAt: -1 });
    return res.json({ count: requests.length, requests });
  } catch (error) {
    return next(error);
  }
}

async function rejectPublisherRequest(req, res, next) {
  try {
    const requestId = req.params.requestId;
    const request = await AccessRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ error: "Only pending requests can be rejected" });
    }

    request.status = "rejected";
    request.reviewedBy = req.auth.walletAddress;
    request.reviewedAt = new Date();
    await request.save();

    const rejectedCount = await getRejectedCount(request.walletAddress);
    return res.json({
      message: "Publisher request rejected",
      rejectedCount,
      nextAction:
        rejectedCount >= 2
          ? "blocked"
          : "warning",
      request
    });
  } catch (error) {
    return next(error);
  }
}

async function rejectAccessRequest(req, res, next) {
  try {
    const requestId = req.params.requestId;
    const request = await AccessRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }
    if (request.status !== "pending") {
      return res.status(400).json({ error: "Only pending requests can be rejected" });
    }

    request.status = "rejected";
    request.reviewedBy = req.auth.walletAddress;
    request.reviewedAt = new Date();
    await request.save();

    const rejectedCount = await getRejectedCount(request.walletAddress);
    return res.json({
      message: "Access request rejected",
      rejectedCount,
      nextAction:
        rejectedCount >= 2
          ? "blocked"
          : "warning",
      request
    });
  } catch (error) {
    return next(error);
  }
}

async function getAllDevices(req, res, next) {
  try {
    const devices = await Device.find({}).sort({ createdAt: -1 });
    return res.json({ count: devices.length, devices });
  } catch (error) {
    return next(error);
  }
}

async function getAllPatches(_req, res, next) {
  try {
    const patches = await Patch.find({}).sort({ releaseTime: -1 });
    const patchIds = patches.map((patch) => patch.patchId);
    const logs = await InstallationLog.find({ patchId: { $in: patchIds } });

    const statsByPatch = new Map();
    for (const log of logs) {
      const current = statsByPatch.get(log.patchId) || {
        installCount: 0,
        successCount: 0
      };
      current.installCount += 1;
      if (log.status === "success") {
        current.successCount += 1;
      }
      statsByPatch.set(log.patchId, current);
    }

    const enriched = patches.map((patch) => {
      const stat = statsByPatch.get(patch.patchId) || {
        installCount: 0,
        successCount: 0
      };
      const successRate =
        stat.installCount === 0
          ? 0
          : Number(((stat.successCount / stat.installCount) * 100).toFixed(2));
      return {
        ...patch.toObject(),
        installCount: stat.installCount,
        successRate
      };
    });

    return res.json({ count: enriched.length, patches: enriched });
  } catch (error) {
    return next(error);
  }
}

async function getInstallationLogs(req, res, next) {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 200;
    const filter = {};

    if (req.query.device) {
      filter.deviceAddress = normalizeAddress(req.query.device);
    }
    if (req.query.patch) {
      filter.patchId = Number(req.query.patch);
    }
    if (req.query.status) {
      filter.status = String(req.query.status).toLowerCase();
    }

    const logs = await InstallationLog.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit);
    return res.json({
      count: logs.length,
      filters: {
        device: req.query.device || null,
        patch: req.query.patch || null,
        status: req.query.status || null
      },
      logs
    });
  } catch (error) {
    return next(error);
  }
}

async function getDashboardMetrics(_req, res, next) {
  try {
    const [totalPatches, activeDevices, totalLogs, successLogs] = await Promise.all([
      Patch.countDocuments({}),
      Device.countDocuments({ status: "registered" }),
      InstallationLog.countDocuments({}),
      InstallationLog.countDocuments({ status: "success" })
    ]);

    const successRate = totalLogs === 0 ? 0 : Number((successLogs / totalLogs).toFixed(4));

    return res.json({
      totalPatches,
      activeDevices,
      totalLogs,
      successLogs,
      successRate
    });
  } catch (error) {
    return next(error);
  }
}

async function triggerChainSync(_req, res, next) {
  try {
    const result = await syncAllPatchesFromChain();
    return res.json({
      message: "Chain sync completed",
      ...result
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  registerDevice,
  revokeDevice,
  revokePublisher,
  disablePatch,
  authorizePublisher,
  getPublishers,
  getAllDevices,
  getAllPatches,
  getPublisherRequests,
  rejectPublisherRequest,
  rejectAccessRequest,
  getInstallationLogs,
  getDashboardMetrics,
  triggerChainSync
};