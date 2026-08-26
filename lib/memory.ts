import type { Understanding } from "@/types/oip";
import type { KnowledgeItem, KnowledgeMatch } from "@/types";
import { withCanonicalProblemDefaults } from "@/lib/canonicalProblemEngine";
import { assessRetrievalCompatibility } from "@/lib/retrievalCompatibility";

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
    .map(normalizeRetrievalToken)
    .filter((token) => token.length > 2 && !RETRIEVAL_STOPWORDS.has(token));
}

function normalizeRetrievalToken(token: string): string {
  const aliases: Record<string, string> = {
    scanners: "scanner",
    devices: "device",
    services: "service",
    zones: "zone",
    bands: "band",
    employees: "employee",
    workers: "worker",
    synchronizing: "sync",
    synchronized: "sync",
    synchronization: "sync",
    synchronize: "sync",
    syncing: "sync",
    roaming: "roam",
    roamed: "roam",
    transitions: "transition",
    transitioning: "transition",
    failures: "fail",
    failed: "fail",
    intermittently: "intermittent",
    periodically: "periodic"
  };
  return aliases[token] ?? token;
}

type OperationalCondition = "healthy" | "outage" | null;

function operationalConditionOf(text: string): OperationalCondition {
  const normalized = text.toLowerCase();
  if (
    /\b(?:backend|service|services|system|server|inventory)\b[^.?!]{0,45}\b(?:outage|outages|down|offline|unavailable)\b/iu.test(normalized) ||
    /\b(?:outage|outages|unavailable)\b/iu.test(normalized)
  ) return "outage";
  if (
    /\b(?:backend|service|services|system|server|inventory)\b[^.?!]{0,45}\b(?:healthy|operational|available|functioning|working|normal)\b/iu.test(normalized) ||
    /\b(?:systems?|services?)\s+(?:remain|remained|are|were|was)\s+operational\b/iu.test(normalized)
  ) return "healthy";
  return null;
}

function selectionEvidenceFor(
  understanding: Understanding,
  item: KnowledgeItem,
  currentText: string,
  candidateText: string,
  facetCompatibility: ReturnType<typeof assessRetrievalCompatibility>,
  matchedSpecificKeywords: string[],
  matchedConcepts: string[],
  groundingReady: boolean
): NonNullable<KnowledgeMatch["selectionEvidence"]> {
  const currentCondition = operationalConditionOf(currentText);
  const candidateCondition = operationalConditionOf(candidateText);
  const conditionCompatibility = currentCondition && candidateCondition
    ? currentCondition === candidateCondition ? 3 : -100
    : 0;
  const specificSharedFacets = facetCompatibility.sharedFacets.filter((facet) => facet !== "mobile-device");
  const rootCauseFacets = facetCompatibility.candidateFacets.filter(
    (facet) => facet !== "mobile-device" && facet !== "offline-synchronization"
  );
  const interventionSignals = [
    ...(item.resolutionWorkflow ?? []),
    ...(item.lessons ?? []).flatMap((lesson) => [lesson.rootCause, lesson.solution, ...lesson.signals])
  ].join(" ").toLowerCase();
  const causalInterventionCompatibility = Math.min(
    6,
    (rootCauseFacets.length > 0 && specificSharedFacets.some((facet) => rootCauseFacets.includes(facet)) ? 3 : 0) +
    (matchedSpecificKeywords.some((keyword) => /configure|prevent|resolve|restore|reconnect|network|roam|transition|healthy|operational|certificate|firmware/.test(keyword)) && interventionSignals.length > 0 ? 2 : 0) +
    (matchedConcepts.length > 0 ? 1 : 0)
  );
  const problemCompatibility = Math.min(
    12,
    matchedSpecificKeywords.length * 2 + matchedConcepts.length * 4 + specificSharedFacets.length
  );
  const governanceEligibility = item.governanceState === "challenged"
    ? 0
    : item.lifecycleState === "deprecated"
    ? 1
    : item.lifecycleState === "candidate"
    ? 2
    : 3;
  const scopeApplicability = facetCompatibility.state === "incompatible"
    ? -100
    : Math.min(8, specificSharedFacets.length * 2);
  const semanticTieKey = JSON.stringify({
    category: item.category.toLowerCase(),
    // Scope exclusions remain authoritative through compatibilityRank. They
    // are intentionally not part of equivalence identity: two memories can
    // describe the same currently applicable lesson while one also records a
    // governed exclusion for a future contradictory case.
    sharedFacets: [...facetCompatibility.sharedFacets].sort(),
    currentCondition,
    candidateCondition,
    scopeApplicability,
    conditionCompatibility,
    problemCompatibility,
    causalInterventionCompatibility,
    groundingReadiness: groundingReady ? 1 : 0,
    governanceEligibility
  });
  const validatedAt = item.validation?.validatedAt ?? item.lastValidated ?? item.approvedAt ?? item.createdAt;
  return {
    compatibilityRank: facetCompatibility.state === "incompatible" ? 0 : facetCompatibility.state === "compatible" ? 2 : 1,
    scopeApplicability,
    conditionCompatibility,
    problemCompatibility,
    causalInterventionCompatibility,
    groundingReadiness: groundingReady ? 1 : 0,
    governanceEligibility,
    semanticTieKey,
    validatedAt
  };
}

function selectionSpecificity(match: KnowledgeMatch): number {
  return match.relevanceEvidence?.specificityPoints ?? (
    (match.relevanceEvidence?.phrasePoints ?? 0) +
    (match.relevanceEvidence?.conceptPoints ?? 0) +
    (match.relevanceEvidence?.keywordPoints ?? 0)
  );
}

function compareDescending(a: number, b: number): number {
  return b - a;
}

/**
 * Compare already-compatible retrieval candidates. The late timestamp check
 * is deliberately limited to the same semanticTieKey; it is not a
 * newest-wins rule. An ID is the final fallback when even equivalent
 * candidates were validated at the same instant.
 */
export function compareKnowledgeMatches(a: KnowledgeMatch, b: KnowledgeMatch): number {
  const left = a.selectionEvidence;
  const right = b.selectionEvidence;
  if (left && right) {
    for (const key of [
      "compatibilityRank",
      "scopeApplicability",
      "conditionCompatibility",
      "problemCompatibility",
      "causalInterventionCompatibility"
    ] as const) {
      const result = compareDescending(left[key], right[key]);
      if (result !== 0) return result;
    }
  }
  if (a.matchScore !== b.matchScore) return b.matchScore - a.matchScore;
  const specificityResult = selectionSpecificity(a) !== selectionSpecificity(b)
    ? selectionSpecificity(b) - selectionSpecificity(a)
    : 0;
  if (specificityResult !== 0) return specificityResult;
  if (left && right) {
    for (const key of ["groundingReadiness", "governanceEligibility"] as const) {
      const result = compareDescending(left[key], right[key]);
      if (result !== 0) return result;
    }
  }
  if (left?.semanticTieKey && left.semanticTieKey === right?.semanticTieKey) {
    const validatedAtResult = (right.validatedAt ?? "").localeCompare(left.validatedAt ?? "");
    if (validatedAtResult !== 0) return validatedAtResult;
  }
  return a.item.id.localeCompare(b.item.id);
}

export function explainKnowledgeMatchComparison(winner: KnowledgeMatch, loser: KnowledgeMatch): "SEMANTIC_WIN" | "DETERMINISTIC_EQUIVALENT_TIE_BREAK" {
  return winner.selectionEvidence?.semanticTieKey && winner.selectionEvidence.semanticTieKey === loser.selectionEvidence?.semanticTieKey &&
    winner.matchScore === loser.matchScore && selectionSpecificity(winner) === selectionSpecificity(loser)
    ? "DETERMINISTIC_EQUIVALENT_TIE_BREAK"
    : "SEMANTIC_WIN";
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
      const evidenceText = [
        item.canonicalProblemTitle,
        item.title,
        item.problemSummary,
        item.problem,
        item.internalGuidance,
        item.customerResponseTemplate,
        ...(item.resolutionWorkflow ?? []),
        ...(item.lessons ?? []).flatMap((lesson) => [lesson.title, lesson.rootCause, lesson.solution, ...lesson.signals]),
        ...(item.exampleTickets ?? []).map((example) => example.originalIssue)
      ].filter(Boolean).join(" ");
      const evidenceKeywords = [...new Set(tokenize(evidenceText))];
      const broadKeywords = [...new Set(tokenize(`${item.internalGuidance ?? ""} ${item.customerResponseTemplate ?? ""}`))];
      const matchedSpecificKeywords = itemKeywords.filter((kw) => analysisKeywords.has(kw));
      const matchedEvidenceKeywords = evidenceKeywords.filter((kw) => analysisKeywords.has(kw) && !itemKeywords.includes(kw));
      const matchedBroadKeywords = broadKeywords.filter((kw) => analysisKeywords.has(kw));
      const matchedKeywords = [...new Set([...matchedSpecificKeywords, ...matchedEvidenceKeywords, ...matchedBroadKeywords])];
      const itemConcepts = conceptEvidence(evidenceText, item.category);
      const matchedConcepts = [...itemConcepts].filter((concept) => analysisConcepts.has(concept));
      const canonicalTitleTokens = tokenize(item.canonicalProblemTitle ?? item.title);
      const canonicalPhrase = canonicalTitleTokens.join(" ");
      const exactCanonicalPhrase = canonicalTitleTokens.length >= 2 && normalizedAnalysis.includes(canonicalPhrase);
      const isSessionCreated = sessionCreatedIds.has(item.id) || sessionCreatedIds.has(rawItem.id);
      // Reuse/validation history is confidence metadata, not problem
      // relevance. It must never outrank a more specific canonical match.
      const reuseBoost = 0;
      const categoryPoints = categoryMatch ? 55 : 0;
      const tagPoints = Math.min(matchedTags.length * 10, 30);
      const keywordPoints = Math.min(matchedSpecificKeywords.length * 3, 12) + Math.min(matchedBroadKeywords.length, 3);
      const evidenceKeywordPoints = Math.min(matchedEvidenceKeywords.length * 3, 18);
      const conceptPoints = Math.min(matchedConcepts.length * 14, 28);
      const phrasePoints = exactCanonicalPhrase ? 20 : 0;
      const sessionPoints = isSessionCreated ? 8 : 0;
      const directlySupported = (value: string) => {
        const evidenceTokens = new Set(tokenize(value));
        let overlap = 0;
        for (const token of evidenceTokens) if (analysisKeywords.has(token)) overlap += 1;
        return overlap > 0;
      };
      const directlySupportedLessons = (item.lessons ?? []).filter((lesson) => directlySupported(
        [lesson.title, lesson.rootCause, lesson.solution, ...lesson.signals].filter(Boolean).join(" ")
      )).length;
      const directlySupportedWorkflow = (item.resolutionWorkflow ?? []).some(directlySupported);
      const directlySupportedExamples = (item.exampleTickets ?? []).some((example) => directlySupported(example.originalIssue));
      const evidenceQualityPoints = Math.min(
        directlySupportedLessons * 4 +
        (directlySupportedWorkflow ? 2 : 0) +
        (directlySupportedExamples ? 1 : 0),
        14
      );
      const lifecyclePenalty = item.lifecycleState === "deprecated"
        ? 30
        : item.lifecycleState === "candidate"
        ? 12
        : item.governanceState === "challenged"
        ? 24
        : 0;
      const compatibility = assessIntentCompatibility(understanding, item);
      const facetCompatibility = assessRetrievalCompatibility(understanding, item);
      const categoryUnknown = understanding.category === "General" || understanding.category === "Uncategorized";
      const conditionPoints = facetCompatibility.sharedFacets.some((facet) => facet === "network-transition-synchronization" || facet === "offline-synchronization") ? 6 : 0;
      const specificityPoints = Math.min(evidenceKeywordPoints + conditionPoints + evidenceQualityPoints, 28);
      const groundingReady = (item.lessons?.length ?? 0) > 0 && item.lifecycleState !== "deprecated" && item.governanceState !== "challenged";

      const matchScore =
        categoryPoints +
        tagPoints +
        keywordPoints +
        evidenceKeywordPoints +
        conceptPoints +
        phrasePoints +
        sessionPoints +
        reuseBoost +
        conditionPoints +
        evidenceQualityPoints -
        lifecyclePenalty +
        (compatibility.score > 0 ? compatibility.score : 0) +
        (categoryUnknown && facetCompatibility.score > 0 ? facetCompatibility.score : 0);

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
        matchedEvidenceKeywords.length > 0 ? `supporting evidence overlap: ${matchedEvidenceKeywords.slice(0, 4).join(", ")}` : "",
        evidenceQualityPoints > 0 ? `evidence quality points: ${evidenceQualityPoints}` : "",
        lifecyclePenalty > 0 ? `lifecycle penalty: -${lifecyclePenalty}` : "",
        item.governanceState === "challenged" ? "open human challenge: inspectable but not automation-authorized" : "",
        compatibility.reason,
        facetCompatibility.reason
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
        compatibilityScore: categoryUnknown
          ? Math.min(100, compatibility.score + facetCompatibility.score)
          : compatibility.score,
        compatibilityReason: `${compatibility.reason} ${facetCompatibility.reason}`,
        relevanceEvidence: {
          categoryPoints,
          tagPoints,
          keywordPoints,
          conceptPoints,
          phrasePoints,
          sessionPoints,
          reusePoints: reuseBoost,
          conceptMatches: matchedConcepts,
          evidenceKeywordPoints,
          conditionPoints,
          specificityPoints,
          lifecyclePenalty,
          groundingReady,
          matchedEvidenceKeywords: matchedEvidenceKeywords.slice(0, 8)
        },
        selectionEvidence: selectionEvidenceFor(
          understanding,
          item,
          analysisSource,
          evidenceText,
          facetCompatibility,
          matchedSpecificKeywords,
          matchedConcepts,
          groundingReady
        )
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

  return [...byId.values()].sort(compareKnowledgeMatches);
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
  // `activeProblemText` is intentionally concise and may contain only the
  // subject. Weighted retrieval text also contains current symptom/evidence
  // sentences while excluding quoted, resolved, and negated history. Root-cause
  // compatibility must inspect that safe current evidence or it can reject a
  // correct lesson merely because the subject is abbreviated.
  const currentEvidence = `${active} ${isolation.retrievalText ?? ""}`.toLowerCase();
  const has = (pattern: RegExp) => pattern.test(text);
  const activeHas = (pattern: RegExp) => pattern.test(active);
  const evidenceHas = (pattern: RegExp) => pattern.test(currentEvidence);
  const negated = (pattern: RegExp) => isolation.negatedTopics.some((topic) => pattern.test(topic));

  if (isolation.securityIntent.detected) return { score: -100, reason: "security override: retrieval prohibited" };
  if (isolation.primaryIssueHint === "role_permission" && has(/guest|collaborator|external invitation/) && !evidenceHas(/guest|collaborator|invitation/)) return { score: -100, reason: "object mismatch: guest/collaborator lesson is not the active role-permission issue" };
  if (isolation.primaryIssueHint === "refund_investigation" && has(/duplicate|invoice duplication|two charges/) && !activeHas(/duplicate|twice|two charges|doubled/)) return { score: -100, reason: "object mismatch: duplicate-charge lesson is not the refund investigation" };
  if (isolation.primaryIssueHint === "report_export_timeout" && has(/encoding|csv|garbled|character|spreadsheet/) && !activeHas(/encoding|csv|garbled|character/)) return { score: -100, reason: "stage mismatch: encoding lesson is not the report timeout" };
  if (isolation.primaryIssueHint === "activation_failure" && has(/login|password reset|account access/) && !activeHas(/login|password|masuk|kata sandi/)) return { score: -100, reason: "intent mismatch: login lesson is not activation/invitation failure" };
  if (isolation.primaryIssueHint === "duplicate_invoice"
      && has(/seat change|seat reconciliation|plan change|quantity change|headcount change/)
      && !evidenceHas(/(?:changed|change|increase|decrease|added|removed|reduced|increased)\s+(?:the\s+)?(?:number of\s+)?seats?|(?:seats?|plan|quantity|headcount)\s+(?:changed|change|increased|decreased|added|removed)/)) {
    return { score: -100, reason: "root-cause mismatch: duplicate invoice evidence does not establish a seat or plan change" };
  }
  if (isolation.negatedTopics.length > 0 && has(new RegExp(isolation.negatedTopics.join("|"), "i")) && !activeHas(new RegExp(isolation.negatedTopics.join("|"), "i"))) return { score: -100, reason: "negated topic veto" };
  if (isolation.object && has(new RegExp(isolation.object.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))) return { score: 12, reason: `compatible object: ${isolation.object}` };
  return { score: 1, reason: "category-compatible candidate; no stronger object confirmation" };
}

/**
 * "Better" means intrinsic similarity only. Usage, recency, and trust are
 * historical metadata and must not decide which candidate wins a tie.
 */
function isBetterMatch(candidate: KnowledgeMatch, current: KnowledgeMatch): boolean {
  return compareKnowledgeMatches(candidate, current) < 0;
}
