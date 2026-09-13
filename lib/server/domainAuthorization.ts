import "server-only";

import { requireCapability, AuthorizationError } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import { normalizeRoleKey } from "@/lib/server/rbac/definitions";
import { MemoryFoundationError } from "@/lib/server/organizationalMemoryPrimitives";

export async function requireDomainCapability(input: {
  organizationId: string;
  domainId: string;
  capability: string;
  request?: Request;
  resource?: string;
}): Promise<{ user: Awaited<ReturnType<typeof requireCapability>>["user"]; role: string; domainId: string }> {
  const authorization = await requireCapability(input.organizationId, input.capability, {
    request: input.request,
    resource: input.resource ?? `domain:${input.domainId}`
  });
  const domain = await prisma.organizationDomain.findUnique({
    where: { id: input.domainId },
    select: { id: true, organizationId: true }
  });
  if (!domain || domain.organizationId !== input.organizationId) {
    throw new AuthorizationError("FORBIDDEN", "The requested organizational domain is not available.", 403);
  }

  // Existing Owner/Admin authority remains organization-wide. Other roles need
  // an explicit Domain grant, keeping new sensitive Domains fail-closed.
  if (authorization.role === "owner" || authorization.role === "administrator") {
    return { user: authorization.user, role: authorization.role, domainId: domain.id };
  }
  const grant = await prisma.organizationDomainCapabilityGrant.findFirst({
    where: {
      organizationId: input.organizationId,
      domainId: domain.id,
      capabilityKey: input.capability,
      role: { key: authorization.role }
    },
    select: { id: true }
  });
  if (!grant) throw new AuthorizationError("FORBIDDEN", "The requested Domain capability is not granted.", 403);
  return { user: authorization.user, role: authorization.role, domainId: domain.id };
}

export async function listAccessibleDomainIds(input: { organizationId: string; userId: string; capability: string }): Promise<string[]> {
  const membership = await prisma.organizationMembership.findUnique({
    where: { userId_organizationId: { userId: input.userId, organizationId: input.organizationId } },
    select: { role: true, roleAssignment: { select: { role: { select: { key: true } } } } }
  });
  if (!membership) return [];
  const role = normalizeRoleKey(membership.roleAssignment?.role.key ?? membership.role);
  if (role === "owner" || role === "administrator") {
    const domains = await prisma.organizationDomain.findMany({ where: { organizationId: input.organizationId, status: "active" }, select: { id: true } });
    return domains.map((domain) => domain.id);
  }
  const grants = await prisma.organizationDomainCapabilityGrant.findMany({
    where: { organizationId: input.organizationId, capabilityKey: input.capability, role: { key: role }, domain: { status: "active" } },
    select: { domainId: true }
  });
  return [...new Set(grants.map((grant) => grant.domainId))];
}

export async function requireSourceDomainCapability(input: {
  organizationId: string;
  sourceId: string;
  capability: string;
  request?: Request;
  resource?: string;
}): Promise<void> {
  const source = await prisma.organizationalSource.findUnique({ where: { id: input.sourceId }, select: { organizationId: true, domainId: true } });
  if (!source || source.organizationId !== input.organizationId) throw new MemoryFoundationError("RESOURCE_NOT_FOUND", "The requested organizational Source was not found in this organization.", 404);
  if (source.domainId) {
    await requireDomainCapability({ ...input, domainId: source.domainId });
  }
}

export async function requireKnowledgeDomainCapability(input: {
  organizationId: string;
  knowledgeItemId: string;
  capability: string;
  request?: Request;
  resource?: string;
}): Promise<void> {
  const item = await prisma.knowledgeItem.findUnique({ where: { id: input.knowledgeItemId }, select: { organizationId: true, domainId: true } });
  if (!item || item.organizationId !== input.organizationId) throw new MemoryFoundationError("RESOURCE_NOT_FOUND", "The requested organizational Memory was not found in this organization.", 404);
  if (item.domainId) await requireDomainCapability({ ...input, domainId: item.domainId });
}

export async function requireChallengeDomainCapability(input: {
  organizationId: string;
  challengeId: string;
  capability: string;
  request?: Request;
  resource?: string;
}): Promise<void> {
  const challenge = await prisma.knowledgeChallenge.findUnique({ where: { id: input.challengeId }, select: { organizationId: true, knowledgeItemId: true } });
  if (!challenge || challenge.organizationId !== input.organizationId) throw new MemoryFoundationError("RESOURCE_NOT_FOUND", "The requested organizational challenge was not found in this organization.", 404);
  await requireKnowledgeDomainCapability({ ...input, knowledgeItemId: challenge.knowledgeItemId });
}
