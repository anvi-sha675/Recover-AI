# RecoverAI — Autonomous Revenue Recovery Agent

> **AI-powered, policy-controlled revenue recovery for failed payments.**

RecoverAI is an autonomous revenue recovery control plane built for **Razorpay Buildathon 2026 — Track 03: AI Revenue Recovery**.

It combines **risk prediction, root-cause diagnosis, recovery economics, deterministic policy controls, human approval, provider execution, payment verification, stopping rules, and auditability**.

> **Detect → Diagnose → Predict → Decide → Control → Approve → Execute → Verify → Measure → Stop**

---

## 🚀 Why RecoverAI?

Traditional payment recovery often relies on fixed retry schedules:

```text
Payment Failed
      ↓
Retry
      ↓
Retry
      ↓
Retry
      ↓
Give Up

RecoverAI evaluates every case individually:

Failed Payment
      ↓
Risk Detection
      ↓
Root-Cause Diagnosis
      ↓
Recovery Prediction
      ↓
Expected Net Recovery
      ↓
Policy Decision
      ↓
Autonomous Action / Human Approval
      ↓
Provider Execution
      ↓
Payment Verification
      ↓
Verified Revenue
      ↓
Measure / Stop / Escalate
✨ Key Features
🧠 AI Recovery Intelligence
Recovery risk prediction
Root-cause classification
Recovery probability estimation
Recovery strategy recommendation
Explainable decision reasoning
💰 Recovery Economics

RecoverAI prioritizes cases using Expected Net Recovery rather than risk score alone.

Expected Net Recovery
=
Expected Recovery
-
Expected Intervention Cost

The system considers:

Amount at risk
Recovery probability
Expected recovery
Intervention cost
Policy constraints
🛡️ Policy-Controlled Autonomy

AI does not directly control financial execution.

AI
 ↓
Recommendation
 ↓
Policy Engine
 ↓
Permission / Restriction
 ↓
Provider
 ↓
Execution
 ↓
Verification
 ↓
Revenue Recognition

Policies control:

Maximum retry attempts
Cooldown periods
Intervention frequency
High-value approval
Customer-protection rules
Stopping conditions
Escalation
👤 Human-in-the-Loop

High-value or sensitive actions can require explicit approval.

AI Recommendation
       ↓
Policy Requires Approval
       ↓
AWAITING_APPROVAL
       ↓
Human Approves
       ↓
ACTION_EXECUTING

Rejection is also supported:

AWAITING_APPROVAL
       ↓
REJECT
       ↓
STOPPED / ESCALATED

RecoverAI never automatically treats an AI recommendation as human approval.

🔎 Verified Revenue

An executed action does not automatically mean revenue was recovered.

Action Executed
      ↓
Provider State
      ↓
Verification
      ↓
Verification Record
      ↓
Revenue Recognized

Only verified amounts contribute to:

Verified Revenue Recovered

This prevents simulated or merely successful actions from being presented as real recovered revenue.

🛑 Controlled Failure

RecoverAI uses bounded autonomy.

Attempt 1 → Failed
Attempt 2 → Failed
Attempt 3 → Failed
       ↓
STOPPING RULE TRIGGERED
       ↓
Automation Stopped
       ↓
Case Escalated

Autonomous doesn't mean unlimited.

🏗️ Architecture
                    ┌──────────────────────┐
                    │   React + Vite UI    │
                    │       Vercel         │
                    └──────────┬───────────┘
                               │ HTTPS
                               ▼
                    ┌──────────────────────┐
                    │ Node.js + Express    │
                    │   Backend Control    │
                    │       Plane          │
                    └───────┬───────┬──────┘
                            │       │
                  ┌─────────┘       └─────────────┐
                  ▼                               ▼
        ┌──────────────────┐             ┌──────────────────┐
        │ MongoDB Atlas    │             │ FastAPI AI       │
        │ Cases / Audit /  │             │ Service          │
        │ Verification     │             │ ML / Prediction  │
        └──────────────────┘             └──────────────────┘
                                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │ ML Model /      │
                                          │ Metrics         │
                                          └─────────────────┘

                          Backend
                             │
                             ▼
                    ┌──────────────────┐
                    │ Razorpay         │
                    │ Provider Adapter │
                    └──────────────────┘
🧩 Technology Stack
Frontend
React
Vite
Tailwind CSS
Framer Motion
Chart.js
Backend
Node.js
Express.js
MongoDB
REST APIs
AI Service
Python
FastAPI
scikit-learn
Infrastructure
Vercel
Render
MongoDB Atlas
Razorpay Test Mode / Simulation
🔄 Recovery State Machine

RecoverAI uses an authoritative state-transition layer.

DETECTED
   ↓
ANALYZING
   ↓
ELIGIBLE
   ↓
ACTION_RECOMMENDED
   ↓
AWAITING_APPROVAL
   ↓
ACTION_EXECUTING
   ↓
VERIFYING
   ↓
RECOVERED

Failure path:

ACTION_EXECUTING
       ↓
ACTION_FAILED
       ↓
RETRY_PENDING
       ↓
ACTION_EXECUTING

Terminal states:

RECOVERED
ESCALATED
STOPPED
CLOSED

Illegal transitions are rejected.

💳 Razorpay Integration

RecoverAI maintains a provider abstraction:

RecoverAI
    ↓
Policy Decision
    ↓
Razorpay Test Mode / Simulation
    ↓
Payment
    ↓
Provider Status
    ↓
Verification
    ↓
Recovered

Execution modes are explicitly separated:

LIVE TEST MODE
SIMULATION
BATCH EVALUATION
SEEDED DEMO

If provider connectivity or credentials are unavailable, RecoverAI does not fabricate provider results.

Simulation is not live provider recovery.

🔐 Webhook Security

Provider webhook processing supports:

HMAC signature verification
Missing-signature rejection
Invalid-signature rejection
Event deduplication
Idempotent processing
Amount validation
Provider reference tracking

Webhook records include:

provider_event_id
signature_verified
received_at
processed_at
processing_status

Duplicate webhooks must not create duplicate revenue recognition.

🔑 RBAC

RecoverAI implements role-based access controls.

OPERATOR
View cases
View analytics
View audit logs
REVIEWER
Operator permissions
Approve recovery
Reject recovery
Execute permitted manual actions
ADMIN
Reviewer permissions
Modify privileged policies
Manage protected configuration

Privileged actions record:

actor_id
role
action
resource
timestamp
request_id
🔁 Idempotency

Financial actions use idempotency protection.

Same Idempotency Key
        ↓
Same Logical Operation
        ↓
No Duplicate Execution

The same action must not result in:

Duplicate provider execution
Duplicate recovery
Duplicate revenue
Duplicate financial recognition
🧾 Audit Trail

Meaningful recovery actions generate audit events.

Examples:

RISK_DETECTED
ROOT_CAUSE_CLASSIFIED
POLICY_EVALUATED
ACTION_RECOMMENDED
APPROVAL_REQUESTED
ACTION_APPROVED
ACTION_REJECTED
ACTION_EXECUTED
ACTION_FAILED
VERIFICATION_STARTED
RECOVERY_VERIFIED
STOPPING_RULE_TRIGGERED
CASE_ESCALATED

Events record information such as:

timestamp
actor
role
case_id
event_type
from_state
to_state
reason
request_id
provider_reference
execution_mode
metadata
💵 Financial Integrity

Financial calculations use integer paise wherever practical.

amount_paise: Integer

instead of floating-point monetary values.

Calculations → paise
Persistence → paise
Financial APIs → paise
UI → formatted ₹ values

Tests cover:

₹0.01
₹99.99
₹4,999.99
Large amounts
Aggregation
Rounding
Invalid values
📊 Evaluation Methodology

RecoverAI compares two strategies using the same evaluation conditions.

Baseline

A deterministic fixed-retry strategy.

RecoverAI

An adaptive strategy using:

Risk
Root cause
Recovery probability
Payment context
Expected recovery
Intervention cost
Policy constraints
Stopping rules

Both strategies use:

Same cases
Same revenue at risk
Same deterministic outcome model
Same seed
Same economic assumptions
📈 Evaluation Metrics
ML Metrics
Precision
Recall
F1 Score
ROC-AUC
Confusion Matrix
Feature Importance
Business Metrics
Revenue at Risk
Baseline Recovery
RecoverAI Recovery
Incremental Recovery
Recovery Rate
Intervention Cost
Net Recovery
Operational Metrics
Interventions
Successful Interventions
Failed Interventions
Escalations
Stopped Cases
💹 Economic Threshold Analysis

RecoverAI evaluates multiple decision thresholds:

Threshold
Precision
Recall
Cases Selected
Expected Recovery
Intervention Cost
Expected Net Recovery

The system identifies an:

Economic Operating Point

The goal is not simply maximum classification accuracy, but maximum economically valuable recovery while respecting customer-safety and policy constraints.

🧪 Reproducibility

Evaluation runs record:

evaluation_run_id
dataset_version
model_version
policy_version
seed
strategy
cases_evaluated
revenue_at_risk
revenue_recovered
recovery_rate
incremental_recovery
interventions
successful_interventions
failed_interventions
escalations
stopped_cases
intervention_cost
net_recovery
metadata
created_at

This makes evaluation results reproducible and auditable.

🖥️ Product Pages
Command Center

Revenue-first operational overview.

Displays:

Verified Revenue Recovered
Revenue at Risk
Expected Recovery
Recovery Rate
Awaiting Approval
Escalated Cases
Recovery Funnel
Highest-value opportunities
Risk Inbox

Prioritizes cases using:

Expected Net Recovery

Each case shows:

Amount
Risk
Root Cause
Recovery Probability
Expected Recovery
Expected Net Recovery
Recommended Action
Approval Requirement
Case Details

Shows the complete decision chain:

Risk
 ↓
Diagnosis
 ↓
Prediction
 ↓
Policy
 ↓
Approval
 ↓
Action
 ↓
Provider
 ↓
Verification
 ↓
Revenue
Live Recovery Control Room

Provides three demo scenarios.

Scenario A — Autonomous Recovery
Payment Failed
↓
Diagnosis
↓
Prediction
↓
Policy Allows
↓
Action
↓
Verification
↓
Verified Recovery
Scenario B — Human Approval
High-Value Case
↓
AI Recommendation
↓
Policy Requires Approval
↓
Awaiting Approval
↓
Human Approves
↓
Execution
↓
Verification
Scenario C — Controlled Failure
Attempt 1 → Failed
Attempt 2 → Failed
Attempt 3 → Failed
↓
Stopping Rule
↓
Automation Stopped
↓
Escalated
Analytics / Evaluation Dashboard

Displays:

Dataset
Cases
Seed
Dataset Version
Model Version
Policy Version
Financial Comparison
Revenue at Risk
Baseline Recovered
RecoverAI Recovered
Incremental Recovery
Recovery Rate
Intervention Cost
Net Recovery
Trust Indicators
Same Dataset
Same Outcome Model
Deterministic
Reproducible
🧠 ML Pipeline
Dataset
   ↓
Feature Engineering
   ↓
Model Training
   ↓
Validation
   ↓
Testing
   ↓
Business Evaluation
   ↓
Threshold Analysis

The ML model does not directly execute payments.

🎯 Design Philosophy

RecoverAI intentionally avoids unnecessary AI features such as:

Generic chatbots
Blockchain
Unnecessary LLM calls
Unnecessary microservices
Gimmicky AI features

AI is used where it creates decision value:

Risk Prediction
      +
Root-Cause Intelligence
      +
Recovery Recommendation

Execution remains:

Deterministic
Policy-Controlled
Idempotent
Auditable
Verifiable
🧪 Testing

The project includes testing across the major system layers.

Backend
State transitions
Invalid transitions
Policy decisions
Approval/rejection
Idempotency
Verification
Stopping rules
Escalation
Financial calculations
Evaluation runs
RBAC
Rate limiting
Webhook verification
Duplicate webhook handling
AI
pytest
ruff
Python compilation
Reproducibility
Frontend
npm run lint
npm run build
Security
npm audit
Secret scanning
⚙️ Local Development
Clone
git clone <repository-url>
cd Recover-AI
Backend
cd backend
npm install
npm run dev
AI Service
cd ai-service
pip install -r requirements.txt
uvicorn app:app --reload
Frontend
cd frontend
npm install
npm run dev

Use .env.example to configure local environment variables.

☁️ Deployment

Recommended deployment:

React/Vite
    ↓
Vercel

Node/Express
    ↓
Render

FastAPI AI
    ↓
Render

MongoDB
    ↓
MongoDB Atlas

Example frontend configuration:

VITE_API_BASE=https://your-backend.onrender.com

Never commit real credentials.

⚠️ Data Truth

RecoverAI clearly separates:

VERIFIED

Confirmed through provider verification.

SIMULATED

Generated by the deterministic simulation path.

MODELED

Estimated by an evaluation/outcome model.

BATCH EVALUATION

Offline experiment using a fixed dataset.

SEEDED DEMO

Reproducible demonstration activity.

These categories must never be silently combined.

Batch evaluation is not equivalent to production A/B testing.

Simulation is not live provider recovery.

🚧 Limitations

RecoverAI is a buildathon implementation and should not be represented as unrestricted production financial infrastructure.

Current limitations can include:

Razorpay execution depends on configured Test Mode/provider credentials.
Simulation is not equivalent to live provider recovery.
Batch evaluation is not production A/B testing.
Some authorization mechanisms remain deployment/configuration dependent.
Production deployments should enforce database-level uniqueness for idempotency keys.
Additional production hardening is required for high-scale financial workloads.
Provider behavior depends on external API availability and configuration.
🏆 Core Differentiator

RecoverAI is not simply:

“AI that predicts failed payments.”

It is an end-to-end revenue recovery control plane.

It answers:

Why was this case selected?

Why was this intervention recommended?

What policy allowed or blocked it?

Did a human need to approve it?

What happened at the provider?

Was the payment actually verified?

How much revenue was genuinely recovered?

What did the intervention cost?

What was the expected net value?

Why did the system stop?

🔥 Final Principle

RecoverAI does not just predict failed payments. It decides what to do, executes bounded recovery actions, verifies that the money actually came back, measures the economic impact, and knows when to stop.

RecoverAI — Autonomous Revenue Recovery Agent

Razorpay Buildathon 2026 · Track 03 — AI Revenue Recovery

Detect
  ↓
Diagnose
  ↓
Predict
  ↓
Decide
  ↓
Control
  ↓
Approve
  ↓
Execute
  ↓
Verify
  ↓
Measure
  ↓
Stop / Escalate
```
