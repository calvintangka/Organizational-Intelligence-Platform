import { seedOrganizationProfiles } from "@/data/seedOrganizationProfiles";
import {
  normalizeOrganizationProfile
} from "@/lib/organizationProfile";
import {
  hasRuntimeLegacyFallback,
  normalizePersistedKnowledgeSnapshot,
  ORGANIZATION_ISOLATION_MIGRATION_KEY,
  readMigrationStateForExport,
  type OrganizationMigrationResource,
  type OrganizationMigrationState
} from "@/lib/orgMemory";
import { requireOrganizationId } from "@/lib/organizationId";
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
import type {
  BlockedMigrationExport,
  LOCAL_STORAGE_EXPORT_FORMAT,
  LOCAL_STORAGE_EXPORT_VERSION,
  MigrationExportCounts,
  MigrationExportDigests,
  MigrationExportMigrationState,
  MigrationExportOwnershipEvidence,
  MigrationExportPackage,
  MigrationExportResourceName,
  MigrationExportResourceSource,
  MigrationExportResourceStatus,
  MigrationExportResources,
  MigrationExportResult,
  MigrationExportTicketSequence
} from "@/types/migrationExport";
import {
  LOCAL_STORAGE_EXPORT_FORMAT as EXPORT_FORMAT,
  LOCAL_STORAGE_EXPORT_VERSION as EXPORT_VERSION
} from "@/types/migrationExport";

const SOURCE_SCHEMA_VERSION = "v2" as const;

const LEGACY_KEYS = {
  knowledge: "oip.knowledge.v2",
  knowledgeCandidates: "oip.knowledgeCandidates.v2",
  validationRecords: "oip.validationRecords.v2",
  memoryChangeRecords: "oip.memoryChanges.v2",
  orgMetrics: "oip.orgMetrics.v2",
  intelligenceLog: "oip.intelligenceLog.v2",
  emergingPatterns: "oip.emergingPatterns.v2",
  ticketRecords: "oip.ticketRecords.v2",
  ticketSequence: "oip.ticketCounter.v2"
} as const;

const MIGRATION_RESOURCES: Record<MigrationExportResourceName, OrganizationMigrationResource> = {
  knowledge: "knowledge",
  knowledgeCandidates: "candidates",
  validationRecords: "validationRecords",
  memoryChangeRecords: "memoryChanges",
  orgMetrics: "metrics",
  intelligenceLog: "intelligenceLog",
  emergingPatterns: "patterns",
  ticketRecords: "tickets",
  ticketSequence: "ticketCounter"
};

const RESOURCE_NAMES = Object.keys(LEGACY_KEYS) as MigrationExportResourceName[];

type StoredValue<T> = {
  present: boolean;
  value: T | null;
};

type ResolvedResource<T> = {
  value: T | null;
  source: MigrationExportResourceSource;
  scopedPresent: boolean;
  legacyPresent: boolean;
  fallbackUsed: boolean;
  migrationStatus?: MigrationExportResourceStatus["migrationStatus"];
  scopedRecordCount: number;
  legacyRecordCount: number;
};

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage ?? null;
}

function scopedKey(legacyKey: string, organizationId: string): string {
  const resource = legacyKey.replace(/^oip\./, "").replace(/\.v2$/, "");
  return `oip.organization.${encodeURIComponent(organizationId)}.${resource}.v1`;
}

function readStored<T>(store: Storage, key: string): StoredValue<T> {
  const raw = store.getItem(key);
  if (raw === null) return { present: false, value: null };
  return { present: true, value: JSON.parse(raw) as T };
}

function migrationStatus(
  state: OrganizationMigrationState,
  organizationId: string,
  resourceName: MigrationExportResourceName
): MigrationExportResourceStatus["migrationStatus"] {
  return state.organizations[organizationId]?.resources[MIGRATION_RESOURCES[resourceName]]?.status;
}

function isResetSuppressed(state: OrganizationMigrationState, organizationId: string): boolean {
  return state.organizations[organizationId]?.legacyImportSuppressed === true;
}

function canUseFallback(
  state: OrganizationMigrationState,
  organizationId: string,
  resourceName: MigrationExportResourceName,
  resetSuppressed: boolean
): boolean {
  if (state.compatibilityIssue || state.legacyOwnershipStatus === "ambiguous" || resetSuppressed) return false;
  if (state.legacyOwnerOrganizationId !== organizationId) return false;
  const migrationResource = MIGRATION_RESOURCES[resourceName];
  return migrationStatus(state, organizationId, resourceName) === "fallback"
    || hasRuntimeLegacyFallback(organizationId, migrationResource);
}

function recordCount(value: unknown): number {
  return Array.isArray(value) ? value.length : value === null || value === undefined ? 0 : 1;
}

function resolveResource<T>(
  store: Storage,
  state: OrganizationMigrationState,
  organizationId: string,
  resourceName: MigrationExportResourceName
): ResolvedResource<T> {
  const legacy = readStored<T>(store, LEGACY_KEYS[resourceName]);
  const scoped = readStored<T>(store, scopedKey(LEGACY_KEYS[resourceName], organizationId));
  const resetSuppressed = isResetSuppressed(state, organizationId);
  const fallback = canUseFallback(state, organizationId, resourceName, resetSuppressed);
  const legacyValue = fallback ? legacy.value : null;
  const status = migrationStatus(state, organizationId, resourceName);

  if (resourceName === "memoryChangeRecords" && Array.isArray(scoped.value) && Array.isArray(legacyValue)) {
    const byId = new Map<string, MemoryChangeRecord>();
    for (const record of legacyValue as MemoryChangeRecord[]) byId.set(record.id, record);
    for (const record of scoped.value as MemoryChangeRecord[]) byId.set(record.id, record);
    return {
      value: Array.from(byId.values()) as T,
      source: "scoped+legacy-fallback",
      scopedPresent: scoped.present,
      legacyPresent: legacy.present,
      fallbackUsed: true,
      migrationStatus: status,
      scopedRecordCount: recordCount(scoped.value),
      legacyRecordCount: recordCount(legacyValue)
    };
  }

  if (scoped.value !== null) {
    return {
      value: scoped.value,
      source: "scoped",
      scopedPresent: scoped.present,
      legacyPresent: legacy.present,
      fallbackUsed: false,
      migrationStatus: status,
      scopedRecordCount: recordCount(scoped.value),
      legacyRecordCount: recordCount(legacyValue)
    };
  }

  if (legacyValue !== null) {
    return {
      value: legacyValue,
      source: "legacy-fallback",
      scopedPresent: scoped.present,
      legacyPresent: legacy.present,
      fallbackUsed: true,
      migrationStatus: status,
      scopedRecordCount: recordCount(scoped.value),
      legacyRecordCount: recordCount(legacyValue)
    };
  }

  return {
    value: null,
    source: resetSuppressed && legacy.present ? "suppressed" : "absent",
    scopedPresent: scoped.present,
    legacyPresent: legacy.present,
    fallbackUsed: false,
    migrationStatus: status,
    scopedRecordCount: recordCount(scoped.value),
    legacyRecordCount: 0
  };
}

function assertOrganizationOwnership(
  records: Array<{ organizationId?: string }>,
  organizationId: string,
  resourceName: string
): void {
  for (const record of records) {
    if (record.organizationId !== undefined && record.organizationId !== organizationId) {
      throw new Error(`${resourceName} contains a record owned by ${record.organizationId}, not ${organizationId}.`);
    }
  }
}

function stampOrganization<T extends { organizationId?: string }>(
  records: T[],
  organizationId: string,
  resourceName: string
): T[] {
  assertOrganizationOwnership(records, organizationId, resourceName);
  return records.map((record) => ({ ...record, organizationId }));
}

function stampTickets(records: TicketRecord[], organizationId: string): TicketRecord[] {
  for (const record of records) {
    if (record.orgId !== undefined && record.orgId !== organizationId) {
      throw new Error(`ticketRecords contains a record owned by ${record.orgId}, not ${organizationId}.`);
    }
  }
  return records.map((record) => ({ ...record, orgId: organizationId }));
}

function normalizeProfileForExport(profile: OrganizationProfile, organizationId: string): OrganizationProfile {
  const seed = seedOrganizationProfiles.find((candidate) => candidate.id === organizationId);
  const normalized = normalizeOrganizationProfile({ ...(seed ?? profile), ...profile, id: organizationId });
  // The normalizer intentionally refreshes updatedAt for UI writes. Export is
  // a snapshot, so preserve persisted timestamps and keep incomplete fixtures
  // deterministic without writing them back.
  if (typeof profile.createdAt === "string") normalized.createdAt = profile.createdAt;
  if (typeof profile.updatedAt === "string") normalized.updatedAt = profile.updatedAt;
  else normalized.updatedAt = normalized.createdAt;
  return normalized;
}

function resolveOrganizationProfile(
  store: Storage,
  organizationId: string
): { profile: OrganizationProfile; source: "persisted-profile" | "persisted-list" | "seed" } {
  const persistedProfile = readStored<Partial<OrganizationProfile>>(store, "oip.organizationProfile.v1");
  if (persistedProfile.value?.id === organizationId) {
    return {
      profile: normalizeProfileForExport(persistedProfile.value as OrganizationProfile, organizationId),
      source: "persisted-profile"
    };
  }

  const persistedList = readStored<Array<Partial<OrganizationProfile>>>(store, "oip.organizationList.v1");
  const listed = Array.isArray(persistedList.value)
    ? persistedList.value.find((profile) => profile?.id === organizationId)
    : undefined;
  if (listed) {
    return {
      profile: normalizeProfileForExport(listed as OrganizationProfile, organizationId),
      source: "persisted-list"
    };
  }

  const seed = seedOrganizationProfiles.find((profile) => profile.id === organizationId);
  if (seed) return { profile: seed, source: "seed" };
  throw new Error(`No organization profile exists for ${organizationId}.`);
}

function deriveOwnershipEvidence(
  state: OrganizationMigrationState,
  organizationId: string,
  legacyStoragePresent: boolean,
  legacyFallbackResources: MigrationExportResourceName[],
  resetSuppressed: boolean
): MigrationExportOwnershipEvidence {
  if (!legacyStoragePresent) {
    return {
      organizationId,
      ownershipStatus: "not-applicable",
      ownershipReason: "No legacy v2 storage keys are present.",
      legacyStoragePresent: false,
      legacyFallbackResources,
      resetSuppressed,
      safeForMigration: !state.compatibilityIssue
    };
  }

  if (state.legacyOwnershipStatus === "ambiguous") {
    return {
      organizationId,
      ownershipStatus: "ambiguous",
      ownershipReason: state.legacyOwnershipReason ?? "Legacy ownership is marked ambiguous.",
      legacyOwnerOrganizationId: state.legacyOwnerOrganizationId,
      legacyOwnershipStatus: state.legacyOwnershipStatus,
      legacyStoragePresent: true,
      legacyFallbackResources,
      resetSuppressed,
      safeForMigration: false
    };
  }

  if (!state.legacyOwnerOrganizationId) {
    return {
      organizationId,
      ownershipStatus: "none",
      ownershipReason: "Legacy storage exists but no durable owner is recorded.",
      legacyStoragePresent: true,
      legacyFallbackResources,
      resetSuppressed,
      safeForMigration: false
    };
  }

  if (state.legacyOwnerOrganizationId === organizationId) {
    const explicit = state.legacyOwnershipReason?.toLowerCase().includes("explicit") === true;
    return {
      organizationId,
      ownershipStatus: explicit ? "explicit" : "known",
      ownershipReason: state.legacyOwnershipReason ?? "Legacy owner matches the requested organization.",
      legacyOwnerOrganizationId: state.legacyOwnerOrganizationId,
      legacyOwnershipStatus: state.legacyOwnershipStatus,
      legacyStoragePresent: true,
      legacyFallbackResources,
      resetSuppressed,
      safeForMigration: !state.compatibilityIssue
    };
  }

  return {
    organizationId,
    ownershipStatus: "known",
    ownershipReason: `Legacy storage belongs to ${state.legacyOwnerOrganizationId}; no legacy fallback was included for ${organizationId}.`,
    legacyOwnerOrganizationId: state.legacyOwnerOrganizationId,
    legacyOwnershipStatus: state.legacyOwnershipStatus,
    legacyStoragePresent: true,
    legacyFallbackResources,
    resetSuppressed,
    safeForMigration: legacyFallbackResources.length === 0 && !state.compatibilityIssue
  };
}

function migrationStateForPackage(state: OrganizationMigrationState): MigrationExportMigrationState {
  return {
    ...state,
    organizations: Object.fromEntries(
      Object.entries(state.organizations).map(([organizationId, organization]) => [organizationId, {
        ...organization,
        resources: { ...organization.resources } as MigrationExportMigrationState["organizations"][string]["resources"]
      }])
    )
  };
}

function statusFor(
  resolved: ResolvedResource<unknown>,
  resetSuppressed: boolean,
  resolvedRecordCount: number
): MigrationExportResourceStatus {
  return {
    source: resolved.source,
    scopedPresent: resolved.scopedPresent,
    legacyPresent: resolved.legacyPresent,
    fallbackUsed: resolved.fallbackUsed,
    migrationStatus: resolved.migrationStatus,
    resetSuppressed,
    scopedRecordCount: resolved.scopedRecordCount,
    legacyRecordCount: resolved.legacyRecordCount,
    resolvedRecordCount
  };
}

function emptyResources(): MigrationExportResources {
  return {
    knowledge: [],
    knowledgeCandidates: [],
    validationRecords: [],
    memoryChangeRecords: [],
    orgMetrics: null,
    intelligenceLog: [],
    emergingPatterns: [],
    ticketRecords: [],
    ticketSequence: null
  };
}

function countResources(resources: MigrationExportResources): MigrationExportCounts {
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

function stableStringify(value: unknown): string {
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

async function sha256(value: string): Promise<string> {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) throw new Error("Web Crypto SHA-256 is unavailable in this runtime.");
  const bytes = await cryptoApi.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function digestsFor(
  resources: MigrationExportResources,
  metadata: Record<string, unknown>
): Promise<MigrationExportDigests> {
  const resourceDigests = {} as Record<MigrationExportResourceName, string>;
  for (const resourceName of RESOURCE_NAMES) {
    resourceDigests[resourceName] = await sha256(stableStringify(resources[resourceName]));
  }
  return {
    resourceDigests,
    resourcePayloadDigest: await sha256(stableStringify(resources)),
    metadataDigest: await sha256(stableStringify(metadata))
  };
}

function blocked(
  organizationId: string,
  reason: string,
  state?: OrganizationMigrationState,
  ownershipEvidence?: MigrationExportOwnershipEvidence
): BlockedMigrationExport {
  return {
    ready: false,
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_VERSION,
    organizationId,
    reason,
    ownershipEvidence,
    migrationState: state ? migrationStateForPackage(state) : undefined
  };
}

function sourcePersistenceMode(): "local" | "server" {
  return typeof process !== "undefined" && process.env?.NEXT_PUBLIC_OIP_PERSISTENCE_MODE === "server"
    ? "server"
    : "local";
}

/**
 * Export the resolved localStorage organization view without invoking any
 * migration, save, self-healing, reset, counter-allocation, or server path.
 * The result is an in-memory package; it is not downloaded automatically.
 */
export async function exportOrganizationSnapshot(organizationId: string): Promise<MigrationExportResult> {
  try {
    requireOrganizationId(organizationId, "Organization migration export");
  } catch (error) {
    return blocked(organizationId, error instanceof Error ? error.message : "organizationId is invalid.");
  }

  if (sourcePersistenceMode() === "server") {
    return blocked(organizationId, "LocalStorage export is blocked while server persistence mode is active.");
  }

  const store = storage();
  if (!store) return blocked(organizationId, "LocalStorage is unavailable; no migration-ready export was produced.");

  try {
    const state = readMigrationStateForExport();
    if (state.compatibilityIssue) return blocked(organizationId, `Migration state is incompatible: ${state.compatibilityIssue}`, state);

    const resolved = Object.fromEntries(
      RESOURCE_NAMES.map((resourceName) => [resourceName, resolveResource(store, state, organizationId, resourceName)])
    ) as Record<MigrationExportResourceName, ResolvedResource<unknown>>;
    const resetSuppressed = isResetSuppressed(state, organizationId);
    const legacyStoragePresent = RESOURCE_NAMES.some((resourceName) => resolved[resourceName].legacyPresent);
    const legacyFallbackResources = RESOURCE_NAMES.filter((resourceName) => resolved[resourceName].fallbackUsed);
    const ownershipEvidence = deriveOwnershipEvidence(
      state,
      organizationId,
      legacyStoragePresent,
      legacyFallbackResources,
      resetSuppressed
    );
    if (!ownershipEvidence.safeForMigration) {
      return blocked(organizationId, ownershipEvidence.ownershipReason, state, ownershipEvidence);
    }

    const profile = resolveOrganizationProfile(store, organizationId);
    const resources = emptyResources();

    const rawKnowledge = Array.isArray(resolved.knowledge.value) ? resolved.knowledge.value as KnowledgeItem[] : null;
    if (rawKnowledge) {
      assertOrganizationOwnership(rawKnowledge, organizationId, "knowledge");
      resources.knowledge = normalizePersistedKnowledgeSnapshot(organizationId, rawKnowledge, { deterministicRepairs: true });
    }
    const rawCandidates = Array.isArray(resolved.knowledgeCandidates.value) ? resolved.knowledgeCandidates.value as KnowledgeCandidate[] : [];
    const rawValidations = Array.isArray(resolved.validationRecords.value) ? resolved.validationRecords.value as ValidationRecord[] : [];
    const rawMemoryChanges = Array.isArray(resolved.memoryChangeRecords.value) ? resolved.memoryChangeRecords.value as MemoryChangeRecord[] : [];
    const rawPatterns = Array.isArray(resolved.emergingPatterns.value) ? resolved.emergingPatterns.value as EmergingPattern[] : [];
    const rawTickets = Array.isArray(resolved.ticketRecords.value) ? resolved.ticketRecords.value as TicketRecord[] : [];

    resources.knowledgeCandidates = stampOrganization(rawCandidates, organizationId, "knowledgeCandidates");
    resources.validationRecords = stampOrganization(rawValidations, organizationId, "validationRecords");
    resources.memoryChangeRecords = stampOrganization(rawMemoryChanges, organizationId, "memoryChangeRecords");
    resources.emergingPatterns = stampOrganization(rawPatterns, organizationId, "emergingPatterns");
    resources.ticketRecords = stampTickets(rawTickets, organizationId);

    if (resolved.orgMetrics.value && typeof resolved.orgMetrics.value === "object" && !Array.isArray(resolved.orgMetrics.value)) {
      resources.orgMetrics = stampOrganization([resolved.orgMetrics.value as OrgMetrics], organizationId, "orgMetrics")[0];
    }
    resources.intelligenceLog = Array.isArray(resolved.intelligenceLog.value)
      ? resolved.intelligenceLog.value as IntelligenceLogEntry[]
      : [];

    if (resolved.ticketSequence.value !== null) {
      const counterSource = resolved.ticketSequence.value;
      let counter: number | undefined;
      if (typeof counterSource === "number") counter = counterSource;
      else if (typeof counterSource === "object" && !Array.isArray(counterSource)) {
        const counters = counterSource as Record<string, unknown>;
        const value = counters[organizationId];
        if (typeof value === "number" && Number.isFinite(value)) counter = value;
      }
      if (counter !== undefined) {
        resources.ticketSequence = {
          organizationId,
          counter,
          updatedAt: null
        } satisfies MigrationExportTicketSequence;
      }
    }

    // A displayed seed knowledge set is not persisted organizational memory.
    // Keep the resource empty when neither scoped nor permitted legacy data was
    // present, while retaining the source status as `seed` for provenance.
    if (resolved.knowledge.source === "absent" || resolved.knowledge.source === "suppressed") {
      resources.knowledge = [];
    }

    const sourceResourceStatuses = {} as Record<MigrationExportResourceName, MigrationExportResourceStatus>;
    for (const resourceName of RESOURCE_NAMES) {
      const item = resolved[resourceName];
      const source = resourceName === "knowledge" && item.source === "absent" ? "seed" : item.source;
      sourceResourceStatuses[resourceName] = statusFor(
        { ...item, source },
        resetSuppressed,
        recordCount(resources[resourceName])
      );
    }

    const counts = countResources(resources);
    const metadata = {
      format: EXPORT_FORMAT,
      formatVersion: EXPORT_VERSION,
      organizationId,
      organizationProfile: profile.profile,
      organizationProfileSource: profile.source,
      sourceSchemaVersion: SOURCE_SCHEMA_VERSION,
      sourcePersistenceMode: "local",
      ownershipEvidence,
      migrationState: migrationStateForPackage(state),
      sourceResourceStatuses,
      counts
    };
    const digests = await digestsFor(resources, metadata);
    const exportPackage: MigrationExportPackage = {
      format: EXPORT_FORMAT,
      formatVersion: EXPORT_VERSION,
      organizationId,
      organizationProfile: profile.profile,
      organizationProfileSource: profile.source,
      exportedAt: new Date().toISOString(),
      sourceSchemaVersion: SOURCE_SCHEMA_VERSION,
      sourcePersistenceMode: "local",
      ownershipEvidence,
      migrationState: migrationStateForPackage(state),
      sourceResourceStatuses,
      resources,
      counts,
      digests
    };
    return { ready: true, package: exportPackage };
  } catch (error) {
    return blocked(
      organizationId,
      `Export blocked: ${error instanceof Error ? error.message : "the resolved local state could not be read safely."}`
    );
  }
}

export type {
  BlockedMigrationExport,
  MigrationExportPackage,
  MigrationExportResult
} from "@/types/migrationExport";
