import "server-only";

import { NextResponse } from "next/server";

import { PostgresRateLimitStore, type RateLimitStore } from "./store";
import { RateLimiter, requestIdentity, type RateLimitContext, type RateLimitDecision } from "./rateLimiter";
import type { RateLimitDimension } from "./keys";
import type { RateLimitPolicyKey } from "./policies";

/**
 * RSS-1.2S2 — public rate-limiting surface.
 *
 * `rateLimiter` is the production singleton backed by the shared PostgreSQL
 * store. `enforceRateLimit` is the one-line helper every protected route calls;
 * `rateLimitResponse` produces the consistent 429 contract.
 */

export * from "./policies";
export * from "./keys";
export * from "./rateLimiter";
export type { RateLimitStore } from "./store";

export function createRateLimiter(store: RateLimitStore): RateLimiter {
  return new RateLimiter(store);
}

/** Production rate limiter backed by the shared PostgreSQL store. */
export const rateLimiter = new RateLimiter(new PostgresRateLimitStore());

/**
 * Evaluates a named policy across the given dimensions. Returns an `allowed`
 * decision, or a denied decision that the caller must surface as 429.
 */
export async function enforceRateLimit(
  policy: Parameters<RateLimiter["check"]>[0],
  dimensions: RateLimitDimension[],
  ctx: RateLimitContext
): Promise<RateLimitDecision> {
  return rateLimiter.check(policy, dimensions, ctx);
}

export interface OrgLimitPolicy {
  policy: RateLimitPolicyKey;
  dimensions: RateLimitDimension[];
}

/**
 * Evaluates a list of policies (each with its own dimensions) for an
 * organization-scoped route. The request is allowed only if every policy
 * allows it; the most restrictive decision (first denial, otherwise least
 * remaining) is returned so the caller can emit headers and a 429.
 */
export async function enforceOrgUserLimits(
  request: Request,
  ctx: Pick<RateLimitContext, "route" | "organizationId" | "actorUserId">,
  policies: OrgLimitPolicy[]
): Promise<RateLimitDecision> {
  const { requestId, correlationId } = requestIdentity(request);
  const base: RateLimitContext = { ...ctx, requestId, correlationId };
  let mostRestrictive: RateLimitDecision | null = null;
  for (const { policy, dimensions } of policies) {
    const decision = await enforceRateLimit(policy, dimensions, base);
    if (!decision.allowed) return decision;
    if (!mostRestrictive || decision.remaining < mostRestrictive.remaining) mostRestrictive = decision;
  }
  return mostRestrictive ?? { allowed: true, policy: policies[0]?.policy ?? "auth.login.ip", limit: 0, remaining: 0, resetAt: new Date(), retryAfterSeconds: 0 };
}

/**
 * The safe, consistent 429 envelope. Exposes only limit metadata — never raw
 * keys, identifiers, IP hashes, or internal bucket names.
 */
export function rateLimitResponse(decision: RateLimitDecision): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests. Please try again later."
      }
    },
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Retry-After": String(decision.retryAfterSeconds),
        "RateLimit-Limit": String(decision.limit),
        "RateLimit-Remaining": String(decision.remaining),
        "RateLimit-Reset": String(Math.floor(decision.resetAt.getTime() / 1000))
      }
    }
  );
}
