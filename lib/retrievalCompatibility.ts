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
  { id: "offline-synchronization", aliases: ["offline", "reconnect", "reconnecting", "synchronization", "synchronize", "sync conflict", "newer copy"] },
  { id: "billing-document", aliases: ["invoice", "billing", "charge", "payment", "receipt"] },
  { id: "authentication", aliases: ["login", "log in", "sign in", "password", "authentication", "sso", "saml"] },
  {
    id: "role-workspace-access",
    aliases: ["guest workspace", "external collaborator", "shared workspace", "project access", "workspace access", "permission denied", "access denied", "role-based access"],
    minimumAliases: 1
  },
  { id: "notification-delivery", aliases: ["notification settings", "notification", "settings", "email delivery", "recipient", "bounce", "suppression", "alert"], minimumAliases: 2 },
  { id: "report-export", aliases: ["report", "export", "csv", "spreadsheet", "download"] },
  { id: "integration-callback", aliases: ["webhook", "callback", "signature", "signing", "api endpoint"], minimumAliases: 2 },
  { id: "delivery-tracking", aliases: ["delivery", "shipment", "tracking", "package"] },
  { id: "product-version", aliases: ["version", "update", "installation", "install"] }
];

const CATEGORY_UNKNOWN = new Set(["general", "uncategorized"]);

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\u2018\u2019]/gu, "'").replace(/\s+/gu, " ").trim();
}

function aliasPresent(text: string, alias: string): boolean {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(text);
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
    item.tags.join(" "),
    ...(item.lessons ?? []).flatMap((lesson) => [lesson.title, lesson.rootCause, ...lesson.signals]),
    ...(item.exampleTickets ?? []).map((example) => example.originalIssue)
  ].filter(Boolean).join(" ");
}

export function assessRetrievalCompatibility(
  understanding: Understanding,
  item: KnowledgeItem
): RetrievalCompatibility {
  const current = facetsFor(currentEvidenceText(understanding));
  const candidate = facetsFor(candidateEvidenceText(item));
  const currentFacets = [...current].sort();
  const candidateFacets = [...candidate].sort();
  const sharedFacets = currentFacets.filter((facet) => candidate.has(facet));
  const categoryUnknown = CATEGORY_UNKNOWN.has(normalize(understanding.category));
  const currentEvidence = facetEvidenceFor(currentEvidenceText(understanding));
  const candidateEvidence = facetEvidenceFor(candidateEvidenceText(item));
  const strongCurrentFacet = currentFacets.some((facet) => (currentEvidence.get(facet) ?? 0) >= 2);
  const strongCandidateFacet = candidateFacets.some((facet) => (candidateEvidence.get(facet) ?? 0) >= 2);
  const sharedSpecificFacets = sharedFacets.filter((facet) => facet !== "mobile-device");
  const candidateHasSpecificProblemFacet = candidateFacets.some((facet) => facet !== "mobile-device");

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
