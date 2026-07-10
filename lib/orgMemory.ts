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
const MAX_LOG_ENTRIES = 80;

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

function resolveStorageKey(baseKey: string, organizationId?: string): string {
  if (!organizationId) return baseKey;
  const resource = baseKey.replace(/^oip\./, "").replace(`.${STORAGE_VERSION}`, "");
  return `oip.organization.${encodeURIComponent(organizationId)}.${resource}.${ISOLATED_STORAGE_VERSION}`;
}

function hasKey(key: string): boolean {
  return hasStorage() && window.localStorage.getItem(key) !== null;
}

function copyIfMissing<T>(legacyKey: string, scopedKey: string, transform: (value: T) => T): void {
  if (!hasKey(legacyKey) || hasKey(scopedKey)) return;
  const value = read<T>(legacyKey);
  if (value !== null) write(scopedKey, transform(value));
}

/**
 * Copy the pre-isolation v2 workspace into the active organization exactly once.
 * Legacy keys are deliberately read-only here and remain in localStorage.
 */
export function migrateLegacyOrganizationStorage(organizationId: string): void {
  if (!hasStorage() || !organizationId || hasKey(ORGANIZATION_ISOLATION_MIGRATION_KEY)) return;

  copyIfMissing<KnowledgeItem[]>(KNOWLEDGE_KEY, resolveStorageKey(KNOWLEDGE_KEY, organizationId), (items) =>
    items.map((item) => ({ ...item, organizationId }))
  );
  copyIfMissing<KnowledgeCandidate[]>(CANDIDATES_KEY, resolveStorageKey(CANDIDATES_KEY, organizationId), (items) =>
    items.map((item) => ({ ...item, organizationId }))
  );
  copyIfMissing<ValidationRecord[]>(VALIDATION_RECORDS_KEY, resolveStorageKey(VALIDATION_RECORDS_KEY, organizationId), (items) =>
    items.map((item) => ({ ...item, organizationId }))
  );
  copyIfMissing<MemoryChangeRecord[]>(MEMORY_CHANGES_KEY, resolveStorageKey(MEMORY_CHANGES_KEY, organizationId), (items) =>
    items.map((item) => ({ ...item, organizationId }))
  );
  copyIfMissing<OrgMetrics>(ORG_METRICS_KEY, resolveStorageKey(ORG_METRICS_KEY, organizationId), (metrics) => ({
    ...metrics,
    organizationId
  }));
  copyIfMissing<IntelligenceLogEntry[]>(LOG_KEY, resolveStorageKey(LOG_KEY, organizationId), (entries) => entries);
  copyIfMissing<EmergingPattern[]>(PATTERNS_KEY, resolveStorageKey(PATTERNS_KEY, organizationId), (patterns) =>
    patterns.map((pattern) => ({ ...pattern, organizationId }))
  );

  const legacyTickets = read<Array<{ orgId?: string }>>("oip.ticketRecords.v2");
  const scopedTicketsKey = `oip.organization.${encodeURIComponent(organizationId)}.ticketRecords.${ISOLATED_STORAGE_VERSION}`;
  if (legacyTickets !== null && !hasKey(scopedTicketsKey)) {
    write(scopedTicketsKey, legacyTickets.map((record) => ({ ...record, orgId: organizationId })));
  }
  const legacyCounters = read<Record<string, number>>("oip.ticketCounter.v2");
  const scopedCounterKey = `oip.organization.${encodeURIComponent(organizationId)}.ticketCounter.${ISOLATED_STORAGE_VERSION}`;
  if (legacyCounters !== null && !hasKey(scopedCounterKey)) {
    write(scopedCounterKey, legacyCounters[organizationId] ?? 0);
  }

  write(ORGANIZATION_ISOLATION_MIGRATION_KEY, {
    version: ISOLATED_STORAGE_VERSION,
    sourceVersion: STORAGE_VERSION,
    organizationId,
    completedAt: new Date().toISOString()
  });
}

/* ---------------------------- Knowledge ---------------------------- */

export function seedOrganizationalKnowledge(): KnowledgeItem[] {
  return dedupeCanonicalProblems(
    seedKnowledge.map((item) => withCanonicalProblemDefaults(withLearningDefaults({ ...item, tags: [...item.tags] })))
  );
}

export async function loadKnowledge(organizationId?: string): Promise<KnowledgeItem[]> {
  const stored = read<KnowledgeItem[]>(resolveStorageKey(KNOWLEDGE_KEY, organizationId));
  if (stored && Array.isArray(stored) && stored.length > 0) {
    const normalized = stored.map((item) => withCanonicalProblemDefaults(withLearningDefaults(item)));
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
  const stored = read<KnowledgeCandidate[]>(resolveStorageKey(CANDIDATES_KEY, organizationId));
  return stored && Array.isArray(stored) ? stored : [];
}

export async function saveKnowledgeCandidates(
  organizationId: string | undefined,
  candidates: KnowledgeCandidate[]
): Promise<void> {
  write(resolveStorageKey(CANDIDATES_KEY, organizationId), candidates);
}

export async function loadValidationRecords(organizationId?: string): Promise<ValidationRecord[]> {
  const stored = read<ValidationRecord[]>(resolveStorageKey(VALIDATION_RECORDS_KEY, organizationId));
  return stored && Array.isArray(stored) ? stored : [];
}

export async function saveValidationRecords(
  organizationId: string | undefined,
  records: ValidationRecord[]
): Promise<void> {
  write(resolveStorageKey(VALIDATION_RECORDS_KEY, organizationId), records);
}

export async function loadMemoryChangeRecords(organizationId?: string): Promise<MemoryChangeRecord[]> {
  const stored = read<MemoryChangeRecord[]>(resolveStorageKey(MEMORY_CHANGES_KEY, organizationId));
  return stored && Array.isArray(stored) ? stored : [];
}

export async function saveMemoryChangeRecords(
  organizationId: string | undefined,
  records: MemoryChangeRecord[]
): Promise<void> {
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
  const stored = read<OrgMetrics>(resolveStorageKey(ORG_METRICS_KEY, organizationId));
  if (!stored) return seedOrgMetrics(organizationId);

  // Roll over the "today" growth counter if the stored date is stale.
  if (stored.memoryGrowthDate !== todayKey()) {
    return { ...stored, memoryGrowthToday: 0, memoryGrowthDate: todayKey() };
  }
  return stored;
}

export async function saveOrgMetrics(organizationId: string | undefined, metrics: OrgMetrics): Promise<void> {
  write(resolveStorageKey(ORG_METRICS_KEY, organizationId), metrics);
}

/* ---------------------------- Intelligence log ---------------------------- */

export async function loadOrgLog(organizationId?: string): Promise<IntelligenceLogEntry[]> {
  const stored = read<IntelligenceLogEntry[]>(resolveStorageKey(LOG_KEY, organizationId));
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
  const stored = read<EmergingPattern[]>(resolveStorageKey(PATTERNS_KEY, organizationId));
  return stored && Array.isArray(stored) && stored.length > 0
    ? stored
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
