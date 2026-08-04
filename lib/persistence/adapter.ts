import type {
  EmergingPattern,
  IntelligenceLogEntry,
  KnowledgeCandidate,
  KnowledgeItem,
  KnowledgeHistory,
  MemoryChangeRecord,
  OrgMetrics,
  OrganizationProfile,
  TicketPage,
  TicketPageRequest,
  BulkTicketSeed,
  TicketRecord,
  ValidationRecord
} from "@/types";

export interface PersistencePreparationResult {
  organizationId: string;
  warnings: string[];
}

/**
 * One logical Human Validation / Reflection commit. In server mode the whole
 * payload persists inside a single database transaction; a failure persists
 * nothing. `expectedKnowledgeRevision` carries the optimistic-concurrency
 * revision of the knowledge item before this commit (null asserts creation).
 */
export interface ValidationCommitRequest {
  candidate: KnowledgeCandidate;
  validation: ValidationRecord;
  memoryChange: MemoryChangeRecord;
  knowledgeItem: KnowledgeItem;
  expectedKnowledgeRevision: number | null;
  /** Organization-scoped replay identity. Defaults to validation.id. */
  idempotencyKey?: string;
}

export interface ValidationCommitAuditSummary {
  organizationId: string;
  actorId?: string;
  actor: string;
  sourceTicketIds: string[];
  decision: ValidationRecord["decision"];
  changeType: MemoryChangeRecord["changeType"];
}

export interface ValidationCommitResult {
  replayed: boolean;
  knowledgeRevision: number;
  trustApplied?: boolean;
  candidate: KnowledgeCandidate;
  validation: ValidationRecord;
  memoryChange: MemoryChangeRecord;
  knowledgeItem: KnowledgeItem;
  auditSummary: ValidationCommitAuditSummary;
}

/**
 * Application persistence seam.
 *
 * The profile/list methods represent the prototype's global browser selection
 * state. Every organization-owned resource operation takes an explicit id.
 * `prepareOrganization` is intentionally lifecycle-level rather than a
 * low-level migration API so a future server adapter can make it a no-op.
 */
export interface PersistenceAdapter {
  prepareOrganization(organizationId: string): PersistencePreparationResult | Promise<PersistencePreparationResult>;

  /** Optional id is retained only for legacy shell callers; sessions always pass it. */
  loadOrganizationProfile(organizationId?: string): Promise<OrganizationProfile>;
  /** Optional second argument is retained only for legacy callers; sessions always pass it. */
  saveOrganizationProfile(profile: OrganizationProfile, organizationId?: string): Promise<OrganizationProfile>;
  loadOrganizationList(): Promise<OrganizationProfile[]>;
  saveOrganizationList(list: OrganizationProfile[]): Promise<void>;

  loadKnowledge(organizationId: string): Promise<KnowledgeItem[]>;
  saveKnowledge(organizationId: string, items: KnowledgeItem[]): Promise<void>;
  loadKnowledgeCandidates(organizationId: string): Promise<KnowledgeCandidate[]>;
  saveKnowledgeCandidates(organizationId: string, candidates: KnowledgeCandidate[]): Promise<void>;
  loadValidationRecords(organizationId: string): Promise<ValidationRecord[]>;
  saveValidationRecords(organizationId: string, records: ValidationRecord[]): Promise<void>;
  loadMemoryChangeRecords(organizationId: string): Promise<MemoryChangeRecord[]>;
  loadKnowledgeHistory(organizationId: string, knowledgeId: string): Promise<KnowledgeHistory>;
  saveMemoryChangeRecords(organizationId: string, records: MemoryChangeRecord[]): Promise<void>;
  loadOrgMetrics(organizationId: string): Promise<OrgMetrics | null>;
  saveOrgMetrics(organizationId: string, metrics: OrgMetrics): Promise<void>;
  loadOrgLog(organizationId: string): Promise<IntelligenceLogEntry[]>;
  saveOrgLog(organizationId: string, entries: IntelligenceLogEntry[]): Promise<void>;
  loadEmergingPatterns(organizationId: string): Promise<EmergingPattern[]>;
  saveEmergingPatterns(organizationId: string, patterns: EmergingPattern[]): Promise<void>;
  loadTicketRecords(organizationId: string): Promise<TicketRecord[]>;
  loadTicketPage(organizationId: string, request: TicketPageRequest): Promise<TicketPage>;
  saveTicketRecords(organizationId: string, records: TicketRecord[]): Promise<void>;
  saveTicketRecord(organizationId: string, record: TicketRecord): Promise<void>;
  prepareBulkTicketRecords(
    organizationId: string,
    profile: OrganizationProfile,
    seeds: BulkTicketSeed[]
  ): Promise<TicketRecord[]>;

  generateTicketId(organizationId: string, profile: OrganizationProfile): Promise<string>;
  generateTicketIds(organizationId: string, profile: OrganizationProfile, count: number): Promise<string[]>;

  /**
   * Persist one validated memory change atomically. Both adapters return the
   * committed aggregate; server mode uses one database transaction and local
   * mode uses one organization-scoped commit bundle.
   */
  commitValidatedMemoryChange(organizationId: string, request: ValidationCommitRequest): Promise<ValidationCommitResult>;

  resetOrganization(organizationId: string): Promise<void>;
  deleteOrganization(organizationId: string): Promise<void>;

  seedKnowledge(): KnowledgeItem[];
  seedOrgMetrics(organizationId: string): OrgMetrics;
  seedEmergingPatterns(): EmergingPattern[];
}
