const mongoose = require("mongoose");

const accessRequestSchema = new mongoose.Schema(
  {
    walletAddress: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    requestedRole: {
      type: String,
      enum: ["publisher", "device"],
      required: true,
      default: "publisher"
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true
    },
    reviewedBy: {
      type: String,
      lowercase: true,
      trim: true
    },
    reviewedAt: {
      type: Date
    }
  },
  { timestamps: true }
);

accessRequestSchema.index(
  { walletAddress: 1, requestedRole: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);

module.exports = mongoose.model("AccessRequest", accessRequestSchema);
