import type {
  AIDiagnostics,
  AIAdvisory,
  AIAdvisoryStatus,
  AIAnalysisSuggestion,
  AICanonicalProblemSuggestion,
  AICustomerResponseSuggestion,
  AIKnowledgeEnrichment,
  AIPatternSuggestion,
  AIProviderMode
} from "@/types";

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

export function calculateAgreement(deterministicLabel: string, aiLabel: string): number {
  if (!aiLabel.trim()) return 0;
  if (deterministicLabel.trim().toLowerCase() === aiLabel.trim().toLowerCase()) return 98;

  const left = new Set(tokenize(deterministicLabel));
  const right = new Set(tokenize(aiLabel));
  if (left.size === 0 || right.size === 0) return 40;

  const overlap = [...left].filter((token) => right.has(token));
  const union = new Set([...left, ...right]).size;
  const jaccard = union > 0 ? overlap.length / union : 0;

  if (jaccard >= 0.75) return 92;
  if (jaccard >= 0.5) return 81;
  if (jaccard >= 0.25) return 67;
  if (overlap.length > 0) return 55;
  return 34;
}

export function deriveAdvisoryStatus(
  mode: AIProviderMode,
  available: boolean,
  agreementPct: number
): AIAdvisoryStatus {
  if (mode === "disabled") return "disabled";
  if (!available) return "unavailable";
  if (agreementPct >= 85) return "verified";
  if (agreementPct >= 70) return "advisory_only";
  return "needs_human_review";
}

export function shouldAcceptPatternSuggestion(
  deterministicTitle: string,
  suggestion: AIPatternSuggestion | undefined
): boolean {
  if (!suggestion?.title.trim()) return false;
  const title = suggestion.title.trim();
  if (title.toLowerCase() === deterministicTitle.trim().toLowerCase()) return false;
  if (title.length < 6 || title.length > 80) return false;
  if (/(internal|policy|trust|memory)/i.test(title)) return false;

  const overlap = calculateAgreement(deterministicTitle, title);
  return overlap >= 55 && suggestion.confidence >= 60;
}

export function shouldUseAIDraft(
  deterministicDraft: string,
  suggestion: AICustomerResponseSuggestion | undefined
): boolean {
  if (!suggestion?.draftResponse.trim()) return false;
  if (suggestion.confidence < 60) return false;
  const draft = suggestion.draftResponse.toLowerCase();
  if (draft.includes("internal guidance") || draft.includes("root cause hypothesis")) return false;
  return deterministicDraft.trim().toLowerCase() !== suggestion.draftResponse.trim().toLowerCase();
}

export function buildAIAdvisory(input: {
  ticketId: string;
  providerMode: AIProviderMode;
  providerLabel: string;
  model?: string;
  diagnostics?: Partial<AIDiagnostics>;
  deterministicLabel: string;
  analysisSuggestion?: AIAnalysisSuggestion;
  canonicalSuggestion?: AICanonicalProblemSuggestion;
  responseSuggestion?: AICustomerResponseSuggestion;
  knowledgeEnrichment?: AIKnowledgeEnrichment;
  patternSuggestion?: AIPatternSuggestion;
  availabilityMessage?: string;
}): AIAdvisory {
  const aiLabel =
    input.canonicalSuggestion?.title ||
    input.analysisSuggestion?.category ||
    input.patternSuggestion?.title ||
    input.availabilityMessage ||
    "No AI suggestion";
  const agreementPct = calculateAgreement(input.deterministicLabel, aiLabel);
  const available = !input.availabilityMessage;
  const confidencePct =
    input.canonicalSuggestion?.confidence ??
    input.analysisSuggestion?.confidence ??
    input.responseSuggestion?.confidence ??
    input.patternSuggestion?.confidence ??
    input.knowledgeEnrichment?.confidence ??
    0;

  return {
    ticketId: input.ticketId,
    providerMode: input.providerMode,
    providerLabel: input.providerLabel,
    model: input.model,
    diagnostics: {
      mode: input.providerMode,
      provider: input.providerLabel,
      model: input.model,
      proxyPath: input.diagnostics?.proxyPath ?? "/api/ai/chat",
      serverBaseUrl: input.diagnostics?.serverBaseUrl,
      endpointUsed: input.diagnostics?.endpointUsed,
      proxySucceeded: input.diagnostics?.proxySucceeded,
      fallbackReason: input.diagnostics?.fallbackReason ?? input.availabilityMessage,
      attempts: input.diagnostics?.attempts
    },
    deterministicLabel: input.deterministicLabel,
    aiLabel,
    agreementPct,
    confidencePct,
    status: deriveAdvisoryStatus(input.providerMode, available, agreementPct),
    availabilityMessage: input.availabilityMessage,
    fallbackUsed: !!input.availabilityMessage,
    analysisSuggestion: input.analysisSuggestion,
    canonicalSuggestion: input.canonicalSuggestion,
    responseSuggestion: input.responseSuggestion,
    knowledgeEnrichment: input.knowledgeEnrichment,
    patternSuggestion: input.patternSuggestion
  };
}
