import type { LessonDraft } from "@/types";

export interface ReflectionSafetyContext {
  customerName?: string;
  organizationName?: string;
  sourceTicketId?: string;
  sourceTicketText?: string;
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

/** Fail closed before reviewer-authored material enters Organizational Memory. */
export function assessReflectionSafety(
  draft: Pick<LessonDraft, "rootCause" | "solution" | "customerResponse" | "signals">,
  context: ReflectionSafetyContext = {}
): ReflectionSafetyResult {
  const issues = new Set<string>();
  const text = [draft.rootCause, draft.solution, draft.customerResponse, ...draft.signals].join("\n");

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

