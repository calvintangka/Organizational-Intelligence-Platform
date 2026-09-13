import { NextResponse } from "next/server";

import { askOrganization } from "@/lib/server/askService";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";

export const dynamic = "force-dynamic";

export const POST = withOrganizationRoute("ask.query", async ({ request, organizationId, user }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const source = body?.requestedSource;
  if (source !== undefined && !["memory", "current_data", "combined", "auto"].includes(String(source))) {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "requestedSource must be memory, current_data, combined, or auto." } }, { status: 400 });
  }
  const result = await askOrganization({
    organizationId,
    userId: user.id,
    query: typeof body?.query === "string" ? body.query : "",
    domainIdOrKey: typeof body?.domainId === "string" ? body.domainId : undefined,
    requestedSource: source as "memory" | "current_data" | "combined" | "auto" | undefined
  });
  return NextResponse.json({ data: result });
});
