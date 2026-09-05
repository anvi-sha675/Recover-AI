import mongoose from "mongoose";

const { Schema } = mongoose;

const CustomerSchema = new Schema({
  customer_id: { type: String, index: true, unique: true },
  name: String,
  email: String,
  phone: String,
  purchase_history: { type: [Schema.Types.Mixed], default: [] },
  successful_payments: { type: Number, default: 0 },
  failed_payments: { type: Number, default: 0 },
  last_activity: String,
  subscription_status: { type: String, default: "none" },
  created_at: String,
});

const TransactionSchema = new Schema({
  transaction_id: { type: String, index: true, unique: true },
  customer_id: { type: String, index: true },
  amount: Number,
  status: String,
  payment_method: String,
  failure_reason: String,
  timestamp: String,
  checkout_started: Boolean,
  checkout_completed: Boolean,
  subscription_id: String,
});

const RecoveryCaseSchema = new Schema({
  case_id: { type: String, index: true, unique: true },
  transaction_id: String,
  customer_id: { type: String, index: true },
  amount: Number,
  risk_score: Number,
  recovery_probability: Number,
  root_cause: String,
  recommended_action: String,
  evidence: { type: [String], default: [] },
  economics: Schema.Types.Mixed,
  policy_status: String,
  current_status: { type: String, index: true },
  attempt_count: { type: Number, default: 0 },
  scenario: String,
  source_features: Schema.Types.Mixed,
  created_at: String,
  updated_at: String,
});

const RecoveryActionSchema = new Schema({
  action_id: { type: String, index: true, unique: true },
  case_id: { type: String, index: true },
  action_type: String,
  reason: String,
  confidence: Number,
  approved_by: String,
  idempotency_key: { type: String, index: true, unique: true, sparse: true },
  executed_at: String,
  result: Schema.Types.Mixed,
});

const VerificationRecordSchema = new Schema({
  verification_id: { type: String, index: true, unique: true },
  case_id: { type: String, index: true },
  transaction_id: { type: String, index: true },
  amount: Number,
  status: String, // VERIFICATION_SUCCESS | VERIFICATION_FAILED
  provider: String, // razorpay | simulation
  execution_mode: String, // LIVE_TEST_MODE | SIMULATION
  verified_at: String,
  metadata: Schema.Types.Mixed,
});

const AuditLogSchema = new Schema({
  audit_id: { type: String, index: true, unique: true },
  case_id: { type: String, index: true },
  timestamp: String,
  actor: String,
  event: String,
  reason: String,
  result: String,
  metadata: Schema.Types.Mixed,
});

const ApprovalSchema = new Schema({
  approval_id: { type: String, index: true, unique: true },
  case_id: { type: String, index: true },
  status: String,
  created_at: String,
});

const PolicyConfigSchema = new Schema({}, { strict: false });

const EvaluationRunSchema = new Schema({
  evaluation_run_id: { type: String, index: true, unique: true },
  dataset_version: String,
  model_version: String,
  policy_version: String,
  seed: Number,
  strategy: String, // BASELINE_FIXED_RETRY | RECOVERAI_ADAPTIVE
  cases_evaluated: Number,
  revenue_at_risk_paise: Number,
  revenue_recovered_paise: Number,
  recovery_rate: Number,
  interventions: Number,
  successful_interventions: Number,
  failed_interventions: Number,
  escalations: Number,
  stopped_cases: Number,
  net_recovery_paise: Number,
  created_at: String,
  metadata: Schema.Types.Mixed,
});

const MODELS = {
  customers: mongoose.models.Customer || mongoose.model("Customer", CustomerSchema),
  transactions: mongoose.models.Transaction || mongoose.model("Transaction", TransactionSchema),
  recovery_cases: mongoose.models.RecoveryCase || mongoose.model("RecoveryCase", RecoveryCaseSchema),
  recovery_actions: mongoose.models.RecoveryAction || mongoose.model("RecoveryAction", RecoveryActionSchema),
  verification_records: mongoose.models.VerificationRecord || mongoose.model("VerificationRecord", VerificationRecordSchema),
  audit_logs: mongoose.models.AuditLog || mongoose.model("AuditLog", AuditLogSchema),
  approvals: mongoose.models.Approval || mongoose.model("Approval", ApprovalSchema),
  policy_config: mongoose.models.PolicyConfig || mongoose.model("PolicyConfig", PolicyConfigSchema),
  evaluation_runs: mongoose.models.EvaluationRun || mongoose.model("EvaluationRun", EvaluationRunSchema),
};

export async function connectMongo(uri, timeoutMs = 4000) {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: timeoutMs,
  });
  return mongoose.connection;
}

export const mongoStore = {
  async all(collection) {
    return (await MODELS[collection].find({}).lean()).map(stripIds);
  },
  async find(collection, predicate) {
    const all = (await MODELS[collection].find({}).lean()).map(stripIds);
    return all.filter(predicate);
  },
  async findOne(collection, predicate) {
    const all = (await MODELS[collection].find({}).lean()).map(stripIds);
    return all.find(predicate) || null;
  },
  async insert(collection, doc) {
    try {
      const created = await MODELS[collection].create(doc);
      return stripIds(created.toObject());
    } catch (err) {
      if (err.code === 11000) {
        const dupError = new Error(`Duplicate key - this action was already recorded (idempotency enforced at the database level): ${err.message}`);
        dupError.code = "IDEMPOTENCY_CONFLICT";
        throw dupError;
      }
      throw err;
    }
  },
  async update(collection, predicate, patch) {
    const all = (await MODELS[collection].find({}).lean()).map(stripIds);
    const match = all.find(predicate);
    if (!match) return null;
    const idField = Object.keys(match).find((k) => k.endsWith("_id") && match[k] !== undefined);
    const filter = idField ? { [idField]: match[idField] } : {};
    const updated = { ...match, ...patch, updated_at: new Date().toISOString() };
    await MODELS[collection].updateOne(filter, { $set: updated });
    return updated;
  },
  async reset() {
    await Promise.all(Object.values(MODELS).map((m) => m.deleteMany({})));
  },
  async count(collection) {
    return MODELS[collection].countDocuments({});
  },
};

function stripIds(obj) {
  const { _id, __v, ...rest } = obj;
  return rest;
}
