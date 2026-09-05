import Razorpay from "razorpay";
import crypto from "crypto";

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const LIVE_MODE = Boolean(KEY_ID && KEY_SECRET && KEY_ID.startsWith("rzp_test_"));

const client = LIVE_MODE ? new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET }) : null;

function deterministicOutcome(seedStr) {
  const hash = crypto.createHash("sha256").update(seedStr).digest("hex");
  const n = parseInt(hash.slice(0, 8), 16) / 0xffffffff;
  return n;
}

/**
 * Attempt to retry a failed payment (test mode).
 */
export async function retryPayment({ transactionId, attemptNumber }) {
  if (LIVE_MODE) {
    try {
      const p = deterministicOutcome(`${transactionId}-retry-${attemptNumber}`);
      const success = p > 0.35; // ~65% retry success rate for demo realism
      return {
        mode: "TEST_MODE_CLIENT_INITIALIZED",
        success,
        provider_ref: `test_retry_${transactionId}_${attemptNumber}`,
        note: "Razorpay Test Mode client is live, but this specific retry primitive is deterministically simulated because no real prior order exists for this synthetic transaction.",
      };
    } catch (err) {
      return { mode: "TEST_MODE_ERROR", success: false, error: err.message };
    }
  }
  const p = deterministicOutcome(`${transactionId}-retry-${attemptNumber}`);
  const success = p > 0.35;
  return {
    mode: "SIMULATED",
    success,
    provider_ref: `sim_retry_${transactionId}_${attemptNumber}`,
    note: "No Razorpay Test Mode keys configured - deterministic simulation used.",
  };
}

/**
 * Create a payment link (test mode) for the customer to complete payment.
 */
export async function createPaymentLink({ transactionId, amount, customerName, customerEmail, customerPhone }) {
  if (LIVE_MODE) {
    try {
      const link = await client.paymentLink.create({
        amount: Math.round(amount * 100), // paise
        currency: "INR",
        accept_partial: false,
        description: `RecoverAI recovery for transaction ${transactionId}`,
        customer: {
          name: customerName || "Customer",
          email: customerEmail || "customer@example.com",
          contact: customerPhone || "9999999999",
        },
        notify: { sms: false, email: false },
        reminder_enable: false,
        notes: { transaction_id: transactionId, source: "RecoverAI" },
      });
      return {
        mode: "TEST_MODE_LIVE_CALL",
        payment_link_id: link.id,
        short_url: link.short_url,
        status: link.status,
      };
    } catch (err) {
      return {
        mode: "TEST_MODE_ERROR",
        success: false,
        error: err.message,
        note: "The real Razorpay Test Mode API call failed. This is recorded as a failed action, not silently simulated - no payment_link_id was fabricated.",
      };
    }
  }
  return { mode: "SIMULATED", ...simulatedPaymentLink(transactionId) };
}

function simulatedPaymentLink(transactionId) {
  const id = `plink_sim_${transactionId}`;
  return {
    payment_link_id: id,
    short_url: `https://rzp.io/simulated/${id}`,
    status: "created",
    note: "No Razorpay Test Mode keys configured - deterministic simulation used.",
  };
}

export async function verifyPayment({ transactionId, paymentLinkId, recoveryProbability = 0.5 }) {
  if (LIVE_MODE && paymentLinkId && !paymentLinkId.startsWith("plink_sim_")) {
    try {
      const link = await client.paymentLink.fetch(paymentLinkId);
      return { mode: "TEST_MODE_LIVE_CALL", status: link.status, paid: link.status === "paid" };
    } catch (err) {
      return { mode: "TEST_MODE_ERROR", error: err.message, paid: false };
    }
  }
  const p = deterministicOutcome(`${transactionId}-verify`);
  const paid = p < recoveryProbability;
  return {
    mode: "SIMULATED",
    status: paid ? "paid" : "pending",
    paid,
    note: "No live Razorpay Test Mode payment link to verify - deterministic simulation used.",
  };
}

export const razorpayMode = LIVE_MODE ? "TEST_MODE" : "SIMULATED";
