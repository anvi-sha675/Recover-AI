const BASE = process.env.BACKEND_URL || "http://localhost:4000";

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

async function main() {
  console.log("=== RecoverAI Demo Runner ===");

  console.log("\n[Case A] Successful automated recovery (₹4,999, temporary failure, high confidence)");
  const a = await post("/api/recovery/execute", {
    transaction: {
      transaction_id: "txn_demo_a_0", amount: 4999, customer_id: "cust_demo_a",
      customer_name: "Aarav Mehta", customer_email: "aarav@example.com",
      failure_reason: "TEMPORARY_PAYMENT_FAILURE", payment_method: "upi",
      previous_attempts: 0, previous_successes: 7, customer_activity_days: 1,
      time_since_failure_hours: 1, checkout_duration_sec: 90,
      subscription_status: "none", days_overdue: 0, checkout_completed: true,
    },
  });
  console.log(`  -> status: ${a.case?.current_status}, recovery_probability: ${a.case?.recovery_probability}`);

  console.log("\n[Case B] High-value transaction requiring human approval (₹35,000)");
  const b = await post("/api/recovery/execute", {
    transaction: {
      transaction_id: "txn_demo_b_4", amount: 35000, customer_id: "cust_demo_b",
      customer_name: "Priya Sharma", customer_email: "priya@example.com",
      failure_reason: "TEMPORARY_PAYMENT_FAILURE", payment_method: "card",
      previous_attempts: 0, previous_successes: 7, customer_activity_days: 1,
      time_since_failure_hours: 1, checkout_duration_sec: 90,
      subscription_status: "none", days_overdue: 0, checkout_completed: true,
    },
  });
  console.log(`  -> status: ${b.case?.current_status}, requires approval: ${b.decision?.requiresApproval}`);
  const approved = await post(`/api/recovery/cases/${b.case.case_id}/approve`);
  console.log(`  -> after human approval: ${approved.case?.current_status}`);

  console.log("\n[Case C] Graceful failure: 3 automated retries fail, agent stops and escalates (never a 4th retry)");
  let caseId;
  for (let i = 1; i <= 4; i++) {
    const r = await post("/api/recovery/execute", {
      transaction: {
        transaction_id: "txn_demo_fail_6", amount: 3000, customer_id: "cust_demo_fail",
        failure_reason: "TEMPORARY_PAYMENT_FAILURE", payment_method: "card",
        previous_attempts: 0, previous_successes: 7, customer_activity_days: 1,
        time_since_failure_hours: 1, checkout_duration_sec: 90,
        subscription_status: "none", days_overdue: 0, checkout_completed: true,
      },
      existingCaseId: caseId,
    });
    caseId = r.case.case_id;
    console.log(`  Attempt ${i}: attempt_count=${r.case.attempt_count}, status=${r.case.current_status}, executed=${r.executed}`);
  }

  console.log("\nDone. Case IDs:", { caseA: a.case.case_id, caseB: b.case.case_id, caseC: caseId });
}

main().catch((e) => {
  console.error("Demo run failed:", e.message);
  process.exit(1);
});
