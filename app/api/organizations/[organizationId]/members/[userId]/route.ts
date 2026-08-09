import { NextResponse } from "next/server";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { requireCapability } from "@/lib/server/authorization";
import { assignOrganizationRole, removeOrganizationMember, RoleServiceError } from "@/lib/server/rbac/roleService";
import { enforceOrgUserLimits, rateLimitResponse } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

type Params = { organizationId: string; userId: string };

export const PATCH = withOrganizationRoute<Params>("organization.members.manage", async ({ request, organizationId, params, user }) => {
  try {
    const limit = await enforceOrgUserLimits(request, { route: "/api/organizations/[organizationId]/members/[userId]", organizationId, actorUserId: user.id }, [
      { policy: "admin.mutate.user", dimensions: [{ type: "user", value: user.id }] }
    ]);
    if (!limit.allowed) return rateLimitResponse(limit);
    const body = await request.json().catch(() => null) as { role?: unknown } | null;
    if (!body || typeof body.role !== "string") return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "A role is required." } }, { status: 400 });
    if (body.role.trim().toLowerCase() === "owner") await requireCapability(organizationId, "organization.ownership.transfer", { request, resource: `member:${params.userId}:owner_assignment` });
    const assignment = await assignOrganizationRole({ organizationId, userId: params.userId, role: body.role, assignedByUserId: user.id });
    return NextResponse.json({ data: { assigned: true, assignmentId: assignment.id } });
  } catch (error) {
    if (error instanceof RoleServiceError) return NextResponse.json({ error: { code: "ROLE_ASSIGNMENT_REJECTED", message: error.message } }, { status: error.status });
    throw error;
  }
});

export const DELETE = withOrganizationRoute<Params>("organization.members.manage", async ({ request, organizationId, params, user }) => {
  try {
    const limit = await enforceOrgUserLimits(request, { route: "/api/organizations/[organizationId]/members/[userId]", organizationId, actorUserId: user.id }, [
      { policy: "admin.mutate.user", dimensions: [{ type: "user", value: user.id }] }
    ]);
    if (!limit.allowed) return rateLimitResponse(limit);
    await removeOrganizationMember(organizationId, params.userId);
    return NextResponse.json({ data: { removed: true } });
  } catch (error) {
    if (error instanceof RoleServiceError) return NextResponse.json({ error: { code: "MEMBER_REMOVAL_REJECTED", message: error.message } }, { status: error.status });
    throw error;
  }
});
