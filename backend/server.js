import "dotenv/config";
import express from "express";
import cors from "cors";
import recoveryRoutes from "./routes/recovery.js";
import analyticsRoutes from "./routes/analytics.js";
import voiceRoutes from "./routes/voice.js";
import webhookRoutes from "./routes/webhooks.js";
import { razorpayMode } from "./services/razorpayService.js";
import { getBackendName } from "./db/index.js";

const app = express();
app.use(cors());
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

app.get("/api/health", async (req, res) => {
  const dbBackend = await getBackendName();
  res.json({
    status: "ok",
    razorpay_mode: razorpayMode,
    db_backend: dbBackend,
    db_backend_label: dbBackend === "mongo" ? "MongoDB (real)" : "DEMO / LOCAL SIMULATION MODE (JSON file store)",
    ai_service_url: process.env.AI_SERVICE_URL || "http://localhost:8000",
  });
});

app.get("/api/health/db", async (req, res) => {
  const dbBackend = await getBackendName();
  res.json({ backend: dbBackend, mode: dbBackend === "mongo" ? "REAL_MONGODB" : "DEMO_LOCAL_SIMULATION" });
});

app.get("/api/health/razorpay", (req, res) => {
  res.json({ mode: razorpayMode, live: razorpayMode === "TEST_MODE" });
});

app.get("/api/health/ai", async (req, res) => {
  try {
    const url = process.env.AI_SERVICE_URL || "http://localhost:8000";
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
    const body = await r.json();
    res.json({ reachable: true, ...body });
  } catch (err) {
    res.status(503).json({ reachable: false, error: err.message });
  }
});

app.use("/api/recovery", recoveryRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/voice", voiceRoutes);
app.use("/api/webhooks", webhookRoutes);

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4000;

try {
  await getBackendName();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

app.listen(PORT, async () => {
  const backend = await getBackendName();
  if (!process.env.ADMIN_API_KEY) {
    console.warn("[security] ADMIN_API_KEY not set - approve/reject/policy-update endpoints are OPEN (demo mode). Set ADMIN_API_KEY to require an x-api-key header on them.");
  }
  console.log(`RecoverAI backend running on port ${PORT} (Razorpay mode: ${razorpayMode}, DB backend: ${backend})`);
});
