const express = require("express");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const {
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
} = require("../controllers/deviceController");

const router = express.Router();

router.get("/me", requireAuth, requireRole("device"), getMe);
router.patch("/profile", requireAuth, requireRole("device"), updateDeviceProfile);
router.get("/update-check", requireAuth, requireRole("device"), getUpdateCheck);
router.get("/patches", requireAuth, requireRole("device"), getAvailablePatches);
router.get(
  "/patch/:patchId",
  requireAuth,
  requireRole("device"),
  getPatchMetadata
);
router.get(
  "/patch/:patchId/chain-integrity",
  requireAuth,
  requireRole("device"),
  getPatchChainIntegrity
);
router.get(
  "/patch/:patchId/download",
  requireAuth,
  requireRole("device"),
  downloadPatch
);
router.post("/report", requireAuth, requireRole("device"), reportInstallation);
router.get("/logs", requireAuth, requireRole("device"), getDeviceInstallationLogs);
router.get("/history", requireAuth, requireRole("device"), getDeviceInstallationLogs);
router.get("/stats", requireAuth, requireRole("device"), getDeviceStats);

module.exports = router;
