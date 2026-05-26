const mongoose = require("mongoose");

const deviceSchema = new mongoose.Schema(
  {
    walletAddress: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    deviceId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    deviceType: {
      type: String,
      enum: ["server", "drone", "radar", "sensor", "other"],
      default: "other"
    },
    location: {
      type: String,
      trim: true
    },
    hardwareFingerprint: {
      type: String,
      trim: true
    },
    serialNumber: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      enum: ["registered", "revoked", "disabled"],
      default: "registered"
    },
    displayName: {
      type: String,
      trim: true
    },
    currentSoftwareNamespace: {
      type: String,
      trim: true
    },
    currentVersion: {
      type: String,
      trim: true
    },
    targetPlatform: {
      type: String,
      trim: true,
      lowercase: true
    },
    lastSeen: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

module.exports = mongoose.model("Device", deviceSchema);
