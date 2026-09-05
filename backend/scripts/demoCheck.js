import "dotenv/config";
import db, { getBackendName } from "../db/index.js";

const checks = [];
function check(label, passed) {
  checks.push({ label, passed });
}

async function main() {
  console.log("RecoverAI Demo Readiness");
  console.log("------------------------");
  let backend = "unknown";
  try {
    backend = await getBackendName();
    check("MongoDB Atlas", backend === "mongo");
  } catch {
    check("MongoDB Atlas", false);
  }
  check("Seeded dataset", (await db.count("transactions")) > 0);
  check("Recovery cases", (await db.count("recovery_cases")) > 0);
  check("Verification records", (await db.count("verification_records")) > 0);
  check("Approval workflow", (await db.count("approvals")) > 0);
  check("Escalation workflow", (await db.find("recovery_cases", (item) => item.current_status === "ESCALATED")).length > 0);
  check("Audit trail", (await db.count("audit_logs")) > 0);
  check("Simulation mode", Boolean(process.env.RAZORPAY_KEY_ID) === false);
  check("Authentication configured", Boolean(process.env.ADMIN_API_KEY || process.env.REVIEWER_API_KEY));
  check("Evaluation run", (await db.count("evaluation_runs")) >= 2);
  try {
    const response = await fetch(`${process.env.AI_SERVICE_URL || "http://localhost:8000"}/health`, { signal: AbortSignal.timeout(3000) });
    check("AI service", response.ok);
  } catch {
    check("AI service", false);
  }
  for (const result of checks) console.log(`${result.passed ? "✓" : "✗"} ${result.label}`);
  if (backend !== "mongo" || checks.some((result) => !result.passed)) {
    console.log("\nDEMO NOT READY");
    process.exitCode = 1;
    return;
  }
  console.log("\nDEMO READY");
}

main().catch((error) => {
  console.error(`Demo readiness failed: ${error.message}`);
  process.exitCode = 1;
});
