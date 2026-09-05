const INTENTS = [
  "RETRY_PAYMENT",
  "SEND_PAYMENT_LINK",
  "NOT_NOW",
  "ALREADY_PAID",
  "DO_NOT_CONTACT",
  "TALK_TO_SUPPORT",
];

const PATTERNS = [
  { intent: "DO_NOT_CONTACT", keywords: ["do not call", "don't call", "stop calling", "mat karo", "dobara mat", "band karo", "unsubscribe", "harass"] },
  { intent: "ALREADY_PAID", keywords: ["already paid", "paisa de diya", "payment kar diya", "maine pay kar diya", "already paid hai", "paid ho gaya"] },
  { intent: "TALK_TO_SUPPORT", keywords: ["support se baat", "talk to support", "customer care", "agent se baat", "manager se baat", "human se baat"] },
  { intent: "SEND_PAYMENT_LINK", keywords: ["payment link", "link bhejo", "link bhej do", "send link", "link do"] },
  { intent: "RETRY_PAYMENT", keywords: ["dobara payment", "retry", "phir se try", "fail ho gaya", "dobara try karo", "payment karna hai", "try again"] },
  { intent: "NOT_NOW", keywords: ["not now", "abhi nahi", "baad me", "later", "kal karunga", "busy hoon"] },
];

export function classifyIntent(transcript) {
  const text = (transcript || "").toLowerCase();
  for (const { intent, keywords } of PATTERNS) {
    const matched = keywords.find((k) => text.includes(k));
    if (matched) {
      return { intent, confidence: 0.9, matched_phrase: matched };
    }
  }
  return { intent: "TALK_TO_SUPPORT", confidence: 0.3, matched_phrase: null };
}

export const SUPPORTED_INTENTS = INTENTS;
