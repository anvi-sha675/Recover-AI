import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, formatINR } from "../components/ui";

export default function ApprovalQueue() {
  const [approvals, setApprovals] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const load = () => api.approvals().then(setApprovals);
  useEffect(() => {
    load();
  }, []);

  const act = async (id, fn) => {
    setBusyId(id);
    await fn(id);
    await load();
    setBusyId(null);
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-semibold">Approval Queue</h1>
        <p className="mt-1 text-sm text-text-secondary">
          High-value or low-confidence cases waiting for a human decision.
        </p>
      </div>

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
                  Approve
                </button>
                <button
                  disabled={busyId === a.case.case_id}
                  onClick={() => act(a.case.case_id, api.reject)}
                  className="rounded-md border border-line px-4 py-2 text-sm font-medium text-text-secondary hover:bg-ink-800 disabled:opacity-50"
                >
                  Reject
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
