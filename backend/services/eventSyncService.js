const InstallationLog = require("../models/InstallationLog");
const Device = require("../models/Device");
const { getReadOnlyContract, normalizeAddress } = require("../config/blockchain");
const logger = require("../utils/logger");

function asDateFromBlockTs(timestampBigInt) {
  return new Date(Number(timestampBigInt) * 1000);
}

async function syncPatchInstalledEvent(patchId, device, success, event) {
  const txHash = event?.log?.transactionHash || null;
  const logIndex = event?.log?.index;

  const existing = txHash
    ? await InstallationLog.findOne({ txHash, logIndex })
    : null;

  if (existing) {
    return;
  }

  const block = await event.log.getBlock();
  const timestamp = block?.timestamp
    ? asDateFromBlockTs(block.timestamp)
    : new Date();
  const deviceAddress = normalizeAddress(device);

  await InstallationLog.create({
    deviceAddress,
    patchId: Number(patchId),
    status: success ? "success" : "failure",
    source: "chain",
    txHash,
    logIndex: Number(logIndex),
    timestamp
  });

  await Device.findOneAndUpdate({ walletAddress: deviceAddress }, { lastSeen: new Date() });
}

function startEventSyncListener() {
  const enabled = process.env.ENABLE_CONTRACT_EVENT_SYNC === "true";
  if (!enabled) {
    return;
  }

  const contract = getReadOnlyContract();
  contract.on("PatchInstalled", async (patchId, device, success, event) => {
    try {
      await syncPatchInstalledEvent(patchId, device, success, event);
      logger.info(
        `Synced PatchInstalled event patchId=${Number(patchId)} device=${normalizeAddress(device)}`
      );
    } catch (error) {
      logger.error("Failed to sync PatchInstalled event", error.message);
    }
  });

  logger.info("Contract event sync listener enabled (PatchInstalled)");
}

module.exports = {
  startEventSyncListener
};
