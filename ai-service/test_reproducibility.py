import json
import os
import subprocess
import sys

BASE = os.path.dirname(__file__)


def run_pipeline_and_capture_metrics():
    subprocess.run([sys.executable, "generate_dataset.py"], cwd=BASE, check=True, capture_output=True)
    subprocess.run([sys.executable, "train_model.py"], cwd=BASE, check=True, capture_output=True)
    with open(os.path.join(BASE, "metrics.json")) as f:
        return json.load(f)


def test_same_seed_produces_identical_business_metrics():
    run1 = run_pipeline_and_capture_metrics()
    run2 = run_pipeline_and_capture_metrics()

    assert run1["seed"] == run2["seed"] == 42

    assert run1["test_results"]["precision"] == run2["test_results"]["precision"]
    assert run1["test_results"]["recall"] == run2["test_results"]["recall"]
    assert run1["test_results"]["f1"] == run2["test_results"]["f1"]
    assert run1["test_results"]["roc_auc"] == run2["test_results"]["roc_auc"]
    assert run1["chosen_model"] == run2["chosen_model"]

    biz1, biz2 = run1["business_metrics"], run2["business_metrics"]
    assert biz1["total_revenue_at_risk"] == biz2["total_revenue_at_risk"]
    assert biz1["total_revenue_recovered"] == biz2["total_revenue_recovered"]
    assert biz1["recovery_lift_vs_baseline_pct"] == biz2["recovery_lift_vs_baseline_pct"]
    assert biz1["cases_evaluated"] == biz2["cases_evaluated"]


def test_dataset_regeneration_is_deterministic():
    import pandas as pd
    subprocess.run([sys.executable, "generate_dataset.py"], cwd=BASE, check=True, capture_output=True)
    df1 = pd.read_csv(os.path.join(BASE, "..", "data", "revenue_events.csv"))
    subprocess.run([sys.executable, "generate_dataset.py"], cwd=BASE, check=True, capture_output=True)
    df2 = pd.read_csv(os.path.join(BASE, "..", "data", "revenue_events.csv"))

    assert len(df1) == len(df2)
    assert df1["is_recoverable"].sum() == df2["is_recoverable"].sum()
    assert (df1["amount"].round(2) == df2["amount"].round(2)).all()


def test_no_target_leakage_in_features():

    import train_model
    from root_cause import diagnose

    all_features = set(train_model.NUM_FEATURES) | set(train_model.CAT_FEATURES)
    assert train_model.TARGET not in all_features, "the target label must never appear in the feature set"
    assert "is_recoverable" not in all_features

    event_without_label = {
        "amount": 5000, "failure_reason": "TEMPORARY_PAYMENT_FAILURE",
        "previous_attempts": 0, "previous_successes": 5, "customer_activity_days": 1,
    }
    event_with_label_true = {**event_without_label, "is_recoverable": 1}
    event_with_label_false = {**event_without_label, "is_recoverable": 0}

    d1 = diagnose(event_without_label)
    d2 = diagnose(event_with_label_true)
    d3 = diagnose(event_with_label_false)
    assert d1 == d2 == d3, "diagnose() must produce identical output regardless of ground-truth label presence/value"


if __name__ == "__main__":
    test_same_seed_produces_identical_business_metrics()
    print("test_same_seed_produces_identical_business_metrics: PASS")
    test_dataset_regeneration_is_deterministic()
    print("test_dataset_regeneration_is_deterministic: PASS")
    test_no_target_leakage_in_features()
    print("test_no_target_leakage_in_features: PASS")
