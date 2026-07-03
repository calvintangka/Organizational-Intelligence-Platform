export interface Observation {
  ticketId: string;
  originalText: string;
  source: "manual-demo-input" | "seed-ticket";
  createdAt: string;
  preservedOriginalText: string;
}

export interface Understanding {
  ticketId: string;
  summary: string;
  coreProblem: string;
  category: string;
  intent?: string;
  urgency: "low" | "medium" | "high";
  tags: string[];
  detectedSignals: string[];
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
