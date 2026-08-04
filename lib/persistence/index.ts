import { LocalStorageAdapter } from "@/lib/persistence/localStorageAdapter";
import type { PersistenceAdapter, PersistencePreparationResult, ValidationCommitRequest, ValidationCommitResult } from "@/lib/persistence/adapter";
import { ServerPersistenceAdapter } from "@/lib/persistence/serverPersistenceAdapter";
import { startTelemetrySpan } from "@/lib/telemetry";
import { createPersistenceContext, type PersistenceContextInput } from "@/lib/persistence/context";
import { bindPersistenceSession, type OrganizationPersistenceSession } from "@/lib/persistence/session";
export { ServerPersistenceAdapterError } from "@/lib/persistence/serverPersistenceAdapter";
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
  TicketPage,
  TicketPageRequest,
  BulkTicketSeed,
  TicketRecord,
  ValidationRecord
} from "@/types";

export type PersistenceMode = "local" | "server";

const instrumentedAdapters = new WeakMap<object, PersistenceAdapter>();

function instrumentPersistenceAdapter(adapter: PersistenceAdapter): PersistenceAdapter {
  const existing = instrumentedAdapters.get(adapter as object);
  if (existing) return existing;
  const instrumented = new Proxy(adapter, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function" || property === "constructor") return value;
      return (...args: unknown[]) => {
        const operation = String(property);
        const span = startTelemetrySpan(operation, "database", {
          unit: "operations",
          tags: { operation, backend: target.constructor.name }
        });
        try {
          const result = value.apply(target, args);
          if (result && typeof (result as { then?: unknown }).then === "function") {
            return Promise.resolve(result).then(
              (resolved) => { span.end(true); return resolved; },
              (error) => { span.end(false, { error: error instanceof Error ? error.name : "unknown" }); throw error; }
            );
          }
          span.end(true);
          return result;
        } catch (error) {
          span.end(false, { error: error instanceof Error ? error.name : "unknown" });
          throw error;
        }
      };
    }
  }) as PersistenceAdapter;
  instrumentedAdapters.set(adapter as object, instrumented);
  return instrumented;
}

export function createPersistenceAdapter(mode?: string): PersistenceAdapter {
  const configured = (mode ?? process.env.NEXT_PUBLIC_OIP_PERSISTENCE_MODE ?? "local").trim().toLowerCase();
  if (configured === "local") return instrumentPersistenceAdapter(new LocalStorageAdapter());
  if (configured === "server") return instrumentPersistenceAdapter(new ServerPersistenceAdapter());
  throw new Error(`Unsupported OIP persistence mode: ${configured}. Use "local" or "server".`);
}

// Shared singletons. The routing adapter dispatches per organization between
// these two concrete adapters; both are cheap and stateless enough to share.
export function persistenceAdapterForAuthority(authority: PersistenceAuthority): PersistenceAdapter {
  // Each call returns an independent adapter. Both concrete implementations
  // are now stateless with respect to organization selection, so concurrent
  // sessions cannot retarget one another.
  return instrumentPersistenceAdapter(authority === "server" ? new ServerPersistenceAdapter() : new LocalStorageAdapter());
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
  private readonly activeResourceAdapter: PersistenceAdapter = new StatelessOrganizationRouter();

  /** Resolve authority for compatibility callers without mutating shared state. */
  async activateOrganization(organizationId: string): Promise<PersistenceAuthority> {
    return resolveOrganizationAuthority(organizationId);
  }

  activeAuthority(): PersistenceAuthority {
    return globalPersistenceMode();
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
    // Preserve the synchronous local migration contract for compatibility
    // probes/UI initialization while keeping server-capable routing explicit.
    if (globalPersistenceMode() === "local") return this.shellAdapter.prepareOrganization(organizationId);
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

  loadKnowledgeHistory(organizationId: string, knowledgeId: string) {
    return this.activeResourceAdapter.loadKnowledgeHistory(organizationId, knowledgeId);
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

  loadTicketPage(organizationId: string, request: TicketPageRequest): Promise<TicketPage> {
    return this.activeResourceAdapter.loadTicketPage(organizationId, request);
  }

  saveTicketRecords(organizationId: string, records: TicketRecord[]): Promise<void> {
    return this.activeResourceAdapter.saveTicketRecords(organizationId, records);
  }

  saveTicketRecord(organizationId: string, record: TicketRecord): Promise<void> {
    return this.activeResourceAdapter.saveTicketRecord(organizationId, record);
  }

  prepareBulkTicketRecords(
    organizationId: string,
    profile: OrganizationProfile,
    seeds: BulkTicketSeed[]
  ): Promise<TicketRecord[]> {
    return this.activeResourceAdapter.prepareBulkTicketRecords(organizationId, profile, seeds);
  }

  generateTicketId(organizationId: string, profile: OrganizationProfile): Promise<string> {
    return this.activeResourceAdapter.generateTicketId(organizationId, profile);
  }

  generateTicketIds(organizationId: string, profile: OrganizationProfile, count: number): Promise<string[]> {
    return this.activeResourceAdapter.generateTicketIds(organizationId, profile, count);
  }

  commitValidatedMemoryChange(organizationId: string, request: ValidationCommitRequest): Promise<ValidationCommitResult> {
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

/**
 * Compatibility routing for the old `persistence` facade. It resolves the
 * authority from the explicit organization argument on every operation and
 * never stores an active organization or adapter. New durable callers should
 * use `OrganizationPersistenceSession`, which binds this same boundary once
 * for the operation.
 */
class StatelessOrganizationRouter implements PersistenceAdapter {
  private async adapter(organizationId: string): Promise<PersistenceAdapter> {
    return persistenceAdapterForAuthority(await resolveOrganizationAuthority(organizationId));
  }

  prepareOrganization(organizationId: string) { return this.adapter(organizationId).then((adapter) => adapter.prepareOrganization(organizationId)); }
  loadOrganizationProfile(organizationId?: string) { return organizationId ? this.adapter(organizationId).then((adapter) => adapter.loadOrganizationProfile(organizationId)) : persistenceAdapterForAuthority(globalPersistenceMode()).loadOrganizationProfile(); }
  saveOrganizationProfile(profile: OrganizationProfile, organizationId?: string) { const id = organizationId ?? profile.id; return this.adapter(id).then((adapter) => adapter.saveOrganizationProfile(profile, id)); }
  loadOrganizationList() { return persistenceAdapterForAuthority(globalPersistenceMode()).loadOrganizationList(); }
  saveOrganizationList(list: OrganizationProfile[]) { return persistenceAdapterForAuthority(globalPersistenceMode()).saveOrganizationList(list); }
  loadKnowledge(organizationId: string) { return this.adapter(organizationId).then((adapter) => adapter.loadKnowledge(organizationId)); }
  saveKnowledge(organizationId: string, items: KnowledgeItem[]) { return this.adapter(organizationId).then((adapter) => adapter.saveKnowledge(organizationId, items)); }
  loadKnowledgeCandidates(organizationId: string) { return this.adapter(organizationId).then((adapter) => adapter.loadKnowledgeCandidates(organizationId)); }
  saveKnowledgeCandidates(organizationId: string, items: KnowledgeCandidate[]) { return this.adapter(organizationId).then((adapter) => adapter.saveKnowledgeCandidates(organizationId, items)); }
  loadValidationRecords(organizationId: string) { return this.adapter(organizationId).then((adapter) => adapter.loadValidationRecords(organizationId)); }
  saveValidationRecords(organizationId: string, records: ValidationRecord[]) { return this.adapter(organizationId).then((adapter) => adapter.saveValidationRecords(organizationId, records)); }
  loadMemoryChangeRecords(organizationId: string) { return this.adapter(organizationId).then((adapter) => adapter.loadMemoryChangeRecords(organizationId)); }
  loadKnowledgeHistory(organizationId: string, knowledgeId: string) { return this.adapter(organizationId).then((adapter) => adapter.loadKnowledgeHistory(organizationId, knowledgeId)); }
  saveMemoryChangeRecords(organizationId: string, records: MemoryChangeRecord[]) { return this.adapter(organizationId).then((adapter) => adapter.saveMemoryChangeRecords(organizationId, records)); }
  loadOrgMetrics(organizationId: string) { return this.adapter(organizationId).then((adapter) => adapter.loadOrgMetrics(organizationId)); }
  saveOrgMetrics(organizationId: string, metrics: OrgMetrics) { return this.adapter(organizationId).then((adapter) => adapter.saveOrgMetrics(organizationId, metrics)); }
  loadOrgLog(organizationId: string) { return this.adapter(organizationId).then((adapter) => adapter.loadOrgLog(organizationId)); }
  saveOrgLog(organizationId: string, entries: IntelligenceLogEntry[]) { return this.adapter(organizationId).then((adapter) => adapter.saveOrgLog(organizationId, entries)); }
  loadEmergingPatterns(organizationId: string) { return this.adapter(organizationId).then((adapter) => adapter.loadEmergingPatterns(organizationId)); }
  saveEmergingPatterns(organizationId: string, patterns: EmergingPattern[]) { return this.adapter(organizationId).then((adapter) => adapter.saveEmergingPatterns(organizationId, patterns)); }
  loadTicketRecords(organizationId: string) { return this.adapter(organizationId).then((adapter) => adapter.loadTicketRecords(organizationId)); }
  loadTicketPage(organizationId: string, request: TicketPageRequest) { return this.adapter(organizationId).then((adapter) => adapter.loadTicketPage(organizationId, request)); }
  saveTicketRecords(organizationId: string, records: TicketRecord[]) { return this.adapter(organizationId).then((adapter) => adapter.saveTicketRecords(organizationId, records)); }
  saveTicketRecord(organizationId: string, record: TicketRecord) { return this.adapter(organizationId).then((adapter) => adapter.saveTicketRecord(organizationId, record)); }
  prepareBulkTicketRecords(organizationId: string, profile: OrganizationProfile, seeds: BulkTicketSeed[]) { return this.adapter(organizationId).then((adapter) => adapter.prepareBulkTicketRecords(organizationId, profile, seeds)); }
  generateTicketId(organizationId: string, profile: OrganizationProfile) { return this.adapter(organizationId).then((adapter) => adapter.generateTicketId(organizationId, profile)); }
  generateTicketIds(organizationId: string, profile: OrganizationProfile, count: number) { return this.adapter(organizationId).then((adapter) => adapter.generateTicketIds(organizationId, profile, count)); }
  commitValidatedMemoryChange(organizationId: string, request: ValidationCommitRequest) { return this.adapter(organizationId).then((adapter) => adapter.commitValidatedMemoryChange(organizationId, request)); }
  resetOrganization(organizationId: string) { return this.adapter(organizationId).then((adapter) => adapter.resetOrganization(organizationId)); }
  deleteOrganization(organizationId: string) { return this.adapter(organizationId).then((adapter) => adapter.deleteOrganization(organizationId)); }
  seedKnowledge() { return persistenceAdapterForAuthority(globalPersistenceMode()).seedKnowledge(); }
  seedOrgMetrics(organizationId: string) { return persistenceAdapterForAuthority(globalPersistenceMode()).seedOrgMetrics(organizationId); }
  seedEmergingPatterns() { return persistenceAdapterForAuthority(globalPersistenceMode()).seedEmergingPatterns(); }
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

/** Create a frozen organization/authority boundary for one operation. */
export function createPersistenceSession(input: PersistenceContextInput): OrganizationPersistenceSession {
  return bindPersistenceSession(createPersistenceContext(input), persistenceAdapterForAuthority(input.authority));
}

/** Resolve durable authority once, then return an immutable operation session. */
export async function createPersistenceSessionForOrganization(
  input: Omit<PersistenceContextInput, "authority">
): Promise<OrganizationPersistenceSession> {
  const authority = await resolveOrganizationAuthority(input.organizationId);
  const context = createPersistenceContext({ ...input, authority });
  return bindPersistenceSession(context, persistenceAdapterForAuthority(authority));
}

export function getPersistenceAdapter(): PersistenceAdapter {
  return persistence;
}

export { globalPersistenceMode, AuthorityDiscoveryError } from "@/lib/persistence/authorityRouting";
export type { PersistenceAuthority } from "@/lib/persistence/authorityRouting";
export { LocalStorageAdapter } from "@/lib/persistence/localStorageAdapter";
export { ServerPersistenceAdapter } from "@/lib/persistence/serverPersistenceAdapter";
export type { PersistenceAdapter, PersistencePreparationResult } from "@/lib/persistence/adapter";
export type { OrganizationPersistenceSession } from "@/lib/persistence/session";
export {
  createPersistenceContext,
  PersistenceContextError,
  assertPersistenceContextOrganization
} from "@/lib/persistence/context";
export type { PersistenceActorContext, PersistenceContext, PersistenceContextInput } from "@/lib/persistence/context";
