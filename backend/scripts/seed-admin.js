/**
 * Seeds the admin (and test publisher/device) users for local/testing.
 * Run once before test-all-endpoints.sh if ADMIN_WALLET_ADDRESS is not set in .env.
 * Usage: node scripts/seed-admin.js
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const User = require("../models/User");

const ADMIN_WALLET = "0x742d35cc6634c0532925a3b844bc1e7595f25e3d";
const PUBLISHER_WALLET = "0x8ba1f109551bd432803012645ac136ddd64dba72";
const DEVICE_WALLET = "0x362b2e1e0e8b0c0af95cdcfdf7b6f37d0cf2db3a";

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not set in .env");
    process.exit(1);
  }
  await mongoose.connect(uri);
  await User.findOneAndUpdate(
    { walletAddress: ADMIN_WALLET },
    { walletAddress: ADMIN_WALLET, role: "admin", status: "active" },
    { upsert: true, new: true }
  );
  console.log("Admin user seeded:", ADMIN_WALLET);
  await User.findOneAndUpdate(
    { walletAddress: PUBLISHER_WALLET },
    { walletAddress: PUBLISHER_WALLET, role: "publisher", status: "active" },
    { upsert: true, new: true }
  );
  console.log("Publisher user seeded:", PUBLISHER_WALLET);
  await User.findOneAndUpdate(
    { walletAddress: DEVICE_WALLET },
    { walletAddress: DEVICE_WALLET, role: "device", status: "active" },
    { upsert: true, new: true }
  );
  console.log("Device user seeded:", DEVICE_WALLET);
  await mongoose.disconnect();
  console.log("Done.");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
