import { NextResponse } from "next/server";
import {
  createSession,
  normalizeEmail,
  sessionCookieOptions,
  verifyPassword,
  AUTH_SESSION_COOKIE
} from "@/lib/auth";
import { prisma } from "@/lib/server/prisma";
import {
  addressDimension,
  enforceRateLimit,
  rateLimitResponse,
  rateLimiter,
  requestIdentity
} from "@/lib/server/rateLimit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // Cheap request validation (no authentication, no verification, no limiter).
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

  // Abuse-control decision BEFORE expensive password verification. Two
  // independent dimensions are enforced: the network identity and the
  // normalized account. Denials are account-neutral and carry Retry-After.
  const { requestId, correlationId } = requestIdentity(request);
  const ctx = { route: "/api/auth/login", requestId, correlationId };
  const ipDecision = await enforceRateLimit("auth.login.ip", [addressDimension(request)], ctx);
  if (!ipDecision.allowed) return rateLimitResponse(ipDecision);
  const accountDecision = await enforceRateLimit("auth.login.account", [{ type: "account", value: email }], ctx);
  if (!accountDecision.allowed) return rateLimitResponse(accountDecision);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: { message: "Invalid email or password." } }, { status: 401 });
  }

  // A successful login clears the account-failure window so a legitimate user
  // is never permanently locked out by an attacker's failed attempts.
  await rateLimiter.reset("auth.login.account", "account", email);

  const session = await createSession(user.id);
  const response = NextResponse.json({ data: { id: user.id, name: user.name, email: user.email } });
  response.cookies.set(AUTH_SESSION_COOKIE, session.token, sessionCookieOptions());
  return response;
}
