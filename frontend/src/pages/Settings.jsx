import { useEffect, useState } from "react";
import { api, setAdminApiKey, getAdminApiKey } from "../lib/api";
import { Card } from "../components/ui";
const FIELD_META = {
  MAX_AUTOMATED_RETRIES: {
    label: "Max automated retries",
    type: "number",
    help: "A case is escalated once it hits this many failed automated attempts.",
  },
  MAX_AUTOMATED_RECOVERY_AMOUNT: {
    label: "Max automated recovery amount (₹)",
    type: "number",
    help: "Transactions above this always require human approval.",
  },
  MIN_RECOVERY_CONFIDENCE: {
    label: "Min recovery confidence",
    type: "number",
    step: 0.05,
    help: "Below this predicted probability, the case is blocked and routed to review.",
  },
  MAX_INTERVENTIONS_PER_CUSTOMER: {
    label: "Max interventions per customer",
    type: "number",
    help: "Caps how many recovery actions can target one customer before escalation.",
  },
  STOP_AFTER_SUCCESS: {
    label: "Stop after success",
    type: "boolean",
    help: "Never attempt further action on a case that's already recovered.",
  },
  ESCALATE_AFTER_MAX_ATTEMPTS: {
    label: "Escalate after max attempts",
    type: "boolean",
    help: "Route to a human once the retry limit is hit, instead of silently dropping the case.",
  },
  HIGH_VALUE_TRANSACTION_REQUIRES_APPROVAL: {
    label: "High-value requires approval",
    type: "boolean",
    help: "Enforces the amount-based approval gate above.",
  },
};

export default function Settings() {
  const [policy, setPolicy] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(getAdminApiKey() || "");

  useEffect(() => {
    api.policy().then(setPolicy);
  }, []);

  const applyApiKey = () => {
    setAdminApiKey(apiKeyInput);
  };

  const update = (key, value) => {
    setPolicy((p) => ({ ...p, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    await api.updatePolicy(policy);
    setSaving(false);
    setSaved(true);
  };

  if (!policy)
    return (
      <div className="text-text-secondary">Loading policy configuration…</div>
    );

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-text-secondary">
          These are the deterministic guardrails from the Policy Engine (
          <code className="font-mono text-xs">
            backend/services/policyEngine.js
          </code>
          ). The AI can only recommend within these bounds - it cannot change
          them.
        </p>
      </div>

      <Card className="p-4">
        <div className="text-sm font-medium">Admin API key</div>
        <div className="mt-0.5 text-xs text-text-tertiary">
          Only needed if the backend has{" "}
          <code className="font-mono">ADMIN_API_KEY</code> set. Demo-grade gate,
          not a full login system — kept in memory for this session only, sent
          as <code className="font-mono">x-api-key</code> on
          approve/reject/policy-update calls.
        </div>
        <div className="mt-2 flex gap-2">
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="Leave blank if the backend is in open demo mode"
            className="flex-1 rounded-md border border-line bg-ink-850 px-3 py-1.5 font-mono text-sm"
          />
          <button
            onClick={applyApiKey}
            className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-ink-800"
          >
            Apply
          </button>
        </div>
      </Card>

      <Card className="divide-y divide-line-soft">
        {Object.entries(FIELD_META).map(([key, meta]) => (
          <div
            key={key}
            className="flex items-center justify-between gap-4 p-4"
          >
            <div>
              <div className="text-sm font-medium">{meta.label}</div>
              <div className="mt-0.5 text-xs text-text-tertiary">
                {meta.help}
              </div>
            </div>
            {meta.type === "boolean" ? (
              <button
                onClick={() => update(key, !policy[key])}
                className={`h-6 w-11 shrink-0 rounded-full transition-colors ${policy[key] ? "bg-ai" : "bg-ink-800"}`}
              >
                <span
                  className={`block h-5 w-5 translate-x-0.5 rounded-full bg-white transition-transform ${policy[key] ? "translate-x-[22px]" : ""}`}
                />
              </button>
            ) : (
              <input
                type="number"
                step={meta.step || 1}
                value={policy[key]}
                onChange={(e) => update(key, Number(e.target.value))}
                className="w-28 shrink-0 rounded-md border border-line bg-ink-850 px-3 py-1.5 text-right font-mono text-sm"
              />
            )}
          </div>
        ))}
      </Card>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-ai px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save policy"}
        </button>
        {saved && (
          <span className="text-sm text-recover">
            ✓ Saved — applies to the next recovery decision.
          </span>
        )}
      </div>
    </div>
  );
}
