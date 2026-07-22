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
