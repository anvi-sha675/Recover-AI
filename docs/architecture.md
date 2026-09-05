# Architecture

```
React Frontend (Vite + Tailwind v4 + Recharts + Framer Motion)
        |
        v  REST (JSON)
Node/Express API  (backend/)
        |
        v
Recovery Orchestrator (backend/services/orchestrator.js)
        |
   +----+-----------------------+
   |                            |
   v                            v
AI Service (Python/FastAPI)   Policy Engine (deterministic, backend/services/policyEngine.js)
 - recovery-probability model     - MAX_AUTOMATED_RETRIES
 - root-cause diagnosis           - MAX_AUTOMATED_RECOVERY_AMOUNT
 - optional LLM narration         - MIN_RECOVERY_CONFIDENCE
   (template fallback if no       - MAX_INTERVENTIONS_PER_CUSTOMER
    ANTHROPIC_API_KEY)            - STOP_AFTER_SUCCESS
                                  - ESCALATE_AFTER_MAX_ATTEMPTS
                                  - HIGH_VALUE_TRANSACTION_REQUIRES_APPROVAL
   |                            |
   +-------------+--------------+
                 v
         Action Executor
         (backend/services/razorpayService.js)
                 |
                 v
     Razorpay Test Mode API
     (real SDK calls if RAZORPAY_KEY_ID/SECRET set,
      else clearly-labeled deterministic simulation)
                 |
                 v
         Outcome Verifier
                 |
     +-----------+-----------+
     v           v           v
 Recovered     Retry      Escalate
     |           |           |
     +-----------+-----------+
                 v
        Data Store (backend/db/index.js)
      customers | transactions | recovery_cases
      recovery_actions | audit_logs | approvals
      (JSON-file store in this build; schema in
       backend/models/schemas.js maps directly to
       MongoDB/Mongoose collections for production)
```

## Why this shape

- **The LLM never moves money.** `root_cause.py` is a deterministic,
  evidence-producing rule engine. The optional LLM layer
  (`llm_reasoner.py`) only narrates a decision that's already been made —
  it cannot change the recommended action, confidence, or amount.
- **The Policy Engine is the only component that can say "yes."**
  `orchestrator.js` calls `policyEngine.evaluate()` before any execution
  step, every time, including on retries.
- **Verification gates the "recovered" label.** Revenue is only marked
  `RECOVERED` after `razorpayService.verifyPayment()` (or a retry's direct
  success flag) confirms it — an executed action alone never flips the
  status.
- **Every state transition writes an audit event** with actor, event,
  reason, result, and metadata, via the single `audit()` helper in
  `orchestrator.js`, so the audit trail can't silently miss a step.

## Data store note

This sandbox environment has no network path to a live MongoDB instance,
so `backend/db/index.js` selects a JSON-file-backed store with the *same*
collection shapes Mongoose models would use (`backend/models/schemas.js`
documents those shapes). When `MONGODB_URI` is configured, the same database
facade selects the Mongoose-backed store. Routes and services call the facade
rather than either store implementation directly.
