import json
import os

import joblib
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from llm_reasoner import explain as llm_explain
from root_cause import diagnose, recovery_economics

BASE = os.path.dirname(__file__)
MODEL_PATH = os.path.join(BASE, "recovery_model.joblib")
METRICS_PATH = os.path.join(BASE, "metrics.json")

app = FastAPI(title="RecoverAI AI Service")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

_model = joblib.load(MODEL_PATH) if os.path.exists(MODEL_PATH) else None


class RevenueEvent(BaseModel):
    amount: float
    failure_reason: str = "UNKNOWN"
    payment_method: str = "card"
    previous_attempts: int = 0
    previous_successes: int = 0
    customer_activity_days: float = 30.0
    time_since_failure_hours: float = 0.0
    checkout_duration_sec: float = 120.0
    subscription_status: str = "none"
    days_overdue: int = 0
    checkout_completed: bool = True


class ExplainRequest(BaseModel):
    diagnosis: dict
    recovery_probability: float
    policy_decision: dict


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": _model is not None}


@app.post("/predict/recovery-probability")
def predict(event: RevenueEvent):
    if _model is None:
        return {"error": "Model not trained yet. Run train_model.py first."}
    row = pd.DataFrame([{
        "amount": event.amount,
        "previous_attempts": event.previous_attempts,
        "previous_successes": event.previous_successes,
        "customer_activity_days": event.customer_activity_days,
        "time_since_failure_hours": event.time_since_failure_hours,
        "checkout_duration_sec": event.checkout_duration_sec,
        "days_overdue": event.days_overdue,
        "failure_reason": event.failure_reason,
        "payment_method": event.payment_method,
        "subscription_status": event.subscription_status,
    }])
    proba = float(_model.predict_proba(row)[0, 1])
    risk_score = round(1 - proba, 4) if event.failure_reason != "NONE" else 0.0
    return {"recovery_probability": round(proba, 4), "risk_score": risk_score}


@app.post("/diagnose/root-cause")
def root_cause_endpoint(event: RevenueEvent):
    return diagnose(event.dict())


@app.post("/economics")
def economics_endpoint(event: RevenueEvent):
    if _model is None:
        return {"error": "Model not trained yet. Run train_model.py first."}
    row = pd.DataFrame([{
        "amount": event.amount,
        "previous_attempts": event.previous_attempts,
        "previous_successes": event.previous_successes,
        "customer_activity_days": event.customer_activity_days,
        "time_since_failure_hours": event.time_since_failure_hours,
        "checkout_duration_sec": event.checkout_duration_sec,
        "days_overdue": event.days_overdue,
        "failure_reason": event.failure_reason,
        "payment_method": event.payment_method,
        "subscription_status": event.subscription_status,
    }])
    proba = float(_model.predict_proba(row)[0, 1])
    diagnosis = diagnose(event.dict())
    return recovery_economics(event.amount, proba, diagnosis["recommended_action"])


@app.post("/explain")
def explain_endpoint(req: ExplainRequest):
    return llm_explain(req.diagnosis, req.recovery_probability, req.policy_decision)


@app.get("/metrics")
def metrics():
    if not os.path.exists(METRICS_PATH):
        return {"error": "No metrics yet. Run train_model.py first."}
    with open(METRICS_PATH) as f:
        return json.load(f)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
