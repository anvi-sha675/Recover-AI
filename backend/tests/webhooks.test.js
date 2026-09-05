import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";

process.env.MONGODB_URI = "";
process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret_123";

const db = (await import("../db/index.js")).default;
const express = (await import("express")).default;
const webhookRoutes = (await import("../routes/webhooks.js")).default;

let server;
let baseUrl;

before(async () => {
  await db.reset();
  const app = express();
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
  app.use("/api/webhooks", webhookRoutes);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(() => {
  server.close();
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
});

function sign(bodyStr, secret) {
  return crypto.createHmac("sha256", secret).update(bodyStr).digest("hex");
}

async function postWebhook(bodyObj, { signature, skipSignature = false } = {}) {
  const bodyStr = JSON.stringify(bodyObj);
  const sig = signature !== undefined ? signature : sign(bodyStr, process.env.RAZORPAY_WEBHOOK_SECRET);
  const headers = { "Content-Type": "application/json" };
  if (!skipSignature) headers["x-razorpay-signature"] = sig;
  const res = await fetch(`${baseUrl}/api/webhooks/razorpay`, { method: "POST", headers, body: bodyStr });
  return { status: res.status, body: await res.json() };
}

test("webhook: accepts a correctly signed event (real HMAC-SHA256, computed the same way Razorpay does)", async () => {
  const { status, body } = await postWebhook({ id: "evt_test_1", event: "payment_link.paid" });
  assert.equal(status, 200);
  assert.equal(body.status, "PROCESSED");
  assert.equal(body.provider_event_id, "evt_test_1");
});

test("webhook: rejects a request with a wrong signature", async () => {
  const { status, body } = await postWebhook({ id: "evt_test_2", event: "payment_link.paid" }, { signature: "0".repeat(64) });
  assert.equal(status, 400);
  assert.match(body.error, /Invalid webhook signature/);
});

test("webhook: rejects a request with no signature header at all", async () => {
  const { status, body } = await postWebhook({ id: "evt_test_3", event: "payment_link.paid" }, { skipSignature: true });
  assert.equal(status, 400);
  assert.match(body.error, /Missing X-Razorpay-Signature/);
});

test("webhook: duplicate delivery of the SAME event id is processed exactly once (idempotent)", async () => {
  const eventBody = { id: "evt_test_duplicate", event: "payment_link.paid" };
  const first = await postWebhook(eventBody);
  assert.equal(first.body.status, "PROCESSED");

  const second = await postWebhook(eventBody);
  assert.equal(second.status, 200);
  assert.equal(second.body.status, "ALREADY_PROCESSED", "a duplicate event must never be reprocessed");

  const events = await db.find("audit_logs", (a) => a.metadata?.provider_event_id === "evt_test_duplicate" && a.event === "WEBHOOK_PROCESSED");
  assert.equal(events.length, 1);
});

test("webhook: without RAZORPAY_WEBHOOK_SECRET configured, honestly refuses rather than fake-verifying", async () => {
  const savedSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
  const { status, body } = await postWebhook({ id: "evt_test_unconfigured", event: "x" }, { signature: "irrelevant" });
  assert.equal(status, 501);
  assert.match(body.error, /not configured/);
  process.env.RAZORPAY_WEBHOOK_SECRET = savedSecret;
});
