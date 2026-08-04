export interface Observation {
  ticketId: string;
  originalText: string;
  source: "manual-demo-input" | "seed-ticket";
  createdAt: string;
  preservedOriginalText: string;
}

export interface ExtractedTicketFields {
  senderName: string | null;
  senderRole: string | null;
  companyName: string | null;
  deadline: string | null;
  subIssues: string[];
  urgencyIndicators: string[];
}

export type BusinessIntent = "product_information" | "company_information" | "general_business_inquiry" | "multilingual_support";

export interface BusinessIntentClassification {
  inquiryType: "operational_support" | "business_inquiry";
  intent: BusinessIntent | "operational_support";
  confidence: "high" | "medium" | "low";
  signals: string[];
}

export interface Understanding {
  ticketId: string;
  /** Original subject/description retained for deterministic relevance scoring. */
  originalText?: string;
  summary: string;
  coreProblem: string;
  category: string;
  intent?: string;
  urgency: "low" | "medium" | "high";
  tags: string[];
  detectedSignals: string[];
  extractedFields: ExtractedTicketFields;
  businessClassification?: BusinessIntentClassification;
  /** Deterministic sentence-level isolation used by retrieval and drafting. */
  intentIsolation?: import("@/lib/intentIsolation").IntentIsolationResult;
  /** Retrieval text excludes quoted, negated, and resolved-history material. */
  retrievalText?: string;
  ignoredTopics?: string[];
}

export interface ReasoningSummary {
  ticketId: string;
  understood: string;
  relevantMemory: string | null;
  relevanceReason: string | null;
  uncertainty: string;
  humanReviewRationale: string;
}

export interface Confidence {
  level: "low" | "medium" | "high";
  score: number;
  basis: string[];
  uncertainty: string[];
}

export interface BusinessRelevance {
  isRelevant: boolean;
  status: "relevant" | "out_of_scope" | "uncertain";
  supportedDomain: string;
  organizationName?: string;
  reason: string;
  matchedBusinessSignals: string[];
  detectedOutOfScopeSignals: string[];
  recommendedAction: "continue" | "dismiss" | "ask_clarifying_question";
}

export interface BusinessDomainClassification {
  ticketId: string;
  domains: string[];
  primaryDomain: string;
  confidence: "high" | "medium" | "low";
  organizationName: string;
  reason: string;
}

export interface IntelligenceLogEntry {
  id: string;
  timestamp: string;
  event: string;
  detail?: string;
}
