import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../lib/api";
import { Card, StatusBadge, formatINR } from "../components/ui";

const STAGES = [
  "Payment failure detected",
  "Root cause diagnosed",
  "Recovery probability calculated",
  "Recommended action selected",
  "Policy gate evaluated",
  "Razorpay Test Mode action",
  "Payment verified",
  "Audit trail recorded",
];

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

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const runAll = async () => {
    setRunning(true);
    setResults({});
    for (const demo of DEMO_CASES) {
      setActiveStage(0);
      await sleep(350);

      let result, caseId;
      if (demo.repeat) {
        for (let i = 1; i <= demo.repeat; i++) {
          setActiveStage(Math.min(1 + i, STAGES.length - 1));
          result = await api.execute({
            transaction: demo.transaction,
            existingCaseId: caseId,
          });
          caseId = result.case.case_id;
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
          await sleep(600);
          result = await api.approve(result.case.case_id);
        }
      }
      setActiveStage(STAGES.length - 1);
      setResults((r) => ({ ...r, [demo.key]: result }));
      await sleep(500);
    }
    setActiveStage(-1);
    setRunning(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Judge Mode</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Three deterministic, reproducible cases proving success, governance,
            and reliability.
          </p>
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

      <div className="grid grid-cols-3 gap-4">
        {DEMO_CASES.map((demo) => {
          const r = results[demo.key];
          return (
            <Card key={demo.key} className="p-5">
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
