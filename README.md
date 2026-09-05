# RecoverAI — Autonomous Revenue Recovery Agent

**Razorpay Buildathon 2026 — Track 03: AI Revenue Recovery**

RecoverAI detects at-risk revenue, diagnoses the cause, predicts recovery probability, selects a safe intervention, executes it through Razorpay Test Mode, verifies the outcome, and maintains an auditable trail.

The operating loop is:

```text
DETECT → DIAGNOSE → PREDICT → POLICY → HUMAN APPROVAL (when required)
→ EXECUTE → VERIFY → MEASURE → STOP / ESCALATE
```

## Problem

Failed payments, abandoned checkouts, and subscription failures represent recoverable revenue. RecoverAI identifies which cases are worth recovering and acts safely instead of blindly retrying.

## Solution

```text
Payment Failure
→ Risk Detection
→ Diagnosis
→ Recovery Probability
→ Strategy Selection
→ Policy Gate
→ Action / Human Approval
→ Razorpay
→ Verification
→ Audit Trail
→ Analytics
```

Supports:

* Payment failure recovery
* Checkout abandonment
* Failed subscription retry

## Architecture

```text
React Frontend
      ↓
Node/Express Backend
      ↓
Recovery Orchestrator
   ↙          ↘
AI Service   Policy Engine
(FastAPI)    (Deterministic)
      ↓          ↓
      Action Executor
           ↓
    Razorpay Test Mode
           ↓
     Outcome Verifier
           ↓
        Data Store
```

**The LLM never moves money.** Root-cause diagnosis is deterministic in the default build, and optional LLM narration cannot change the action, amount, confidence, or policy result. The deterministic Policy Engine is the control layer for financial actions.

## AI

* Logistic Regression recovery-probability model
* 12,000-event synthetic dataset
* Rule-based root-cause diagnosis with evidence
* Optional Claude narration
* Deterministic fallback when no LLM key is configured

### Model Results

| Metric               |       Result |
| -------------------- | -----------: |
| Precision            |       0.7575 |
| Recall               |       0.6096 |
| F1                   |       0.6756 |
| ROC-AUC              |       0.7139 |
| Revenue at Risk      |      ₹13.73L |
| Total Recovered      |       ₹7.28L |
| Intervention Success |        89.5% |
| Recovery Lift        | **+160.95%** |

## Safety Guardrails

* Maximum 3 automated retries
* Maximum automated recovery: ₹10,000
* Minimum confidence: 70%
* Maximum 3 interventions/customer
* Stop after success
* High-value transactions require human approval
* Automatic escalation after maximum attempts
* Rate limiting and state-machine enforcement

## Razorpay Integration

Uses the official Razorpay SDK.

* **TEST_MODE:** Real Razorpay Test Mode API when credentials are configured
* **SIMULATED:** Deterministic fallback when credentials/network are unavailable

RecoverAI never claims a real API call occurred when it did not.

## Verification

Three canonical scenarios are verified end-to-end:

* **Case A:** ₹4,999 → automated retry → **Recovered**
* **Case B:** ₹35,000 → human approval → **Recovered**
* **Case C:** 3 failed retries → **Escalated**, 4th retry blocked

The backend suite contains 49 tests covering policy, state transitions, money, orchestration, idempotency, retry limits, voice intents, RBAC, and signed webhooks. The frontend has lint and production-build checks.

## Tech Stack

**Frontend:** React, Vite, Tailwind CSS
**Backend:** Node.js, Express.js
**AI:** Python, FastAPI, scikit-learn
**Database:** MongoDB / JSON fallback
**Payments:** Razorpay SDK
**Testing:** Jest + Python tests

## Project Structure

```text
recoverai/
├── ai-service/
├── backend/
├── frontend/
├── data/
└── docs/
```

## Run Locally

### AI Service

```bash
cd ai-service
pip install -r requirements.txt
python3 generate_dataset.py
python3 train_model.py
uvicorn app:app --reload --port 8000
```

### Backend

```bash
cd backend
npm install
# Optional: configure MONGODB_URI, AI_SERVICE_URL, Razorpay test keys,
# RAZORPAY_WEBHOOK_SECRET, ADMIN_API_KEY, and REVIEWER_API_KEY.
node seed.js
npm start
```

For pitch-video preparation, `npm run seed` loads the deterministic `seed=42`
dataset into MongoDB Atlas only and fails closed if `MONGODB_URI` is missing or
MongoDB is unreachable. It reports the database mode and seeded collection
counts. Run `npm run demo:check` afterward to verify MongoDB, seeded cases,
verification records, approval/escalation workflows, audit data, simulation
mode, and AI-service reachability.

The seed includes transparent `SEEDED_DEMO` records and deterministic pitch
scenarios: Case A autonomous recovery, Case B pending human approval, and Case
C retry exhaustion/escalation. Seeded historical verification is labeled as
synthetic demo data and is not presented as a live provider recovery.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Tests

```bash
cd backend
npm test

cd ../frontend
npm run lint
npm run build

cd ../ai-service
python -m unittest test_reproducibility.py
```

When no MongoDB or Razorpay credentials are configured, the app explicitly runs
in local JSON-store and deterministic Razorpay simulation modes. These are demo
modes, not production payment processing.

## Human approval and verification

High-value or low-confidence cases enter `AWAITING_APPROVAL`. The approval and
rejection endpoints require reviewer-level access when RBAC keys are configured;
the UI never auto-approves a case. A case is counted as recovered only after a
successful retry verification or a signature-verified `payment_link.paid`
webhook whose amount exactly matches the case amount.

## Security and operating limits

* Sensitive execution and reviewer actions are rate-limited and RBAC-protected when keys are configured.
* Resumed cases are bound to their original transaction, customer, and amount.
* Idempotency keys bind case, action, and attempt number.
* Production concurrent-execution safety relies on MongoDB's unique idempotency index; the local JSON store is single-process demo/test persistence and does not provide atomic cross-request uniqueness.
* Stopped cases cannot execute another financial action.
* Webhooks require `RAZORPAY_WEBHOOK_SECRET`, HMAC verification, an event ID, and duplicate-event protection.
* The local JSON store is for demo/testing; production should use MongoDB.

## Limitations

* No live STT; voice uses transcript-based intent classification
* MongoDB and Razorpay depend on external network access
* Authorization is API-key based rather than full RBAC
* Rate limiting is in-memory
* Deployment configurations are not included
* ML performance is limited by the synthetic dataset
* Webhook handling currently covers signed `payment_link.paid` events; other Razorpay event types are acknowledged but do not change recovery state.

**RecoverAI is designed to recover revenue while keeping every financial action controlled, explainable, verifiable, and auditable.**
