export type TicketStatus = "new" | "analyzed" | "drafted" | "reviewed" | "approved" | "resolved";

export interface Ticket {
  id: string;
  ticketId?: string;
  customerName: string;
  subject: string;
  description: string;
  category: string;
  status: TicketStatus;
  createdAt: string;
}

export type TicketRecordStatus = "open" | "in_review" | "resolved" | "rejected" | "discarded";

export interface TicketRecordClassification {
  category: string;
  intent: string;
  canonicalProblem: string | null;
  classifiedBy: "deterministic" | "llm_fallback";
  confidence: string;
  inquiryType?: "operational_support" | "business_inquiry";
  businessIntent?: string;
  securityDetected?: boolean;
  securitySeverity?: "low" | "medium" | "high" | "critical";
  securityReasons?: string[];
  escalationRequired?: boolean;
  /**
   * TODO-058: detected language of the INCOMING ticket, plus the language the
   * outgoing draft used. Both are metadata about this ticket only — knowledge,
   * canonicals, and lessons stay language-neutral and are never partitioned by
   * language. Optional so historical rows remain valid without a backfill.
   */
  language?: TicketRecordLanguage;
}

export interface TicketRecordLanguage {
  /** Detected language of the customer's message (ISO 639-1). */
  detected: string;
  /** 0..1 detector confidence. */
  confidence: number;
  /**
   * How the language was reached. "fallback" means it was ASSUMED from the
   * organization default, not detected — the UI must not present it as a
   * detection. "reviewer" means a human set it explicitly.
   */
  method: "script" | "lexical" | "fallback" | "reviewer";
  /** Language the outgoing draft was written in, once a draft exists. */
  responseLanguage?: string;
  /** Set when a human reviewer corrected the detected language. */
  reviewerOverride?: boolean;
}

export type RetrievalDecision =
  | "no_deterministic_candidate"
  | "rejected_by_compatibility"
  | "rejected_by_ai"
  | "deterministic_preserved";

export type RetrievalProviderOutcome =
  | "not_run"
  | "confirmed"
  | "rejected"
  | "unavailable"
  | "budget_exhausted"
  | "cancelled"
  | "exception";

export interface RetrievalAudit {
  decision: RetrievalDecision;
  deterministicCandidate: boolean;
  deterministicMatchScore: number | null;
  deterministicKnowledgeId: string | null;
  deterministicLessonId: string | null;
  providerOutcome: RetrievalProviderOutcome;
  providerLabel?: string | null;
  reason: string;
}

export interface TicketRecordMemoryMatch {
  knowledgeId: string | null;
  matchType: "lesson" | "template" | "none";
  lessonId: string | null;
  retrievalAudit?: RetrievalAudit;
}

export interface TicketRecordResolution {
  finalResponse: string | null;
  humanEdited: boolean;
  editDistanceNote: string | null;
  resolvedAt: string | null;
}

export interface TicketRecordReflection {
  decision: string | null;
  lessonCreatedId: string | null;
  lessonReinforcedId: string | null;
  knowledgeChanged: string | null;
}

export interface TicketRecord {
  ticketId: string;
  orgId: string;
  actorId?: string;
  /** Application-service replay metadata. Kept optional for historical rows. */
  processingIdempotencyKey?: string;
  processingPayloadHash?: string;
  processingRequestId?: string;
  processingResult?: unknown;
  createdAt: string;
  /** Stable idempotency metadata for rows originating from a bulk upload. */
  bulkUploadKey?: string | null;
  bulkEntryId?: string | null;
  bulkClusterId?: string | null;
  intakeMode?: "single" | "bulk";
  rawMessage: string;
  subject: string | null;
  classification: TicketRecordClassification | null;
  memoryMatch: TicketRecordMemoryMatch | null;
  draftSource: "ai_advisory" | "deterministic" | "no_template" | null;
  resolution: TicketRecordResolution;
  reflection: TicketRecordReflection;
  validationRecordIds: string[];
  labels?: string[];
  status: TicketRecordStatus;
  /**
   * TODO-026: durable auto-vs-human auditability of a completed resolution.
   * `null`/absent means unresolved or a historical row whose mode was never
   * captured — it must never be treated as a human resolution.
   */
  resolutionMode?: "human" | "automatic" | null;
}

/**
 * RSS-1.2S3 — fields that are exclusively server-owned and must NEVER be
 * accepted from a client ticket write. The server derives every one of these
 * from the authenticated session, the authenticated organization, the
 * deterministic workflow, or the server clock. A client payload containing any
 * of these is rejected with `AUTHORITY_FIELD_REJECTED`.
 */
export const TICKET_AUTHORITY_FIELDS = [
  "actorId",
  "status",
  "resolutionMode",
  "resolution",
  "reflection",
  "classification",
  "memoryMatch",
  "validationRecordIds",
  "labels",
  "draftSource",
  "createdAt",
  "processingIdempotencyKey",
  "processingPayloadHash",
  "processingRequestId",
  "processingResult",
  "intakeMode",
  "bulkClusterId"
] as const;
export type TicketAuthorityField = (typeof TICKET_AUTHORITY_FIELDS)[number];

export const TICKET_CLIENT_FIELDS = [
  "ticketId",
  "orgId",
  "rawMessage",
  "subject",
  "bulkUploadKey",
  "bulkEntryId"
] as const;
export type TicketClientField = (typeof TICKET_CLIENT_FIELDS)[number];

/**
 * RSS-1.2S3 — the only shape a client may write. The server derives every
 * authoritative field (organization, actor, status, timestamps, resolution
 * mode, classification, memory references, review state).
 */
export interface ClientTicketRecord {
  ticketId: string;
  orgId: string;
  rawMessage: string;
  subject: string | null;
  /** Idempotency metadata for rows originating from a bulk upload. */
  bulkUploadKey?: string | null;
  bulkEntryId?: string | null;
}

/** Errors produced by the server-owned ticket write boundary. */
export type TicketWriteErrorCode =
  | "AUTHORITY_FIELD_REJECTED"
  | "CROSS_ORGANIZATION_REJECTED"
  | "TICKET_NOT_FOUND"
  | "INVALID_TRANSITION"
  | "INVALID_TRANSITION_REFERENCE";

export class TicketWriteError extends Error {
  constructor(
    public readonly code: TicketWriteErrorCode,
    message: string,
    public readonly status: 400 | 403 | 404 | 409
  ) {
    super(message);
    this.name = "TicketWriteError";
  }
}

/**
 * RSS-1.2S3 — a server-executed ticket workflow command. The client proposes
 * the transition and the facts it needs; the server validates the transition
 * against the current workflow state and computes every authoritative field.
 */
export type TicketWorkflowCommand =
  | { kind: "attach_analysis"; classification: TicketRecordClassification | null; memoryMatch: TicketRecordMemoryMatch | null; bulkClusterId?: string | null }
  | { kind: "approve"; finalResponse: string; humanEdited: boolean }
  | { kind: "discard" }
  | { kind: "reinstate" }
  | { kind: "language"; language: string }
  | {
      kind: "commit";
      validationRecordIds: string[];
      knowledgeId: string | null;
      action: string;
      lessonCreatedId?: string | null;
      lessonReinforcedId?: string | null;
      knowledgeChanged?: string | null;
      finalResponse?: string;
      automatic?: boolean;
      classification?: TicketRecordClassification | null;
      memoryMatch?: TicketRecordMemoryMatch | null;
    };

export interface BulkTicketSeed {
  uploadKey: string;
  entryId: string;
  rawMessage: string;
  subject: string | null;
}

export type TicketRecordFilter =
  | "all"
  | "heavily_edited"
  | "cold_start"
  | "uncategorized"
  | "rejected"
  | "discarded";

export interface TicketPageRequest {
  page: number;
  pageSize: number;
  search?: string;
  filter?: TicketRecordFilter;
}

export interface TicketPage {
  tickets: TicketRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
