import "server-only";

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/server/prisma";

export const AUTH_SESSION_COOKIE = "oip_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const PASSWORD_HASH_VERSION = "scrypt-v1";

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
};

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
function derivePasswordKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16_384, r: 8, p: 1 }, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await derivePasswordKey(password, salt);
  return [PASSWORD_HASH_VERSION, salt.toString("base64url"), derivedKey.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [version, saltEncoded, keyEncoded] = encodedHash.split("$");
  if (version !== PASSWORD_HASH_VERSION || !saltEncoded || !keyEncoded) return false;

  try {
    const salt = Buffer.from(saltEncoded, "base64url");
    const expected = Buffer.from(keyEncoded, "base64url");
    const actual = await derivePasswordKey(password, salt);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000
  };
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.authSession.create({
    data: { tokenHash: tokenHash(token), userId, expiresAt }
  });
  return { token, expiresAt };
}

export async function deleteSession(token: string | null | undefined): Promise<void> {
  if (!token) return;
  await prisma.authSession.deleteMany({ where: { tokenHash: tokenHash(token) } });
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const token = (await cookies()).get(AUTH_SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.authSession.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: { select: { id: true, name: true, email: true } } }
  });
  if (!session) return null;

  if (session.expiresAt <= new Date()) {
    await deleteSession(token);
    return null;
  }

  return session.user;
}
