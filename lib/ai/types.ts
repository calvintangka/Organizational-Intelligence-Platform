import type {
  AIDiagnostics,
  AIAnalysisSuggestion,
  AICanonicalProblemSuggestion,
  AICustomerResponseSuggestion,
  DraftGroundingMode,
  AIKnowledgeEnrichment,
  AIPatternSuggestion,
  AIProviderMode,
  MatchDiscriminationResult,
  KnowledgeItem,
  KnowledgeMatch,
  OrganizationProfile,
  Ticket
} from "@/types";
import type { Understanding } from "@/types/oip";

export interface AIConfig {
  mode: AIProviderMode;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  proxyPath: string;
}

export interface AIProviderResult<T> {
  ok: boolean;
  providerMode: AIProviderMode;
  providerLabel: string;
  model?: string;
  latencyMs: number;
  data?: T;
  error?: string;
  diagnostics?: AIDiagnostics;
}

export interface AnalyzeTicketInput {
  ticket: Ticket;
  organizationProfile: OrganizationProfile;
  deterministicUnderstanding: Understanding;
}

export interface CanonicalProblemInput {
  ticket: Ticket;
  organizationProfile: OrganizationProfile;
  deterministicUnderstanding: Understanding;
  deterministicCanonicalProblem: {
    title: string;
    summary: string;
    category: string;
  };
}

export interface PatternNameInput {
  ticket: Ticket;
  organizationProfile: OrganizationProfile;
  deterministicUnderstanding: Understanding;
  deterministicPatternTitle: string;
  patternSummary: string;
}

export interface KnowledgeEnrichmentInput {
  ticket: Ticket;
  organizationProfile: OrganizationProfile;
  deterministicUnderstanding: Understanding;
  canonicalProblemTitle: string;
  matchedKnowledge: KnowledgeMatch | null;
}

export interface MatchDiscriminationInput {
  ticket: Ticket;
  /** Title of the candidate canonical problem from organizational memory */
  matchedCanonicalTitle: string;
  /** Core problem statement of the matched item — NOT the solution or template */
  matchedProblemSummary: string;
  deterministicUnderstanding: Understanding;
}

export interface DraftCustomerResponseInput {
  ticket: Ticket;
  organizationProfile: OrganizationProfile;
  deterministicUnderstanding: Understanding;
  canonicalProblemTitle: string;
  groundingMode: DraftGroundingMode;
  groundingLabel: string;
  groundingContent: string;
  lessonGrounding?: {
    rootCause: string;
    solution: string;
    customerResponse: string;
    matchedSignals: string[];
  };
  /** The raw validated customer response template used as grounding source */
  deterministicDraft: string;
  matchedKnowledge: KnowledgeMatch | null;
}

export interface AIProvider {
  readonly mode: AIProviderMode;
  readonly label: string;
  analyzeTicket(input: AnalyzeTicketInput): Promise<AIProviderResult<AIAnalysisSuggestion>>;
  suggestCanonicalProblem(input: CanonicalProblemInput): Promise<AIProviderResult<AICanonicalProblemSuggestion>>;
  suggestPatternName(input: PatternNameInput): Promise<AIProviderResult<AIPatternSuggestion>>;
  enrichKnowledge(input: KnowledgeEnrichmentInput): Promise<AIProviderResult<AIKnowledgeEnrichment>>;
  draftCustomerResponse(input: DraftCustomerResponseInput): Promise<AIProviderResult<AICustomerResponseSuggestion>>;
  /** Ask whether the ticket describes the SAME underlying problem as a matched memory item,
   *  or a DISTINCT problem. Used to prevent false-positive memory matches. */
  discriminateMatch(input: MatchDiscriminationInput): Promise<AIProviderResult<MatchDiscriminationResult>>;
}

export interface AIAdapter {
  readonly config: AIConfig;
  readonly provider: AIProvider;
}
