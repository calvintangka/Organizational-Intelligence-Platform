import { NextResponse } from "next/server";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { getOperationsSnapshot } from "@/lib/server/operations/operationsService";

export const dynamic = "force-dynamic";

export const GET = withOrganizationRoute<{ organizationId: string; resource: string }>(async ({ request, organizationId, params, user }) => {
  const snapshot = await getOperationsSnapshot(organizationId, user.id, { limit: Number(new URL(request.url).searchParams.get("limit") ?? "100") });
  const resource = params.resource;
  const data = resource === "workers" ? snapshot.workers
    : resource === "jobs" ? snapshot.jobs
    : resource === "queues" ? snapshot.queues
    : resource === "providers" ? snapshot.providers
    : resource === "performance" ? snapshot.performance
    : resource === "dead-letter" ? snapshot.deadLetters
    : resource === "organizations" ? snapshot.organizations
    : resource === "connectors" ? snapshot.connectors
    : resource === "failures" ? snapshot.failures
    : null;
  if (!data) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Unknown operations resource." } }, { status: 404 });
  return NextResponse.json({ data, generatedAt: snapshot.generatedAt });
});
