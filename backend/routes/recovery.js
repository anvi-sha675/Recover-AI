import express from "express";
import { nanoid } from "nanoid";
import db from "../db/index.js";
import * as orchestrator from "../services/orchestrator.js";
import * as policyEngine from "../services/policyEngine.js";
import { makeTransaction } from "../models/schemas.js";
import { requireMinRole, validatePolicyPatch, validateExecuteBody, sensitiveActionLimiter } from "../services/authAndValidation.js";
import { transitionCaseStatus } from "../services/caseStateMachine.js";

const router = express.Router();

router.post("/analyze", async (req, res) => {
  const result = await orchestrator.analyze(req.body);
  res.json(result);
});

router.post("/decide", async (req, res) => {
  const analysis = await orchestrator.analyze(req.body);
  if (analysis.error) return res.status(503).json(analysis);
  const policy = await policyEngine.getPolicyConfig();
  const decision = policyEngine.evaluate(policy, {
    amount: req.body.amount,
    recoveryProbability: analysis.recovery_probability,
    recommendedAction: analysis.diagnosis.recommended_action,
    attemptCount: 0,
    interventionsForCustomer: 0,
    lastOutcomeWasSuccess: false,
  });
  res.json({ analysis, decision });
});

router.post("/execute", sensitiveActionLimiter, validateExecuteBody, async (req, res) => {
  const { transaction, humanApprovalGranted, existingCaseId } = req.body;
  const txn = {
    transaction_id: `txn_${nanoid(8)}`,
    status: "failed",
    ...transaction,
  };
  const existingTxn = await db.findOne("transactions", (t) => t.transaction_id === txn.transaction_id);
  if (!existingTxn) {
    await db.insert("transactions", makeTransaction({
      transaction_id: txn.transaction_id,
      customer_id: txn.customer_id,
      amount: txn.amount,
      status: txn.status,
      payment_method: txn.payment_method,
      failure_reason: txn.failure_reason,
      checkout_started: txn.checkout_started ?? true,
      checkout_completed: txn.checkout_completed ?? true,
      subscription_id: txn.subscription_id ?? null,
    }));
  }
  const result = await orchestrator.runRecovery(txn, { humanApprovalGranted, existingCaseId, requestId: req.requestId });
  if (result.error) return res.status(503).json(result);
  res.json(result);
});

router.get("/cases", async (req, res) => {
  let cases = await db.all("recovery_cases");
  const { status, root_cause, min_amount, q, sort } = req.query;
  if (status) cases = cases.filter((c) => c.current_status === status);
  if (root_cause) cases = cases.filter((c) => c.root_cause === root_cause);
  if (min_amount) cases = cases.filter((c) => c.amount >= Number(min_amount));
  if (q) {
    const needle = q.toLowerCase();
    cases = cases.filter((c) =>
      c.customer_id?.toLowerCase().includes(needle) ||
      c.transaction_id?.toLowerCase().includes(needle) ||
      c.case_id?.toLowerCase().includes(needle)
    );
  }
  if (sort === "expected_net_recovery") {
    cases = cases.sort((a, b) => (b.economics?.expected_net_recovery ?? -Infinity) - (a.economics?.expected_net_recovery ?? -Infinity));
  } else {
    cases = cases.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  res.json(cases);
});

router.get("/cases/:id", async (req, res) => {
  const c = await db.findOne("recovery_cases", (x) => x.case_id === req.params.id);
  if (!c) return res.status(404).json({ error: "Case not found" });
  const transaction = await db.findOne("transactions", (t) => t.transaction_id === c.transaction_id);
  const actions = await db.find("recovery_actions", (a) => a.case_id === c.case_id);
  res.json({ case: c, transaction, actions });
});

router.get("/cases/:id/audit", async (req, res) => {
  res.json(await orchestrator.getAuditTrail(req.params.id));
});

router.get("/activity/recent", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const events = await db.all("audit_logs");
  const withCaseInfo = await Promise.all(
    events
      .filter((e) => e.case_id !== "WEBHOOK")
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit)
      .map(async (e) => {
        const c = await db.findOne("recovery_cases", (rc) => rc.case_id === e.case_id);
        return { ...e, amount: c?.amount ?? null, customer_id: c?.customer_id ?? null };
      })
  );
  res.json(withCaseInfo);
});

router.post("/cases/:id/approve", sensitiveActionLimiter, requireMinRole("REVIEWER"), async (req, res) => {
  const c = await db.findOne("recovery_cases", (x) => x.case_id === req.params.id);
  if (!c) return res.status(404).json({ error: "Case not found" });
  const storedTxn = await db.findOne("transactions", (t) => t.transaction_id === c.transaction_id);
  const transaction = c.source_features || storedTxn || {
    transaction_id: c.transaction_id, amount: c.amount, customer_id: c.customer_id,
    failure_reason: c.root_cause, previous_attempts: c.attempt_count,
  };
  await db.update("approvals", (a) => a.case_id === c.case_id && a.status === "PENDING", { status: "APPROVED" });
  const result = await orchestrator.runRecovery(transaction, { humanApprovalGranted: true, existingCaseId: c.case_id, requestId: req.requestId });
  res.json(result);
});

router.post("/cases/:id/reject", sensitiveActionLimiter, requireMinRole("REVIEWER"), async (req, res) => {
  const c = await db.findOne("recovery_cases", (x) => x.case_id === req.params.id);
  if (!c) return res.status(404).json({ error: "Case not found" });
  const reason = req.body?.reason || "No reason provided by reviewer.";
  await db.update("approvals", (a) => a.case_id === c.case_id && a.status === "PENDING", { status: "REJECTED", reason });
  await transitionCaseStatus(db, c.case_id, "STOPPED");
  await db.insert("audit_logs", {
    audit_id: nanoid(10), case_id: c.case_id, timestamp: new Date().toISOString(),
    actor: "HUMAN_REVIEWER", event: "REJECTED", reason, result: "REJECTED", metadata: {},
  });
  res.json({ status: "REJECTED", reason });
});

router.get("/approvals", async (req, res) => {
  const pending = await db.find("approvals", (a) => a.status === "PENDING");
  const allCases = await db.all("recovery_cases");
  const enriched = pending.map((a) => ({
    ...a,
    case: allCases.find((c) => c.case_id === a.case_id),
  }));
  res.json(enriched);
});

router.get("/policy", async (req, res) => res.json(await policyEngine.getPolicyConfig()));
router.post("/policy", sensitiveActionLimiter, requireMinRole("ADMIN"), validatePolicyPatch, async (req, res) => res.json(await policyEngine.setConfig(req.body)));

export default router;
