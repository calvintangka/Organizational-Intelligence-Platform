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

export interface PersistencePreparationResult {
  organizationId: string;
  warnings: string[];
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
  prepareOrganization(organizationId: string): PersistencePreparationResult;

  loadOrganizationProfile(): Promise<OrganizationProfile>;
  saveOrganizationProfile(profile: OrganizationProfile): Promise<void>;
  loadOrganizationList(): Promise<OrganizationProfile[]>;
  saveOrganizationList(list: OrganizationProfile[]): Promise<void>;

  loadKnowledge(organizationId: string): Promise<KnowledgeItem[]>;
  saveKnowledge(organizationId: string, items: KnowledgeItem[]): Promise<void>;
  loadKnowledgeCandidates(organizationId: string): Promise<KnowledgeCandidate[]>;
  saveKnowledgeCandidates(organizationId: string, candidates: KnowledgeCandidate[]): Promise<void>;
  loadValidationRecords(organizationId: string): Promise<ValidationRecord[]>;
  saveValidationRecords(organizationId: string, records: ValidationRecord[]): Promise<void>;
  loadMemoryChangeRecords(organizationId: string): Promise<MemoryChangeRecord[]>;
  saveMemoryChangeRecords(organizationId: string, records: MemoryChangeRecord[]): Promise<void>;
  loadOrgMetrics(organizationId: string): Promise<OrgMetrics>;
  saveOrgMetrics(organizationId: string, metrics: OrgMetrics): Promise<void>;
  loadOrgLog(organizationId: string): Promise<IntelligenceLogEntry[]>;
  saveOrgLog(organizationId: string, entries: IntelligenceLogEntry[]): Promise<void>;
  loadEmergingPatterns(organizationId: string): Promise<EmergingPattern[]>;
  saveEmergingPatterns(organizationId: string, patterns: EmergingPattern[]): Promise<void>;
  loadTicketRecords(organizationId: string): Promise<TicketRecord[]>;
  saveTicketRecords(organizationId: string, records: TicketRecord[]): Promise<void>;

  generateTicketId(organizationId: string, profile: OrganizationProfile): string;
  generateTicketIds(organizationId: string, profile: OrganizationProfile, count: number): string[];

  resetOrganization(organizationId: string): void;
  deleteOrganization(organizationId: string): void;

  seedKnowledge(): KnowledgeItem[];
  seedOrgMetrics(organizationId: string): OrgMetrics;
  seedEmergingPatterns(): EmergingPattern[];
}
