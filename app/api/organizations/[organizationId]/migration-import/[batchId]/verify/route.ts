import { NextResponse } from "next/server";

import {
  getMigrationVerification,
  verifyMigrationImport
} from "@/lib/server/migrationVerificationService";
import { toSafeMigrationImportError } from "@/lib/server/migrationImportService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ organizationId: string; batchId: string }> }
) {
  try {
    const { organizationId, batchId } = await context.params;
    const result = await verifyMigrationImport(organizationId, batchId);
    return NextResponse.json({ data: result }, { status: result.status === "passed" ? 200 : 409 });
  } catch (error) {
    const safe = toSafeMigrationImportError(error);
    return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string; batchId: string }> }
) {
  try {
    const { organizationId, batchId } = await context.params;
    const result = await getMigrationVerification(organizationId, batchId);
    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
    const safe = toSafeMigrationImportError(error);
    return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
