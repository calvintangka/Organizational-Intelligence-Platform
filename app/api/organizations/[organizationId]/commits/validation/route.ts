import { NextResponse } from "next/server";
import {
  commitValidation,
  toSafePersistenceError,
  validateOrganizationId
} from "@/lib/server/persistenceService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CommitRouteContext {
  params: Promise<{ organizationId: string }>;
}

/**
 * Transactional Human Validation / Reflection commit. The candidate lifecycle
 * update, ValidationRecord, MemoryChangeRecord, and knowledge item write
 * (including trust and version data) commit together or not at all.
 */
export async function POST(request: Request, context: CommitRouteContext) {
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
    const result = await commitValidation(organizationId, body);
    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
    const safe = toSafePersistenceError(error);
    return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
