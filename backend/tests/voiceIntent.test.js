import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyIntent } from "../services/voiceIntent.js";

test("voice intent: recognizes DO_NOT_CONTACT in Hinglish", () => {
  const r = classifyIntent("Please dobara mat call karo, mujhe interest nahi hai");
  assert.equal(r.intent, "DO_NOT_CONTACT");
});

test("voice intent: recognizes ALREADY_PAID", () => {
  const r = classifyIntent("Maine already paid kar diya tha kal");
  assert.equal(r.intent, "ALREADY_PAID");
});

test("voice intent: recognizes RETRY_PAYMENT", () => {
  const r = classifyIntent("Mera payment fail ho gaya tha, dobara payment karna hai");
  assert.equal(r.intent, "RETRY_PAYMENT");
});

test("voice intent: recognizes SEND_PAYMENT_LINK", () => {
  const r = classifyIntent("ठीक है, mujhe payment link bhej do");
  assert.equal(r.intent, "SEND_PAYMENT_LINK");
});

test("voice intent: recognizes NOT_NOW", () => {
  const r = classifyIntent("Abhi nahi, baad me karunga");
  assert.equal(r.intent, "NOT_NOW");
});

test("voice intent: ambiguous input falls back to TALK_TO_SUPPORT with low confidence, never guesses a financial action", () => {
  const r = classifyIntent("hmm okay I guess maybe");
  assert.equal(r.intent, "TALK_TO_SUPPORT");
  assert.ok(r.confidence < 0.5);
});
