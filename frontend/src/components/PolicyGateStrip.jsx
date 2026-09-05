const GATES = [
  { key: "MIN_RECOVERY_CONFIDENCE", label: "Confidence" },
  { key: "MAX_AUTOMATED_RECOVERY_AMOUNT", label: "Amount limit" },
  { key: "MAX_AUTOMATED_RETRIES", label: "Retry limit" },
  { key: "MAX_INTERVENTIONS_PER_CUSTOMER", label: "Customer cap" },
  { key: "HIGH_VALUE_TRANSACTION_REQUIRES_APPROVAL", label: "High value" },
];

export function PolicyGateStrip({ policyTriggered, allowed }) {
  const blockedIndex = policyTriggered
    ? GATES.findIndex((g) => g.key === policyTriggered)
    : -1;

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-2">
      {GATES.map((gate, i) => {
        let state = "clear"; // clear | blocked | pending
        if (blockedIndex !== -1) {
          if (i < blockedIndex) state = "clear";
          else if (i === blockedIndex) state = "blocked";
          else state = "pending";
        } else if (!allowed) {
          state = "pending";
        }
        const styles = {
          clear: "border-recover/40 bg-recover-soft text-recover",
          blocked: "border-block bg-block-soft text-block",
          pending: "border-line bg-ink-850 text-text-tertiary",
        }[state];
        return (
          <div key={gate.key} className="flex items-center">
            <div
              className={`flex flex-col items-center justify-center rounded-md border px-3 py-2 text-center ${styles}`}
            >
              <span className="text-[10px] font-mono uppercase tracking-wide">
                {gate.label}
              </span>
              <span className="mt-0.5 text-xs">
                {state === "clear"
                  ? "✓ cleared"
                  : state === "blocked"
                    ? "✕ stopped here"
                    : "—"}
              </span>
            </div>
            {i < GATES.length - 1 && <div className="h-px w-4 bg-line" />}
          </div>
        );
      })}
    </div>
  );
}
