import { test } from "node:test";
import assert from "node:assert/strict";
import * as policyEngine from "../services/policyEngine.js";
const DEFAULT = policyEngine.DEFAULT_POLICY;

test("MAX_AUTOMATED_RETRIES: a 4th automated retry must NEVER be allowed", () => {
  const decision = policyEngine.evaluate(DEFAULT, {
    amount: 1000,
    recoveryProbability: 0.9,
    recommendedAction: "PAYMENT_RETRY",
    attemptCount: 3, // already attempted 3 times
    interventionsForCustomer: 0,
    lastOutcomeWasSuccess: false,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.stop, true);
  assert.equal(decision.policyTriggered, "MAX_AUTOMATED_RETRIES");
});

test("3rd attempt (attemptCount=2) is still allowed", () => {
  const decision = policyEngine.evaluate(DEFAULT, {
    amount: 1000,
    recoveryProbability: 0.9,
    recommendedAction: "PAYMENT_RETRY",
    attemptCount: 2,
    interventionsForCustomer: 0,
    lastOutcomeWasSuccess: false,
  });
  assert.equal(decision.allowed, true);
});

test("STOP_AFTER_SUCCESS: no further action once already recovered", () => {
  const decision = policyEngine.evaluate(DEFAULT, {
    amount: 500,
    recoveryProbability: 0.9,
    recommendedAction: "PAYMENT_RETRY",
    attemptCount: 0,
    interventionsForCustomer: 0,
    lastOutcomeWasSuccess: true,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.stop, true);
  assert.equal(decision.policyTriggered, "STOP_AFTER_SUCCESS");
});

test("HIGH_VALUE_TRANSACTION_REQUIRES_APPROVAL: amount above limit requires approval, not auto-execution", () => {
  const decision = policyEngine.evaluate(DEFAULT, {
    amount: 35000,
    recoveryProbability: 0.9,
    recommendedAction: "PAYMENT_LINK",
    attemptCount: 0,
    interventionsForCustomer: 0,
    lastOutcomeWasSuccess: false,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.requiresApproval, true);
  assert.equal(decision.policyTriggered, "HIGH_VALUE_TRANSACTION_REQUIRES_APPROVAL");
});

test("MIN_RECOVERY_CONFIDENCE: low-confidence recommendation is blocked and escalated", () => {
  const decision = policyEngine.evaluate(DEFAULT, {
    amount: 500,
    recoveryProbability: 0.4,
    recommendedAction: "PAYMENT_LINK",
    attemptCount: 0,
    interventionsForCustomer: 0,
    lastOutcomeWasSuccess: false,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.escalate, true);
  assert.equal(decision.policyTriggered, "MIN_RECOVERY_CONFIDENCE");
});

test("MAX_INTERVENTIONS_PER_CUSTOMER: blocked once customer intervention cap is reached", () => {
  const decision = policyEngine.evaluate(DEFAULT, {
    amount: 500,
    recoveryProbability: 0.9,
    recommendedAction: "PAYMENT_LINK",
    attemptCount: 0,
    interventionsForCustomer: 3,
    lastOutcomeWasSuccess: false,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.escalate, true);
  assert.equal(decision.policyTriggered, "MAX_INTERVENTIONS_PER_CUSTOMER");
});

test("AI-recommended STOP is always respected", () => {
  const decision = policyEngine.evaluate(DEFAULT, {
    amount: 500,
    recoveryProbability: 0.9,
    recommendedAction: "STOP",
    attemptCount: 0,
    interventionsForCustomer: 0,
    lastOutcomeWasSuccess: false,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.stop, true);
});

test("within all bounds -> allowed", () => {
  const decision = policyEngine.evaluate(DEFAULT, {
    amount: 2000,
    recoveryProbability: 0.85,
    recommendedAction: "PAYMENT_LINK",
    attemptCount: 0,
    interventionsForCustomer: 0,
    lastOutcomeWasSuccess: false,
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.policyTriggered, null);
});
