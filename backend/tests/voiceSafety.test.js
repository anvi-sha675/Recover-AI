import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import db from "../db/index.js";
import { makeRecoveryCase } from "../models/schemas.js";
import voiceRoutes from "../routes/voice.js";
import recoveryRoutes from "../routes/recovery.js";

let server;
let baseUrl;

before(async () => {
  await db.reset();
  const app = express();
  app.use(express.json());
  app.use("/api/voice", voiceRoutes);
  app.use("/api/recovery", recoveryRoutes);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(() => server.close());

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function insertCase(caseId, status) {
  const recoveryCase = makeRecoveryCase({
    case_id: caseId,
    transaction_id: `${caseId}_transaction`,
    customer_id: `${caseId}_customer`,
    amount: 1000,
    risk_score: 0.1,
    recovery_probability: 0.9,
    root_cause: "TEMPORARY_PAYMENT_FAILURE",
    recommended_action: "PAYMENT_RETRY",
    policy_status: "ALLOWED",
  });
  recoveryCase.current_status = status;
  await db.insert("recovery_cases", recoveryCase);
  return recoveryCase;
}

test("voice STOP intent cannot mutate a RECOVERED case", async () => {
  const recoveryCase = await insertCase("voice_recovered_stop_guard", "RECOVERED");
  const result = await post("/api/voice/recovery", {
    transcript: "Please dobara mat call karo",
    case_id: recoveryCase.case_id,
  });

  assert.equal(result.status, 409);
  const stored = await db.findOne("recovery_cases", (item) => item.case_id === recoveryCase.case_id);
  assert.equal(stored.current_status, "RECOVERED");
});

test("voice ESCALATE intent cannot mutate a STOPPED case", async () => {
  const recoveryCase = await insertCase("voice_stopped_escalate_guard", "STOPPED");
  const result = await post("/api/voice/recovery", {
    transcript: "Mujhe support se baat karni hai",
    case_id: recoveryCase.case_id,
  });

  assert.equal(result.status, 409);
  const stored = await db.findOne("recovery_cases", (item) => item.case_id === recoveryCase.case_id);
  assert.equal(stored.current_status, "STOPPED");
});

test("reject requires a pending approval and leaves the case unchanged otherwise", async () => {
  const recoveryCase = await insertCase("reject_pending_guard", "AWAITING_APPROVAL");
  const result = await post(`/api/recovery/cases/${recoveryCase.case_id}/reject`, {});

  assert.equal(result.status, 409);
  const stored = await db.findOne("recovery_cases", (item) => item.case_id === recoveryCase.case_id);
  assert.equal(stored.current_status, "AWAITING_APPROVAL");
});
