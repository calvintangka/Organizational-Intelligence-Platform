import "server-only";

import { requireOrganizationId } from "@/lib/organizationId";
import { AuthorizationError, requireAuthenticatedUser, requireCapability } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";

export type ActiveOrganization = {
  id: string;
  name: string;
  industry: string;
  description: string;
};

export type ActiveOrganizationState = {
  activeOrganizationId: string | null;
  organization: ActiveOrganization | null;
};

type ActiveOrganizationErrorCode = "INVALID_ORGANIZATION_ID" | "ORGANIZATION_NOT_FOUND" | "DATABASE_ERROR";

export class ActiveOrganizationError extends Error {
  constructor(
    public readonly code: ActiveOrganizationErrorCode,
    message: string,
    public readonly status: 400 | 404 | 500
  ) {
    super(message);
    this.name = "ActiveOrganizationError";
  }
}
function mapOrganization(organization: {
  id: string;
  name: string;
  industry: string;
  description: string;
}): ActiveOrganization {
  return {
    id: organization.id,
    name: organization.name,
    industry: organization.industry,
    description: organization.description
  };
}

async function resolveForUser(userId: string): Promise<ActiveOrganizationState> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      activeOrganizationId: true,
      memberships: {
        orderBy: [{ createdAt: "asc" }, { organizationId: "asc" }],
        select: {
          organization: { select: { id: true, name: true, industry: true, description: true } }
        }
      }
    }
  });
  if (!user) throw new AuthorizationError("UNAUTHENTICATED", "Authentication is required.", 401);

  const activeMembership = user.memberships.find(({ organization }) => organization.id === user.activeOrganizationId);
  const selected = activeMembership ?? user.memberships[0] ?? null;
  const nextId = selected?.organization.id ?? null;
  if (nextId !== user.activeOrganizationId) {
    await prisma.user.update({ where: { id: userId }, data: { activeOrganizationId: nextId } });
  }

  return {
    activeOrganizationId: nextId,
    organization: selected ? mapOrganization(selected.organization) : null
  };
}

export async function getActiveOrganizationForCurrentUser(): Promise<ActiveOrganizationState> {
  const user = await requireAuthenticatedUser();
  return resolveForUser(user.id);
}

export async function setActiveOrganizationForCurrentUser(value: unknown): Promise<ActiveOrganizationState> {
  const user = await requireAuthenticatedUser();
  let organizationId: string;
  try {
    organizationId = requireOrganizationId(value as string, "Active organization");
  } catch {
    throw new ActiveOrganizationError("INVALID_ORGANIZATION_ID", "organizationId must be a non-empty string.", 400);
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, industry: true, description: true }
  });
  if (!organization) {
    throw new ActiveOrganizationError("ORGANIZATION_NOT_FOUND", `Organization ${organizationId} was not found.`, 404);
  }

  const membership = await prisma.organizationMembership.findUnique({
    where: { userId_organizationId: { userId: user.id, organizationId } },
    select: { organizationId: true }
  });
  if (!membership) {
    throw new AuthorizationError("FORBIDDEN", "You do not have access to this organization.", 403);
  }

  await requireCapability(organizationId, "organization.read", { resource: "active_organization:set" });

  await prisma.user.update({ where: { id: user.id }, data: { activeOrganizationId: organizationId } });
  return { activeOrganizationId: organization.id, organization: mapOrganization(organization) };
}

export function toSafeActiveOrganizationError(error: unknown): { code: string; message: string; status: number } {
  if (error instanceof AuthorizationError) return { code: error.code, message: error.message, status: error.status };
  if (error instanceof ActiveOrganizationError) return { code: error.code, message: error.message, status: error.status };
  return { code: "DATABASE_ERROR", message: "The active organization context could not be resolved.", status: 500 };
}
