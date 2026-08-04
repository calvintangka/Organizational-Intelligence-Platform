import { requireOrganizationId } from "@/lib/organizationId";
import type { PersistenceAuthority } from "@/lib/persistence/authorityRouting";

export interface PersistenceActorContext {
  readonly id?: string;
  readonly name?: string;
  readonly email?: string;
  readonly role?: string;
}

export interface PersistenceContextInput {
  organizationId: string;
  actorContext: PersistenceActorContext;
  authority: PersistenceAuthority;
  requestId: string;
  correlationId?: string;
  idempotencyKey?: string;
  expectedRevision?: number;
  metadata?: Readonly<Record<string, string | number | boolean | undefined>>;
}

export interface PersistenceContext extends Omit<PersistenceContextInput, "correlationId" | "metadata"> {
  readonly correlationId: string;
  readonly metadata: Readonly<Record<string, string | number | boolean | undefined>>;
}

export type PersistenceContextErrorCode =
  | "PERSISTENCE_CONTEXT_MISSING"
  | "PERSISTENCE_CONTEXT_INVALID"
  | "PERSISTENCE_AUTHORITY_MISMATCH"
  | "PERSISTENCE_CROSS_TENANT_PAYLOAD";

export class PersistenceContextError extends Error {
  constructor(
    public readonly code: PersistenceContextErrorCode,
    message: string,
    public readonly requestId = "unknown",
    public readonly authority: PersistenceAuthority | "unknown" = "unknown",
    public readonly retryable = false
  ) {
    super(message);
    this.name = "PersistenceContextError";
  }
}

export function createPersistenceContext(input: PersistenceContextInput): PersistenceContext {
  const organizationId = typeof input.organizationId === "string" ? input.organizationId.trim() : "";
  const requestId = typeof input.requestId === "string" ? input.requestId.trim() : "";
  if (!organizationId || !requestId) {
    throw new PersistenceContextError(
      "PERSISTENCE_CONTEXT_MISSING",
      "An explicit organizationId and requestId are required for durable persistence."
    );
  }
  requireOrganizationId(organizationId, "Persistence context");
  if (input.authority !== "local" && input.authority !== "server") {
    throw new PersistenceContextError(
      "PERSISTENCE_CONTEXT_INVALID",
      "A valid persistence authority is required.",
      requestId,
      "unknown"
    );
  }
  if (!input.actorContext || typeof input.actorContext !== "object") {
    throw new PersistenceContextError(
      "PERSISTENCE_CONTEXT_MISSING",
      "An explicit actor context is required for durable persistence.",
      requestId,
      input.authority
    );
  }
  const actorContext = Object.freeze({ ...input.actorContext });
  const metadata = Object.freeze({ ...(input.metadata ?? {}) });
  return Object.freeze({
    organizationId,
    actorContext,
    authority: input.authority,
    requestId,
    correlationId: input.correlationId?.trim() || requestId,
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    ...(input.expectedRevision === undefined ? {} : { expectedRevision: input.expectedRevision }),
    metadata
  });
}

export function assertPersistenceContextOrganization(
  context: PersistenceContext,
  organizationId: string,
  operation: string
): void {
  const normalized = typeof organizationId === "string" ? organizationId.trim() : "";
  if (!normalized || normalized !== context.organizationId) {
    throw new PersistenceContextError(
      "PERSISTENCE_CROSS_TENANT_PAYLOAD",
      `${operation} attempted to cross organization boundaries.`,
      context.requestId,
      context.authority
    );
  }
}
