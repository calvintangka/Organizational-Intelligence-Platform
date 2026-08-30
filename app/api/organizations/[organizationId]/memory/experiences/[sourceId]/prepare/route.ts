import { NextResponse } from "next/server";

import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { prepareOrganizationalLearning } from "@/lib/server/organizationalMemoryService";

type Params = { organizationId: string; sourceId: string };

export const POST = withOrganizationRoute<Params>("memory.learning.prepare", async ({ organizationId, params, user }) => {
  return NextResponse.json({ data: await prepareOrganizationalLearning(organizationId, params.sourceId, user.id) }, { status: 201 });
});
