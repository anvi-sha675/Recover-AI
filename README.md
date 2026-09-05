# RecoverAI — Autonomous Revenue Recovery Agent

**Razorpay Buildathon 2026 — Track 03: AI Revenue Recovery**

RecoverAI detects at-risk revenue, diagnoses the cause, predicts recovery probability, selects a safe intervention, executes it through Razorpay Test Mode, verifies the outcome, and maintains an auditable trail.

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

**The LLM never moves money.** The deterministic Policy Engine is the only component authorized to approve financial actions.

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

**43/43 tests passed.**

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
cp .env.example .env
node seed.js
npm start
```

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
```

## Limitations

* No live STT; voice uses transcript-based intent classification
* MongoDB and Razorpay depend on external network access
* Authorization is API-key based rather than full RBAC
* Rate limiting is in-memory
* No webhook signature verification
* Deployment configurations are not included
* ML performance is limited by the synthetic dataset

**RecoverAI is designed to recover revenue while keeping every financial action controlled, explainable, verifiable, and auditable.**
