import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import { nanoid } from "nanoid";
import db from "../db/index.js";
import { toPaise } from "./money.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AI_SERVICE_DIR = path.join(__dirname, "..", "..", "ai-service");
const METRICS_PATH = path.join(AI_SERVICE_DIR, "metrics.json");

export async function executeEvaluationPipeline() {
  const pythonBin = process.env.PYTHON_BIN || "python3";
  await execFileAsync(pythonBin, ["generate_dataset.py"], { cwd: AI_SERVICE_DIR, timeout: 120000 });
  await execFileAsync(pythonBin, ["train_model.py"], { cwd: AI_SERVICE_DIR, timeout: 120000 });
}

export async function recordEvaluationRunFromMetrics() {
  if (!fs.existsSync(METRICS_PATH)) {
    throw new Error("No metrics.json found. Run: cd ai-service && python3 train_model.py");
  }
  const metrics = JSON.parse(fs.readFileSync(METRICS_PATH, "utf-8"));
  return persistEvaluationRunPair(metrics);
}

export async function runEvaluation() {
  await executeEvaluationPipeline();
  return recordEvaluationRunFromMetrics();
}

async function persistEvaluationRunPair(metrics) {
  const biz = metrics.business_metrics;
  const createdAt = new Date().toISOString();
  const methodologyVersion = biz.methodology || "UNKNOWN";
  const LABEL = "SIMULATED_RECOVERY";

  const baselineRun = {
    evaluation_run_id: `EV-${nanoid(8)}`,
    dataset_version: "recovery-batch-v1",
    model_version: "n/a - baseline has no model",
    policy_version: "n/a - baseline has no policy gating",
    methodology_version: methodologyVersion,
    revenue_label: LABEL,
    seed: metrics.seed,
    strategy: "BASELINE_FIXED_RETRY",
    cases_evaluated: biz.cases_evaluated,
    revenue_at_risk_paise: toPaise(biz.total_revenue_at_risk),
    revenue_recovered_paise: toPaise(biz.baseline_revenue_recovered),
    recovery_rate: biz.cases_evaluated ? Math.round((biz.baseline_revenue_recovered / biz.total_revenue_at_risk) * 10000) / 10000 : 0,
    interventions: biz.cases_evaluated,
    successful_interventions: null,
    failed_interventions: null,
    escalations: 0,
    stopped_cases: 0,
    net_recovery_paise: toPaise(biz.baseline_revenue_recovered),
    created_at: createdAt,
    metadata: { calculation: "SIMULATED_DISCLOSED_MODEL", methodology: metrics.business_metrics.methodology },
  };

  const recoverAiRun = {
    evaluation_run_id: `EV-${nanoid(8)}`,
    dataset_version: "recovery-batch-v1",
    model_version: metrics.chosen_model,
    policy_version: "v1.0",
    methodology_version: methodologyVersion,
    revenue_label: LABEL,
    seed: metrics.seed,
    strategy: "RECOVERAI_ADAPTIVE",
    cases_evaluated: biz.cases_evaluated,
    revenue_at_risk_paise: toPaise(biz.total_revenue_at_risk),
    revenue_recovered_paise: toPaise(biz.total_revenue_recovered),
    recovery_rate: biz.recovery_rate,
    interventions: null,
    successful_interventions: null,
    failed_interventions: null,
    escalations: Math.round(biz.escalation_rate * biz.cases_evaluated),
    stopped_cases: null,
    net_recovery_paise: toPaise(biz.total_revenue_recovered),
    created_at: createdAt,
    metadata: {
      methodology: metrics.business_metrics.methodology,
      calculation_breakdown: {
        automated: { value: biz.total_revenue_recovered_automated, calculation: "SIMULATED_DISCLOSED_MODEL" },
        via_escalation: { value: biz.total_revenue_recovered_via_escalation, calculation: "SIMULATED_DISCLOSED_MODEL" },
      },
    },
  };

  await db.insert("evaluation_runs", baselineRun);
  await db.insert("evaluation_runs", recoverAiRun);

  return { baselineRun, recoverAiRun };
}

export async function listEvaluationRuns() {
  const runs = await db.all("evaluation_runs");
  return runs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function getLatestComparison() {
  const runs = await listEvaluationRuns();
  const latestBaseline = runs.find((r) => r.strategy === "BASELINE_FIXED_RETRY");
  const latestRecoverAI = runs.find((r) => r.strategy === "RECOVERAI_ADAPTIVE");
  if (!latestBaseline || !latestRecoverAI) return null;

  const incrementalPaise = latestRecoverAI.revenue_recovered_paise - latestBaseline.revenue_recovered_paise;
  return {
    baseline: latestBaseline,
    recoverai: latestRecoverAI,
    incremental_revenue_paise: incrementalPaise,
    incremental_revenue: incrementalPaise / 100,
    relative_lift_pct: latestBaseline.revenue_recovered_paise
      ? Math.round((incrementalPaise / latestBaseline.revenue_recovered_paise) * 10000) / 100
      : null,
    reproducible: true,
    note: "Both strategies were evaluated against the exact same held-out batch (seed fixed, see ai-service/train_model.py). Re-running the pipeline with the same seed reproduces these numbers - see ai-service/tests/test_reproducibility.py.",
  };
}
