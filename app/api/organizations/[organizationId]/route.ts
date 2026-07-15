import { NextResponse } from "next/server";
import {
  deleteOrganization,
  getOrganizationProfile,
  toSafePersistenceError,
  upsertOrganizationProfile,
  validateOrganizationId
} from "@/lib/server/persistenceService";
import type { OrganizationProfile } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface OrganizationRouteContext {
  params: Promise<{ organizationId: string }>;
}

function errorResponse(error: unknown) {
  const safe = toSafePersistenceError(error);
  return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
}

export async function GET(_request: Request, context: OrganizationRouteContext) {
  try {
    const { organizationId } = await context.params;
    validateOrganizationId(organizationId);
    return NextResponse.json({ data: await getOrganizationProfile(organizationId) }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Upsert this organization's profile. The route id is authoritative. */
export async function PUT(request: Request, context: OrganizationRouteContext) {
  try {
    const { organizationId } = await context.params;
    const id = validateOrganizationId(organizationId);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "The request body must be valid JSON." } },
        { status: 400 }
      );
    }
    const profile = body as OrganizationProfile;
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "The organization profile payload must be an object." } },
        { status: 400 }
      );
    }
    if (typeof profile.id === "string" && profile.id !== id) {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "The profile id must match the organization in the request path." } },
        { status: 409 }
      );
    }
    return NextResponse.json({ data: await upsertOrganizationProfile({ ...profile, id }) }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Delete this organization and all of its owned data (verified cascade). */
export async function DELETE(_request: Request, context: OrganizationRouteContext) {
  try {
    const { organizationId } = await context.params;
    validateOrganizationId(organizationId);
    await deleteOrganization(organizationId);
    return NextResponse.json({ data: { deleted: true } }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
