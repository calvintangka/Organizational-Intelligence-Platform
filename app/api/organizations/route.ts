import { NextResponse } from "next/server";
import {
  listOrganizationProfilesForUser,
  toSafePersistenceError,
  upsertOrganizationProfiles,
  validateOrganizationId
} from "@/lib/server/persistenceService";
import { requireAuthenticatedUser, requireCapability } from "@/lib/server/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    return NextResponse.json({ data: await listOrganizationProfilesForUser(user.id) }, { status: 200 });
  } catch (error) {
    const safe = toSafePersistenceError(error);
    return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}

/** Upsert the provided organization profiles. Deletion only via DELETE. */
export async function PUT(request: Request) {
  try {
    await requireAuthenticatedUser();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "The request body must be valid JSON." } },
        { status: 400 }
      );
    }
    if (!Array.isArray(body)) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "The organization list payload must be an array." } },
        { status: 400 }
      );
    }
    for (const profile of body) {
      const id = validateOrganizationId((profile as { id?: unknown } | null)?.id);
      await requireCapability(id, "organization.profile.update", { request, resource: "organizations:bulk_update" });
    }
    return NextResponse.json({ data: await upsertOrganizationProfiles(body) }, { status: 200 });
  } catch (error) {
    const safe = toSafePersistenceError(error);
    return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
