import type { OrganizationProfile } from "@/types";
import type {
  AnalyzeTicketInput,
  CanonicalProblemInput,
  DraftCustomerResponseInput,
  KnowledgeEnrichmentInput,
  MatchDiscriminationInput,
  PatternNameInput
} from "@/lib/ai/types";

export interface PromptBundle {
  system: string;
  user: string;
}

function profileContext(profile: OrganizationProfile, canonicalProblemTitle?: string): string {
  return [
    `Organization Name: ${profile.name}`,
    `Industry: ${profile.industry}`,
    `Description: ${profile.description}`,
    `Products: ${profile.products.join(", ") || "none"}`,
    `Services: ${profile.services.join(", ") || "none"}`,
    `Supported Domains: ${profile.supportedDomains.join(", ") || "none"}`,
    `Business Vocabulary: ${profile.businessVocabulary.join(", ") || "none"}`,
    `Supported Issue Types: ${profile.supportedIssueTypes.join(", ") || "none"}`,
    `Customer Tone: ${profile.customerTone}`,
    `Support Boundaries: ${profile.supportBoundaries.join(" | ") || "none"}`,
    canonicalProblemTitle ? `Canonical Problem: ${canonicalProblemTitle}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

const advisorSystemPrompt = [
  "You are an advisory AI inside an Organizational Intelligence Platform.",
  "You are not the decision maker.",
  "Never decide business relevance, trust, approval, escalation policy, governance, metrics, auto-resolution, or memory updates.",
  "Return valid JSON only with no markdown fences."
].join(" ");

export function buildAnalyzeTicketPrompt(input: AnalyzeTicketInput): PromptBundle {
  return {
    system: advisorSystemPrompt,
    user: [
      profileContext(input.organizationProfile),
      "",
      `Original Ticket Subject: ${input.ticket.subject}`,
      `Original Ticket Description: ${input.ticket.description}`,
      "",
      "Deterministic understanding for comparison:",
      JSON.stringify({
        summary: input.deterministicUnderstanding.summary,
        category: input.deterministicUnderstanding.category,
        urgency: input.deterministicUnderstanding.urgency,
        tags: input.deterministicUnderstanding.tags,
        detectedSignals: input.deterministicUnderstanding.detectedSignals
      }),
      "",
      'Respond with JSON: {"summary":"", "category":"", "urgency":"low|medium|high", "entities":[""], "tags":[""], "confidence":0-100, "rationale":""}'
    ].join("\n")
  };
}

export function buildCanonicalProblemPrompt(input: CanonicalProblemInput): PromptBundle {
  return {
    system: advisorSystemPrompt,
    user: [
      profileContext(input.organizationProfile, input.deterministicCanonicalProblem.title),
      "",
      `Ticket Subject: ${input.ticket.subject}`,
      `Ticket Description: ${input.ticket.description}`,
      "",
      "Deterministic understanding:",
      JSON.stringify({
        category: input.deterministicUnderstanding.category,
        summary: input.deterministicUnderstanding.summary,
        tags: input.deterministicUnderstanding.tags
      }),
      "",
      "Deterministic canonical problem:",
      JSON.stringify(input.deterministicCanonicalProblem),
      "",
      'Respond with JSON: {"title":"", "confidence":0-100, "rationale":""}'
    ].join("\n")
  };
}

export function buildPatternNamePrompt(input: PatternNameInput): PromptBundle {
  return {
    system: advisorSystemPrompt,
    user: [
      profileContext(input.organizationProfile),
      "",
      `Ticket Subject: ${input.ticket.subject}`,
      `Ticket Description: ${input.ticket.description}`,
      `Deterministic Pattern Title: ${input.deterministicPatternTitle}`,
      `Pattern Summary: ${input.patternSummary}`,
      `Deterministic Category: ${input.deterministicUnderstanding.category}`,
      "",
      'Respond with JSON: {"title":"", "confidence":0-100, "rationale":""}'
    ].join("\n")
  };
}

export function buildKnowledgeEnrichmentPrompt(input: KnowledgeEnrichmentInput): PromptBundle {
  return {
    system: advisorSystemPrompt,
    user: [
      profileContext(input.organizationProfile, input.canonicalProblemTitle),
      "",
      `Ticket Subject: ${input.ticket.subject}`,
      `Ticket Description: ${input.ticket.description}`,
      `Deterministic Summary: ${input.deterministicUnderstanding.summary}`,
      `Matched Knowledge: ${input.matchedKnowledge?.item.title ?? "none"}`,
      `Internal Guidance: ${input.matchedKnowledge?.item.internalGuidance ?? "none"}`,
      "",
      'Respond with JSON: {"internalGuidance":[""], "troubleshootingChecklist":[""], "rootCauseHypotheses":[""], "preventiveActions":[""], "confidence":0-100}'
    ].join("\n")
  };
}

export function buildDraftCustomerResponsePrompt(input: DraftCustomerResponseInput): PromptBundle {
  if (input.groundingMode === "cold_start") {
    return {
      system: [
        advisorSystemPrompt,
        "You do not know this company's specific policies or systems. Do not invent specifics. Ask for information a support agent would genuinely need.",
        "Do not include reasoning, thinking, analysis, or explanations.",
        "Draft 2 short customer-facing sentences. Acknowledge the issue and ask for needed account details. Return JSON only."
      ].join(" "),
      user: [
        `Organization Name: ${input.organizationProfile.name}`,
        "",
        `Ticket: ${input.ticket.subject} - ${input.ticket.description}`,
        "",
        "No validated organizational knowledge exists for this issue.",
        "",
        'Respond with JSON: {"draftResponse":"", "confidence":0-100, "rationale":""}'
      ].join("\n")
    };
  }

  if (input.groundingMode === "lesson_grounded" && input.lessonGrounding) {
    return {
      system: [
        advisorSystemPrompt,
        "Your task is to adapt a validated lesson response to the customer's exact wording.",
        "STRICT RULES: Do not add resolution steps absent from the lesson.",
        "Do not remove caveats, verification steps, or uncertainty from the lesson.",
        "Do not introduce company-specific facts beyond the lesson and profile context.",
        "Do not use internal guidance labels or troubleshooting rationale in the customer-facing output."
      ].join(" "),
      user: [
        profileContext(input.organizationProfile, input.canonicalProblemTitle),
        "",
        `Customer Ticket Subject: ${input.ticket.subject}`,
        `Customer Ticket Description: ${input.ticket.description}`,
        `Deterministic Intent: ${input.deterministicUnderstanding.intent ?? "unspecified"}`,
        "",
        `Validated Lesson: ${input.groundingLabel}`,
        `Root Cause: ${input.lessonGrounding.rootCause}`,
        `Solution: ${input.lessonGrounding.solution}`,
        `Matched Signals: ${input.lessonGrounding.matchedSignals.join(", ") || "none"}`,
        "",
        "Validated Lesson Customer Response (your ONLY source of resolution content):",
        input.lessonGrounding.customerResponse,
        "",
        "Adapt the lesson response to acknowledge the customer's specific situation. Preserve all caveats and limits.",
        "",
        'Respond with JSON: {"draftResponse":"", "confidence":0-100, "rationale":""}'
      ].join("\n")
    };
  }

  return {
    system: [
      advisorSystemPrompt,
      "Your task is to personalize the provided customer response template to acknowledge the customer's specific situation.",
      "STRICT RULES: Do not add resolution steps that are not already in the template.",
      "Do not remove safety caveats or identity-verification steps from the template.",
      "Do not introduce any facts or instructions that are absent from the template.",
      "Do not use internal guidance labels or troubleshooting rationale in the customer-facing output.",
      "If the customer's issue is not addressed by the template, say the response needs human attention — do not improvise."
    ].join(" "),
    user: [
      profileContext(input.organizationProfile, input.canonicalProblemTitle),
      "",
      `Customer Ticket Subject: ${input.ticket.subject}`,
      `Customer Ticket Description: ${input.ticket.description}`,
      `Deterministic Intent: ${input.deterministicUnderstanding.intent ?? "unspecified"}`,
      "",
      "Validated Customer Response Template (your ONLY source of content — do not add steps not present here):",
      input.groundingContent || input.deterministicDraft,
      "",
      "Personalize the template to acknowledge the customer's specific situation described above.",
      "Keep all steps, caveats, and safety instructions intact. Only adapt wording and ordering.",
      "",
      'Respond with JSON: {"draftResponse":"", "confidence":0-100, "rationale":""}'
    ].join("\n")
  };
}

export function buildMatchDiscriminationPrompt(input: MatchDiscriminationInput): PromptBundle {
  return {
    system: [
      advisorSystemPrompt,
      "You are performing match discrimination: deciding whether a customer ticket describes the SAME underlying problem as a known canonical problem in organizational memory, or a DISTINCT problem that should be treated separately.",
      "You are NOT choosing a solution. Do not mention solutions, templates, or guidance.",
      "Focus only on the nature of the problem, not the resolution."
    ].join(" "),
    user: [
      `Ticket Subject: ${input.ticket.subject}`,
      `Ticket Description: ${input.ticket.description}`,
      "",
      `Candidate Canonical Problem from Memory:`,
      `  Title: ${input.matchedCanonicalTitle}`,
      `  Problem Summary: ${input.matchedProblemSummary}`,
      "",
      "Question: Does the customer's ticket describe the SAME underlying problem as the canonical problem above, or a DISTINCT problem?",
      "",
      "Consider:",
      "- Same: The customer has the exact issue the canonical problem describes.",
      "- Distinct: The customer's issue is superficially similar (e.g., shares vocabulary) but is fundamentally different.",
      "",
      'Respond with JSON only: {"isDistinctFromMatch":true|false,"confidence":"high"|"medium"|"low","reasoning":"one sentence explaining why"}'
    ].join("\n")
  };
}
