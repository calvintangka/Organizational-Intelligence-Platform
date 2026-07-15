import { NextResponse } from "next/server";
import {
  allocateTicketIds,
  toSafePersistenceError,
  validateOrganizationId
} from "@/lib/server/persistenceService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AllocateRouteContext {
  params: Promise<{ organizationId: string }>;
}

/**
 * Atomically allocate one or more organization-scoped ticket IDs from the
 * database-backed TicketSequence. Success is only reported after the counter
 * increment has committed; a failed allocation claims no IDs.
 */
export async function POST(request: Request, context: AllocateRouteContext) {
  try {
    const { organizationId } = await context.params;
    validateOrganizationId(organizationId);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "The request body must be valid JSON." } },
        { status: 400 }
      );
    }
    const count = (body as { count?: unknown } | null)?.count;
    if (!Number.isInteger(count) || (count as number) < 1) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "count must be a positive integer." } },
        { status: 400 }
      );
    }
    const ticketIds = await allocateTicketIds(organizationId, count as number);
    return NextResponse.json({ data: { ticketIds } }, { status: 200 });
  } catch (error) {
    const safe = toSafePersistenceError(error);
    return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
