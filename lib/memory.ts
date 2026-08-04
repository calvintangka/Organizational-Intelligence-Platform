import type { Understanding } from "@/types/oip";
import type { KnowledgeItem, KnowledgeMatch } from "@/types";
import { withCanonicalProblemDefaults } from "@/lib/canonicalProblemEngine";

const RETRIEVAL_STOPWORDS = new Set([
  "and", "are", "for", "from", "has", "have", "into", "not", "that", "the", "their", "this", "was", "were", "with"
]);

type RelevanceConcept = { id: string; categories: string[]; aliases: string[]; requiredAliases?: string[]; minimumEvidence: number };

// Bounded, explainable problem concepts. These describe recurring failure
// meanings across domains rather than individual fixture sentences or IDs.
// A concept contributes only when both the ticket and the canonical's own
// title/summary/tags carry enough of its evidence.
const RELEVANCE_CONCEPTS: RelevanceConcept[] = [
  { id: "billing-duplicate-change", categories: ["Billing"], aliases: ["duplicate", "twice", "doubled", "repeated", "overlapping", "second charge", "two charges", "charged", "charges", "reduced", "reduction", "downsizing", "old", "quantity", "replacement", "seat", "seats", "license", "licenses", "headcount", "allocation", "change"], requiredAliases: ["duplicate", "twice", "doubled", "repeated", "overlapping", "second charge", "two charges", "charged", "charges"], minimumEvidence: 2 },
  { id: "integration-signature-validation", categories: ["API & Integrations"], aliases: ["signature", "signing", "secret", "credential", "private value", "proof", "authenticity", "verify", "verification", "verifier", "forged", "untrusted", "webhook", "callback"], minimumEvidence: 2 },
  { id: "permissions-guest-workspace", categories: ["Permissions & Access"], aliases: ["guest", "collaborator", "partner", "external", "invitation", "shared area", "team area", "project", "workspace"], minimumEvidence: 2 },
  { id: "reporting-encoding", categories: ["Reporting & Exports"], aliases: ["csv", "spreadsheet", "accented", "replacement", "garbled", "corrupted", "strange", "substitutions", "symbols", "non-english", "punctuation", "encoding", "character", "downloaded table", "unreadable"], minimumEvidence: 2 },
  { id: "mobile-offline-conflict", categories: ["Mobile Application"], aliases: ["offline", "reconnect", "reconnecting", "synchronization", "sync", "conflict", "newer copy", "older", "behind", "competing revision", "merge", "reconcile", "server version", "queued changes", "coverage", "reception"], minimumEvidence: 2 },
  { id: "notifications-suppression", categories: ["Notifications & Email"], aliases: ["suppression", "suppressed", "bounce", "bounced", "delivery failure", "omits", "omitted", "excluded", "skipped", "withheld", "recipient", "no longer receives", "not delivered"], minimumEvidence: 2 },
  { id: "sso-redirect-loop", categories: ["Authentication"], aliases: ["federated", "federation", "identity provider", "signing credential", "provider key", "certificate", "bounce", "bounces", "redirect", "handoff", "hand-off", "return to login", "back to sign-in", "login screen", "sign-in", "restarts", "repeatedly", "repeating", "repeats", "maintenance", "renewed", "replacement", "loop"], minimumEvidence: 2 }
];

function textHasAlias(text: string, alias: string): boolean {
  const normalized = text.toLowerCase();
  if (alias.includes(" ")) return normalized.includes(alias);
  return new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`).test(normalized);
}

function conceptEvidence(text: string, category: string): Set<string> {
  return new Set(RELEVANCE_CONCEPTS
    .filter((concept) => {
      if (!concept.categories.includes(category)) return false;
      const matched = concept.aliases.filter((alias) => textHasAlias(text, alias));
      const required = concept.requiredAliases ? concept.requiredAliases.some((alias) => textHasAlias(text, alias)) : true;
      return required && matched.length >= concept.minimumEvidence;
    })
    .map((concept) => concept.id));
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !RETRIEVAL_STOPWORDS.has(token));
}

export function retrieveMemory(
  understanding: Understanding,
  knowledgeItems: KnowledgeItem[],
  sessionCreatedIds: Set<string> = new Set()
): KnowledgeMatch[] {
  if (understanding.intentIsolation?.securityIntent.detected) return [];
  const analysisTokens = tokenize(
    `${understanding.retrievalText ?? understanding.originalText ?? ""} ${understanding.summary} ${understanding.coreProblem} ${understanding.category} ${understanding.tags.join(" ")}`
  );
  const analysisKeywords = new Set(analysisTokens);
  const normalizedAnalysis = analysisTokens.join(" ");
  const analysisSource = `${understanding.retrievalText ?? understanding.originalText ?? ""} ${understanding.summary} ${understanding.coreProblem} ${understanding.category} ${understanding.tags.join(" ")}`;
  const analysisConcepts = conceptEvidence(analysisSource, understanding.category);

  const mapped = knowledgeItems
    .map((rawItem) => {
      const item = withCanonicalProblemDefaults(rawItem);
      const categoryMatch = item.category.toLowerCase() === understanding.category.toLowerCase();
      const matchedTags = item.tags.filter((tag) => understanding.tags.includes(tag));
      const itemKeywords = [...new Set(tokenize(
        `${item.canonicalProblemTitle ?? item.title} ${item.problemSummary ?? item.problem} ${item.tags.join(" ")}`
      ))];
      const broadKeywords = [...new Set(tokenize(`${item.internalGuidance ?? ""} ${item.customerResponseTemplate ?? ""}`))];
      const matchedSpecificKeywords = itemKeywords.filter((kw) => analysisKeywords.has(kw));
      const matchedBroadKeywords = broadKeywords.filter((kw) => analysisKeywords.has(kw));
      const matchedKeywords = [...new Set([...matchedSpecificKeywords, ...matchedBroadKeywords])];
      const itemConcepts = conceptEvidence(`${item.canonicalProblemTitle ?? item.title} ${item.problemSummary ?? item.problem} ${item.tags.join(" ")}`, item.category);
      const matchedConcepts = [...itemConcepts].filter((concept) => analysisConcepts.has(concept));
      const canonicalTitleTokens = tokenize(item.canonicalProblemTitle ?? item.title);
      const canonicalPhrase = canonicalTitleTokens.join(" ");
      const exactCanonicalPhrase = canonicalTitleTokens.length >= 2 && normalizedAnalysis.includes(canonicalPhrase);
      const isSessionCreated = sessionCreatedIds.has(item.id);
      // Reuse/validation history is confidence metadata, not problem
      // relevance. It must never outrank a more specific canonical match.
      const reuseBoost = 0;
      const categoryPoints = categoryMatch ? 55 : 0;
      const tagPoints = Math.min(matchedTags.length * 10, 30);
      const keywordPoints = Math.min(matchedSpecificKeywords.length * 3, 12) + Math.min(matchedBroadKeywords.length, 3);
      const conceptPoints = Math.min(matchedConcepts.length * 14, 28);
      const phrasePoints = exactCanonicalPhrase ? 20 : 0;
      const sessionPoints = isSessionCreated ? 8 : 0;
      const compatibility = assessIntentCompatibility(understanding, item);

      const matchScore =
        categoryPoints +
        tagPoints +
        keywordPoints +
        conceptPoints +
        phrasePoints +
        sessionPoints +
        reuseBoost +
        (compatibility.score > 0 ? compatibility.score : 0);

      const reasonParts = [
        categoryMatch ? `category match: "${item.category}"` : "",
        matchedTags.length > 0 ? `shared tags: ${matchedTags.join(", ")}` : "",
        matchedKeywords.length > 0 ? `keyword overlap: ${matchedKeywords.slice(0, 4).join(", ")}` : "",
        matchedConcepts.length > 0 ? `problem concepts: ${matchedConcepts.join(", ")}` : "",
        exactCanonicalPhrase ? `exact canonical phrase: "${item.canonicalProblemTitle ?? item.title}"` : "",
        isSessionCreated ? "newly created in this session" : "",
        typeof item.trustScore === "number" ? `trust ${item.trustScore}/100` : "",
        item.timesSeen ? `examples seen: ${item.timesSeen}` : "",
        item.knowledgeVersions?.length ? `knowledge versions: ${item.knowledgeVersions.length}` : "",
        item.timesReused > 0 ? `validated and reused ${item.timesReused}x before` : "",
        compatibility.reason
      ].filter(Boolean);

      const matchReason =
        reasonParts.length > 0
          ? `Recall candidate — ${reasonParts.join("; ")}. Similarity does not confirm accuracy; human review required.`
          : "No strong match found.";

      return {
        item,
        matchScore: Math.min(matchScore, 100),
        matchReason,
        matchedTags,
        matchedKeywords: matchedKeywords.slice(0, 4),
        matchedCategory: categoryMatch ? item.category : null,
        compatibilityScore: compatibility.score,
        compatibilityReason: compatibility.reason,
        relevanceEvidence: {
          categoryPoints,
          tagPoints,
          keywordPoints,
          conceptPoints,
          phrasePoints,
          sessionPoints,
          reusePoints: reuseBoost,
          conceptMatches: matchedConcepts
        }
      };
    })
    .filter((match) => match.matchScore > 0 && (match.compatibilityScore ?? 1) > 0);

  // Deduplicate by canonical problem id — the same canonical problem must never
  // appear twice in retrieval. When duplicates exist, keep the better candidate.
  const byId = new Map<string, KnowledgeMatch>();
  for (const match of mapped) {
    const existing = byId.get(match.item.id);
    if (!existing || isBetterMatch(match, existing)) {
      byId.set(match.item.id, match);
    }
  }

  return [...byId.values()].sort((a, b) =>
    b.matchScore - a.matchScore || a.item.id.localeCompare(b.item.id)
  );
}

/**
 * TODO-080 compatibility is intentionally conservative. A historical item
 * must agree with the active object/outcome; category and word overlap alone
 * are not enough to reuse it.
 */
function assessIntentCompatibility(understanding: Understanding, item: KnowledgeItem): { score: number; reason: string } {
  const isolation = understanding.intentIsolation;
  if (!isolation) return { score: 0, reason: "legacy retrieval compatibility" };
  const text = `${item.canonicalProblemTitle ?? item.title} ${item.problemSummary ?? item.problem} ${(item.tags ?? []).join(" ")}`.toLowerCase();
  const active = `${isolation.activeProblemText} ${isolation.requestedOutcome ?? ""}`.toLowerCase();
  const has = (pattern: RegExp) => pattern.test(text);
  const activeHas = (pattern: RegExp) => pattern.test(active);
  const negated = (pattern: RegExp) => isolation.negatedTopics.some((topic) => pattern.test(topic));

  if (isolation.securityIntent.detected) return { score: -100, reason: "security override: retrieval prohibited" };
  if (isolation.primaryIssueHint === "role_permission" && has(/guest|workspace|collaborator|external invitation/) && !activeHas(/guest|collaborator|invitation|workspace/)) return { score: -100, reason: "object mismatch: guest/workspace lesson is not the active role-permission issue" };
  if (isolation.primaryIssueHint === "refund_investigation" && has(/duplicate|invoice duplication|two charges/) && !activeHas(/duplicate|twice|two charges|doubled/)) return { score: -100, reason: "object mismatch: duplicate-charge lesson is not the refund investigation" };
  if (isolation.primaryIssueHint === "report_export_timeout" && has(/encoding|csv|garbled|character|spreadsheet/) && !activeHas(/encoding|csv|garbled|character/)) return { score: -100, reason: "stage mismatch: encoding lesson is not the report timeout" };
  if (isolation.primaryIssueHint === "activation_failure" && has(/login|password reset|account access/) && !activeHas(/login|password|masuk|kata sandi/)) return { score: -100, reason: "intent mismatch: login lesson is not activation/invitation failure" };
  if (isolation.negatedTopics.length > 0 && has(new RegExp(isolation.negatedTopics.join("|"), "i")) && !activeHas(new RegExp(isolation.negatedTopics.join("|"), "i"))) return { score: -100, reason: "negated topic veto" };
  if (isolation.object && has(new RegExp(isolation.object.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))) return { score: 12, reason: `compatible object: ${isolation.object}` };
  return { score: 1, reason: "category-compatible candidate; no stronger object confirmation" };
}

/**
 * "Better" means: higher intrinsic similarity, then more usage
 * (timesSeen / timesReused), then most recently used or updated. Trust remains
 * confidence metadata and is intentionally excluded from relevance (TODO-029).
 */
function isBetterMatch(candidate: KnowledgeMatch, current: KnowledgeMatch): boolean {
  if (candidate.matchScore !== current.matchScore) return candidate.matchScore > current.matchScore;

  const cUse = (candidate.item.timesSeen ?? 0) + (candidate.item.timesReused ?? 0);
  const rUse = (current.item.timesSeen ?? 0) + (current.item.timesReused ?? 0);
  if (cUse !== rUse) return cUse > rUse;

  const cTime = new Date(candidate.item.lastUsedAt ?? candidate.item.lastUpdated ?? 0).getTime();
  const rTime = new Date(current.item.lastUsedAt ?? current.item.lastUpdated ?? 0).getTime();
  return cTime > rTime;
}
