import { NextResponse } from "next/server";

import {
  getPersistenceAuthorityState,
  toSafePersistenceAuthorityError,
  validateOrganizationId
} from "@/lib/server/persistenceAuthorityService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AuthorityRouteContext {
  params: Promise<{ organizationId: string }>;
}

/**
 * Read the durable persistence authority for one organization. A missing
 * authority record resolves to the safe `local` default. Prototype-only and
 * unauthenticated: this endpoint must not be internet-exposed.
 */
export async function GET(_request: Request, context: AuthorityRouteContext) {
  try {
    const { organizationId } = await context.params;
    validateOrganizationId(organizationId);
    const state = await getPersistenceAuthorityState(organizationId);
    return NextResponse.json({ data: state }, { status: 200 });
  } catch (error) {
    const safe = toSafePersistenceAuthorityError(error);
    return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
