from typing import Any

ACTIONS = [
    "PAYMENT_RETRY",
    "PAYMENT_LINK",
    "REMINDER",
    "SUBSCRIPTION_RETRY",
    "HUMAN_ESCALATION",
    "STOP",
]


def diagnose(event: dict[str, Any]) -> dict[str, Any]:
    reason = event.get("failure_reason", "UNKNOWN")
    prev_attempts = int(event.get("previous_attempts", 0))
    prev_successes = int(event.get("previous_successes", 0))
    activity_days = float(event.get("customer_activity_days", 999))
    subscription_status = event.get("subscription_status", "none")
    days_overdue = int(event.get("days_overdue", 0))
    amount = float(event.get("amount", 0))

    evidence: list[str] = []
    cause = reason if reason in {
        "TEMPORARY_PAYMENT_FAILURE", "INSUFFICIENT_FUNDS", "PAYMENT_METHOD_ISSUE",
        "REPEATED_PAYMENT_FAILURE", "CHECKOUT_ABANDONMENT", "SUBSCRIPTION_FAILURE",
        "OVERDUE_RECEIVABLE",
    } else "UNKNOWN"

    confidence = 0.55  # base
    action = "HUMAN_ESCALATION"

    if cause == "TEMPORARY_PAYMENT_FAILURE":
        evidence.append(f"Customer has {prev_successes} previous successful payment(s)")
        evidence.append("Failure classified as a one-off/temporary gateway issue")
        if activity_days <= 7:
            evidence.append(f"Customer was active {activity_days:.1f} day(s) ago")
        confidence = min(0.95, 0.65 + 0.05 * prev_successes - 0.05 * prev_attempts)
        action = "PAYMENT_RETRY" if prev_attempts < 3 else "HUMAN_ESCALATION"

    elif cause == "INSUFFICIENT_FUNDS":
        evidence.append("Failure reason reported as insufficient funds")
        evidence.append(f"Previous attempts on this transaction: {prev_attempts}")
        confidence = 0.6 if prev_attempts < 2 else 0.4
        action = "REMINDER" if prev_attempts < 2 else "HUMAN_ESCALATION"

    elif cause == "PAYMENT_METHOD_ISSUE":
        evidence.append("Payment method appears invalid, expired, or blocked")
        evidence.append(f"Customer has {prev_successes} prior successful payment(s) with other methods")
        confidence = 0.75
        action = "PAYMENT_LINK"

    elif cause == "REPEATED_PAYMENT_FAILURE":
        evidence.append(f"Transaction has already failed {prev_attempts} time(s)")
        evidence.append("Repeated failures reduce likelihood of a simple retry succeeding")
        confidence = max(0.2, 0.5 - 0.1 * prev_attempts)
        action = "HUMAN_ESCALATION" if prev_attempts >= 2 else "PAYMENT_LINK"

    elif cause == "CHECKOUT_ABANDONMENT":
        evidence.append("Checkout was started but not completed")
        evidence.append(f"Customer activity recency: {activity_days:.1f} day(s)")
        confidence = 0.8 if activity_days <= 3 else 0.5
        action = "PAYMENT_LINK" if activity_days <= 10 else "REMINDER"

    elif cause == "SUBSCRIPTION_FAILURE":
        evidence.append(f"Subscription status: {subscription_status}")
        evidence.append(f"Retry attempts so far: {prev_attempts}")
        confidence = max(0.3, 0.7 - 0.15 * prev_attempts)
        action = "SUBSCRIPTION_RETRY" if prev_attempts < 3 else "STOP"

    elif cause == "OVERDUE_RECEIVABLE":
        evidence.append(f"Payment overdue by {days_overdue} day(s)")
        confidence = max(0.25, 0.6 - 0.01 * days_overdue)
        action = "REMINDER" if days_overdue < 30 else "HUMAN_ESCALATION"

    else:
        evidence.append("Failure reason could not be confidently classified")
        confidence = 0.3
        action = "HUMAN_ESCALATION"

    if amount >= 10000:
        evidence.append(f"Amount (₹{amount:,.0f}) exceeds automated recovery limit")

    return {
        "cause": cause,
        "confidence": round(float(confidence), 2),
        "evidence": evidence,
        "recommended_action": action,
    }


def recovery_economics(amount: float, recovery_probability: float, action: str) -> dict[str, Any]:
    INTERVENTION_COST = {
        "PAYMENT_RETRY": 5,
        "SUBSCRIPTION_RETRY": 5,
        "PAYMENT_LINK": 15,
        "REMINDER": 2,
        "HUMAN_ESCALATION": 150,
        "STOP": 0,
    }
    cost = INTERVENTION_COST.get(action, 0)
    expected_recovery = round(amount * recovery_probability, 2)
    expected_net_recovery = round(expected_recovery - cost, 2)
    return {
        "amount_at_risk": round(amount, 2),
        "amount_at_risk_paise": round(amount * 100),
        "recovery_probability": recovery_probability,
        "gross_expected_recovery": expected_recovery,
        "gross_expected_recovery_paise": round(expected_recovery * 100),
        "intervention_cost": cost,
        "intervention_cost_paise": round(cost * 100),
        "action_cost_basis": "MODELED_ASSUMPTION - illustrative flat cost per intervention type, not measured operational cost",
        "net_expected_recovery": expected_net_recovery,
        "net_expected_recovery_paise": round(expected_net_recovery * 100),
        "expected_recovery": expected_recovery,
        "action_cost": cost,
        "expected_net_recovery": expected_net_recovery,
    }
