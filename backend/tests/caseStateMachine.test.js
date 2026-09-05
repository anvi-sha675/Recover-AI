import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidTransition, isTerminal } from "../services/caseStateMachine.js";

test("state machine: RECOVERED is terminal - no transition out is legal", () => {
  assert.equal(isValidTransition("RECOVERED", "STOPPED"), false);
  assert.equal(isValidTransition("RECOVERED", "OPEN"), false);
  assert.equal(isValidTransition("RECOVERED", "ESCALATED"), false);
  assert.equal(isValidTransition("RECOVERED", "RECOVERED"), true);
});

test("state machine: STOPPED is terminal - no transition out is legal", () => {
  assert.equal(isValidTransition("STOPPED", "OPEN"), false);
  assert.equal(isValidTransition("STOPPED", "RECOVERED"), false);
});

test("state machine: OPEN can legally move to any active or terminal state", () => {
  assert.equal(isValidTransition("OPEN", "AWAITING_APPROVAL"), true);
  assert.equal(isValidTransition("OPEN", "RECOVERED"), true);
  assert.equal(isValidTransition("OPEN", "ESCALATED"), true);
  assert.equal(isValidTransition("OPEN", "STOPPED"), true);
});

test("state machine: ESCALATED cannot silently return to OPEN", () => {
  assert.equal(isValidTransition("ESCALATED", "OPEN"), false);
  assert.equal(isValidTransition("ESCALATED", "STOPPED"), true);
});

test("isTerminal correctly identifies terminal states", () => {
  assert.equal(isTerminal("RECOVERED"), true);
  assert.equal(isTerminal("STOPPED"), true);
  assert.equal(isTerminal("OPEN"), false);
  assert.equal(isTerminal("ESCALATED"), false);
});
