import "server-only";

import { getCurrentUser, type AuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/server/prisma";

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
    select: { role: true }
  });
  if (!membership) {
    throw new AuthorizationError("FORBIDDEN", "You do not have access to this organization.", 403);
  }
  return { user, role: membership.role };
}
