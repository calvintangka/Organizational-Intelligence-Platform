import { NextResponse } from "next/server";

import {
  cutOverToServerAuthority,
  toSafePersistenceAuthorityError,
  validateOrganizationId
} from "@/lib/server/persistenceAuthorityService";
import { requireOrganizationMembership } from "@/lib/server/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CutoverRouteContext {
  params: Promise<{ organizationId: string }>;
}

/**
 * Explicitly cut one organization over to SERVER persistence authority, bound
 * to a verified MigrationImportBatch. Eligibility is enforced server-side; the
 * operation imports no data, reruns no migration, and never deletes or touches
 * localStorage. Idempotent for the same batch; rejected for a different batch
 * once server-authoritative (cutover is one-way in Batch 5.8).
 *
 * Prototype-only and unauthenticated: this endpoint must not be internet-exposed.
 */
export async function POST(request: Request, context: CutoverRouteContext) {
  try {
    const { organizationId } = await context.params;
    validateOrganizationId(organizationId);
    await requireOrganizationMembership(organizationId);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "The request body must be valid JSON." } },
        { status: 400 }
      );
    }
    const migrationBatchId = (body as { migrationBatchId?: unknown } | null)?.migrationBatchId;
    const reason = (body as { reason?: unknown } | null)?.reason;
    const result = await cutOverToServerAuthority(
      organizationId,
      migrationBatchId,
      typeof reason === "string" ? reason : undefined
    );
    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
    const safe = toSafePersistenceAuthorityError(error);
    return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
