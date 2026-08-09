import "server-only";

import { getCurrentUser, type AuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/server/prisma";
import { authorizationService, AuthorizationServiceError } from "@/lib/server/rbac/authorizationService";
import { normalizeRoleKey, type CapabilityKey } from "@/lib/server/rbac/definitions";

export type AuthorizationErrorCode = "UNAUTHENTICATED" | "FORBIDDEN";

export class AuthorizationError extends Error {
  constructor(
    public readonly code: AuthorizationErrorCode,
    message: string,
    public readonly status: 401 | 403
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}
export async function requireAuthenticatedUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError("UNAUTHENTICATED", "Authentication is required.", 401);
  return user;
}

export async function requireOrganizationMembership(
  organizationId: string
): Promise<{ user: AuthenticatedUser; role: string }> {
  const user = await requireAuthenticatedUser();
  const membership = await prisma.organizationMembership.findUnique({
    where: { userId_organizationId: { userId: user.id, organizationId } },
    select: { role: true, roleAssignment: { select: { role: { select: { key: true } } } } }
  });
  if (!membership) {
    throw new AuthorizationError("FORBIDDEN", "You do not have access to this organization.", 403);
  }
  return { user, role: normalizeRoleKey(membership.roleAssignment?.role.key ?? membership.role) };
}

/**
 * Resolves the organization context for non-org-scoped routes (for example the
 * AI proxies) from the authenticated user's active organization. Returns `null`
 * when the user has no active organization, which the caller must surface as a
 * 400 client error — never as a successful request.
 */
export async function resolveActiveOrganizationId(userId: string): Promise<string | null> {
  const record = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeOrganizationId: true }
  });
  return record?.activeOrganizationId ?? null;
}

export async function requireCapability(
  organizationId: string,
  capability: CapabilityKey | string,
  options: { request?: Request; resource?: string; requestId?: string; correlationId?: string } = {}
): Promise<{ user: AuthenticatedUser; role: string; capability: string }> {
  const user = await requireAuthenticatedUser();
  const requestId = options.requestId ?? options.request?.headers.get("x-request-id") ?? undefined;
  const correlationId = options.correlationId ?? options.request?.headers.get("x-correlation-id") ?? requestId;
  try {
    const decision = await authorizationService.requireCapability({
      actorUserId: user.id,
      organizationId,
      capability,
      resource: options.resource,
      requestId,
      correlationId
    });
    return { user, role: decision.roleKey ?? "", capability };
  } catch (error) {
    if (error instanceof AuthorizationServiceError) {
      throw new AuthorizationError("FORBIDDEN", error.message, 403);
    }
    // Database, serialization, and other infrastructure failures are not
    // authorization denials. Let the route's safe error boundary classify
    // them as genuine server failures instead of misreporting them as 403.
    throw error;
  }
}

export async function hasCapability(
  organizationId: string,
  capability: CapabilityKey | string,
  options: { request?: Request; resource?: string; requestId?: string; correlationId?: string } = {}
): Promise<boolean> {
  const user = await requireAuthenticatedUser();
  return authorizationService.hasCapability({
    actorUserId: user.id,
    organizationId,
    capability,
    resource: options.resource,
    requestId: options.requestId ?? options.request?.headers.get("x-request-id") ?? undefined,
    correlationId: options.correlationId ?? options.request?.headers.get("x-correlation-id") ?? undefined
  });
}
