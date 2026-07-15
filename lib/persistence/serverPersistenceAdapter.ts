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
import { requireOrganizationId } from "@/lib/organizationId";
import type { PersistenceAdapter, PersistencePreparationResult, ValidationCommitRequest } from "@/lib/persistence/adapter";

const DEFAULT_ORGANIZATION_ID = "profile-maesa-tech";

export class ServerPersistenceAdapterError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ServerPersistenceAdapterError";
  }
}

type ApiPayload<T> = { data: T } | { error: { code?: string; message?: string } };

function emptyOrgMetrics(organizationId: string): OrgMetrics {
  return {
    organizationId,
    lifetimeTickets: 0,
    knowledgeReused: 0,
    autoResolutions: 0,
    humanResolutions: 0,
    totalResolutionTimeSec: 0,
    resolutionsCount: 0,
    memoryGrowthToday: 0,
    memoryGrowthDate: new Date().toISOString().slice(0, 10),
    lastUpdatedAt: new Date(0).toISOString()
  };
}

export class ServerPersistenceAdapter implements PersistenceAdapter {
  private activeOrganizationId = this.configuredOrganizationId();

  async prepareOrganization(organizationId: string): Promise<PersistencePreparationResult> {
    const id = this.rememberOrganization(organizationId);
    await this.requestData<OrganizationProfile>(this.organizationPath(id));
    return { organizationId: id, warnings: [] };
  }

  loadOrganizationProfile(): Promise<OrganizationProfile> {
    return this.requestData<OrganizationProfile>(this.organizationPath(this.activeOrganizationId));
  }

  loadOrganizationList(): Promise<OrganizationProfile[]> {
    return this.requestData<OrganizationProfile[]>("/api/organizations");
  }

  async loadKnowledge(organizationId: string): Promise<KnowledgeItem[]> {
    return this.requestResource<KnowledgeItem[]>(organizationId, "knowledge");
  }

  async loadKnowledgeCandidates(organizationId: string): Promise<KnowledgeCandidate[]> {
    return this.requestResource<KnowledgeCandidate[]>(organizationId, "knowledge-candidates");
  }

  async loadValidationRecords(organizationId: string): Promise<ValidationRecord[]> {
    return this.requestResource<ValidationRecord[]>(organizationId, "validation-records");
  }

  async loadMemoryChangeRecords(organizationId: string): Promise<MemoryChangeRecord[]> {
    return this.requestResource<MemoryChangeRecord[]>(organizationId, "memory-change-records");
  }

  async loadOrgMetrics(organizationId: string): Promise<OrgMetrics | null> {
    return this.requestResource<OrgMetrics | null>(organizationId, "metrics");
  }

  async loadOrgLog(organizationId: string): Promise<IntelligenceLogEntry[]> {
    return this.requestResource<IntelligenceLogEntry[]>(organizationId, "intelligence-log");
  }

  async loadEmergingPatterns(organizationId: string): Promise<EmergingPattern[]> {
    return this.requestResource<EmergingPattern[]>(organizationId, "emerging-patterns");
  }

  async loadTicketRecords(organizationId: string): Promise<TicketRecord[]> {
    return this.requestResource<TicketRecord[]>(organizationId, "tickets");
  }

  async saveOrganizationProfile(profile: OrganizationProfile): Promise<void> {
    const id = this.rememberOrganization(profile.id);
    await this.requestData(`/api/organizations/${encodeURIComponent(id)}`, "PUT", profile);
  }

  async saveOrganizationList(list: OrganizationProfile[]): Promise<void> {
    await this.requestData("/api/organizations", "PUT", list);
  }

  async saveKnowledge(organizationId: string, items: KnowledgeItem[]): Promise<void> {
    await this.writeResource(organizationId, "knowledge", items);
  }

  async saveKnowledgeCandidates(organizationId: string, candidates: KnowledgeCandidate[]): Promise<void> {
    await this.writeResource(organizationId, "knowledge-candidates", candidates);
  }

  async saveValidationRecords(_organizationId: string, _records: ValidationRecord[]): Promise<void> {
    this.appendOnly("saveValidationRecords");
  }

  async saveMemoryChangeRecords(_organizationId: string, _records: MemoryChangeRecord[]): Promise<void> {
    this.appendOnly("saveMemoryChangeRecords");
  }

  async saveOrgMetrics(organizationId: string, metrics: OrgMetrics): Promise<void> {
    await this.writeResource(organizationId, "metrics", metrics);
  }

  async saveOrgLog(organizationId: string, entries: IntelligenceLogEntry[]): Promise<void> {
    await this.writeResource(organizationId, "intelligence-log", entries);
  }

  async saveEmergingPatterns(organizationId: string, patterns: EmergingPattern[]): Promise<void> {
    await this.writeResource(organizationId, "emerging-patterns", patterns);
  }

  async saveTicketRecords(organizationId: string, records: TicketRecord[]): Promise<void> {
    await this.writeResource(organizationId, "tickets", records);
  }

  async generateTicketId(organizationId: string, profile: OrganizationProfile): Promise<string> {
    return (await this.generateTicketIds(organizationId, profile, 1))[0];
  }

  async generateTicketIds(organizationId: string, _profile: OrganizationProfile, count: number): Promise<string[]> {
    if (count <= 0) return [];
    const id = this.rememberOrganization(organizationId);
    const result = await this.requestData<{ ticketIds: string[] }>(
      `${this.organizationPath(id)}/tickets/allocate`,
      "POST",
      { count }
    );
    return result.ticketIds;
  }

  async commitValidatedMemoryChange(organizationId: string, request: ValidationCommitRequest): Promise<void> {
    const id = this.rememberOrganization(organizationId);
    await this.requestData(`${this.organizationPath(id)}/commits/validation`, "POST", request);
  }

  async resetOrganization(organizationId: string): Promise<void> {
    const id = this.rememberOrganization(organizationId);
    await this.requestData(`${this.organizationPath(id)}/reset`, "POST", {});
  }

  async deleteOrganization(organizationId: string): Promise<void> {
    const id = this.rememberOrganization(organizationId);
    await this.requestData(`/api/organizations/${encodeURIComponent(id)}`, "DELETE");
  }

  seedKnowledge(): KnowledgeItem[] {
    return [];
  }

  seedOrgMetrics(organizationId: string): OrgMetrics {
    return emptyOrgMetrics(requireOrganizationId(organizationId, "Server persistence metrics seed"));
  }

  seedEmergingPatterns(): EmergingPattern[] {
    return [];
  }

  private configuredOrganizationId(): string {
    const configured = process.env.NEXT_PUBLIC_OIP_ORGANIZATION_ID?.trim();
    return configured || DEFAULT_ORGANIZATION_ID;
  }

  private rememberOrganization(organizationId: string): string {
    const id = requireOrganizationId(organizationId, "Server persistence adapter");
    this.activeOrganizationId = id;
    return id;
  }

  private organizationPath(organizationId: string): string {
    return `/api/organizations/${encodeURIComponent(this.rememberOrganization(organizationId))}`;
  }

  private async requestResource<T>(organizationId: string, resource: string): Promise<T> {
    const id = this.rememberOrganization(organizationId);
    return this.requestData<T>(`${this.organizationPath(id)}/${resource}`);
  }

  private async writeResource(organizationId: string, resource: string, payload: unknown): Promise<void> {
    const id = this.rememberOrganization(organizationId);
    await this.requestData(`${this.organizationPath(id)}/${resource}`, "PUT", payload);
  }

  /**
   * Single transport for all API calls. A failed server request throws; this
   * adapter never falls back to localStorage and never reports false success.
   */
  private async requestData<T>(path: string, method: "GET" | "PUT" | "POST" | "DELETE" = "GET", body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(path, {
        method,
        cache: "no-store",
        headers: body === undefined
          ? { Accept: "application/json" }
          : { Accept: "application/json", "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch {
      throw new ServerPersistenceAdapterError("SERVER_PERSISTENCE_UNAVAILABLE", "Server persistence API is unavailable.", 503);
    }

    let payload: ApiPayload<T> | null = null;
    try {
      payload = await response.json() as ApiPayload<T>;
    } catch {
      throw new ServerPersistenceAdapterError("SERVER_PERSISTENCE_INVALID_RESPONSE", "Server persistence returned an invalid response.", 502);
    }

    if (!response.ok || !payload || !("data" in payload)) {
      const error = payload && "error" in payload ? payload.error : undefined;
      throw new ServerPersistenceAdapterError(
        error?.code ?? "SERVER_PERSISTENCE_ERROR",
        error?.message ?? `Server persistence could not complete the ${method} request.`,
        response.status || 502
      );
    }
    return payload.data;
  }

  private appendOnly(operation: string): never {
    throw new ServerPersistenceAdapterError(
      "SERVER_PERSISTENCE_APPEND_ONLY",
      `${operation} is unavailable: audit records are append-only and persist through the transactional validation commit. No localStorage fallback was attempted.`,
      405
    );
  }
}
