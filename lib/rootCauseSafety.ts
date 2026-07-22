import type { Ticket, Lesson } from "@/types";

/**
 * TODO-048 — Unverified Root-Cause Assertion Safety.
 *
 * A matched historical lesson describes a root cause that was validated in
 * PREVIOUS cases. Retrieving that lesson proves the ticket is *similar*, not
 * that the historical cause has been *confirmed for the current ticket*. The
 * developer-demo lessons (and any lesson authored on that template) render a
 * customer response of the form:
 *
 *   "We found that <historical root cause>. We will <solution> and confirm the
 *    result before closing <ticketId>."
 *
 * "We found that X" asserts the historical cause as an established current-case
 * fact. This module derives, at drafting time, whether the current ticket
 * actually establishes that cause, and rewrites the customer-facing language so
 * an unconfirmed historical cause is presented as a possibility — never as a
 * finding — while still preserving the lesson's validated investigation and
 * resolution guidance.
 *
 * Design constraints (see TODO-048):
 *  - Retrieval and lesson matching are NOT touched. This layer runs only on the
 *    already-rendered customer response and never changes which lesson matched.
 *  - No persisted data is modified. The stored lesson.customerResponse is left
 *    intact; only the rendered draft is softened.
 *  - Confirmation is fail-safe: the default is POSSIBLE. Assertive ("We found
 *    that") language is retained only when the current ticket independently and
 *    affirmatively establishes the historical cause.
 */

export type RootCauseEvidenceState =
  /** The current ticket (or verified workflow evidence) directly establishes the cause. */
  | "CONFIRMED_CURRENT_CASE"
  /** A validated historical lesson suggests a relevant cause; the ticket has not confirmed it. */
  | "POSSIBLE_FROM_ORGANIZATIONAL_MEMORY"
  /** Not enough evidence to name a specific cause at all. */
  | "UNKNOWN";

export interface RootCauseEvidenceAssessment {
  state: RootCauseEvidenceState;
  /** The historical root cause described by the matched lesson (raw). */
  historicalRootCause: string;
  /** Meaningful tokens of the historical root-cause clause used for scoring. */
  causalTokens: string[];
  /** Causal tokens the current ticket affirmatively establishes. */
  confirmedTokens: string[];
  /** How many affirmative causal tokens were required for confirmation. */
  requiredTokens: number;
  /** Human-readable rationale (structured, not chain-of-thought). */
  reason: string;
}

const CAUSAL_STOPWORDS = new Set([
  // Generic connectors / temporal words that carry no causal specificity: they
  // must not inflate confirmation ("after", "before", "when", "every"...).
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "by", "for",
  "is", "was", "were", "are", "be", "been", "being", "it", "its", "this", "that",
  "these", "those", "as", "so", "then", "than", "with", "without", "from", "into",
  "after", "before", "during", "while", "when", "once", "still", "again", "over",
  "under", "about", "only", "also", "not", "no", "every", "each", "any", "some",
  "has", "have", "had", "which", "their", "there", "them", "they"
]);

const NEGATION_TOKENS = new Set([
  "no", "not", "never", "cannot", "cant", "dont", "wont", "without",
  "unchanged", "unrelated", "unaffected", "normally", "normal",
  "hasn", "havent", "haven", "hadn", "didn", "doesn", "wasn", "weren",
  "isn", "aren", "couldn", "wouldn", "shouldn"
]);

/** Lowercase, strip punctuation, keep alphanumerics and hyphens as separators. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/can't/g, "cannot")
    .replace(/won't/g, "will not")
    .replace(/[^a-z0-9\s-]/g, " ");
}

function meaningfulTokens(value: string): string[] {
  return normalize(value)
    .split(/[\s-]+/)
    .filter((token) => token.length > 2 && !CAUSAL_STOPWORDS.has(token));
}

/**
 * The demo lesson.rootCause carries a boilerplate tail
 * ("; this explains the <symptom> pattern.") that restates the SYMPTOM, not the
 * cause. Strip it so only the genuine causal clause is scored. The
 * customerResponse template renders the clause WITHOUT this tail, so this only
 * matters when the rootCause field itself is used.
 */
function rootCauseCore(rootCause: string): string {
  return rootCause.split(/;\s*this explains\b/i)[0] ?? rootCause;
}

/**
 * Tokens the ticket asserts AFFIRMATIVELY. The text is split into clauses; a
 * token is affirmative unless a negation appears earlier in its clause or
 * immediately before it. This keeps "no configuration change occurred" from
 * counting as evidence of a configuration change.
 */
function affirmativeTicketTokens(rawText: string): Set<string> {
  const affirmative = new Set<string>();
  const clauses = normalize(rawText).split(/[.!?;\n]+|\bbut\b|\bhowever\b|\balthough\b|\byet\b/);
  for (const clause of clauses) {
    const tokens = clause.split(/[\s-]+/).filter(Boolean);
    let negationEarlier = false;
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (NEGATION_TOKENS.has(token)) {
        negationEarlier = true;
        continue;
      }
      if (token.length <= 2 || CAUSAL_STOPWORDS.has(token)) continue;
      const precededByNegation = index > 0 && NEGATION_TOKENS.has(tokens[index - 1]);
      if (!negationEarlier && !precededByNegation) affirmative.add(token);
    }
  }
  return affirmative;
}

/**
 * Decide whether the current ticket confirms the matched lesson's historical
 * root cause. Confirmation requires the ticket to affirmatively contain nearly
 * all of the ROOT CAUSE's distinctive tokens — not merely the symptom that
 * caused the lesson to match, and not merely a partial causal EVENT. A root
 * cause such as "a signing secret was rotated before every sender refreshed it"
 * includes both an event (secret rotation) and the mechanism that made it fail
 * (senders had not refreshed). A ticket that states only the event must stay
 * POSSIBLE (Part F-C: the customer's event may be repeated, but no additional
 * causal conclusion may be invented). The 80% bar demands the whole mechanism,
 * so partial-event and symptom-only tickets both remain POSSIBLE.
 */
export function assessRootCauseEvidenceState(ticket: Ticket, lesson: Lesson): RootCauseEvidenceAssessment {
  const historicalRootCause = rootCauseCore(lesson.rootCause ?? "");
  const causalTokens = [...new Set(meaningfulTokens(historicalRootCause))];

  if (causalTokens.length === 0) {
    return {
      state: "UNKNOWN",
      historicalRootCause,
      causalTokens,
      confirmedTokens: [],
      requiredTokens: 0,
      reason: "The matched lesson does not describe a specific root cause, so none can be confirmed."
    };
  }

  const ticketTokens = affirmativeTicketTokens(`${ticket.subject ?? ""}. ${ticket.description ?? ""}`);
  const confirmedTokens = causalTokens.filter((token) => ticketTokens.has(token));
  const requiredTokens = causalTokens.length <= 2
    ? causalTokens.length
    : Math.max(2, Math.ceil(causalTokens.length * 0.8));

  if (confirmedTokens.length >= requiredTokens) {
    return {
      state: "CONFIRMED_CURRENT_CASE",
      historicalRootCause,
      causalTokens,
      confirmedTokens,
      requiredTokens,
      reason: `The current ticket affirmatively establishes the cause (${confirmedTokens.length}/${causalTokens.length} causal terms, ${requiredTokens} required): ${confirmedTokens.join(", ")}.`
    };
  }

  return {
    state: "POSSIBLE_FROM_ORGANIZATIONAL_MEMORY",
    historicalRootCause,
    causalTokens,
    confirmedTokens,
    requiredTokens,
    reason: `A validated historical lesson suggests this cause, but the current ticket does not establish it (${confirmedTokens.length}/${causalTokens.length} causal terms present, ${requiredTokens} required).`
  };
}

/**
 * Assertive root-cause lead-ins that claim a historical cause is an established
 * current-case fact. Each maps to a hedged replacement that stays grammatical
 * regardless of the clause that follows (the clause is a full predicate such as
 * "identity-provider metadata is stale after a configuration change", so the
 * replacement must introduce a "that <clause>" or "is <clause>" frame).
 */
const ASSERTIVE_REWRITES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bWe(?:'ve| have)?\s+found\s+that\b/gi, replacement: "Based on similar past cases, one possible explanation is that" },
  { pattern: /\bWe(?:'ve| have)?\s+identified\s+that\b/gi, replacement: "Based on similar past cases, one possible explanation is that" },
  { pattern: /\bWe(?:'ve| have)?\s+determined\s+that\b/gi, replacement: "Based on similar past cases, one possible explanation is that" },
  { pattern: /\bWe(?:'ve| have)?\s+discovered\s+that\b/gi, replacement: "Based on similar past cases, one possible explanation is that" },
  { pattern: /\bWe(?:'ve| have)?\s+confirmed\s+that\b/gi, replacement: "Based on similar past cases, one possible explanation is that" },
  { pattern: /\bThe root cause (?:is|was)\b/gi, replacement: "Based on similar past cases, a possible root cause is" },
  { pattern: /\bThe (?:issue|problem) (?:is|was) caused by\b/gi, replacement: "This may be related to" },
  { pattern: /\bThis (?:is|was) caused by\b/gi, replacement: "This may be related to" },
  { pattern: /\bwas caused by\b/gi, replacement: "may be related to" }
];

/**
 * Rewrite the rendered customer response so an unconfirmed historical root cause
 * is stated as a possibility, not a finding. Only applied when the evidence
 * state is not CONFIRMED_CURRENT_CASE. The lesson's investigation/resolution
 * guidance (the "We will ... and confirm the result ..." clause) is preserved
 * verbatim, so Organizational Memory remains useful.
 */
export function applyRootCauseSafeLanguage(renderedDraft: string, assessment: RootCauseEvidenceAssessment): string {
  if (assessment.state === "CONFIRMED_CURRENT_CASE") return renderedDraft;
  let safe = renderedDraft;
  for (const { pattern, replacement } of ASSERTIVE_REWRITES) {
    safe = safe.replace(pattern, replacement);
  }
  return safe;
}

/**
 * Structured explainability line separating the historical cause from its
 * current-case status (Part J). Never exposes hidden reasoning — only the
 * evidence-state verdict and the terms that drove it.
 */
export function rootCauseEvidenceNote(assessment: RootCauseEvidenceAssessment): string {
  const status =
    assessment.state === "CONFIRMED_CURRENT_CASE"
      ? "confirmed by current-case evidence"
      : assessment.state === "POSSIBLE_FROM_ORGANIZATIONAL_MEMORY"
      ? "possible (from Organizational Memory; not confirmed for this ticket)"
      : "not established";
  return `Historical root cause: ${assessment.historicalRootCause}. Current-case status: ${status}. ${assessment.reason}`;
}
