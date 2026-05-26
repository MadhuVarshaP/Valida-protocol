const crypto = require("crypto");

function sha256Hex(inputBuffer) {
  return `0x${crypto.createHash("sha256").update(inputBuffer).digest("hex")}`;
}

function ensureBytes32(hexValue) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hexValue)) {
    throw new Error("fileHash must be a bytes32 hex string");
  }
  return hexValue.toLowerCase();
}

module.exports = {
  sha256Hex,
  ensureBytes32
};