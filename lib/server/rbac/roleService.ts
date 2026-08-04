import "server-only";

import { prisma } from "@/lib/server/prisma";
import { ROLE_CAPABILITIES, ROLE_KEYS, ROLE_LABELS, type RoleKey, normalizeRoleKey } from "./definitions";

export async function listRoles() {
  return ROLE_KEYS.map((key) => ({ key, ...ROLE_LABELS[key], capabilities: ROLE_CAPABILITIES[key] }));
}

export async function listOrganizationMembers(organizationId: string) {
  const members = await prisma.organizationMembership.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: "asc" }, { userId: "asc" }],
    select: { userId: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true } }, roleAssignment: { select: { role: { select: { key: true } } } } }
  });
  return members.map((member) => ({ ...member.user, role: normalizeRoleKey(member.roleAssignment?.role.key ?? member.role), createdAt: member.createdAt }));
}

export async function assignOrganizationRole(input: { organizationId: string; userId: string; role: string; assignedByUserId: string }) {
  if (!(ROLE_KEYS as readonly string[]).includes(input.role.trim().toLowerCase())) throw new RoleServiceError("The requested role is invalid.", 400);
  const role = normalizeRoleKey(input.role);
  const membership = await prisma.organizationMembership.findUnique({ where: { userId_organizationId: { userId: input.userId, organizationId: input.organizationId } }, select: { role: true, roleAssignment: { select: { role: { select: { key: true } } } } } });
  if (!membership) throw new RoleServiceError("The user is not a member of this organization.", 404);
  const currentRole = normalizeRoleKey(membership.roleAssignment?.role.key ?? membership.role);
  if (currentRole === "owner" && role !== "owner") {
    const ownerCount = await prisma.organizationRoleAssignment.count({ where: { organizationId: input.organizationId, role: { key: "owner" } } });
    if (ownerCount <= 1) throw new RoleServiceError("The last organization owner cannot be demoted.", 409);
  }
  const targetRole = await prisma.role.findUnique({ where: { key: role }, select: { id: true } });
  if (!targetRole) throw new RoleServiceError("The requested role is unavailable.", 400);
  return prisma.organizationRoleAssignment.upsert({
    where: { organizationId_userId: { organizationId: input.organizationId, userId: input.userId } },
    create: { organizationId: input.organizationId, userId: input.userId, roleId: targetRole.id, assignedByUserId: input.assignedByUserId },
    update: { roleId: targetRole.id, assignedByUserId: input.assignedByUserId }
  });
}

export async function removeOrganizationMember(organizationId: string, userId: string) {
  const membership = await prisma.organizationMembership.findUnique({ where: { userId_organizationId: { userId, organizationId } }, select: { role: true, roleAssignment: { select: { role: { select: { key: true } } } } } });
  if (!membership) throw new RoleServiceError("The user is not a member of this organization.", 404);
  const role = normalizeRoleKey(membership.roleAssignment?.role.key ?? membership.role);
  if (role === "owner") {
    const ownerCount = await prisma.organizationRoleAssignment.count({ where: { organizationId, role: { key: "owner" } } });
    if (ownerCount <= 1) throw new RoleServiceError("The last organization owner cannot be removed.", 409);
  }
  await prisma.organizationMembership.delete({ where: { userId_organizationId: { userId, organizationId } } });
}

export class RoleServiceError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) { super(message); this.name = "RoleServiceError"; }
}
