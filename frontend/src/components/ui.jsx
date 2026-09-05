export function formatINR(amount) {
  if (amount == null) return "—";
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)}L`;
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

const STATUS_STYLES = {
  RECOVERED: {
    bg: "bg-recover-soft",
    text: "text-recover",
    dot: "bg-recover",
    label: "Recovered",
  },
  OPEN: { bg: "bg-ai-soft", text: "text-ai", dot: "bg-ai", label: "Open" },
  AWAITING_APPROVAL: {
    bg: "bg-risk-soft",
    text: "text-risk",
    dot: "bg-risk",
    label: "Awaiting approval",
  },
  ESCALATED: {
    bg: "bg-risk-soft",
    text: "text-risk",
    dot: "bg-risk",
    label: "Escalated",
  },
  STOPPED: {
    bg: "bg-block-soft",
    text: "text-block",
    dot: "bg-block",
    label: "Stopped",
  },
  FAILED: {
    bg: "bg-block-soft",
    text: "text-block",
    dot: "bg-block",
    label: "Failed",
  },
};

export function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || {
    bg: "bg-ink-800",
    text: "text-text-secondary",
    dot: "bg-text-tertiary",
    label: status,
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.bg} ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function ActorBadge({ actor }) {
  const colors = {
    AI_AGENT: "text-ai",
    POLICY_ENGINE: "text-risk",
    HUMAN_REVIEWER: "text-recover",
    SYSTEM: "text-text-secondary",
    CUSTOMER: "text-text-secondary",
  };
  return (
    <span
      className={`font-mono text-xs uppercase tracking-wide ${colors[actor] || "text-text-secondary"}`}
    >
      {actor}
    </span>
  );
}

export function Card({ children, className = "" }) {
  return (
    <div className={`rounded-lg border border-line bg-ink-900 ${className}`}>
      {children}
    </div>
  );
}

export function Metric({ label, value, sublabel, accent }) {
  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-wide text-text-tertiary">
        {label}
      </div>
      <div
        className={`mt-2 font-display text-3xl font-semibold ${accent || "text-text-primary"}`}
      >
        {value}
      </div>
      {sublabel && (
        <div className="mt-1 text-xs text-text-secondary">{sublabel}</div>
      )}
    </Card>
  );
}
