import type { ExtractedTicketFields } from "./oip";

export interface AIAnalysis {
  ticketId: string;
  summary: string;
  coreProblem: string;
  category: string;
  intent?: string;
  urgency: "low" | "medium" | "high";
  suggestedTags: string[];
  detectedSignals?: string[];
  extractedFields?: ExtractedTicketFields;
}

export type DraftGroundingMode = "lesson_grounded" | "memory_grounded" | "cold_start";

export interface SuggestedResponse {
  ticketId: string;
  draftResponse: string;
  basedOnKnowledgeIds: string[];
  confidenceNote: string;
  source?: "deterministic" | "ai_advisory" | "no_template";
  draftMode?: DraftGroundingMode;
  groundingLabel?: string;
  fallbackNotice?: string;
  fallbackTechnicalDetails?: string;
  /** Which AI provider produced this draft (e.g. "LM Studio", "Claude API"). */
  providerLabel?: string;
  /** Raw validated template used as the grounding input for the AI-personalized draft.
   *  Present only when source === "ai_advisory" so human review can compare both. */
  deterministicDraft?: string;
}

export interface MatchDiscriminationResult {
  isDistinctFromMatch: boolean;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

export type AIProviderMode = "disabled" | "lmstudio" | "claude" | "amd";
export type AIAdvisoryStatus = "verified" | "advisory_only" | "needs_human_review" | "unavailable" | "disabled";

export interface AIDiagnostics {
  mode: AIProviderMode;
  provider: string;
  model?: string;
  proxyPath: string;
  serverBaseUrl?: string;
  endpointUsed?: string;
  proxySucceeded?: boolean;
  fallbackReason?: string;
}

export interface AIAnalysisSuggestion {
  summary: string;
  category: string;
  urgency: "low" | "medium" | "high";
  entities: string[];
  tags: string[];
  confidence: number;
  rationale?: string;
  extractedFields?: ExtractedTicketFields;
}

export interface AICanonicalProblemSuggestion {
  title: string;
  confidence: number;
  rationale?: string;
}

export interface AIPatternSuggestion {
  title: string;
  confidence: number;
  rationale?: string;
  accepted?: boolean;
}

export interface AIKnowledgeEnrichment {
  internalGuidance: string[];
  troubleshootingChecklist: string[];
  rootCauseHypotheses: string[];
  preventiveActions: string[];
  confidence: number;
}

export interface AICustomerResponseSuggestion {
  draftResponse: string;
  confidence: number;
  rationale?: string;
  groundingMode?: DraftGroundingMode;
  groundingLabel?: string;
}

export interface AIAdvisory {
  ticketId: string;
  providerMode: AIProviderMode;
  providerLabel: string;
  model?: string;
  diagnostics: AIDiagnostics;
  deterministicLabel: string;
  aiLabel: string;
  agreementPct: number;
  confidencePct: number;
  status: AIAdvisoryStatus;
  availabilityMessage?: string;
  fallbackUsed: boolean;
  analysisSuggestion?: AIAnalysisSuggestion;
  canonicalSuggestion?: AICanonicalProblemSuggestion;
  patternSuggestion?: AIPatternSuggestion;
  knowledgeEnrichment?: AIKnowledgeEnrichment;
  responseSuggestion?: AICustomerResponseSuggestion;
}
