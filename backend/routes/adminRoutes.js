const express = require("express");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const {
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
} = require("../controllers/adminController");

const router = express.Router();

router.post(
  "/register-device",
  requireAuth,
  requireRole("admin"),
  registerDevice
);
router.post(
  "/revoke-device",
  requireAuth,
  requireRole("admin"),
  revokeDevice
);
router.post(
  "/authorize-publisher",
  requireAuth,
  requireRole("admin"),
  authorizePublisher
);
router.post(
  "/revoke-publisher",
  requireAuth,
  requireRole("admin"),
  revokePublisher
);
router.get("/publishers", requireAuth, requireRole("admin"), getPublishers);
router.get("/patches", requireAuth, requireRole("admin"), getAllPatches);
router.get(
  "/requests/publisher",
  requireAuth,
  requireRole("admin"),
  getPublisherRequests
);
router.get(
  "/requests",
  requireAuth,
  requireRole("admin"),
  getPublisherRequests
);
router.post(
  "/requests/publisher/:requestId/reject",
  requireAuth,
  requireRole("admin"),
  rejectPublisherRequest
);
router.post(
  "/requests/:requestId/reject",
  requireAuth,
  requireRole("admin"),
  rejectAccessRequest
);
router.get("/devices", requireAuth, requireRole("admin"), getAllDevices);
router.get("/logs", requireAuth, requireRole("admin"), getInstallationLogs);
router.get("/metrics", requireAuth, requireRole("admin"), getDashboardMetrics);
router.post("/sync-chain", requireAuth, requireRole("admin"), triggerChainSync);
router.post("/disable-patch", requireAuth, requireRole("admin"), disablePatch);

module.exports = router;