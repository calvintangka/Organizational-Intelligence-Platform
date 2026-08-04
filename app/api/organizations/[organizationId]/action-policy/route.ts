import { NextResponse } from "next/server";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { getActionPolicy, validatePolicyUpdate } from "@/lib/server/actions/policyEngine";
import { prisma } from "@/lib/server/prisma";

export const dynamic = "force-dynamic";

export const GET = withOrganizationRoute("organization.read", async ({ organizationId }) => NextResponse.json({ data: await getActionPolicy(organizationId) }));

export const PATCH = withOrganizationRoute("organization.settings.manage", async ({ request, organizationId, user }) => {
  try {
    const body = await request.json() as Record<string, unknown>;
    const update = validatePolicyUpdate({ allowedLabels: body.allowedLabels, disabledLabels: body.disabledLabels, maximumLabelsPerTicket: body.maximumLabelsPerTicket });
    const current = await getActionPolicy(organizationId);
    const policy = await prisma.organizationActionPolicy.update({ where: { organizationId }, data: { version: current.version + 1, allowedLabels: update.allowedLabels, disabledLabels: update.disabledLabels, maximumLabelsPerTicket: update.maximumLabelsPerTicket, updatedByActorId: user.id } });
    return NextResponse.json({ data: { organizationId, version: policy.version, allowedLabels: update.allowedLabels, disabledLabels: update.disabledLabels, maximumLabelsPerTicket: update.maximumLabelsPerTicket } });
  } catch (error) {
    return NextResponse.json({ error: { code: "INVALID_POLICY", message: error instanceof Error ? error.message : "The action policy is invalid." } }, { status: 400 });
  }
});
