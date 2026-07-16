import { NextResponse } from "next/server";
import {
  createSession,
  normalizeEmail,
  sessionCookieOptions,
  verifyPassword,
  AUTH_SESSION_COOKIE
} from "@/lib/auth";
import { prisma } from "@/lib/server/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: { email?: unknown; password?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid request body." } }, { status: 400 });
  }

  const email = typeof payload.email === "string" ? normalizeEmail(payload.email) : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: { message: "Email and password are required." } }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: { message: "Invalid email or password." } }, { status: 401 });
  }

  const session = await createSession(user.id);
  const response = NextResponse.json({ data: { id: user.id, name: user.name, email: user.email } });
  response.cookies.set(AUTH_SESSION_COOKIE, session.token, sessionCookieOptions());
  return response;
}
