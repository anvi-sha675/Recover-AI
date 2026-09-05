import { toPaise } from "../services/money.js";

export function makeCustomer({ customer_id, name, email, phone }) {
  return {
    customer_id,
    name,
    email,
    phone,
    purchase_history: [],
    successful_payments: 0,
    failed_payments: 0,
    last_activity: new Date().toISOString(),
    subscription_status: "none",
    created_at: new Date().toISOString(),
  };
}

export function makeTransaction({
  transaction_id, customer_id, amount, status, payment_method,
  failure_reason = null, checkout_started = true, checkout_completed = true,
  subscription_id = null,
}) {
  return {
    transaction_id,
    customer_id,
    amount,
    amount_paise: toPaise(amount),
    status, // 'success' | 'failed'
    payment_method,
    failure_reason,
    timestamp: new Date().toISOString(),
    checkout_started,
    checkout_completed,
    subscription_id,
  };
}

export function makeRecoveryCase({
  case_id, transaction_id, customer_id, amount, risk_score,
  recovery_probability, root_cause, recommended_action, policy_status,
}) {
  return {
    case_id,
    transaction_id,
    customer_id,
    amount,
    amount_paise: toPaise(amount),
    risk_score,
    recovery_probability,
    root_cause,
    recommended_action,
    policy_status, // 'ALLOWED' | 'BLOCKED' | 'REQUIRES_APPROVAL'
    current_status: "OPEN", // OPEN | AWAITING_APPROVAL | RECOVERED | ESCALATED | STOPPED | FAILED
    attempt_count: 0,
    scenario: "PAYMENT_FAILURE", // PAYMENT_FAILURE | CHECKOUT_ABANDONMENT | SUBSCRIPTION_FAILURE
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function makeRecoveryAction({
  action_id, case_id, action_type, reason, confidence, approved_by = null, idempotency_key = null,
}) {
  return {
    action_id,
    case_id,
    action_type,
    reason,
    confidence,
    approved_by,
    idempotency_key, // case_id:action_type:attempt_number - prevents duplicate financial actions
    executed_at: new Date().toISOString(),
    result: "PENDING", // PENDING | SUCCESS | FAILED | SIMULATED_SUCCESS | SIMULATED_FAILED
  };
}

export function makeAuditLog({ audit_id, case_id, actor, event, reason, result, metadata = {} }) {
  return {
    audit_id,
    case_id,
    timestamp: new Date().toISOString(),
    actor, // AI_AGENT | POLICY_ENGINE | HUMAN_REVIEWER | SYSTEM | CUSTOMER
    event,
    reason,
    result,
    metadata,
  };
}
