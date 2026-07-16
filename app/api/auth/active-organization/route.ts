import { NextResponse } from "next/server";
import {
  getActiveOrganizationForCurrentUser,
  setActiveOrganizationForCurrentUser,
  toSafeActiveOrganizationError
} from "@/lib/server/activeOrganization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ data: await getActiveOrganizationForCurrentUser() }, { status: 200 });
  } catch (error) {
    const safe = toSafeActiveOrganizationError(error);
    return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
export async function PUT(request: Request) {
  try {
    let body: { organizationId?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "The request body must be valid JSON." } }, { status: 400 });
    }
    return NextResponse.json({ data: await setActiveOrganizationForCurrentUser(body.organizationId) }, { status: 200 });
  } catch (error) {
    const safe = toSafeActiveOrganizationError(error);
    return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
