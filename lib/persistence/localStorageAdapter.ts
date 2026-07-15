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
  generateTicketId,
  generateTicketIds,
  loadTicketRecords as loadLocalStorageTicketRecords,
  saveTicketRecords as saveLocalStorageTicketRecords
} from "@/lib/ticketRecords";
import { requireOrganizationId } from "@/lib/organizationId";
import type { PersistenceAdapter } from "@/lib/persistence/adapter";

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

  saveOrganizationProfile(profile: OrganizationProfile): Promise<void> {
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

  saveTicketRecords(organizationId: string, records: TicketRecord[]): Promise<void> {
    return saveLocalStorageTicketRecords(organizationId, records);
  }

  async generateTicketId(organizationId: string, profile: OrganizationProfile): Promise<string> {
    this.assertProfileOrganization(organizationId, profile);
    return generateTicketId(profile);
  }

  async generateTicketIds(organizationId: string, profile: OrganizationProfile, count: number): Promise<string[]> {
    this.assertProfileOrganization(organizationId, profile);
    return generateTicketIds(profile, count);
  }

  /**
   * Local mode persists validated memory changes through the existing
   * per-resource snapshot saves; the commit operation itself is a no-op so
   * the hardened localStorage behavior stays byte-identical to Batch 3.
   */
  async commitValidatedMemoryChange(organizationId: string): Promise<void> {
    requireOrganizationId(organizationId, "Validated memory change commit");
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
