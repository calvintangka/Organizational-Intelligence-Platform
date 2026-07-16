import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_SESSION_COOKIE, deleteSession, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const token = (await cookies()).get(AUTH_SESSION_COOKIE)?.value;
  await deleteSession(token);
  const response = NextResponse.json({ data: { loggedOut: true } });
  response.cookies.set(AUTH_SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
