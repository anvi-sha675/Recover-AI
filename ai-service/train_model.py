import json
import os

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

BASE = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE, "..", "data")

NUM_FEATURES = [
    "amount",
    "previous_attempts",
    "previous_successes",
    "customer_activity_days",
    "time_since_failure_hours",
    "checkout_duration_sec",
    "days_overdue",
]
CAT_FEATURES = ["failure_reason", "payment_method", "subscription_status"]
TARGET = "is_recoverable"


def load(split):
    return pd.read_csv(os.path.join(DATA_DIR, f"{split}.csv"))


def build_pipeline(model):
    pre = ColumnTransformer(
        [
            ("num", StandardScaler(), NUM_FEATURES),
            ("cat", OneHotEncoder(handle_unknown="ignore"), CAT_FEATURES),
        ]
    )
    return Pipeline([("pre", pre), ("model", model)])


def evaluate(pipe, df):
    X = df[NUM_FEATURES + CAT_FEATURES]
    y = df[TARGET]
    proba = pipe.predict_proba(X)[:, 1]
    pred = (proba >= 0.5).astype(int)
    cm = confusion_matrix(y, pred).tolist()
    return {
        "precision": round(precision_score(y, pred, zero_division=0), 4),
        "recall": round(recall_score(y, pred, zero_division=0), 4),
        "f1": round(f1_score(y, pred, zero_division=0), 4),
        "roc_auc": round(roc_auc_score(y, proba), 4) if y.nunique() > 1 else None,
        "confusion_matrix": {"labels": ["not_recoverable", "recoverable"], "matrix": cm},
        "class_distribution": y.value_counts(normalize=True).round(4).to_dict(),
    }, proba, pred


def business_metrics(df, proba, pred, threshold=0.70, max_auto_amount=10000):
    from root_cause import diagnose  # local import avoids a cycle at module load time

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
    BASELINE_ACTION = "PAYMENT_RETRY"

    df = df.copy()
    df["proba"] = proba

    recoverai_actions = []
    for _, row in df.iterrows():
        diagnosis = diagnose(row.to_dict())
        recoverai_actions.append(diagnosis["recommended_action"])
    df["recoverai_action"] = recoverai_actions

    df["auto_eligible"] = (df["proba"] >= threshold) & (df["amount"] <= max_auto_amount)
    df["escalated"] = ~df["auto_eligible"]

    def action_is_effective(row, action):
        return action in EFFECTIVE_ACTIONS.get(row["failure_reason"], set())

    # BASELINE: same fixed action for every case, same effectiveness rule.
    df["baseline_effective"] = df.apply(lambda r: action_is_effective(r, BASELINE_ACTION), axis=1)
    df["baseline_recovered"] = (df[TARGET] == 1) & df["baseline_effective"]

    # RECOVERAI: the action its own diagnosis engine actually recommends,
    # same effectiveness rule. STOP never recovers anything by definition.
    df["recoverai_effective"] = df.apply(
        lambda r: r["recoverai_action"] != "STOP" and action_is_effective(r, r["recoverai_action"]), axis=1
    )
    df["recoverai_recovered"] = (df[TARGET] == 1) & df["recoverai_effective"]
    df["unnecessary_intervention"] = df["recoverai_effective"] & (df[TARGET] == 0)

    total_at_risk_value = df["amount"].sum()
    recoverai_recovered_value = df.loc[df["recoverai_recovered"], "amount"].sum()
    baseline_recovered_value = df.loc[df["baseline_recovered"], "amount"].sum()
    automated_recovered_value = df.loc[df["recoverai_recovered"] & df["auto_eligible"], "amount"].sum()
    escalated_recovered_value = df.loc[df["recoverai_recovered"] & df["escalated"], "amount"].sum()

    metrics = {
        "methodology": "FAIR_SHARED_OUTCOME_MODEL",
        "methodology_note": (
            "Both strategies are scored with the identical rule "
            "(genuinely recoverable AND the action taken addresses the failure reason). "
            "No independent random success-rate assumption is used for either strategy. "
            "See docs/evaluation.md and EFFECTIVE_ACTIONS in train_model.py."
        ),
        "total_revenue_at_risk": round(float(total_at_risk_value), 2),
        "total_revenue_recovered_automated": round(float(automated_recovered_value), 2),
        "total_revenue_recovered_via_escalation": round(float(escalated_recovered_value), 2),
        "total_revenue_recovered": round(float(recoverai_recovered_value), 2),
        "recovery_rate": round(float(df["recoverai_recovered"].sum() / max(len(df), 1)), 4),
        "average_recovery_per_case": round(
            float(recoverai_recovered_value / max(df["recoverai_recovered"].sum(), 1)), 2
        ),
        "intervention_success_rate": round(
            float(df.loc[df["auto_eligible"], TARGET].mean())
            if df["auto_eligible"].sum() > 0
            else 0.0,
            4,
        ),
        "unnecessary_intervention_rate": round(
            float(df["unnecessary_intervention"].sum() / max(len(df), 1)), 4,
        ),
        "escalation_rate": round(float(df["escalated"].sum() / max(len(df), 1)), 4),
        "baseline_revenue_recovered": round(float(baseline_recovered_value), 2),
        "recovery_lift_vs_baseline_pct": round(
            float(
                ((recoverai_recovered_value - baseline_recovered_value) / max(baseline_recovered_value, 1))
                * 100
            ),
            2,
        ),
        "cases_evaluated": len(df),
    }
    return metrics


def extract_feature_importance(pipe, model_name):
    """
    Extracts real feature importance from the trained pipeline - never
    fabricated. Logistic Regression -> absolute coefficient magnitude
    (after the same StandardScaler/OneHotEncoder preprocessing used in
    training, so coefficients are comparable). Random Forest -> the
    model's own impurity-based feature_importances_.
    """
    pre = pipe.named_steps["pre"]
    feature_names = list(pre.get_feature_names_out())
    model = pipe.named_steps["model"]

    if model_name == "logistic_regression":
        raw = model.coef_[0]
        values = [abs(float(v)) for v in raw]
    else:
        values = [float(v) for v in model.feature_importances_]

    pairs = sorted(zip(feature_names, values), key=lambda p: p[1], reverse=True)
    total = sum(v for _, v in pairs) or 1.0
    return [
        {"feature": name.replace("num__", "").replace("cat__", ""), "importance": round(v / total, 4)}
        for name, v in pairs[:12]
    ]


def main():
    train, val, test = load("train"), load("val"), load("test")

    candidates = {
        "logistic_regression": LogisticRegression(max_iter=1000, class_weight="balanced"),
        "random_forest": RandomForestClassifier(
            n_estimators=300, max_depth=8, random_state=42, class_weight="balanced"
        ),
    }

    val_results = {}
    pipelines = {}
    for name, model in candidates.items():
        pipe = build_pipeline(model)
        pipe.fit(train[NUM_FEATURES + CAT_FEATURES], train[TARGET])
        res, _, _ = evaluate(pipe, val)
        val_results[name] = res
        pipelines[name] = pipe
        print(f"[val] {name}: {res}")
        
    lr_f1 = val_results["logistic_regression"]["f1"]
    rf_f1 = val_results["random_forest"]["f1"]
    chosen = "random_forest" if rf_f1 > lr_f1 + 0.03 else "logistic_regression"
    print(f"Chosen model: {chosen} (lr_f1={lr_f1}, rf_f1={rf_f1})")

    final_pipe = pipelines[chosen]
    test_results, proba, pred = evaluate(final_pipe, test)
    biz = business_metrics(test, proba, pred)

    feature_importance = extract_feature_importance(final_pipe, chosen)

    joblib.dump(final_pipe, os.path.join(BASE, "recovery_model.joblib"))

    output = {
        "chosen_model": chosen,
        "validation_results": val_results,
        "test_results": test_results,
        "business_metrics": biz,
        "feature_importance": feature_importance,
        "seed": 42,
        "features": {"numeric": NUM_FEATURES, "categorical": CAT_FEATURES},
    }
    with open(os.path.join(BASE, "metrics.json"), "w") as f:
        json.dump(output, f, indent=2)

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
