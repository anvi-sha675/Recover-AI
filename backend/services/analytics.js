// import fs from "fs";
// import path from "path";
// import { fileURLToPath } from "url";
import db from "../db/index.js";
import { sumRupeesSafely } from "./money.js";

// const __dirname = path.dirname(fileURLToPath(import.meta.url));
// const METRICS_PATH = path.join(__dirname, "..", "..", "ai-service", "metrics.json");

const AI_SERVICE_URL = process.env.AI_SERVICE_URL;

export async function getModelMetrics() {
  if (!AI_SERVICE_URL) {
    return { error: "AI service URL is not configured." };
  }

  try {
    const response = await fetch(`${AI_SERVICE_URL}/metrics`);

    if (!response.ok) {
      return {
        error: `AI metrics service unavailable (${response.status}).`,
      };
    }

    return await response.json();
  } catch {
    return {
      error: "Unable to reach AI metrics service.",
    };
  }
}

export async function getLiveDashboardMetrics() {
  const cases = await db.all("recovery_cases");
  const transactions = await db.all("transactions");
  const verificationRecords = await db.all("verification_records");

  const successfulVerifications = verificationRecords.filter((v) => v.status === "VERIFICATION_SUCCESS");
  const verifiedCaseIds = new Set(successfulVerifications.map((v) => v.case_id));
  const revenueAtRisk = sumRupeesSafely(cases.map((c) => c.amount));
  const recovered = cases.filter((c) => verifiedCaseIds.has(c.case_id));
  const revenueRecovered = sumRupeesSafely(successfulVerifications.map((v) => v.amount));

  const unverifiedRecoveredClaims = cases.filter((c) => c.current_status === "RECOVERED" && !verifiedCaseIds.has(c.case_id));

  const eligibleForRecovery = cases.filter((c) => c.recovery_probability >= 0.4);
  const interventionsExecuted = eligibleForRecovery.filter((c) => c.current_status !== "OPEN");
  const paymentsRecovered = interventionsExecuted.filter((c) => c.current_status === "RECOVERED");

  return {
    revenue_at_risk: revenueAtRisk,
    revenue_recovered: revenueRecovered,
    revenue_recovered_by_mode: countAmountBy(successfulVerifications, "execution_mode"),
    unverified_recovered_claims: unverifiedRecoveredClaims.length,
    recovery_rate: cases.length ? Math.round((recovered.length / cases.length) * 10000) / 100 : 0,
    cases_analyzed: cases.length,
    successful_recoveries: recovered.length,
    active_cases: cases.filter((c) => c.current_status === "OPEN").length,
    awaiting_approval: cases.filter((c) => c.current_status === "AWAITING_APPROVAL").length,
    escalated_cases: cases.filter((c) => c.current_status === "ESCALATED").length,
    stopped_cases: cases.filter((c) => c.current_status === "STOPPED").length,
    by_root_cause: countBy(cases, "root_cause"),
    by_status: countBy(cases, "current_status"),
    funnel: [
      { label: "Transactions Recorded", value: transactions.length || cases.length },
      { label: "Revenue At Risk", value: cases.length },
      { label: "Eligible For Recovery", value: eligibleForRecovery.length },
      { label: "Interventions Executed", value: interventionsExecuted.length },
      { label: "Payments Recovered", value: paymentsRecovered.length },
    ],
  };
}

function countBy(arr, key) {
  const out = {};
  for (const item of arr) {
    out[item[key]] = (out[item[key]] || 0) + 1;
  }
  return out;
}

function countAmountBy(arr, key) {
  const grouped = {};
  for (const item of arr) {
    if (!grouped[item[key]]) grouped[item[key]] = [];
    grouped[item[key]].push(item.amount);
  }
  const out = {};
  for (const [k, amounts] of Object.entries(grouped)) {
    out[k] = sumRupeesSafely(amounts);
  }
  return out;
}

export async function getBaselineComparison() {
  const metrics = await getModelMetrics();
  if (metrics.error) return metrics;
  const biz = metrics.business_metrics;
  const CALC_TAG = "SIMULATED_DISCLOSED_MODEL";
  const CALC_NOTE = "Both baseline and RecoverAI outcomes are computed with the identical rule (genuinely recoverable AND the chosen action addresses the failure reason), using a disclosed, inspectable action-effectiveness mapping (EFFECTIVE_ACTIONS in ai-service/train_model.py) - not an opaque success-rate constant. This is simulation against a documented model, not a measurement from live transactions.";
  return {
    baseline: {
      strategy: "Fixed retry: every eligible failed payment gets the same PAYMENT_RETRY action, regardless of why it failed",
      revenue_recovered: biz.baseline_revenue_recovered,
      calculation: CALC_TAG,
      assumption_detail: CALC_NOTE,
    },
    recoverai: {
      strategy: "AI recovery-probability model + root-cause diagnosis selects the action appropriate to each failure reason, gated by the real Policy Engine thresholds",
      revenue_recovered: biz.total_revenue_recovered,
      revenue_recovered_automated: {
        value: biz.total_revenue_recovered_automated,
        calculation: CALC_TAG,
        detail: CALC_NOTE,
      },
      revenue_recovered_via_escalation: {
        value: biz.total_revenue_recovered_via_escalation,
        calculation: CALC_TAG,
        detail: "Escalated (human-approval-required) cases use the identical effectiveness rule as automated ones - this assumes the approval step itself happens, not a separate human-efficiency discount. " + CALC_NOTE,
      },
    },
    recovery_lift_vs_baseline_pct: {
      value: biz.recovery_lift_vs_baseline_pct,
      calculation: "DERIVED",
      detail: "Derived directly from the two simulated figures above under the same shared outcome model - not independently measured.",
    },
    cases_evaluated: biz.cases_evaluated,
    methodology: biz.methodology,
    note: "Computed from the held-out test set in ai-service/metrics.json. See docs/evaluation.md for the full methodology, including the EFFECTIVE_ACTIONS mapping used for both strategies.",
  };
}
