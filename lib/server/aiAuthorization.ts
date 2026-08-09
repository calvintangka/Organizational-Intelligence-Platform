import "server-only";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import type { AuthenticatedUser } from "@/lib/auth";
import {
  AuthorizationError,
  requireAuthenticatedUser,
  requireCapability,
  resolveActiveOrganizationId
} from "@/lib/server/authorization";
import type { CapabilityKey } from "@/lib/server/rbac/definitions";

/**
 * RSS-1.2S1 — shared AI proxy authorization boundary.
 *
 * Every AI proxy route (`/api/ai/chat`, `/api/ai/deepseek`, `/api/ai/claude`,
 * `/api/ai/openai-compatible`) must pass through `withAuthorizedAIRequest`
 * before it may read provider configuration, access credentials, build
 * diagnostics, select an endpoint, or issue an outbound AI request.
 *
 * The boundary is deliberately single-sourced so authorization cannot drift
 * between routes. The order of checks is fixed:
 *
 *   authentication        -> 401 (invalid session)
 *   organization resolved -> 400 (no active organization)
 *   membership verified   -> 403 (not a member / unknown organization)
 *   capability `ai.use`   -> 403 (capability not granted)
 *
 * The membership/capability check runs through the existing RBAC service,
 * which durably records an `authorization_decision_audits` row (allow or deny)
 * for every authenticated decision. Provider credentials and prompts are never
 * part of that audit.
 */

/** The RBAC capability required to invoke the AI proxies. */
export const AI_CAPABILITY = "ai.use" as const satisfies CapabilityKey;

export interface AIAccessOptions {
  /** Exact proxy route path, e.g. "/api/ai/chat". Recorded in the audit resource. */
  endpoint: string;
  /** Stable provider slug, e.g. "lmstudio", "deepseek". Recorded in the audit resource. */
  provider: string;
}

export interface AIAccessContext {
  /** The authenticated actor. */
  user: AuthenticatedUser;
  /** The organization the request is authorized against. */
  organizationId: string;
  /** Normalized role key of the actor within the organization. */
  role: string;
  /** The capability that was verified (`ai.use`). */
  capability: string;
  /** Audit resource identifier: `ai_proxy:<endpoint>:<provider>`. */
  resource: string;
  /** The proxy route path the request was authorized for. */
  endpoint: string;
  /** The provider slug the request was authorized for. */
  provider: string;
  /** Correlation identifiers carried through to the audit and upstream logs. */
  requestId: string;
  correlationId: string;
}

/** Route-level error produced before authorization can complete. */
export class AIAccessError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: 400 | 401 | 403
  ) {
    super(message);
    this.name = "AIAccessError";
  }
}

function aiResource(endpoint: string, provider: string): string {
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const safeProvider = provider
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .slice(0, 32);
  return `ai_proxy:${path}:${safeProvider}`;
}

/**
 * Authenticates and authorizes an AI proxy request. Only after this resolves
 * may the caller touch provider configuration, credentials, or the network.
 */
export async function requireAIAccess(
  request: Request,
  options: AIAccessOptions
): Promise<AIAccessContext> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const correlationId = request.headers.get("x-correlation-id") ?? requestId;

  // 1. Authentication (invalid/missing/expired/deleted session -> 401).
  const user = await requireAuthenticatedUser();

  // 2. Organization resolution (missing active organization -> 400).
  const organizationId = await resolveActiveOrganizationId(user.id);
  if (!organizationId) {
    throw new AIAccessError(
      "MISSING_ORGANIZATION",
      "An active organization is required to use AI.",
      400
    );
  }

  // 3. Membership verification and 4. `ai.use` capability check (-> 403),
  //    audited as allow/deny by the existing RBAC service.
  const resource = aiResource(options.endpoint, options.provider);
  const { role } = await requireCapability(organizationId, AI_CAPABILITY, {
    request,
    resource,
    requestId,
    correlationId
  });

  return {
    user,
    organizationId,
    role,
    capability: AI_CAPABILITY,
    resource,
    endpoint: options.endpoint,
    provider: options.provider,
    requestId,
    correlationId
  };
}

/** Maps authorization failures to the standard `{ error: { code, message } }` envelope. */
export function toSafeAIAccessError(error: unknown): { code: string; message: string; status: number } {
  if (error instanceof AIAccessError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  if (error instanceof AuthorizationError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  // Infrastructure failures are not authorization denials; never surface
  // internals or stack traces to the caller.
  return { code: "AI_ACCESS_UNAVAILABLE", message: "AI access is temporarily unavailable.", status: 503 };
}

export function aiAccessErrorResponse(error: unknown): NextResponse {
  const safe = toSafeAIAccessError(error);
  return NextResponse.json(
    { error: { code: safe.code, message: safe.message } },
    { status: safe.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
  );
}

/**
 * Wraps an AI proxy handler with the full authorization boundary. The handler
 * runs only after authentication, organization resolution, membership, and the
 * `ai.use` capability check have succeeded.
 */
export async function withAuthorizedAIRequest(
  request: Request,
  options: AIAccessOptions,
  handler: (access: AIAccessContext) => Response | Promise<Response>
): Promise<Response> {
  try {
    const access = await requireAIAccess(request, options);
    return await handler(access);
  } catch (error) {
    return aiAccessErrorResponse(error);
  }
}
