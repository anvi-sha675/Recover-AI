import express from "express";
import { nanoid } from "nanoid";
import { classifyIntent, SUPPORTED_INTENTS } from "../services/voiceIntent.js";
import * as orchestrator from "../services/orchestrator.js";
import { transitionCaseStatus } from "../services/caseStateMachine.js";
import db from "../db/index.js";

const router = express.Router();

router.post("/recovery", async (req, res) => {
  const { transcript, case_id } = req.body;
  if (!transcript) {
    return res.status(400).json({ error: "transcript is required (text standing in for a real speech-to-text output)" });
  }

  const { intent, confidence, matched_phrase } = classifyIntent(transcript);

  const base = {
    mode: "TEXT_SIMULATED_VOICE",
    note: "No live speech-to-text is configured in this build; this transcript was provided as text. Intent classification and policy gating below are real.",
    transcript,
    intent,
    intent_confidence: confidence,
    matched_phrase,
  };

  if (case_id && !(await db.findOne("recovery_cases", (c) => c.case_id === case_id))) {
    return res.status(404).json({ error: "case_id not found" });
  }

  if (intent === "DO_NOT_CONTACT" || intent === "NOT_NOW") {
    if (case_id) {
      if (!(await transitionVoiceCase(res, case_id, "STOPPED"))) return;
      await logVoiceState(case_id, "CASE_STOPPED", "Customer declined further contact.", req.requestId);
    }
    return res.json({
      ...base,
      policy: "STOP - customer declined further contact. No further automated recovery attempts will be made for this case.",
      action_taken: "STOPPED",
    });
  }

  if (intent === "ALREADY_PAID") {
    if (case_id) {
      if (!(await transitionVoiceCase(res, case_id, "STOPPED"))) return;
      await logVoiceState(case_id, "CASE_STOPPED", "Customer reported payment already completed; manual reconciliation required.", req.requestId);
    }
    return res.json({
      ...base,
      policy: "STOP - customer reports payment already completed. Routed for manual reconciliation rather than an automated re-charge.",
      action_taken: "STOPPED_FOR_RECONCILIATION",
    });
  }

  if (intent === "TALK_TO_SUPPORT") {
    if (case_id) {
      if (!(await transitionVoiceCase(res, case_id, "ESCALATED"))) return;
      await logVoiceState(case_id, "CASE_ESCALATED", "Customer requested human support.", req.requestId);
    }
    return res.json({ ...base, policy: "ESCALATE - routed to a human agent.", action_taken: "ESCALATED" });
  }

  let transaction;
  if (case_id) {
    const c = await db.findOne("recovery_cases", (x) => x.case_id === case_id);
    if (!c) return res.status(404).json({ error: "case_id not found" });
    const storedTxn = await db.findOne("transactions", (x) => x.transaction_id === c.transaction_id);
    transaction = storedTxn || c.source_features || {
      transaction_id: c.transaction_id, amount: c.amount, customer_id: c.customer_id,
      failure_reason: c.root_cause, previous_attempts: c.attempt_count,
    };
  } else {
    return res.status(400).json({ error: "case_id is required to execute a recovery action from voice intent" });
  }
  
  const result = await orchestrator.runRecovery(transaction, { existingCaseId: case_id, requestId: req.requestId });

  res.json({
    ...base,
    policy: "Intent acknowledged. Routed through the standard diagnosis + policy-gated workflow (voice does not bypass guardrails).",
    orchestrator_result: result,
  });
});

router.get("/intents", (req, res) => {
  res.json({ supported_intents: SUPPORTED_INTENTS, mode: "TEXT_SIMULATED_VOICE" });
});

export default router;

async function logVoiceState(caseId, event, reason, requestId) {
  await db.insert("audit_logs", {
    audit_id: nanoid(10),
    case_id: caseId,
    timestamp: new Date().toISOString(),
    actor: "CUSTOMER",
    event,
    reason,
    result: event === "CASE_ESCALATED" ? "ESCALATED" : "STOPPED",
    metadata: { channel: "TEXT_SIMULATED_VOICE", request_id: requestId },
  });
}

async function transitionVoiceCase(res, caseId, targetStatus) {
  try {
    await transitionCaseStatus(db, caseId, targetStatus);
    return true;
  } catch {
    res.status(409).json({ error: `Voice safety transition to ${targetStatus} was rejected by the case state machine.` });
    return false;
  }
}
