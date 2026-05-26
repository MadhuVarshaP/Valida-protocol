const Patch = require("../models/Patch");
const { getReadOnlyContract, normalizeAddress } = require("../config/blockchain");
const logger = require("../utils/logger");

/**
 * Reads ALL patches from the smart contract and upserts them into MongoDB.
 * Called on server startup and available via admin API.
 */
async function syncAllPatchesFromChain() {
  const contract = getReadOnlyContract();
  const total = Number(await contract.patchCounter());

  if (!total || total <= 0) {
    logger.info("Chain sync: no patches on-chain (patchCounter = 0)");
    return { synced: 0, updated: 0, skipped: 0, total: 0 };
  }

  let synced = 0;
  let updated = 0;
  let skipped = 0;

  for (let id = 1; id <= total; id++) {
    try {
      const p = await contract.patches(id);
      const chainId = Number(p.id);
      if (!chainId || chainId <= 0) {
        skipped++;
        continue;
      }

      const releaseTime = new Date(Number(p.releaseTime) * 1000);
      const publisher = normalizeAddress(p.publisher);
      const fileHash = String(p.fileHash).toLowerCase();
      const ipfsHash = String(p.ipfsHash);
      const softwareName = String(p.softwareName);
      const version = String(p.version);
      const active = Boolean(p.active);

      const existing = await Patch.findOne({ patchId: chainId });
      const nextDoc = {
        patchId: chainId,
        namespace: softwareName,
        softwareName,
        version,
        targetPlatform: existing?.targetPlatform || "",
        publisher,
        ipfsHash,
        fileHash,
        active,
        releaseTime
      };

      if (!existing) {
        await Patch.create(nextDoc);
        synced++;
        continue;
      }

      const isUnchanged =
        existing.softwareName === nextDoc.softwareName &&
        existing.version === nextDoc.version &&
        existing.publisher === nextDoc.publisher &&
        existing.ipfsHash === nextDoc.ipfsHash &&
        existing.fileHash === nextDoc.fileHash &&
        existing.active === nextDoc.active &&
        existing.namespace === nextDoc.namespace &&
        Number(existing.releaseTime?.getTime() || 0) === Number(nextDoc.releaseTime.getTime());

      if (isUnchanged) {
        skipped++;
        continue;
      }

      await Patch.findOneAndUpdate({ patchId: chainId }, { $set: nextDoc }, { new: true });
      updated++;

    } catch (err) {
      logger.error(`Chain sync: failed to sync patchId=${id}`, err.message);
    }
  }

  logger.info(
    `Chain sync complete: ${synced} created, ${updated} updated, ${skipped} skipped, ${total} on-chain`
  );
  return { synced, updated, skipped, total };
}

module.exports = { syncAllPatchesFromChain };
