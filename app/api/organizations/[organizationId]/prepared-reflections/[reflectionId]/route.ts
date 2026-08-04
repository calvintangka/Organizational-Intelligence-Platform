import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { jobContext } from "@/lib/server/jobs/http";
import { preparedReflectionStore } from "@/lib/server/jobs/preparedReflectionStore";

export const GET = withOrganizationRoute<{ organizationId: string; reflectionId: string }>(async ({ organizationId, params, user }) => {
  const reflection = await preparedReflectionStore.get(jobContext(organizationId, user, randomUUID()), params.reflectionId);
  return NextResponse.json({ data: reflection });
});
