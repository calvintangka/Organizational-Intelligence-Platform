import type { LessonDraft } from "@/types";

export interface ReflectionSafetyContext {
  customerName?: string;
  organizationName?: string;
  sourceTicketId?: string;
  sourceTicketText?: string;
  /** Additional source identities extracted from the ticket (for example an affected employee). */
  sourceSpecificValues?: string[];
  /** The human-authored canonical problem title is reusable content too. */
  reusableProblemName?: string;
}

export interface ReflectionSafetyResult {
  safe: boolean;
  issues: string[];
}

const UNSAFE_CONTENT_RULES: Array<[string, RegExp]> = [
  ["email address", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ["phone number", /(?:\+?\d[\d\s().-]{7,}\d)/],
  ["date", /\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/. -]\d{1,2}[/. -]\d{2,4})\b/],
  ["secret or credential", /\b(?:password|passwd|secret|api[\s_-]*key|access[\s_-]*token|bearer)\s*[:=]\s*\S+/i],
  ["ticket or case identifier", /\b(?:[A-Z]{2,6}-\d{6,}(?:-\d+)?|[0-9a-f]{8}-[0-9a-f-]{27,})\b/i],
  ["ticket or case number", /\b(?:ticket|case|incident|request|order)\s*(?:id|number|no\.?|#)?\s*[:#-]?\s*\d{4,}\b/i],
  ["temporary workaround", /\b(?:temporary|temporarily|one[- ]time|for now|until further notice|workaround|hotfix|hard[- ]cod(?:e|ed)|manually edit)\b/i],
  ["environment-specific instruction", /\b(?:in (?:your|the) (?:environment|tenant|workspace)|on (?:this|your) machine|for this customer|on this account)\b/i]
];

function normalizedWords(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/\b\w{4,}\b/g) ?? []));
}

function overlapPercent(a: string, b: string): number {
  const aWords = normalizedWords(a);
  const bWords = normalizedWords(b);
  if (aWords.size < 5 || bWords.size < 5) return 0;
  let shared = 0;
  for (const word of aWords) if (bWords.has(word)) shared += 1;
  return Math.round((shared / Math.min(aWords.size, bWords.size)) * 100);
}

const GENERIC_SOURCE_WORDS = new Set([
  "Customer", "Affected", "Employee", "Company", "Organization", "Issue", "Problem",
  "Ticket", "Reference", "Hello", "Hi", "Please", "Thank", "Best", "Regards"
]);

const GENERIC_CUSTOMER_LABEL = /^(?:the\s+)?(?:customer|client|user|requester|end user)$/i;

function nonGenericCustomerValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && !GENERIC_CUSTOMER_LABEL.test(trimmed) ? trimmed : undefined;
}

/**
 * Pull only conservative identity-shaped values from source text. These values
 * are used as negative controls for reusable fields; the source text itself is
 * never added to the reusable-content scan.
 */
function sourceIdentityCandidates(sourceText: string): string[] {
  const candidates = new Set<string>();
  const properPhrase = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g;
  for (const match of sourceText.matchAll(properPhrase)) {
    const words = match[0].split(/\s+/).filter(Boolean);
    for (let start = 0; start < words.length; start += 1) {
      for (let length = 2; length <= Math.min(4, words.length - start); length += 1) {
        const value = words.slice(start, start + length).join(" ");
        if (value.split(" ").some((word) => GENERIC_SOURCE_WORDS.has(word))) continue;
        candidates.add(value);
      }
    }
  }
  const companyPattern = /\b(?:PT|CV|LLC|Ltd\.?|Inc\.?|Corp\.?)\s+[A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,4}/g;
  for (const match of sourceText.matchAll(companyPattern)) candidates.add(match[0].trim());
  return [...candidates];
}

export function buildReflectionSafetyContext(input: {
  customerName?: string;
  organizationName?: string;
  sourceTicketId?: string;
  sourceTicketText?: string;
  extractedCustomerName?: string | null;
  extractedCompanyName?: string | null;
  reusableProblemName?: string;
}): ReflectionSafetyContext {
  const sourceTicketText = input.sourceTicketText ?? "";
  const customerName = nonGenericCustomerValue(input.extractedCustomerName?.trim() || input.customerName);
  return {
    customerName,
    organizationName: input.organizationName,
    sourceTicketId: input.sourceTicketId,
    sourceTicketText,
    reusableProblemName: input.reusableProblemName,
    sourceSpecificValues: [
      nonGenericCustomerValue(input.customerName),
      nonGenericCustomerValue(input.extractedCustomerName ?? undefined),
      input.extractedCompanyName ?? undefined,
      ...sourceIdentityCandidates(sourceTicketText)
    ].filter((value): value is string => Boolean(value?.trim() && !GENERIC_CUSTOMER_LABEL.test(value.trim())))
  };
}

/** Fail closed before reviewer-authored material enters Organizational Memory. */
export function assessReflectionSafety(
  draft: Pick<LessonDraft, "rootCause" | "solution" | "customerResponse" | "signals">,
  context: ReflectionSafetyContext = {}
): ReflectionSafetyResult {
  const issues = new Set<string>();
  const text = [context.reusableProblemName, draft.rootCause, draft.solution, draft.customerResponse, ...draft.signals]
    .filter((value): value is string => typeof value === "string")
    .join("\n");

  for (const [label, rule] of UNSAFE_CONTENT_RULES) {
    if (rule.test(text)) issues.add(label);
  }

  for (const [label, value] of [
    ["customer name", context.customerName],
    ["organization-specific name", context.organizationName],
    ["source ticket identifier", context.sourceTicketId]
  ] as Array<[string, string | undefined]>) {
    const candidate = value?.trim();
    if (candidate && candidate.length >= 3 && text.toLowerCase().includes(candidate.toLowerCase())) {
      issues.add(label);
    }
  }

  for (const value of context.sourceSpecificValues ?? []) {
    const candidate = value.trim();
    if (candidate.length >= 3 && text.toLowerCase().includes(candidate.toLowerCase())) {
      issues.add("customer-specific source identity");
      break;
    }
  }

  const sourceText = context.sourceTicketText?.trim();
  if (sourceText) {
    const normalizedDraft = text.toLowerCase().replace(/\s+/g, " ").trim();
    const normalizedSource = sourceText.toLowerCase().replace(/\s+/g, " ").trim();
    if (normalizedDraft && normalizedSource && normalizedDraft.includes(normalizedSource)) {
      issues.add("copied ticket text");
    } else if (overlapPercent(text, sourceText) >= 85) {
      issues.add("copied ticket text");
    }
  }

  return { safe: issues.size === 0, issues: [...issues] };
}
