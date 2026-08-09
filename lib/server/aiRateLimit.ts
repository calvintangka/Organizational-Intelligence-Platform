import "server-only";

import type { AIAccessContext } from "@/lib/server/aiAuthorization";
import {
  enforceRateLimit,
  rateLimitResponse,
  type RateLimitDecision
} from "@/lib/server/rateLimit";

/**
 * RSS-1.2S2 — layered AI proxy cost protection, applied AFTER RSS-1.2S1
 * authorization so a denial never touches provider configuration, credentials,
 * diagnostics, or the provider. A denied request returns 429 with zero
 * upstream calls and no billable usage.
 *
 * Three layers run for every AI request:
 *   - ai.invoke.burst        per-user short window;
 *   - ai.invoke.user         per-user sustained window;
 *   - ai.invoke.organization per-organization sustained window shared across
 *                            all four proxy endpoints (route switching cannot
 *                            evade the organization bucket).
 */
export async function enforceAIProxyLimits(
  request: Request,
  access: AIAccessContext
): Promise<RateLimitDecision> {
  const ctx = {
    route: access.endpoint,
    organizationId: access.organizationId,
    actorUserId: access.user.id,
    requestId: access.requestId,
    correlationId: access.correlationId
  };
  const decisions = await Promise.all([
    enforceRateLimit("ai.invoke.burst", [{ type: "user", value: access.user.id }], ctx),
    enforceRateLimit("ai.invoke.user", [{ type: "user", value: access.user.id }], ctx),
    enforceRateLimit("ai.invoke.organization", [{ type: "organization", value: access.organizationId }], ctx)
  ]);
  const denied = decisions.find((decision) => !decision.allowed);
  if (denied) return denied;
  return decisions.reduce((mostRestrictive, decision) =>
    decision.remaining < mostRestrictive.remaining ? decision : mostRestrictive
  );
}

/** Convenience wrapper returning the 429 response when the limit is exceeded. */
export async function enforceAIProxyLimitsOrRespond(
  request: Request,
  access: AIAccessContext
): Promise<{ decision: RateLimitDecision; response: ReturnType<typeof rateLimitResponse> | null }> {
  const decision = await enforceAIProxyLimits(request, access);
  return { decision, response: decision.allowed ? null : rateLimitResponse(decision) };
}
