import type {
  KnowledgeItem,
  OrgMetrics,
  IntelligenceLogEntry,
  EmergingPattern,
  KnowledgeCandidate,
  ValidationRecord,
  MemoryChangeRecord
} from "@/types";
import { seedKnowledge } from "@/data/seedKnowledge";
import { withLearningDefaults } from "@/lib/trustEngine";
import {
  withCanonicalProblemDefaults,
  dedupeCanonicalProblems,
  repairCorruptedCustomerTemplates,
  repairLegacyLessonResponseTemplates
} from "@/lib/canonicalProblemEngine";
import { requireOrganizationId } from "@/lib/organizationId";
import { clearTicketRecords } from "@/lib/ticketRecords";

/**
 * Persistent Organizational Memory (prototype) — backed by localStorage.
 *
 * This makes the platform feel stateful: knowledge, trust scores, reuse counts
 * and organization metrics survive across sessions and demo runs. No backend,
 * no database — purely client-side persistence for the hackathon prototype.
 */

const STORAGE_VERSION = "v2";
const ISOLATED_STORAGE_VERSION = "v1";
export const ORGANIZATION_ISOLATION_MIGRATION_KEY = "oip.organizationIsolationMigration.v1";
const KNOWLEDGE_KEY = `oip.knowledge.${STORAGE_VERSION}`;
const ORG_METRICS_KEY = `oip.orgMetrics.${STORAGE_VERSION}`;
const LOG_KEY = `oip.intelligenceLog.${STORAGE_VERSION}`;
const PATTERNS_KEY = `oip.emergingPatterns.${STORAGE_VERSION}`;
const CANDIDATES_KEY = `oip.knowledgeCandidates.${STORAGE_VERSION}`;
const VALIDATION_RECORDS_KEY = `oip.validationRecords.${STORAGE_VERSION}`;
const MEMORY_CHANGES_KEY = `oip.memoryChanges.${STORAGE_VERSION}`;
const ORGANIZATION_PROFILE_KEY = "oip.organizationProfile.v1";
const ORGANIZATION_LIST_KEY = "oip.organizationList.v1";
// Pre-isolation v2 data belonged to the original Maesa workspace in this repository.
const KNOWN_LEGACY_OWNER_ID = "profile-maesa-tech";
const MAX_LOG_ENTRIES = 80;
const MAX_SCOPED_MEMORY_CHANGE_RECORDS = 12;

export type OrganizationMigrationResource =
  | "knowledge"
  | "candidates"
  | "validationRecords"
  | "memoryChanges"
  | "metrics"
  | "patterns"
  | "intelligenceLog"
  | "tickets"
  | "ticketCounter";

const MIGRATION_RESOURCES: readonly OrganizationMigrationResource[] = [
  "knowledge",
  "candidates",
  "validationRecords",
  "memoryChanges",
  "metrics",
  "patterns",
  "intelligenceLog",
  "tickets",
  "ticketCounter"
];

type MigrationResourceStatus = "copied" | "fallback" | "absent" | "error";

interface MigrationResourceState {
  status: MigrationResourceStatus;
  reason?: string;
  updatedAt: string;
}

export interface OrganizationMigrationState {
  version: string;
  sourceVersion: string;
  organizations: Record<string, {
    resources: Partial<Record<OrganizationMigrationResource, MigrationResourceState>>;
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

export interface OrganizationMigrationResult {
  organizationId: string;
  resources: Partial<Record<OrganizationMigrationResource, MigrationResourceStatus>>;
  warnings: string[];
}

const runtimeLegacyFallbacks = new Map<string, Set<OrganizationMigrationResource>>();
const runtimeResetSuppressions = new Set<string>();
let runtimeLegacyOwnerOrganizationId: string | undefined;
let runtimeLegacyOwnershipAmbiguous = false;

function isKnownMigrationResourceStatus(value: unknown): value is MigrationResourceStatus {
  return value === "copied" || value === "fallback" || value === "absent" || value === "error";
}

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function read<T>(key: string): T | null {
  if (!hasStorage()) return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

function write(key: string, value: unknown): void {
  if (!hasStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function tryWrite(key: string, value: unknown): boolean {
  if (!hasStorage()) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    if (isQuotaExceededError(error)) return false;
    throw error;
  }
}

function isQuotaExceededError(error: unknown): boolean {
  const candidate = error as { name?: string; code?: number; message?: string } | null;
  return candidate?.name === "QuotaExceededError"
    || candidate?.code === 22
    || candidate?.code === 1014
    || candidate?.message?.toLowerCase().includes("quota") === true;
}

function resolveScopedStorageKey(baseKey: string, organizationId: string): string {
  requireOrganizationId(organizationId, "Organization storage key resolution");
  const resource = baseKey.replace(/^oip\./, "").replace(`.${STORAGE_VERSION}`, "");
  return `oip.organization.${encodeURIComponent(organizationId)}.${resource}.${ISOLATED_STORAGE_VERSION}`;
}

function hasKey(key: string): boolean {
  return hasStorage() && window.localStorage.getItem(key) !== null;
}

function readMigrationState(): OrganizationMigrationState {
  let stored: (Partial<OrganizationMigrationState> & { organizationId?: string }) | null = null;
  try {
    stored = read<Partial<OrganizationMigrationState> & { organizationId?: string }>(ORGANIZATION_ISOLATION_MIGRATION_KEY);
  } catch {
    return {
      version: ISOLATED_STORAGE_VERSION,
      sourceVersion: STORAGE_VERSION,
      organizations: {},
      compatibilityIssue: "the migration marker contains invalid JSON"
    };
  }
  if (stored?.organizations && typeof stored.organizations === "object" && !Array.isArray(stored.organizations)) {
    const organizations = stored.organizations as Record<string, { resources?: unknown }>;
    const hasMalformedOrganization = Object.values(organizations).some((organization) => {
      const candidate = organization as { resources?: unknown } | null;
      return !candidate
        || typeof candidate !== "object"
        || !candidate.resources
        || typeof candidate.resources !== "object"
        || Array.isArray(candidate.resources);
    });
    const hasMalformedResourceState = !hasMalformedOrganization && Object.values(organizations).some((organization) =>
      Object.entries(organization.resources as Record<string, { status?: unknown }>).some(([resource, resourceState]) =>
        !MIGRATION_RESOURCES.includes(resource as OrganizationMigrationResource)
        || !resourceState
        || !isKnownMigrationResourceStatus(resourceState.status))
    );
    if (hasMalformedOrganization || hasMalformedResourceState) {
      return {
        version: ISOLATED_STORAGE_VERSION,
        sourceVersion: STORAGE_VERSION,
        organizations: {},
        compatibilityIssue: "the migration marker contains an unrecognized resource state"
      };
    }
    if (stored.version !== ISOLATED_STORAGE_VERSION || stored.sourceVersion !== STORAGE_VERSION) {
      return {
        version: ISOLATED_STORAGE_VERSION,
        sourceVersion: STORAGE_VERSION,
        organizations: {},
        compatibilityIssue: "the migration marker uses an unsupported version"
      };
    }
    return stored as OrganizationMigrationState;
  }

  // Accept the old single-organization marker written by the first Phase 2
  // implementation and enrich it on the next safe migration pass.
  if (stored?.organizationId) {
    return {
      version: ISOLATED_STORAGE_VERSION,
      sourceVersion: STORAGE_VERSION,
      organizations: { [stored.organizationId]: { resources: {} } },
      legacyOwnerOrganizationId: stored.organizationId,
      legacyOwnershipStatus: "owned",
      legacyOwnershipReason: "inferred from the original single-organization migration marker",
      legacyOwnershipUpdatedAt: new Date().toISOString()
    };
  }

  if (stored) {
    return {
      version: ISOLATED_STORAGE_VERSION,
      sourceVersion: STORAGE_VERSION,
      organizations: {},
      compatibilityIssue: "the migration marker has an unrecognized shape"
    };
  }

  return { version: ISOLATED_STORAGE_VERSION, sourceVersion: STORAGE_VERSION, organizations: {} };
}

/**
 * Read the migration marker without preparing, repairing, or persisting it.
 * This is intentionally separate from `migrateLegacyOrganizationStorage()`
 * for read-only migration export tooling.
 */
export function readMigrationStateForExport(): OrganizationMigrationState {
  return readMigrationState();
}

function rememberRuntimeFallback(organizationId: string, resource: OrganizationMigrationResource): void {
  const resources = runtimeLegacyFallbacks.get(organizationId) ?? new Set<OrganizationMigrationResource>();
  resources.add(resource);
  runtimeLegacyFallbacks.set(organizationId, resources);
}

function forgetRuntimeFallback(organizationId: string, resource: OrganizationMigrationResource): void {
  const resources = runtimeLegacyFallbacks.get(organizationId);
  resources?.delete(resource);
  if (resources?.size === 0) runtimeLegacyFallbacks.delete(organizationId);
}

function rememberRuntimeLegacyOwner(organizationId: string): void {
  runtimeLegacyOwnerOrganizationId = organizationId;
  runtimeLegacyOwnershipAmbiguous = false;
}

function rememberRuntimeLegacyOwnershipAmbiguous(): void {
  runtimeLegacyOwnerOrganizationId = undefined;
  runtimeLegacyOwnershipAmbiguous = true;
}

function stateLegacyOwner(state: OrganizationMigrationState): string | undefined {
  if (state.legacyOwnershipStatus === "ambiguous") return undefined;
  return state.legacyOwnerOrganizationId ?? runtimeLegacyOwnerOrganizationId;
}

function canUseLegacyFallback(state: OrganizationMigrationState, organizationId: string): boolean {
  if (state.compatibilityIssue) return false;
  if (state.legacyOwnershipStatus === "ambiguous" || runtimeLegacyOwnershipAmbiguous) return false;
  if (runtimeResetSuppressions.has(organizationId)
    || state.organizations[organizationId]?.legacyImportSuppressed === true) return false;
  return stateLegacyOwner(state) === organizationId;
}

/** Safe runtime-only fallback visibility for resources whose marker write failed. */
export function hasRuntimeLegacyFallback(
  organizationId: string,
  resource: OrganizationMigrationResource
): boolean {
  requireOrganizationId(organizationId, "Runtime legacy fallback lookup");
  if (!hasStorage()) return false;
  const state = readMigrationState();
  return canUseLegacyFallback(state, organizationId)
    && runtimeLegacyFallbacks.get(organizationId)?.has(resource) === true;
}

function hasLegacyFallback(organizationId: string, resource: OrganizationMigrationResource): boolean {
  const state = readMigrationState();
  if (!canUseLegacyFallback(state, organizationId)) return false;
  return runtimeLegacyFallbacks.get(organizationId)?.has(resource) === true
    || state.organizations[organizationId]?.resources[resource]?.status === "fallback";
}

function markResource(
  organizationId: string,
  resource: OrganizationMigrationResource,
  status: MigrationResourceStatus,
  reason?: string
): MigrationResourceState {
  if (status === "fallback") rememberRuntimeFallback(organizationId, resource);
  else forgetRuntimeFallback(organizationId, resource);
  return { status, reason, updatedAt: new Date().toISOString() };
}

function copyIfMissing<T, U = T>(
  organizationId: string,
  resource: OrganizationMigrationResource,
  legacyKey: string,
  scopedKey: string,
  transform: (value: T) => U,
  warnings: string[]
): MigrationResourceState {
  const label = resource === "memoryChanges" ? "memory change history" : resource;
  try {
    // copyIfMissing is intentionally copy-only: an existing scoped value wins
    // over legacy data on every retry.
    if (hasKey(scopedKey)) return markResource(organizationId, resource, "copied");
    if (!hasKey(legacyKey)) return markResource(organizationId, resource, "absent");

    const value = read<T>(legacyKey);
    if (value === null) return markResource(organizationId, resource, "absent");
    if (tryWrite(scopedKey, transform(value))) return markResource(organizationId, resource, "copied");
  } catch (error) {
    if (isQuotaExceededError(error)) {
      rememberRuntimeFallback(organizationId, resource);
      warnings.push(`Could not copy ${label} into organization storage because browser storage is full. Existing data remains available from legacy storage.`);
      return markResource(organizationId, resource, "fallback", "legacy fallback retained after storage quota");
    }

    const reason = error instanceof Error ? error.message : "the stored legacy value could not be read or transformed";
    warnings.push(`Could not migrate ${label}: ${reason}. The resource is unresolved and will be retried later.`);
    return markResource(organizationId, resource, "error", reason);
  }

  // A false write result is the guarded quota path in tryWrite(). Keep the
  // legacy value authoritative and retry this resource on a later pass.
  rememberRuntimeFallback(organizationId, resource);
  warnings.push(`Could not copy ${label} into organization storage because browser storage is full. Existing data remains available from legacy storage.`);
  return markResource(organizationId, resource, "fallback", "legacy fallback retained after storage quota");
}

function resourceStatus(
  organizationId: string,
  resource: OrganizationMigrationResource,
  state: OrganizationMigrationState
): MigrationResourceState | undefined {
  return state.organizations[organizationId]?.resources[resource];
}

function migrationStateCompatibilityWarning(
  organizationId: string,
  state: OrganizationMigrationState
): string | undefined {
  const resources = state.organizations[organizationId]?.resources ?? {};
  for (const [resource, resourceState] of Object.entries(resources)) {
    if (!MIGRATION_RESOURCES.includes(resource as OrganizationMigrationResource)
      || !resourceState
      || !isKnownMigrationResourceStatus(resourceState.status)) {
      return `Migration state for ${organizationId} contains an unrecognized resource status (${resource}); migration is blocked until the marker is repaired.`;
    }
  }
  return undefined;
}

function hasResolvedMigrationResources(
  organizationId: string,
  state: OrganizationMigrationState
): boolean {
  return MIGRATION_RESOURCES.every((resource) => {
    const status = resourceStatus(organizationId, resource, state)?.status;
    return status === "copied" || status === "absent";
  });
}

function hasValidCompletedMigration(
  organizationId: string,
  state: OrganizationMigrationState
): boolean {
  const organizationState = state.organizations[organizationId];
  return state.legacyOwnershipStatus === "owned"
    && state.legacyOwnerOrganizationId === organizationId
    && !!organizationState?.completedAt
    && hasResolvedMigrationResources(organizationId, state);
}

function addPersistedResourceStatuses(
  organizationId: string,
  state: OrganizationMigrationState,
  result: OrganizationMigrationResult
): void {
  for (const resource of MIGRATION_RESOURCES) {
    const resourceState = resourceStatus(organizationId, resource, state);
    if (resourceState) result.resources[resource] = resourceState.status;
  }
}

function saveMigrationState(state: OrganizationMigrationState): boolean {
  try {
    return tryWrite(ORGANIZATION_ISOLATION_MIGRATION_KEY, state);
  } catch {
    return false;
  }
}

const LEGACY_STORAGE_KEYS = [
  KNOWLEDGE_KEY,
  CANDIDATES_KEY,
  VALIDATION_RECORDS_KEY,
  MEMORY_CHANGES_KEY,
  ORG_METRICS_KEY,
  PATTERNS_KEY,
  LOG_KEY,
  "oip.ticketRecords.v2",
  "oip.ticketCounter.v2"
];

function hasLegacyStorage(): boolean {
  return LEGACY_STORAGE_KEYS.some((key) => hasKey(key));
}

function readPersistedOrganizationIds(): string[] | null {
  const ids = new Set<string>();
  try {
    const profile = read<{ id?: string }>(ORGANIZATION_PROFILE_KEY);
    if (profile?.id) ids.add(profile.id);
    const list = read<Array<{ id?: string }>>(ORGANIZATION_LIST_KEY);
    if (Array.isArray(list)) {
      list.forEach((organization) => {
        if (organization?.id) ids.add(organization.id);
      });
    }
  } catch {
    return null;
  }
  return [...ids];
}

function hasMigrationEvidence(
  organization: OrganizationMigrationState["organizations"][string]
): boolean {
  return Object.keys(organization.resources).length > 0 || !!organization.completedAt;
}

interface LegacyOwnershipResolution {
  status: "owned" | "ambiguous";
  organizationId?: string;
  reason: string;
}

function resolveLegacyOwnership(state: OrganizationMigrationState): LegacyOwnershipResolution {
  if (state.legacyOwnerOrganizationId && state.legacyOwnershipStatus !== "ambiguous") {
    return {
      status: "owned",
      organizationId: state.legacyOwnerOrganizationId,
      reason: state.legacyOwnershipReason ?? "preserved durable legacy ownership metadata"
    };
  }
  if (state.legacyOwnershipStatus === "ambiguous") {
    return {
      status: "ambiguous",
      reason: state.legacyOwnershipReason ?? "legacy ownership was previously determined to be ambiguous"
    };
  }

  const migrationOrganizationIds = Object.entries(state.organizations)
    .filter(([, organization]) => hasMigrationEvidence(organization))
    .map(([organizationId]) => organizationId);
  if (migrationOrganizationIds.length === 1) {
    return {
      status: "owned",
      organizationId: migrationOrganizationIds[0],
      reason: "inferred from the only pre-existing organization migration record"
    };
  }
  if (migrationOrganizationIds.length > 1) {
    return {
      status: "ambiguous",
      reason: `multiple organizations have pre-existing migration evidence: ${migrationOrganizationIds.join(", ")}`
    };
  }

  // The original pre-isolation workspace is known from the repository's seeded
  // organization/profile state. This is independent of whichever organization
  // is active when migration first runs.
  const persistedOrganizationIds = readPersistedOrganizationIds();
  if (persistedOrganizationIds !== null
    && (persistedOrganizationIds.length === 0 || persistedOrganizationIds.includes(KNOWN_LEGACY_OWNER_ID))) {
    return {
      status: "owned",
      organizationId: KNOWN_LEGACY_OWNER_ID,
      reason: "inferred from the repository's original Maesa Tech workspace"
    };
  }

  return {
    status: "ambiguous",
    reason: "no durable owner marker or safe existing organization evidence identifies the legacy workspace"
  };
}

function persistLegacyOwnership(
  state: OrganizationMigrationState,
  ownership: LegacyOwnershipResolution
): void {
  state.legacyOwnershipStatus = ownership.status;
  state.legacyOwnerOrganizationId = ownership.organizationId;
  state.legacyOwnershipReason = ownership.reason;
  state.legacyOwnershipUpdatedAt = new Date().toISOString();
  if (ownership.status === "owned" && ownership.organizationId) {
    rememberRuntimeLegacyOwner(ownership.organizationId);
  } else {
    rememberRuntimeLegacyOwnershipAmbiguous();
  }
}

function readOrganizationResource<T>(
  organizationId: string,
  resource: OrganizationMigrationResource,
  legacyKey: string,
  scopedKey: string
): T | null {
  const scoped = read<T>(scopedKey);
  if (scoped !== null) return scoped;
  if (hasLegacyFallback(organizationId, resource)) return read<T>(legacyKey);
  return null;
}

/**
 * Migrate the pre-isolation v2 workspace into the active organization by
 * resource. Legacy keys are deliberately read-only here and remain in
 * localStorage when a scoped copy does not fit.
 */
export function migrateLegacyOrganizationStorage(organizationId: string): OrganizationMigrationResult {
  requireOrganizationId(organizationId, "Legacy organization storage migration");
  const result: OrganizationMigrationResult = { organizationId, resources: {}, warnings: [] };
  if (!hasStorage()) return result;

  let state: OrganizationMigrationState = { version: ISOLATED_STORAGE_VERSION, sourceVersion: STORAGE_VERSION, organizations: {} };
  let organizationState: OrganizationMigrationState["organizations"][string] = { resources: {} };

  const migrate = <T, U = T>(
    resource: OrganizationMigrationResource,
    legacyKey: string,
    transform: (value: T) => U
  ) => {
    try {
      const existing = resourceStatus(organizationId, resource, state);
      const scopedKey = resolveScopedStorageKey(legacyKey, organizationId);
      const shouldRetry = !existing
        || existing.status === "error"
        || (existing.status === "fallback" && resource !== "memoryChanges");
      const next = shouldRetry
        ? copyIfMissing(organizationId, resource, legacyKey, scopedKey, transform, result.warnings)
        : existing;
      if (existing?.status === "fallback" && resource === "memoryChanges") {
        result.warnings.push("Memory change history is still being read from preserved legacy storage because its snapshots are too large to duplicate safely.");
      }
      organizationState.resources[resource] = next;
      result.resources[resource] = next.status;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "the resource could not be migrated";
      const next = markResource(organizationId, resource, "error", reason);
      organizationState.resources[resource] = next;
      result.resources[resource] = next.status;
      result.warnings.push(`Could not migrate ${resource}: ${reason}. The resource is unresolved and will be retried later.`);
    }
  };

  try {
    state = readMigrationState();
    if (state.compatibilityIssue) {
      result.warnings.push(`Legacy migration is blocked because ${state.compatibilityIssue}; the marker was left untouched.`);
      return result;
    }
    if (runtimeResetSuppressions.has(organizationId)
      || state.organizations[organizationId]?.legacyImportSuppressed === true) {
      runtimeResetSuppressions.add(organizationId);
      result.warnings.push(`Legacy migration is suppressed for ${organizationId} because the organization was explicitly reset.`);
      return result;
    }
    if (hasLegacyStorage()) {
      const ownership = resolveLegacyOwnership(state);
      if (ownership.status === "ambiguous") {
        persistLegacyOwnership(state, ownership);
        saveMigrationState(state);
        result.warnings.push(`Legacy migration is blocked because ownership is ambiguous: ${ownership.reason}. Set legacyOwnerOrganizationId explicitly before retrying.`);
        return result;
      }

      persistLegacyOwnership(state, ownership);
      if (ownership.organizationId !== organizationId) {
        saveMigrationState(state);
        result.warnings.push(`Legacy data remains owned by ${ownership.organizationId}; no legacy data was migrated into ${organizationId}.`);
        return result;
      }
    } else if (state.legacyOwnershipStatus === "owned" && state.legacyOwnerOrganizationId) {
      rememberRuntimeLegacyOwner(state.legacyOwnerOrganizationId);
      if (state.legacyOwnerOrganizationId !== organizationId) return result;
    }

    const compatibilityWarning = migrationStateCompatibilityWarning(organizationId, state);
    if (compatibilityWarning) {
      result.warnings.push(compatibilityWarning);
      return result;
    }

    // A-1/F-1: a valid completed marker is a true reload no-op; do not
    // repeat resource or migration-marker writes after every app startup.
    if (hasValidCompletedMigration(organizationId, state)) {
      addPersistedResourceStatuses(organizationId, state, result);
      return result;
    }

    organizationState = state.organizations[organizationId] ?? { resources: {} };
    state.organizations[organizationId] = organizationState;

    // Small, critical state is copied first. Each resource is isolated so a
    // malformed value cannot abort the remaining migration work; fallback and
    // error states are retried on a later pass.
    migrate<KnowledgeItem[]>("knowledge", KNOWLEDGE_KEY, (items) => items.map((item) => ({ ...item, organizationId })));
    migrate<KnowledgeCandidate[]>("candidates", CANDIDATES_KEY, (items) => items.map((item) => ({ ...item, organizationId })));
    migrate<ValidationRecord[]>("validationRecords", VALIDATION_RECORDS_KEY, (items) => items.map((item) => ({ ...item, organizationId })));
    migrate<OrgMetrics>("metrics", ORG_METRICS_KEY, (metrics) => ({ ...metrics, organizationId }));
    migrate<EmergingPattern[]>("patterns", PATTERNS_KEY, (patterns) => patterns.map((pattern) => ({ ...pattern, organizationId })));
    migrate<Array<{ orgId?: string }>>("tickets", "oip.ticketRecords.v2", (records) => records.map((record) => ({ ...record, orgId: organizationId })));
    migrate<Record<string, number>, number>("ticketCounter", "oip.ticketCounter.v2", (counters) => counters[organizationId] ?? 0);
    migrate<IntelligenceLogEntry[]>("intelligenceLog", LOG_KEY, (entries) => entries.slice(-MAX_LOG_ENTRIES));

    // Do not duplicate large before/after snapshots. The legacy key remains
    // the authoritative history until a future database-backed migration.
    const memoryStatus = resourceStatus(organizationId, "memoryChanges", state);
    const legacyMemoryExists = hasKey(MEMORY_CHANGES_KEY);
    const memoryState = memoryStatus ?? markResource(
      organizationId,
      "memoryChanges",
      legacyMemoryExists ? "fallback" : "absent",
      legacyMemoryExists ? "legacy fallback retained to avoid duplicating snapshots" : undefined
    );
    if (memoryState.status === "fallback") {
      result.warnings.push("Memory change history is still being read from preserved legacy storage because its snapshots are too large to duplicate safely.");
    }
    organizationState.resources.memoryChanges = memoryState;
    result.resources.memoryChanges = memoryState.status;

    if (hasResolvedMigrationResources(organizationId, state)) {
      organizationState.completedAt ??= new Date().toISOString();
    } else {
      delete organizationState.completedAt;
    }
    if (!saveMigrationState(state)) {
      result.warnings.push("Migration progress could not be saved because browser storage is full. Existing legacy data was left untouched, and unresolved resources will be retried on a later pass.");
    }
  } catch (error) {
    console.error("Organization storage migration was left partial.", error);
    result.warnings.push("Some organization data could not be copied, but startup will continue using preserved legacy storage where available.");
    saveMigrationState(state);
  }

  return result;
}

/* ---------------------------- Knowledge ---------------------------- */

export function seedOrganizationalKnowledge(): KnowledgeItem[] {
  return dedupeCanonicalProblems(
    seedKnowledge.map((item) => withCanonicalProblemDefaults(withLearningDefaults({ ...item, tags: [...item.tags] })))
  );
}

/**
 * Apply the same in-memory normalization used by loadKnowledge() without the
 * self-healing writeback. Export tooling uses this to describe the resolved
 * visible state while preserving the exact browser storage bytes.
 */
interface KnowledgeSnapshotNormalization {
  normalized: KnowledgeItem[];
  deduped: KnowledgeItem[];
  items: KnowledgeItem[];
  repairedTemplateCount: number;
  repairedLessonCount: number;
}

function normalizePersistedKnowledgeSnapshotDetails(
  organizationId: string,
  stored: KnowledgeItem[],
  options?: { deterministicRepairs?: boolean }
): KnowledgeSnapshotNormalization {
  requireOrganizationId(organizationId, "normalizePersistedKnowledgeSnapshot");
  const normalized = stored.map((item) => withCanonicalProblemDefaults(withLearningDefaults({
    ...item,
    organizationId: item.organizationId ?? organizationId
  })));
  const deduped = dedupeCanonicalProblems(normalized);
  const repairOptions = options?.deterministicRepairs
    ? { timestamp: "1970-01-01T00:00:00.000Z", deterministic: true }
    : undefined;
  const { items: repairedTemplates, repairedCount: repairedTemplateCount } = repairCorruptedCustomerTemplates(deduped, undefined, repairOptions);
  const { items, repairedCount: repairedLessonCount } = repairLegacyLessonResponseTemplates(repairedTemplates, repairOptions);
  return { normalized, deduped, items, repairedTemplateCount, repairedLessonCount };
}

export function normalizePersistedKnowledgeSnapshot(
  organizationId: string,
  stored: KnowledgeItem[],
  options?: { deterministicRepairs?: boolean }
): KnowledgeItem[] {
  return normalizePersistedKnowledgeSnapshotDetails(organizationId, stored, options).items;
}

export async function loadKnowledge(organizationId: string): Promise<KnowledgeItem[]> {
  requireOrganizationId(organizationId, "loadKnowledge");
  const stored = readOrganizationResource<KnowledgeItem[]>(organizationId, "knowledge", KNOWLEDGE_KEY, resolveScopedStorageKey(KNOWLEDGE_KEY, organizationId));
  if (stored && Array.isArray(stored) && stored.length > 0) {
    const normalized = normalizePersistedKnowledgeSnapshotDetails(organizationId, stored);
    if (normalized.deduped.length !== normalized.normalized.length
      || normalized.repairedTemplateCount > 0
      || normalized.repairedLessonCount > 0) {
      try {
        await saveKnowledge(organizationId, normalized.items);
      } catch {
        /* keep load behavior intact even if a self-heal writeback fails */
      }
    }
    return normalized.items;
  }
  return seedOrganizationalKnowledge().map((item) => ({ ...item, organizationId }));
}

export async function saveKnowledge(organizationId: string, items: KnowledgeItem[]): Promise<void> {
  requireOrganizationId(organizationId, "saveKnowledge");
  write(resolveScopedStorageKey(KNOWLEDGE_KEY, organizationId), items);
}

/* ---------------------- Validation and memory change history ---------------------- */

export async function loadKnowledgeCandidates(organizationId: string): Promise<KnowledgeCandidate[]> {
  requireOrganizationId(organizationId, "loadKnowledgeCandidates");
  const stored = readOrganizationResource<KnowledgeCandidate[]>(organizationId, "candidates", CANDIDATES_KEY, resolveScopedStorageKey(CANDIDATES_KEY, organizationId));
  return stored && Array.isArray(stored) ? stored.map((candidate) => ({ ...candidate, organizationId: candidate.organizationId ?? organizationId })) : [];
}

export async function saveKnowledgeCandidates(
  organizationId: string,
  candidates: KnowledgeCandidate[]
): Promise<void> {
  requireOrganizationId(organizationId, "saveKnowledgeCandidates");
  write(resolveScopedStorageKey(CANDIDATES_KEY, organizationId), candidates);
}

export async function loadValidationRecords(organizationId: string): Promise<ValidationRecord[]> {
  requireOrganizationId(organizationId, "loadValidationRecords");
  const stored = readOrganizationResource<ValidationRecord[]>(organizationId, "validationRecords", VALIDATION_RECORDS_KEY, resolveScopedStorageKey(VALIDATION_RECORDS_KEY, organizationId));
  return stored && Array.isArray(stored) ? stored.map((record) => ({ ...record, organizationId: record.organizationId ?? organizationId })) : [];
}

export async function saveValidationRecords(
  organizationId: string,
  records: ValidationRecord[]
): Promise<void> {
  requireOrganizationId(organizationId, "saveValidationRecords");
  write(resolveScopedStorageKey(VALIDATION_RECORDS_KEY, organizationId), records);
}

export async function loadMemoryChangeRecords(organizationId: string): Promise<MemoryChangeRecord[]> {
  requireOrganizationId(organizationId, "loadMemoryChangeRecords");
  const scoped = read<MemoryChangeRecord[]>(resolveScopedStorageKey(MEMORY_CHANGES_KEY, organizationId));
  const legacy = hasLegacyFallback(organizationId, "memoryChanges")
    ? read<MemoryChangeRecord[]>(MEMORY_CHANGES_KEY)
    : null;
  const merged = [...(legacy ?? []), ...(scoped ?? [])];
  const byId = new Map(merged.map((record) => [record.id, record]));
  return Array.from(byId.values()).map((record) => ({ ...record, organizationId: record.organizationId ?? organizationId }));
}

export async function saveMemoryChangeRecords(
  organizationId: string,
  records: MemoryChangeRecord[]
): Promise<void> {
  requireOrganizationId(organizationId, "saveMemoryChangeRecords");
  if (hasLegacyFallback(organizationId, "memoryChanges")) {
    // Preserve the complete legacy history and only keep a small scoped tail
    // for new writes. This avoids repeatedly attempting the known-too-large
    // full snapshot while keeping recent changes durable when space permits.
    const bounded = records.slice(-MAX_SCOPED_MEMORY_CHANGE_RECORDS);
    const scopedKey = resolveScopedStorageKey(MEMORY_CHANGES_KEY, organizationId);
    if (!tryWrite(scopedKey, bounded)) {
      throw new Error("Memory change history could not be saved because browser storage is full. The new record remains in memory and will be retried; preserved legacy history was not changed.");
    }
    return;
  }
  write(resolveScopedStorageKey(MEMORY_CHANGES_KEY, organizationId), records);
}

/* ---------------------------- Org metrics ---------------------------- */

export function seedOrgMetrics(organizationId: string): OrgMetrics {
  requireOrganizationId(organizationId, "seedOrgMetrics");
  return {
    lifetimeTickets: 0,
    knowledgeReused: 0,
    autoResolutions: 0,
    humanResolutions: 0,
    totalResolutionTimeSec: 0,
    resolutionsCount: 0,
    memoryGrowthToday: 0,
    memoryGrowthDate: todayKey(),
    lastUpdatedAt: new Date().toISOString(),
    mergedTickets: 0,
    duplicatePreventions: 0,
    knowledgeVersions: 0,
    aiCalls: 0,
    aiSuccesses: 0,
    aiFailures: 0,
    aiFallbacks: 0,
    aiAgreementSamples: 0,
    aiAgreementTotal: 0,
    humanAcceptedAISuggestions: 0,
    organizationId
  };
}

export async function loadOrgMetrics(organizationId: string): Promise<OrgMetrics> {
  requireOrganizationId(organizationId, "loadOrgMetrics");
  const stored = readOrganizationResource<OrgMetrics>(organizationId, "metrics", ORG_METRICS_KEY, resolveScopedStorageKey(ORG_METRICS_KEY, organizationId));
  if (!stored) return seedOrgMetrics(organizationId);
  const owned = { ...stored, organizationId: stored.organizationId ?? organizationId };

  // Roll over the "today" growth counter if the stored date is stale.
  if (owned.memoryGrowthDate !== todayKey()) {
    return { ...owned, memoryGrowthToday: 0, memoryGrowthDate: todayKey() };
  }
  return owned;
}

export async function saveOrgMetrics(organizationId: string, metrics: OrgMetrics): Promise<void> {
  requireOrganizationId(organizationId, "saveOrgMetrics");
  write(resolveScopedStorageKey(ORG_METRICS_KEY, organizationId), metrics);
}

/* ---------------------------- Intelligence log ---------------------------- */

export async function loadOrgLog(organizationId: string): Promise<IntelligenceLogEntry[]> {
  requireOrganizationId(organizationId, "loadOrgLog");
  const stored = readOrganizationResource<IntelligenceLogEntry[]>(organizationId, "intelligenceLog", LOG_KEY, resolveScopedStorageKey(LOG_KEY, organizationId));
  return stored && Array.isArray(stored) ? stored : [];
}

export async function saveOrgLog(
  organizationId: string,
  entries: IntelligenceLogEntry[]
): Promise<void> {
  requireOrganizationId(organizationId, "saveOrgLog");
  // Keep only the most recent entries to bound storage size.
  const trimmed = entries.slice(-MAX_LOG_ENTRIES);
  write(resolveScopedStorageKey(LOG_KEY, organizationId), trimmed);
}

/* ---------------------- Emerging Patterns ---------------------- */

export function seedEmergingPatterns(): EmergingPattern[] {
  return [];
}

export async function loadEmergingPatterns(organizationId: string): Promise<EmergingPattern[]> {
  requireOrganizationId(organizationId, "loadEmergingPatterns");
  const stored = readOrganizationResource<EmergingPattern[]>(organizationId, "patterns", PATTERNS_KEY, resolveScopedStorageKey(PATTERNS_KEY, organizationId));
  return stored && Array.isArray(stored) && stored.length > 0
    ? stored.map((pattern) => ({ ...pattern, organizationId: pattern.organizationId ?? organizationId }))
    : seedEmergingPatterns();
}

export async function saveEmergingPatterns(
  organizationId: string,
  patterns: EmergingPattern[]
): Promise<void> {
  requireOrganizationId(organizationId, "saveEmergingPatterns");
  write(resolveScopedStorageKey(PATTERNS_KEY, organizationId), patterns);
}

/* ---------------------------- Reset ---------------------------- */

function clearScopedOrganizationStorage(organizationId: string): void {
  requireOrganizationId(organizationId, "Scoped organization storage cleanup");
  const keys = [KNOWLEDGE_KEY, ORG_METRICS_KEY, LOG_KEY, PATTERNS_KEY, CANDIDATES_KEY, VALIDATION_RECORDS_KEY, MEMORY_CHANGES_KEY];
  keys.forEach((key) => window.localStorage.removeItem(resolveScopedStorageKey(key, organizationId)));
  clearTicketRecords(organizationId);
}

function requireMigrationStateSave(state: OrganizationMigrationState, operation: string): void {
  if (!saveMigrationState(state)) {
    throw new Error(`Could not persist ${operation} because browser storage is full or unavailable. No durable completion was claimed.`);
  }
}

/** Wipe persisted organizational memory and durably suppress legacy re-import. */
export function clearOrganization(organizationId: string): void {
  requireOrganizationId(organizationId, "clearOrganization");
  if (!hasStorage()) return;
  const state = readMigrationState();
  if (state.compatibilityIssue) {
    throw new Error(`Organization reset is blocked because ${state.compatibilityIssue}.`);
  }

  const existing = state.organizations[organizationId];
  state.organizations[organizationId] = {
    ...(existing ?? { resources: {} }),
    resources: {},
    resetAt: new Date().toISOString(),
    legacyImportSuppressed: true
  };
  delete state.organizations[organizationId].completedAt;
  runtimeResetSuppressions.add(organizationId);
  runtimeLegacyFallbacks.delete(organizationId);
  requireMigrationStateSave(state, `the reset tombstone for ${organizationId}`);
  clearScopedOrganizationStorage(organizationId);
}

/** Remove one organization's scoped state without deleting global legacy data. */
export function deleteOrganizationData(organizationId: string): void {
  requireOrganizationId(organizationId, "deleteOrganizationData");
  if (!hasStorage()) return;
  const hasPersistedMigrationState = hasKey(ORGANIZATION_ISOLATION_MIGRATION_KEY);
  const state = readMigrationState();
  if (state.compatibilityIssue) {
    throw new Error(`Organization deletion is blocked because ${state.compatibilityIssue}.`);
  }

  clearScopedOrganizationStorage(organizationId);
  delete state.organizations[organizationId];

  const deletingLegacyOwner = state.legacyOwnerOrganizationId === organizationId
    || runtimeLegacyOwnerOrganizationId === organizationId;
  if (deletingLegacyOwner) {
    // Keep the historical owner id as evidence, but block all future automatic
    // migration/fallback rather than transferring legacy data to another org.
    state.legacyOwnerOrganizationId = organizationId;
    state.legacyOwnershipStatus = "ambiguous";
    state.legacyOwnershipReason = `legacy owner ${organizationId} was deleted; ownership will not transfer automatically`;
    state.legacyOwnershipUpdatedAt = new Date().toISOString();
    rememberRuntimeLegacyOwnershipAmbiguous();
  }

  runtimeLegacyFallbacks.delete(organizationId);
  runtimeResetSuppressions.delete(organizationId);
  if (hasPersistedMigrationState || deletingLegacyOwner) {
    requireMigrationStateSave(state, `organization deletion cleanup for ${organizationId}`);
  }
}

/* ---------------------------- Derived org stats ---------------------------- */

export interface DerivedOrgStats {
  knowledgeArticles: number;
  canonicalProblems: number;
  lifetimeTickets: number;
  knowledgeReused: number;
  autoResolutionRatePct: number;
  averageTrust: number;
  averageResolutionTimeSec: number;
  memoryGrowthToday: number;
  knowledgeVersions: number;
  mergedTickets: number;
  duplicatePreventionRatePct: number;
  emergingPatternsDetected: number;
  promotedPatterns: number;
  unresolvedEmergingPatterns: number;
  aiCalls: number;
  aiSuccessRatePct: number;
  aiFallbacks: number;
  aiAgreementRatePct: number;
  humanAcceptedAISuggestions: number;
}

export function deriveOrgStats(
  metrics: OrgMetrics,
  knowledge: KnowledgeItem[],
  avgTrust: number,
  emergingPatterns: EmergingPattern[] = []
): DerivedOrgStats {
  const totalResolutions = metrics.autoResolutions + metrics.humanResolutions;
  const autoResolutionRatePct =
    totalResolutions > 0 ? Math.round((metrics.autoResolutions / totalResolutions) * 100) : 0;
  const averageResolutionTimeSec =
    metrics.resolutionsCount > 0 ? Math.round(metrics.totalResolutionTimeSec / metrics.resolutionsCount) : 0;
  const mergedTickets = metrics.mergedTickets ?? 0;
  const duplicatePreventions = metrics.duplicatePreventions ?? 0;
  const knowledgeVersions = metrics.knowledgeVersions ?? knowledge.reduce((sum, item) => sum + (item.knowledgeVersions?.length ?? 1), 0);
  const duplicatePreventionRatePct = mergedTickets > 0 ? Math.round((duplicatePreventions / mergedTickets) * 100) : 0;
  const activePatterns = emergingPatterns.filter((p) => p.status !== "dismissed");
  const aiCalls = metrics.aiCalls ?? 0;
  const aiSuccesses = metrics.aiSuccesses ?? 0;
  const aiFallbacks = metrics.aiFallbacks ?? 0;
  const aiAgreementSamples = metrics.aiAgreementSamples ?? 0;
  const aiAgreementRatePct = aiAgreementSamples > 0 ? Math.round((metrics.aiAgreementTotal ?? 0) / aiAgreementSamples) : 0;
  const aiSuccessRatePct = aiCalls > 0 ? Math.round((aiSuccesses / aiCalls) * 100) : 0;

  return {
    knowledgeArticles: knowledge.length,
    canonicalProblems: knowledge.length,
    lifetimeTickets: metrics.lifetimeTickets,
    knowledgeReused: metrics.knowledgeReused,
    autoResolutionRatePct,
    averageTrust: avgTrust,
    averageResolutionTimeSec,
    memoryGrowthToday: metrics.memoryGrowthToday,
    knowledgeVersions,
    mergedTickets,
    duplicatePreventionRatePct,
    emergingPatternsDetected: metrics.emergingPatternsDetected ?? 0,
    promotedPatterns: metrics.promotedPatterns ?? 0,
    unresolvedEmergingPatterns: activePatterns.filter((p) => p.status !== "promoted").length,
    aiCalls,
    aiSuccessRatePct,
    aiFallbacks,
    aiAgreementRatePct,
    humanAcceptedAISuggestions: metrics.humanAcceptedAISuggestions ?? 0
  };
}
