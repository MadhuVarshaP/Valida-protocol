const mongoose = require("mongoose");

const installationLogSchema = new mongoose.Schema(
  {
    deviceAddress: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    patchId: { type: Number, required: true, index: true },
    status: {
      type: String,
      enum: ["success", "failure"],
      required: true
    },
    source: {
      type: String,
      enum: ["api", "chain"],
      default: "api"
    },
    txHash: { type: String, trim: true, lowercase: true },
    logIndex: { type: Number },
    timestamp: { type: Date, required: true }
  },
  { timestamps: true }
);

installationLogSchema.index({ txHash: 1, logIndex: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("InstallationLog", installationLogSchema);