import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { api } from "../lib/api";
import { Card, formatINR } from "../components/ui";

export default function Analytics() {
  const [modelEval, setModelEval] = useState(null);
  const [evalRun, setEvalRun] = useState(null);
  const [evalRunError, setEvalRunError] = useState(null);
  const [live, setLive] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadEvalRun = () => {
    api
      .evaluationRunsLatest()
      .then((r) => {
        setEvalRun(r);
        setEvalRunError(null);
      })
      .catch((e) => setEvalRunError(e.message));
  };

  useEffect(() => {
    api.analyticsRecovery().then((r) => {
      setModelEval(r.model_evaluation);
      setLive(r.live);
    });
    loadEvalRun();
  }, []);

  const createRun = async () => {
    setBusy(true);
    try {
      await api.createEvaluationRun();
      loadEvalRun();
    } catch (e) {
      setEvalRunError(e.message);
    }
    setBusy(false);
  };

  const reRunExperiment = async () => {
    setBusy(true);
    try {
      await api.runEvaluation();
      loadEvalRun();
    } catch (e) {
      setEvalRunError(e.message);
    }
    setBusy(false);
  };

  if (!modelEval)
    return <div className="text-text-secondary">Loading analytics…</div>;
  if (modelEval.error) {
    return <Card className="p-6 text-block">{modelEval.error}</Card>;
  }

  const cm = modelEval.test_results.confusion_matrix;
  const importance = modelEval.feature_importance || [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Analytics</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Two distinct sources of truth, never blended: what's happening in the
          live case store, and how the model performs on data it never saw.
        </p>
      </div>

      <div className="flex gap-2">
        <span className="rounded-full bg-ai-soft px-3 py-1 text-xs font-medium text-ai">
          LIVE OPERATIONS
        </span>
        <span className="text-xs text-text-tertiary self-center">
          — current case store, updates as cases are created/resolved
        </span>
      </div>
      {live && (
        <Card className="p-5">
          <div className="grid grid-cols-4 gap-4 text-sm">
            <Stat label="Cases in store" value={live.cases_analyzed} />
            <Stat
              label="Revenue at risk (live)"
              value={formatINR(live.revenue_at_risk)}
            />
            <Stat
              label="Revenue recovered (live)"
              value={formatINR(live.revenue_recovered)}
              accent="text-recover"
            />
            <Stat
              label="Recovery rate (live)"
              value={`${live.recovery_rate}%`}
            />
          </div>
        </Card>
      )}

      <div className="flex gap-2">
        <span className="rounded-full bg-recover-soft px-3 py-1 text-xs font-medium text-recover">
          BATCH EVALUATION
        </span>
        <span className="text-xs text-text-tertiary self-center">
          — reproducible, held-out test set (seed=42,{" "}
          {modelEval.business_metrics.cases_evaluated} cases), never mixed with
          live numbers above
        </span>
      </div>

      <Card className="p-5">
        <h2 className="mb-4 font-display text-base font-semibold">
          Model Performance — {modelEval.chosen_model}
        </h2>
        <div className="grid grid-cols-4 gap-4 text-sm">
          <Stat label="Precision" value={modelEval.test_results.precision} />
          <Stat label="Recall" value={modelEval.test_results.recall} />
          <Stat label="F1" value={modelEval.test_results.f1} />
          <Stat label="ROC-AUC" value={modelEval.test_results.roc_auc} />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-5">
          <h2 className="mb-4 font-display text-base font-semibold">
            Confusion Matrix (held-out test)
          </h2>
          <ConfusionMatrix cm={cm} />
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 font-display text-base font-semibold">
            Feature Importance
          </h2>
          <p className="mb-2 text-xs text-text-tertiary">
            {modelEval.chosen_model === "logistic_regression"
              ? "Normalized absolute coefficient magnitude from the trained model."
              : "Normalized impurity-based importance from the trained model."}
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={importance} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#232a38"
                horizontal={false}
              />
              <XAxis type="number" stroke="#8891a3" fontSize={11} />
              <YAxis
                dataKey="feature"
                type="category"
                stroke="#8891a3"
                fontSize={10}
                width={140}
              />
              <Tooltip
                contentStyle={{
                  background: "#171c27",
                  border: "1px solid #232a38",
                }}
              />
              <Bar dataKey="importance" radius={[0, 3, 3, 0]}>
                {importance.map((_, i) => (
                  <Cell key={i} fill="#6c7cff" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold">
            Evaluation Run — persisted, not read from a static file
          </h2>
          <div className="flex gap-2">
            <button
              onClick={createRun}
              disabled={busy}
              className="rounded-md border border-line px-3 py-1.5 text-xs hover:bg-ink-800 disabled:opacity-50"
            >
              {busy ? "Working…" : "Persist run from current model"}
            </button>
            <button
              onClick={reRunExperiment}
              disabled={busy}
              className="rounded-md bg-ai px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Re-executing…" : "Re-run experiment now"}
            </button>
          </div>
        </div>

        {evalRunError && (
          <div className="rounded-md border border-line-soft bg-ink-850 p-4 text-sm text-text-tertiary">
            No evaluation run recorded yet. Click "Persist run from current
            model" for a fast persist of the existing trained model's results,
            or "Re-run experiment now" to genuinely regenerate the dataset and
            retrain from scratch (takes longer, proves reproducibility fresh).
          </div>
        )}

        {evalRun && !evalRunError && (
          <>
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-risk-soft px-2.5 py-1 font-mono text-risk">
                {evalRun.baseline.revenue_label}
              </span>
              <span className="text-text-tertiary">
                — this is a batch simulation, not provider-backed money. See
                docs/evaluation.md.
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-text-tertiary">
                  <th className="py-2 pr-4 font-medium">Metric</th>
                  <th className="py-2 pr-4 font-medium">Value</th>
                  <th className="py-2 font-medium">Run ID</th>
                </tr>
              </thead>
              <tbody>
                <Row
                  label={`Baseline (${evalRun.baseline.strategy}) recovered`}
                  value={formatINR(
                    evalRun.baseline.revenue_recovered_paise / 100,
                  )}
                  tag={evalRun.baseline.evaluation_run_id}
                />
                <Row
                  label={`RecoverAI (${evalRun.recoverai.strategy}) recovered`}
                  value={formatINR(
                    evalRun.recoverai.revenue_recovered_paise / 100,
                  )}
                  tag={evalRun.recoverai.evaluation_run_id}
                />
                <Row
                  label="Incremental simulated recovery"
                  value={formatINR(evalRun.incremental_revenue)}
                  tag="DERIVED"
                />
                <Row
                  label="Relative lift"
                  value={`${evalRun.relative_lift_pct}%`}
                  tag="DERIVED"
                />
              </tbody>
            </table>
            <p className="mt-3 text-xs text-text-tertiary">
              {evalRun.note} Methodology:{" "}
              {evalRun.recoverai.methodology_version}. Evaluated{" "}
              {evalRun.recoverai.cases_evaluated} cases, seed{" "}
              {evalRun.recoverai.seed}, model {evalRun.recoverai.model_version}.
              Run recorded at{" "}
              {new Date(evalRun.recoverai.created_at).toLocaleString()}.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

function ConfusionMatrix({ cm }) {
  const [[tn, fp], [fn, tp]] = cm.matrix;
  const cells = [
    {
      label: "True Negative",
      value: tn,
      sub: "predicted not-recoverable, actually not",
      color: "bg-ink-800",
    },
    {
      label: "False Positive",
      value: fp,
      sub: "predicted recoverable, actually not",
      color: "bg-block-soft",
    },
    {
      label: "False Negative",
      value: fn,
      sub: "predicted not-recoverable, actually was",
      color: "bg-risk-soft",
    },
    {
      label: "True Positive",
      value: tp,
      sub: "predicted recoverable, correct",
      color: "bg-recover-soft",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {cells.map((c) => (
        <div key={c.label} className={`rounded-md p-4 ${c.color}`}>
          <div className="font-mono text-2xl font-semibold">{c.value}</div>
          <div className="mt-1 text-xs font-medium">{c.label}</div>
          <div className="text-xs text-text-tertiary">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

function Row({ label, value, tag }) {
  const tagColor =
    tag === "MEASURED"
      ? "text-recover bg-recover-soft"
      : tag === "MODELED_ASSUMPTION"
        ? "text-risk bg-risk-soft"
        : "text-ai bg-ai-soft";
  return (
    <tr className="border-b border-line-soft last:border-0">
      <td className="py-2.5 pr-4 text-text-secondary">{label}</td>
      <td className="py-2.5 pr-4 font-mono">{value}</td>
      <td className="py-2.5">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${tagColor}`}
        >
          {tag}
        </span>
      </td>
    </tr>
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
