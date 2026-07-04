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

function firstName(value: string): string {
  return value.trim().split(/\s+/)[0] ?? value.trim();
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

function toneInstruction(profile: OrganizationProfile): string {
  switch (profile.customerTone) {
    case "friendly":
      return "Tone rule: Friendly. Use warm, approachable language and a first-name greeting when a sender name is available, while staying concise and professional.";
    case "formal":
      return "Tone rule: Formal. Use formal salutations, polished business phrasing, and avoid casual wording or contractions-heavy style.";
    case "empathetic":
      return "Tone rule: Empathetic. Acknowledge friction or urgency with warm, reassuring language, but stay precise and professional.";
    case "professional":
    default:
      return "Tone rule: Professional. Use clear business language, professional salutations, and avoid slang or overly casual phrasing.";
  }
}

function preferredGreeting(profile: OrganizationProfile, senderName: string | null): string {
  if (!senderName) return "Hello,";

  switch (profile.customerTone) {
    case "friendly":
    case "empathetic":
      return `Hi ${firstName(senderName)},`;
    case "formal":
      return `Dear ${senderName},`;
    case "professional":
    default:
      return `Hello ${senderName},`;
  }
}

function noUnvalidatedCommitmentsRule(input: DraftCustomerResponseInput): string[] {
  const groundedMode = input.groundingMode === "lesson_grounded" || input.groundingMode === "memory_grounded";
  return [
    "NO-UNVALIDATED-COMMITMENTS RULE:",
    "Never invent organizational processes, teams, or roles. Do not mention a billing support team, specialist, escalation, handoff, or similar process unless it is explicitly present in the grounding content.",
    groundedMode
      ? "Grounded modes: commitments already present in the validated lesson or template may be stated directly, but do not add any new commitments beyond that content."
      : "Cold-start mode: all outcome language must remain conditional, and information-gathering is preferred over promises.",
    "Never state outcomes as approved or guaranteed before validation. Refunds, credits, corrections, and extensions must be phrased conditionally unless the validated grounding content already states them directly.",
    "Never commit to timelines such as 'within 24 hours' or 'shortly' unless that timeline appears in the validated grounding content."
  ];
}

function draftStructureInstructions(input: DraftCustomerResponseInput): string[] {
  const fields = input.deterministicUnderstanding.extractedFields;
  const greeting = preferredGreeting(input.organizationProfile, fields.senderName);
  const subIssues = fields.subIssues.length > 0 ? fields.subIssues : ["Address the customer's issue directly."];
  const deadlineInstruction = fields.deadline
    ? `Acknowledgment must mention the extracted deadline or time pressure: ${fields.deadline}.`
    : "If no deadline is extracted, acknowledge the customer's situation without inventing one.";

  return [
    "REQUIRED RESPONSE STRUCTURE:",
    `1. Greeting line must use this structure: ${greeting} If no sender name is extracted, use "Hello," and never use "Demo User".`,
    `2. Add a short acknowledgment that reflects the customer's actual situation. ${deadlineInstruction}`,
    `3. Address each extracted sub-issue separately and in order. Current sub-issues: ${subIssues.map((issue, index) => `${index + 1}. ${issue}`).join(" | ")}.`,
    `4. Close with only the next steps the customer can actually take, then sign off as "${input.organizationProfile.name} Support Team".`
  ];
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
        intent: input.deterministicUnderstanding.intent,
        urgency: input.deterministicUnderstanding.urgency,
        tags: input.deterministicUnderstanding.tags,
        detectedSignals: input.deterministicUnderstanding.detectedSignals,
        extractedFields: input.deterministicUnderstanding.extractedFields
      }),
      "",
      "Extract structured customer-context fields when they are clearly present in the ticket. Every field is nullable and missing data must stay null or [].",
      "Extraction hints:",
      "- senderName, senderRole, and companyName often appear in the signature block after Regards / Best regards / Sincerely.",
      "- deadline should preserve the customer wording, such as 'this Friday because our tax filing is due then'.",
      "- subIssues should list each distinct customer problem separately and in order.",
      "- urgencyIndicators should capture phrases like 'urgent' or deadline pressure.",
      'Respond with JSON: {"summary":"", "category":"", "urgency":"low|medium|high", "entities":[""], "tags":[""], "confidence":0-100, "rationale":"", "extractedFields":{"senderName":null,"senderRole":null,"companyName":null,"deadline":null,"subIssues":[],"urgencyIndicators":[]}}'
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
  const fields = input.deterministicUnderstanding.extractedFields;
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
  const sharedSystemRules = [
    advisorSystemPrompt,
    "Return compact JSON only.",
    "Do not include markdown, chain-of-thought, or explanations outside the JSON object.",
    "Keep the customer response concise and customer-facing.",
    "Keep customerResponse under 140 words, using short sentences and only the details needed by the customer.",
    toneInstruction(input.organizationProfile),
    ...draftStructureInstructions(input),
    ...noUnvalidatedCommitmentsRule(input),
    ...emailRecoveryGuardrails,
    ...activationGuardrails
  ];
  const extractedFieldSummary = JSON.stringify(fields);

  if (input.groundingMode === "cold_start") {
    const ticketRefLine = input.ticket.ticketId
      ? `Include this ticket reference in the closing: "${input.ticket.ticketId}".`
      : "";
    return {
      system: sharedSystemRules.join(" "),
      user: [
        `Organization Name: ${input.organizationProfile.name}`,
        `Ticket: ${input.ticket.subject} - ${input.ticket.description}`,
        `Deterministic Category: ${input.deterministicUnderstanding.category}`,
        `Deterministic Intent: ${input.deterministicUnderstanding.intent ?? "unspecified"}`,
        `Extracted Ticket Fields: ${extractedFieldSummary}`,
        "No validated organizational knowledge exists for this issue.",
        ticketRefLine,
        'Respond with compact JSON only: {"customerResponse":"", "confidence":90}'
      ].filter(Boolean).join("\n")
    };
  }

  if (input.groundingMode === "lesson_grounded" && input.lessonGrounding) {
    return {
      system: [
        ...sharedSystemRules,
        "Adapt the validated lesson response to the customer's wording without adding new steps.",
        "Do not include internal guidance or troubleshooting rationale in the customer response."
      ].join(" "),
      user: [
        profileContext(input.organizationProfile, input.canonicalProblemTitle),
        `Customer Ticket Subject: ${input.ticket.subject}`,
        `Customer Ticket Description: ${input.ticket.description}`,
        `Deterministic Category: ${input.deterministicUnderstanding.category}`,
        `Deterministic Intent: ${input.deterministicUnderstanding.intent ?? "unspecified"}`,
        `Extracted Ticket Fields: ${extractedFieldSummary}`,
        `Validated Lesson: ${input.groundingLabel}`,
        "Customer response source:",
        input.lessonGrounding.customerResponse,
        'Respond with compact JSON only: {"customerResponse":"", "confidence":90}'
      ].join("\n")
    };
  }

  return {
    system: [
      ...sharedSystemRules,
      "Personalize the provided customer response template to the customer's wording without adding new steps.",
      "Preserve all safety caveats and verification steps already present in the template.",
      "Do not include internal guidance or troubleshooting rationale in the customer response.",
      "If the customer's issue is not addressed by the template, say the response needs human attention - do not improvise."
    ].join(" "),
    user: [
      profileContext(input.organizationProfile, input.canonicalProblemTitle),
      "",
      `Customer Ticket Subject: ${input.ticket.subject}`,
      `Customer Ticket Description: ${input.ticket.description}`,
      `Deterministic Category: ${input.deterministicUnderstanding.category}`,
      `Deterministic Intent: ${input.deterministicUnderstanding.intent ?? "unspecified"}`,
      `Extracted Ticket Fields: ${extractedFieldSummary}`,
      "",
      "Validated Customer Response Template (your ONLY source of content - do not add steps not present here):",
      input.groundingContent || input.deterministicDraft,
      "",
      'Respond with compact JSON only: {"customerResponse":"", "confidence":90}'
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
      "Candidate Canonical Problem from Memory:",
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
