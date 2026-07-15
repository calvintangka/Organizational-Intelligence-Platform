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
import type {
  MigrationExportPackage,
  MigrationExportResourceName,
  MigrationExportResources
} from "@/types/migrationExport";
import {
  computeMigrationExportDigests,
  countMigrationExportResources,
  migrationExportDigestMetadata,
  MIGRATION_EXPORT_RESOURCE_NAMES,
  stableStringify
} from "@/lib/persistence/migrationExportDigest";

export type MigrationImportServiceErrorCode =
  | "INVALID_MANIFEST"
  | "INVALID_RESOURCE"
  | "UNSUPPORTED_EXPORT_FORMAT"
  | "UNSUPPORTED_EXPORT_VERSION"
  | "INVALID_EXPORT_PACKAGE"
  | "EXPORT_DIGEST_MISMATCH"
  | "COUNT_MISMATCH"
  | "ORGANIZATION_MISMATCH"
  | "OWNERSHIP_INVALID"
  | "ORGANIZATION_NOT_FOUND"
  | "IMPORT_NOT_FOUND"
  | "CONFLICT"
  | "INVALID_STATUS_TRANSITION"
  | "DATABASE_UNAVAILABLE"
  | "DATABASE_ERROR";

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

function invalidExport(message: string): never {
  throw new MigrationImportServiceError("INVALID_EXPORT_PACKAGE", message);
}

function unsupportedFormat(): never {
  throw new MigrationImportServiceError("UNSUPPORTED_EXPORT_FORMAT", "Only oip-localstorage-export-v1 packages are accepted.");
}

function unsupportedVersion(): never {
  throw new MigrationImportServiceError("UNSUPPORTED_EXPORT_VERSION", "Only export format version 1 is accepted.");
}

function ownershipInvalid(message: string): never {
  throw new MigrationImportServiceError("OWNERSHIP_INVALID", message);
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
  const result = await initializeMigrationImportWithResult(rawInput);
  return result.summary;
}

export async function initializeMigrationImportWithResult(
  rawInput: MigrationImportManifestInput
): Promise<{ summary: MigrationImportBatchSummary; created: boolean }> {
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
    if (existing) {
      if (existing.format !== input.format
        || existing.formatVersion !== input.formatVersion
        || existing.metadataDigest !== (input.metadataDigest ?? null)
        || existing.sourceOrganizationId !== input.sourceOrganizationId
        || existing.sourcePersistenceMode !== input.sourcePersistenceMode
        || existing.sourceSchemaVersion !== input.sourceSchemaVersion) {
        throw new MigrationImportServiceError("CONFLICT", "The existing import batch has incompatible manifest metadata.");
      }
      if (input.packagePayload !== undefined && existing.packagePayload === null) {
        throw new MigrationImportServiceError("CONFLICT", "The existing batch has no immutable package payload and cannot be upgraded in place.");
      }
      return { summary: await summaryForBatch(tx, existing.id), created: false };
    }

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
        packagePayload: input.packagePayload === undefined ? undefined : jsonValue(input.packagePayload),
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
    return { summary: await summaryForBatch(tx, batch.id), created: true };
  });
}

export async function markMigrationImportBatchReady(
  organizationId: string,
  batchId: string
): Promise<MigrationImportBatchSummary> {
  const id = requireOrganizationId(organizationId, "Migration intake");
  requireNonEmpty(batchId, "batchId");
  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    const batch = await requireBatch(tx, id, batchId);
    if (batch.status === "pending") {
      await tx.migrationImportBatch.update({ where: { id: batch.id }, data: { status: "ready" } });
    } else if (batch.status !== "ready" && batch.status !== "failed") {
      throw new MigrationImportServiceError("CONFLICT", "The import batch has already progressed beyond package intake.");
    }
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

type PlainRecord = Record<string, unknown>;

function asRecord(value: unknown, field: string): PlainRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidExport(`${field} must be an object.`);
  return value as PlainRecord;
}

function asArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) invalidExport(`${field} must be an array.`);
  return value;
}

function stableId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 256 || /[\u0000-\u001f]/.test(value)) {
    invalidExport(`${field} must be a non-empty stable identifier.`);
  }
  return value;
}

function organizationField(record: PlainRecord, field: string, organizationId: string): void {
  const value = record[field];
  if (value !== undefined && value !== organizationId) {
    ownershipInvalid(`${field} does not belong to the package organization.`);
  }
}

function uniqueIds(records: unknown[], resourceName: string, idField = "id"): Set<string> {
  const ids = new Set<string>();
  records.forEach((value, index) => {
    const record = asRecord(value, `${resourceName}[${index}]`);
    const id = stableId(record[idField], `${resourceName}[${index}].${idField}`);
    if (ids.has(id)) invalidExport(`${resourceName} contains duplicate ${idField} ${id}.`);
    ids.add(id);
  });
  return ids;
}

function validateMigrationState(value: unknown): void {
  const state = asRecord(value, "migrationState");
  if (typeof state.version !== "string" || typeof state.sourceVersion !== "string") {
    invalidExport("migrationState version fields are required.");
  }
  if (state.compatibilityIssue !== undefined) ownershipInvalid("migrationState reports a compatibility issue.");
  if (state.legacyOwnershipStatus === "ambiguous") ownershipInvalid("migrationState marks legacy ownership as ambiguous.");
  const organizations = asRecord(state.organizations, "migrationState.organizations");
  for (const [organizationId, organizationValue] of Object.entries(organizations)) {
    const organization = asRecord(organizationValue, `migrationState.organizations.${organizationId}`);
    const resources = asRecord(organization.resources, `migrationState.organizations.${organizationId}.resources`);
    for (const [resourceName, resourceValue] of Object.entries(resources)) {
      const resource = asRecord(resourceValue, `${organizationId}.${resourceName}`);
      if (!["copied", "fallback", "absent", "error"].includes(String(resource.status))) {
        invalidExport(`migrationState resource ${resourceName} has an unsupported status.`);
      }
      if (typeof resource.updatedAt !== "string" || Number.isNaN(new Date(resource.updatedAt).getTime())) {
        invalidExport(`migrationState resource ${resourceName} has an invalid updatedAt.`);
      }
    }
  }
}

async function validateExportPackage(raw: unknown, routeOrganizationId: string): Promise<MigrationExportPackage> {
  const packageValue = asRecord(raw, "export package");
  if (packageValue.format !== LOCAL_STORAGE_EXPORT_FORMAT) unsupportedFormat();
  if (packageValue.formatVersion !== LOCAL_STORAGE_EXPORT_VERSION) unsupportedVersion();
  if (typeof packageValue.organizationId !== "string" || packageValue.organizationId.trim().length === 0) {
    invalidExport("organizationId must be a non-empty string.");
  }
  if (typeof routeOrganizationId !== "string" || routeOrganizationId.trim().length === 0) {
    invalidExport("The route organizationId must be a non-empty string.");
  }
  const organizationId = packageValue.organizationId;
  const routeId = routeOrganizationId;
  if (organizationId !== routeId) {
    throw new MigrationImportServiceError("ORGANIZATION_MISMATCH", "The route organization and export package organization must match.");
  }
  if (typeof packageValue.exportedAt !== "string" || Number.isNaN(new Date(packageValue.exportedAt).getTime())) {
    invalidExport("exportedAt must be a valid ISO timestamp.");
  }
  if (packageValue.sourceSchemaVersion !== "v2" || packageValue.sourcePersistenceMode !== "local") {
    invalidExport("Only local v2 export packages are accepted.");
  }

  const profile = asRecord(packageValue.organizationProfile, "organizationProfile");
  if (profile.id !== organizationId) ownershipInvalid("organizationProfile.id does not match the package organization.");
  if (!["persisted-profile", "persisted-list", "seed"].includes(String(packageValue.organizationProfileSource))) {
    invalidExport("organizationProfileSource is invalid.");
  }

  const ownership = asRecord(packageValue.ownershipEvidence, "ownershipEvidence");
  if (ownership.organizationId !== organizationId) ownershipInvalid("ownershipEvidence.organizationId does not match the package organization.");
  if (ownership.safeForMigration !== true) ownershipInvalid("The export package is not marked safeForMigration.");
  if (["ambiguous", "none"].includes(String(ownership.ownershipStatus))) ownershipInvalid("Legacy ownership is not proven for this package.");
  if (ownership.legacyOwnershipStatus === "ambiguous") ownershipInvalid("Legacy ownership evidence is ambiguous.");
  const fallbackResources = asArray(ownership.legacyFallbackResources, "ownershipEvidence.legacyFallbackResources");
  const fallbackSet = new Set<string>();
  for (const resourceName of fallbackResources) {
    if (!MIGRATION_EXPORT_RESOURCE_NAMES.includes(resourceName as MigrationExportResourceName)) {
      invalidExport(`Unknown legacy fallback resource ${String(resourceName)}.`);
    }
    if (fallbackSet.has(String(resourceName))) invalidExport("legacyFallbackResources contains duplicates.");
    fallbackSet.add(String(resourceName));
  }
  if (typeof ownership.legacyStoragePresent !== "boolean" || typeof ownership.resetSuppressed !== "boolean") {
    invalidExport("ownership evidence storage flags are invalid.");
  }
  if (ownership.resetSuppressed === true && fallbackSet.size > 0) {
    ownershipInvalid("Reset-suppressed legacy storage cannot be included through fallback.");
  }
  if (fallbackSet.size > 0 && ownership.legacyOwnerOrganizationId !== organizationId) {
    ownershipInvalid("Legacy fallback resources require a matching legacy owner organization.");
  }

  validateMigrationState(packageValue.migrationState);
  const state = packageValue.migrationState as PlainRecord;
  if (state.legacyOwnerOrganizationId !== undefined
    && fallbackSet.size > 0
    && state.legacyOwnerOrganizationId !== organizationId) {
    ownershipInvalid("migrationState legacy owner conflicts with fallback ownership.");
  }

  const statuses = asRecord(packageValue.sourceResourceStatuses, "sourceResourceStatuses");
  for (const resourceName of MIGRATION_EXPORT_RESOURCE_NAMES) {
    const status = asRecord(statuses[resourceName], `sourceResourceStatuses.${resourceName}`);
    if (![
      "scoped", "legacy-fallback", "scoped+legacy-fallback", "absent", "seed", "suppressed"
    ].includes(String(status.source))) invalidExport(`sourceResourceStatuses.${resourceName}.source is invalid.`);
    for (const field of ["scopedPresent", "legacyPresent", "fallbackUsed", "resetSuppressed"]) {
      if (typeof status[field] !== "boolean") invalidExport(`sourceResourceStatuses.${resourceName}.${field} must be boolean.`);
    }
    for (const field of ["scopedRecordCount", "legacyRecordCount", "resolvedRecordCount"]) {
      requireNonNegativeInteger(status[field], `sourceResourceStatuses.${resourceName}.${field}`);
    }
    if (status.fallbackUsed === true && !fallbackSet.has(resourceName)) {
      ownershipInvalid(`Resource ${resourceName} claims fallback without ownership evidence.`);
    }
    if (["legacy-fallback", "scoped+legacy-fallback"].includes(String(status.source)) && status.fallbackUsed !== true) {
      invalidExport(`sourceResourceStatuses.${resourceName} has inconsistent fallback flags.`);
    }
    if (["absent", "seed", "suppressed", "scoped"].includes(String(status.source)) && status.fallbackUsed === true) {
      invalidExport(`sourceResourceStatuses.${resourceName} has inconsistent fallback flags.`);
    }
    if (status.resetSuppressed !== ownership.resetSuppressed) {
      invalidExport(`sourceResourceStatuses.${resourceName}.resetSuppressed disagrees with ownership evidence.`);
    }
  }

  const resources = asRecord(packageValue.resources, "resources") as unknown as MigrationExportResources;
  const knowledge = asArray(resources.knowledge, "resources.knowledge");
  const candidates = asArray(resources.knowledgeCandidates, "resources.knowledgeCandidates");
  const validations = asArray(resources.validationRecords, "resources.validationRecords");
  const memoryChanges = asArray(resources.memoryChangeRecords, "resources.memoryChangeRecords");
  const patterns = asArray(resources.emergingPatterns, "resources.emergingPatterns");
  const tickets = asArray(resources.ticketRecords, "resources.ticketRecords");
  const intelligence = asArray(resources.intelligenceLog, "resources.intelligenceLog");
  const knowledgeIds = uniqueIds(knowledge, "knowledge");
  const knowledgeVersionIds = new Set<string>();
  const candidateIds = uniqueIds(candidates, "knowledgeCandidates");
  const validationIds = uniqueIds(validations, "validationRecords");
  uniqueIds(memoryChanges, "memoryChangeRecords");
  uniqueIds(patterns, "emergingPatterns");
  uniqueIds(intelligence, "intelligenceLog");
  uniqueIds(tickets, "ticketRecords", "ticketId");

  for (const [index, itemValue] of knowledge.entries()) {
    const item = asRecord(itemValue, `knowledge[${index}]`);
    organizationField(item, "organizationId", organizationId);
    const lessons = item.lessons === undefined ? [] : asArray(item.lessons, `knowledge[${index}].lessons`);
    uniqueIds(lessons, `knowledge[${index}].lessons`);
    const versions = item.knowledgeVersions === undefined ? [] : asArray(item.knowledgeVersions, `knowledge[${index}].knowledgeVersions`);
    for (const versionId of uniqueIds(versions, `knowledge[${index}].knowledgeVersions`, "versionId")) knowledgeVersionIds.add(versionId);
  }
  for (const [index, value] of candidates.entries()) {
    const candidate = asRecord(value, `knowledgeCandidates[${index}]`);
    organizationField(candidate, "organizationId", organizationId);
    if (candidate.relatedKnowledgeId !== undefined && candidate.relatedKnowledgeId !== null
      && !knowledgeIds.has(stableId(candidate.relatedKnowledgeId, `knowledgeCandidates[${index}].relatedKnowledgeId`))) {
      invalidExport(`knowledgeCandidates[${index}] references a missing knowledge item.`);
    }
  }
  for (const [index, value] of validations.entries()) {
    const validation = asRecord(value, `validationRecords[${index}]`);
    organizationField(validation, "organizationId", organizationId);
    const candidateId = stableId(validation.candidateId, `validationRecords[${index}].candidateId`);
    if (!candidateIds.has(candidateId)) invalidExport(`validationRecords[${index}] references a missing candidate.`);
    if (validation.knowledgeId !== undefined && validation.knowledgeId !== null && !knowledgeIds.has(String(validation.knowledgeId))) {
      invalidExport(`validationRecords[${index}] references a missing knowledge item.`);
    }
    if (validation.knowledgeVersionId !== undefined && validation.knowledgeVersionId !== null
      && !knowledgeVersionIds.has(stableId(validation.knowledgeVersionId, `validationRecords[${index}].knowledgeVersionId`))) {
      invalidExport(`validationRecords[${index}] references a missing knowledge version.`);
    }
  }
  for (const [index, value] of memoryChanges.entries()) {
    const memory = asRecord(value, `memoryChangeRecords[${index}]`);
    organizationField(memory, "organizationId", organizationId);
    if (!validationIds.has(stableId(memory.validationRecordId, `memoryChangeRecords[${index}].validationRecordId`))) {
      invalidExport(`memoryChangeRecords[${index}] references a missing validation record.`);
    }
    if (!candidateIds.has(stableId(memory.candidateId, `memoryChangeRecords[${index}].candidateId`))) {
      invalidExport(`memoryChangeRecords[${index}] references a missing candidate.`);
    }
    if (!knowledgeIds.has(stableId(memory.knowledgeId, `memoryChangeRecords[${index}].knowledgeId`))) {
      invalidExport(`memoryChangeRecords[${index}] references a missing knowledge item.`);
    }
  }
  for (const [index, value] of tickets.entries()) {
    const ticket = asRecord(value, `ticketRecords[${index}]`);
    organizationField(ticket, "orgId", organizationId);
    const referencedValidations = ticket.validationRecordIds === undefined ? [] : asArray(ticket.validationRecordIds, `ticketRecords[${index}].validationRecordIds`);
    for (const reference of referencedValidations) {
      if (!validationIds.has(stableId(reference, `ticketRecords[${index}].validationRecordIds`))) {
        invalidExport(`ticketRecords[${index}] references a missing validation record.`);
      }
    }
  }

  if ((resources.orgMetrics !== null && typeof resources.orgMetrics !== "object") || Array.isArray(resources.orgMetrics)) {
    invalidExport("resources.orgMetrics must be an object or null.");
  }
  if (resources.orgMetrics) organizationField(asRecord(resources.orgMetrics, "resources.orgMetrics"), "organizationId", organizationId);
  if (resources.ticketSequence !== null) {
    const sequence = asRecord(resources.ticketSequence, "resources.ticketSequence");
    if (sequence.organizationId !== organizationId) ownershipInvalid("ticketSequence belongs to another organization.");
    requireNonNegativeInteger(sequence.counter, "resources.ticketSequence.counter");
    if (sequence.updatedAt !== null && (typeof sequence.updatedAt !== "string" || Number.isNaN(new Date(sequence.updatedAt).getTime()))) {
      invalidExport("resources.ticketSequence.updatedAt is invalid.");
    }
  }

  const counts = asRecord(packageValue.counts, "counts");
  const computedCounts = countMigrationExportResources(resources);
  if (stableStringify(counts) !== stableStringify(computedCounts)) {
    throw new MigrationImportServiceError("COUNT_MISMATCH", "Declared export counts do not match the resource payload.");
  }
  const digests = asRecord(packageValue.digests, "digests");
  for (const resourceName of MIGRATION_EXPORT_RESOURCE_NAMES) requireDigest(digests.resourceDigests && (digests.resourceDigests as PlainRecord)[resourceName], `digests.resourceDigests.${resourceName}`);
  requireDigest(digests.resourcePayloadDigest, "digests.resourcePayloadDigest");
  requireDigest(digests.metadataDigest, "digests.metadataDigest");
  const expectedDigests = await computeMigrationExportDigests(resources, migrationExportDigestMetadata(packageValue as unknown as MigrationExportPackage));
  if (stableStringify(digests) !== stableStringify(expectedDigests)) {
    throw new MigrationImportServiceError("EXPORT_DIGEST_MISMATCH", "The export resource or metadata digests do not match the package contents.");
  }
  return packageValue as unknown as MigrationExportPackage;
}

export async function revalidateStoredMigrationExportPackage(
  rawPackage: unknown,
  organizationId: string
): Promise<MigrationExportPackage> {
  return validateExportPackage(rawPackage, organizationId);
}

export interface MigrationImportIntakeResult {
  batchId: string;
  organizationId: string;
  resourcePayloadDigest: string;
  status: MigrationImportBatchStatus;
  created: boolean;
  reused: boolean;
  checkpoints: MigrationImportBatchSummary["resourceCheckpoints"];
  unresolvedConflictCount: number;
  nextAction: "begin_business_import_in_batch_5_4";
}

/**
 * Validate and durably register one complete localStorage export. This is
 * intentionally metadata-only: packagePayload is retained for a future
 * importer, but no business resource table is read or written here.
 */
export async function intakeMigrationExportPackage(
  rawPackage: unknown,
  routeOrganizationId: string
): Promise<MigrationImportIntakeResult> {
  const exportPackage = await validateExportPackage(rawPackage, routeOrganizationId);
  const result = await initializeMigrationImportWithResult({
    organizationId: exportPackage.organizationId,
    sourceOrganizationId: exportPackage.organizationId,
    format: exportPackage.format,
    formatVersion: exportPackage.formatVersion,
    resourcePayloadDigest: exportPackage.digests.resourcePayloadDigest,
    metadataDigest: exportPackage.digests.metadataDigest,
    sourcePersistenceMode: exportPackage.sourcePersistenceMode,
    sourceSchemaVersion: exportPackage.sourceSchemaVersion,
    exportedAt: exportPackage.exportedAt,
    counts: exportPackage.counts,
    resourceDigests: exportPackage.digests.resourceDigests,
    packagePayload: exportPackage
  });
  const summary = await markMigrationImportBatchReady(exportPackage.organizationId, result.summary.id);
  return {
    batchId: summary.id,
    organizationId: summary.organizationId,
    resourcePayloadDigest: summary.resourcePayloadDigest,
    status: summary.status,
    created: result.created,
    reused: !result.created,
    checkpoints: summary.resourceCheckpoints,
    unresolvedConflictCount: summary.unresolvedConflictCount,
    nextAction: "begin_business_import_in_batch_5_4"
  };
}

export function toSafeMigrationImportError(error: unknown): { code: string; message: string; status: number } {
  if (error instanceof MigrationImportServiceError) {
    const status = ["ORGANIZATION_NOT_FOUND", "IMPORT_NOT_FOUND"].includes(error.code) ? 404
      : ["CONFLICT", "ORGANIZATION_MISMATCH"].includes(error.code) ? 409
        : error.code === "DATABASE_UNAVAILABLE" ? 503 : 400;
    return { code: error.code, message: error.message, status };
  }
  const code = (error as { code?: string } | null)?.code;
  if (["P1001", "P1002", "P1017", "P2021", "P2024"].includes(code ?? "")) {
    return { code: "DATABASE_UNAVAILABLE", message: "The migration database is unavailable.", status: 503 };
  }
  return { code: "DATABASE_ERROR", message: "The migration request could not be completed.", status: 500 };
}
