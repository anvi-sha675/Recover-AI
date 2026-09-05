import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../lib/api";
import { Card, StatusBadge, formatINR } from "../components/ui";

const STAGES = ["DETECT", "DIAGNOSE", "PREDICT", "POLICY", "EXECUTE", "VERIFY"];

const DEMO_CASES = [
  {
    key: "A",
    title: "Case A — Successful Recovery",
    description: "₹4,999 · temporary payment failure · high confidence",
    transaction: {
      transaction_id: "txn_demo_a_0",
      amount: 4999,
      customer_id: "cust_demo_a",
      customer_name: "Aarav Mehta",
      customer_email: "aarav@example.com",
      failure_reason: "TEMPORARY_PAYMENT_FAILURE",
      payment_method: "upi",
      previous_attempts: 0,
      previous_successes: 7,
      customer_activity_days: 1,
      time_since_failure_hours: 1,
      checkout_duration_sec: 90,
      subscription_status: "none",
      days_overdue: 0,
      checkout_completed: true,
    },
  },
  {
    key: "B",
    title: "Case B — Human Approval Gate",
    description: "₹35,000 · high-value transaction · requires sign-off",
    transaction: {
      transaction_id: "txn_demo_b_4",
      amount: 35000,
      customer_id: "cust_demo_b",
      customer_name: "Priya Sharma",
      customer_email: "priya@example.com",
      failure_reason: "TEMPORARY_PAYMENT_FAILURE",
      payment_method: "card",
      previous_attempts: 0,
      previous_successes: 7,
      customer_activity_days: 1,
      time_since_failure_hours: 1,
      checkout_duration_sec: 90,
      subscription_status: "none",
      days_overdue: 0,
      checkout_completed: true,
    },
    requiresApproval: true,
  },
  {
    key: "C",
    title: "Case C — Graceful Failure",
    description:
      "3 automated retries fail → agent stops → escalates (never a 4th retry)",
    transaction: {
      transaction_id: "txn_demo_fail_6",
      amount: 3000,
      customer_id: "cust_demo_fail",
      failure_reason: "TEMPORARY_PAYMENT_FAILURE",
      payment_method: "card",
      previous_attempts: 0,
      previous_successes: 7,
      customer_activity_days: 1,
      time_since_failure_hours: 1,
      checkout_duration_sec: 90,
      subscription_status: "none",
      days_overdue: 0,
      checkout_completed: true,
    },
    repeat: 4,
  },
];

export default function JudgeMode() {
  const [running, setRunning] = useState(false);
  const [activeStage, setActiveStage] = useState(-1);
  const [results, setResults] = useState({});
  const [pendingApproval, setPendingApproval] = useState(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [runError, setRunError] = useState(null);
  const approvalResolver = useRef(null);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const runAll = async () => {
    setRunning(true);
    setResults({});
    setRunError(null);
    try {
      for (const demo of DEMO_CASES) {
        setActiveStage(0);
        await sleep(350);

        let result, caseId;
        if (demo.repeat) {
          const attemptHistory = [];
          for (let i = 1; i <= demo.repeat; i++) {
            setActiveStage(Math.min(1 + i, STAGES.length - 1));
            result = await api.execute({
              transaction: demo.transaction,
              existingCaseId: caseId,
            });
            caseId = result.case.case_id;
            if (result.executed) {
              attemptHistory.push({
                attempt: i,
                status: result.case.current_status,
              });
            }
            result = { ...result, attemptHistory };
            await sleep(300);
          }
        } else {
          for (let s = 1; s < STAGES.length - 1; s++) {
            setActiveStage(s);
            await sleep(200);
          }
          result = await api.execute({ transaction: demo.transaction });
          if (demo.requiresApproval) {
            setResults((r) => ({
              ...r,
              [demo.key]: { ...result, pendingApproval: true },
            }));
            setPendingApproval({ key: demo.key, caseId: result.case.case_id });
            const approvalDecision = await new Promise((resolve, reject) => {
              approvalResolver.current = { resolve, reject };
            });
            setPendingApproval(null);
            result = approvalDecision.result;
          }
        }
        setActiveStage(STAGES.length - 1);
        setResults((r) => ({ ...r, [demo.key]: result }));
        await sleep(500);
      }
    } catch (error) {
      setRunError(
        error.message || "The recovery simulation stopped unexpectedly.",
      );
    } finally {
      setPendingApproval(null);
      approvalResolver.current = null;
      setApprovalBusy(false);
      setActiveStage(-1);
      setRunning(false);
    }
  };

  const approvePendingCase = async () => {
    if (!pendingApproval || !approvalResolver.current) return;
    setApprovalBusy(true);
    try {
      const result = await api.approve(pendingApproval.caseId);
      const resolver = approvalResolver.current;
      approvalResolver.current = null;
      resolver?.resolve({ result });
    } catch (error) {
      const resolver = approvalResolver.current;
      approvalResolver.current = null;
      resolver?.reject(error);
    } finally {
      setApprovalBusy(false);
    }
  };

  const rejectPendingCase = async () => {
    if (!pendingApproval || !approvalResolver.current) return;
    setApprovalBusy(true);
    try {
      const rejection = await api.reject(pendingApproval.caseId);
      const detail = await api.caseDetail(pendingApproval.caseId);
      const resolver = approvalResolver.current;
      approvalResolver.current = null;
      resolver?.resolve({
        result: { ...rejection, case: detail.case },
      });
    } catch (error) {
      const resolver = approvalResolver.current;
      approvalResolver.current = null;
      resolver?.reject(error);
    } finally {
      setApprovalBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-mono uppercase tracking-[0.16em] text-ai">
            DEMO CONTROL / PROVE THE AGENT
          </div>
          <h1 className="mt-2 font-display text-2xl font-semibold">
            Prove the agent
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Three deterministic scenarios demonstrate autonomy, human oversight,
            and safe failure.
          </p>
          <div className="mt-3 text-xs font-mono text-text-tertiary">
            AI → POLICY → HUMAN → EXECUTION → VERIFICATION
          </div>
        </div>
        <button
          onClick={runAll}
          disabled={running}
          className="rounded-md bg-ai px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {running ? "Running simulation…" : "Run Recovery Simulation"}
        </button>
      </div>

      {running && (
        <Card className="p-5">
          <div className="flex flex-wrap gap-2">
            {STAGES.map((s, i) => (
              <div
                key={s}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  i === activeStage
                    ? "border-ai bg-ai-soft text-ai"
                    : i < activeStage
                      ? "border-recover/40 bg-recover-soft text-recover"
                      : "border-line text-text-tertiary"
                }`}
              >
                {s}
              </div>
            ))}
          </div>
        </Card>
      )}

      {pendingApproval && (
        <Card className="border-risk/60 bg-risk-soft/30 p-6">
          <div className="text-xs font-mono font-semibold uppercase tracking-[0.18em] text-risk">
            AGENT PAUSED
          </div>
          <h2 className="mt-2 font-display text-2xl font-semibold text-text-primary">
            HUMAN APPROVAL REQUIRED
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Case B reached the high-value policy gate. No recovery action has
            been executed; the workflow is waiting for your decision.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={approvePendingCase}
              disabled={approvalBusy}
              className="rounded-md bg-recover px-4 py-2.5 text-sm font-semibold text-ink-950 hover:opacity-90 disabled:opacity-50"
            >
              APPROVE &amp; EXECUTE
            </button>
            <button
              onClick={rejectPendingCase}
              disabled={approvalBusy}
              className="rounded-md border border-block/60 px-4 py-2.5 text-sm font-semibold text-block hover:bg-block-soft disabled:opacity-50"
            >
              REJECT / ESCALATE
            </button>
          </div>
        </Card>
      )}

      {runError && (
        <Card className="border-block/40 p-4 text-sm text-block">
          Simulation stopped safely: {runError}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {DEMO_CASES.map((demo) => {
          const r = results[demo.key];
          return (
            <Card
              key={demo.key}
              className={`p-5 ${pendingApproval?.key === demo.key ? "border-risk/60 ring-1 ring-risk/30" : ""}`}
            >
              <div className="text-xs uppercase tracking-wide text-text-tertiary">
                {demo.title}
              </div>
              <div className="mt-1 text-sm text-text-secondary">
                {demo.description}
              </div>
              <AnimatePresence mode="wait">
                {r && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 flex flex-col gap-2 border-t border-line-soft pt-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xl">
                        {formatINR(demo.transaction.amount)}
                      </span>
                      <StatusBadge status={r.case.current_status} />
                    </div>
                    <div className="text-xs text-text-tertiary">
                      Attempts: {r.case.attempt_count} · Recovery probability:{" "}
                      {r.case.recovery_probability}
                    </div>
                    {r.pendingApproval &&
                      r.case.current_status === "AWAITING_APPROVAL" && (
                        <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-risk">
                          Paused at human approval gate
                        </div>
                      )}
                    {r.approvalError && (
                      <div className="mt-2 text-xs text-block">
                        {r.approvalError}
                      </div>
                    )}
                    {r.attemptHistory && (
                      <div className="mt-3 border-t border-line-soft pt-3">
                        <div className="text-xs uppercase tracking-wide text-text-tertiary">
                          Retry lifecycle
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {r.attemptHistory.map((attempt) => (
                            <span
                              key={attempt.attempt}
                              className="rounded-md border border-risk/40 px-2 py-1 text-xs text-risk"
                            >
                              Retry {attempt.attempt}: executed
                            </span>
                          ))}
                        </div>
                        {r.case.current_status === "ESCALATED" && (
                          <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-block">
                            MAX RETRIES REACHED · AUTOMATION STOPPED · CASE
                            ESCALATED
                            <div className="mt-1 font-normal normal-case tracking-normal text-text-secondary">
                              No fourth retry was executed.
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <a
                      href={`/cases/${r.case.case_id}`}
                      className="mt-1 text-xs text-ai hover:underline"
                    >
                      View full case + audit trail →
                    </a>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
