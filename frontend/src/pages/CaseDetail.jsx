import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { Card, StatusBadge, ActorBadge, formatINR } from "../components/ui";
import { PolicyGateStrip } from "../components/PolicyGateStrip";
import { ProbabilityBar } from "../components/ProbabilityBar";

export default function CaseDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [audit, setAudit] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setError(null);
    api
      .caseDetail(id)
      .then(setData)
      .catch((e) => setError(e.message));
    api
      .caseAudit(id)
      .then(setAudit)
      .catch(() => {});
  };

  useEffect(load, [id]);

  const handleApprove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.approve(id);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const handleReject = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.reject(id);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <Card className="p-6 text-block">Error: {error}</Card>;
  if (!data) return <div className="text-text-secondary">Loading case…</div>;

  const { case: c, transaction } = data;
  const policyAudit = [...audit]
    .reverse()
    .find((e) => e.metadata && e.metadata.policyTriggered !== undefined);
  const policyTriggered = policyAudit?.metadata?.policyTriggered;
  const verificationAudit = [...audit]
    .reverse()
    .find((e) => e.event === "PAYMENT_VERIFICATION");
  const actionAudit = [...audit]
    .reverse()
    .find((e) => e.event === "RECOVERY_ACTION_EXECUTED");
  const approvalAudit = [...audit]
    .reverse()
    .find((e) => e.event === "APPROVAL_GRANTED");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-mono text-text-tertiary">
            CASE {c.case_id}
          </div>
          <h1 className="font-display text-2xl font-semibold">
            {c.customer_id}
          </h1>
        </div>
        <StatusBadge status={c.current_status} />
      </div>

      {c.current_status === "RECOVERED" && (
        <Card className="border-recover/40 bg-recover-soft/40 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-display text-lg font-semibold text-recover">
              ✓ PAYMENT RECOVERED
            </div>
            {verificationAudit?.metadata?.mode && (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-mono ${verificationAudit.metadata.mode.includes("SIMULATED") ? "bg-risk-soft text-risk" : "bg-recover-soft text-recover"}`}
              >
                {verificationAudit.metadata.mode.includes("SIMULATED")
                  ? "DEMO SIMULATION"
                  : "RAZORPAY TEST MODE"}
              </span>
            )}
          </div>
          <div className="mt-1 font-mono text-2xl">{formatINR(c.amount)}</div>
          <div className="mt-1 text-sm text-text-secondary">
            Verified{" "}
            {c.policy_status === "ALLOWED"
              ? "through the automated recovery workflow"
              : "after human approval"}{" "}
            · case automatically closed.
          </div>
        </Card>
      )}
      {(c.current_status === "STOPPED" || c.current_status === "ESCALATED") && (
        <Card className="border-block/40 bg-block-soft/40 p-5">
          <div className="font-display text-lg font-semibold text-block">
            {c.current_status === "ESCALATED"
              ? "RECOVERY STOPPED — ESCALATED TO HUMAN"
              : "RECOVERY STOPPED"}
          </div>
          <div className="mt-1 text-sm text-text-secondary">
            {c.attempt_count >= 3
              ? "Retry limit reached. No further automated attempts will be made."
              : "Automated recovery was blocked by policy."}
          </div>
          <div className="mt-2 text-xs text-text-tertiary">
            Next step:{" "}
            {c.current_status === "ESCALATED"
              ? "human review / follow-up is required"
              : "case closed, no further action"}
            .
          </div>
        </Card>
      )}

      <Card className="border-ai/40 p-5">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-text-tertiary">
              Recovery decision path
            </div>
            <h2 className="mt-1 font-display text-lg font-semibold">
              From payment failure to verified outcome
            </h2>
          </div>
          <StatusBadge status={c.current_status} />
        </div>
        <div className="grid gap-2 md:grid-cols-6">
          <DecisionStep label="Payment failed" value={c.transaction_id} />
          <DecisionStep label="Diagnosis" value={c.root_cause} />
          <DecisionStep
            label="Prediction"
            value={c.recovery_probability == null ? "—" : `${c.recovery_probability}`}
          />
          <DecisionStep
            label="Policy"
            value={c.policy_status}
            detail={approvalAudit ? "Human approval granted" : undefined}
          />
          <DecisionStep
            label="Action"
            value={actionAudit ? c.recommended_action : "Not executed"}
            detail={actionAudit?.reason}
          />
          <DecisionStep
            label="Verification"
            value={verificationAudit?.result || "Not recorded"}
            detail={verificationAudit?.reason}
          />
        </div>
      </Card>

      <LifecycleTimeline audit={audit} />

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wide text-text-tertiary">
            Transaction
          </div>
          <div className="mt-2 font-mono text-2xl font-medium">
            {formatINR(c.amount)}
          </div>
          <dl className="mt-3 space-y-1 text-sm">
            <Row k="Transaction ID" v={c.transaction_id} mono />
            <Row k="Payment method" v={transaction?.payment_method || "—"} />
            <Row k="Attempts so far" v={c.attempt_count} />
          </dl>
        </Card>
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wide text-text-tertiary">
            Revenue Risk
          </div>
          <div className="mt-3">
            <ProbabilityBar
              value={c.recovery_probability}
              label="Recovery probability"
            />
          </div>
          <dl className="mt-4 space-y-1 text-sm">
            <Row k="Risk score" v={c.risk_score} mono />
            <Row k="Root cause" v={c.root_cause} />
          </dl>
        </Card>
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wide text-text-tertiary">
            AI Recommendation
          </div>
          <div className="mt-2 font-display text-xl font-medium text-ai">
            {c.recommended_action}
          </div>
          <dl className="mt-3 space-y-1 text-sm">
            <Row k="Policy status" v={c.policy_status} />
          </dl>
        </Card>
      </div>

      {c.economics && !c.economics.error && (
        <Card className="p-5">
          <div className="mb-3 text-xs uppercase tracking-wide text-text-tertiary">
            Recovery Economics
          </div>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-xs text-text-tertiary">Amount at risk</div>
              <div className="mt-1 font-mono text-lg">
                {formatINR(c.economics.amount_at_risk)}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-tertiary">
                Expected recovery
              </div>
              <div className="mt-1 font-mono text-lg text-recover">
                {formatINR(c.economics.expected_recovery)}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-tertiary">Action cost</div>
              <div className="mt-1 font-mono text-lg text-risk">
                {formatINR(c.economics.action_cost)}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-tertiary">
                Expected net recovery
              </div>
              <div className="mt-1 font-mono text-lg font-semibold">
                {formatINR(c.economics.expected_net_recovery)}
              </div>
            </div>
          </div>
          <div className="mt-3 text-xs text-text-tertiary">
            {c.economics.action_cost_basis}
          </div>
        </Card>
      )}

      {c.evidence && c.evidence.length > 0 && (
        <Card className="p-5">
          <div className="mb-3 text-xs uppercase tracking-wide text-text-tertiary">
            Why RecoverAI chose this
          </div>
          <ul className="space-y-1.5 text-sm">
            {c.evidence.map((e, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 text-recover">✓</span>
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <div className="mb-1 text-xs uppercase tracking-wide text-text-tertiary">
          Policy Gate — decision path
        </div>
        {audit.length === 0 ? (
          <p className="py-2 text-sm text-text-tertiary">
            No live policy decision recorded yet for this seeded case.
          </p>
        ) : (
          <PolicyGateStrip
            policyTriggered={policyTriggered}
            allowed={
              c.policy_status === "ALLOWED" ||
              c.policy_status === "APPROVED_BY_HUMAN"
            }
          />
        )}
      </Card>

      {c.current_status === "AWAITING_APPROVAL" && (
        <Card className="border-risk/40 p-5">
          <div className="mb-3 font-display font-semibold text-risk">
            Human approval required
          </div>
          <p className="mb-4 text-sm text-text-secondary">
            This case exceeded an automated policy bound. Approve to execute the
            recommended action, or reject to stop the case.
          </p>
          <div className="flex gap-3">
            <button
              disabled={busy}
              onClick={handleApprove}
              className="rounded-md bg-recover px-4 py-2 text-sm font-medium text-ink-950 hover:opacity-90 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              disabled={busy}
              onClick={handleReject}
              className="rounded-md border border-line px-4 py-2 text-sm font-medium text-text-secondary hover:bg-ink-800 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <div className="mb-4 font-display text-base font-semibold">
          Audit Trail
        </div>
        {audit.length === 0 ? (
          <div className="rounded-md border border-line-soft bg-ink-850 p-4 text-sm text-text-tertiary">
            No audit events yet. This case was loaded from the seeded batch
            dataset (for dashboard/demo volume) and hasn't been run through the
            live orchestrator. Approve/reject it above, or run a case via Judge
            Mode, to generate a real, timestamped audit trail.
          </div>
        ) : (
          <ol className="space-y-3">
            {audit.map((e) => (
              <li
                key={e.audit_id}
                className="flex items-start gap-4 border-b border-line-soft pb-3 last:border-0"
              >
                <div className="w-32 shrink-0 font-mono text-xs text-text-tertiary">
                  {new Date(e.timestamp).toLocaleTimeString()}
                </div>
                <div className="w-36 shrink-0">
                  <ActorBadge actor={e.actor} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">
                    {e.event.replaceAll("_", " ")}
                  </div>
                  <div className="mt-0.5 text-xs text-text-secondary">
                    {e.reason}
                  </div>
                </div>
                <div
                  className={`shrink-0 font-mono text-xs ${resultColor(e.result)}`}
                >
                  {e.result}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

function resultColor(result) {
  if (["SUCCESS", "OK", "ALLOWED", "CLOSED", "APPROVED"].includes(result))
    return "text-recover";
  if (
    ["BLOCKED", "FAILED", "ESCALATED", "STOPPED", "REJECTED"].includes(result)
  )
    return "text-block";
  return "text-text-tertiary";
}

function Row({ k, v, mono }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-text-tertiary">{k}</dt>
      <dd className={mono ? "font-mono" : ""}>{String(v)}</dd>
    </div>
  );
}

function DecisionStep({ label, value, detail }) {
  return (
    <div className="relative rounded-md border border-line bg-ink-850 p-3">
      <div className="text-xs uppercase tracking-wide text-text-tertiary">{label}</div>
      <div className="mt-2 break-words text-sm font-medium">{value || "—"}</div>
      {detail && <div className="mt-1 text-xs text-text-secondary">{detail}</div>}
    </div>
  );
}

function LifecycleTimeline({ audit }) {
  const events = audit.filter((event) => lifecycleEvent(event.event));
  return (
    <Card className="p-5">
      <div className="mb-4">
        <div className="text-xs uppercase tracking-wide text-text-tertiary">Case lifecycle</div>
        <h2 className="mt-1 font-display text-lg font-semibold">Agent trace</h2>
      </div>
      {events.length === 0 ? (
        <div className="rounded-md border border-line-soft bg-ink-850 p-4 text-sm text-text-tertiary">
          No lifecycle audit events are available for this case yet.
        </div>
      ) : (
        <ol className="space-y-3">
          {events.map((event) => (
            <li key={event.audit_id} className="flex gap-3 border-l border-line pl-4">
              <div className="min-w-28 font-mono text-xs text-text-tertiary">
                {new Date(event.timestamp).toLocaleTimeString()}
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{lifecycleEvent(event.event)}</span>
                  <ActorBadge actor={event.actor} />
                  <span className={`font-mono text-xs ${resultColor(event.result)}`}>{event.result}</span>
                </div>
                <div className="mt-1 text-sm text-text-secondary">{event.reason}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function lifecycleEvent(event) {
  const labels = {
    PAYMENT_FAILURE_DETECTED: "01 / Payment failed",
    ROOT_CAUSE_CLASSIFIED: "02 / Failure diagnosed",
    RECOVERY_PROBABILITY_CALCULATED: "03 / Recovery predicted",
    POLICY_GATE_PASSED: "04 / Policy allowed",
    POLICY_BLOCKED: "04 / Policy blocked",
    AWAITING_HUMAN_APPROVAL: "04 / Human approval required",
    APPROVAL_GRANTED: "05 / Human decision approved",
    REJECTED: "05 / Human decision rejected",
    RECOVERY_ACTION_EXECUTED: "06 / Action executed",
    PAYMENT_VERIFICATION: "07 / Payment verified",
    REVENUE_RECOVERED: "07 / Revenue recovered",
    CASE_CLOSED: "08 / Case closed",
    CASE_ESCALATED: "08 / Case escalated",
    CASE_STOPPED: "08 / Case stopped",
  };
  return labels[event] || null;
}
