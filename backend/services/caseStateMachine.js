const STATES = [
  "OPEN", "AWAITING_APPROVAL", "RECOVERED", "ESCALATED", "STOPPED",
];

const TERMINAL_STATES = new Set(["RECOVERED", "STOPPED"]);

const ALLOWED_TRANSITIONS = {
  OPEN: new Set(["OPEN", "AWAITING_APPROVAL", "RECOVERED", "ESCALATED", "STOPPED"]),
  AWAITING_APPROVAL: new Set(["OPEN", "RECOVERED", "ESCALATED", "STOPPED", "AWAITING_APPROVAL"]),
  ESCALATED: new Set(["ESCALATED", "STOPPED"]), // an escalated case can still be manually stopped, not silently reopened
  RECOVERED: new Set(["RECOVERED"]), // terminal - no legal transition out
  STOPPED: new Set(["STOPPED"]), // terminal - no legal transition out
};

export function isValidTransition(fromStatus, toStatus) {
  if (!STATES.includes(toStatus)) return false;
  if (!fromStatus) return true; // initial creation
  const allowed = ALLOWED_TRANSITIONS[fromStatus];
  if (!allowed) return false;
  return allowed.has(toStatus);
}

export function isTerminal(status) {
  return TERMINAL_STATES.has(status);
}

export async function transitionCaseStatus(db, caseId, targetStatus, { patch = {}, skipIfSame = true } = {}) {
  const current = await db.findOne("recovery_cases", (c) => c.case_id === caseId);
  if (!current) throw new Error(`transitionCaseStatus: case ${caseId} not found`);

  if (skipIfSame && current.current_status === targetStatus) {
    if (Object.keys(patch).length > 0) {
      return db.update("recovery_cases", (c) => c.case_id === caseId, patch);
    }
    return current;
  }

  if (!isValidTransition(current.current_status, targetStatus)) {
    throw new Error(
      `Illegal case state transition rejected: ${current.current_status} -> ${targetStatus} (case ${caseId}). ` +
      `A terminal state (RECOVERED/STOPPED) cannot transition further without an explicit authorized reopen, which this system does not implement.`
    );
  }

  return db.update("recovery_cases", (c) => c.case_id === caseId, { ...patch, current_status: targetStatus });
}

export { STATES, TERMINAL_STATES };
