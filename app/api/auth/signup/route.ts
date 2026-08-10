import { NextResponse } from "next/server";
import { AUTH_SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { createAccountWithSession, toSafeAccountCreationError, validateSignupInput } from "@/lib/server/accountCreationService";
import { addressDimension, enforceRateLimit, rateLimitResponse, requestIdentity } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "The request body must be valid JSON." } }, { status: 400 });
  }

  try {
    // Validate before costly hashing, then use the normalized identity only as
    // a hashed shared-limiter dimension — never as durable raw limiter data.
    const input = validateSignupInput(body);
    const { requestId, correlationId } = requestIdentity(request);
    const context = { route: "/api/auth/signup", requestId, correlationId };
    const ip = await enforceRateLimit("auth.signup.ip", [addressDimension(request)], context);
    if (!ip.allowed) return rateLimitResponse(ip);
    const account = await enforceRateLimit("auth.signup.account", [{ type: "account", value: input.email }], context);
    if (!account.allowed) return rateLimitResponse(account);

    const created = await createAccountWithSession(input);
    const response = NextResponse.json({ data: created.user }, { status: 201 });
    response.cookies.set(AUTH_SESSION_COOKIE, created.sessionToken, sessionCookieOptions());
    return response;
  } catch (error) {
    const safe = toSafeAccountCreationError(error);
    return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
