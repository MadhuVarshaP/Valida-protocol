require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const connectDB = require("./config/db");
const { initBlockchain } = require("./config/blockchain");
const { startEventSyncListener } = require("./services/eventSyncService");
const { ensureAdminUser } = require("./services/userService");
const { syncAllPatchesFromChain } = require("./services/chainSyncService");
const logger = require("./utils/logger");

const publicRoutes = require("./routes/publicRoutes");
const adminRoutes = require("./routes/adminRoutes");
const publisherRoutes = require("./routes/publisherRoutes");
const deviceRoutes = require("./routes/deviceRoutes");

const app = express();

const defaultAllowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://bpms-frontend.vercel.app"
];
const configuredAllowedOrigins = String(process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const allowedOrigins = Array.from(new Set([...defaultAllowedOrigins, ...configuredAllowedOrigins]));

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
    return true;
  }

  // Support wildcard entries in env like: https://*.vercel.app
  for (const rule of allowedOrigins) {
    if (!rule.includes("*")) continue;
    const regex = new RegExp(
      `^${rule
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")}$`
    );
    if (regex.test(origin)) return true;
  }

  // Safe fallback for your deployed frontend + preview URLs.
  return /^https:\/\/bpms-frontend(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(origin);
}

const corsOptions = {
  origin(origin, callback) {
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-wallet-address"],
  exposedHeaders: ["Content-Disposition", "Content-Type"],
  optionsSuccessStatus: 204
};

app.use(helmet());
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "backend",
    timestamp: new Date().toISOString()
  });
});

app.use("/api", publicRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/publisher", publisherRoutes);
app.use("/api/device", deviceRoutes);

app.use((err, _req, res, _next) => {
  logger.error("Unhandled error", err.message);
  res.status(err.statusCode || 500).json({
    error: err.message || "Internal server error"
  });
});

const PORT = process.env.PORT || 3001;

async function bootstrap() {
  try {
    await connectDB();
    logger.info("MongoDB connected successfully");
    await ensureAdminUser();
  } catch (error) {
    logger.error("MongoDB connection failed", error.message);
  }

  try {
    initBlockchain();
    startEventSyncListener();
    logger.info("Blockchain initialized successfully");

    syncAllPatchesFromChain().catch((err) => {
      logger.error("Initial chain sync failed", err.message);
    });
  } catch (error) {
    logger.error("Blockchain initialization warning", error.message);
  }

  app.listen(PORT, () => {
    logger.info(`BPMS backend listening on port ${PORT}`);
  });
}

bootstrap().catch((error) => {
  logger.error("Server startup failed", error.message);
  process.exit(1);
});
