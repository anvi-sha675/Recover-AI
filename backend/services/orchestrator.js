import { nanoid } from "nanoid"; import db from "../db/index.js";
import * as policyEngine from "./policyEngine.js";
import * as razorpay from "./razorpayService.js";
import { makeRecoveryCase, makeRecoveryAction, makeAuditLog } from "../models/schemas.js";
import { transitionCaseStatus } from "./caseStateMachine.js";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

async function audit(caseId, actor, event, reason, result, metadata = {}) {
  return db.insert("audit_logs", makeAuditLog({
    audit_id: nanoid(10), case_id: caseId, actor, event, reason, result, metadata,
  }));
}

export async function determineVerification(actionType, executionResult, { transactionId, recoveryProbability }) {
  if (executionResult.success === false && actionType !== "REMINDER") {
    return { paid: false, mode: executionResult.mode, note: "Action execution failed - not attempting verification." };
  }
  if (actionType === "PAYMENT_RETRY" || actionType === "SUBSCRIPTION_RETRY") {
    return { paid: executionResult.success, mode: executionResult.mode };
  }
  if (actionType === "PAYMENT_LINK") {
    if (!executionResult.payment_link_id) {
      return { paid: false, mode: executionResult.mode, note: "No payment_link_id was created - action failed, nothing to verify." };
    }
    return razorpay.verifyPayment({
      transactionId, paymentLinkId: executionResult.payment_link_id, recoveryProbability,
    });
  }
  return { paid: false, mode: "N/A", note: "Reminder-only action has no immediate payment to verify." };
}

async function callAIService(path, body) {
  try {
    const res = await fetch(`${AI_SERVICE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`AI service ${path} returned ${res.status}`);
    return await res.json();
  } catch (err) {
    return { error: err.message, unavailable: true };
  }
}

export async function analyze(transaction) {
  const [prediction, diagnosis, economics] = await Promise.all([
    callAIService("/predict/recovery-probability", transaction),
    callAIService("/diagnose/root-cause", transaction),
    callAIService("/economics", transaction),
  ]);

  if (prediction.unavailable || diagnosis.unavailable) {
    return {
      error: "AI_SERVICE_UNAVAILABLE",
      detail: "The AI service (FastAPI) is not reachable at " + AI_SERVICE_URL +
        ". Start it with: cd ai-service && uvicorn app:app --reload",
    };
  }

  return {
    recovery_probability: prediction.recovery_probability,
    risk_score: prediction.risk_score,
    diagnosis,
    economics: economics.unavailable ? null : economics,
  };
}

export async function runRecovery(transaction, { humanApprovalGranted = false, existingCaseId = null } = {}) {
  let recoveryCase = existingCaseId
    ? await db.findOne("recovery_cases", (c) => c.case_id === existingCaseId)
    : null;

  await audit(recoveryCase?.case_id || "PENDING", "SYSTEM", "PAYMENT_FAILURE_DETECTED",
    "Transaction flagged as revenue at risk", "OK", { transaction_id: transaction.transaction_id });

  const analysis = await analyze(transaction);
  if (analysis.error) {
    return { error: analysis.error, detail: analysis.detail };
  }
  const { recovery_probability, risk_score, diagnosis, economics } = analysis;

  if (!recoveryCase) {
    recoveryCase = makeRecoveryCase({
      case_id: nanoid(10),
      transaction_id: transaction.transaction_id,
      customer_id: transaction.customer_id,
      amount: transaction.amount,
      risk_score,
      recovery_probability,
      root_cause: diagnosis.cause,
      recommended_action: diagnosis.recommended_action,
      policy_status: "PENDING",
    });
    recoveryCase.evidence = diagnosis.evidence; // persisted for the Case Detail "Why RecoverAI chose this" panel
    recoveryCase.economics = economics; // expected-value reasoning, persisted for Case Detail
    recoveryCase.source_features = transaction; // full feature payload, for re-analysis on approval
    recoveryCase = await db.insert("recovery_cases", recoveryCase);
  }

  await audit(recoveryCase.case_id, "AI_AGENT", "ROOT_CAUSE_CLASSIFIED",
    `Classified as ${diagnosis.cause}`, "OK", { evidence: diagnosis.evidence, confidence: diagnosis.confidence });
  await audit(recoveryCase.case_id, "AI_AGENT", "RECOVERY_PROBABILITY_CALCULATED",
    `recovery_probability=${recovery_probability}`, "OK", { risk_score });
  await audit(recoveryCase.case_id, "AI_AGENT", "ACTION_RECOMMENDED",
    `Recommended ${diagnosis.recommended_action}`, "OK", {});

  const allActions = await db.find("recovery_actions", () => true);
  const allCases = await db.find("recovery_cases", () => true);
  const interventionsForCustomer = allActions.filter((a) => {
    const c = allCases.find((rc) => rc.case_id === a.case_id);
    return c && c.customer_id === transaction.customer_id;
  }).length;

  const lastOutcomeWasSuccess = recoveryCase.current_status === "RECOVERED";

  const decision = policyEngine.evaluate(await policyEngine.getPolicyConfig(), {
    amount: transaction.amount,
    recoveryProbability: recovery_probability,
    recommendedAction: diagnosis.recommended_action,
    attemptCount: recoveryCase.attempt_count,
    interventionsForCustomer,
    lastOutcomeWasSuccess,
  });

  await audit(recoveryCase.case_id, "POLICY_ENGINE",
    decision.allowed ? "POLICY_GATE_PASSED" : (decision.requiresApproval ? "HUMAN_APPROVAL_REQUIRED" : "POLICY_BLOCKED"),
    decision.reason, decision.allowed ? "ALLOWED" : "BLOCKED", { policyTriggered: decision.policyTriggered });

  // Stop path
  if (decision.stop) {
    const newStatus = decision.policyTriggered === "STOP_AFTER_SUCCESS"
      ? recoveryCase.current_status
      : (decision.escalate ? "ESCALATED" : "STOPPED");
    await transitionCaseStatus(db, recoveryCase.case_id, newStatus, {
      patch: { policy_status: decision.policyTriggered === "STOP_AFTER_SUCCESS" ? recoveryCase.policy_status : "BLOCKED" },
    });
    await audit(recoveryCase.case_id, "SYSTEM", decision.escalate ? "CASE_ESCALATED" : "CASE_STOPPED",
      decision.reason, "STOPPED", { policyTriggered: decision.policyTriggered });
    return { case: await db.findOne("recovery_cases", (c) => c.case_id === recoveryCase.case_id), decision, executed: false };
  }

  if (decision.requiresApproval && !humanApprovalGranted) {
    await transitionCaseStatus(db, recoveryCase.case_id, "AWAITING_APPROVAL", {
      patch: { policy_status: "REQUIRES_APPROVAL" },
    });
    await db.insert("approvals", {
      approval_id: nanoid(10),
      case_id: recoveryCase.case_id,
      status: "PENDING",
      created_at: new Date().toISOString(),
    });
    await audit(recoveryCase.case_id, "SYSTEM", "AWAITING_HUMAN_APPROVAL", decision.reason, "PENDING", { policyTriggered: decision.policyTriggered });
    return { case: await db.findOne("recovery_cases", (c) => c.case_id === recoveryCase.case_id), decision, executed: false };
  }

  if (humanApprovalGranted) {
    await audit(recoveryCase.case_id, "HUMAN_REVIEWER", "APPROVAL_GRANTED",
      "Human reviewer approved recovery action", "APPROVED", {});
    decision.allowed = true;
    decision.requiresApproval = false;
    decision.reason = `${decision.reason} -> OVERRIDDEN by human approval.`;
  }

  await db.update("recovery_cases", (c) => c.case_id === recoveryCase.case_id, {
    policy_status: humanApprovalGranted ? "APPROVED_BY_HUMAN" : "ALLOWED",
  });

  // ---- EXECUTE ----
  const actionType = diagnosis.recommended_action;
  const attemptNumber = recoveryCase.attempt_count + 1;

  const idempotencyKey = `${recoveryCase.case_id}:${actionType}:${attemptNumber}`;
  const existingAction = await db.findOne("recovery_actions", (a) => a.idempotency_key === idempotencyKey);
  if (existingAction) {
    await audit(recoveryCase.case_id, "SYSTEM", "DUPLICATE_ACTION_BLOCKED",
      `Idempotency key ${idempotencyKey} already executed - skipping duplicate financial action.`, "SKIPPED",
      { idempotency_key: idempotencyKey, original_action_id: existingAction.action_id });
    return {
      case: await db.findOne("recovery_cases", (c) => c.case_id === recoveryCase.case_id),
      decision,
      executed: false,
      idempotent_replay: true,
      executionResult: JSON.parse(existingAction.result),
    };
  }

  const action = makeRecoveryAction({
    action_id: nanoid(10),
    case_id: recoveryCase.case_id,
    action_type: actionType,
    reason: diagnosis.evidence.join("; "),
    confidence: diagnosis.confidence,
    approved_by: humanApprovalGranted ? "human_reviewer" : "policy_engine",
  });

  let executionResult;
  if (actionType === "PAYMENT_RETRY" || actionType === "SUBSCRIPTION_RETRY") {
    executionResult = await razorpay.retryPayment({
      transactionId: transaction.transaction_id,
      amount: transaction.amount,
      attemptNumber,
    });
  } else if (actionType === "PAYMENT_LINK") {
    executionResult = await razorpay.createPaymentLink({
      transactionId: transaction.transaction_id,
      amount: transaction.amount,
      customerName: transaction.customer_name,
      customerEmail: transaction.customer_email,
      customerPhone: transaction.customer_phone,
    });
  } else if (actionType === "REMINDER") {
    executionResult = { mode: "SIMULATED", success: true, note: "Reminder notification queued (email/SMS simulated)." };
  } else {
    executionResult = { mode: "N/A", success: false, note: `No executable primitive for action type ${actionType}.` };
  }

  await db.insert("recovery_actions", { ...action, idempotency_key: idempotencyKey, result: JSON.stringify(executionResult) });
  await audit(recoveryCase.case_id, "AI_AGENT", "RECOVERY_ACTION_EXECUTED",
    `Executed ${actionType} via Razorpay (${executionResult.mode})`, executionResult.success !== false ? "OK" : "FAILED",
    executionResult);

  await db.update("recovery_cases", (c) => c.case_id === recoveryCase.case_id, {
    attempt_count: attemptNumber,
  });

  // ---- VERIFY ----
  const verification = await determineVerification(actionType, executionResult, {
    transactionId: transaction.transaction_id,
    recoveryProbability: recovery_probability,
  });

  await audit(recoveryCase.case_id, "SYSTEM", "PAYMENT_VERIFICATION",
    verification.paid ? "Payment confirmed successful" : "Payment not yet successful",
    verification.paid ? "SUCCESS" : "PENDING", verification);

  const verificationRecord = {
    verification_id: nanoid(10),
    case_id: recoveryCase.case_id,
    transaction_id: transaction.transaction_id,
    amount: transaction.amount,
    status: verification.paid ? "VERIFICATION_SUCCESS" : "VERIFICATION_FAILED",
    provider: verification.mode && verification.mode.includes("TEST_MODE") ? "razorpay" : "simulation",
    execution_mode: verification.mode && verification.mode.includes("TEST_MODE") && !verification.mode.includes("ERROR") ? "LIVE_TEST_MODE" : "SIMULATION",
    verified_at: new Date().toISOString(),
    metadata: verification,
  };
  await db.insert("verification_records", verificationRecord);

  let finalStatus;
  if (verification.paid) {
    finalStatus = "RECOVERED";
    await audit(recoveryCase.case_id, "SYSTEM", "REVENUE_RECOVERED",
      `₹${transaction.amount} recovered via ${actionType}`, "SUCCESS", { verification_id: verificationRecord.verification_id });
    await audit(recoveryCase.case_id, "SYSTEM", "CASE_CLOSED", "Case closed - payment recovered", "CLOSED", {});
  } else {
    const nextAttempt = recoveryCase.attempt_count + 1;
    const policyConfig = await policyEngine.getPolicyConfig();
    if (nextAttempt >= policyConfig.MAX_AUTOMATED_RETRIES) {
      finalStatus = "ESCALATED";
      await audit(recoveryCase.case_id, "SYSTEM", "MAX_RETRIES_REACHED",
        "Retry limit reached without successful recovery", "STOPPED", {});
      await audit(recoveryCase.case_id, "SYSTEM", "CASE_ESCALATED", "Escalated to human review after retry exhaustion", "ESCALATED", {});
    } else {
      finalStatus = "OPEN";
      await audit(recoveryCase.case_id, "SYSTEM", "RETRY_SCHEDULED",
        "Payment not yet recovered; eligible for another attempt", "PENDING", {});
    }
  }

  await transitionCaseStatus(db, recoveryCase.case_id, finalStatus);

  return {
    case: await db.findOne("recovery_cases", (c) => c.case_id === recoveryCase.case_id),
    decision,
    executed: true,
    executionResult,
    verification,
    finalStatus,
  };
}

export async function getAuditTrail(caseId) {
  const events = await db.find("audit_logs", (a) => a.case_id === caseId);
  return events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}
