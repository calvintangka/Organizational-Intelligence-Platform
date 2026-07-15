import type {
  MigrationExportCounts,
  MigrationExportResourceName
} from "@/types/migrationExport";

export const MIGRATION_IMPORT_RESOURCE_TYPES = [
  "knowledge",
  "knowledgeCandidates",
  "validationRecords",
  "memoryChangeRecords",
  "orgMetrics",
  "intelligenceLog",
  "emergingPatterns",
  "ticketRecords",
  "ticketSequence"
] as const satisfies readonly MigrationExportResourceName[];

export type MigrationImportResourceType = typeof MIGRATION_IMPORT_RESOURCE_TYPES[number];

export const MIGRATION_IMPORT_BATCH_STATUSES = [
  "pending",
  "validating",
  "ready",
  "importing",
  "partial",
  "conflict",
  "imported",
  "verifying",
  "verified",
  "failed"
] as const;

export type MigrationImportBatchStatus = typeof MIGRATION_IMPORT_BATCH_STATUSES[number];

export const MIGRATION_IMPORT_RESOURCE_STATUSES = [
  "pending",
  "validating",
  "importing",
  "imported",
  "conflict",
  "failed",
  "verified"
] as const;

export type MigrationImportResourceStatus = typeof MIGRATION_IMPORT_RESOURCE_STATUSES[number];

export const MIGRATION_IMPORT_CONFLICT_TYPES = [
  "same_id_different_content",
  "cross_organization_ownership_mismatch",
  "duplicate_candidate_validation",
  "duplicate_validation_memory_relationship",
  "ticket_id_collision",
  "lesson_id_content_conflict",
  "knowledge_version_id_conflict",
  "unresolved_historical_reference",
  "digest_mismatch",
  "malformed_source_record"
] as const;

export type MigrationImportConflictType = typeof MIGRATION_IMPORT_CONFLICT_TYPES[number];

export const MIGRATION_IMPORT_CONFLICT_STATUSES = [
  "open",
  "resolved_source",
  "resolved_target",
  "resolved_manual",
  "ignored"
] as const;

export type MigrationImportConflictStatus = typeof MIGRATION_IMPORT_CONFLICT_STATUSES[number];

export interface MigrationImportManifestInput {
  organizationId: string;
  sourceOrganizationId: string;
  format: "oip-localstorage-export-v1";
  formatVersion: 1;
  resourcePayloadDigest: string;
  metadataDigest?: string;
  sourcePersistenceMode: "local";
  sourceSchemaVersion: "v2";
  exportedAt: string;
  counts: MigrationExportCounts;
  resourceDigests: Record<MigrationExportResourceName, string>;
}

export interface MigrationImportResourceCheckpointInput {
  resourceType: MigrationImportResourceType;
  status?: MigrationImportResourceStatus;
  importedCount?: number;
  skippedIdenticalCount?: number;
  conflictCount?: number;
  targetDigest?: string | null;
  errorSummary?: string | null;
}

export interface MigrationImportConflictInput {
  batchId: string;
  organizationId: string;
  resourceType: MigrationImportResourceType;
  fingerprint: string;
  sourceRecordId?: string;
  conflictType: MigrationImportConflictType;
  sourceDigest?: string;
  targetDigest?: string;
  sourceSnapshot?: unknown;
  targetSnapshot?: unknown;
  reason: string;
}

export interface MigrationImportConflictSummary {
  id: string;
  batchId: string;
  organizationId: string;
  resourceType: MigrationImportResourceType;
  fingerprint: string;
  sourceRecordId: string | null;
  conflictType: string;
  sourceDigest: string | null;
  targetDigest: string | null;
  reason: string;
  status: string;
  detectedAt: string;
  resolvedAt: string | null;
}

export interface MigrationImportBatchSummary {
  id: string;
  organizationId: string;
  sourceOrganizationId: string;
  resourcePayloadDigest: string;
  status: MigrationImportBatchStatus;
  attemptCount: number;
  resourceCheckpoints: Array<{
    resourceType: MigrationImportResourceType;
    expectedCount: number;
    importedCount: number;
    skippedIdenticalCount: number;
    conflictCount: number;
    sourceDigest: string;
    targetDigest: string | null;
    status: MigrationImportResourceStatus;
    attemptCount: number;
  }>;
  unresolvedConflictCount: number;
}
