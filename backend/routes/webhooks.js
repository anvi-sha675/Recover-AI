import express from "express";
import crypto from "crypto";
import { nanoid } from "nanoid";
import db from "../db/index.js";

const router = express.Router();

export function computeSignature(rawBody, secret) {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
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

  res.status(200).json({ status: "PROCESSED", provider_event_id: eventId });
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
