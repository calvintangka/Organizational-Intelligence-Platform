import { NextResponse } from "next/server";
import {
  deleteOrganization,
  getOrganizationProfile,
  upsertOrganizationProfile
} from "@/lib/server/persistenceService";
import type { OrganizationProfile } from "@/types";
import { withOrganizationRoute } from "@/lib/server/organizationRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withOrganizationRoute(async ({ organizationId }) => {
  return NextResponse.json({ data: await getOrganizationProfile(organizationId) }, { status: 200 });
});

/** Upsert this organization's profile. The route id is authoritative. */
export const PUT = withOrganizationRoute("organization.profile.update", async ({ request, organizationId }) => {
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
  if (typeof profile.id === "string" && profile.id !== organizationId) {
    return NextResponse.json(
      { error: { code: "CONFLICT", message: "The profile id must match the organization in the request path." } },
      { status: 409 }
    );
  }
  return NextResponse.json({ data: await upsertOrganizationProfile({ ...profile, id: organizationId }) }, { status: 200 });
});

/** Delete this organization and all of its owned data (verified cascade). */
export const DELETE = withOrganizationRoute("organization.delete", async ({ organizationId }) => {
  await deleteOrganization(organizationId);
  return NextResponse.json({ data: { deleted: true } }, { status: 200 });
});
