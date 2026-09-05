import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";
import db, { getBackendName } from "./db/index.js";
import { toPaise } from "./services/money.js";
import { makeCustomer, makeTransaction, makeRecoveryCase } from "./models/schemas.js";
import { diagnoseRuleBased } from "./scripts/ruleBasedDiagnosis.js";
import { recoveryEconomicsJs } from "./scripts/economicsJs.js";
import { recordEvaluationRunFromMetrics } from "./services/evaluationRun.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, "..", "data", "revenue_events.csv");
const SEED = 42;

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);

function parseCSV(text) {
  const [headerLine, ...lines] = text.trim().split("\n");
  const headers = headerLine.split(",");
  return lines.map((line) => {
    const values = line.split(",");
    const row = {};
    headers.forEach((h, i) => (row[h] = values[i]));
    return row;
  });
}

async function seedPitchCase({ key, amount, customerId, action, status, confidence, rootCause, paymentMethod, approval = false, verified = false }) {
  const transactionId = `txn_pitch_${key}_42`;
  const caseId = `case_pitch_${key}_42`;
  const timestamp = new Date(`2026-08-${String(key === "A" ? 20 : key === "B" ? 21 : 22).padStart(2, "0")}T10:00:00.000Z`).toISOString();
  await db.insert("customers", makeCustomer({ customer_id: customerId, name: `Pitch Case ${key}`, email: `${customerId}@example.com`, phone: "9999999999" }));
  const transaction = makeTransaction({ transaction_id: transactionId, customer_id: customerId, amount, status: "failed", payment_method: paymentMethod, failure_reason: rootCause });
  transaction.timestamp = timestamp;
  await db.insert("transactions", transaction);
  const diagnosis = { cause: rootCause, confidence, evidence: [`Deterministic pitch case ${key} evidence from the seeded scenario.`], recommended_action: action };
  const recoveryCase = makeRecoveryCase({ case_id: caseId, transaction_id: transactionId, customer_id: customerId, amount, risk_score: 1 - confidence, recovery_probability: confidence, root_cause: rootCause, recommended_action: action, policy_status: approval ? "REQUIRES_APPROVAL" : status === "ESCALATED" ? "BLOCKED" : "ALLOWED" });
  recoveryCase.current_status = status;
  recoveryCase.evidence = diagnosis.evidence;
  recoveryCase.economics = recoveryEconomicsJs(amount, confidence, action);
  recoveryCase.source_features = transaction;
  recoveryCase.created_at = timestamp;
  recoveryCase.updated_at = timestamp;
  recoveryCase.scenario = `PITCH_CASE_${key}`;
  await db.insert("recovery_cases", recoveryCase);
  const auditEvents = [
    ["PAYMENT_FAILURE_DETECTED", "Payment failure detected."],
    ["ROOT_CAUSE_CLASSIFIED", `Root cause classified as ${rootCause}.`],
    ["RECOVERY_PROBABILITY_CALCULATED", `Recovery probability ${confidence}.`],
    [approval ? "APPROVAL_REQUESTED" : "POLICY_GATE_PASSED", approval ? "High-value action requires human approval." : "Policy allows autonomous recovery."],
  ];
  for (let i = 0; i < auditEvents.length; i++) {
    await db.insert("audit_logs", { audit_id: `pitch_${key}_audit_${i}`, case_id: caseId, timestamp, actor: i === 3 ? "POLICY_ENGINE" : "AI_AGENT", event: auditEvents[i][0], reason: auditEvents[i][1], result: approval ? "PENDING" : "OK", metadata: { source: "synthetic_dataset", demo: true, execution_mode: "SEEDED_DEMO" } });
  }
  if (approval) {
    await db.insert("approvals", { approval_id: `pitch_${key}_approval`, case_id: caseId, transaction_id: transactionId, customer_id: customerId, amount_paise: toPaise(amount), action_type: action, status: "PENDING", created_at: timestamp, metadata: { source: "synthetic_dataset", demo: true, execution_mode: "SEEDED_DEMO" } });
  }
  if (verified) {
    await db.insert("verification_records", { verification_id: `pitch_${key}_verification`, case_id: caseId, transaction_id: transactionId, amount, amount_paise: toPaise(amount), status: "VERIFICATION_SUCCESS", provider: "seeded_historical_data", execution_mode: "SEEDED_DEMO", verified_at: timestamp, metadata: { source: "synthetic_dataset", demo: true, note: "Seeded historical demo record; not a live provider recovery." } });
    await db.insert("audit_logs", { audit_id: `pitch_${key}_verified`, case_id: caseId, timestamp, actor: "SYSTEM", event: "RECOVERY_VERIFIED", reason: "Seeded historical verification record.", result: "SUCCESS", metadata: { source: "synthetic_dataset", demo: true, execution_mode: "SEEDED_DEMO" } });
  }
  if (status === "ESCALATED") {
    await db.update("recovery_cases", (item) => item.case_id === caseId, { attempt_count: 3 });
    await db.insert("audit_logs", { audit_id: `pitch_${key}_stopped`, case_id: caseId, timestamp, actor: "SYSTEM", event: "STOPPING_RULE_TRIGGERED", reason: "Maximum automated attempts reached.", result: "STOPPED", metadata: { source: "synthetic_dataset", demo: true, execution_mode: "SEEDED_DEMO" } });
    await db.insert("audit_logs", { audit_id: `pitch_${key}_escalated`, case_id: caseId, timestamp, actor: "SYSTEM", event: "CASE_ESCALATED", reason: "Escalated after retry exhaustion.", result: "ESCALATED", metadata: { source: "synthetic_dataset", demo: true, execution_mode: "SEEDED_DEMO" } });
  }
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("ERROR: MONGODB_URI is not configured.");
    console.error("Seed aborted to prevent writing demo data to the file store.");
    process.exitCode = 1;
    return;
  }
  try {
    if (await getBackendName() !== "mongo") throw new Error("MongoDB backend was not selected.");
  } catch (error) {
    console.error(`ERROR: MongoDB connection failed: ${error.message}`);
    console.error("Demo seeding aborted.");
    process.exitCode = 1;
    return;
  }
  console.log("RecoverAI Demo Seeder");
  console.log("---------------------");
  console.log("Database: MongoDB Atlas");
  console.log("Mode: SEEDED DEMO");
  console.log(`Seed: ${SEED}`);
  console.log("Dataset: revenue_events.csv");

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`Dataset not found at ${CSV_PATH}. Run: cd ai-service && python3 generate_dataset.py`);
    process.exit(1);
  }
  await db.reset();

  const rows = parseCSV(fs.readFileSync(CSV_PATH, "utf-8"));
  const atRiskRows = rows.filter((r) => r.payment_status !== "success").slice(0, 600); // sample for demo responsiveness

  const seenCustomers = new Set();

  for (const r of atRiskRows) {
    if (!seenCustomers.has(r.customer_id)) {
      seenCustomers.add(r.customer_id);
      await db.insert("customers", makeCustomer({
        customer_id: r.customer_id,
        name: `Customer ${r.customer_id.slice(-4)}`,
        email: `${r.customer_id}@example.com`,
        phone: "9999999999",
      }));
    }

    const transaction = makeTransaction({
      transaction_id: r.transaction_id,
      customer_id: r.customer_id,
      amount: Number(r.amount),
      status: r.payment_status,
      payment_method: r.payment_method,
      failure_reason: r.failure_reason,
      checkout_started: r.checkout_started === "True",
      checkout_completed: r.checkout_completed === "True",
    });
    transaction.timestamp = new Date(Date.parse("2026-06-01T00:00:00.000Z") + seenCustomers.size * 60000).toISOString();
    await db.insert("transactions", transaction);

    const diagnosis = diagnoseRuleBased({
      failure_reason: r.failure_reason,
      previous_attempts: Number(r.previous_attempts),
      previous_successes: Number(r.previous_successes),
      customer_activity_days: Number(r.customer_activity_days),
      checkout_completed: r.checkout_completed === "True",
      subscription_status: r.subscription_status,
      days_overdue: Number(r.days_overdue),
      amount: Number(r.amount),
    });

    const isRecoverable = r.is_recoverable === "1";
    const status = isRecoverable && diagnosis.confidence >= 0.7
      ? (rng() < 0.7 ? "RECOVERED" : "OPEN")
      : (diagnosis.confidence < 0.4 ? "ESCALATED" : "AWAITING_APPROVAL");

    const newCase = makeRecoveryCase({
      case_id: nanoid(10),
      transaction_id: transaction.transaction_id,
      customer_id: r.customer_id,
      amount: Number(r.amount),
      risk_score: Math.round((1 - diagnosis.confidence) * 100) / 100,
      recovery_probability: diagnosis.confidence,
      root_cause: diagnosis.cause,
      recommended_action: diagnosis.recommended_action,
      policy_status: status === "AWAITING_APPROVAL" ? "REQUIRES_APPROVAL" : status === "ESCALATED" ? "BLOCKED" : "ALLOWED",
    });
    newCase.evidence = diagnosis.evidence;
    newCase.economics = recoveryEconomicsJs(Number(r.amount), diagnosis.confidence, diagnosis.recommended_action);
    newCase.source_features = transaction;
    await db.insert("recovery_cases", newCase);
    await db.update("recovery_cases", (c) => c.transaction_id === transaction.transaction_id, { current_status: status });

    if (status === "RECOVERED") {
      await db.insert("verification_records", {
        verification_id: nanoid(10),
        case_id: newCase.case_id,
        transaction_id: transaction.transaction_id,
        amount: Number(r.amount),
        amount_paise: toPaise(Number(r.amount)),
        status: "VERIFICATION_SUCCESS",
        provider: "seeded_historical_data",
        execution_mode: "SEEDED_DEMO",
        verified_at: transaction.timestamp,
        metadata: { source: "synthetic_dataset", demo: true, note: "Seeded historical demo record; not a live provider recovery." },
      });
    }
  }

  await seedPitchCase({ key: "A", amount: 4999, customerId: "cust_pitch_a_42", action: "PAYMENT_RETRY", status: "RECOVERED", confidence: 0.93, rootCause: "TEMPORARY_PAYMENT_FAILURE", paymentMethod: "upi", verified: true });
  await seedPitchCase({ key: "B", amount: 35000, customerId: "cust_pitch_b_42", action: "PAYMENT_LINK", status: "AWAITING_APPROVAL", confidence: 0.9, rootCause: "TEMPORARY_PAYMENT_FAILURE", paymentMethod: "card", approval: true });
  await seedPitchCase({ key: "C", amount: 3000, customerId: "cust_pitch_c_42", action: "PAYMENT_RETRY", status: "ESCALATED", confidence: 0.85, rootCause: "TEMPORARY_PAYMENT_FAILURE", paymentMethod: "card" });
  await recordEvaluationRunFromMetrics();

  console.log(
    `Seeded ${await db.count("customers")} customers, ${await db.count("transactions")} transactions, ${await db.count("recovery_cases")} recovery cases, ${await db.count("verification_records")} verification records. (seed=${SEED}, deterministic)`
  );
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
