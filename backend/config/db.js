const mongoose = require("mongoose");
const logger = require("../utils/logger");

async function connectDB() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing in environment variables");
  }

  await mongoose.connect(mongoUri);
  logger.info("MongoDB connected");
}

module.exports = connectDB;