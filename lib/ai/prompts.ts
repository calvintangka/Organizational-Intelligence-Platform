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
  const emailRecoveryGuardrails =
    input.deterministicUnderstanding.intent === "email_recovery"
      ? [
          "IMPORTANT: The customer forgot the account email or login identifier.",
          "Do not turn this into a password-reset issue.",
          "Focus on account verification and identifying the correct login email.",
          "If password reset is mentioned at all, present it only as a later step after the correct account email is identified."
        ]
      : [];
  const activationGuardrails =
    input.deterministicUnderstanding.category === "Activation"
      ? [
          "IMPORTANT: This is an activation issue.",
          "Keep the response focused on activation code troubleshooting and verification only.",
          "Do not mention login, password reset, credentials, or account email recovery."
        ]
      : [];

  if (input.groundingMode === "cold_start") {
    return {
      system: [
        advisorSystemPrompt,
        "Return compact JSON only.",
        "Do not include markdown, chain-of-thought, or explanations outside the JSON object.",
        "Keep the customer response concise and customer-facing.",
        ...emailRecoveryGuardrails,
        ...activationGuardrails
      ].join(" "),
      user: [
        `Organization Name: ${input.organizationProfile.name}`,
        `Ticket: ${input.ticket.subject} - ${input.ticket.description}`,
        `Deterministic Category: ${input.deterministicUnderstanding.category}`,
        `Deterministic Intent: ${input.deterministicUnderstanding.intent ?? "unspecified"}`,
        "No validated organizational knowledge exists for this issue.",
        'Respond with compact JSON only: {"customerResponse":"", "confidence":90, "rationale":""}'
      ].join("\n")
    };
  }

  if (input.groundingMode === "lesson_grounded" && input.lessonGrounding) {
    return {
      system: [
        advisorSystemPrompt,
        "Return compact JSON only.",
        "Adapt the validated lesson response to the customer's wording without adding new steps.",
        "Do not include internal guidance or troubleshooting rationale in the customer response.",
        ...emailRecoveryGuardrails,
        ...activationGuardrails
      ].join(" "),
      user: [
        profileContext(input.organizationProfile, input.canonicalProblemTitle),
        `Customer Ticket Subject: ${input.ticket.subject}`,
        `Customer Ticket Description: ${input.ticket.description}`,
        `Deterministic Category: ${input.deterministicUnderstanding.category}`,
        `Deterministic Intent: ${input.deterministicUnderstanding.intent ?? "unspecified"}`,
        `Validated Lesson: ${input.groundingLabel}`,
        "Customer response source:",
        input.lessonGrounding.customerResponse,
        'Respond with compact JSON only: {"customerResponse":"", "confidence":90, "rationale":""}'
      ].join("\n")
    };
  }

  return {
    system: [
      advisorSystemPrompt,
      "Return compact JSON only.",
      "Personalize the provided customer response template to the customer's wording without adding new steps.",
      "Preserve all safety caveats and verification steps already present in the template.",
      "Do not include internal guidance or troubleshooting rationale in the customer response.",
      ...emailRecoveryGuardrails,
      ...activationGuardrails,
      "If the customer's issue is not addressed by the template, say the response needs human attention — do not improvise."
    ].join(" "),
    user: [
      profileContext(input.organizationProfile, input.canonicalProblemTitle),
      "",
      `Customer Ticket Subject: ${input.ticket.subject}`,
      `Customer Ticket Description: ${input.ticket.description}`,
      `Deterministic Category: ${input.deterministicUnderstanding.category}`,
      `Deterministic Intent: ${input.deterministicUnderstanding.intent ?? "unspecified"}`,
      "",
      "Validated Customer Response Template (your ONLY source of content — do not add steps not present here):",
      input.groundingContent || input.deterministicDraft,
      "",
      "",
      'Respond with compact JSON only: {"customerResponse":"", "confidence":90, "rationale":""}'
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
