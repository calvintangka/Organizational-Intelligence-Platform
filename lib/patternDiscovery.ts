import type { EmergingPattern } from "@/types/patterns";
import type { Understanding } from "@/types/oip";
import type { Ticket, KnowledgeItem } from "@/types";
import { withCanonicalProblemDefaults } from "@/lib/canonicalProblemEngine";

const PATTERN_MERGE_THRESHOLD = 40;
const CONTENT_MATCH_THRESHOLD = 45;

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function makeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const STOP_WORDS = new Set([
  "the", "and", "but", "for", "not", "can", "are", "was", "has", "have",
  "been", "being", "will", "would", "could", "should",
  "my", "our", "your", "its", "his", "her", "their",
  "this", "that", "these", "those",
  "with", "from", "into", "about"
]);

const CONTENT_STOP_WORDS = new Set([
  ...STOP_WORDS,
  "customer", "customers", "app", "error", "issue", "problem",
  "help", "please", "need", "want", "support", "see", "sees",
  "says", "said", "shows", "showing", "appears", "gets",
  "temporary", "still", "keep", "keeps"
]);

const TITLE_STOP_WORDS = new Set([
  ...STOP_WORDS,
  "customer", "please", "help", "need", "want", "issue", "problem",
  "too", "very", "just", "also", "still",
  "before", "after", "during", "when", "while",
  "because", "since", "reports", "detected", "signals", "key"
]);

/**
 * Check whether a ticket's content meaningfully overlaps with any existing
 * canonical problem — using keyword-level specificity, not just category.
 *
 * This prevents tickets that share a CATEGORY with a canonical problem (e.g.
 * both "Billing") but describe a DIFFERENT specific issue (e.g. "QR timeout"
 * vs "payment authorization") from being treated as strong matches.
 */
export function hasSpecificCanonicalMatch(
  understanding: Understanding,
  knowledgeItems: KnowledgeItem[]
): boolean {
  const inputTokens = new Set(
    tokenize(
      `${understanding.summary} ${understanding.coreProblem} ${understanding.tags.join(" ")} ${understanding.detectedSignals.join(" ")}`
    )
  );

  for (const raw of knowledgeItems) {
    const item = withCanonicalProblemDefaults(raw);
    const sameCategory =
      item.category.toLowerCase() === understanding.category.toLowerCase();
    const tagOverlap = item.tags.filter((t) => understanding.tags.includes(t));
    const tagSet = new Set([...item.tags, ...understanding.tags, item.category.toLowerCase()]);
    const itemTokens = tokenize(
      `${item.canonicalProblemTitle ?? item.title} ${item.problemSummary ?? item.problem}`
    );
    const keywordOverlap = itemTokens.filter(
      (t) => inputTokens.has(t) && !CONTENT_STOP_WORDS.has(t) && !tagSet.has(t)
    );

    const score =
      (sameCategory ? 25 : 0) +
      Math.min(tagOverlap.length * 6, 24) +
      Math.min(keywordOverlap.length * 3, 18);

    if (score >= CONTENT_MATCH_THRESHOLD) return true;
  }

  return false;
}

function scorePatternMatch(
  understanding: Understanding,
  ticket: Ticket,
  pattern: EmergingPattern
): number {
  const sameCategory =
    understanding.category.toLowerCase() === pattern.category.toLowerCase();
  const tagOverlap = understanding.tags.filter((t) =>
    pattern.tags.includes(t)
  );

  const ticketTokens = new Set(
    tokenize(`${ticket.subject} ${ticket.description}`)
  );
  const patternTokens = new Set(pattern.keywords);
  const keywordOverlap = [...ticketTokens].filter((t) =>
    patternTokens.has(t)
  );

  return (
    (sameCategory ? 25 : 0) +
    Math.min(tagOverlap.length * 8, 24) +
    Math.min(keywordOverlap.length * 5, 30)
  );
}

function generatePatternTitle(
  _understanding: Understanding,
  ticket: Ticket
): string {
  const text = ticket.subject || ticket.description;
  const words = text.split(/\s+/).filter((w) => w.length > 1);
  const meaningful = words.filter(
    (w) => !TITLE_STOP_WORDS.has(w.toLowerCase())
  );

  if (meaningful.length === 0) return `${_understanding.category} Issue`;

  return meaningful
    .slice(0, 3)
    .map((w) => {
      if (w.length <= 4 && w === w.toUpperCase()) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

export function detectEmergingPattern(
  ticket: Ticket,
  understanding: Understanding,
  existingPatterns: EmergingPattern[]
): { pattern: EmergingPattern; isNew: boolean } | null {
  let bestMatch: EmergingPattern | null = null;
  let bestScore = 0;

  for (const pattern of existingPatterns) {
    if (pattern.status === "promoted" || pattern.status === "dismissed")
      continue;
    const score = scorePatternMatch(understanding, ticket, pattern);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = pattern;
    }
  }

  if (bestMatch && bestScore >= PATTERN_MERGE_THRESHOLD) {
    return { pattern: bestMatch, isNew: false };
  }

  const now = new Date().toISOString();
  const title = generatePatternTitle(understanding, ticket);
  const ticketTokens = tokenize(`${ticket.subject} ${ticket.description}`);

  const newPattern: EmergingPattern = {
    id: `pattern-${makeSlug(title)}-${Date.now()}`,
    title,
    summary: understanding.coreProblem,
    category: understanding.category,
    tags: [...understanding.tags],
    keywords: [...new Set(ticketTokens.filter((t) => !STOP_WORDS.has(t)))],
    exampleTickets: [
      {
        ticketId: ticket.id,
        customerName: ticket.customerName,
        originalIssue: ticket.description,
        createdAt: ticket.createdAt
      }
    ],
    timesSeen: 1,
    confidenceScore: 0,
    suggestedCanonicalProblem: false,
    status: "monitoring",
    firstSeenAt: now,
    lastSeenAt: now
  };

  newPattern.confidenceScore = calculatePatternConfidence(newPattern);

  return { pattern: newPattern, isNew: true };
}

export function upsertEmergingPattern(
  patterns: EmergingPattern[],
  ticket: Ticket,
  understanding: Understanding,
  matchedPattern: EmergingPattern
): EmergingPattern[] {
  const now = new Date().toISOString();
  const ticketTokens = tokenize(`${ticket.subject} ${ticket.description}`);
  const newKeywords = ticketTokens.filter((t) => !STOP_WORDS.has(t));

  const alreadySeen = matchedPattern.exampleTickets.some(
    (e) => e.ticketId === ticket.id
  );

  const updated: EmergingPattern = {
    ...matchedPattern,
    tags: [...new Set([...matchedPattern.tags, ...understanding.tags])],
    keywords: [...new Set([...matchedPattern.keywords, ...newKeywords])],
    exampleTickets: alreadySeen
      ? matchedPattern.exampleTickets
      : [
          ...matchedPattern.exampleTickets,
          {
            ticketId: ticket.id,
            customerName: ticket.customerName,
            originalIssue: ticket.description,
            createdAt: ticket.createdAt
          }
        ],
    timesSeen: matchedPattern.timesSeen + (alreadySeen ? 0 : 1),
    lastSeenAt: now
  };

  updated.confidenceScore = calculatePatternConfidence(updated);
  updated.status = derivePatternStatus(updated);
  updated.suggestedCanonicalProblem = shouldSuggestCanonicalProblem(updated);

  return patterns.map((p) => (p.id === matchedPattern.id ? updated : p));
}

export function calculatePatternConfidence(pattern: EmergingPattern): number {
  const seenScore = Math.min(pattern.timesSeen * 12, 50);
  const keywordScore = Math.min(pattern.keywords.length, 15);
  const tagScore = Math.min(pattern.tags.length * 2, 10);
  const hoursSinceLastSeen =
    (Date.now() - new Date(pattern.lastSeenAt).getTime()) / (1000 * 60 * 60);
  const recencyScore =
    hoursSinceLastSeen < 24 ? 10 : hoursSinceLastSeen < 168 ? 5 : 0;

  return Math.min(seenScore + keywordScore + tagScore + recencyScore, 100);
}

function derivePatternStatus(
  pattern: EmergingPattern
): EmergingPattern["status"] {
  if (pattern.status === "promoted" || pattern.status === "dismissed")
    return pattern.status;
  if (pattern.timesSeen >= 3 && pattern.confidenceScore >= 60)
    return "suggested";
  return "monitoring";
}

export function shouldSuggestCanonicalProblem(
  pattern: EmergingPattern
): boolean {
  return pattern.timesSeen >= 5 && pattern.confidenceScore >= 75;
}

export function promotePatternToCanonicalProblem(
  pattern: EmergingPattern
): KnowledgeItem {
  const now = new Date().toISOString();
  const id = `canonical-${makeSlug(pattern.title)}`;

  return {
    id,
    title: pattern.title,
    problem: pattern.summary,
    approvedAnswer: "",
    category: pattern.category,
    tags: pattern.tags,
    sourceTicketId: pattern.exampleTickets[0]?.ticketId ?? "unknown",
    timesReused: 0,
    createdAt: pattern.firstSeenAt,
    approvedAt: now,
    lifecycleState: "active",
    canonicalProblemId: id,
    canonicalProblemTitle: pattern.title,
    problemSummary: pattern.summary,
    timesSeen: pattern.timesSeen,
    successfulResolutions: 0,
    failedResolutions: 0,
    successRate: 100,
    trustScore: Math.min(20 + Math.floor(pattern.timesSeen * 3), 35),
    lastUsedAt: pattern.lastSeenAt,
    lastValidatedAt: now,
    autoResponseEligible: false,
    humanReviewCount: 0,
    automaticResolutionCount: 0,
    exampleTickets: pattern.exampleTickets.map((e) => ({
      ...e,
      resolutionMode: "pending" as const
    })),
    knowledgeVersions: [
      {
        versionId: `${id}-v1`,
        createdAt: now,
        changeReason: "Promoted from emerging pattern",
        sourceTicketId: pattern.exampleTickets[0]?.ticketId ?? "unknown"
      }
    ],
    learningHistory: [
      {
        id: `${id}-history-1`,
        event: "Promoted from emerging pattern",
        detail: `Pattern "${pattern.title}" seen ${pattern.timesSeen} times with ${pattern.confidenceScore}% confidence`,
        createdAt: now
      }
    ]
  };
}
