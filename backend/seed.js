import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";
import db from "./db/index.js";
import { makeCustomer, makeTransaction, makeRecoveryCase } from "./models/schemas.js";
import { diagnoseRuleBased } from "./scripts/ruleBasedDiagnosis.js";
import { recoveryEconomicsJs } from "./scripts/economicsJs.js";

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

async function main() {
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
    await db.insert("recovery_cases", newCase);
    await db.update("recovery_cases", (c) => c.transaction_id === transaction.transaction_id, { current_status: status });

    if (status === "RECOVERED") {
      await db.insert("verification_records", {
        verification_id: nanoid(10),
        case_id: newCase.case_id,
        transaction_id: transaction.transaction_id,
        amount: Number(r.amount),
        status: "VERIFICATION_SUCCESS",
        provider: "seeded_historical_data",
        execution_mode: "SEEDED_DEMO",
        verified_at: transaction.timestamp,
        metadata: { note: "Seeded from the synthetic dataset's own generation label, not a live orchestrator run." },
      });
    }
  }

  console.log(
    `Seeded ${await db.count("customers")} customers, ${await db.count("transactions")} transactions, ${await db.count("recovery_cases")} recovery cases. (seed=${SEED}, deterministic)`
  );
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
