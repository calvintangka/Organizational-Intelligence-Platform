import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import type { CustomerTone, OrganizationProfile } from "@/types";
import { AuthorizationError } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";

const MAX_NAME_LENGTH = 160;
const MAX_INDUSTRY_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2_000;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,160}$/;

export type OrganizationCreationInput = {
  name?: unknown;
  industry?: unknown;
  description?: unknown;
  customerTone?: unknown;
  accentColor?: unknown;
  logoInitials?: unknown;
};

type ValidatedOrganizationCreationInput = {
  name: string;
  industry: string;
  description: string;
  customerTone: CustomerTone;
  accentColor: string;
  logoInitials?: string;
};

export type CreatedOrganization = {
  organization: OrganizationProfile;
  idempotentReplay: boolean;
};

export class OrganizationCreationError extends Error {
  constructor(
    readonly code: "INVALID_REQUEST" | "IDEMPOTENCY_CONFLICT" | "PROVISIONING_UNAVAILABLE",
    message: string,
    readonly status: 400 | 409 | 500
  ) {
    super(message);
    this.name = "OrganizationCreationError";
  }
}

function badRequest(message: string): never {
  throw new OrganizationCreationError("INVALID_REQUEST", message, 400);
}

function stringField(value: unknown, field: string, maximum: number, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string") badRequest(`${field} must be a string.`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized) badRequest(`${field} is required.`);
  if (normalized.length > maximum) badRequest(`${field} must be ${maximum} characters or fewer.`);
  if (/[\u0000-\u001F\u007F]/.test(normalized)) badRequest(`${field} must not contain control characters.`);
  return normalized;
}

function optionalStringField(value: unknown, field: string, maximum: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return stringField(value, field, maximum);
}

function validateTone(value: unknown): CustomerTone {
  if (value === undefined) return "professional";
  if (value === "professional" || value === "friendly" || value === "formal" || value === "empathetic") return value;
  badRequest("customerTone is invalid.");
}

function validateAccentColor(value: unknown): string {
  if (value === undefined) return "#7C3AED";
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    badRequest("accentColor must be a six-digit hex color.");
  }
  return value.toUpperCase();
}

function validateLogoInitials(value: unknown): string | undefined {
  const initials = optionalStringField(value, "logoInitials", 3);
  return initials?.toUpperCase();
}

function rejectUnknownFields(value: Record<string, unknown>): void {
  const allowed = new Set(["name", "industry", "description", "customerTone", "accentColor", "logoInitials"]);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) badRequest(`${field} is not accepted when creating an organization.`);
  }
}

export function validateOrganizationCreationInput(value: unknown): ValidatedOrganizationCreationInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) badRequest("The request body must be an object.");
  const input = value as Record<string, unknown>;
  rejectUnknownFields(input);
  const name = stringField(input.name, "name", MAX_NAME_LENGTH);
  if (name.length < 2) badRequest("name must be at least 2 characters.");
  return {
    name,
    industry: stringField(input.industry, "industry", MAX_INDUSTRY_LENGTH, "General"),
    description: optionalStringField(input.description, "description", MAX_DESCRIPTION_LENGTH) ?? "",
    customerTone: validateTone(input.customerTone),
    accentColor: validateAccentColor(input.accentColor),
    logoInitials: validateLogoInitials(input.logoInitials)
  };
}

export function validateOrganizationCreationIdempotencyKey(value: string | null): string {
  if (!value || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
    badRequest("Idempotency-Key must be 8 to 160 characters using letters, numbers, dot, underscore, colon, or hyphen.");
  }
  return value;
}

function digest(input: ValidatedOrganizationCreationInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function profileFromRow(row: {
  id: string;
  name: string;
  industry: string;
  description: string;
  settings: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): OrganizationProfile {
  const settings = row.settings && typeof row.settings === "object" && !Array.isArray(row.settings)
    ? row.settings as Record<string, unknown>
    : {};
  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    description: row.description,
    products: [],
    services: [],
    supportedDomains: [],
    businessVocabulary: [],
    supportedIssueTypes: [],
    outOfScopeTopics: [],
    customerTone: settings.customerTone === "friendly" || settings.customerTone === "formal" || settings.customerTone === "empathetic" ? settings.customerTone : "professional",
    supportBoundaries: [],
    autoResolutionThreshold: 80,
    escalationRules: [],
    ...(typeof settings.accentColor === "string" ? { accentColor: settings.accentColor } : {}),
    ...(typeof settings.logoInitials === "string" ? { logoInitials: settings.logoInitials } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    profileRevision: typeof settings._profileRevision === "number" ? settings._profileRevision : 0
  };
}

const createdOrganizationSelect = {
  id: true,
  name: true,
  industry: true,
  description: true,
  settings: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.OrganizationSelect;

async function existingRequest(userId: string, idempotencyKey: string, requestDigest: string): Promise<CreatedOrganization | null> {
  const record = await prisma.organizationCreationRequest.findUnique({
    where: { userId_idempotencyKey: { userId, idempotencyKey } },
    select: { requestDigest: true, organization: { select: createdOrganizationSelect } }
  });
  if (!record) return null;
  if (record.requestDigest !== requestDigest) {
    throw new OrganizationCreationError("IDEMPOTENCY_CONFLICT", "This Idempotency-Key was already used for a different organization request.", 409);
  }
  return { organization: profileFromRow(record.organization), idempotentReplay: true };
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isSerializationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

/**
 * Provision a tenant entirely on the server. Every durable step is in one
 * serializable transaction; a failed membership, role, metrics, audit, or
 * idempotency insert rolls back the organization row as well.
 */
export async function createOrganizationForUser(input: {
  userId: string;
  body: unknown;
  idempotencyKey: string;
  requestId?: string | null;
  correlationId?: string | null;
}): Promise<CreatedOrganization> {
  const body = validateOrganizationCreationInput(input.body);
  const idempotencyKey = validateOrganizationCreationIdempotencyKey(input.idempotencyKey);
  const requestDigest = digest(body);
  const prior = await existingRequest(input.userId, idempotencyKey, requestDigest);
  if (prior) return prior;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const replay = await tx.organizationCreationRequest.findUnique({
          where: { userId_idempotencyKey: { userId: input.userId, idempotencyKey } },
          select: { requestDigest: true, organization: { select: createdOrganizationSelect } }
        });
        if (replay) {
          if (replay.requestDigest !== requestDigest) {
            throw new OrganizationCreationError("IDEMPOTENCY_CONFLICT", "This Idempotency-Key was already used for a different organization request.", 409);
          }
          return { organization: profileFromRow(replay.organization), idempotentReplay: true };
        }

        const ownerRole = await tx.role.findUnique({ where: { key: "owner" }, select: { id: true } });
        if (!ownerRole) throw new OrganizationCreationError("PROVISIONING_UNAVAILABLE", "The Owner role is not configured.", 500);

        const organizationId = `org-${randomUUID()}`;
        const now = new Date();
        const organization = await tx.organization.create({
          data: {
            id: organizationId,
            name: body.name,
            industry: body.industry,
            description: body.description,
            settings: {
              products: [], services: [], supportedDomains: [], businessVocabulary: [], supportedIssueTypes: [], outOfScopeTopics: [],
              customerTone: body.customerTone, supportBoundaries: [], autoResolutionThreshold: 80, escalationRules: [],
              accentColor: body.accentColor, ...(body.logoInitials ? { logoInitials: body.logoInitials } : {}), _profileRevision: 0
            },
            createdAt: now
          },
          select: createdOrganizationSelect
        });
        await tx.organizationMembership.create({ data: { userId: input.userId, organizationId, role: "owner" } });
        await tx.organizationRoleAssignment.create({ data: { organizationId, userId: input.userId, roleId: ownerRole.id, assignedByUserId: input.userId } });
        await tx.orgMetrics.create({
          data: {
            organizationId, lifetimeTickets: 0, knowledgeReused: 0, autoResolutions: 0, humanResolutions: 0,
            totalResolutionTimeSec: 0, resolutionsCount: 0, memoryGrowthToday: 0, memoryGrowthDate: now.toISOString().slice(0, 10),
            mergedTickets: null, duplicatePreventions: null, knowledgeVersions: null, emergingPatternsDetected: null,
            promotedPatterns: null, aiCalls: null, aiSuccesses: null, aiFailures: null, aiFallbacks: null,
            aiAgreementSamples: null, aiAgreementTotal: null, humanAcceptedAISuggestions: null, lastUpdatedAt: now
          }
        });
        await tx.ticketSequence.create({ data: { organizationId, counter: 0, updatedAt: now } });
        await tx.organizationPersistenceAuthority.create({ data: { organizationId, authority: "server", reason: "RSS-2.2 server-owned tenant provisioning" } });
        await tx.authorizationDecisionAudit.create({
          data: {
            organizationId, actorUserId: input.userId, roleKey: "owner", capabilityKey: "organization.create",
            resource: "organizations:create", decision: "allow", reason: "organization_created; owner_assigned",
            requestId: input.requestId ?? null, correlationId: input.correlationId ?? input.requestId ?? null
          }
        });
        await tx.organizationCreationRequest.create({ data: { userId: input.userId, organizationId, idempotencyKey, requestDigest } });
        return { organization: profileFromRow(organization), idempotentReplay: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return created;
    } catch (error) {
      if (error instanceof OrganizationCreationError) throw error;
      if (isSerializationConflict(error) && attempt < 2) continue;
      if (isUniqueConflict(error)) {
        const replay = await existingRequest(input.userId, idempotencyKey, requestDigest);
        if (replay) return replay;
      }
      throw error;
    }
  }
  throw new OrganizationCreationError("PROVISIONING_UNAVAILABLE", "Organization provisioning could not be completed. Please retry.", 500);
}

export function toSafeOrganizationCreationError(error: unknown): { code: string; message: string; status: number } {
  if (error instanceof AuthorizationError) return { code: error.code, message: error.message, status: error.status };
  if (error instanceof OrganizationCreationError) return { code: error.code, message: error.message, status: error.status };
  return { code: "PROVISIONING_UNAVAILABLE", message: "Organization provisioning could not be completed. Please retry.", status: 500 };
}
