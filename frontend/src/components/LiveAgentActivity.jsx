import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { ActorBadge, formatINR } from "./ui";

export function LiveAgentActivity({ limit = 12 }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const knownIds = useRef(new Set());

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      api
        .recentActivity(limit)
        .then((data) => {
          if (cancelled) return;
          data.forEach((e) => knownIds.current.add(e.audit_id));
          setEvents(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };
    poll();
    const interval = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [limit]);

  if (loading) {
    return (
      <div className="text-sm text-text-tertiary">
        Loading recent agent activity…
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div className="text-sm text-text-tertiary">
        No agent activity yet. Run Judge Mode or execute a recovery to see live
        events here.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {events.map((e) => (
        <div
          key={e.audit_id}
          className="flex items-center gap-3 border-b border-line-soft py-2 text-sm last:border-0"
        >
          <span className="w-20 shrink-0 font-mono text-xs text-text-tertiary">
            {new Date(e.timestamp).toLocaleTimeString()}
          </span>
          <span className="w-24 shrink-0">
            <ActorBadge actor={e.actor} />
          </span>
          <span className="flex-1 truncate">
            {e.event.replaceAll("_", " ").toLowerCase()}
          </span>
          {e.amount != null && (
            <span className="shrink-0 font-mono text-xs text-text-secondary">
              {formatINR(e.amount)}
            </span>
          )}
          <Link
            to={`/cases/${e.case_id}`}
            className="shrink-0 font-mono text-xs text-ai hover:underline"
          >
            {e.case_id.slice(0, 8)}
          </Link>
        </div>
      ))}
    </div>
  );
}
