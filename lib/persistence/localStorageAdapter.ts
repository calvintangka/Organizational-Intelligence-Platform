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
import {
  clearOrganization,
  deleteOrganizationData,
  loadEmergingPatterns,
  loadKnowledge,
  loadKnowledgeCandidates,
  loadMemoryChangeRecords,
  loadOrgLog,
  loadOrgMetrics,
  loadValidationRecords,
  migrateLegacyOrganizationStorage,
  saveEmergingPatterns,
  saveKnowledge,
  saveKnowledgeCandidates,
  saveMemoryChangeRecords,
  commitValidatedMemoryChangeLocalStorage,
  saveOrgLog,
  saveOrgMetrics,
  saveValidationRecords,
  seedEmergingPatterns,
  seedOrgMetrics,
  seedOrganizationalKnowledge
} from "@/lib/orgMemory";
import {
  loadOrganizationList,
  loadOrganizationProfile,
  saveOrganizationList,
  saveOrganizationProfile
} from "@/lib/organizationProfile";
import {
  createTicketRecord,
  generateTicketId,
  generateTicketIds,
  loadTicketPage as loadLocalStorageTicketPage,
  loadTicketRecords as loadLocalStorageTicketRecords,
  saveTicketRecords as saveLocalStorageTicketRecords
} from "@/lib/ticketRecords";
import { requireOrganizationId } from "@/lib/organizationId";
import type { PersistenceAdapter, ValidationCommitRequest, ValidationCommitResult } from "@/lib/persistence/adapter";

/**
 * Thin localStorage implementation. All migration, fallback, quota, reset,
 * deletion, self-heal, and ticket-counter behavior remains in the existing
 * hardened modules; this class only delegates to them.
 */
export class LocalStorageAdapter implements PersistenceAdapter {
  prepareOrganization(organizationId: string) {
    return migrateLegacyOrganizationStorage(organizationId);
  }

  loadOrganizationProfile(): Promise<OrganizationProfile> {
    return loadOrganizationProfile();
  }

  saveOrganizationProfile(profile: OrganizationProfile): Promise<OrganizationProfile> {
    return saveOrganizationProfile(profile);
  }

  loadOrganizationList(): Promise<OrganizationProfile[]> {
    return loadOrganizationList();
  }

  saveOrganizationList(list: OrganizationProfile[]): Promise<void> {
    return saveOrganizationList(list);
  }

  loadKnowledge(organizationId: string): Promise<KnowledgeItem[]> {
    return loadKnowledge(organizationId);
  }

  saveKnowledge(organizationId: string, items: KnowledgeItem[]): Promise<void> {
    return saveKnowledge(organizationId, items);
  }

  loadKnowledgeCandidates(organizationId: string): Promise<KnowledgeCandidate[]> {
    return loadKnowledgeCandidates(organizationId);
  }

  saveKnowledgeCandidates(organizationId: string, candidates: KnowledgeCandidate[]): Promise<void> {
    return saveKnowledgeCandidates(organizationId, candidates);
  }

  loadValidationRecords(organizationId: string): Promise<ValidationRecord[]> {
    return loadValidationRecords(organizationId);
  }

  saveValidationRecords(organizationId: string, records: ValidationRecord[]): Promise<void> {
    return saveValidationRecords(organizationId, records);
  }

  loadMemoryChangeRecords(organizationId: string): Promise<MemoryChangeRecord[]> {
    return loadMemoryChangeRecords(organizationId);
  }

  async loadKnowledgeHistory(organizationId: string, knowledgeId: string): Promise<KnowledgeHistory> {
    const [validationRecords, memoryChangeRecords] = await Promise.all([
      loadValidationRecords(organizationId),
      loadMemoryChangeRecords(organizationId)
    ]);
    return {
      validationRecords: validationRecords.filter((record) => record.knowledgeId === knowledgeId),
      memoryChangeRecords: memoryChangeRecords.filter((record) => record.knowledgeId === knowledgeId)
    };
  }

  saveMemoryChangeRecords(organizationId: string, records: MemoryChangeRecord[]): Promise<void> {
    return saveMemoryChangeRecords(organizationId, records);
  }

  loadOrgMetrics(organizationId: string): Promise<OrgMetrics> {
    return loadOrgMetrics(organizationId);
  }

  saveOrgMetrics(organizationId: string, metrics: OrgMetrics): Promise<void> {
    return saveOrgMetrics(organizationId, metrics);
  }

  loadOrgLog(organizationId: string): Promise<IntelligenceLogEntry[]> {
    return loadOrgLog(organizationId);
  }

  saveOrgLog(organizationId: string, entries: IntelligenceLogEntry[]): Promise<void> {
    return saveOrgLog(organizationId, entries);
  }

  loadEmergingPatterns(organizationId: string): Promise<EmergingPattern[]> {
    return loadEmergingPatterns(organizationId);
  }

  saveEmergingPatterns(organizationId: string, patterns: EmergingPattern[]): Promise<void> {
    return saveEmergingPatterns(organizationId, patterns);
  }

  loadTicketRecords(organizationId: string): Promise<TicketRecord[]> {
    return loadLocalStorageTicketRecords(organizationId);
  }

  loadTicketPage(organizationId: string, request: TicketPageRequest): Promise<TicketPage> {
    return loadLocalStorageTicketPage(organizationId, request);
  }

  saveTicketRecords(organizationId: string, records: TicketRecord[]): Promise<void> {
    return saveLocalStorageTicketRecords(organizationId, records);
  }

  async saveTicketRecord(organizationId: string, record: TicketRecord): Promise<void> {
    const records = await loadLocalStorageTicketRecords(organizationId);
    const index = records.findIndex((item) => item.ticketId === record.ticketId);
    const next = [...records];
    if (index >= 0) next[index] = record;
    else next.push(record);
    await saveLocalStorageTicketRecords(organizationId, next);
  }

  async prepareBulkTicketRecords(
    organizationId: string,
    profile: OrganizationProfile,
    seeds: BulkTicketSeed[]
  ): Promise<TicketRecord[]> {
    this.assertProfileOrganization(organizationId, profile);
    const existing = await loadLocalStorageTicketRecords(organizationId);
    const byKey = new Map(
      existing
        .filter((record) => record.bulkUploadKey && record.bulkEntryId)
        .map((record) => [`${record.bulkUploadKey}:${record.bulkEntryId}`, record])
    );
    const missing = seeds.filter((seed) => !byKey.has(`${seed.uploadKey}:${seed.entryId}`));
    const ids = generateTicketIds(profile, missing.length);
    const created = missing.map((seed, index) => {
      const record = createTicketRecord(ids[index], organizationId, seed.rawMessage, seed.subject);
      return {
        ...record,
        bulkUploadKey: seed.uploadKey,
        bulkEntryId: seed.entryId,
        intakeMode: "bulk" as const,
        status: "in_review" as const
      };
    });
    const next = [...existing, ...created];
    if (created.length > 0) await saveLocalStorageTicketRecords(organizationId, next);
    const merged = new Map(
      [...existing, ...created].map((record) => [`${record.bulkUploadKey}:${record.bulkEntryId}`, record])
    );
    return seeds.map((seed) => merged.get(`${seed.uploadKey}:${seed.entryId}`)!).filter(Boolean);
  }

  async generateTicketId(organizationId: string, profile: OrganizationProfile): Promise<string> {
    this.assertProfileOrganization(organizationId, profile);
    return generateTicketId(profile);
  }

  async generateTicketIds(organizationId: string, profile: OrganizationProfile, count: number): Promise<string[]> {
    this.assertProfileOrganization(organizationId, profile);
    return generateTicketIds(profile, count);
  }

  async commitValidatedMemoryChange(organizationId: string, request: ValidationCommitRequest): Promise<ValidationCommitResult> {
    return commitValidatedMemoryChangeLocalStorage(organizationId, request);
  }

  async resetOrganization(organizationId: string): Promise<void> {
    clearOrganization(organizationId);
  }

  async deleteOrganization(organizationId: string): Promise<void> {
    deleteOrganizationData(organizationId);
  }

  seedKnowledge(): KnowledgeItem[] {
    return seedOrganizationalKnowledge();
  }

  seedOrgMetrics(organizationId: string): OrgMetrics {
    return seedOrgMetrics(organizationId);
  }

  seedEmergingPatterns(): EmergingPattern[] {
    return seedEmergingPatterns();
  }

  private assertProfileOrganization(organizationId: string, profile: OrganizationProfile): void {
    const requiredId = requireOrganizationId(organizationId, "Persistence adapter ticket operation");
    if (profile.id !== requiredId) {
      throw new Error(`Persistence adapter ticket operation requires profile id ${requiredId}.`);
    }
  }
}
