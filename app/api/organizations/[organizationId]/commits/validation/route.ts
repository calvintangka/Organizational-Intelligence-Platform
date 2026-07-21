import { NextResponse } from "next/server";
import { commitValidation } from "@/lib/server/persistenceService";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Transactional Human Validation / Reflection commit. The candidate lifecycle
 * update, ValidationRecord, MemoryChangeRecord, and knowledge item write
 * (including trust and version data) commit together or not at all.
 */
export const POST = withOrganizationRoute(async ({ request, organizationId, user }) => {
  // The authenticated session user is the only trusted actor identity; the
  // request body can never control validation attribution.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "The request body must be valid JSON." } },
      { status: 400 }
    );
  }
  const result = await commitValidation(organizationId, body, { id: user.id, name: user.name });
  return NextResponse.json({ data: result }, { status: 200 });
});
