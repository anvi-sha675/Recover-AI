import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { api } from "../lib/api";
import { Card, Metric, formatINR } from "../components/ui";
import { LiveAgentActivity } from "../components/LiveAgentActivity";

const PIE_COLORS = [
  "#6c7cff",
  "#22c77a",
  "#f5a623",
  "#ef4b5f",
  "#8891a3",
  "#5c6577",
];
const STATUS_COLORS = {
  RECOVERED: "#22c77a",
  OPEN: "#6c7cff",
  AWAITING_APPROVAL: "#f5a623",
  ESCALATED: "#ef4b5f",
  STOPPED: "#8891a3",
};

export default function CommandCenter() {
  const [live, setLive] = useState(null);
  const [modelEval, setModelEval] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [latestEvent, setLatestEvent] = useState(null);
  const [dataMode, setDataMode] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const loadLive = () => {
      Promise.all([api.analyticsRecovery(), api.recentActivity(1)])
        .then(([analytics, events]) => {
          if (cancelled) return;
          setLive(analytics.live);
          setModelEval(analytics.model_evaluation);
          setLatestEvent(events[0] || null);
          setError(null);
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        });
    };
    loadLive();
    const interval = setInterval(loadLive, 4000);
    api
      .analyticsBaseline()
      .then(setBaseline)
      .catch(() => {});
    api
      .policy()
      .then(setPolicy)
      .catch(() => {});
    api
      .health()
      .then((health) => setDataMode(health))
      .catch(() => {});
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (error) {
    return (
      <Card className="p-6 text-block">
        Couldn't reach the backend API: {error}. Make sure the backend is
        running on port 4000.
      </Card>
    );
  }
  if (!live)
    return <div className="text-text-secondary">Loading dashboard…</div>;

  const rootCauseData = Object.entries(live.by_root_cause || {}).map(
    ([name, value]) => ({ name, value }),
  );
  const statusData = Object.entries(live.by_status || {}).map(
    ([name, value]) => ({ name, value }),
  );

  const bizMetrics = modelEval?.business_metrics;
  const lifecycleStage = getLifecycleStage(live, latestEvent);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.16em] text-recover">
            <span className="h-2 w-2 animate-pulse rounded-full bg-recover" />
            RecoverAI / Agent Online
          </div>
          <h1 className="mt-2 font-display text-2xl font-semibold">
            Autonomous Revenue Recovery Control Center
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Controlled decisions from live cases, policy gates, and verified
            outcomes.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-text-tertiary">
            Verified recovered revenue
          </div>
          <div className="mt-1 font-mono text-4xl font-semibold text-recover">
            {formatINR(live.revenue_recovered)}
          </div>
        </div>
        {dataMode && (
          <div className="text-right text-xs font-mono uppercase tracking-wide text-text-tertiary">
            <div>Data mode: SEEDED DEMO</div>
            <div className="mt-1 text-recover">
              Database:{" "}
              {dataMode.database === "mongo" ? "MONGODB" : "LOCAL FILE"}
            </div>
          </div>
        )}
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold">
              Recovery lifecycle
            </h2>
            <p className="mt-1 text-xs text-text-tertiary">
              The latest audit-backed fleet signal in the guarded recovery
              workflow.
            </p>
          </div>
          <span className="font-mono text-xs uppercase tracking-wide text-ai">
            Current: {lifecycleStage}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          {["DETECT", "DIAGNOSE", "PREDICT", "POLICY", "EXECUTE", "VERIFY"].map(
            (stage, index) => {
              const currentIndex = [
                "DETECT",
                "DIAGNOSE",
                "PREDICT",
                "POLICY",
                "EXECUTE",
                "VERIFY",
              ].indexOf(lifecycleStage);
              return (
                <div key={stage} className="flex items-center gap-2">
                  <div
                    className={`flex-1 rounded-md border px-2 py-3 text-center text-xs font-semibold ${index === currentIndex ? "border-ai bg-ai-soft text-ai" : index < currentIndex ? "border-recover/40 bg-recover-soft text-recover" : "border-line text-text-tertiary"}`}
                  >
                    {stage}
                  </div>
                  {index < 5 && (
                    <span className="hidden text-text-tertiary md:inline">
                      →
                    </span>
                  )}
                </div>
              );
            },
          )}
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-1 flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-recover" />
          <h2 className="font-display text-base font-semibold">
            Live Agent Activity
          </h2>
        </div>
        <p className="mb-3 text-xs text-text-tertiary">
          Real audit events polled from the backend every 4s.
        </p>
        <LiveAgentActivity limit={12} />
      </Card>

      {policy && (
        <Card className="border-risk/40 bg-risk-soft/15 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-mono uppercase tracking-wide text-risk">
                Policy gate
              </div>
              <h2 className="mt-1 font-display text-base font-semibold">
                Safety controls active
              </h2>
            </div>
            <span className="text-xs text-text-secondary">
              AI recommends. Policy decides.
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
            <PolicyCheck
              label="Recovery confidence"
              value={`${Math.round(policy.MIN_RECOVERY_CONFIDENCE * 100)}% minimum`}
            />
            <PolicyCheck
              label="Automated amount"
              value={formatINR(policy.MAX_AUTOMATED_RECOVERY_AMOUNT)}
            />
            <PolicyCheck
              label="Retry limit"
              value={`${policy.MAX_AUTOMATED_RETRIES} attempts`}
            />
            <PolicyCheck
              label="Customer contact"
              value={`${policy.MAX_INTERVENTIONS_PER_CUSTOMER} interventions`}
            />
            <PolicyCheck
              label="High-value actions"
              value={
                policy.HIGH_VALUE_TRANSACTION_REQUIRES_APPROVAL
                  ? "Human approval"
                  : "Policy allowed"
              }
            />
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric
          label="Revenue At Risk (live cases)"
          value={formatINR(live.revenue_at_risk)}
        />
        <Metric
          label="Revenue Recovered (live cases)"
          value={formatINR(live.revenue_recovered)}
          accent="text-recover"
        />
        <Metric
          label="Recovery Rate (live cases)"
          value={`${live.recovery_rate}%`}
        />
        <Metric
          label="Cases Analyzed"
          value={live.cases_analyzed.toLocaleString()}
        />
      </div>

      {live.revenue_recovered_by_mode && (
        <Card className="p-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-text-tertiary">
            Verified Revenue — by execution mode (never blended silently)
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            {Object.entries(live.revenue_recovered_by_mode).map(
              ([mode, amount]) => (
                <div key={mode} className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-mono ${mode === "SEEDED_DEMO" ? "bg-risk-soft text-risk" : "bg-recover-soft text-recover"}`}
                  >
                    {mode}
                  </span>
                  <span className="font-mono">{formatINR(amount)}</span>
                </div>
              ),
            )}
          </div>
          {live.unverified_recovered_claims > 0 && (
            <div className="mt-2 text-xs text-block">
              ⚠ {live.unverified_recovered_claims} case(s) claim RECOVERED
              status with no matching verification record — flagged, not hidden.
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-5 gap-4">
        <Metric
          label="Successful Recoveries"
          value={live.successful_recoveries}
          accent="text-recover"
        />
        <Metric
          label="Active Cases"
          value={live.active_cases}
          accent="text-ai"
        />
        <Metric
          label="Awaiting Approval"
          value={live.awaiting_approval}
          accent="text-risk"
        />
        <Metric
          label="Escalated"
          value={live.escalated_cases}
          accent="text-risk"
        />
        <Metric
          label="Stopped"
          value={live.stopped_cases}
          accent="text-block"
        />
      </div>

      {live.funnel && (
        <Card className="p-5">
          <h2 className="mb-4 font-display text-base font-semibold">
            Recovery Funnel
          </h2>
          <div className="flex items-stretch gap-2">
            {live.funnel.map((step, i) => (
              <div key={step.label} className="flex flex-1 items-center">
                <div className="flex-1 rounded-md border border-line bg-ink-850 p-3 text-center">
                  <div className="font-mono text-xl font-semibold">
                    {step.value.toLocaleString()}
                  </div>
                  <div className="mt-1 text-xs text-text-tertiary">
                    {step.label}
                  </div>
                </div>
                {i < live.funnel.length - 1 && (
                  <div className="mx-1 text-text-tertiary">→</div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {bizMetrics && (
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">
              Held-out evaluation ({bizMetrics.cases_evaluated} test cases ·
              model: {modelEval.chosen_model})
            </h2>
            <span className="text-xs text-text-tertiary">
              From ai-service/metrics.json — computed, not fabricated
            </span>
          </div>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <Stat
              label="Total Revenue At Risk"
              value={formatINR(bizMetrics.total_revenue_at_risk)}
            />
            <Stat
              label="Total Revenue Recovered"
              value={formatINR(bizMetrics.total_revenue_recovered)}
              accent="text-recover"
            />
            <Stat
              label="Recovery Lift vs Baseline"
              value={`${bizMetrics.recovery_lift_vs_baseline_pct}%`}
              accent="text-ai"
            />
            <Stat
              label="Escalation Rate"
              value={`${(bizMetrics.escalation_rate * 100).toFixed(1)}%`}
            />
            <Stat
              label="Intervention Success Rate"
              value={`${(bizMetrics.intervention_success_rate * 100).toFixed(1)}%`}
              accent="text-recover"
            />
            <Stat
              label="Unnecessary Intervention Rate"
              value={`${(bizMetrics.unnecessary_intervention_rate * 100).toFixed(1)}%`}
              accent="text-block"
            />
            <Stat
              label="Model Precision / Recall / F1"
              value={`${modelEval.test_results.precision} / ${modelEval.test_results.recall} / ${modelEval.test_results.f1}`}
            />
            <Stat
              label="ROC-AUC"
              value={modelEval.test_results.roc_auc ?? "n/a"}
            />
          </div>
        </Card>
      )}

      {baseline && !baseline.error && (
        <Card className="p-5">
          <h2 className="mb-4 font-display text-base font-semibold">
            Baseline vs RecoverAI
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={[
                {
                  name: "Baseline\n(blind retry once)",
                  recovered: baseline.baseline.revenue_recovered,
                },
                {
                  name: "RecoverAI\n(diagnosis + policy + escalation)",
                  recovered:
                    baseline.recoverai.revenue_recovered_automated.value +
                    baseline.recoverai.revenue_recovered_via_escalation.value,
                },
              ]}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#232a38"
                vertical={false}
              />
              <XAxis dataKey="name" stroke="#8891a3" fontSize={12} />
              <YAxis stroke="#8891a3" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "#171c27",
                  border: "1px solid #232a38",
                }}
                formatter={(v) => formatINR(v)}
              />
              <Bar dataKey="recovered" fill="#6c7cff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-2 text-xs text-text-tertiary">{baseline.note}</p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-5">
          <h2 className="mb-4 font-display text-base font-semibold">
            Failure Reason Distribution
          </h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={rootCauseData}
                dataKey="value"
                nameKey="name"
                outerRadius={80}
                label={{ fontSize: 10, fill: "#8891a3" }}
              >
                {rootCauseData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 11, color: "#8891a3" }} />
              <Tooltip
                contentStyle={{
                  background: "#171c27",
                  border: "1px solid #232a38",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 font-display text-base font-semibold">
            Case Outcome Distribution
          </h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={statusData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#232a38"
                horizontal={false}
              />
              <XAxis type="number" stroke="#8891a3" fontSize={12} />
              <YAxis
                dataKey="name"
                type="category"
                stroke="#8891a3"
                fontSize={11}
                width={110}
              />
              <Tooltip
                contentStyle={{
                  background: "#171c27",
                  border: "1px solid #232a38",
                }}
              />
              <Bar dataKey="value" fill="#22c77a" radius={[0, 4, 4, 0]}>
                {statusData.map((entry, i) => (
                  <Cell key={i} fill={STATUS_COLORS[entry.name] || "#8891a3"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

function getLifecycleStage(live, latestEvent) {
  if (latestEvent?.event) {
    if (
      latestEvent.event.includes("VERIFICATION") ||
      latestEvent.event.includes("RECOVERED")
    )
      return "VERIFY";
    if (latestEvent.event.includes("ACTION")) return "EXECUTE";
    if (
      latestEvent.event.includes("POLICY") ||
      latestEvent.event.includes("APPROVAL")
    )
      return "POLICY";
    if (latestEvent.event.includes("PROBABILITY")) return "PREDICT";
    if (latestEvent.event.includes("ROOT_CAUSE")) return "DIAGNOSE";
    if (latestEvent.event.includes("PAYMENT_FAILURE")) return "DETECT";
  }
  if (live.successful_recoveries > 0) return "VERIFY";
  if (live.awaiting_approval > 0) return "POLICY";
  if (live.active_cases > 0) return "EXECUTE";
  if (live.cases_analyzed > 0) return "DIAGNOSE";
  return "DETECT";
}

function PolicyCheck({ label, value }) {
  return (
    <div className="border-l border-risk/40 pl-3">
      <div className="text-xs text-text-tertiary">{label}</div>
      <div className="mt-1 font-mono text-risk">{value}</div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div>
      <div className="text-xs text-text-tertiary">{label}</div>
      <div
        className={`mt-1 font-mono text-lg font-medium ${accent || "text-text-primary"}`}
      >
        {value}
      </div>
    </div>
  );
}
