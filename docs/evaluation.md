# Evaluation Methodology

This document explains exactly how every number shown on the dashboard and
in the README was produced. Nothing here is hardcoded.

## 1. Dataset

`ai-service/generate_dataset.py` generates 12,000 synthetic revenue events
with `numpy.random.default_rng(42)` (deterministic seed). ~3,868 of these
are non-successful ("at risk") events, which is what the recovery model is
trained and evaluated on.

The label (`is_recoverable`) is generated from a logistic combination of
amount, prior payment history, failure reason, and activity recency, **plus
Gaussian noise** — this is deliberate so the classification problem is not
trivially separable (per the build spec's "do not create a trivially
separable dataset" requirement).

Split: 70% train / 15% validation / 15% test, via a fixed random permutation
(same seed). The test set is used exactly once, at the end, by
`train_model.py`.

## 2. Model selection

Two candidates are trained on the same preprocessing pipeline
(`StandardScaler` for numeric features, `OneHotEncoder` for categorical
features): `LogisticRegression` and `RandomForestClassifier`.

Both are evaluated on the **validation** set. The simpler model
(Logistic Regression) is chosen unless Random Forest beats it by more than
0.03 F1 — this operationalizes the spec's "choose the simplest model that
performs well and is explainable" instruction. In the current run, Logistic
Regression was chosen.

## 3. Held-out test metrics

Reported in `ai-service/metrics.json` → `test_results`: precision, recall,
F1, ROC-AUC, and the confusion matrix, computed with scikit-learn's metric
functions directly on the test set predictions. These are never edited by
hand.

## 4. Business metrics (`business_metrics` in metrics.json) — FAIR SHARED-OUTCOME MODEL

**This section was rewritten.** Earlier versions of this evaluation used two
independent, opaque constants — "35% baseline efficiency" and "80% human
escalation efficiency" — each disclosed as `MODELED_ASSUMPTION` but still
not a fair, shared experiment (each strategy had its own private assumption).

The current methodology removes both constants entirely. Both strategies
are scored with the **identical rule**:

```
a case is recovered  <=>  it is genuinely recoverable (ground truth)
                          AND the action actually taken on it is capable
                          of addressing its failure reason
```

The only thing that differs between strategies is **which action each one
takes** — not an independent random success/failure draw per strategy.

- **Baseline** always takes the same fixed action (`PAYMENT_RETRY`) on
  every eligible case, regardless of why it failed — this is what a
  blind-retry system genuinely does, and it's genuinely bad for most
  failure categories (a retry does nothing for someone who abandoned
  checkout, for instance).
- **RecoverAI** takes whatever action its own production root-cause engine
  (`ai-service/root_cause.py`'s `diagnose()`) recommends for that case —
  the evaluation calls the *real* function, not a re-implementation.

Whether a given action is "capable of addressing" a failure reason is
determined by `EFFECTIVE_ACTIONS`, a disclosed, inspectable mapping in
`ai-service/train_model.py`:

```python
EFFECTIVE_ACTIONS = {
    "TEMPORARY_PAYMENT_FAILURE": {"PAYMENT_RETRY", "PAYMENT_LINK"},
    "INSUFFICIENT_FUNDS": {"REMINDER", "PAYMENT_LINK"},
    "PAYMENT_METHOD_ISSUE": {"PAYMENT_LINK"},
    "REPEATED_PAYMENT_FAILURE": {"HUMAN_ESCALATION"},
    "CHECKOUT_ABANDONMENT": {"PAYMENT_LINK", "REMINDER"},
    "SUBSCRIPTION_FAILURE": {"SUBSCRIPTION_RETRY"},
    "OVERDUE_RECEIVABLE": {"REMINDER", "HUMAN_ESCALATION"},
    "UNKNOWN": {"HUMAN_ESCALATION"},
}
```

This is **not** a hidden numeric assumption — it's a business rule anyone
reviewing the code can read, dispute, and change. It contains no percentage
that was tuned to produce a particular result.

**Honest limitation this still carries**: `EFFECTIVE_ACTIONS` itself is
still a modeling choice (which actions "count" as effective for which
failure reasons) — it is disclosed and inspectable rather than measured
from real-world intervention outcomes, since no real interventions were
run against these synthetic cases. Labeled `SIMULATED_DISCLOSED_MODEL` in
the API (`/api/analytics/baseline`), not `MEASURED`.

Escalated (human-approval-required) cases use the identical effectiveness
rule as automated ones. This assumes the approval step itself happens
(a much more benign assumption than assuming a specific human success
rate) — also disclosed, not hidden.

## 5. Live dashboard metrics vs. evaluation metrics

The Command Center shows two distinct sets of numbers:
1. **"Live cases"** metrics — computed directly from whatever is currently
   in the case store (`backend/services/analytics.js` → `getLiveDashboardMetrics()`).
   This reflects the seeded demo dataset plus anything you run through
   Judge Mode or the API.
2. **"Held-out evaluation"** metrics — read verbatim from
   `ai-service/metrics.json`, i.e., the ML pipeline's own test-set results.

These two will not match exactly, and that's intentional and honest: one is
"what's currently sitting in the demo database," the other is "how the
model performs on data it never trained on."

## 7. Threshold analysis: an honest tension

`ai-service/train_model.py`'s `threshold_sweep()` evaluates the confidence
threshold at 0.40 through 0.80 and computes gross/cost/net recovery at
each. The result is genuinely interesting: **the threshold that maximizes
net recovery in this dataset (0.40) is lower than the production default
(0.70)**. This is not a bug — it's a real precision/safety tradeoff:
a lower threshold captures more revenue but at lower precision (more
unnecessary interventions, more low-confidence automated actions). The
production default of 0.70 is a deliberate safety-first choice, not the
profit-maximizing one. Both numbers are real and disclosed; the business
decision to prioritize precision over raw net recovery is documented here
rather than hidden.

## 6. What is NOT independently measured

- The `EFFECTIVE_ACTIONS` mapping (which actions address which failure
  reasons) is a disclosed modeling choice, not measured from real
  intervention outcomes — see Section 4.
- Real-world Razorpay Test Mode success rates (this build runs in
  SIMULATED mode by default — see the main README's Razorpay section).
