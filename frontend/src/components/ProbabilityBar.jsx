export function ProbabilityBar({ value, label }) {
  const pct = Math.round((value ?? 0) * 100);
  const tier = pct >= 70 ? "HIGH" : pct >= 40 ? "MEDIUM" : "LOW";
  const color = pct >= 70 ? "bg-recover" : pct >= 40 ? "bg-risk" : "bg-block";
  return (
    <div>
      {label && (
        <div className="text-xs uppercase tracking-wide text-text-tertiary">
          {label}
        </div>
      )}
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-mono text-2xl font-semibold">{pct}%</span>
        <span
          className={`text-xs font-medium ${pct >= 70 ? "text-recover" : pct >= 40 ? "text-risk" : "text-block"}`}
        >
          {tier}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
