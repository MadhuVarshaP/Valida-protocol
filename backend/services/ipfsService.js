const axios = require("axios");
const FormData = require("form-data");

async function uploadBufferToPinata(fileBuffer, fileName, metadata = {}) {
  const pinataJwt = process.env.PINATA_JWT;
  const apiKey = process.env.PINATA_API_KEY;
  const apiSecret = process.env.PINATA_SECRET_KEY;
  const endpoint =
    process.env.PINATA_FILE_ENDPOINT ||
    "https://api.pinata.cloud/pinning/pinFileToIPFS";

  const useJwt = !!pinataJwt;
  const useKeys = !!(apiKey && apiSecret);
  const mockIpfs =
    process.env.IPFS_MOCK === "true" ||
    (apiKey && apiKey.toLowerCase().includes("your_pinata"));
  if (!useJwt && !useKeys && !mockIpfs) {
    throw new Error(
      "Either PINATA_JWT or (PINATA_API_KEY and PINATA_SECRET_KEY) is required for IPFS upload"
    );
  }

  if (mockIpfs) {
    const crypto = require("crypto");
    const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
    return {
      cid: `QmMock${hash.slice(0, 40)}`,
      size: fileBuffer.length,
      timestamp: new Date().toISOString()
    };
  }

  const formData = new FormData();
  formData.append("file", fileBuffer, { filename: fileName });
  formData.append(
    "pinataMetadata",
    JSON.stringify({ name: fileName, keyvalues: metadata })
  );

  const headers = {
    ...formData.getHeaders()
  };
  if (useJwt) {
    headers.Authorization = `Bearer ${pinataJwt}`;
  } else {
    headers["x-pinata-api-key"] = apiKey;
    headers["x-pinata-secret-api-key"] = apiSecret;
  }

  const response = await axios.post(endpoint, formData, {
    maxBodyLength: Infinity,
    headers
  });

  return {
    cid: response.data.IpfsHash,
    size: response.data.PinSize,
    timestamp: response.data.Timestamp
  };
}

module.exports = {
  uploadBufferToPinata
};