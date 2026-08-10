import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { createSessionWithClient, hashPassword, normalizeEmail, type AuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/server/prisma";

const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export class AccountCreationError extends Error {
  constructor(
    readonly code: "INVALID_REQUEST" | "EMAIL_ALREADY_REGISTERED" | "ACCOUNT_CREATION_UNAVAILABLE",
    message: string,
    readonly status: 400 | 409 | 500
  ) {
    super(message);
    this.name = "AccountCreationError";
  }
}

type SignupInput = { name: string; email: string; password: string };

function invalid(message: string): never {
  throw new AccountCreationError("INVALID_REQUEST", message, 400);
}

function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") invalid(`${field} must be a string.`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized) invalid(`${field} is required.`);
  if (normalized.length > maxLength) invalid(`${field} must be ${maxLength} characters or fewer.`);
  if (/[\u0000-\u001F\u007F]/.test(normalized)) invalid(`${field} must not contain control characters.`);
  return normalized;
}

export function validateSignupInput(value: unknown): SignupInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("The request body must be an object.");
  const record = value as Record<string, unknown>;
  const allowed = new Set(["name", "email", "password"]);
  for (const field of Object.keys(record)) {
    if (!allowed.has(field)) invalid(`${field} is not accepted when creating an account.`);
  }
  const name = requiredString(record.name, "name", MAX_NAME_LENGTH);
  if (name.length < 2) invalid("name must be at least 2 characters.");
  const rawEmail = requiredString(record.email, "email", MAX_EMAIL_LENGTH);
  const email = normalizeEmail(rawEmail);
  if (!EMAIL_PATTERN.test(email)) invalid("email must be a valid email address.");
  if (typeof record.password !== "string") invalid("password must be a string.");
  if (record.password.length < MIN_PASSWORD_LENGTH) invalid(`password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (record.password.length > 256) invalid("password must be 256 characters or fewer.");
  return { name, email, password: record.password };
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Creates the account and its first authenticated session as one transaction.
 * A session insertion failure therefore rolls back the user row instead of
 * leaving a partially provisioned identity.
 */
export async function createAccountWithSession(value: unknown): Promise<{ user: AuthenticatedUser; sessionToken: string }> {
  const input = validateSignupInput(value);
  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name: input.name, email: input.email, passwordHash },
        select: { id: true, name: true, email: true }
      });
      const session = await createSessionWithClient(tx, user.id);
      return { user, sessionToken: session.token };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (isUniqueConflict(error)) {
      throw new AccountCreationError("EMAIL_ALREADY_REGISTERED", "An account with that email already exists.", 409);
    }
    throw error;
  }
}

export function toSafeAccountCreationError(error: unknown): { code: string; message: string; status: number } {
  if (error instanceof AccountCreationError) return { code: error.code, message: error.message, status: error.status };
  return { code: "ACCOUNT_CREATION_UNAVAILABLE", message: "Account creation is temporarily unavailable. Please retry.", status: 500 };
}
