import type { KnowledgeItem, Understanding } from "@/types";

export type RetrievalCompatibilityState = "compatible" | "incompatible" | "unknown";

export interface RetrievalCompatibility {
  state: RetrievalCompatibilityState;
  score: number;
  code: "COMPATIBLE_EVIDENCE" | "DOMAIN_CONFLICT" | "INSUFFICIENT_COMPATIBILITY_EVIDENCE" | "NO_STRUCTURED_FACET";
  reason: string;
  currentFacets: string[];
  candidateFacets: string[];
  sharedFacets: string[];
}

/**
 * Deterministic problem facets used as a retrieval safety boundary.
 *
 * These are broad, reusable evidence groups rather than category pairs or
 * product-specific rules. A single generic noun never creates a facet; a
 * facet is only present when its aliases describe a concrete problem domain.
 */
const PROBLEM_FACETS: Array<{ id: string; aliases: string[]; minimumAliases?: number }> = [
  { id: "mobile-device", aliases: ["mobile app", "mobile application", "android", "ios", "iphone", "ipad", "tablet", "handset", "mobile"] },
  { id: "attendance-checkin", aliases: ["clock in", "clock-in", "check in", "check-in", "attendance", "timekeeping"] },
  { id: "location-access", aliases: ["location permission", "location access", "device location", "geolocation", "gps"], minimumAliases: 1 },
  { id: "offline-synchronization", aliases: ["offline", "reconnect", "reconnected", "reconnecting", "synchronization", "synchronizing", "synchronized", "synchronize", "syncing", "sync conflict", "newer copy"] },
  // A transition facet keeps a generic synchronization symptom from making
  // every synchronization failure look like the same reusable lesson. The
  // aliases are intentionally generic and cover ordinary inflection and
  // movement wording without encoding a product or fixture.
  { id: "network-transition-synchronization", aliases: ["roaming", "roam", "network band", "network bands", "move between", "moving between", "movement between", "scanning zones"] },
  { id: "billing-document", aliases: ["invoice", "billing", "charge", "payment", "receipt"] },
  { id: "authentication", aliases: ["login", "log in", "sign in", "password", "authentication", "certificate", "certificates", "device authentication", "sso", "saml"] },
  {
    id: "role-workspace-access",
    aliases: ["guest workspace", "external collaborator", "shared workspace", "project access", "workspace access", "permission denied", "access denied", "role-based access"],
    minimumAliases: 1
  },
  { id: "notification-delivery", aliases: ["notification settings", "notification", "settings", "email delivery", "recipient", "bounce", "suppression", "alert"], minimumAliases: 2 },
  { id: "report-export", aliases: ["report", "export", "csv", "spreadsheet", "download"] },
  { id: "integration-callback", aliases: ["webhook", "callback", "signature", "signing", "api endpoint"], minimumAliases: 2 },
  { id: "delivery-tracking", aliases: ["delivery", "shipment", "tracking", "package"] },
  { id: "product-version", aliases: ["version", "update", "installation", "install"] },
  // Neutral Organizational Memories use OPERATIONAL_EVENT as their source
  // category. These facets provide a bounded, reusable vocabulary for the
  // operational domains that do not fit the customer-support categories above.
  // They are deliberately multi-signal gates: a generic noun such as
  // "assignment" or "branch" cannot authorize a candidate by itself.
  { id: "account-lockout", aliases: ["account lockout", "locked out", "temporary lockout", "failed sign-in", "failed login", "wrong password"], minimumAliases: 1 },
  { id: "branch-dns-resolution", aliases: ["branch", "dns", "hostname", "resolution", "forwarder", "internal host"], minimumAliases: 2 },
  { id: "dispatch-assignment-coordination", aliases: ["dispatch board", "assignment", "urgent job", "handover", "stale board", "duplicate assignment"], minimumAliases: 2 },
  {
    id: "technician-region-transfer",
    aliases: [
      "transferred technician",
      "service region",
      "regional dispatch",
      "dispatch selection",
      "region code",
      "technician transfer",
      "technician",
      "region",
      "available technician",
      "moved"
    ],
    // Role, location, availability, and movement are broad in isolation. Require
    // a three-signal combination before assigning the technician-placement facet.
    minimumAliases: 3
  },
  { id: "expired-assignment-entitlement", aliases: ["temporary assignment", "assignment end date", "assignment ended", "entitlement", "eligible assignment", "assignment expired", "current assignment"], minimumAliases: 2 },
  { id: "regional-roster-access", aliases: ["regional roster", "reader group", "reader-group", "roster access", "roster group", "roster portal", "access denied"], minimumAliases: 2 },
  { id: "mobile-stale-session", aliases: ["stale data", "assignment snapshot", "tablet", "reconnect", "reconnected", "application session", "current assignment list"], minimumAliases: 2 }
];

const CATEGORY_UNKNOWN = new Set(["general", "uncategorized"]);

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\u2018\u2019]/gu, "'").replace(/\s+/gu, " ").trim();
}

function aliasPresent(text: string, alias: string): boolean {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(text);
}

function containsCanonicalTitle(text: string, item: KnowledgeItem): boolean {
  const normalizedText = normalize(text);
  const titles = [item.canonicalProblemTitle, item.title]
    .filter((title): title is string => typeof title === "string")
    .map((title) => normalize(title))
    .filter((title) => title.length >= 12);
  return titles.some((title) => normalizedText.includes(title));
}

function facetEvidenceFor(text: string): Map<string, number> {
  const normalized = normalize(text);
  return new Map(PROBLEM_FACETS
    .map((facet) => [facet.id, facet.aliases.filter((alias) => aliasPresent(normalized, normalize(alias))).length] as const)
    .filter(([id, count]) => count >= (PROBLEM_FACETS.find((facet) => facet.id === id)?.minimumAliases ?? 1)));
}

function facetsFor(text: string): Set<string> {
  return new Set(facetEvidenceFor(text).keys());
}

function currentEvidenceText(understanding: Understanding): string {
  const isolation = understanding.intentIsolation;
  return [
    isolation?.retrievalText,
    isolation?.activeProblemText,
    understanding.retrievalText,
    understanding.originalText,
    understanding.coreProblem,
    understanding.tags.join(" ")
  ].filter(Boolean).join(" ");
}

function candidateEvidenceText(item: KnowledgeItem): string {
  return [
    item.canonicalProblemTitle,
    item.title,
    item.problemSummary,
    item.problem,
    item.scopeNote,
    item.tags.join(" "),
    ...(item.resolutionWorkflow ?? []),
    item.internalGuidance,
    item.customerResponseTemplate,
    ...(item.lessons ?? []).flatMap((lesson) => [lesson.title, lesson.rootCause, ...lesson.signals]),
    ...(item.exampleTickets ?? []).map((example) => example.originalIssue)
  ].filter(Boolean).join(" ");
}

type OperationalCondition = "healthy" | "outage" | null;

function operationalConditionFor(text: string): OperationalCondition {
  const normalized = normalize(text);
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

export function assessRetrievalCompatibility(
  understanding: Understanding,
  item: KnowledgeItem
): RetrievalCompatibility {
  const currentText = currentEvidenceText(understanding);
  const candidateText = candidateEvidenceText(item);
  const current = facetsFor(currentText);
  const candidate = facetsFor(candidateText);
  const currentFacets = [...current].sort();
  const candidateFacets = [...candidate].sort();
  const sharedFacets = currentFacets.filter((facet) => candidate.has(facet));
  const categoryUnknown = CATEGORY_UNKNOWN.has(normalize(understanding.category));
  const currentEvidence = facetEvidenceFor(currentText);
  const candidateEvidence = facetEvidenceFor(candidateText);
  const currentCondition = operationalConditionFor(currentText);
  const candidateCondition = operationalConditionFor(candidateText);
  const strongCurrentFacet = currentFacets.some((facet) => (currentEvidence.get(facet) ?? 0) >= 2);
  const strongCandidateFacet = candidateFacets.some((facet) => (candidateEvidence.get(facet) ?? 0) >= 2);
  const sharedSpecificFacets = sharedFacets.filter((facet) => facet !== "mobile-device");
  const candidateHasSpecificProblemFacet = candidateFacets.some((facet) => facet !== "mobile-device");
  const symptomFacets = new Set(["mobile-device", "offline-synchronization"]);
  const currentRootCauseFacets = currentFacets.filter((facet) => !symptomFacets.has(facet));
  const candidateRootCauseFacets = candidateFacets.filter((facet) => !symptomFacets.has(facet));
  const transitionFacet = "network-transition-synchronization";
  const currentTextNormalized = normalize(currentText);
  const candidateRequiresTransitionEvidence = candidate.has(transitionFacet);

  // A healthy backend and a backend outage are different operational
  // conditions even when both cases mention scanners and synchronization.
  // Keep this generic so it protects other operational domains without
  // encoding the warehouse fixture into retrieval.
  if (currentCondition && candidateCondition && currentCondition !== candidateCondition) {
    return {
      state: "incompatible",
      score: -100,
      code: "DOMAIN_CONFLICT",
      reason: `Operational condition conflicts: current ${currentCondition} vs candidate ${candidateCondition}.`,
      currentFacets,
      candidateFacets,
      sharedFacets
    };
  }

  // An exact, sufficiently descriptive canonical title is direct identity
  // evidence. It must still pass the condition conflict check above, and it
  // only admits the candidate to retrieval; drafting continues through the
  // existing lesson/grounding gates. This is needed for neutral operational
  // memories whose category is intentionally OPERATIONAL_EVENT and whose
  // domain may not yet have a structured facet.
  if (containsCanonicalTitle(currentText, item)) {
    return {
      state: "compatible",
      score: 24,
      code: "COMPATIBLE_EVIDENCE",
      reason: "Exact canonical Memory title is present in the current request.",
      currentFacets,
      candidateFacets,
      sharedFacets
    };
  }

  // Shared synchronization/offline wording is a symptom, not a root cause.
  // When both sides expose distinct structured causes, require a shared cause
  // before a candidate can survive unknown-category retrieval.
  if (
    categoryUnknown &&
    currentRootCauseFacets.length > 0 &&
    candidateRootCauseFacets.length > 0 &&
    !currentRootCauseFacets.some((facet) => candidateRootCauseFacets.includes(facet))
  ) {
    return {
      state: "incompatible",
      score: -100,
      code: "DOMAIN_CONFLICT",
      reason: `Structured root-cause facets conflict: current ${currentRootCauseFacets.join(", ")} vs candidate ${candidateRootCauseFacets.join(", ")}.`,
      currentFacets,
      candidateFacets,
      sharedFacets
    };
  }

  // A generic synchronization symptom is not enough to reuse a lesson whose
  // applicability depends on a network transition. This keeps certificate
  // and backend-wide failures from becoming strong matches when the current
  // category is otherwise unknown.
  if (categoryUnknown && candidateRequiresTransitionEvidence && !sharedFacets.includes(transitionFacet)) {
    return {
      state: "incompatible",
      score: -100,
      code: "INSUFFICIENT_COMPATIBILITY_EVIDENCE",
      reason: `Candidate requires shared transition evidence: ${transitionFacet}.`,
      currentFacets,
      candidateFacets,
      sharedFacets
    };
  }

  // Firmware-specific findings are a distinct root-cause family from a
  // network-transition lesson. The memory can remain historically inspectable
  // after a scope update, but it must not be presented as applicable guidance.
  if (candidateRequiresTransitionEvidence && /\bfirmware\b/iu.test(currentTextNormalized)) {
    return {
      state: "incompatible",
      score: -100,
      code: "DOMAIN_CONFLICT",
      reason: "Current evidence identifies a firmware-specific cause, which conflicts with the candidate's network-transition scope.",
      currentFacets,
      candidateFacets,
      sharedFacets
    };
  }

  if (currentFacets.length > 0 && candidateFacets.length > 0 && sharedFacets.length === 0
      && (categoryUnknown || (strongCurrentFacet && strongCandidateFacet))) {
    return {
      state: "incompatible",
      score: -100,
      code: "DOMAIN_CONFLICT",
      reason: `Structured problem facets conflict: current ${currentFacets.join(", ")} vs candidate ${candidateFacets.join(", ")}.`,
      currentFacets,
      candidateFacets,
      sharedFacets
    };
  }

  // A shared product surface is not enough to authorize a specific lesson.
  // For example, two tickets can mention a mobile app while describing
  // unrelated attendance, synchronization, or access problems.
  if (sharedFacets.length > 0 && sharedSpecificFacets.length === 0 && candidateHasSpecificProblemFacet
      && categoryUnknown) {
    return {
      state: "incompatible",
      score: -100,
      code: "DOMAIN_CONFLICT",
      reason: `Only a broad product-surface facet overlaps; candidate-specific problem facets remain unsupported: ${candidateFacets.filter((facet) => facet !== "mobile-device").join(", ")}.`,
      currentFacets,
      candidateFacets,
      sharedFacets
    };
  }

  if (sharedFacets.length > 0) {
    return {
      state: "compatible",
      score: Math.min(24, sharedFacets.length * 8),
      code: "COMPATIBLE_EVIDENCE",
      reason: `Shared problem evidence: ${sharedFacets.join(", ")}.`,
      currentFacets,
      candidateFacets,
      sharedFacets
    };
  }

  if (categoryUnknown) {
    return {
      state: "incompatible",
      score: -100,
      code: "INSUFFICIENT_COMPATIBILITY_EVIDENCE",
      reason: "Category is unknown and no concrete problem facet is shared with the candidate.",
      currentFacets,
      candidateFacets,
      sharedFacets
    };
  }

  return {
    state: "unknown",
    score: 0,
    code: "NO_STRUCTURED_FACET",
    reason: "No structured problem facet was available; existing category and root-cause gates remain authoritative.",
    currentFacets,
    candidateFacets,
    sharedFacets
  };
}
