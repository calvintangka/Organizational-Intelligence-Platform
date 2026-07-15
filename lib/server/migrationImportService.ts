import "server-only";

import { getPrismaClient } from "@/lib/server/prisma";
import { requireOrganizationId } from "@/lib/organizationId";
import {
  LOCAL_STORAGE_EXPORT_FORMAT,
  LOCAL_STORAGE_EXPORT_VERSION
} from "@/types/migrationExport";
import {
  MIGRATION_IMPORT_BATCH_STATUSES,
  MIGRATION_IMPORT_CONFLICT_STATUSES,
  MIGRATION_IMPORT_CONFLICT_TYPES,
  MIGRATION_IMPORT_RESOURCE_STATUSES,
  MIGRATION_IMPORT_RESOURCE_TYPES,
  type MigrationImportBatchStatus,
  type MigrationImportConflictInput,
  type MigrationImportConflictStatus,
  type MigrationImportManifestInput,
  type MigrationImportResourceCheckpointInput,
  type MigrationImportResourceType
} from "@/types/migrationImport";
import type {
  MigrationImportBatchSummary,
  MigrationImportConflictSummary
} from "@/types/migrationImport";
import { Prisma } from "@/generated/prisma/client";

export type MigrationImportServiceErrorCode =
  | "INVALID_MANIFEST"
  | "INVALID_RESOURCE"
  | "ORGANIZATION_NOT_FOUND"
  | "IMPORT_NOT_FOUND"
  | "CONFLICT"
  | "INVALID_STATUS_TRANSITION";

export class MigrationImportServiceError extends Error {
  constructor(
    public readonly code: MigrationImportServiceErrorCode,
    message: string
  ) {
    super(message);
    this.name = "MigrationImportServiceError";
  }
}

type TransactionClient = Prisma.TransactionClient;

function invalidManifest(message: string): never {
  throw new MigrationImportServiceError("INVALID_MANIFEST", message);
}

function invalidResource(message: string): never {
  throw new MigrationImportServiceError("INVALID_RESOURCE", message);
}

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) invalidManifest(`${field} must be a non-empty string.`);
  return value;
}

function requireDigest(value: unknown, field: string, optional = false): string | undefined {
  if (value === undefined || value === null) {
    if (optional) return undefined;
    invalidManifest(`${field} is required.`);
  }
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) {
    invalidManifest(`${field} must be a SHA-256 hexadecimal digest.`);
  }
  return value.toLowerCase();
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) invalidManifest(`${field} must be a non-negative integer.`);
  return value as number;
}

function requireCount(value: unknown, field: string): number {
  if (typeof value !== "number") invalidManifest(`${field} must be a number.`);
  return requireNonNegativeInteger(value, field);
}

function expectedResourceCount(
  resourceType: MigrationImportResourceType,
  counts: MigrationImportManifestInput["counts"]
): number {
  switch (resourceType) {
    case "knowledge": return counts.knowledgeItems;
    case "knowledgeCandidates": return counts.knowledgeCandidates;
    case "validationRecords": return counts.validationRecords;
    case "memoryChangeRecords": return counts.memoryChangeRecords;
    case "orgMetrics": return counts.metricsPresent ? 1 : 0;
    case "intelligenceLog": return counts.intelligenceLogEntries;
    case "emergingPatterns": return counts.emergingPatterns;
    case "ticketRecords": return counts.ticketRecords;
    case "ticketSequence": return counts.ticketSequenceValue === null ? 0 : 1;
  }
}

function validateManifest(input: MigrationImportManifestInput): MigrationImportManifestInput {
  const organizationId = requireOrganizationId(input.organizationId, "Migration import organization");
  const sourceOrganizationId = requireOrganizationId(input.sourceOrganizationId, "Migration import source organization");
  if (organizationId !== sourceOrganizationId) {
    throw new MigrationImportServiceError(
      "CONFLICT",
      "The source organization must match the organization bound to the import batch."
    );
  }
  if (input.format !== LOCAL_STORAGE_EXPORT_FORMAT || input.formatVersion !== LOCAL_STORAGE_EXPORT_VERSION) {
    invalidManifest("The export format or format version is unsupported.");
  }
  if (input.sourcePersistenceMode !== "local" || input.sourceSchemaVersion !== "v2") {
    invalidManifest("The source persistence mode or schema version is unsupported.");
  }
  requireDigest(input.resourcePayloadDigest, "resourcePayloadDigest");
  requireDigest(input.metadataDigest, "metadataDigest", true);
  if (typeof input.exportedAt !== "string" || Number.isNaN(new Date(input.exportedAt).getTime())) {
    invalidManifest("exportedAt must be a valid ISO timestamp.");
  }

  const counts = input.counts;
  if (!counts || typeof counts !== "object") invalidManifest("counts are required.");
  for (const [field, value] of Object.entries(counts)) {
    if (field === "metricsPresent") {
      if (typeof value !== "boolean") invalidManifest("counts.metricsPresent must be a boolean.");
    } else if (field === "ticketSequenceValue") {
      if (value !== null) requireCount(value, "counts.ticketSequenceValue");
    } else {
      requireCount(value, `counts.${field}`);
    }
  }
  const expectedCountFields = [
    "knowledgeItems", "lessons", "knowledgeVersions", "knowledgeCandidates",
    "validationRecords", "memoryChangeRecords", "ticketRecords", "emergingPatterns",
    "intelligenceLogEntries", "metricsPresent", "ticketSequenceValue"
  ];
  for (const field of expectedCountFields) {
    if (!(field in counts)) invalidManifest(`counts.${field} is required.`);
  }

  if (!input.resourceDigests || typeof input.resourceDigests !== "object") {
    invalidManifest("resourceDigests are required.");
  }
  for (const resourceType of MIGRATION_IMPORT_RESOURCE_TYPES) {
    requireDigest(input.resourceDigests[resourceType], `resourceDigests.${resourceType}`);
  }

  return {
    ...input,
    organizationId,
    sourceOrganizationId,
    resourcePayloadDigest: input.resourcePayloadDigest.toLowerCase(),
    metadataDigest: input.metadataDigest?.toLowerCase()
  };
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return (value ?? null) as Prisma.InputJsonValue;
}

function batchNotFound(): never {
  throw new MigrationImportServiceError("IMPORT_NOT_FOUND", "The migration import batch was not found.");
}

async function requireBatch(
  tx: TransactionClient,
  organizationId: string,
  batchId: string
) {
  const batch = await tx.migrationImportBatch.findUnique({ where: { id: batchId } });
  if (!batch) batchNotFound();
  if (batch.organizationId !== organizationId) {
    throw new MigrationImportServiceError("CONFLICT", "The migration import batch belongs to another organization.");
  }
  return batch;
}

async function summaryForBatch(
  tx: TransactionClient,
  batchId: string
): Promise<MigrationImportBatchSummary> {
  const batch = await tx.migrationImportBatch.findUnique({
    where: { id: batchId },
    include: { resources: { orderBy: { resourceType: "asc" } } }
  });
  if (!batch) batchNotFound();
  const unresolvedConflictCount = await tx.migrationImportConflict.count({
    where: { batchId, status: "open" }
  });
  return {
    id: batch.id,
    organizationId: batch.organizationId,
    sourceOrganizationId: batch.sourceOrganizationId,
    resourcePayloadDigest: batch.resourcePayloadDigest,
    status: batch.status as MigrationImportBatchStatus,
    attemptCount: batch.attemptCount,
    resourceCheckpoints: batch.resources.map((resource) => ({
      resourceType: resource.resourceType as MigrationImportResourceType,
      expectedCount: resource.expectedCount,
      importedCount: resource.importedCount,
      skippedIdenticalCount: resource.skippedIdenticalCount,
      conflictCount: resource.conflictCount,
      sourceDigest: resource.sourceDigest,
      targetDigest: resource.targetDigest,
      status: resource.status,
      attemptCount: resource.attemptCount
    })),
    unresolvedConflictCount
  };
}

function conflictSummary(row: {
  id: string;
  batchId: string;
  organizationId: string;
  resourceType: string;
  fingerprint: string;
  sourceRecordId: string | null;
  conflictType: string;
  sourceDigest: string | null;
  targetDigest: string | null;
  reason: string;
  status: string;
  detectedAt: Date;
  resolvedAt: Date | null;
}): MigrationImportConflictSummary {
  return {
    id: row.id,
    batchId: row.batchId,
    organizationId: row.organizationId,
    resourceType: row.resourceType as MigrationImportResourceType,
    fingerprint: row.fingerprint,
    sourceRecordId: row.sourceRecordId,
    conflictType: row.conflictType,
    sourceDigest: row.sourceDigest,
    targetDigest: row.targetDigest,
    reason: row.reason,
    status: row.status,
    detectedAt: row.detectedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null
  };
}

/**
 * Create or find the metadata-only import batch for one export package.
 * This operation never touches business resource tables.
 */
export async function initializeMigrationImport(
  rawInput: MigrationImportManifestInput
): Promise<MigrationImportBatchSummary> {
  const input = validateManifest(rawInput);
  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.findUnique({ where: { id: input.organizationId }, select: { id: true } });
    if (!organization) {
      throw new MigrationImportServiceError("ORGANIZATION_NOT_FOUND", `Organization ${input.organizationId} was not found.`);
    }

    const existing = await tx.migrationImportBatch.findUnique({
      where: {
        organizationId_resourcePayloadDigest: {
          organizationId: input.organizationId,
          resourcePayloadDigest: input.resourcePayloadDigest
        }
      }
    });
    if (existing) return summaryForBatch(tx, existing.id);

    const batch = await tx.migrationImportBatch.create({
      data: {
        organizationId: input.organizationId,
        format: input.format,
        formatVersion: input.formatVersion,
        resourcePayloadDigest: input.resourcePayloadDigest,
        metadataDigest: input.metadataDigest,
        sourceOrganizationId: input.sourceOrganizationId,
        sourcePersistenceMode: input.sourcePersistenceMode,
        sourceSchemaVersion: input.sourceSchemaVersion,
        exportedAt: new Date(input.exportedAt),
        counts: jsonValue(input.counts),
        resourceDigests: jsonValue(input.resourceDigests),
        status: "pending"
      }
    });

    await tx.migrationImportResource.createMany({
      data: MIGRATION_IMPORT_RESOURCE_TYPES.map((resourceType) => ({
        batchId: batch.id,
        resourceType,
        expectedCount: expectedResourceCount(resourceType, input.counts),
        sourceDigest: input.resourceDigests[resourceType],
        status: "pending"
      }))
    });
    return summaryForBatch(tx, batch.id);
  });
}

export async function getMigrationImportBatch(
  organizationId: string,
  batchId: string
): Promise<MigrationImportBatchSummary> {
  const id = requireOrganizationId(organizationId, "Migration import lookup");
  requireNonEmpty(batchId, "batchId");
  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    await requireBatch(tx, id, batchId);
    return summaryForBatch(tx, batchId);
  });
}

export async function updateMigrationImportResource(
  organizationId: string,
  batchId: string,
  rawCheckpoint: MigrationImportResourceCheckpointInput
): Promise<MigrationImportBatchSummary> {
  const id = requireOrganizationId(organizationId, "Migration resource update");
  requireNonEmpty(batchId, "batchId");
  if (!MIGRATION_IMPORT_RESOURCE_TYPES.includes(rawCheckpoint.resourceType)) invalidResource("Unknown migration resource type.");
  const status = rawCheckpoint.status ?? "importing";
  if (!MIGRATION_IMPORT_RESOURCE_STATUSES.includes(status)) invalidResource("Unknown migration resource status.");
  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    const batch = await requireBatch(tx, id, batchId);
    const resource = await tx.migrationImportResource.findUnique({
      where: { batchId_resourceType: { batchId, resourceType: rawCheckpoint.resourceType } }
    });
    if (!resource) invalidResource(`Checkpoint ${rawCheckpoint.resourceType} was not initialized.`);

    const importedCount = rawCheckpoint.importedCount ?? resource.importedCount;
    const skippedIdenticalCount = rawCheckpoint.skippedIdenticalCount ?? resource.skippedIdenticalCount;
    const conflictCount = rawCheckpoint.conflictCount ?? resource.conflictCount;
    for (const [field, value] of Object.entries({ importedCount, skippedIdenticalCount, conflictCount })) {
      if (!Number.isInteger(value) || value < 0) invalidResource(`${field} must be a non-negative integer.`);
    }
    if (status === "verified") {
      if (importedCount + skippedIdenticalCount < resource.expectedCount) {
        throw new MigrationImportServiceError("INVALID_STATUS_TRANSITION", `Resource ${resource.resourceType} is incomplete.`);
      }
      const unresolvedResourceConflicts = await tx.migrationImportConflict.count({
        where: { batchId, resourceType: resource.resourceType, status: "open" }
      });
      if (unresolvedResourceConflicts > 0) {
        throw new MigrationImportServiceError("INVALID_STATUS_TRANSITION", `Resource ${resource.resourceType} still has unresolved conflicts.`);
      }
    }

    await tx.migrationImportResource.update({
      where: { id: resource.id },
      data: {
        status,
        importedCount,
        skippedIdenticalCount,
        conflictCount,
        targetDigest: rawCheckpoint.targetDigest,
        errorSummary: rawCheckpoint.errorSummary,
        ...(status === "importing" && !resource.startedAt ? { startedAt: new Date() } : {}),
        ...((status === "imported" || status === "verified") && !resource.completedAt ? { completedAt: new Date() } : {}),
        ...(status === "importing" && resource.status !== "importing" ? { attemptCount: { increment: 1 } } : {})
      }
    });

    if (status === "importing" && batch.status === "pending") {
      await tx.migrationImportBatch.update({
        where: { id: batch.id },
        data: { status: "importing", startedAt: batch.startedAt ?? new Date(), attemptCount: { increment: 1 } }
      });
    }
    return summaryForBatch(tx, batchId);
  });
}

export async function recordMigrationImportConflict(
  input: MigrationImportConflictInput
): Promise<MigrationImportConflictSummary> {
  const organizationId = requireOrganizationId(input.organizationId, "Migration conflict organization");
  requireNonEmpty(input.batchId, "batchId");
  requireNonEmpty(input.fingerprint, "fingerprint");
  requireNonEmpty(input.reason, "reason");
  if (!MIGRATION_IMPORT_RESOURCE_TYPES.includes(input.resourceType)) invalidResource("Unknown migration resource type.");
  if (!MIGRATION_IMPORT_CONFLICT_TYPES.includes(input.conflictType)) invalidResource("Unknown migration conflict type.");
  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    const batch = await requireBatch(tx, organizationId, input.batchId);
    const resource = await tx.migrationImportResource.findUnique({
      where: { batchId_resourceType: { batchId: input.batchId, resourceType: input.resourceType } }
    });
    if (!resource) invalidResource(`Checkpoint ${input.resourceType} was not initialized.`);

    const existing = await tx.migrationImportConflict.findUnique({
      where: { batchId_fingerprint: { batchId: input.batchId, fingerprint: input.fingerprint } }
    });
    if (existing) return conflictSummary(existing);

    const conflict = await tx.migrationImportConflict.create({
      data: {
        batchId: input.batchId,
        organizationId,
        resourceType: input.resourceType,
        fingerprint: input.fingerprint,
        sourceRecordId: input.sourceRecordId,
        conflictType: input.conflictType,
        sourceDigest: input.sourceDigest,
        targetDigest: input.targetDigest,
        sourceSnapshot: input.sourceSnapshot === undefined ? undefined : jsonValue(input.sourceSnapshot),
        targetSnapshot: input.targetSnapshot === undefined ? undefined : jsonValue(input.targetSnapshot),
        reason: input.reason,
        status: "open"
      }
    });
    await tx.migrationImportResource.update({
      where: { id: resource.id },
      data: { conflictCount: { increment: 1 }, status: "conflict" }
    });
    await tx.migrationImportBatch.update({ where: { id: batch.id }, data: { status: "conflict" } });
    return conflictSummary(conflict);
  });
}

export async function resolveMigrationImportConflict(
  organizationId: string,
  batchId: string,
  conflictId: string,
  status: Exclude<MigrationImportConflictStatus, "open">
): Promise<MigrationImportConflictSummary> {
  const id = requireOrganizationId(organizationId, "Migration conflict resolution");
  requireNonEmpty(batchId, "batchId");
  requireNonEmpty(conflictId, "conflictId");
  if (!MIGRATION_IMPORT_CONFLICT_STATUSES.includes(status)) invalidResource("Unknown migration conflict status.");
  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    await requireBatch(tx, id, batchId);
    const conflict = await tx.migrationImportConflict.findUnique({ where: { id: conflictId } });
    if (!conflict || conflict.batchId !== batchId || conflict.organizationId !== id) batchNotFound();
    const resolved = await tx.migrationImportConflict.update({
      where: { id: conflictId },
      data: { status, resolvedAt: new Date() }
    });
    return conflictSummary(resolved);
  });
}

export async function listUnresolvedMigrationConflicts(
  organizationId: string,
  batchId?: string
): Promise<MigrationImportConflictSummary[]> {
  const id = requireOrganizationId(organizationId, "Migration conflict lookup");
  const prisma = getPrismaClient();
  const rows = await prisma.migrationImportConflict.findMany({
    where: { organizationId: id, status: "open", ...(batchId ? { batchId } : {}) },
    orderBy: { detectedAt: "asc" }
  });
  return rows.map(conflictSummary);
}

/**
 * Verification is deliberately stricter than import completion: all nine
 * resource checkpoints must be verified and no open conflict may remain.
 */
export async function markMigrationImportBatchVerified(
  organizationId: string,
  batchId: string
): Promise<MigrationImportBatchSummary> {
  const id = requireOrganizationId(organizationId, "Migration verification");
  requireNonEmpty(batchId, "batchId");
  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    const batch = await requireBatch(tx, id, batchId);
    const resources = await tx.migrationImportResource.findMany({ where: { batchId } });
    if (resources.length !== MIGRATION_IMPORT_RESOURCE_TYPES.length) {
      throw new MigrationImportServiceError("INVALID_STATUS_TRANSITION", "The import does not have all required resource checkpoints.");
    }
    if (resources.some((resource) => resource.status !== "verified")) {
      throw new MigrationImportServiceError("INVALID_STATUS_TRANSITION", "Every resource checkpoint must be verified first.");
    }
    const unresolved = await tx.migrationImportConflict.count({ where: { batchId, status: "open" } });
    if (unresolved > 0) {
      throw new MigrationImportServiceError("INVALID_STATUS_TRANSITION", "The import still has unresolved conflicts.");
    }
    await tx.migrationImportBatch.update({
      where: { id: batch.id },
      data: { status: "verified", verificationCompletedAt: new Date() }
    });
    return summaryForBatch(tx, batchId);
  });
}
