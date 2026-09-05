import { test } from "node:test";
import assert from "node:assert/strict";

process.env.MONGODB_URI = "";

import { transitionCaseStatus } from "../services/caseStateMachine.js";

const db = (await import("../db/index.js")).default;
const orchestrator = await import("../services/orchestrator.js");

test("determineVerification: a failed PAYMENT_LINK execution (no payment_link_id) must never verify as paid - the exact 'CRITICAL RAZORPAY FALLBACK FIX' bug class", async () => {
  const failedExecution = {
    mode: "TEST_MODE_ERROR", success: false, error: "simulated API outage",
    note: "no payment_link_id fabricated",
  };
  const verification = await orchestrator.determineVerification("PAYMENT_LINK", failedExecution, {
    transactionId: "txn_x", recoveryProbability: 0.99, // deliberately high, to prove probability can't rescue a failed action
  });
  assert.equal(verification.paid, false);
});

test("determineVerification: PAYMENT_RETRY verification mirrors the execution's own success flag, never re-rolls independently", async () => {
  const failed = await orchestrator.determineVerification("PAYMENT_RETRY", { mode: "SIMULATED", success: false }, {});
  assert.equal(failed.paid, false);
  const succeeded = await orchestrator.determineVerification("PAYMENT_RETRY", { mode: "SIMULATED", success: true }, {});
  assert.equal(succeeded.paid, true);
});

function stubAIService({ recovery_probability, cause, confidence, action }) {
  global.fetch = async (url) => {
    if (url.includes("/predict/recovery-probability")) {
      return { ok: true, json: async () => ({ recovery_probability, risk_score: 1 - recovery_probability }) };
    }
    if (url.includes("/diagnose/root-cause")) {
      return {
        ok: true,
        json: async () => ({
          cause, confidence, evidence: ["stubbed evidence for integration test"], recommended_action: action,
        }),
      };
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };
}

test("orchestrator (end-to-end): 3 automated retries fail, agent stops itself and never attempts a 4th", async () => {
  await db.reset();
  stubAIService({ recovery_probability: 0.9, cause: "TEMPORARY_PAYMENT_FAILURE", confidence: 0.9, action: "PAYMENT_RETRY" });

  const txn = {
    transaction_id: "txn_demo_fail_6", amount: 2000, customer_id: "cust_integration_retries",
    failure_reason: "TEMPORARY_PAYMENT_FAILURE",
  };

  let caseId;
  const results = [];
  for (let i = 1; i <= 4; i++) {
    const r = await orchestrator.runRecovery(txn, { existingCaseId: caseId });
    caseId = r.case.case_id;
    results.push(r);
  }

  assert.equal(results[0].executed, true);
  assert.equal(results[1].executed, true);
  assert.equal(results[2].executed, true);
  assert.equal(results[0].case.attempt_count, 1);
  assert.equal(results[1].case.attempt_count, 2);
  assert.equal(results[2].case.attempt_count, 3);

  // The 4th call must be BLOCKED by policy - no 4th execution, no 4th attempt counted.
  assert.equal(results[3].executed, false, "a 4th automated retry must never execute");
  assert.equal(results[3].decision.policyTriggered, "MAX_AUTOMATED_RETRIES");
  assert.equal(results[3].case.attempt_count, 3, "attempt_count must not increase past 3");
  assert.equal(results[3].case.current_status, "ESCALATED");

  const audit = await orchestrator.getAuditTrail(caseId);
  const events = audit.map((a) => a.event);
  assert.ok(events.includes("MAX_RETRIES_REACHED"));
  assert.ok(events.includes("CASE_ESCALATED"));
  assert.ok(!events.includes("REVENUE_RECOVERED"), "revenue must never be marked recovered when every verification failed");
});

test("orchestrator (end-to-end): revenue is marked RECOVERED only after successful verification", async () => {
  await db.reset();
  stubAIService({ recovery_probability: 0.95, cause: "TEMPORARY_PAYMENT_FAILURE", confidence: 0.95, action: "PAYMENT_RETRY" });

  const r = await orchestrator.runRecovery({
    transaction_id: "txn_demo_b_4", amount: 1000, customer_id: "cust_integration_success",
    failure_reason: "TEMPORARY_PAYMENT_FAILURE",
  });

  assert.equal(r.executed, true);
  assert.equal(r.verification.paid, true);
  assert.equal(r.case.current_status, "RECOVERED");

  const audit = await orchestrator.getAuditTrail(r.case.case_id);
  const events = audit.map((a) => a.event);
  assert.ok(events.includes("REVENUE_RECOVERED"));
  assert.ok(events.includes("CASE_CLOSED"));
});

test("orchestrator (end-to-end): high-value transaction is blocked pending human approval, then executes only after approval", async () => {
  await db.reset();
  stubAIService({ recovery_probability: 0.9, cause: "TEMPORARY_PAYMENT_FAILURE", confidence: 0.9, action: "PAYMENT_LINK" });

  const txn = {
    transaction_id: "txn_integration_highvalue", amount: 35000, customer_id: "cust_integration_hv",
    failure_reason: "TEMPORARY_PAYMENT_FAILURE",
  };

  const first = await orchestrator.runRecovery(txn);
  assert.equal(first.executed, false);
  assert.equal(first.decision.requiresApproval, true);
  assert.equal(first.decision.policyTriggered, "HIGH_VALUE_TRANSACTION_REQUIRES_APPROVAL");
  assert.equal(first.case.current_status, "AWAITING_APPROVAL");

  const approved = await orchestrator.runRecovery(txn, {
    humanApprovalGranted: true, existingCaseId: first.case.case_id,
  });
  assert.equal(approved.executed, true);
  assert.equal(approved.decision.allowed, true);

  const audit = await orchestrator.getAuditTrail(first.case.case_id);
  const events = audit.map((a) => a.event);
  assert.ok(events.includes("AWAITING_HUMAN_APPROVAL"));
  assert.ok(events.includes("APPROVAL_GRANTED"));
});

test("orchestrator (end-to-end): policy_status is updated to a terminal value after a successful automated execution, not left as PENDING", async () => {
  await db.reset();
  stubAIService({ recovery_probability: 0.95, cause: "TEMPORARY_PAYMENT_FAILURE", confidence: 0.95, action: "PAYMENT_RETRY" });

  const r = await orchestrator.runRecovery({
    transaction_id: "txn_demo_b_4", amount: 1000, customer_id: "cust_policy_status_test",
    failure_reason: "TEMPORARY_PAYMENT_FAILURE",
  });

  assert.equal(r.case.policy_status, "ALLOWED", "policy_status must reflect the real gate outcome, not stay PENDING");
});

test("orchestrator (end-to-end): policy_status reflects human override after approval", async () => {
  await db.reset();
  stubAIService({ recovery_probability: 0.9, cause: "TEMPORARY_PAYMENT_FAILURE", confidence: 0.9, action: "PAYMENT_LINK" });

  const txn = { transaction_id: "txn_policy_status_hv", amount: 35000, customer_id: "cust_policy_status_hv", failure_reason: "TEMPORARY_PAYMENT_FAILURE" };
  const first = await orchestrator.runRecovery(txn);
  assert.equal(first.case.policy_status, "REQUIRES_APPROVAL");

  const approved = await orchestrator.runRecovery(txn, { humanApprovalGranted: true, existingCaseId: first.case.case_id });
  assert.equal(approved.case.policy_status, "APPROVED_BY_HUMAN");
});

test("orchestrator (end-to-end): duplicate execute calls for the same attempt are idempotent - no second real financial action", async () => {
  await db.reset();
  stubAIService({ recovery_probability: 0.95, cause: "TEMPORARY_PAYMENT_FAILURE", confidence: 0.95, action: "PAYMENT_RETRY" });

  const txn = {
    transaction_id: "txn_idempotency_test", amount: 1000, customer_id: "cust_idempotency_test",
    failure_reason: "TEMPORARY_PAYMENT_FAILURE",
  };

  const first = await orchestrator.runRecovery(txn);
  const duplicate = await orchestrator.runRecovery(txn, { existingCaseId: first.case.case_id });

  const actions = await db.find("recovery_actions", (a) => a.case_id === first.case.case_id);
  const attempt1Actions = actions.filter((a) => a.idempotency_key === `${first.case.case_id}:PAYMENT_RETRY:1`);
  assert.equal(attempt1Actions.length, 1, "exactly one real action must exist for case:PAYMENT_RETRY:attempt-1, never two");
  assert.ok(duplicate.idempotent_replay || duplicate.finalStatus, "duplicate call must either replay idempotently or have naturally moved to attempt 2, not double-fire attempt 1");
});

test("orchestrator (end-to-end): a RECOVERED case must remain RECOVERED if re-run (STOP_AFTER_SUCCESS must never overwrite a terminal status)", async () => {
  await db.reset();
  stubAIService({ recovery_probability: 0.95, cause: "TEMPORARY_PAYMENT_FAILURE", confidence: 0.95, action: "PAYMENT_RETRY" });

  const txn = {
    transaction_id: "txn_demo_b_4", amount: 1000, customer_id: "cust_terminal_status_test",
    failure_reason: "TEMPORARY_PAYMENT_FAILURE",
  };

  const first = await orchestrator.runRecovery(txn);
  assert.equal(first.case.current_status, "RECOVERED");

  const second = await orchestrator.runRecovery(txn, { existingCaseId: first.case.case_id });
  assert.equal(second.case.current_status, "RECOVERED", "a terminal RECOVERED status must never be overwritten");
  assert.equal(second.decision.policyTriggered, "STOP_AFTER_SUCCESS");
});

test("state machine enforcement (end-to-end, not just unit-level): transitionCaseStatus rejects an illegal transition on a real persisted case", async () => {
  await db.reset();
  stubAIService({ recovery_probability: 0.95, cause: "TEMPORARY_PAYMENT_FAILURE", confidence: 0.95, action: "PAYMENT_RETRY" });

  const r = await orchestrator.runRecovery({
    transaction_id: "txn_demo_b_4", amount: 1000, customer_id: "cust_state_machine_e2e",
    failure_reason: "TEMPORARY_PAYMENT_FAILURE",
  });
  assert.equal(r.case.current_status, "RECOVERED");

  await assert.rejects(
    () => transitionCaseStatus(db, r.case.case_id, "OPEN"),
    /Illegal case state transition rejected/
  );

  const stillRecovered = await db.findOne("recovery_cases", (c) => c.case_id === r.case.case_id);
  assert.equal(stillRecovered.current_status, "RECOVERED");
});
