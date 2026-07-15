import { NextResponse } from "next/server";
import {
  listOrganizationProfiles,
  toSafePersistenceError,
  upsertOrganizationProfiles
} from "@/lib/server/persistenceService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ data: await listOrganizationProfiles() }, { status: 200 });
  } catch (error) {
    const safe = toSafePersistenceError(error);
    return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}

/** Upsert the provided organization profiles. Deletion only via DELETE. */
export async function PUT(request: Request) {
  try {
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
    return NextResponse.json({ data: await upsertOrganizationProfiles(body) }, { status: 200 });
  } catch (error) {
    const safe = toSafePersistenceError(error);
    return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
