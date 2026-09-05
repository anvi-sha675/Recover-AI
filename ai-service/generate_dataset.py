import os

import numpy as np
import pandas as pd

SEED = 42
rng = np.random.default_rng(SEED)

N = 12000  # >10,000 as required; split will leave >=10k after held-out carve
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
os.makedirs(OUT_DIR, exist_ok=True)

FAILURE_REASONS = [
    "TEMPORARY_PAYMENT_FAILURE",
    "INSUFFICIENT_FUNDS",
    "PAYMENT_METHOD_ISSUE",
    "REPEATED_PAYMENT_FAILURE",
    "CHECKOUT_ABANDONMENT",
    "SUBSCRIPTION_FAILURE",
    "OVERDUE_RECEIVABLE",
    "UNKNOWN",
]
# realistic (imbalanced) distribution of failure reasons among non-success events
FAILURE_REASON_PROBS = [0.22, 0.18, 0.14, 0.10, 0.16, 0.10, 0.06, 0.04]

PAYMENT_METHODS = ["card", "upi", "netbanking", "wallet", "emi"]
PAYMENT_METHOD_PROBS = [0.42, 0.34, 0.12, 0.08, 0.04]

SUBSCRIPTION_STATUSES = ["none", "active", "past_due", "cancelled"]


def sample_amount(n):
    base = rng.lognormal(mean=7.2, sigma=1.1, size=n)  # centered around a few thousand INR
    return np.clip(base, 49, 250000).round(2)


def build():
    n = N
    amount = sample_amount(n)

    payment_method = rng.choice(PAYMENT_METHODS, size=n, p=PAYMENT_METHOD_PROBS)

    is_success = rng.random(n) < 0.68

    failure_reason = np.array(["NONE"] * n, dtype=object)
    fr_idx = rng.choice(len(FAILURE_REASONS), size=n, p=FAILURE_REASON_PROBS)
    failure_reason[~is_success] = np.array(FAILURE_REASONS)[fr_idx[~is_success]]

    previous_attempts = rng.poisson(1.1, size=n)
    previous_successes = rng.poisson(3.5, size=n)
    previous_successes = np.where(is_success, previous_successes + 1, previous_successes)

    customer_activity_days = rng.exponential(scale=12, size=n).round(1)  # days since last activity
    time_since_failure_hours = np.where(
        is_success, 0, rng.exponential(scale=30, size=n).round(1)
    )

    checkout_started = np.ones(n, dtype=bool)
    checkout_completed = is_success.copy()
    abandonment_mask = failure_reason == "CHECKOUT_ABANDONMENT"
    checkout_completed[abandonment_mask] = False

    subscription_status = rng.choice(
        SUBSCRIPTION_STATUSES, size=n, p=[0.55, 0.25, 0.14, 0.06]
    )
    subscription_status[failure_reason == "SUBSCRIPTION_FAILURE"] = "past_due"

    days_overdue = np.where(
        failure_reason == "OVERDUE_RECEIVABLE",
        rng.integers(1, 90, size=n),
        0,
    )

    checkout_duration_sec = np.clip(rng.normal(140, 60, size=n), 10, 900).round(0)

    z = (
        -0.00002 * amount
        + 0.35 * (previous_successes)
        - 0.25 * (previous_attempts)
        - 0.015 * customer_activity_days
        - 0.01 * time_since_failure_hours
        + np.where(failure_reason == "TEMPORARY_PAYMENT_FAILURE", 1.4, 0)
        + np.where(failure_reason == "INSUFFICIENT_FUNDS", 0.2, 0)
        + np.where(failure_reason == "PAYMENT_METHOD_ISSUE", 0.5, 0)
        + np.where(failure_reason == "REPEATED_PAYMENT_FAILURE", -1.1, 0)
        + np.where(failure_reason == "CHECKOUT_ABANDONMENT", 0.6, 0)
        + np.where(failure_reason == "SUBSCRIPTION_FAILURE", -0.2, 0)
        + np.where(failure_reason == "OVERDUE_RECEIVABLE", -0.8, 0)
        + np.where(failure_reason == "UNKNOWN", -0.6, 0)
        + rng.normal(0, 1.0, size=n)  # noise -> realistic imperfection
    )
    prob_recoverable = 1 / (1 + np.exp(-z))
    # only meaningful for non-successful events; successes are trivially "already recovered"
    is_recoverable = (rng.random(n) < prob_recoverable) & (~is_success)

    payment_status = np.where(is_success, "success", "failed")

    df = pd.DataFrame(
        {
            "transaction_id": [f"txn_{i:06d}" for i in range(n)],
            "customer_id": [f"cust_{rng.integers(0, 4000):05d}" for _ in range(n)],
            "amount": amount,
            "payment_status": payment_status,
            "failure_reason": failure_reason,
            "payment_method": payment_method,
            "previous_attempts": previous_attempts,
            "previous_successes": previous_successes,
            "customer_activity_days": customer_activity_days,
            "time_since_failure_hours": time_since_failure_hours,
            "checkout_started": checkout_started,
            "checkout_completed": checkout_completed,
            "checkout_duration_sec": checkout_duration_sec,
            "subscription_status": subscription_status,
            "days_overdue": days_overdue,
            "is_recoverable": is_recoverable.astype(int),
        }
    )

    # timestamps over the last 90 days
    start = pd.Timestamp("2026-06-01")
    offsets = rng.integers(0, 90 * 24 * 3600, size=n)
    df["timestamp"] = start + pd.to_timedelta(offsets, unit="s")
    df = df.sort_values("timestamp").reset_index(drop=True)

    return df


def split_and_save(df):
    at_risk = df[df.payment_status != "success"].reset_index(drop=True)

    n = len(at_risk)
    idx = rng.permutation(n)
    train_end = int(n * 0.7)
    val_end = int(n * 0.85)

    train = at_risk.iloc[idx[:train_end]]
    val = at_risk.iloc[idx[train_end:val_end]]
    test = at_risk.iloc[idx[val_end:]]

    df.to_csv(os.path.join(OUT_DIR, "revenue_events.csv"), index=False)
    train.to_csv(os.path.join(OUT_DIR, "train.csv"), index=False)
    val.to_csv(os.path.join(OUT_DIR, "val.csv"), index=False)
    test.to_csv(os.path.join(OUT_DIR, "test.csv"), index=False)

    print(f"Total events: {len(df)}")
    print(f"At-risk (non-success) events: {n}")
    print(f"  train={len(train)} val={len(val)} test={len(test)}")
    print(f"Class balance (is_recoverable=1): {at_risk.is_recoverable.mean():.3f}")


if __name__ == "__main__":
    dataset = build()
    split_and_save(dataset)
