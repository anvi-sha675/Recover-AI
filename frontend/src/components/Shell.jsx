import { NavLink } from "react-router-dom";

const NAV = [
  { to: "/", label: "Command Center", exact: true },
  { to: "/inbox", label: "Revenue Risk Inbox" },
  { to: "/approvals", label: "Approval Queue" },
  { to: "/analytics", label: "Analytics" },
  { to: "/voice", label: "Voice Recovery" },
  { to: "/judge", label: "Judge Mode" },
  { to: "/settings", label: "Settings" },
];

export function Shell({ children }) {
  return (
    <div className="min-h-screen bg-ink-950">
      <div className="flex">
        <aside className="sticky top-0 h-screen w-64 shrink-0 border-r border-line px-5 py-6">
          <div className="flex items-center gap-2 px-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-ai text-sm font-bold text-white">
              R
            </div>
            <div className="font-display text-lg font-semibold tracking-tight">
              RecoverAI
            </div>
          </div>
          <div className="mt-1 px-1 text-xs text-text-tertiary">
            Revenue Recovery Agent
          </div>

          <nav className="mt-8 flex flex-col gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-ai-soft text-ai font-medium"
                      : "text-text-secondary hover:bg-ink-800 hover:text-text-primary"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-10 flex flex-col gap-2">
            <div className="rounded-md border border-line-soft bg-ink-900 px-3 py-3 text-xs text-text-tertiary">
              <div className="mb-1 font-medium text-text-secondary">
                Razorpay mode
              </div>
              <RazorpayModeBadge />
            </div>
            <div className="rounded-md border border-line-soft bg-ink-900 px-3 py-3 text-xs text-text-tertiary">
              <div className="mb-1 font-medium text-text-secondary">
                Database
              </div>
              <DbModeBadge />
            </div>
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-8 py-6">{children}</main>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { api } from "../lib/api";

function RazorpayModeBadge() {
  const [mode, setMode] = useState(null);
  useEffect(() => {
    api
      .health()
      .then((h) => setMode(h.razorpay_mode))
      .catch(() => setMode("UNKNOWN"));
  }, []);
  if (!mode) return <div className="font-mono">checking…</div>;
  return (
    <div
      className={`font-mono ${mode === "TEST_MODE" ? "text-recover" : "text-risk"}`}
    >
      {mode === "TEST_MODE" ? "TEST MODE (live)" : "SIMULATED"}
    </div>
  );
}

function DbModeBadge() {
  const [label, setLabel] = useState(null);
  const [isMongo, setIsMongo] = useState(false);
  useEffect(() => {
    api
      .health()
      .then((h) => {
        setLabel(h.db_backend_label);
        setIsMongo(h.db_backend === "mongo");
      })
      .catch(() => setLabel("UNKNOWN"));
  }, []);
  if (!label) return <div className="font-mono">checking…</div>;
  return (
    <div className={`font-mono ${isMongo ? "text-recover" : "text-risk"}`}>
      {label}
    </div>
  );
}
