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
import type { PersistenceAdapter, PersistencePreparationResult } from "@/lib/persistence/adapter";

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

  async saveOrganizationProfile(_profile: OrganizationProfile): Promise<void> {
    this.readOnly("saveOrganizationProfile");
  }

  async saveOrganizationList(_list: OrganizationProfile[]): Promise<void> {
    this.readOnly("saveOrganizationList");
  }

  async saveKnowledge(_organizationId: string, _items: KnowledgeItem[]): Promise<void> {
    this.readOnly("saveKnowledge");
  }

  async saveKnowledgeCandidates(_organizationId: string, _candidates: KnowledgeCandidate[]): Promise<void> {
    this.readOnly("saveKnowledgeCandidates");
  }

  async saveValidationRecords(_organizationId: string, _records: ValidationRecord[]): Promise<void> {
    this.readOnly("saveValidationRecords");
  }

  async saveMemoryChangeRecords(_organizationId: string, _records: MemoryChangeRecord[]): Promise<void> {
    this.readOnly("saveMemoryChangeRecords");
  }

  async saveOrgMetrics(_organizationId: string, _metrics: OrgMetrics): Promise<void> {
    this.readOnly("saveOrgMetrics");
  }

  async saveOrgLog(_organizationId: string, _entries: IntelligenceLogEntry[]): Promise<void> {
    this.readOnly("saveOrgLog");
  }

  async saveEmergingPatterns(_organizationId: string, _patterns: EmergingPattern[]): Promise<void> {
    this.readOnly("saveEmergingPatterns");
  }

  async saveTicketRecords(_organizationId: string, _records: TicketRecord[]): Promise<void> {
    this.readOnly("saveTicketRecords");
  }

  generateTicketId(_organizationId: string, _profile: OrganizationProfile): string {
    return this.readOnly("generateTicketId");
  }

  generateTicketIds(_organizationId: string, _profile: OrganizationProfile, _count: number): string[] {
    return this.readOnly("generateTicketIds");
  }

  resetOrganization(_organizationId: string): void {
    this.readOnly("resetOrganization");
  }

  deleteOrganization(_organizationId: string): void {
    this.readOnly("deleteOrganization");
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

  private async requestData<T>(path: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(path, {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" }
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
        error?.message ?? "Server persistence could not complete the read.",
        response.status || 502
      );
    }
    return payload.data;
  }

  private readOnly(operation: string): never {
    throw new ServerPersistenceAdapterError(
      "SERVER_PERSISTENCE_READ_ONLY",
      `${operation} is unavailable: server persistence is read-only in Batch 3. No localStorage fallback was attempted.`,
      405
    );
  }
}
