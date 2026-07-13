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

type MigrationResourceStatus = "copied" | "fallback" | "absent";

interface MigrationResourceState {
  status: MigrationResourceStatus;
  reason?: string;
  updatedAt: string;
}

interface OrganizationMigrationState {
  version: string;
  sourceVersion: string;
  organizations: Record<string, {
    resources: Partial<Record<OrganizationMigrationResource, MigrationResourceState>>;
    completedAt?: string;
  }>;
  legacyOwnerOrganizationId?: string;
  legacyOwnershipStatus?: "owned" | "ambiguous";
  legacyOwnershipReason?: string;
  legacyOwnershipUpdatedAt?: string;
}

export interface OrganizationMigrationResult {
  organizationId: string;
  resources: Partial<Record<OrganizationMigrationResource, MigrationResourceStatus>>;
  warnings: string[];
}

const runtimeLegacyFallbacks = new Map<string, Set<OrganizationMigrationResource>>();
let runtimeLegacyOwnerOrganizationId: string | undefined;
let runtimeLegacyOwnershipAmbiguous = false;

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

function resolveStorageKey(baseKey: string, organizationId?: string): string {
  if (!organizationId) return baseKey;
  const resource = baseKey.replace(/^oip\./, "").replace(`.${STORAGE_VERSION}`, "");
  return `oip.organization.${encodeURIComponent(organizationId)}.${resource}.${ISOLATED_STORAGE_VERSION}`;
}

function hasKey(key: string): boolean {
  return hasStorage() && window.localStorage.getItem(key) !== null;
}

function readMigrationState(): OrganizationMigrationState {
  const stored = read<Partial<OrganizationMigrationState> & { organizationId?: string }>(ORGANIZATION_ISOLATION_MIGRATION_KEY);
  if (stored?.organizations) return stored as OrganizationMigrationState;

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

  return { version: ISOLATED_STORAGE_VERSION, sourceVersion: STORAGE_VERSION, organizations: {} };
}

function rememberRuntimeFallback(organizationId: string, resource: OrganizationMigrationResource): void {
  const resources = runtimeLegacyFallbacks.get(organizationId) ?? new Set<OrganizationMigrationResource>();
  resources.add(resource);
  runtimeLegacyFallbacks.set(organizationId, resources);
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

function hasLegacyFallback(organizationId: string, resource: OrganizationMigrationResource): boolean {
  const state = readMigrationState();
  if (state.legacyOwnershipStatus === "ambiguous" || runtimeLegacyOwnershipAmbiguous) return false;
  if (stateLegacyOwner(state) !== organizationId) return false;
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
  if (hasKey(scopedKey)) return markResource(organizationId, resource, "copied");
  if (!hasKey(legacyKey)) return markResource(organizationId, resource, "absent");

  try {
    const value = read<T>(legacyKey);
    if (value === null) return markResource(organizationId, resource, "absent");
    if (tryWrite(scopedKey, transform(value))) return markResource(organizationId, resource, "copied");
  } catch (error) {
    if (!isQuotaExceededError(error)) throw error;
  }

  const label = resource === "memoryChanges" ? "memory change history" : resource;
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
  organizationId: string | undefined,
  resource: OrganizationMigrationResource,
  legacyKey: string,
  scopedKey: string
): T | null {
  const scoped = read<T>(scopedKey);
  if (scoped !== null) return scoped;
  if (organizationId && hasLegacyFallback(organizationId, resource)) return read<T>(legacyKey);
  return null;
}

/**
 * Migrate the pre-isolation v2 workspace into the active organization by
 * resource. Legacy keys are deliberately read-only here and remain in
 * localStorage when a scoped copy does not fit.
 */
export function migrateLegacyOrganizationStorage(organizationId: string): OrganizationMigrationResult {
  const result: OrganizationMigrationResult = { organizationId, resources: {}, warnings: [] };
  if (!hasStorage() || !organizationId) return result;

  let state: OrganizationMigrationState = { version: ISOLATED_STORAGE_VERSION, sourceVersion: STORAGE_VERSION, organizations: {} };
  let organizationState: OrganizationMigrationState["organizations"][string] = { resources: {} };

  const migrate = <T, U = T>(
    resource: OrganizationMigrationResource,
    legacyKey: string,
    transform: (value: T) => U
  ) => {
    const existing = resourceStatus(organizationId, resource, state);
    const scopedKey = resolveStorageKey(legacyKey, organizationId);
    const next = existing ?? copyIfMissing(organizationId, resource, legacyKey, scopedKey, transform, result.warnings);
    if (existing?.status === "fallback") {
      result.warnings.push(`Using preserved legacy ${resource} because the organization-scoped copy did not fit in browser storage.`);
    }
    organizationState.resources[resource] = next;
    result.resources[resource] = next.status;
  };

  try {
    state = readMigrationState();
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
    }

    organizationState = state.organizations[organizationId] ?? { resources: {} };
    state.organizations[organizationId] = organizationState;

    // Small, critical state is copied first. Each resource gets its own durable
    // result so a later reload never retries a known failing copy.
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

    const allResources = Object.values(organizationState.resources);
    if (allResources.length === 9 && allResources.every((resource) => resource.status === "copied" || resource.status === "absent")) {
      organizationState.completedAt ??= new Date().toISOString();
    } else {
      delete organizationState.completedAt;
    }
    if (!saveMigrationState(state)) {
      result.warnings.push("Migration progress could not be saved because browser storage is full. Existing legacy data was left untouched, and failed large-resource copies will not be retried as full copies.");
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

export async function loadKnowledge(organizationId?: string): Promise<KnowledgeItem[]> {
  const stored = readOrganizationResource<KnowledgeItem[]>(organizationId, "knowledge", KNOWLEDGE_KEY, resolveStorageKey(KNOWLEDGE_KEY, organizationId));
  if (stored && Array.isArray(stored) && stored.length > 0) {
    const normalized = stored.map((item) => withCanonicalProblemDefaults(withLearningDefaults({ ...item, organizationId: item.organizationId ?? organizationId })));
    // Migration: collapse any duplicate canonical problems left over from earlier
    // testing or pre-canonical localStorage, and persist the cleaned memory.
    const deduped = dedupeCanonicalProblems(normalized);
    // Self-heal: restore any generic customerResponseTemplate that a fixed bug had
    // overwritten with a lesson's specific response (see repairCorruptedCustomerTemplates).
    const { items: repairedTemplates, repairedCount: repairedTemplateCount } = repairCorruptedCustomerTemplates(deduped);
    // Self-heal legacy lesson customerResponse values that stored a specific
    // customer greeting or hard-coded ticket reference instead of reusable placeholders.
    const { items: repaired, repairedCount: repairedLessonCount } = repairLegacyLessonResponseTemplates(repairedTemplates);
    if (deduped.length !== normalized.length || repairedTemplateCount > 0 || repairedLessonCount > 0) {
      try {
        await saveKnowledge(organizationId, repaired);
      } catch {
        /* keep load behavior intact even if a self-heal writeback fails */
      }
    }
    return repaired;
  }
  return seedOrganizationalKnowledge().map((item) => ({ ...item, organizationId }));
}

export async function saveKnowledge(organizationId: string | undefined, items: KnowledgeItem[]): Promise<void> {
  write(resolveStorageKey(KNOWLEDGE_KEY, organizationId), items);
}

/* ---------------------- Validation and memory change history ---------------------- */

export async function loadKnowledgeCandidates(organizationId?: string): Promise<KnowledgeCandidate[]> {
  const stored = readOrganizationResource<KnowledgeCandidate[]>(organizationId, "candidates", CANDIDATES_KEY, resolveStorageKey(CANDIDATES_KEY, organizationId));
  return stored && Array.isArray(stored) ? stored.map((candidate) => ({ ...candidate, organizationId: candidate.organizationId ?? organizationId })) : [];
}

export async function saveKnowledgeCandidates(
  organizationId: string | undefined,
  candidates: KnowledgeCandidate[]
): Promise<void> {
  write(resolveStorageKey(CANDIDATES_KEY, organizationId), candidates);
}

export async function loadValidationRecords(organizationId?: string): Promise<ValidationRecord[]> {
  const stored = readOrganizationResource<ValidationRecord[]>(organizationId, "validationRecords", VALIDATION_RECORDS_KEY, resolveStorageKey(VALIDATION_RECORDS_KEY, organizationId));
  return stored && Array.isArray(stored) ? stored.map((record) => ({ ...record, organizationId: record.organizationId ?? organizationId })) : [];
}

export async function saveValidationRecords(
  organizationId: string | undefined,
  records: ValidationRecord[]
): Promise<void> {
  write(resolveStorageKey(VALIDATION_RECORDS_KEY, organizationId), records);
}

export async function loadMemoryChangeRecords(organizationId?: string): Promise<MemoryChangeRecord[]> {
  const scoped = read<MemoryChangeRecord[]>(resolveStorageKey(MEMORY_CHANGES_KEY, organizationId));
  const legacy = organizationId && hasLegacyFallback(organizationId, "memoryChanges")
    ? read<MemoryChangeRecord[]>(MEMORY_CHANGES_KEY)
    : null;
  const merged = [...(legacy ?? []), ...(scoped ?? [])];
  const byId = new Map(merged.map((record) => [record.id, record]));
  return Array.from(byId.values()).map((record) => ({ ...record, organizationId: record.organizationId ?? organizationId }));
}

export async function saveMemoryChangeRecords(
  organizationId: string | undefined,
  records: MemoryChangeRecord[]
): Promise<void> {
  if (organizationId && hasLegacyFallback(organizationId, "memoryChanges")) {
    // Preserve the complete legacy history and only keep a small scoped tail
    // for new writes. This avoids repeatedly attempting the known-too-large
    // full snapshot while keeping recent changes durable when space permits.
    const bounded = records.slice(-MAX_SCOPED_MEMORY_CHANGE_RECORDS);
    tryWrite(resolveStorageKey(MEMORY_CHANGES_KEY, organizationId), bounded);
    return;
  }
  write(resolveStorageKey(MEMORY_CHANGES_KEY, organizationId), records);
}

/* ---------------------------- Org metrics ---------------------------- */

export function seedOrgMetrics(organizationId?: string): OrgMetrics {
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

export async function loadOrgMetrics(organizationId?: string): Promise<OrgMetrics> {
  const stored = readOrganizationResource<OrgMetrics>(organizationId, "metrics", ORG_METRICS_KEY, resolveStorageKey(ORG_METRICS_KEY, organizationId));
  if (!stored) return seedOrgMetrics(organizationId);
  const owned = { ...stored, organizationId: stored.organizationId ?? organizationId };

  // Roll over the "today" growth counter if the stored date is stale.
  if (owned.memoryGrowthDate !== todayKey()) {
    return { ...owned, memoryGrowthToday: 0, memoryGrowthDate: todayKey() };
  }
  return owned;
}

export async function saveOrgMetrics(organizationId: string | undefined, metrics: OrgMetrics): Promise<void> {
  write(resolveStorageKey(ORG_METRICS_KEY, organizationId), metrics);
}

/* ---------------------------- Intelligence log ---------------------------- */

export async function loadOrgLog(organizationId?: string): Promise<IntelligenceLogEntry[]> {
  const stored = readOrganizationResource<IntelligenceLogEntry[]>(organizationId, "intelligenceLog", LOG_KEY, resolveStorageKey(LOG_KEY, organizationId));
  return stored && Array.isArray(stored) ? stored : [];
}

export async function saveOrgLog(
  organizationId: string | undefined,
  entries: IntelligenceLogEntry[]
): Promise<void> {
  // Keep only the most recent entries to bound storage size.
  const trimmed = entries.slice(-MAX_LOG_ENTRIES);
  write(resolveStorageKey(LOG_KEY, organizationId), trimmed);
}

/* ---------------------- Emerging Patterns ---------------------- */

export function seedEmergingPatterns(): EmergingPattern[] {
  return [];
}

export async function loadEmergingPatterns(organizationId?: string): Promise<EmergingPattern[]> {
  const stored = readOrganizationResource<EmergingPattern[]>(organizationId, "patterns", PATTERNS_KEY, resolveStorageKey(PATTERNS_KEY, organizationId));
  return stored && Array.isArray(stored) && stored.length > 0
    ? stored.map((pattern) => ({ ...pattern, organizationId: pattern.organizationId ?? organizationId }))
    : seedEmergingPatterns();
}

export async function saveEmergingPatterns(
  organizationId: string | undefined,
  patterns: EmergingPattern[]
): Promise<void> {
  write(resolveStorageKey(PATTERNS_KEY, organizationId), patterns);
}

/* ---------------------------- Reset ---------------------------- */

/** Wipe persisted organizational memory and reseed fresh defaults. */
export function clearOrganization(organizationId?: string): void {
  if (!hasStorage()) return;
  try {
    const keys = [KNOWLEDGE_KEY, ORG_METRICS_KEY, LOG_KEY, PATTERNS_KEY, CANDIDATES_KEY, VALIDATION_RECORDS_KEY, MEMORY_CHANGES_KEY];
    keys.forEach((key) => window.localStorage.removeItem(resolveStorageKey(key, organizationId)));
    clearTicketRecords(organizationId);
  } catch {
    /* ignore */
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
