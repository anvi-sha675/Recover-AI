import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, formatINR } from "../components/ui";

export default function ApprovalQueue() {
  const [approvals, setApprovals] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const [pending, policyConfig] = await Promise.all([
        api.approvals(),
        api.policy(),
      ]);
      setApprovals(pending);
      setPolicy(policyConfig);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const act = async (id, fn) => {
    setBusyId(id);
    setError(null);
    try {
      await fn(id);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-xs font-mono uppercase tracking-[0.16em] text-risk">
          CONTROL / HUMAN-IN-THE-LOOP
        </div>
        <h1 className="mt-2 font-display text-2xl font-semibold">
          Approval Queue
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          The agent is paused here. Nothing executes until a reviewer decides.
        </p>
      </div>

      {error && (
        <Card className="border-block/40 p-4 text-sm text-block">{error}</Card>
      )}

      {policy && approvals.length > 0 && (
        <Card className="border-risk/40 bg-risk-soft/20 p-4">
          <div className="text-xs font-mono uppercase tracking-wide text-risk">
            Policy gate context
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <PolicyFact
              label="Automated amount limit"
              value={formatINR(policy.MAX_AUTOMATED_RECOVERY_AMOUNT)}
            />
            <PolicyFact
              label="Minimum confidence"
              value={`${Math.round(policy.MIN_RECOVERY_CONFIDENCE * 100)}%`}
            />
            <PolicyFact
              label="Maximum retries"
              value={policy.MAX_AUTOMATED_RETRIES}
            />
            <PolicyFact
              label="Customer intervention cap"
              value={policy.MAX_INTERVENTIONS_PER_CUSTOMER}
            />
          </div>
        </Card>
      )}

      {approvals.length === 0 && (
        <Card className="p-8 text-center text-text-tertiary">
          Nothing waiting for approval right now.
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {approvals.map((a) => (
          <Card key={a.approval_id} className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <Link
                  to={`/cases/${a.case.case_id}`}
                  className="font-display text-lg font-medium text-ai hover:underline"
                >
                  {a.case.customer_id}
                </Link>
                <div className="mt-1 font-mono text-2xl">
                  {formatINR(a.case.amount)}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={busyId === a.case.case_id}
                  onClick={() => act(a.case.case_id, api.approve)}
                  className="rounded-md bg-recover px-4 py-2 text-sm font-medium text-ink-950 hover:opacity-90 disabled:opacity-50"
                >
                  APPROVE &amp; EXECUTE
                </button>
                <button
                  disabled={busyId === a.case.case_id}
                  onClick={() => act(a.case.case_id, api.reject)}
                  className="rounded-md border border-line px-4 py-2 text-sm font-medium text-text-secondary hover:bg-ink-800 disabled:opacity-50"
                >
                  REJECT / ESCALATE
                </button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-4 border-t border-line-soft pt-4 text-sm">
              <Info label="Risk score" value={a.case.risk_score} />
              <Info
                label="Recovery probability"
                value={a.case.recovery_probability}
              />
              <Info label="Root cause" value={a.case.root_cause} />
              <Info
                label="Recommended action"
                value={a.case.recommended_action}
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-line-soft pt-4 text-sm md:grid-cols-4">
              <Info
                label="Expected recovery"
                value={formatINR(a.case.economics?.expected_recovery)}
              />
              <Info
                label="Expected net recovery"
                value={formatINR(a.case.economics?.expected_net_recovery)}
              />
              <Info
                label="Attempts"
                value={`${a.case.attempt_count} / ${policy?.MAX_AUTOMATED_RETRIES ?? "—"}`}
              />
              <Info
                label="Triggered by"
                value={
                  a.case.policy_status === "REQUIRES_APPROVAL"
                    ? "Policy approval gate"
                    : a.case.policy_status
                }
              />
            </div>
            {a.case.evidence?.length > 0 && (
              <div className="mt-4 border-t border-line-soft pt-4 text-sm text-text-secondary">
                <div className="text-xs uppercase tracking-wide text-text-tertiary">
                  Why the agent recommended this
                </div>
                <ul className="mt-2 space-y-1">
                  {a.case.evidence.slice(0, 3).map((evidence) => (
                    <li key={evidence}>• {evidence}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <div className="text-xs text-text-tertiary">{label}</div>
      <div className="mt-1 font-mono">{String(value)}</div>
    </div>
  );
}

function PolicyFact({ label, value }) {
  return (
    <div>
      <div className="text-xs text-text-tertiary">{label}</div>
      <div className="mt-1 font-mono text-risk">{value}</div>
    </div>
  );
}
