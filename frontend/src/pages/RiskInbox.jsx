import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, StatusBadge, formatINR } from "../components/ui";

const FILTERS = [
  { key: "All", status: null },
  { key: "Recovered", status: "RECOVERED" },
  { key: "Open", status: "OPEN" },
  { key: "Awaiting Approval", status: "AWAITING_APPROVAL" },
  { key: "Escalated", status: "ESCALATED" },
  { key: "Stopped", status: "STOPPED" },
];

export default function RiskInbox() {
  const [cases, setCases] = useState([]);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const f = FILTERS.find((x) => x.key === filter);
    const params = {
      sort: "expected_net_recovery",
      ...(f.status ? { status: f.status } : {}),
      ...(search ? { q: search } : {}),
    };
    setLoading(true);
    setError(null);
    api
      .cases(params)
      .then((c) => setCases(c))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filter, search]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-semibold">
          Revenue Risk Inbox
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Sorted by{" "}
          <span className="font-mono text-ai">expected net recovery</span> — the
          best recovery opportunity, not simply the highest risk score.
        </p>
      </div>

      {error && (
        <Card className="border-block/40 p-4 text-sm text-block">{error}</Card>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                filter === f.key
                  ? "bg-ai text-white"
                  : "bg-ink-900 text-text-secondary hover:bg-ink-800"
              }`}
            >
              {f.key}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer, transaction, or case ID…"
          className="w-72 rounded-md border border-line bg-ink-900 px-3 py-1.5 text-sm placeholder:text-text-tertiary"
        />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-text-tertiary">
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Expected Net Recovery</th>
                <th className="px-4 py-3 font-medium">Risk Score</th>
                <th className="px-4 py-3 font-medium">Recovery Prob.</th>
                <th className="px-4 py-3 font-medium">Root Cause</th>
                <th className="px-4 py-3 font-medium">Recommended Action</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-text-tertiary"
                  >
                    Loading cases…
                  </td>
                </tr>
              )}
              {!loading && cases.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <div className="text-text-secondary">
                      No cases match this filter or search.
                    </div>
                    <div className="mt-1 text-xs text-text-tertiary">
                      New revenue-risk events will appear here automatically.
                    </div>
                  </td>
                </tr>
              )}
              {cases.map((c) => (
                <tr
                  key={c.case_id}
                  className="border-b border-line-soft last:border-0 hover:bg-ink-800/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/cases/${c.case_id}`}
                      className="font-medium text-ai hover:underline"
                    >
                      {c.customer_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono">{formatINR(c.amount)}</td>
                  <td className="px-4 py-3 font-mono text-recover">
                    {c.economics
                      ? formatINR(c.economics.expected_net_recovery)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono">{c.risk_score}</td>
                  <td className="px-4 py-3 font-mono">
                    {c.recovery_probability}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {c.root_cause}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {c.recommended_action}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.current_status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
