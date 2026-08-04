import { NextResponse } from "next/server";

import {
  loadTicketPage,
  loadTicketRecords,
  saveTicketRecords
} from "@/lib/server/persistenceService";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";
import type { TicketRecord, TicketRecordFilter } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILTERS = new Set<TicketRecordFilter>([
  "all",
  "heavily_edited",
  "cold_start",
  "uncategorized",
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

export const PUT = withOrganizationRoute("ticket.submit", async ({ request, organizationId }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "The request body must be valid JSON." } },
      { status: 400 }
    );
  }
  await saveTicketRecords(organizationId, body as TicketRecord[]);
  return NextResponse.json({ data: { saved: true } }, { status: 200 });
});
