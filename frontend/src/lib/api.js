const configuredBase = import.meta.env.VITE_API_BASE;
const BASE = configuredBase
  ? `${configuredBase.replace(/\/$/, "")}/api`
  : "/api";

let adminApiKey = sessionStorage.getItem("recoverai_api_key") || null;
export function setAdminApiKey(key) {
  adminApiKey = key || null;
  if (adminApiKey) sessionStorage.setItem("recoverai_api_key", adminApiKey);
  else sessionStorage.removeItem("recoverai_api_key");
}
export function getAdminApiKey() {
  return adminApiKey;
}

async function req(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (adminApiKey) headers["x-api-key"] = adminApiKey;
  if (!headers["x-request-id"]) headers["x-request-id"] = `frontend_${crypto.randomUUID()}`;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = typeof body.error === "string" ? body.error : body.error?.message;
    throw new Error(message || body.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  health: () => req("/health"),
  cases: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req(`/recovery/cases${qs ? `?${qs}` : ""}`);
  },
  caseDetail: (id) => req(`/recovery/cases/${id}`),
  caseAudit: (id) => req(`/recovery/cases/${id}/audit`),
  recentActivity: (limit = 30) => req(`/recovery/activity/recent?limit=${limit}`),
  approve: (id) => req(`/recovery/cases/${id}/approve`, { method: "POST" }),
  reject: (id) => req(`/recovery/cases/${id}/reject`, { method: "POST" }),
  approvals: () => req("/recovery/approvals"),
  policy: () => req("/recovery/policy"),
  execute: (payload) => req("/recovery/execute", { method: "POST", body: JSON.stringify(payload) }),
  analyticsRecovery: () => req("/analytics/recovery"),
  analyticsBaseline: () => req("/analytics/baseline"),
  evaluationRunsLatest: () => req("/analytics/evaluation-runs/latest"),
  evaluationRuns: () => req("/analytics/evaluation-runs"),
  createEvaluationRun: () => req("/analytics/evaluation-runs", { method: "POST" }),
  runEvaluation: () => req("/analytics/evaluation-runs/run", { method: "POST" }),
  voiceRecovery: (payload) => req("/voice/recovery", { method: "POST", body: JSON.stringify(payload) }),
  voiceIntents: () => req("/voice/intents"),
  updatePolicy: (patch) => req("/recovery/policy", { method: "POST", body: JSON.stringify(patch) }),
};
