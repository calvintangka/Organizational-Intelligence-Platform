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
import { withCanonicalProblemDefaults, dedupeCanonicalProblems } from "@/lib/canonicalProblemEngine";

/**
 * Persistent Organizational Memory (prototype) — backed by localStorage.
 *
 * This makes the platform feel stateful: knowledge, trust scores, reuse counts
 * and organization metrics survive across sessions and demo runs. No backend,
 * no database — purely client-side persistence for the hackathon prototype.
 */

const STORAGE_VERSION = "v2";
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
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / serialization errors in the prototype */
  }
}

/* ---------------------------- Knowledge ---------------------------- */

export function seedOrganizationalKnowledge(): KnowledgeItem[] {
  return dedupeCanonicalProblems(
    seedKnowledge.map((item) => withCanonicalProblemDefaults(withLearningDefaults({ ...item, tags: [...item.tags] })))
  );
}

export function loadKnowledge(): KnowledgeItem[] {
  const stored = read<KnowledgeItem[]>(KNOWLEDGE_KEY);
  if (stored && Array.isArray(stored) && stored.length > 0) {
    const normalized = stored.map((item) => withCanonicalProblemDefaults(withLearningDefaults(item)));
    // Migration: collapse any duplicate canonical problems left over from earlier
    // testing or pre-canonical localStorage, and persist the cleaned memory.
    const deduped = dedupeCanonicalProblems(normalized);
    if (deduped.length !== normalized.length) {
      saveKnowledge(deduped);
    }
    return deduped;
  }
  return seedOrganizationalKnowledge();
}

export function saveKnowledge(items: KnowledgeItem[]): void {
  write(KNOWLEDGE_KEY, items);
}

/* ---------------------- Validation and memory change history ---------------------- */

export function loadKnowledgeCandidates(): KnowledgeCandidate[] {
  const stored = read<KnowledgeCandidate[]>(CANDIDATES_KEY);
  return stored && Array.isArray(stored) ? stored : [];
}

export function saveKnowledgeCandidates(candidates: KnowledgeCandidate[]): void {
  write(CANDIDATES_KEY, candidates);
}

export function loadValidationRecords(): ValidationRecord[] {
  const stored = read<ValidationRecord[]>(VALIDATION_RECORDS_KEY);
  return stored && Array.isArray(stored) ? stored : [];
}

export function saveValidationRecords(records: ValidationRecord[]): void {
  write(VALIDATION_RECORDS_KEY, records);
}

export function loadMemoryChangeRecords(): MemoryChangeRecord[] {
  const stored = read<MemoryChangeRecord[]>(MEMORY_CHANGES_KEY);
  return stored && Array.isArray(stored) ? stored : [];
}

export function saveMemoryChangeRecords(records: MemoryChangeRecord[]): void {
  write(MEMORY_CHANGES_KEY, records);
}

/* ---------------------------- Org metrics ---------------------------- */

export function seedOrgMetrics(): OrgMetrics {
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
    humanAcceptedAISuggestions: 0
  };
}

export function loadOrgMetrics(): OrgMetrics {
  const stored = read<OrgMetrics>(ORG_METRICS_KEY);
  if (!stored) return seedOrgMetrics();

  // Roll over the "today" growth counter if the stored date is stale.
  if (stored.memoryGrowthDate !== todayKey()) {
    return { ...stored, memoryGrowthToday: 0, memoryGrowthDate: todayKey() };
  }
  return stored;
}

export function saveOrgMetrics(metrics: OrgMetrics): void {
  write(ORG_METRICS_KEY, metrics);
}

/* ---------------------------- Intelligence log ---------------------------- */

export function loadOrgLog(): IntelligenceLogEntry[] {
  const stored = read<IntelligenceLogEntry[]>(LOG_KEY);
  return stored && Array.isArray(stored) ? stored : [];
}

export function saveOrgLog(entries: IntelligenceLogEntry[]): void {
  // Keep only the most recent entries to bound storage size.
  const trimmed = entries.slice(-MAX_LOG_ENTRIES);
  write(LOG_KEY, trimmed);
}

/* ---------------------- Emerging Patterns ---------------------- */

export function seedEmergingPatterns(): EmergingPattern[] {
  return [];
}

export function loadEmergingPatterns(): EmergingPattern[] {
  const stored = read<EmergingPattern[]>(PATTERNS_KEY);
  return stored && Array.isArray(stored) && stored.length > 0
    ? stored
    : seedEmergingPatterns();
}

export function saveEmergingPatterns(patterns: EmergingPattern[]): void {
  write(PATTERNS_KEY, patterns);
}

/* ---------------------------- Reset ---------------------------- */

/** Wipe persisted organizational memory and reseed fresh defaults. */
export function clearOrganization(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(KNOWLEDGE_KEY);
    window.localStorage.removeItem(ORG_METRICS_KEY);
    window.localStorage.removeItem(LOG_KEY);
    window.localStorage.removeItem(PATTERNS_KEY);
    window.localStorage.removeItem(CANDIDATES_KEY);
    window.localStorage.removeItem(VALIDATION_RECORDS_KEY);
    window.localStorage.removeItem(MEMORY_CHANGES_KEY);
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
