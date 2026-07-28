/**
 * TODO-058B Part B — the one concept-extraction result the deterministic
 * retrieval path shares.
 *
 * Extraction is computed ONCE per ticket and threaded through relevance,
 * understanding, canonical matching, and lesson matching, so no stage repeats
 * the work and every stage reasons about the same evidence.
 *
 * Hard contract:
 *   - the original ticket text is never modified;
 *   - the ticket is never translated;
 *   - no AI provider is called;
 *   - unknown text never creates a concept;
 *   - concept ids carry no language suffix;
 *   - organization aliases keep precedence over built-ins;
 *   - repeating one alias does not inflate evidence.
 */
import type { BusinessConcept, OrganizationProfile } from "@/types";
import { normalizeConceptVocabulary, resolveConceptVocabulary } from "@/lib/conceptVocabulary";
import { foldForMatching } from "@/lib/textNormalization";

/** Where a matched alias came from. Organization wins on collision. */
export type ConceptSource = "organization" | "builtin";

export interface ConceptMatch {
  /** Stable, language-neutral concept id. */
  conceptId: string;
  /** The surface forms that actually appeared, de-duplicated. */
  matchedAliases: string[];
  source: ConceptSource;
  /**
   * Deterministic evidence strength, 1..3. Driven by how many DISTINCT aliases
   * matched, never by repetition — saying "invoice invoice invoice" is one piece
   * of evidence, not three.
   */
  evidence: number;
}

export interface ConceptExtraction {
  /** Sorted concept ids, so downstream comparisons are order-independent. */
  conceptIds: string[];
  matches: ConceptMatch[];
  /** Concept ids contributed by organization-defined vocabulary. */
  organizationConceptIds: string[];
  /** True when no concept was found — callers must fail closed, not guess. */
  empty: boolean;
}

export const EMPTY_CONCEPT_EXTRACTION: ConceptExtraction = {
  conceptIds: [],
  matches: [],
  organizationConceptIds: [],
  empty: true
};

/**
 * URLs, email addresses, and ticket ids are identifiers, not statements of a
 * problem. Left in, `https://example.com/login` extracts the `login` concept and
 * a bare link classifies as a Login ticket. Strip them before extraction —
 * the same rule the language detector applies.
 */
function stripNonLinguisticSpans(text: string): string {
  return typeof text === "string"
    ? text
        .replace(/\b(?:https?:\/\/|www\.)\S+/giu, " ")
        .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/giu, " ")
        .replace(/\b[A-Z]{2,}-\d{4,}-\d+\b/gu, " ")
    : "";
}

/**
 * Is this alias specific enough to be strong evidence on its own?
 *
 * A bare noun ("sandi", "factura") names a thing; it does not describe a
 * problem, so one of them must not authorize a category. These three forms do
 * describe one:
 *   - a multi-word phrase ("retard de livraison");
 *   - a long compound, which is how German and Dutch write a phrase as one word
 *     ("Lieferverzögerung" = delivery delay);
 *   - a non-Latin term of a few characters, since CJK and Hangul carry roughly a
 *     morpheme per character ("配送遅延" is four characters and four morphemes).
 */
function isSpecificAlias(alias: string): boolean {
  const trimmed = alias.trim();
  if (/\s/u.test(trimmed)) return true;
  if (/[^\p{Script=Latin}\p{N}\s]/u.test(trimmed)) return trimmed.length >= 3;
  return foldForMatching(trimmed).length >= 10;
}

/** Longest-first so a specific alias is preferred over a prefix of itself. */
function orderedAliases(concept: BusinessConcept): string[] {
  return [concept.id.replace(/_/gu, " "), ...concept.aliases].sort((a, b) => b.length - a.length);
}

/**
 * A folded needle made only of ASCII letters/digits must respect word
 * boundaries ("key" must not match inside "monkey"). Scripts without word
 * delimiters (CJK) are matched on presence, which is the correct rule for them.
 */
function aliasAppears(foldedText: string, foldedAlias: string): boolean {
  if (!foldedAlias || !foldedText.includes(foldedAlias)) return false;
  if (!/^[a-z0-9 ]+$/u.test(foldedAlias)) return true;
  const escaped = foldedAlias.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "u").test(foldedText);
}

/**
 * Extract concepts from ticket text against an organization's vocabulary.
 *
 * `text` is read only. The folded form used for matching is derived and
 * discarded; nothing user-authored is rewritten.
 */
export function extractConcepts(
  text: string,
  profile: Pick<OrganizationProfile, "conceptVocabulary">
): ConceptExtraction {
  const folded = foldForMatching(stripNonLinguisticSpans(text));
  if (!folded) return EMPTY_CONCEPT_EXTRACTION;

  const concepts = resolveConceptVocabulary(profile);
  const organizationIds = new Set(
    normalizeConceptVocabulary(profile.conceptVocabulary).map((concept) => concept.id)
  );

  const matches: ConceptMatch[] = [];
  for (const concept of concepts) {
    const matchedAliases: string[] = [];
    const seen = new Set<string>();
    for (const alias of orderedAliases(concept)) {
      const foldedAlias = foldForMatching(alias);
      if (!foldedAlias || seen.has(foldedAlias)) continue;
      if (!aliasAppears(folded, foldedAlias)) continue;
      seen.add(foldedAlias);
      matchedAliases.push(alias);
    }
    if (matchedAliases.length === 0) continue;
    matches.push({
      conceptId: concept.id,
      matchedAliases,
      source: organizationIds.has(concept.id) ? "organization" : "builtin",
      // Distinct aliases, capped: two independent surface forms is meaningfully
      // stronger than one, but a long alias list must not dominate scoring.
      //
      // A multi-word alias counts for one extra: "retard de livraison" states a
      // problem, whereas the bare noun "sandi" only names a thing. That
      // distinction is what lets a real one-phrase ticket clear the evidence bar
      // while a single stray word still fails closed.
      evidence: Math.min(3, matchedAliases.length + (matchedAliases.some(isSpecificAlias) ? 1 : 0))
    });
  }

  matches.sort((a, b) => a.conceptId.localeCompare(b.conceptId));
  return {
    conceptIds: matches.map((match) => match.conceptId),
    matches,
    organizationConceptIds: matches.filter((match) => match.source === "organization").map((match) => match.conceptId),
    empty: matches.length === 0
  };
}

/** Total evidence for a set of concept ids present in an extraction. */
export function conceptEvidenceFor(extraction: ConceptExtraction, conceptIds: readonly string[]): number {
  if (extraction.empty || conceptIds.length === 0) return 0;
  const wanted = new Set(conceptIds);
  return extraction.matches
    .filter((match) => wanted.has(match.conceptId))
    .reduce((total, match) => total + match.evidence, 0);
}

/** Concept ids from `conceptIds` that the extraction actually found. */
export function conceptsPresent(extraction: ConceptExtraction, conceptIds: readonly string[]): string[] {
  if (extraction.empty) return [];
  const found = new Set(extraction.conceptIds);
  return conceptIds.filter((conceptId) => found.has(conceptId));
}

/**
 * Concepts too generic to justify a match on their own. They are real evidence
 * when they accompany a specific concept, but "account" or "error" alone
 * describes almost every support ticket ever written and must not authorize
 * anything by itself (Part N).
 */
export const GENERIC_CONCEPT_IDS: readonly string[] = ["account", "error", "permission", "report_export"];

/** True when the only concepts found are generic ones. */
export function onlyGenericConcepts(extraction: ConceptExtraction): boolean {
  if (extraction.empty) return true;
  return extraction.conceptIds.every((conceptId) => GENERIC_CONCEPT_IDS.includes(conceptId));
}

/**
 * A short, reviewer-readable description of the concept evidence, for the
 * TODO-051 explainability model. No percentages — concepts are discrete
 * evidence, and a fabricated confidence figure would misrepresent them.
 */
export function describeConceptEvidence(extraction: ConceptExtraction, conceptIds?: readonly string[]): string {
  const relevant = conceptIds ? extraction.matches.filter((m) => conceptIds.includes(m.conceptId)) : extraction.matches;
  if (relevant.length === 0) return "";
  return relevant
    .map((match) => {
      const origin = match.source === "organization" ? " (organization vocabulary)" : "";
      return `${match.conceptId}: "${match.matchedAliases[0]}"${origin}`;
    })
    .join("; ");
}
