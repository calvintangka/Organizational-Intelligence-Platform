import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Process liveness endpoint for hosting-provider health checks.
 *
 * Keep this route deliberately independent of PostgreSQL, authentication, AI,
 * and business state so a platform can verify that the Node process is alive
 * without creating application-side load or disclosing internal details.
 */
export async function GET() {
  return NextResponse.json(
    { status: "ok" },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" }
    }
  );
}
