import rateLimit from "express-rate-limit";
const ROLE_RANK = { OPERATOR: 0, REVIEWER: 1, ADMIN: 2 };

function roleForKey(key) {
  if (!key) return null;
  if (process.env.ADMIN_API_KEY && key === process.env.ADMIN_API_KEY) return "ADMIN";
  if (process.env.REVIEWER_API_KEY && key === process.env.REVIEWER_API_KEY) return "REVIEWER";
  return null;
}

function rbacConfigured() {
  return Boolean(process.env.ADMIN_API_KEY || process.env.REVIEWER_API_KEY);
}

export function requireMinRole(minRole) {
  return (req, res, next) => {
    if (!rbacConfigured()) return next(); // open demo mode - logged at boot
    const providedKey = req.header("x-api-key");
    const role = roleForKey(providedKey);
    if (!role) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Missing or invalid x-api-key header." } });
    }
    if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: `Role ${role} does not have permission for this action (requires ${minRole} or higher).`,
        },
      });
    }
    req.actorRole = role;
    next();
  };
}

export function requireApiKey(req, res, next) {
  return requireMinRole("REVIEWER")(req, res, next);
}

export function validatePolicyPatch(req, res, next) {
  const ALLOWED_KEYS = new Set([
    "MAX_AUTOMATED_RETRIES",
    "MAX_AUTOMATED_RECOVERY_AMOUNT",
    "MIN_RECOVERY_CONFIDENCE",
    "MAX_INTERVENTIONS_PER_CUSTOMER",
    "STOP_AFTER_SUCCESS",
    "ESCALATE_AFTER_MAX_ATTEMPTS",
    "HIGH_VALUE_TRANSACTION_REQUIRES_APPROVAL",
  ]);
  const NUMERIC_KEYS = new Set([
    "MAX_AUTOMATED_RETRIES", "MAX_AUTOMATED_RECOVERY_AMOUNT",
    "MIN_RECOVERY_CONFIDENCE", "MAX_INTERVENTIONS_PER_CUSTOMER",
  ]);
  const BOOLEAN_KEYS = new Set([
    "STOP_AFTER_SUCCESS", "ESCALATE_AFTER_MAX_ATTEMPTS", "HIGH_VALUE_TRANSACTION_REQUIRES_APPROVAL",
  ]);

  const body = req.body || {};
  for (const key of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(key)) {
      return res.status(400).json({ error: `Unknown policy key: ${key}` });
    }
    if (NUMERIC_KEYS.has(key)) {
      if (typeof body[key] !== "number" || Number.isNaN(body[key]) || body[key] < 0) {
        return res.status(400).json({ error: `${key} must be a non-negative number.` });
      }
      if (key === "MIN_RECOVERY_CONFIDENCE" && (body[key] < 0 || body[key] > 1)) {
        return res.status(400).json({ error: "MIN_RECOVERY_CONFIDENCE must be between 0 and 1." });
      }
    }
    if (BOOLEAN_KEYS.has(key) && typeof body[key] !== "boolean") {
      return res.status(400).json({ error: `${key} must be a boolean.` });
    }
  }
  next();
}

export function validateExecuteBody(req, res, next) {
  const { transaction } = req.body || {};
  if (!transaction || typeof transaction !== "object") {
    return res.status(400).json({ error: "transaction object is required." });
  }
  if (typeof transaction.amount !== "number" || transaction.amount <= 0) {
    return res.status(400).json({ error: "transaction.amount must be a positive number." });
  }
  if (!transaction.customer_id || typeof transaction.customer_id !== "string") {
    return res.status(400).json({ error: "transaction.customer_id is required." });
  }
  next();
}

export const sensitiveActionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests to a sensitive financial endpoint. Please slow down." },
});
