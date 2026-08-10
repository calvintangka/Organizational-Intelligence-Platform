import "server-only";

/**
 * RSS-1.2S2 — named rate-limit policies.
 *
 * Every protected boundary references a named policy instead of hard-coded
 * route-local numbers. Defaults are production-safe; each policy's window,
 * maximum, and failure mode can be overridden through environment variables of
 * the form `RATE_LIMIT_<POLICY_IN_UPPER_SNAKE>_MAX` and
 * `RATE_LIMIT_<POLICY_IN_UPPER_SNAKE>_WINDOW_MS` (for example
 * `RATE_LIMIT_AI_INVOKE_USER_MAX`).
 */

export type RateLimitPolicyKey =
  | "auth.login.ip"
  | "auth.login.account"
  | "auth.signup.ip"
  | "auth.signup.account"
  | "ai.invoke.burst"
  | "ai.invoke.user"
  | "ai.invoke.organization"
  | "ticket.submit.user"
  | "ticket.submit.organization"
  | "ticket.bulk.organization"
  | "job.create.organization"
  | "job.retry.organization"
  | "connector.mutate.organization"
  | "connector.inbound.source"
  | "action.prepare.user"
  | "action.approve.user"
  | "admin.mutate.user"
  | "export.full.organization"
  | "diagnostics.user";

/**
 * Behavior when the shared counter store is unavailable.
 *
 * - fail_open: allow the request (only justified for availability-critical,
 *   low-cost operations; none are configured fail-open today).
 * - fail_closed: deny the request (protects paid AI, durable queues, and
 *   high-cost writes from unbounded abuse during a store outage).
 * - emergency_ceiling: allow up to a small per-process in-memory ceiling, then
 *   deny. Preserves safe access while still bounding abuse; the ceiling is
 *   per-instance and documented as a degraded mode.
 */
export type RateLimitFailureMode = "fail_open" | "fail_closed" | "emergency_ceiling";

export interface RateLimitPolicy {
  key: RateLimitPolicyKey;
  windowMs: number;
  max: number;
  cost: number;
  failureMode: RateLimitFailureMode;
  /** Per-process ceiling used when failureMode is emergency_ceiling. */
  emergencyCeiling: number;
}

export type RateLimitMode = "enforce" | "observe" | "off";

const DEFAULTS: Record<RateLimitPolicyKey, Omit<RateLimitPolicy, "key">> = {
  "auth.login.ip": { windowMs: 15 * 60 * 1000, max: 30, cost: 1, failureMode: "emergency_ceiling", emergencyCeiling: 10 },
  "auth.login.account": { windowMs: 15 * 60 * 1000, max: 10, cost: 1, failureMode: "emergency_ceiling", emergencyCeiling: 5 },
  "auth.signup.ip": { windowMs: 60 * 60 * 1000, max: 20, cost: 1, failureMode: "emergency_ceiling", emergencyCeiling: 5 },
  "auth.signup.account": { windowMs: 60 * 60 * 1000, max: 5, cost: 1, failureMode: "emergency_ceiling", emergencyCeiling: 3 },
  "ai.invoke.burst": { windowMs: 60 * 1000, max: 10, cost: 1, failureMode: "emergency_ceiling", emergencyCeiling: 3 },
  "ai.invoke.user": { windowMs: 60 * 60 * 1000, max: 100, cost: 1, failureMode: "emergency_ceiling", emergencyCeiling: 5 },
  "ai.invoke.organization": { windowMs: 60 * 60 * 1000, max: 500, cost: 1, failureMode: "emergency_ceiling", emergencyCeiling: 10 },
  "ticket.submit.user": { windowMs: 60 * 60 * 1000, max: 100, cost: 1, failureMode: "fail_closed", emergencyCeiling: 0 },
  "ticket.submit.organization": { windowMs: 60 * 60 * 1000, max: 500, cost: 1, failureMode: "fail_closed", emergencyCeiling: 0 },
  "ticket.bulk.organization": { windowMs: 60 * 60 * 1000, max: 20, cost: 1, failureMode: "fail_closed", emergencyCeiling: 0 },
  "job.create.organization": { windowMs: 60 * 60 * 1000, max: 200, cost: 1, failureMode: "fail_closed", emergencyCeiling: 0 },
  "job.retry.organization": { windowMs: 60 * 60 * 1000, max: 100, cost: 1, failureMode: "fail_closed", emergencyCeiling: 0 },
  "connector.mutate.organization": { windowMs: 60 * 60 * 1000, max: 60, cost: 1, failureMode: "fail_closed", emergencyCeiling: 0 },
  "connector.inbound.source": { windowMs: 60 * 1000, max: 60, cost: 1, failureMode: "fail_closed", emergencyCeiling: 0 },
  "action.prepare.user": { windowMs: 60 * 60 * 1000, max: 50, cost: 1, failureMode: "fail_closed", emergencyCeiling: 0 },
  "action.approve.user": { windowMs: 60 * 60 * 1000, max: 100, cost: 1, failureMode: "fail_closed", emergencyCeiling: 0 },
  "admin.mutate.user": { windowMs: 60 * 60 * 1000, max: 50, cost: 1, failureMode: "fail_closed", emergencyCeiling: 0 },
  "export.full.organization": { windowMs: 60 * 60 * 1000, max: 30, cost: 1, failureMode: "fail_closed", emergencyCeiling: 0 },
  "diagnostics.user": { windowMs: 60 * 1000, max: 10, cost: 1, failureMode: "emergency_ceiling", emergencyCeiling: 3 }
};

function envUpperSnake(policy: string): string {
  return policy.toUpperCase().replace(/\./g, "_");
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Invalid rate-limit configuration: ${name} must be a non-negative number.`);
    }
    return fallback;
  }
  return Math.floor(parsed);
}

export function getRateLimitPolicy(key: RateLimitPolicyKey): RateLimitPolicy {
  const base = DEFAULTS[key];
  const upper = envUpperSnake(key);
  return {
    key,
    windowMs: envInt(`RATE_LIMIT_${upper}_WINDOW_MS`, base.windowMs),
    max: envInt(`RATE_LIMIT_${upper}_MAX`, base.max),
    cost: envInt(`RATE_LIMIT_${upper}_COST`, base.cost),
    failureMode: base.failureMode,
    emergencyCeiling: base.emergencyCeiling
  };
}

export const RATE_LIMIT_POLICY_KEYS = Object.keys(DEFAULTS) as RateLimitPolicyKey[];

/** The global limiter mode: enforce (production-safe default), observe, or off. */
export function rateLimitMode(): RateLimitMode {
  const raw = (process.env.RATE_LIMIT_MODE ?? "").trim().toLowerCase();
  if (raw === "off") return "off";
  if (raw === "observe") return "observe";
  return "enforce";
}

/**
 * The server-only key used to digest limiter dimensions. Required in
 * production; development falls back to a documented non-production value so
 * local servers and probes keep working without configuration.
 */
export function rateLimitHashSecret(): string {
  const configured = process.env.RATE_LIMIT_HASH_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("RATE_LIMIT_HASH_SECRET is required in production while rate limiting is enforced.");
  }
  return "oip-rate-limit-development-secret-do-not-use-in-production";
}
