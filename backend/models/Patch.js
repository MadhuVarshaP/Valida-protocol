const mongoose = require("mongoose");

const patchSchema = new mongoose.Schema(
  {
    patchId: { type: Number, required: true, unique: true, index: true },
    namespace: { type: String, trim: true },
    softwareName: { type: String, required: true, trim: true },
    version: { type: String, required: true, trim: true },
    targetPlatform: { type: String, trim: true },
    publisher: { type: String, required: true, lowercase: true, trim: true },
    ipfsHash: { type: String, required: true, trim: true },
    fileHash: { type: String, required: true, trim: true },
    artifactFileName: { type: String, trim: true },
    artifactMimeType: { type: String, trim: true },
    active: { type: Boolean, default: true },
    releaseTime: { type: Date, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Patch", patchSchema);