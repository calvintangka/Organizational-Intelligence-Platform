import { NextResponse } from "next/server";

import {
  intakeMigrationExportPackage,
  toSafeMigrationImportError
} from "@/lib/server/migrationImportService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PACKAGE_BYTES = 25 * 1024 * 1024;

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> }
) {
  const { organizationId } = await context.params;
  const advertisedLength = Number(request.headers.get("content-length") ?? "0");
  if (advertisedLength > MAX_PACKAGE_BYTES) {
    return NextResponse.json(
      { error: { code: "PACKAGE_TOO_LARGE", message: "The migration package exceeds the 25 MiB prototype intake limit." } },
      { status: 413 }
    );
  }

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_PACKAGE_BYTES) {
      return NextResponse.json(
        { error: { code: "PACKAGE_TOO_LARGE", message: "The migration package exceeds the 25 MiB prototype intake limit." } },
        { status: 413 }
      );
    }
    if (rawBody.trim().length === 0) {
      return NextResponse.json({ error: { code: "INVALID_EXPORT_PACKAGE", message: "A migration package is required." } }, { status: 400 });
    }
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: { code: "INVALID_EXPORT_PACKAGE", message: "The request body must be valid JSON." } }, { status: 400 });
    }
    const result = await intakeMigrationExportPackage(body, organizationId);
    return NextResponse.json({ data: result }, { status: result.created ? 201 : 200 });
  } catch (error) {
    const safe = toSafeMigrationImportError(error);
    return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
