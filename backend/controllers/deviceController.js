const axios = require("axios");
const Patch = require("../models/Patch");
const InstallationLog = require("../models/InstallationLog");
const Device = require("../models/Device");
const { getReadOnlyContract, normalizeAddress } = require("../config/blockchain");

function stripVersion(v) {
  return String(v || "")
    .trim()
    .replace(/^v/i, "");
}

function semverCompactRank(v) {
  const s = stripVersion(v);
  const m = s.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return null;
  const maj = parseInt(m[1], 10) || 0;
  const min = parseInt(m[2] ?? "0", 10) || 0;
  const pat = parseInt(m[3] ?? "0", 10) || 0;
  return maj * 1_000_000 + min * 1_000 + pat;
}

function extractKbBuildId(v) {
  const s = stripVersion(v);
  const kb = s.match(/(?:kb|vkb)\s*(\d{4,})/i);
  if (kb) return parseInt(kb[1], 10);
  const long = s.match(/\b(\d{7,})\b/);
  return long ? parseInt(long[1], 10) : null;
}

function segmentWiseNewer(candidate, current) {
  const c = stripVersion(candidate);
  const b = stripVersion(current);
  if (!b) return Boolean(c);
  if (!c) return false;
  const p1 = c.split(/[.+_-]/).map((x) => parseInt(x, 10) || 0);
  const p2 = b.split(/[.+_-]/).map((x) => parseInt(x, 10) || 0);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const x = p1[i] || 0;
    const y = p2[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

/** Semver segments, or KB-style (VKB5030211) vs semver (1.0.9). */
function isVersionNewer(candidate, current) {
  const c = stripVersion(candidate);
  const b = stripVersion(current);
  if (!b) return Boolean(c);
  if (!c) return false;

  const seg = segmentWiseNewer(candidate, current);
  const p1 = c.split(/[.+_-]/).map((x) => parseInt(x, 10) || 0);
  const looksLikeGarbageCandidate =
    p1.length > 0 && p1.every((n) => n === 0) && /[a-z]/i.test(c);

  if (!looksLikeGarbageCandidate && segmentWiseNewer(candidate, current)) {
    return true;
  }

  const kbCand = extractKbBuildId(candidate);
  const kbCur = extractKbBuildId(current);
  const semCur = semverCompactRank(current);
  const semCand = semverCompactRank(candidate);

  if (kbCand != null && kbCur != null) {
    return kbCand > kbCur;
  }
  if (kbCand != null && semCur != null) {
    return kbCand > semCur;
  }
  if (semCand != null && kbCur != null) {
    return semCand > kbCur;
  }

  return seg;
}

function platformMatches(patchPlatform, devicePlatform) {
  const p = String(patchPlatform || "").trim().toLowerCase();
  const d = String(devicePlatform || "").trim().toLowerCase();
  if (!d) return true;
  if (!p) return true;
  return p === d;
}

function namespaceMatches(patchSoftware, deviceNs) {
  const s = String(patchSoftware || "").trim();
  const n = String(deviceNs || "").trim();
  if (!n) return true;
  return s === n;
}

function extensionFromMimeType(mimeType) {
  const type = String(mimeType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const extMap = {
    "application/zip": "zip",
    "application/x-zip-compressed": "zip",
    "application/octet-stream": "bin",
    "application/x-msdownload": "exe",
    "application/vnd.microsoft.portable-executable": "exe",
    "application/x-apple-diskimage": "dmg",
    "application/vnd.debian.binary-package": "deb",
    "application/x-rpm": "rpm",
    "application/gzip": "gz",
    "application/x-gzip": "gz",
    "application/x-tar": "tar",
    "application/x-7z-compressed": "7z"
  };
  return extMap[type] || "bin";
}

function sanitizeFileName(name) {
  const n = String(name || "")
    .replace(/[\r\n"]/g, "")
    .trim();
  if (!n) return null;
  return n;
}

function parseFilenameFromDisposition(contentDisposition) {
  const input = String(contentDisposition || "");
  if (!input) return null;
  const utf8Match = input.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].replace(/^"(.*)"$/, "$1"));
    } catch {
      /* continue */
    }
  }
  const basicMatch = input.match(/filename="?([^";]+)"?/i);
  return basicMatch?.[1] || null;
}

async function getMe(req, res, next) {
  try {
    const device = await Device.findOne({ walletAddress: req.auth.walletAddress });
    if (!device) {
      return res.status(404).json({ error: "Device record not found. Complete admin registration sync." });
    }
    return res.json({ device });
  } catch (error) {
    return next(error);
  }
}

async function updateDeviceProfile(req, res, next) {
  try {
    const {
      currentSoftwareNamespace,
      currentVersion,
      targetPlatform,
      displayName
    } = req.body;

    const updates = {};
    if (currentSoftwareNamespace !== undefined) {
      updates.currentSoftwareNamespace = String(currentSoftwareNamespace).trim();
    }
    if (currentVersion !== undefined) {
      updates.currentVersion = String(currentVersion).trim();
    }
    if (targetPlatform !== undefined) {
      updates.targetPlatform = String(targetPlatform).trim().toLowerCase();
    }
    if (displayName !== undefined) {
      updates.displayName = String(displayName).trim();
    }

    const device = await Device.findOneAndUpdate(
      { walletAddress: req.auth.walletAddress },
      { $set: updates },
      { new: true }
    );
    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }
    return res.json({ device });
  } catch (error) {
    return next(error);
  }
}

/** Suggests latest applicable patch vs device profile (namespace + platform + version). */
async function getUpdateCheck(req, res, next) {
  try {
    const device = await Device.findOne({ walletAddress: req.auth.walletAddress });
    if (!device) {
      return res.status(404).json({ error: "Device record not found" });
    }

    const ns = String(device.currentSoftwareNamespace || "").trim();
    if (!ns) {
      return res.json({
        upToDate: true,
        hint: "Set software namespace in your device profile to match patch software names.",
        device: {
          currentSoftwareNamespace: device.currentSoftwareNamespace,
          currentVersion: device.currentVersion,
          targetPlatform: device.targetPlatform,
          displayName: device.displayName,
          deviceId: device.deviceId
        },
        recommendedPatch: null,
        applicableCount: 0
      });
    }

    const patches = await Patch.find({ active: true }).sort({ releaseTime: -1 });
    const applicable = patches.filter(
      (p) =>
        namespaceMatches(p.softwareName, device.currentSoftwareNamespace) &&
        platformMatches(p.targetPlatform, device.targetPlatform)
    );

    let recommended = null;
    for (const p of applicable) {
      if (!isVersionNewer(p.version, device.currentVersion)) continue;
      if (!recommended || isVersionNewer(p.version, recommended.version)) {
        recommended = p;
      }
    }

    const upToDate = !recommended;

    return res.json({
      upToDate,
      device: {
        currentSoftwareNamespace: device.currentSoftwareNamespace,
        currentVersion: device.currentVersion,
        targetPlatform: device.targetPlatform,
        displayName: device.displayName,
        deviceId: device.deviceId
      },
      recommendedPatch: recommended,
      applicableCount: applicable.filter((p) => isVersionNewer(p.version, device.currentVersion)).length
    });
  } catch (error) {
    return next(error);
  }
}

async function getAvailablePatches(_req, res, next) {
  try {
    const patches = await Patch.find({ active: true }).sort({ releaseTime: -1 });
    return res.json({ count: patches.length, patches });
  } catch (error) {
    return next(error);
  }
}

async function getPatchMetadata(req, res, next) {
  try {
    const patchId = Number(req.params.patchId);
    const patch = await Patch.findOne({ patchId, active: true });

    if (!patch) {
      return res.status(404).json({ error: "Patch not found" });
    }

    return res.json({
      patchId: patch.patchId,
      softwareName: patch.softwareName,
      namespace: patch.namespace || patch.softwareName,
      version: patch.version,
      targetPlatform: patch.targetPlatform || "",
      ipfsHash: patch.ipfsHash,
      expectedFileHash: patch.fileHash,
      releaseTime: patch.releaseTime
    });
  } catch (error) {
    return next(error);
  }
}

/** Authoritative bytes32 fileHash from contract (for device integrity step). */
async function getPatchChainIntegrity(req, res, next) {
  try {
    const patchId = Number(req.params.patchId);
    const contract = getReadOnlyContract();
    const row = await contract.patches(patchId);
    const id = Number(row.id);
    if (!id || id <= 0) {
      return res.status(404).json({ error: "Patch not found on-chain" });
    }
    if (!row.active) {
      return res.status(400).json({ error: "Patch is inactive on-chain" });
    }
    return res.json({
      patchId: id,
      fileHash: String(row.fileHash).toLowerCase(),
      softwareName: row.softwareName,
      version: row.version,
      ipfsHash: row.ipfsHash,
      active: Boolean(row.active)
    });
  } catch (error) {
    return next(error);
  }
}

async function reportInstallation(req, res, next) {
  try {
    const { patchId, success, status, deviceAddress, txHash, logIndex } = req.body;
    const resolvedStatus =
      status ||
      (success === true
        ? "success"
        : success === false
          ? "failure"
          : null);
    const normalizedStatus = resolvedStatus
      ? String(resolvedStatus).toLowerCase()
      : null;

    if (
      patchId === undefined ||
      !normalizedStatus ||
      !["success", "failure"].includes(normalizedStatus)
    ) {
      return res.status(400).json({
        error:
          "patchId and status ('success'|'failure') are required. success (boolean) is also supported."
      });
    }

    const patch = await Patch.findOne({
      patchId: Number(patchId),
      active: true
    });
    if (!patch) {
      return res.status(404).json({ error: "Patch not found or inactive" });
    }

    const addr = normalizeAddress(deviceAddress || req.auth.walletAddress);
    const tx = txHash ? String(txHash).trim().toLowerCase() : undefined;
    const li = logIndex !== undefined && logIndex !== null ? Number(logIndex) : undefined;

    const log = await InstallationLog.create({
      deviceAddress: addr,
      patchId: Number(patchId),
      status: normalizedStatus,
      source: tx ? "chain" : "api",
      txHash: tx || undefined,
      logIndex: Number.isFinite(li) ? li : undefined,
      timestamp: new Date()
    });

    await Device.findOneAndUpdate(
      { walletAddress: addr },
      { lastSeen: new Date() }
    );

    if (normalizedStatus === "success") {
      await Device.findOneAndUpdate(
        { walletAddress: addr },
        { $set: { currentVersion: patch.version, currentSoftwareNamespace: patch.softwareName } }
      );
    }

    return res.status(201).json({
      message: "Installation report synced successfully",
      log
    });
  } catch (error) {
    if (error.code === 11000 || error.code === "11000") {
      return res.status(200).json({ message: "Installation already logged", duplicate: true });
    }
    return next(error);
  }
}

async function downloadPatch(req, res, next) {
  try {
    const patchId = Number(req.params.patchId);
    const patch = await Patch.findOne({ patchId, active: true });

    if (!patch) {
      return res.status(404).json({ error: "Patch not found" });
    }

    const gateway =
      process.env.IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs";
    const url = `${gateway}/${patch.ipfsHash}`;

    const fileResponse = await axios.get(url, { responseType: "stream" });
    const upstreamType =
      fileResponse.headers["content-type"] || "application/octet-stream";
    const upstreamDisposition = fileResponse.headers["content-disposition"];
    const metadataType = String(patch.artifactMimeType || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const effectiveType = metadataType || upstreamType;
    const safeBase = `${patch.softwareName}-v${patch.version}`
      .replace(/[^a-z0-9._-]+/gi, "_")
      .replace(/^_+|_+$/g, "");
    const metadataFileName = sanitizeFileName(patch.artifactFileName);
    if (!metadataFileName || !metadataType) {
      const learnedFileName = sanitizeFileName(
        parseFilenameFromDisposition(upstreamDisposition)
      );
      const learnedType = String(upstreamType || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      const update = {};
      if (!metadataFileName && learnedFileName) {
        update.artifactFileName = learnedFileName;
      }
      if (!metadataType && learnedType && learnedType !== "application/octet-stream") {
        update.artifactMimeType = learnedType;
      }
      if (Object.keys(update).length > 0) {
        await Patch.updateOne({ _id: patch._id }, { $set: update }).catch(() => null);
      }
    }

    res.setHeader("Content-Type", effectiveType || "application/octet-stream");
    if (metadataFileName) {
      const encoded = encodeURIComponent(metadataFileName);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${metadataFileName.replace(/"/g, "")}"; filename*=UTF-8''${encoded}`
      );
    } else if (upstreamDisposition) {
      res.setHeader("Content-Disposition", upstreamDisposition);
    } else {
      const ext = extensionFromMimeType(effectiveType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeBase || `patch-${patch.patchId}`}.${ext}"`
      );
    }
    fileResponse.data.pipe(res);
  } catch (error) {
    return next(error);
  }
}

async function getDeviceInstallationLogs(req, res, next) {
  try {
    const logs = await InstallationLog.find({
      deviceAddress: req.auth.walletAddress
    })
      .sort({ timestamp: -1 })
      .limit(300);

    return res.json({ count: logs.length, logs });
  } catch (error) {
    return next(error);
  }
}

async function getDeviceStats(req, res, next) {
  try {
    const [device, logs, patchCount] = await Promise.all([
      Device.findOne({ walletAddress: req.auth.walletAddress }),
      InstallationLog.find({ deviceAddress: req.auth.walletAddress }),
      Patch.countDocuments({ active: true })
    ]);

    let successLogs = 0;
    for (const log of logs) {
      if (log.status === "success") successLogs += 1;
    }

    const totalLogs = logs.length;
    let applicableNewer = 0;
    if (device && String(device.currentSoftwareNamespace || "").trim()) {
      const patches = await Patch.find({ active: true });
      for (const p of patches) {
        if (
          namespaceMatches(p.softwareName, device.currentSoftwareNamespace) &&
          platformMatches(p.targetPlatform, device.targetPlatform) &&
          isVersionNewer(p.version, device.currentVersion)
        ) {
          applicableNewer += 1;
        }
      }
    }

    return res.json({
      device: device || null,
      totalLogs,
      successLogs,
      failureLogs: totalLogs - successLogs,
      successRate:
        totalLogs === 0 ? 0 : Number(((successLogs / totalLogs) * 100).toFixed(2)),
      activePatchesOnRegistry: patchCount,
      updatesAvailable: applicableNewer
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getMe,
  updateDeviceProfile,
  getUpdateCheck,
  getAvailablePatches,
  getPatchMetadata,
  getPatchChainIntegrity,
  reportInstallation,
  downloadPatch,
  getDeviceInstallationLogs,
  getDeviceStats
};
