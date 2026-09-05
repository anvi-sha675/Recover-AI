import db from "../db/index.js";

export const DEFAULT_POLICY = {
  MAX_AUTOMATED_RETRIES: 3,
  MAX_AUTOMATED_RECOVERY_AMOUNT: 10000,
  MIN_RECOVERY_CONFIDENCE: 0.70,
  MAX_INTERVENTIONS_PER_CUSTOMER: 3,
  STOP_AFTER_SUCCESS: true,
  ESCALATE_AFTER_MAX_ATTEMPTS: true,
  HIGH_VALUE_TRANSACTION_REQUIRES_APPROVAL: true,
};

export async function setConfig(patch) {
  const existing = await db.findOne("policy_config", () => true);
  if (existing) {
    return db.update("policy_config", () => true, patch);
  }
  return db.insert("policy_config", { ...DEFAULT_POLICY, ...patch });
}

export async function getPolicyConfig() {
  const stored = await db.findOne("policy_config", () => true);
  return stored ? { ...DEFAULT_POLICY, ...stored } : DEFAULT_POLICY;
}

export function evaluate(policy, {
  amount,
  recoveryProbability,
  recommendedAction,
  attemptCount,
  interventionsForCustomer,
  lastOutcomeWasSuccess,
}) {
  policy = policy || DEFAULT_POLICY;

  if (lastOutcomeWasSuccess && policy.STOP_AFTER_SUCCESS) {
    return {
      allowed: false,
      requiresApproval: false,
      stop: true,
      escalate: false,
      reason: "STOPPED: payment already recovered successfully (STOP_AFTER_SUCCESS).",
      policyTriggered: "STOP_AFTER_SUCCESS",
    };
  }

  if (recommendedAction === "STOP") {
    return {
      allowed: false,
      requiresApproval: false,
      stop: true,
      escalate: false,
      reason: "AI recommended STOP for this case.",
      policyTriggered: "AI_STOP",
    };
  }

  if (attemptCount >= policy.MAX_AUTOMATED_RETRIES) {
    return {
      allowed: false,
      requiresApproval: false,
      stop: true,
      escalate: policy.ESCALATE_AFTER_MAX_ATTEMPTS,
      reason: `BLOCKED: attempt_count (${attemptCount}) reached MAX_AUTOMATED_RETRIES (${policy.MAX_AUTOMATED_RETRIES}).`,
      policyTriggered: "MAX_AUTOMATED_RETRIES",
    };
  }

  if (interventionsForCustomer >= policy.MAX_INTERVENTIONS_PER_CUSTOMER) {
    return {
      allowed: false,
      requiresApproval: false,
      stop: true,
      escalate: true,
      reason: `BLOCKED: customer has reached MAX_INTERVENTIONS_PER_CUSTOMER (${policy.MAX_INTERVENTIONS_PER_CUSTOMER}).`,
      policyTriggered: "MAX_INTERVENTIONS_PER_CUSTOMER",
    };
  }

  if (recoveryProbability < policy.MIN_RECOVERY_CONFIDENCE) {
    return {
      allowed: false,
      requiresApproval: true,
      stop: false,
      escalate: true,
      reason: `BLOCKED: recovery_probability (${recoveryProbability}) is below MIN_RECOVERY_CONFIDENCE (${policy.MIN_RECOVERY_CONFIDENCE}). Recommended next step: human review.`,
      policyTriggered: "MIN_RECOVERY_CONFIDENCE",
    };
  }

  if (amount > policy.MAX_AUTOMATED_RECOVERY_AMOUNT && policy.HIGH_VALUE_TRANSACTION_REQUIRES_APPROVAL) {
    return {
      allowed: false,
      requiresApproval: true,
      stop: false,
      escalate: false,
      reason: `HUMAN APPROVAL REQUIRED: amount (₹${amount}) exceeds MAX_AUTOMATED_RECOVERY_AMOUNT (₹${policy.MAX_AUTOMATED_RECOVERY_AMOUNT}).`,
      policyTriggered: "HIGH_VALUE_TRANSACTION_REQUIRES_APPROVAL",
    };
  }

  return {
    allowed: true,
    requiresApproval: false,
    stop: false,
    escalate: false,
    reason: "ALLOWED: within all automated policy bounds.",
    policyTriggered: null,
  };
}
