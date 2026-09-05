export function diagnoseRuleBased(event) {
  const {
    failure_reason: reason = "UNKNOWN",
    previous_attempts: prevAttempts = 0,
    previous_successes: prevSuccesses = 0,
    customer_activity_days: activityDays = 999,
    subscription_status: subStatus = "none",
    days_overdue: daysOverdue = 0,
    amount = 0,
  } = event;

  const evidence = [];
  let cause = reason;
  let confidence = 0.55;
  let action = "HUMAN_ESCALATION";

  switch (reason) {
    case "TEMPORARY_PAYMENT_FAILURE":
      evidence.push(`Customer has ${prevSuccesses} previous successful payment(s)`);
      evidence.push("Failure classified as a one-off/temporary gateway issue");
      confidence = Math.min(0.95, 0.65 + 0.05 * prevSuccesses - 0.05 * prevAttempts);
      action = prevAttempts < 3 ? "PAYMENT_RETRY" : "HUMAN_ESCALATION";
      break;
    case "INSUFFICIENT_FUNDS":
      evidence.push("Failure reason reported as insufficient funds");
      confidence = prevAttempts < 2 ? 0.6 : 0.4;
      action = prevAttempts < 2 ? "REMINDER" : "HUMAN_ESCALATION";
      break;
    case "PAYMENT_METHOD_ISSUE":
      evidence.push("Payment method appears invalid, expired, or blocked");
      confidence = 0.75;
      action = "PAYMENT_LINK";
      break;
    case "REPEATED_PAYMENT_FAILURE":
      evidence.push(`Transaction has already failed ${prevAttempts} time(s)`);
      confidence = Math.max(0.2, 0.5 - 0.1 * prevAttempts);
      action = prevAttempts >= 2 ? "HUMAN_ESCALATION" : "PAYMENT_LINK";
      break;
    case "CHECKOUT_ABANDONMENT":
      evidence.push("Checkout was started but not completed");
      confidence = activityDays <= 3 ? 0.8 : 0.5;
      action = activityDays <= 10 ? "PAYMENT_LINK" : "REMINDER";
      break;
    case "SUBSCRIPTION_FAILURE":
      evidence.push(`Subscription status: ${subStatus}`);
      confidence = Math.max(0.3, 0.7 - 0.15 * prevAttempts);
      action = prevAttempts < 3 ? "SUBSCRIPTION_RETRY" : "STOP";
      break;
    case "OVERDUE_RECEIVABLE":
      evidence.push(`Payment overdue by ${daysOverdue} day(s)`);
      confidence = Math.max(0.25, 0.6 - 0.01 * daysOverdue);
      action = daysOverdue < 30 ? "REMINDER" : "HUMAN_ESCALATION";
      break;
    default:
      cause = "UNKNOWN";
      evidence.push("Failure reason could not be confidently classified");
      confidence = 0.3;
      action = "HUMAN_ESCALATION";
  }

  if (amount >= 10000) evidence.push(`Amount (₹${amount.toLocaleString()}) exceeds automated recovery limit`);

  return { cause, confidence: Math.round(confidence * 100) / 100, evidence, recommended_action: action };
}
