import { NextResponse } from "next/server";
import {
  resetOrganizationData,
  toSafePersistenceError,
  validateOrganizationId
} from "@/lib/server/persistenceService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ResetRouteContext {
  params: Promise<{ organizationId: string }>;
}

/**
 * Transactionally clear this organization's owned data (knowledge, candidates,
 * audit records, patterns, log, tickets, metrics, ticket sequence) without
 * deleting the organization itself. Other organizations are never touched.
 */
export async function POST(_request: Request, context: ResetRouteContext) {
  try {
    const { organizationId } = await context.params;
    validateOrganizationId(organizationId);
    await resetOrganizationData(organizationId);
    return NextResponse.json({ data: { reset: true } }, { status: 200 });
  } catch (error) {
    const safe = toSafePersistenceError(error);
    return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
