import type {
  MigrationExportCounts,
  MigrationExportDigests,
  MigrationExportPackage,
  MigrationExportResourceName,
  MigrationExportResources
} from "@/types/migrationExport";
import {
  LOCAL_STORAGE_EXPORT_FORMAT,
  LOCAL_STORAGE_EXPORT_VERSION
} from "@/types/migrationExport";

export const MIGRATION_EXPORT_RESOURCE_NAMES = [
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

/** The canonical JSON representation used by both exporter and server intake. */
export function stableStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return "null";
}

export async function sha256(value: string): Promise<string> {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) throw new Error("Web Crypto SHA-256 is unavailable in this runtime.");
  const bytes = await cryptoApi.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function countMigrationExportResources(resources: MigrationExportResources): MigrationExportCounts {
  return {
    knowledgeItems: resources.knowledge.length,
    lessons: resources.knowledge.reduce((total, item) => total + (item.lessons?.length ?? 0), 0),
    knowledgeVersions: resources.knowledge.reduce((total, item) => total + (item.knowledgeVersions?.length ?? 0), 0),
    knowledgeCandidates: resources.knowledgeCandidates.length,
    validationRecords: resources.validationRecords.length,
    memoryChangeRecords: resources.memoryChangeRecords.length,
    ticketRecords: resources.ticketRecords.length,
    emergingPatterns: resources.emergingPatterns.length,
    intelligenceLogEntries: resources.intelligenceLog.length,
    metricsPresent: resources.orgMetrics !== null,
    ticketSequenceValue: resources.ticketSequence?.counter ?? null
  };
}

export function migrationExportDigestMetadata(
  exportPackage: Pick<MigrationExportPackage,
    | "organizationId"
    | "organizationProfile"
    | "organizationProfileSource"
    | "ownershipEvidence"
    | "migrationState"
    | "sourceResourceStatuses"
    | "counts">
): Record<string, unknown> {
  return {
    format: LOCAL_STORAGE_EXPORT_FORMAT,
    formatVersion: LOCAL_STORAGE_EXPORT_VERSION,
    organizationId: exportPackage.organizationId,
    organizationProfile: exportPackage.organizationProfile,
    organizationProfileSource: exportPackage.organizationProfileSource,
    sourceSchemaVersion: "v2",
    sourcePersistenceMode: "local",
    ownershipEvidence: exportPackage.ownershipEvidence,
    migrationState: exportPackage.migrationState,
    sourceResourceStatuses: exportPackage.sourceResourceStatuses,
    counts: exportPackage.counts
  };
}

export async function computeMigrationExportDigests(
  resources: MigrationExportResources,
  metadata: Record<string, unknown>
): Promise<MigrationExportDigests> {
  const resourceDigests = {} as Record<MigrationExportResourceName, string>;
  for (const resourceName of MIGRATION_EXPORT_RESOURCE_NAMES) {
    resourceDigests[resourceName] = await sha256(stableStringify(resources[resourceName]));
  }
  return {
    resourceDigests,
    resourcePayloadDigest: await sha256(stableStringify(resources)),
    metadataDigest: await sha256(stableStringify(metadata))
  };
}
