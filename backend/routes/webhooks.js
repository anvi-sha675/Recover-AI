import express from "express";
import crypto from "crypto";
import { nanoid } from "nanoid";
import db from "../db/index.js";
import { transitionCaseStatus } from "../services/caseStateMachine.js";
import { toPaise } from "../services/money.js";

const router = express.Router();

export function computeSignature(rawBody, secret) {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

async function findCaseIdForPaymentLink(paymentLinkId) {
  const actions = await db.all("recovery_actions");
  for (const action of actions) {
    try {
      const result = typeof action.result === "string" ? JSON.parse(action.result) : action.result;
      if (result?.payment_link_id === paymentLinkId) return action.case_id;
    } catch {
      // result wasn't JSON - skip
    }
  }
  return null;
}

async function handleVerifiedPaymentEvent({ paymentLinkId, amount, providerEventId }) {
  const caseId = await findCaseIdForPaymentLink(paymentLinkId);
  if (!caseId) {
    return { matched: false, reason: `No recovery case found for payment_link_id ${paymentLinkId}` };
  }

  const caseRecord = await db.findOne("recovery_cases", (c) => c.case_id === caseId);
  if (!caseRecord) return { matched: false, reason: `Case ${caseId} no longer exists` };

  const verificationRecord = {
    verification_id: nanoid(10),
    case_id: caseId,
    transaction_id: caseRecord.transaction_id,
    amount: amount,
    amount_paise: toPaise(amount),
    status: "VERIFICATION_SUCCESS",
    provider: "razorpay",
    provider_reference: paymentLinkId,
    execution_mode: "LIVE_TEST_MODE_WEBHOOK",
    verified_at: new Date().toISOString(),
    evidence: `Confirmed via verified Razorpay webhook event ${providerEventId}`,
    metadata: { provider_event_id: providerEventId },
  };
  await db.insert("verification_records", verificationRecord);

  if (caseRecord.current_status === "RECOVERED") {
    return { matched: true, alreadyRecovered: true, case_id: caseId, verification_id: verificationRecord.verification_id };
  }

  try {
    await transitionCaseStatus(db, caseId, "RECOVERED", {
      patch: {},
    });
    await db.insert("audit_logs", {
      audit_id: nanoid(10), case_id: caseId, timestamp: new Date().toISOString(),
      actor: "SYSTEM", event: "WEBHOOK_VERIFIED_RECOVERY",
      reason: `Verified via Razorpay webhook (event ${providerEventId})`, result: "SUCCESS",
      metadata: { provider_event_id: providerEventId, verification_id: verificationRecord.verification_id },
    });
    return { matched: true, transitioned: true, case_id: caseId, verification_id: verificationRecord.verification_id };
  } catch (err) {
    return { matched: true, transitioned: false, reason: err.message, case_id: caseId, verification_id: verificationRecord.verification_id };
  }
}

router.post("/razorpay", async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(501).json({
      error: "RAZORPAY_WEBHOOK_SECRET is not configured. This endpoint refuses to accept unverifiable webhooks rather than silently trusting them.",
    });
  }

  const signature = req.header("x-razorpay-signature");
  if (!signature) {
    await logWebhookEvent({ signatureVerified: false, status: "REJECTED_MISSING_SIGNATURE" });
    return res.status(400).json({ error: "Missing X-Razorpay-Signature header." });
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    return res.status(400).json({ error: "Malformed request body." });
  }

  const expected = computeSignature(rawBody, secret);
  const signatureValid = timingSafeEqualHex(expected, signature);

  if (!signatureValid) {
    await logWebhookEvent({ signatureVerified: false, status: "REJECTED_INVALID_SIGNATURE" });
    return res.status(400).json({ error: "Invalid webhook signature." });
  }

  const eventId = req.body?.id || req.header("x-razorpay-event-id");
  if (!eventId) {
    await logWebhookEvent({ signatureVerified: true, status: "REJECTED_MISSING_EVENT_ID" });
    return res.status(400).json({ error: "Malformed payload: missing event id." });
  }

  const existing = await db.findOne("audit_logs", (a) => a.metadata?.provider_event_id === eventId && a.event === "WEBHOOK_PROCESSED");
  if (existing) {
    return res.status(200).json({ status: "ALREADY_PROCESSED", provider_event_id: eventId });
  }

  await logWebhookEvent({
    signatureVerified: true,
    status: "PROCESSED",
    eventId,
    eventType: req.body?.event || "unknown",
  });

  let recoveryResult = null;
  if (req.body?.event === "payment_link.paid") {
    const entity = req.body?.payload?.payment_link?.entity;
    if (entity?.id) {
      recoveryResult = await handleVerifiedPaymentEvent({
        paymentLinkId: entity.id,
        amount: (entity.amount_paid ?? entity.amount ?? 0) / 100, // Razorpay sends paise
        providerEventId: eventId,
      });
    }
  }

  res.status(200).json({ status: "PROCESSED", provider_event_id: eventId, recovery_result: recoveryResult });
});

function timingSafeEqualHex(a, b) {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function logWebhookEvent({ signatureVerified, status, eventId, eventType }) {
  await db.insert("audit_logs", {
    audit_id: nanoid(10),
    case_id: "WEBHOOK",
    timestamp: new Date().toISOString(),
    actor: "SYSTEM",
    event: status === "PROCESSED" ? "WEBHOOK_PROCESSED" : "WEBHOOK_REJECTED",
    reason: status,
    result: signatureVerified ? "OK" : "REJECTED",
    metadata: { provider_event_id: eventId, event_type: eventType, signature_verified: signatureVerified, received_at: new Date().toISOString() },
  });
}

export default router;
