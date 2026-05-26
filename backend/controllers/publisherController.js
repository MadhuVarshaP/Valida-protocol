const Patch = require("../models/Patch");
const InstallationLog = require("../models/InstallationLog");
const {
  getReadOnlyContract,
  getProvider,
  getContractAbi,
  normalizeAddress
} = require("../config/blockchain");
const { uploadBufferToPinata } = require("../services/ipfsService");
const { sha256Hex } = require("../services/hashService");
const { ethers } = require("ethers");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeArtifactFileName(input) {
  const raw = String(input || "")
    .replace(/[\r\n"]/g, "")
    .trim();
  if (!raw) return null;
  return raw;
}

function sanitizeMimeType(input) {
  const value = String(input || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  return value || null;
}

async function uploadPatchFile(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Patch file is required" });
    }

    const fileHash = sha256Hex(req.file.buffer);
    const { cid, size, timestamp } = await uploadBufferToPinata(
      req.file.buffer,
      req.file.originalname,
      {
        uploadedBy: req.auth.walletAddress,
        mimeType: req.file.mimetype
      }
    );

    return res.status(201).json({
      message: "Patch uploaded to IPFS successfully",
      ipfsHash: cid,
      fileHash,
      artifactFileName: req.file.originalname,
      artifactMimeType: req.file.mimetype || "application/octet-stream",
      size,
      timestamp
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Primary sync endpoint.
 * Frontend sends { txHash, targetPlatform } after on-chain publishPatch is confirmed.
 * Backend reads the receipt + chain state directly — no mismatch possible.
 */
async function syncPatchFromTx(req, res, next) {
  try {
    const { txHash, targetPlatform, artifactFileName, artifactMimeType } = req.body;
    const sanitizedArtifactFileName = sanitizeArtifactFileName(artifactFileName);
    const sanitizedArtifactMimeType = sanitizeMimeType(artifactMimeType);

    if (!txHash) {
      return res.status(400).json({ error: "txHash is required" });
    }

    const provider = getProvider();
    const contract = getReadOnlyContract();

    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      return res.status(404).json({
        error: "Transaction receipt not found. It may not be confirmed yet — wait and retry."
      });
    }

    if (receipt.status !== 1) {
      return res.status(400).json({
        error: "Transaction reverted on-chain. Patch was not published."
      });
    }

    const iface = new ethers.Interface(getContractAbi());
    let patchId = null;

    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({
          topics: log.topics,
          data: log.data
        });
        if (parsed && parsed.name === "PatchPublished") {
          const raw = parsed.args[0];
          patchId = typeof raw === "bigint" ? Number(raw) : Number(raw);
          break;
        }
      } catch {
        continue;
      }
    }

    if (!patchId || !Number.isFinite(patchId) || patchId <= 0) {
      return res.status(400).json({
        error: "PatchPublished event not found in transaction logs. Are you sure this is a publishPatch transaction?",
        txHash,
        logsCount: receipt.logs.length
      });
    }

    const existingPatch = await Patch.findOne({ patchId });
    if (existingPatch) {
      let shouldSave = false;
      if (sanitizedArtifactFileName && !existingPatch.artifactFileName) {
        existingPatch.artifactFileName = sanitizedArtifactFileName;
        shouldSave = true;
      }
      if (sanitizedArtifactMimeType && !existingPatch.artifactMimeType) {
        existingPatch.artifactMimeType = sanitizedArtifactMimeType;
        shouldSave = true;
      }
      if (shouldSave) await existingPatch.save();
      return res.status(200).json({
        message: "Patch already synced to backend",
        patch: existingPatch
      });
    }

    let chainPatch = null;
    let chainPatchId = 0;
    for (let attempt = 1; attempt <= 8; attempt++) {
      chainPatch = await contract.patches(patchId);
      chainPatchId = Number(chainPatch.id);
      if (Number.isFinite(chainPatchId) && chainPatchId > 0) break;
      if (attempt < 8) {
        await sleep(1200);
      }
    }
    if (!Number.isFinite(chainPatchId) || chainPatchId <= 0) {
      return res.status(400).json({
        error: "On-chain patch struct is empty for this patchId. RPC may be lagging — retry in a few seconds.",
        patchId
      });
    }

    const patch = new Patch({
      patchId,
      namespace: chainPatch.softwareName,
      softwareName: chainPatch.softwareName,
      version: chainPatch.version,
      targetPlatform: targetPlatform ? String(targetPlatform).trim() : "",
      publisher: normalizeAddress(chainPatch.publisher),
      ipfsHash: chainPatch.ipfsHash,
      fileHash: String(chainPatch.fileHash).toLowerCase(),
      artifactFileName: sanitizedArtifactFileName || undefined,
      artifactMimeType: sanitizedArtifactMimeType || undefined,
      active: Boolean(chainPatch.active),
      releaseTime: new Date(Number(chainPatch.releaseTime) * 1000)
    });

    await patch.save();

    return res.status(201).json({
      message: "Patch synced from chain successfully",
      patch
    });
  } catch (error) {
    return next(error);
  }
}

async function getPublisherPatches(req, res, next) {
  try {
    const patches = await Patch.find({
      publisher: req.auth.walletAddress
    }).sort({ releaseTime: -1 });

    const patchIds = patches.map((p) => p.patchId);
    if (patchIds.length === 0) {
      return res.json({ count: 0, patches: [] });
    }

    const metrics = await InstallationLog.aggregate([
      { $match: { patchId: { $in: patchIds } } },
      {
        $group: {
          _id: "$patchId",
          total: { $sum: 1 },
          success: {
            $sum: {
              $cond: [{ $eq: ["$status", "success"] }, 1, 0]
            }
          }
        }
      }
    ]);

    const metricByPatchId = new Map();
    for (const row of metrics) {
      const total = Number(row.total || 0);
      const success = Number(row.success || 0);
      const successRate = total === 0 ? 0 : Number(((success / total) * 100).toFixed(2));
      metricByPatchId.set(Number(row._id), { installCount: total, successRate });
    }

    const patchesWithMetrics = patches.map((p) => {
      const m = metricByPatchId.get(p.patchId) || { installCount: 0, successRate: 0 };
      return {
        ...p.toObject(),
        installCount: m.installCount,
        successRate: m.successRate
      };
    });

    return res.json({ count: patchesWithMetrics.length, patches: patchesWithMetrics });
  } catch (error) {
    return next(error);
  }
}

async function getPublisherInstallationLogs(req, res, next) {
  try {
    const patches = await Patch.find({
      publisher: req.auth.walletAddress
    }).select("patchId");
    const patchIds = patches.map((patch) => patch.patchId);

    if (patchIds.length === 0) {
      return res.json({ count: 0, logs: [] });
    }

    const logs = await InstallationLog.find({ patchId: { $in: patchIds } })
      .sort({ timestamp: -1 })
      .limit(300);

    return res.json({ count: logs.length, logs });
  } catch (error) {
    return next(error);
  }
}

async function getPublisherAnalytics(req, res, next) {
  try {
    const patches = await Patch.find({
      publisher: req.auth.walletAddress
    }).sort({ releaseTime: -1 });
    const patchIds = patches.map((patch) => patch.patchId);

    const logs =
      patchIds.length === 0
        ? []
        : await InstallationLog.find({ patchId: { $in: patchIds } });

    let successLogs = 0;
    for (const log of logs) {
      if (log.status === "success") {
        successLogs += 1;
      }
    }

    const totalLogs = logs.length;
    const successRate =
      totalLogs === 0 ? 0 : Number(((successLogs / totalLogs) * 100).toFixed(2));

    return res.json({
      totalPatches: patches.length,
      activePatches: patches.filter((patch) => patch.active).length,
      totalLogs,
      successLogs,
      failureLogs: totalLogs - successLogs,
      successRate
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  uploadPatchFile,
  syncPatchFromTx,
  getPublisherPatches,
  getPublisherInstallationLogs,
  getPublisherAnalytics
};
