import { NavLink } from "react-router-dom";

const NAV = [
  { to: "/", label: "Command Center", short: "CC", exact: true },
  { to: "/inbox", label: "Revenue Risk Inbox", short: "RISK" },
  { to: "/approvals", label: "Approval Queue", short: "APPROVE" },
  { to: "/analytics", label: "Analytics", short: "DATA" },
  { to: "/voice", label: "Voice Recovery", short: "VOICE" },
  { to: "/judge", label: "Judge Mode", short: "JUDGE" },
  { to: "/settings", label: "Settings", short: "SET" },
];

export function Shell({ children }) {
  return (
    <div className="min-h-screen bg-ink-950">
      <div className="flex">
        <aside className="sticky top-0 h-screen w-16 shrink-0 border-r border-line px-2 py-6 md:w-64 md:px-5">
          <div className="flex items-center gap-2 px-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-ai text-sm font-bold text-white">
              R
            </div>
            <div className="hidden font-display text-lg font-semibold tracking-tight md:block">
              RecoverAI
            </div>
          </div>
          <div className="mt-1 hidden px-1 text-xs text-text-tertiary md:block">
            Revenue Recovery Agent
          </div>

          <nav className="mt-8 flex flex-col gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                className={({ isActive }) =>
                  `rounded-md px-2 py-2 text-center text-[10px] transition-colors md:px-3 md:text-left md:text-sm ${
                    isActive
                      ? "bg-ai-soft text-ai font-medium"
                      : "text-text-secondary hover:bg-ink-800 hover:text-text-primary"
                  }`
                }
              >
                <span className="md:hidden">{item.short}</span>
                <span className="hidden md:inline">{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="mt-10 hidden flex-col gap-2 md:flex">
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
        <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-6">
          {children}
        </main>
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
