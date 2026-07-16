import "server-only";

import { getPrismaClient } from "@/lib/server/prisma";
import { requireOrganizationId } from "@/lib/organizationId";
import { Prisma } from "@/generated/prisma/client";
import { MIGRATION_IMPORT_RESOURCE_TYPES } from "@/types/migrationImport";
import type { MigrationImportVerificationReport } from "@/types/migrationImport";
import type {
  PersistenceAuthorityMode,
  PersistenceAuthorityState,
  PersistenceAuthorityVerificationSummary,
  PersistenceCutoverResult
} from "@/types/persistenceAuthority";
import { AuthorizationError } from "@/lib/server/authorization";

type TransactionClient = Prisma.TransactionClient;

export type PersistenceAuthorityErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_ORGANIZATION_ID"
  | "INVALID_REQUEST"
  | "ORGANIZATION_NOT_FOUND"
  | "BATCH_NOT_FOUND"
  | "CROSS_ORGANIZATION_BATCH"
  | "CUTOVER_NOT_ELIGIBLE"
  | "AUTHORITY_CONFLICT"
  | "DATABASE_UNAVAILABLE"
  | "DATABASE_ERROR";

export class PersistenceAuthorityServiceError extends Error {
  constructor(
    public readonly code: PersistenceAuthorityErrorCode,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "PersistenceAuthorityServiceError";
  }
}

function invalidRequest(message: string): PersistenceAuthorityServiceError {
  return new PersistenceAuthorityServiceError("INVALID_REQUEST", message, 400);
}

function classifyDatabaseError(error: unknown): PersistenceAuthorityServiceError {
  if (error instanceof PersistenceAuthorityServiceError) return error;
  const candidate = error as { code?: string; message?: string } | null;
  const message = candidate?.message?.toLowerCase() ?? "";
  if (message.includes("database_url") || message.includes("connection") || ["P1001", "P1002", "P1017", "P2024"].includes(candidate?.code ?? "")) {
    return new PersistenceAuthorityServiceError("DATABASE_UNAVAILABLE", "The persistence authority database is unavailable.", 503);
  }
  if (candidate?.code === "P2021" || message.includes("does not exist")) {
    return new PersistenceAuthorityServiceError("DATABASE_UNAVAILABLE", "The persistence authority schema is unavailable.", 503);
  }
  return new PersistenceAuthorityServiceError("DATABASE_ERROR", "The persistence authority request could not be completed.", 500);
}

export function validateOrganizationId(value: unknown): string {
  try {
    return requireOrganizationId(value as string, "Persistence authority request");
  } catch {
    throw new PersistenceAuthorityServiceError("INVALID_ORGANIZATION_ID", "organizationId must be a non-empty string.", 400);
  }
}

async function requireOrganizationExists(tx: TransactionClient, organizationId: string): Promise<void> {
  const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (!organization) {
    throw new PersistenceAuthorityServiceError("ORGANIZATION_NOT_FOUND", `Organization ${organizationId} was not found.`, 404);
  }
}

type AuthorityRow = {
  organizationId: string;
  authority: PersistenceAuthorityMode;
  previousAuthority: PersistenceAuthorityMode | null;
  migrationBatchId: string | null;
  reason: string | null;
  cutoverAt: Date | null;
  updatedAt: Date;
};

async function buildVerificationSummary(
  tx: TransactionClient,
  organizationId: string,
  batchId: string
): Promise<PersistenceAuthorityVerificationSummary | null> {
  const batch = await tx.migrationImportBatch.findUnique({
    where: { id: batchId },
    include: { resources: { select: { status: true } } }
  });
  if (!batch || batch.organizationId !== organizationId) return null;
  const unresolvedConflictCount = await tx.migrationImportConflict.count({ where: { batchId, status: "open" } });
  const report = batch.verificationReport as unknown as MigrationImportVerificationReport | null;
  return {
    batchId: batch.id,
    batchStatus: batch.status,
    overallStatus: report?.overallStatus ?? null,
    unresolvedConflictCount,
    verifiedCheckpointCount: batch.resources.filter((resource) => resource.status === "verified").length,
    totalCheckpointCount: batch.resources.length,
    verificationCompletedAt: batch.verificationCompletedAt?.toISOString() ?? null
  };
}

function defaultState(organizationId: string): PersistenceAuthorityState {
  return {
    organizationId,
    authority: "local",
    previousAuthority: null,
    migrationBatchId: null,
    reason: null,
    cutoverAt: null,
    updatedAt: null,
    hasRecord: false,
    verification: null
  };
}

async function toState(
  tx: TransactionClient,
  organizationId: string,
  row: AuthorityRow | null
): Promise<PersistenceAuthorityState> {
  if (!row) return defaultState(organizationId);
  const verification = row.migrationBatchId
    ? await buildVerificationSummary(tx, organizationId, row.migrationBatchId)
    : null;
  return {
    organizationId: row.organizationId,
    authority: row.authority,
    previousAuthority: row.previousAuthority,
    migrationBatchId: row.migrationBatchId,
    reason: row.reason,
    cutoverAt: row.cutoverAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    hasRecord: true,
    verification
  };
}

/**
 * Read the durable authority for one organization. A missing row is not an
 * error: it resolves to the safe `local` default. This endpoint reads no
 * secrets and never mutates state.
 */
export async function getPersistenceAuthorityState(organizationId: string): Promise<PersistenceAuthorityState> {
  const id = validateOrganizationId(organizationId);
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      await requireOrganizationExists(tx, id);
      const row = await tx.organizationPersistenceAuthority.findUnique({ where: { organizationId: id } });
      return toState(tx, id, row as AuthorityRow | null);
    });
  } catch (error) {
    throw classifyDatabaseError(error);
  }
}

interface EligibilityAssessment {
  eligible: boolean;
  reasons: string[];
}

/**
 * Cutover eligibility is deliberately strict and relies on the VERIFIED batch
 * only (Batch 5.7 known limitation: conflict resolution does not reset a
 * conflicted checkpoint for same-batch retry, so a stale conflicted batch must
 * never be reasoned around). Every condition below must hold.
 */
async function assessCutoverEligibility(
  tx: TransactionClient,
  organizationId: string,
  batchId: string
): Promise<EligibilityAssessment> {
  const reasons: string[] = [];
  const batch = await tx.migrationImportBatch.findUnique({
    where: { id: batchId },
    include: { resources: { select: { resourceType: true, status: true } } }
  });
  if (!batch) {
    throw new PersistenceAuthorityServiceError("BATCH_NOT_FOUND", `Migration batch ${batchId} was not found.`, 404);
  }
  // Ownership safety: a verified batch for Org X can never cut over Org Y.
  if (batch.organizationId !== organizationId) {
    throw new PersistenceAuthorityServiceError(
      "CROSS_ORGANIZATION_BATCH",
      `Migration batch ${batchId} belongs to organization ${batch.organizationId}, not ${organizationId}.`,
      409
    );
  }

  if (batch.status !== "verified") {
    reasons.push(`Batch status is "${batch.status}"; a verified batch is required.`);
  }

  const report = batch.verificationReport as unknown as MigrationImportVerificationReport | null;
  if (!report) {
    reasons.push("Batch has no verification report.");
  } else if (report.overallStatus !== "passed") {
    reasons.push(`Verification report status is "${report.overallStatus}"; a passed report is required.`);
  }

  const expectedCheckpoints = MIGRATION_IMPORT_RESOURCE_TYPES.length;
  if (batch.resources.length !== expectedCheckpoints) {
    reasons.push(`Batch has ${batch.resources.length}/${expectedCheckpoints} resource checkpoints.`);
  }
  const unverified = batch.resources.filter((resource) => resource.status !== "verified");
  if (unverified.length > 0) {
    reasons.push(`${unverified.length} of ${expectedCheckpoints} checkpoints are not verified.`);
  }

  const unresolvedConflictCount = await tx.migrationImportConflict.count({ where: { batchId, status: "open" } });
  if (unresolvedConflictCount > 0) {
    reasons.push(`${unresolvedConflictCount} unresolved migration conflict(s) remain.`);
  }

  return { eligible: reasons.length === 0, reasons };
}

/**
 * Explicitly and atomically cut one organization over to SERVER authority,
 * bound to the exact verified MigrationImportBatch that proved its PostgreSQL
 * state. This performs NO data import and reruns NO migration; localStorage is
 * never touched. Cutover is deterministic and idempotent:
 *   - re-issuing the same batch after cutover is a safe no-op;
 *   - issuing a different batch after cutover is rejected (cutover is one-way
 *     for Batch 5.8; server authority does not automatically revert to local).
 */
export async function cutOverToServerAuthority(
  organizationId: string,
  migrationBatchId: unknown,
  reason?: string
): Promise<PersistenceCutoverResult> {
  const id = validateOrganizationId(organizationId);
  if (typeof migrationBatchId !== "string" || migrationBatchId.trim().length === 0) {
    throw invalidRequest("migrationBatchId must be a non-empty string.");
  }
  const batchId = migrationBatchId;
  const prisma = getPrismaClient();

  try {
    return await prisma.$transaction(async (tx) => {
      await requireOrganizationExists(tx, id);
      const existing = await tx.organizationPersistenceAuthority.findUnique({ where: { organizationId: id } }) as AuthorityRow | null;

      // Idempotency / one-way guard evaluated before eligibility so an
      // already-server organization returns deterministically.
      if (existing && existing.authority === "server") {
        if (existing.migrationBatchId === batchId) {
          return {
            organizationId: id,
            authority: "server" as const,
            migrationBatchId: existing.migrationBatchId,
            cutoverAt: existing.cutoverAt?.toISOString() ?? null,
            idempotent: true,
            state: await toState(tx, id, existing)
          };
        }
        throw new PersistenceAuthorityServiceError(
          "AUTHORITY_CONFLICT",
          `Organization ${id} is already server-authoritative under batch ${existing.migrationBatchId ?? "unknown"}; cutover is one-way and cannot be re-pointed to batch ${batchId}.`,
          409
        );
      }

      const eligibility = await assessCutoverEligibility(tx, id, batchId);
      if (!eligibility.eligible) {
        throw new PersistenceAuthorityServiceError(
          "CUTOVER_NOT_ELIGIBLE",
          `Cutover rejected for organization ${id}: ${eligibility.reasons.join(" ")}`,
          409
        );
      }

      const now = new Date();
      const saved = await tx.organizationPersistenceAuthority.upsert({
        where: { organizationId: id },
        create: {
          organizationId: id,
          authority: "server",
          previousAuthority: existing?.authority ?? "local",
          migrationBatchId: batchId,
          reason: reason ?? "Explicit verified-batch cutover.",
          cutoverAt: now
        },
        update: {
          authority: "server",
          previousAuthority: existing?.authority ?? "local",
          migrationBatchId: batchId,
          reason: reason ?? "Explicit verified-batch cutover.",
          cutoverAt: now
        }
      }) as AuthorityRow;

      return {
        organizationId: id,
        authority: "server" as const,
        migrationBatchId: saved.migrationBatchId,
        cutoverAt: saved.cutoverAt?.toISOString() ?? null,
        idempotent: false,
        state: await toState(tx, id, saved)
      };
    });
  } catch (error) {
    throw classifyDatabaseError(error);
  }
}

export function toSafePersistenceAuthorityError(error: unknown): { code: string; message: string; status: number } {
  if (error instanceof AuthorizationError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  const safe = error instanceof PersistenceAuthorityServiceError ? error : classifyDatabaseError(error);
  return { code: safe.code, message: safe.message, status: safe.status };
}
