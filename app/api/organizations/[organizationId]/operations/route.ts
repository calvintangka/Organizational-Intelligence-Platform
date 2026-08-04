import { NextResponse } from "next/server";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { getOperationsSnapshot } from "@/lib/server/operations/operationsService";

export const dynamic = "force-dynamic";

export const GET = withOrganizationRoute(async ({ request, organizationId, user }) => {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "100");
  const data = await getOperationsSnapshot(organizationId, user.id, {
    limit: Number.isFinite(limit) ? limit : 100,
    status: url.searchParams.get("status") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    worker: url.searchParams.get("worker") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
    provider: url.searchParams.get("provider") ?? undefined,
    retryable: url.searchParams.has("retryable") ? url.searchParams.get("retryable") === "true" : undefined,
    errorClass: url.searchParams.get("errorClass") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    requestId: url.searchParams.get("requestId") ?? undefined,
    correlationId: url.searchParams.get("correlationId") ?? undefined
  });
  return NextResponse.json({ data });
});
