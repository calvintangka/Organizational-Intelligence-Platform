import "server-only";

import type {
  BulkTicketSeed, EmergingPattern, IntelligenceLogEntry, KnowledgeCandidate, KnowledgeHistory,
  KnowledgeItem, MemoryChangeRecord, OrgMetrics, OrganizationProfile, TicketPage, TicketPageRequest,
  TicketRecord, ValidationRecord
} from "@/types";
import type { PersistenceAdapter, ValidationCommitRequest, ValidationCommitResult } from "@/lib/persistence/adapter";
import type { PersistenceContext } from "@/lib/persistence/context";
import { bindPersistenceSession, type OrganizationPersistenceSession } from "@/lib/persistence/session";
import {
  allocateTicketIds, commitValidation, deleteOrganization, getOrganizationProfile, listOrganizationProfiles,
  loadEmergingPatterns, loadIntelligenceLog, loadKnowledge, loadKnowledgeCandidates, loadKnowledgeHistory,
  loadMemoryChangeRecords, loadOrgMetrics, loadTicketPage, loadTicketRecords, loadValidationRecords,
  prepareBulkTicketRecords, resetOrganizationData, saveEmergingPatterns, saveIntelligenceLog, saveKnowledge,
  saveKnowledgeCandidates, saveOrgMetrics, saveTicketRecords, upsertOrganizationProfile
} from "@/lib/server/persistenceService";

/** Server-only adapter used by workers; it never performs relative browser fetches. */
export class ServerJobPersistenceAdapter implements PersistenceAdapter {
  prepareOrganization(organizationId: string) { return { organizationId, warnings: [] }; }
  loadOrganizationProfile(organizationId?: string) { return getOrganizationProfile(organizationId ?? ""); }
  saveOrganizationProfile(profile: OrganizationProfile) { return upsertOrganizationProfile(profile); }
  loadOrganizationList() { return listOrganizationProfiles(); }
  async saveOrganizationList(list: OrganizationProfile[]) { for (const profile of list) await upsertOrganizationProfile(profile); }
  loadKnowledge(organizationId: string) { return loadKnowledge(organizationId); }
  saveKnowledge(organizationId: string, items: KnowledgeItem[]) { return saveKnowledge(organizationId, items); }
  loadKnowledgeCandidates(organizationId: string) { return loadKnowledgeCandidates(organizationId); }
  saveKnowledgeCandidates(organizationId: string, items: KnowledgeCandidate[]) { return saveKnowledgeCandidates(organizationId, items); }
  loadValidationRecords(organizationId: string) { return loadValidationRecords(organizationId); }
  async saveValidationRecords(_organizationId: string, _records: ValidationRecord[]) { throw new Error("Validation records require the atomic learning command."); }
  loadMemoryChangeRecords(organizationId: string) { return loadMemoryChangeRecords(organizationId); }
  loadKnowledgeHistory(organizationId: string, knowledgeId: string) { return loadKnowledgeHistory(organizationId, knowledgeId); }
  async saveMemoryChangeRecords(_organizationId: string, _records: MemoryChangeRecord[]) { throw new Error("Memory changes require the atomic learning command."); }
  loadOrgMetrics(organizationId: string) { return loadOrgMetrics(organizationId); }
  saveOrgMetrics(organizationId: string, metrics: OrgMetrics) { return saveOrgMetrics(organizationId, metrics); }
  loadOrgLog(organizationId: string) { return loadIntelligenceLog(organizationId); }
  saveOrgLog(organizationId: string, entries: IntelligenceLogEntry[]) { return saveIntelligenceLog(organizationId, entries); }
  loadEmergingPatterns(organizationId: string) { return loadEmergingPatterns(organizationId); }
  saveEmergingPatterns(organizationId: string, patterns: EmergingPattern[]) { return saveEmergingPatterns(organizationId, patterns); }
  loadTicketRecords(organizationId: string) { return loadTicketRecords(organizationId); }
  loadTicketPage(organizationId: string, request: TicketPageRequest) { return loadTicketPage(organizationId, request); }
  saveTicketRecords(organizationId: string, records: TicketRecord[]) { return saveTicketRecords(organizationId, records); }
  saveTicketRecord(organizationId: string, record: TicketRecord) { return saveTicketRecords(organizationId, [record]); }
  prepareBulkTicketRecords(organizationId: string, _profile: OrganizationProfile, seeds: BulkTicketSeed[]) { return prepareBulkTicketRecords(organizationId, seeds); }
  async generateTicketId(organizationId: string, _profile: OrganizationProfile) { return (await allocateTicketIds(organizationId, 1))[0]; }
  generateTicketIds(organizationId: string, _profile: OrganizationProfile, count: number) { return allocateTicketIds(organizationId, count); }
  commitValidatedMemoryChange(organizationId: string, request: ValidationCommitRequest): Promise<ValidationCommitResult> {
    return Promise.reject(new Error("Worker memory commits require an explicit authenticated actor binding."));
  }
  resetOrganization(organizationId: string) { return resetOrganizationData(organizationId); }
  deleteOrganization(organizationId: string) { return deleteOrganization(organizationId); }
  seedKnowledge(): KnowledgeItem[] { return []; }
  seedOrgMetrics(organizationId: string): OrgMetrics { return { organizationId, lifetimeTickets: 0, knowledgeReused: 0, autoResolutions: 0, humanResolutions: 0, totalResolutionTimeSec: 0, resolutionsCount: 0, memoryGrowthToday: 0, memoryGrowthDate: new Date().toISOString().slice(0, 10), lastUpdatedAt: new Date().toISOString() }; }
  seedEmergingPatterns(): EmergingPattern[] { return []; }
}

export function createServerJobPersistenceSession(context: PersistenceContext): OrganizationPersistenceSession {
  return bindPersistenceSession(context, new ServerJobPersistenceAdapter());
}
