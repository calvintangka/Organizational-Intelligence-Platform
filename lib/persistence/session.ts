import type {
  BulkTicketSeed,
  EmergingPattern,
  IntelligenceLogEntry,
  KnowledgeCandidate,
  KnowledgeHistory,
  KnowledgeItem,
  MemoryChangeRecord,
  OrgMetrics,
  OrganizationProfile,
  TicketPage,
  TicketPageRequest,
  TicketRecord,
  ValidationRecord
} from "@/types";
import type { PersistenceAdapter, PersistencePreparationResult, ValidationCommitRequest, ValidationCommitResult } from "@/lib/persistence/adapter";
import { assertPersistenceContextOrganization, type PersistenceContext } from "@/lib/persistence/context";
import { startTelemetrySpan } from "@/lib/telemetry";

export interface OrganizationPersistenceSession {
  readonly context: PersistenceContext;
  prepareOrganization(): Promise<PersistencePreparationResult>;
  loadOrganizationProfile(): Promise<OrganizationProfile>;
  saveOrganizationProfile(profile: OrganizationProfile): Promise<OrganizationProfile>;
  loadKnowledge(): Promise<KnowledgeItem[]>;
  saveKnowledge(items: KnowledgeItem[]): Promise<void>;
  loadKnowledgeCandidates(): Promise<KnowledgeCandidate[]>;
  saveKnowledgeCandidates(candidates: KnowledgeCandidate[]): Promise<void>;
  loadValidationRecords(): Promise<ValidationRecord[]>;
  saveValidationRecords(records: ValidationRecord[]): Promise<void>;
  loadMemoryChangeRecords(): Promise<MemoryChangeRecord[]>;
  loadKnowledgeHistory(knowledgeId: string): Promise<KnowledgeHistory>;
  saveMemoryChangeRecords(records: MemoryChangeRecord[]): Promise<void>;
  loadOrgMetrics(): Promise<OrgMetrics | null>;
  saveOrgMetrics(metrics: OrgMetrics): Promise<void>;
  loadOrgLog(): Promise<IntelligenceLogEntry[]>;
  saveOrgLog(entries: IntelligenceLogEntry[]): Promise<void>;
  loadEmergingPatterns(): Promise<EmergingPattern[]>;
  saveEmergingPatterns(patterns: EmergingPattern[]): Promise<void>;
  loadTicketRecords(): Promise<TicketRecord[]>;
  loadTicketPage(request: TicketPageRequest): Promise<TicketPage>;
  saveTicketRecords(records: TicketRecord[]): Promise<void>;
  saveTicketRecord(record: TicketRecord): Promise<void>;
  prepareBulkTicketRecords(profile: OrganizationProfile, seeds: BulkTicketSeed[]): Promise<TicketRecord[]>;
  generateTicketId(profile: OrganizationProfile): Promise<string>;
  generateTicketIds(profile: OrganizationProfile, count: number): Promise<string[]>;
  commitValidatedMemoryChange(request: ValidationCommitRequest): Promise<ValidationCommitResult>;
  resetOrganization(): Promise<void>;
  deleteOrganization(): Promise<void>;
  seedKnowledge(): KnowledgeItem[];
  seedOrgMetrics(): OrgMetrics;
  seedEmergingPatterns(): EmergingPattern[];
}

function assertProfile(context: PersistenceContext, profile: OrganizationProfile, operation: string): void {
  assertPersistenceContextOrganization(context, profile.id, operation);
}

function assertCollectionScope(context: PersistenceContext, values: unknown[], operation: string): void {
  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const candidate = value as { organizationId?: unknown; orgId?: unknown };
    const claimed = candidate.organizationId ?? candidate.orgId;
    if (claimed !== undefined) assertPersistenceContextOrganization(context, String(claimed), operation);
  }
}

function assertCommitScope(context: PersistenceContext, request: ValidationCommitRequest): void {
  assertCollectionScope(context, [request.candidate, request.validation, request.memoryChange, request.knowledgeItem], "Validation commit");
}

function safeTenantHash(organizationId: string): string {
  let hash = 2166136261;
  for (let index = 0; index < organizationId.length; index += 1) {
    hash ^= organizationId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function annotatePersistenceError(error: unknown, context: PersistenceContext): void {
  if (!error || typeof error !== "object") return;
  try {
    Object.assign(error, {
      organizationId: context.organizationId,
      requestId: context.requestId,
      correlationId: context.correlationId,
      authority: context.authority,
      retryable: (error as { retryable?: unknown }).retryable === true
        || ((error as { status?: unknown }).status as number | undefined ?? 0) >= 500
    });
  } catch {
    // Error enrichment is observability-only and must never mask the original
    // persistence failure.
  }
}

export function bindPersistenceSession(context: PersistenceContext, adapter: PersistenceAdapter): OrganizationPersistenceSession {
  const session: OrganizationPersistenceSession = {
    context,
    prepareOrganization: async () => await adapter.prepareOrganization(context.organizationId),
    loadOrganizationProfile: () => adapter.loadOrganizationProfile(context.organizationId),
    saveOrganizationProfile: (profile) => {
      assertProfile(context, profile, "Organization profile save");
      return adapter.saveOrganizationProfile(profile, context.organizationId);
    },
    loadKnowledge: () => adapter.loadKnowledge(context.organizationId),
    saveKnowledge: (items) => { assertCollectionScope(context, items, "Knowledge save"); return adapter.saveKnowledge(context.organizationId, items); },
    loadKnowledgeCandidates: () => adapter.loadKnowledgeCandidates(context.organizationId),
    saveKnowledgeCandidates: (items) => { assertCollectionScope(context, items, "Knowledge candidate save"); return adapter.saveKnowledgeCandidates(context.organizationId, items); },
    loadValidationRecords: () => adapter.loadValidationRecords(context.organizationId),
    saveValidationRecords: (records) => { assertCollectionScope(context, records, "Validation record save"); return adapter.saveValidationRecords(context.organizationId, records); },
    loadMemoryChangeRecords: () => adapter.loadMemoryChangeRecords(context.organizationId),
    loadKnowledgeHistory: (knowledgeId) => adapter.loadKnowledgeHistory(context.organizationId, knowledgeId),
    saveMemoryChangeRecords: (records) => { assertCollectionScope(context, records, "Memory change save"); return adapter.saveMemoryChangeRecords(context.organizationId, records); },
    loadOrgMetrics: () => adapter.loadOrgMetrics(context.organizationId),
    saveOrgMetrics: (metrics) => { assertPersistenceContextOrganization(context, metrics.organizationId ?? "", "Metrics save"); return adapter.saveOrgMetrics(context.organizationId, metrics); },
    loadOrgLog: () => adapter.loadOrgLog(context.organizationId),
    saveOrgLog: (entries) => { assertCollectionScope(context, entries, "Intelligence log save"); return adapter.saveOrgLog(context.organizationId, entries); },
    loadEmergingPatterns: () => adapter.loadEmergingPatterns(context.organizationId),
    saveEmergingPatterns: (patterns) => { assertCollectionScope(context, patterns, "Emerging pattern save"); return adapter.saveEmergingPatterns(context.organizationId, patterns); },
    loadTicketRecords: () => adapter.loadTicketRecords(context.organizationId),
    loadTicketPage: (request) => adapter.loadTicketPage(context.organizationId, request),
    saveTicketRecords: (records) => { assertCollectionScope(context, records, "Ticket save"); return adapter.saveTicketRecords(context.organizationId, records); },
    saveTicketRecord: (record) => { assertCollectionScope(context, [record], "Ticket save"); return adapter.saveTicketRecord(context.organizationId, record); },
    prepareBulkTicketRecords: (profile, seeds) => { assertProfile(context, profile, "Bulk ticket preparation"); return adapter.prepareBulkTicketRecords(context.organizationId, profile, seeds); },
    generateTicketId: (profile) => { assertProfile(context, profile, "Ticket id generation"); return adapter.generateTicketId(context.organizationId, profile); },
    generateTicketIds: (profile, count) => { assertProfile(context, profile, "Ticket id generation"); return adapter.generateTicketIds(context.organizationId, profile, count); },
    commitValidatedMemoryChange: (request) => { assertCommitScope(context, request); return adapter.commitValidatedMemoryChange(context.organizationId, request); },
    resetOrganization: () => adapter.resetOrganization(context.organizationId),
    deleteOrganization: () => adapter.deleteOrganization(context.organizationId),
    seedKnowledge: () => adapter.seedKnowledge(),
    seedOrgMetrics: () => adapter.seedOrgMetrics(context.organizationId),
    seedEmergingPatterns: () => adapter.seedEmergingPatterns()
  };
  return new Proxy(session, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const operation = String(property);
        const span = startTelemetrySpan(operation, "database", {
          unit: "operations",
          tags: {
            operation,
            authority: context.authority,
            organizationHash: safeTenantHash(context.organizationId),
            requestId: context.requestId,
            correlationId: context.correlationId
          }
        });
        try {
          const result = value.apply(target, args);
          if (result && typeof (result as { then?: unknown }).then === "function") {
            return Promise.resolve(result).then(
              (resolved) => { span.end(true); return resolved; },
              (error) => { annotatePersistenceError(error, context); span.end(false, { error: error instanceof Error ? error.name : "unknown" }); throw error; }
            );
          }
          span.end(true);
          return result;
        } catch (error) {
          annotatePersistenceError(error, context);
          span.end(false, { error: error instanceof Error ? error.name : "unknown" });
          throw error;
        }
      };
    },
    set() { return false; },
    defineProperty() { return false; },
    deleteProperty() { return false; }
  });
}
