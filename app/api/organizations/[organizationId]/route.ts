import { NextResponse } from "next/server";
import {
  getOrganizationProfile,
  toSafePersistenceError,
  validateOrganizationId
} from "@/lib/server/persistenceService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface OrganizationRouteContext {
  params: Promise<{ organizationId: string }>;
}

export async function GET(_request: Request, context: OrganizationRouteContext) {
  try {
    const { organizationId } = await context.params;
    validateOrganizationId(organizationId);
    return NextResponse.json({ data: await getOrganizationProfile(organizationId) }, { status: 200 });
  } catch (error) {
    const safe = toSafePersistenceError(error);
    return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
