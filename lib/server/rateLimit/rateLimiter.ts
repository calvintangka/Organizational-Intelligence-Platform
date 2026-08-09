import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/server/prisma";
import {
  getRateLimitPolicy,
  rateLimitMode,
  type RateLimitPolicy,
  type RateLimitPolicyKey
} from "./policies";
import { dimensionKey, type RateLimitDimension } from "./keys";
import type { RateLimitStore } from "./store";

/**
 * RSS-1.2S2 — shared rate-limit decision engine.
 *
 * One service implements windowing, atomic counting, remaining/reset
 * semantics, failure behavior, and denial observability for every protected
 * boundary. Routes never reimplement limiter logic; they describe which
 * policy and which dimensions apply.
 */

export interface RateLimitDecision {
  allowed: boolean;
  policy: RateLimitPolicyKey;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
  reason?: string;
  dimensionClass?: string;
}

export interface RateLimitContext {
  route: string;
  organizationId?: string;
  actorUserId?: string;
  requestId?: string;
  correlationId?: string;
}

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const COUNTER_RETENTION_MS = 48 * 60 * 60 * 1000;
const EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export class RateLimiter {
  /** Emergency per-process ceiling used only when the shared store is down. */
  private emergency = new Map<string, { windowStart: number; count: number }>();
  private lastEmergencyPrune = 0;
  private lastCleanupAt = 0;

  constructor(private store: RateLimitStore) {}

  private windowStartFor(policy: RateLimitPolicy): Date {
    const now = Date.now();
    return new Date(Math.floor(now / policy.windowMs) * policy.windowMs);
  }

  private emergencyCount(policy: RateLimitPolicy, dimensionKey: string, windowStart: Date): number {
    const now = Date.now();
    if (now - this.lastEmergencyPrune > 60_000) {
      this.emergency.clear();
      this.lastEmergencyPrune = now;
    }
    const key = `${policy.key}:${dimensionKey}:${windowStart.getTime()}`;
    const existing = this.emergency.get(key);
    const count = (existing?.count ?? 0) + policy.cost;
    this.emergency.set(key, { windowStart: windowStart.getTime(), count });
    return count;
  }

  private makeDecision(
    policy: RateLimitPolicy,
    dimensionClass: string,
    count: number,
    windowStart: Date,
    reason?: string,
    maxOverride?: number
  ): RateLimitDecision {
    const limit = maxOverride ?? policy.max;
    const allowed = count <= limit;
    const resetAt = new Date(windowStart.getTime() + policy.windowMs);
    const remaining = Math.max(0, limit - count);
    const retryAfterSeconds = allowed
      ? 0
      : Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
    return {
      allowed,
      policy: policy.key,
      limit,
      remaining,
      resetAt,
      retryAfterSeconds,
      ...(reason ? { reason } : {}),
      dimensionClass
    };
  }

  private async recordDenial(
    policy: RateLimitPolicyKey,
    dimensionClass: string,
    ctx: RateLimitContext,
    decision: RateLimitDecision,
    reason: string
  ): Promise<void> {
    const event = {
      policyKey: policy,
      route: ctx.route,
      decision: "deny",
      dimensionClass,
      actorUserId: ctx.actorUserId,
      organizationId: ctx.organizationId,
      limitValue: decision.limit,
      remaining: decision.remaining,
      resetAt: decision.resetAt,
      retryAfterSeconds: decision.retryAfterSeconds,
      reason,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId
    };
    try {
      await prisma.rateLimitEvent.create({ data: event });
    } catch {
      // A denied event that cannot be persisted must never allow the request.
    }
    console.warn(`[rate-limit] DENY ${policy}`, {
      route: ctx.route,
      dimension: dimensionClass,
      limit: decision.limit,
      remaining: decision.remaining,
      reason,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId
    });
  }

  /**
   * Evaluates one dimension of one policy. The counter is incremented
   * atomically and the decision reflects the resulting count, so the first
   * `max` requests in a window are allowed and every later one is denied.
   */
  private async checkDimension(
    policy: RateLimitPolicy,
    dimension: RateLimitDimension,
    windowStart: Date,
    ctx: RateLimitContext,
    enforce: boolean
  ): Promise<RateLimitDecision> {
    const key = dimensionKey(dimension.type, dimension.value);
    let count: number;
    let storeFailed = false;

    try {
      count = await this.store.increment({
        policyKey: policy.key,
        dimensionKey: key,
        windowStart,
        cost: policy.cost
      });
    } catch {
      storeFailed = true;
      if (policy.failureMode === "fail_closed") {
        const decision = this.makeDecision(policy, dimension.type, policy.max + 1, windowStart, "store_unavailable");
        if (enforce) await this.recordDenial(policy.key, dimension.type, ctx, decision, "store_unavailable");
        return decision;
      }
      if (policy.failureMode === "emergency_ceiling") {
        // Bound the in-memory count at the emergency ceiling + 1 and decide
        // against the emergency ceiling itself, so the degraded per-instance
        // cap is genuinely enforced even when it is smaller than policy.max.
        count = Math.min(this.emergencyCount(policy, key, windowStart), policy.emergencyCeiling + 1);
        const decision = this.makeDecision(policy, dimension.type, count, windowStart, "emergency_ceiling_active", policy.emergencyCeiling);
        if (!decision.allowed && enforce) {
          await this.recordDenial(policy.key, dimension.type, ctx, decision, storeFailed ? "emergency_ceiling_exceeded" : "limit_exceeded");
        }
        return decision;
      }
      count = 1; // fail_open
    }

    const decision = this.makeDecision(policy, dimension.type, count, windowStart);
    if (!decision.allowed && enforce) {
      await this.recordDenial(policy.key, dimension.type, ctx, decision, storeFailed ? "emergency_ceiling_exceeded" : "limit_exceeded");
    }
    return decision;
  }

  /**
   * Evaluates a policy across one or more dimensions. The request is allowed
   * only if every dimension is within limit; the most restrictive dimension
   * determines the returned decision (for headers and observability).
   */
  async check(
    policyKey: RateLimitPolicyKey,
    dimensions: RateLimitDimension[],
    ctx: RateLimitContext
  ): Promise<RateLimitDecision> {
    const mode = rateLimitMode();
    if (mode === "off" || dimensions.length === 0) {
      return { allowed: true, policy: policyKey, limit: 0, remaining: 0, resetAt: new Date(), retryAfterSeconds: 0 };
    }
    const enforce = mode === "enforce";
    const policy = getRateLimitPolicy(policyKey);
    const windowStart = this.windowStartFor(policy);

    let denied: RateLimitDecision | null = null;
    let mostRestrictive: RateLimitDecision | null = null;
    for (const dimension of dimensions) {
      const decision = await this.checkDimension(policy, dimension, windowStart, ctx, enforce);
      if (enforce && !decision.allowed && !denied) denied = decision;
      if (!mostRestrictive || decision.remaining < mostRestrictive.remaining) mostRestrictive = decision;
    }
    if (denied) return denied;
    return mostRestrictive ?? { allowed: true, policy: policyKey, limit: policy.max, remaining: policy.max, resetAt: windowStart, retryAfterSeconds: 0 };
  }

  /** Removes counters/events older than the retention window (bounded table growth). */
  async maybeCleanup(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCleanupAt < CLEANUP_INTERVAL_MS) return;
    this.lastCleanupAt = now;
    try {
      await this.store.cleanup(new Date(now - COUNTER_RETENTION_MS));
      await this.store.cleanup(new Date(now - EVENT_RETENTION_MS));
    } catch {
      // Cleanup is best-effort; enforcement never depends on it.
    }
  }

  /** Resets a dimension's counters (used to clear account failure counts after a successful login). */
  async reset(policyKey: RateLimitPolicyKey, type: string, value: string): Promise<void> {
    try {
      await this.store.reset(policyKey, dimensionKey(type, value));
    } catch {
      // Reset is best-effort; a failed reset only delays the counter clearing.
    }
  }
}

export function requestIdentity(request: Request): { requestId: string; correlationId: string } {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const correlationId = request.headers.get("x-correlation-id") ?? requestId;
  return { requestId, correlationId };
}
