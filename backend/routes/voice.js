import express from "express";
import { classifyIntent, SUPPORTED_INTENTS } from "../services/voiceIntent.js";
import * as orchestrator from "../services/orchestrator.js";
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

  if (intent === "DO_NOT_CONTACT" || intent === "NOT_NOW") {
    if (case_id) {
      await db.update("recovery_cases", (c) => c.case_id === case_id, { current_status: "STOPPED" });
    }
    return res.json({
      ...base,
      policy: "STOP - customer declined further contact. No further automated recovery attempts will be made for this case.",
      action_taken: "STOPPED",
    });
  }

  if (intent === "ALREADY_PAID") {
    if (case_id) {
      await db.update("recovery_cases", (c) => c.case_id === case_id, { current_status: "STOPPED" });
    }
    return res.json({
      ...base,
      policy: "STOP - customer reports payment already completed. Routed for manual reconciliation rather than an automated re-charge.",
      action_taken: "STOPPED_FOR_RECONCILIATION",
    });
  }

  if (intent === "TALK_TO_SUPPORT") {
    if (case_id) {
      await db.update("recovery_cases", (c) => c.case_id === case_id, { current_status: "ESCALATED" });
    }
    return res.json({ ...base, policy: "ESCALATE - routed to a human agent.", action_taken: "ESCALATED" });
  }

  let transaction;
  if (case_id) {
    const c = await db.findOne("recovery_cases", (x) => x.case_id === case_id);
    if (!c) return res.status(404).json({ error: "case_id not found" });
    transaction = c.source_features || {
      transaction_id: c.transaction_id, amount: c.amount, customer_id: c.customer_id,
      failure_reason: c.root_cause, previous_attempts: c.attempt_count,
    };
  } else {
    return res.status(400).json({ error: "case_id is required to execute a recovery action from voice intent" });
  }
  
  const result = await orchestrator.runRecovery(transaction, { existingCaseId: case_id });

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
