export const CONNECTOR_TYPES = ["generic.signed_webhook"] as const;
export type ConnectorType = typeof CONNECTOR_TYPES[number];
export const CONNECTOR_STATUSES = ["draft", "active", "paused", "degraded", "disabled", "revoked"] as const;
export type ConnectorStatus = typeof CONNECTOR_STATUSES[number];

export interface ExternalWorkSignal {
  source: string;
  connectorInstallationId: string;
  externalObjectType: "ticket";
  externalObjectId: string;
  externalEventId: string;
  eventType: "ticket.created" | "ticket.updated";
  externalVersion?: string;
  subject?: string;
  message: string;
  requester?: { name?: string; email?: string };
  status?: string;
  priority?: string;
  tags: string[];
  attachmentsMetadata?: Array<{ name: string; contentType?: string; sizeBytes?: number }>;
  createdAt: string;
  updatedAt?: string;
  sourceUrl?: string;
  metadata: Record<string, string | number | boolean>;
}

export interface ConnectorCredentialMaterial {
  signingSecret: string;
}

export interface ConnectorInstallationConfiguration {
  acceptedEventTypes?: string[];
  replayWindowSeconds?: number;
}

export interface ConnectorAdapter {
  readonly type: ConnectorType;
  readonly version: number;
  readonly capabilities: readonly string[];
  verifyConfiguration(configuration: unknown): ConnectorInstallationConfiguration;
  verifyInboundRequest(input: { rawBody: string; headers: Headers; credential: ConnectorCredentialMaterial; configuration: ConnectorInstallationConfiguration; now: Date }): Promise<{ eventId: string; eventType: string; sourceTimestamp: Date }>;
  normalizeInboundEvent(input: { rawBody: string; installationId: string }): ExternalWorkSignal;
  testConnection(input: { credential: ConnectorCredentialMaterial }): Promise<{ ok: boolean; safeMessage: string }>;
  fetchChanges?(input: { cursor?: Record<string, unknown>; limit: number }): Promise<{ events: unknown[]; nextCursor?: Record<string, unknown> }>;
}

export class ConnectorError extends Error {
  constructor(
    public readonly code: "UNKNOWN_CONNECTOR" | "INVALID_CONFIGURATION" | "INVALID_SIGNATURE" | "EXPIRED_TIMESTAMP" | "MALFORMED_EVENT" | "UNSUPPORTED_EVENT" | "INACTIVE_CONNECTOR" | "PAYLOAD_CONFLICT" | "NOT_FOUND" | "FORBIDDEN" | "TRANSIENT_FAILURE",
    message: string,
    public readonly status: number,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}

export function isConnectorType(value: unknown): value is ConnectorType {
  return typeof value === "string" && (CONNECTOR_TYPES as readonly string[]).includes(value);
}
