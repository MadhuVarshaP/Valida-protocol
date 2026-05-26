const express = require("express");
const multer = require("multer");
const path = require("path");

const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const {
  uploadPatchFile,
  syncPatchFromTx,
  getPublisherPatches,
  getPublisherInstallationLogs,
  getPublisherAnalytics
} = require("../controllers/publisherController");

const router = express.Router();

const allowedPatchExtensions = new Set([
  ".zip",
  ".pkg",
  ".dmg",
  ".exe",
  ".msi",
  ".deb",
  ".rpm",
  ".img",
  ".iso",
  ".bin",
  ".tar",
  ".gz"
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024
  },
  fileFilter(_req, file, cb) {
    const fileName = String(file.originalname || "").toLowerCase().trim();
    const ext = path.extname(fileName).toLowerCase();
    const isTarGz = fileName.endsWith(".tar.gz");
    if (isTarGz || allowedPatchExtensions.has(ext)) {
      return cb(null, true);
    }
    const err = new Error(
      `Unsupported patch file type "${ext || "unknown"}". Allowed types: .exe, .msi, .dmg, .pkg, .deb, .rpm, .bin, .zip, .tar.gz, .img, .iso`
    );
    err.statusCode = 400;
    return cb(err);
  }
});

router.post(
  "/upload",
  requireAuth,
  requireRole("publisher"),
  upload.single("patchFile"),
  uploadPatchFile
);
router.post(
  "/sync",
  requireAuth,
  requireRole("publisher"),
  syncPatchFromTx
);
router.post(
  "/publish",
  requireAuth,
  requireRole("publisher"),
  syncPatchFromTx
);
router.get(
  "/patches",
  requireAuth,
  requireRole("publisher"),
  getPublisherPatches
);
router.get("/logs", requireAuth, requireRole("publisher"), getPublisherInstallationLogs);
router.get("/analytics", requireAuth, requireRole("publisher"), getPublisherAnalytics);

module.exports = router;
