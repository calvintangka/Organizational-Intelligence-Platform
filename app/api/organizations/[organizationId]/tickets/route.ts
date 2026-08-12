import { NextResponse } from "next/server";

import {
  loadTicketPage,
  loadTicketRecords,
  saveClientTicketRecords
} from "@/lib/server/persistenceService";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import { enforceOrgUserLimits, rateLimitResponse } from "@/lib/server/rateLimit";
import { TicketWriteError } from "@/types";
import type { TicketRecordFilter } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILTERS = new Set<TicketRecordFilter>([
  "all",
  "heavily_edited",
  "cold_start",
  "uncategorized",
  "waiting_for_customer",
  "rejected",
  "discarded"
]);

function integerParam(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return Number.NaN;
  return Number(value);
}

export const GET = withOrganizationRoute(async ({ request, organizationId }) => {
  const query = new URL(request.url).searchParams;
  // Full collection reads remain an explicit compatibility path for migration
  // and export tooling. The application hydration and Cases UI never use it.
  if (query.get("full") === "true") {
    const limit = await enforceOrgUserLimits(request, { route: "/api/organizations/[organizationId]/tickets?full=true", organizationId }, [
      { policy: "export.full.organization", dimensions: [{ type: "organization", value: organizationId }] }
    ]);
    if (!limit.allowed) return rateLimitResponse(limit);
    return NextResponse.json({ data: await loadTicketRecords(organizationId) }, { status: 200 });
  }
  const filterValue = query.get("filter") ?? "all";
  const filter = FILTERS.has(filterValue as TicketRecordFilter)
    ? filterValue as TicketRecordFilter
    : undefined;
  if (!filter) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "The ticket filter is invalid." } },
      { status: 400 }
    );
  }
  const data = await loadTicketPage(organizationId, {
    page: integerParam(query.get("page"), 1),
    pageSize: integerParam(query.get("pageSize"), 20),
    search: query.get("search") ?? "",
    filter
  });
  return NextResponse.json({ data }, { status: 200 });
});

/**
 * RSS-1.2S3 — server-owned ticket write contract.
 *
 * This compatibility route accepts ONLY client-owned fields. Any server-owned
 * authority field (status, actorId, resolutionMode, resolution, reflection,
 * classification, memoryMatch, validationRecordIds, labels, draftSource,
 * createdAt, processing metadata, intakeMode, bulkClusterId) is rejected with
 * `AUTHORITY_FIELD_REJECTED`; a cross-organization `orgId` is rejected with
 * `CROSS_ORGANIZATION_REJECTED`. The server derives every authoritative field
 * from the authenticated session, the authenticated organization, and the
 * server clock. State changes go through the transition endpoint
 * `POST .../tickets/[ticketId]/transition`.
 */
export const PUT = withOrganizationRoute("ticket.submit", async ({ request, organizationId, user }) => {
  const limit = await enforceOrgUserLimits(request, { route: "/api/organizations/[organizationId]/tickets", organizationId, actorUserId: user.id }, [
    { policy: "ticket.submit.user", dimensions: [{ type: "user", value: user.id }] },
    { policy: "ticket.submit.organization", dimensions: [{ type: "organization", value: organizationId }] }
  ]);
  if (!limit.allowed) return rateLimitResponse(limit);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "The request body must be valid JSON." } },
      { status: 400 }
    );
  }
  if (!Array.isArray(body)) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "The ticket payload must be an array of client-owned ticket records." } },
      { status: 400 }
    );
  }
  try {
    await saveClientTicketRecords(organizationId, user.id, body);
  } catch (error) {
    if (error instanceof TicketWriteError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    throw error;
  }
  return NextResponse.json({ data: { saved: true } }, { status: 200 });
});
