import { LocalStorageAdapter } from "@/lib/persistence/localStorageAdapter";
import type { PersistenceAdapter, PersistencePreparationResult, ValidationCommitRequest } from "@/lib/persistence/adapter";
import { ServerPersistenceAdapter } from "@/lib/persistence/serverPersistenceAdapter";
import {
  globalPersistenceMode,
  resolveOrganizationAuthority,
  type PersistenceAuthority
} from "@/lib/persistence/authorityRouting";
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

export type PersistenceMode = "local" | "server";

export function createPersistenceAdapter(mode?: string): PersistenceAdapter {
  const configured = (mode ?? process.env.NEXT_PUBLIC_OIP_PERSISTENCE_MODE ?? "local").trim().toLowerCase();
  if (configured === "local") return new LocalStorageAdapter();
  if (configured === "server") return new ServerPersistenceAdapter();
  throw new Error(`Unsupported OIP persistence mode: ${configured}. Use "local" or "server".`);
}

// Shared singletons. The routing adapter dispatches per organization between
// these two concrete adapters; both are cheap and stateless enough to share.
const localAdapter = new LocalStorageAdapter();
const serverAdapter = new ServerPersistenceAdapter();

export function persistenceAdapterForAuthority(authority: PersistenceAuthority): PersistenceAdapter {
  return authority === "server" ? serverAdapter : localAdapter;
}

/**
 * Conceptual per-organization adapter selection (Batch 5.8). Resolves the
 * durable authority for the organization, then returns the concrete adapter:
 *   authority = local  -> LocalStorageAdapter
 *   authority = server -> ServerPersistenceAdapter
 */
export async function getPersistenceAdapterForOrganization(organizationId: string): Promise<PersistenceAdapter> {
  return persistenceAdapterForAuthority(await resolveOrganizationAuthority(organizationId));
}

/**
 * Per-organization routing seam.
 *
 * Two backends are tracked at once:
 *   - the SHELL adapter (global env mode) owns cross-organization selection
 *     state: the organization profile and the organization list, i.e. which
 *     organizations exist and which one is selected.
 *   - the ACTIVE RESOURCE adapter is chosen from the active organization's
 *     durable authority and owns every organization-owned resource operation.
 *
 * `activateOrganization` MUST be awaited before an organization's resources are
 * read or written. There is no automatic server->local fallback: a
 * server-authoritative organization with an unreachable server surfaces an
 * explicit error rather than reading or writing localStorage.
 */
class RoutingPersistenceAdapter implements PersistenceAdapter {
  private readonly shellAdapter: PersistenceAdapter = persistenceAdapterForAuthority(globalPersistenceMode());
  private activeResourceAdapter: PersistenceAdapter = this.shellAdapter;
  private currentAuthority: PersistenceAuthority = globalPersistenceMode();
  private activeOrganizationId: string | null = null;

  /** Resolve and select the adapter for one organization. */
  async activateOrganization(organizationId: string): Promise<PersistenceAuthority> {
    const authority = await resolveOrganizationAuthority(organizationId);
    this.currentAuthority = authority;
    this.activeResourceAdapter = persistenceAdapterForAuthority(authority);
    this.activeOrganizationId = organizationId;
    return authority;
  }

  activeAuthority(): PersistenceAuthority {
    return this.currentAuthority;
  }

  /* ---- Cross-organization selection state routes to the shell adapter ---- */

  loadOrganizationProfile(): Promise<OrganizationProfile> {
    return this.shellAdapter.loadOrganizationProfile();
  }

  saveOrganizationProfile(profile: OrganizationProfile): Promise<OrganizationProfile> {
    return this.shellAdapter.saveOrganizationProfile(profile);
  }

  loadOrganizationList(): Promise<OrganizationProfile[]> {
    return this.shellAdapter.loadOrganizationList();
  }

  saveOrganizationList(list: OrganizationProfile[]): Promise<void> {
    return this.shellAdapter.saveOrganizationList(list);
  }

  /* ---- Organization-owned resources route to the active resource adapter ---- */

  prepareOrganization(organizationId: string): PersistencePreparationResult | Promise<PersistencePreparationResult> {
    return this.activeResourceAdapter.prepareOrganization(organizationId);
  }

  loadKnowledge(organizationId: string): Promise<KnowledgeItem[]> {
    return this.activeResourceAdapter.loadKnowledge(organizationId);
  }

  saveKnowledge(organizationId: string, items: KnowledgeItem[]): Promise<void> {
    return this.activeResourceAdapter.saveKnowledge(organizationId, items);
  }

  loadKnowledgeCandidates(organizationId: string): Promise<KnowledgeCandidate[]> {
    return this.activeResourceAdapter.loadKnowledgeCandidates(organizationId);
  }

  saveKnowledgeCandidates(organizationId: string, candidates: KnowledgeCandidate[]): Promise<void> {
    return this.activeResourceAdapter.saveKnowledgeCandidates(organizationId, candidates);
  }

  loadValidationRecords(organizationId: string): Promise<ValidationRecord[]> {
    return this.activeResourceAdapter.loadValidationRecords(organizationId);
  }

  saveValidationRecords(organizationId: string, records: ValidationRecord[]): Promise<void> {
    return this.activeResourceAdapter.saveValidationRecords(organizationId, records);
  }

  loadMemoryChangeRecords(organizationId: string): Promise<MemoryChangeRecord[]> {
    return this.activeResourceAdapter.loadMemoryChangeRecords(organizationId);
  }

  saveMemoryChangeRecords(organizationId: string, records: MemoryChangeRecord[]): Promise<void> {
    return this.activeResourceAdapter.saveMemoryChangeRecords(organizationId, records);
  }

  loadOrgMetrics(organizationId: string): Promise<OrgMetrics | null> {
    return this.activeResourceAdapter.loadOrgMetrics(organizationId);
  }

  saveOrgMetrics(organizationId: string, metrics: OrgMetrics): Promise<void> {
    return this.activeResourceAdapter.saveOrgMetrics(organizationId, metrics);
  }

  loadOrgLog(organizationId: string): Promise<IntelligenceLogEntry[]> {
    return this.activeResourceAdapter.loadOrgLog(organizationId);
  }

  saveOrgLog(organizationId: string, entries: IntelligenceLogEntry[]): Promise<void> {
    return this.activeResourceAdapter.saveOrgLog(organizationId, entries);
  }

  loadEmergingPatterns(organizationId: string): Promise<EmergingPattern[]> {
    return this.activeResourceAdapter.loadEmergingPatterns(organizationId);
  }

  saveEmergingPatterns(organizationId: string, patterns: EmergingPattern[]): Promise<void> {
    return this.activeResourceAdapter.saveEmergingPatterns(organizationId, patterns);
  }

  loadTicketRecords(organizationId: string): Promise<TicketRecord[]> {
    return this.activeResourceAdapter.loadTicketRecords(organizationId);
  }

  saveTicketRecords(organizationId: string, records: TicketRecord[]): Promise<void> {
    return this.activeResourceAdapter.saveTicketRecords(organizationId, records);
  }

  generateTicketId(organizationId: string, profile: OrganizationProfile): Promise<string> {
    return this.activeResourceAdapter.generateTicketId(organizationId, profile);
  }

  generateTicketIds(organizationId: string, profile: OrganizationProfile, count: number): Promise<string[]> {
    return this.activeResourceAdapter.generateTicketIds(organizationId, profile, count);
  }

  commitValidatedMemoryChange(organizationId: string, request: ValidationCommitRequest): Promise<void> {
    return this.activeResourceAdapter.commitValidatedMemoryChange(organizationId, request);
  }

  resetOrganization(organizationId: string): Promise<void> {
    return this.activeResourceAdapter.resetOrganization(organizationId);
  }

  deleteOrganization(organizationId: string): Promise<void> {
    return this.activeResourceAdapter.deleteOrganization(organizationId);
  }

  seedKnowledge(): KnowledgeItem[] {
    return this.activeResourceAdapter.seedKnowledge();
  }

  seedOrgMetrics(organizationId: string): OrgMetrics {
    return this.activeResourceAdapter.seedOrgMetrics(organizationId);
  }

  seedEmergingPatterns(): EmergingPattern[] {
    return this.activeResourceAdapter.seedEmergingPatterns();
  }
}

// The single active adapter. Local remains the explicit default. Per-organization
// server authority is opt-in through an explicit verified cutover; the global
// NEXT_PUBLIC_OIP_PERSISTENCE_MODE flag only decides whether server routing is
// available at all (development override / fallback).
const routingPersistence = new RoutingPersistenceAdapter();
export const persistence: PersistenceAdapter = routingPersistence;

// Global shell mode (unchanged committed default is "local"). Prefer
// activePersistenceMode() for per-organization resource gating.
export const persistenceMode: PersistenceMode = globalPersistenceMode();

/** Authority of the currently-active organization (drives per-org save gating). */
export function activePersistenceMode(): PersistenceMode {
  return routingPersistence.activeAuthority();
}

/**
 * Authority-aware gate for the legacy localStorage migration notice. Warnings
 * from `prepareOrganization` describe LocalStorageAdapter migration state, so
 * they are only relevant when the active organization is operating locally. A
 * server-authoritative organization reads/writes through PostgreSQL and must
 * never surface the legacy-storage notice.
 */
export function migrationWarningForMode(mode: PersistenceMode, warnings: string[]): string {
  return mode === "local" ? warnings.join(" ") : "";
}

/** Resolve and select the adapter for one organization before hydration. */
export function activatePersistenceOrganization(organizationId: string): Promise<PersistenceAuthority> {
  return routingPersistence.activateOrganization(organizationId);
}

export function getPersistenceAdapter(): PersistenceAdapter {
  return persistence;
}

export { globalPersistenceMode, AuthorityDiscoveryError } from "@/lib/persistence/authorityRouting";
export type { PersistenceAuthority } from "@/lib/persistence/authorityRouting";
export { LocalStorageAdapter } from "@/lib/persistence/localStorageAdapter";
export { ServerPersistenceAdapter } from "@/lib/persistence/serverPersistenceAdapter";
export type { PersistenceAdapter, PersistencePreparationResult } from "@/lib/persistence/adapter";
