import "server-only";

/**
 * MD-001 provider boundary. Providers may expose current company facts, but
 * they never receive connector credentials through Ask or an ExecutionPackage.
 */
export interface ProviderContext {
  organizationId: string;
  userId: string;
  domainId?: string;
  scope?: Record<string, unknown>;
}

export interface ProviderCapability {
  key: string;
  label: string;
  freshness?: string;
  scope?: Record<string, unknown>;
}

export interface CompanyDataQuery {
  query: string;
  context: ProviderContext;
  requestedCapability?: string;
}

export interface CompanyDataResult {
  providerId: string;
  sourceTimestamp: string;
  sourceReference: string;
  authorizationContext: Record<string, unknown>;
  resultDigest: string;
  freshness: { asOf: string; label?: string };
  data: Record<string, unknown>;
}

export interface CompanyDataProvider {
  getCapabilities(context: ProviderContext): Promise<ProviderCapability[]>;
  query(request: CompanyDataQuery): Promise<CompanyDataResult>;
}

export class CompanyDataProviderUnavailableError extends Error {
  constructor() {
    super("No authorized current company-data provider is connected for this request.");
    this.name = "CompanyDataProviderUnavailableError";
  }
}
