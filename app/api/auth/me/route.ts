import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

const AUTH_LOOKUP_TIMEOUT_MS = 2_500;

export async function GET() {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const user = await Promise.race([
      getCurrentUser(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Authentication lookup timed out.")), AUTH_LOOKUP_TIMEOUT_MS);
      })
    ]);

    if (!user) return NextResponse.json({ error: { message: "Authentication required." } }, { status: 401 });
    return NextResponse.json({ data: user });
  } catch (error) {
    console.warn("[auth] identity lookup unavailable", {
      message: error instanceof Error ? error.message : "Unknown authentication lookup failure"
    });
    return NextResponse.json(
      { error: { code: "AUTHENTICATION_UNAVAILABLE", message: "Authentication is temporarily unavailable." } },
      { status: 503 }
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
