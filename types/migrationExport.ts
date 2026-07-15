import type {
  EmergingPattern,
  IntelligenceLogEntry,
  KnowledgeCandidate,
  KnowledgeItem,
  MemoryChangeRecord,
  OrgMetrics,
  OrganizationProfile,
  TicketRecord,
  ValidationRecord
} from "@/types";

export const LOCAL_STORAGE_EXPORT_FORMAT = "oip-localstorage-export-v1" as const;
export const LOCAL_STORAGE_EXPORT_VERSION = 1 as const;

export type MigrationExportResourceName =
  | "knowledge"
  | "knowledgeCandidates"
  | "validationRecords"
  | "memoryChangeRecords"
  | "orgMetrics"
  | "intelligenceLog"
  | "emergingPatterns"
  | "ticketRecords"
  | "ticketSequence";

export type MigrationExportResourceSource =
  | "scoped"
  | "legacy-fallback"
  | "scoped+legacy-fallback"
  | "absent"
  | "seed"
  | "suppressed";

export interface MigrationExportResourceStatus {
  source: MigrationExportResourceSource;
  scopedPresent: boolean;
  legacyPresent: boolean;
  fallbackUsed: boolean;
  migrationStatus?: "copied" | "fallback" | "absent" | "error";
  resetSuppressed: boolean;
  scopedRecordCount: number;
  legacyRecordCount: number;
  resolvedRecordCount: number;
}

export interface MigrationExportOwnershipEvidence {
  organizationId: string;
  ownershipStatus: "not-applicable" | "explicit" | "known" | "ambiguous" | "none";
  ownershipReason: string;
  legacyOwnerOrganizationId?: string;
  legacyOwnershipStatus?: "owned" | "ambiguous";
  legacyStoragePresent: boolean;
  legacyFallbackResources: MigrationExportResourceName[];
  resetSuppressed: boolean;
  safeForMigration: boolean;
}

export interface MigrationExportMigrationState {
  version: string;
  sourceVersion: string;
  organizations: Record<string, {
    resources: Record<string, {
      status: "copied" | "fallback" | "absent" | "error";
      reason?: string;
      updatedAt: string;
    }>;
    completedAt?: string;
    resetAt?: string;
    legacyImportSuppressed?: boolean;
  }>;
  legacyOwnerOrganizationId?: string;
  legacyOwnershipStatus?: "owned" | "ambiguous";
  legacyOwnershipReason?: string;
  legacyOwnershipUpdatedAt?: string;
  compatibilityIssue?: string;
}

export interface MigrationExportTicketSequence {
  organizationId: string;
  counter: number;
  updatedAt: string | null;
}

export interface MigrationExportResources {
  knowledge: KnowledgeItem[];
  knowledgeCandidates: KnowledgeCandidate[];
  validationRecords: ValidationRecord[];
  memoryChangeRecords: MemoryChangeRecord[];
  orgMetrics: OrgMetrics | null;
  intelligenceLog: IntelligenceLogEntry[];
  emergingPatterns: EmergingPattern[];
  ticketRecords: TicketRecord[];
  ticketSequence: MigrationExportTicketSequence | null;
}

export interface MigrationExportCounts {
  knowledgeItems: number;
  lessons: number;
  knowledgeVersions: number;
  knowledgeCandidates: number;
  validationRecords: number;
  memoryChangeRecords: number;
  ticketRecords: number;
  emergingPatterns: number;
  intelligenceLogEntries: number;
  metricsPresent: boolean;
  ticketSequenceValue: number | null;
}

export interface MigrationExportDigests {
  resourceDigests: Record<MigrationExportResourceName, string>;
  resourcePayloadDigest: string;
  metadataDigest: string;
}

export interface MigrationExportPackage {
  format: typeof LOCAL_STORAGE_EXPORT_FORMAT;
  formatVersion: typeof LOCAL_STORAGE_EXPORT_VERSION;
  organizationId: string;
  organizationProfile: OrganizationProfile;
  organizationProfileSource: "persisted-profile" | "persisted-list" | "seed";
  exportedAt: string;
  sourceSchemaVersion: "v2";
  sourcePersistenceMode: "local";
  ownershipEvidence: MigrationExportOwnershipEvidence;
  migrationState: MigrationExportMigrationState;
  sourceResourceStatuses: Record<MigrationExportResourceName, MigrationExportResourceStatus>;
  resources: MigrationExportResources;
  counts: MigrationExportCounts;
  digests: MigrationExportDigests;
}

export interface BlockedMigrationExport {
  ready: false;
  format: typeof LOCAL_STORAGE_EXPORT_FORMAT;
  formatVersion: typeof LOCAL_STORAGE_EXPORT_VERSION;
  organizationId: string;
  reason: string;
  ownershipEvidence?: MigrationExportOwnershipEvidence;
  migrationState?: MigrationExportMigrationState;
}

export interface ReadyMigrationExport {
  ready: true;
  package: MigrationExportPackage;
}

export type MigrationExportResult = ReadyMigrationExport | BlockedMigrationExport;
