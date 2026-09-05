import express from "express";
import * as analytics from "../services/analytics.js";
import * as evaluationRun from "../services/evaluationRun.js";
import { requireMinRole, sensitiveActionLimiter } from "../services/authAndValidation.js";

const router = express.Router();

router.get("/recovery", async (req, res) => {
  res.json({
    live: await analytics.getLiveDashboardMetrics(),
    model_evaluation: analytics.getModelMetrics(),
  });
});

router.get("/baseline", (req, res) => {
  res.json(analytics.getBaselineComparison());
});

// GET /api/analytics/evaluation-runs - all persisted evaluation runs
router.get("/evaluation-runs", async (req, res) => {
  res.json(await evaluationRun.listEvaluationRuns());
});

// GET /api/analytics/evaluation-runs/latest - the current baseline vs RecoverAI comparison
router.get("/evaluation-runs/latest", async (req, res) => {
  const comparison = await evaluationRun.getLatestComparison();
  if (!comparison) return res.status(404).json({ error: "No evaluation runs recorded yet. POST /api/analytics/evaluation-runs to create one from the current ai-service/metrics.json." });
  res.json(comparison);
});

// POST /api/analytics/evaluation-runs - persist a new run pair from the current metrics.json (no re-execution)
router.post("/evaluation-runs", requireMinRole("ADMIN"), async (req, res) => {
  try {
    const result = await evaluationRun.recordEvaluationRunFromMetrics();
    res.json(result);
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// POST /api/analytics/evaluation-runs/run - GENUINELY re-executes the dataset+training pipeline, then persists the fresh result
router.post("/evaluation-runs/run", requireMinRole("ADMIN"), sensitiveActionLimiter, async (req, res) => {
  try {
    const result = await evaluationRun.runEvaluation();
    res.json({ ...result, note: "This experiment was just re-executed (generate_dataset.py + train_model.py ran fresh), not read from a stale file." });
  } catch (err) {
    res.status(503).json({ error: `Evaluation execution failed: ${err.message}` });
  }
});

export default router;