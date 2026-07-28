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

export interface TicketRecordMemoryMatch {
  knowledgeId: string | null;
  matchType: "lesson" | "template" | "none";
  lessonId: string | null;
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
  createdAt: string;
  rawMessage: string;
  subject: string | null;
  classification: TicketRecordClassification | null;
  memoryMatch: TicketRecordMemoryMatch | null;
  draftSource: "ai_advisory" | "deterministic" | "no_template" | null;
  resolution: TicketRecordResolution;
  reflection: TicketRecordReflection;
  validationRecordIds: string[];
  status: TicketRecordStatus;
  /**
   * TODO-026: durable auto-vs-human auditability of a completed resolution.
   * `null`/absent means unresolved or a historical row whose mode was never
   * captured — it must never be treated as a human resolution.
   */
  resolutionMode?: "human" | "automatic" | null;
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
