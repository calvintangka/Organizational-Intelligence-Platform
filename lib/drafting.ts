import type { Ticket } from "@/types";
import type { Understanding } from "@/types/oip";
import type { KnowledgeItem, KnowledgeMatch, OrganizationProfile, SuggestedResponse, Lesson } from "@/types";
import {
  getCustomerResponseTemplate,
  renderCustomerResponse,
  renderCustomerTemplateForTicket,
  resolveCustomerAddressingName,
  resolveLessonIdForItem
} from "@/lib/canonicalProblemEngine";
import { defaultOrganizationProfile } from "@/data/seedOrganizationProfiles";
import {
  assessRootCauseEvidenceState,
  applyRootCauseSafeLanguage,
  rootCauseEvidenceNote
} from "@/lib/rootCauseSafety";
import { extractConcepts, GENERIC_CONCEPT_IDS } from "@/lib/conceptExtraction";
import { DEFAULT_LANGUAGE, detectLanguage } from "@/lib/languageDetection";
import { foldForMatching } from "@/lib/textNormalization";
import { assessRetrievalCompatibility } from "@/lib/retrievalCompatibility";

/**
 * Is there an actual message here, rather than a bare term?
 *
 * Script-aware for the same reason alias specificity is: a CJK sentence carries
 * roughly a morpheme per character, so "我的密码被拒绝，无法登录" says as much in 12
 * characters as a Latin sentence says in 40. One shared bar would either let a
 * bare Latin word through or reject a complete CJK ticket.
 */
const MIN_LATIN_TICKET_LENGTH = 20;
const MIN_NON_LATIN_TICKET_LENGTH = 8;

function hasSubstantiveContent(text: string): boolean {
  const folded = foldForMatching(text);
  const nonLatin = /[^\p{Script=Latin}\p{N}\s]/u.test(folded);
  return folded.length >= (nonLatin ? MIN_NON_LATIN_TICKET_LENGTH : MIN_LATIN_TICKET_LENGTH);
}

const UNCATEGORIZED_CATEGORY = "Uncategorized";
const UNCATEGORIZED_PLACEHOLDER = "This issue type is new to the organization. Please write a response below and teach OIP through the Reflection step.";

/**
 * Which knowledge item categories are valid draft sources for a given ticket category.
 * A knowledge item may only contribute its customer response template when its category
 * is compatible with the current ticket's category. Trust and similarity rankings happen
 * before this check - this gate ensures we never use an Activation template for a Login
 * issue (or any other cross-category mismatch) regardless of trust score.
 */
const COMPATIBLE_CATEGORIES: Record<string, string[]> = {
  "Business Inquiry": ["Business Inquiry"],
  Activation: ["Activation"],
  // Two-Factor Auth is its own canonical problem - not compatible with Login templates
  "Two-Factor Auth": ["Two-Factor Auth"],
  Login: ["Login", "Account Access"],
  "Account Access": ["Login", "Account Access"],
  Billing: ["Billing", "Refund"],
  Refund: ["Billing", "Refund"],
  Subscription: ["Subscription"],
  Delivery: ["Delivery", "Delivery Delay", "Package Tracking"],
  "Delivery Delay": ["Delivery", "Delivery Delay", "Package Tracking"],
  "Package Tracking": ["Delivery", "Delivery Delay", "Package Tracking"],
  "Lost Package": ["Lost Package", "Delivery"],
  "Address Change": ["Address Change", "Delivery"],
  "Courier Issue": ["Courier Issue", "Delivery"],
  "Client Portal Access": ["Client Portal Access"],
  "Consultation Booking": ["Consultation Booking", "Appointment Rescheduling"],
  "Appointment Rescheduling": ["Consultation Booking", "Appointment Rescheduling"],
  "Document Status": ["Document Status"],
  "Product Version": ["Product Version", "Compatibility", "Application Stability"],
  Installation: ["Installation"],
  Compatibility: ["Compatibility", "Product Version"],
  Performance: ["Performance"],
  "Application Stability": ["Application Stability", "Product Version", "Compatibility"],
  General: []
};

type RootCauseFamily =
  | "credential_mismatch"
  | "credential_unavailable"
  | "account_locked"
  | "email_recovery"
  | "two_factor"
  | "invoice_question"
  | "payment_authorization"
  | "subscription_change"
  | "delivery_tracking"
  | "portal_access"
  | "scheduling"
  | "document_status"
  | "installation"
  | "compatibility"
  | "performance"
  | "stability"
  | "unknown";

interface RootCauseProfile {
  family: RootCauseFamily;
  evidence: string[];
}

export interface RootCauseCompatibility {
  compatible: boolean;
  reason: string;
  ticketFamily: RootCauseFamily;
  itemFamily: RootCauseFamily;
  /** True when the rejection is an explicit contradiction — a hard veto that no fallback may override. */
  contradiction?: boolean;
}

const ROOT_CAUSE_EVIDENCE: Array<{ family: Exclude<RootCauseFamily, "unknown">; patterns: RegExp[] }> = [
  {
    family: "credential_unavailable",
    patterns: [
      /\bnew\s+(?:laptop|computer|device)\b/i,
      /\b(?:saved|stored)\s+password\b[^.!?\n]{0,80}\b(?:did not|didn't|does not|doesn't|failed to)\s+(?:transfer|carry|move|sync)\b/i,
      /\b(?:never|do not|don't|did not|didn't)\s+(?:memorize|remember|know)\s+(?:the\s+)?password\b/i,
      /\bpassword\b[^.!?\n]{0,60}\b(?:did not|didn't|does not|doesn't|failed to)\s+(?:transfer|carry|move|sync)\b/i,
      /\bforgot(?:ten)?\s+(?:my\s+)?password\b/i,
      /\bdo not know\s+(?:the\s+)?password\b/i
    ]
  },
  {
    family: "credential_mismatch",
    patterns: [
      /\binvalid credentials?\b/i,
      /\bincorrect password\b/i,
      /\bcredentials?\s+(?:are|were|being)\s+rejected\b/i,
      /\bpassword\s+is\s+(?:correct|working)\b/i,
      /\bexpected\s+(?:the\s+)?(?:password|credentials?)\s+to\s+work\b/i,
      /\bcaps\s+lock\b/i,
      /\bolder\s+(?:password|value)\b/i,
      /\bpassword\s+(?:was|were)\s+changed\s+on\s+another\s+device\b/i
    ]
  },
  {
    family: "account_locked",
    patterns: [/\baccount\s+locked\b/i, /\blocked\s+out\b/i, /\baccount\s+(?:blocked|suspended)\b/i]
  },
  {
    family: "email_recovery",
    patterns: [/\bforgot\s+(?:my\s+)?(?:account\s+)?email\b/i, /\b(?:retrieve|recover)\s+(?:my\s+)?(?:login\s+)?email\b/i]
  },
  {
    family: "two_factor",
    patterns: [/\btwo[- ]factor\b/i, /\b2fa\b/i, /\bauthenticator\b/i, /\bverification\s+code\b/i, /\botp\b/i, /\bbackup\s+codes?\b/i]
  },
  {
    family: "invoice_question",
    patterns: [/\binvoice\b/i, /\bbilled\s+amount\b/i, /\binvoice\s+reference\b/i]
  },
  {
    family: "payment_authorization",
    patterns: [/\bpending\s+authorization\b/i, /\bfailed\s+payment\b/i, /\bbank\s+(?:app|account)\b/i, /\btransaction\b/i]
  },
  {
    family: "subscription_change",
    patterns: [/\bcancel(?:l)?(?:ing|ation)?\b/i, /\bunsubscri(?:be|bed|ption)\b/i, /\brenew(?:al)?\b/i, /\btrial\s+expired\b/i]
  },
  {
    family: "delivery_tracking",
    patterns: [/\btracking\b/i, /\btracking\s+number\b/i, /\bpackage\b/i, /\bshipment\b/i, /\bdelivery\s+(?:delay|window)\b/i]
  },
  {
    family: "portal_access",
    patterns: [/\bclient\s+portal\b/i, /\bportal\s+access\b/i, /\bportal\s+login\b/i]
  },
  {
    family: "scheduling",
    patterns: [/\bconsultation\b/i, /\bappointment\b/i, /\bschedul(?:e|ing)\b/i, /\breschedul(?:e|ing)\b/i]
  },
  {
    family: "document_status",
    patterns: [/\bdocument\s+status\b/i, /\bfiling\s+status\b/i, /\bcase\s+document\b/i]
  },
  {
    family: "installation",
    patterns: [/\binstall(?:ation|er)?\b/i, /\breinstall\b/i, /\bsetup\b/i]
  },
  {
    family: "compatibility",
    patterns: [/\bcompatib(?:ility|le)\b/i, /\bincompatible\b/i, /\bsystem\s+requirements\b/i]
  },
  {
    family: "performance",
    patterns: [/\bperformance\b/i, /\bslow\b/i, /\blag(?:ging)?\b/i, /\bunresponsive\b/i]
  },
  {
    family: "stability",
    patterns: [/\bcrash(?:es|ed|ing)?\b/i, /\bstartup\b/i, /\b(?:wont|can't|cannot)\s+open\b/i, /\bnot\s+launching\b/i]
  }
];

function classifyRootCause(text: string, intent?: string): RootCauseProfile {
  const evidence = ROOT_CAUSE_EVIDENCE.map(({ family, patterns }) => ({
    family,
    evidence: patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source)
  })).filter((entry) => entry.evidence.length > 0);

  if (evidence.length === 0) return { family: "unknown", evidence: [] };
  const highest = Math.max(...evidence.map((entry) => entry.evidence.length));
  const winners = evidence.filter((entry) => entry.evidence.length === highest);
  if (winners.length !== 1) {
    return { family: "unknown", evidence: winners.flatMap((entry) => entry.evidence) };
  }

  // The deterministic intent is useful evidence only when it is specific and
  // does not conflict with stronger root-cause language in the ticket.
  if (winners[0].family === "credential_mismatch" && intent === "credentials_unavailable") {
    return { family: "credential_unavailable", evidence: winners[0].evidence };
  }
  return { family: winners[0].family, evidence: winners[0].evidence };
}

function knowledgeRootCauseText(item: KnowledgeItem): string {
  return [
    item.title,
    item.canonicalProblemTitle,
    item.problem,
    item.problemSummary,
    item.internalGuidance,
    item.customerResponseTemplate,
    item.approvedAnswer,
    ...(item.tags ?? []),
    ...(item.exampleTickets ?? []).map((example) => example.originalIssue),
    ...(item.lessons ?? []).flatMap((lesson) => [lesson.title, lesson.rootCause, lesson.solution, ...lesson.signals])
  ].filter(Boolean).join(" ");
}

export function assessRootCauseCompatibility(
  understanding: Understanding,
  item: KnowledgeItem,
  ticket: Ticket
): RootCauseCompatibility {
  const ticketText = normalizeLessonSignalText(`${ticket.subject} ${ticket.description}`);
  if (item.category === "Login" && ticketHasExplicitLoginContradiction(ticketText)) {
    return {
      compatible: false,
      reason: "Explicit login contradiction detected; Login template reuse is not authorized.",
      ticketFamily: "unknown",
      itemFamily: "unknown",
      contradiction: true
    };
  }

  const ticketProfile = classifyRootCause(ticketText, understanding.intent);
  const itemProfile = classifyRootCause(knowledgeRootCauseText(item));

  if (ticketProfile.family === "unknown" || itemProfile.family === "unknown") {
    // NOT a contradiction: evidence is merely insufficient. This is the only
    // state a semantic fallback is allowed to resolve.
    return {
      compatible: false,
      reason: "Root-cause evidence is ambiguous; category alone does not authorize template reuse.",
      ticketFamily: ticketProfile.family,
      itemFamily: itemProfile.family
    };
  }

  if (ticketProfile.family !== itemProfile.family) {
    return {
      compatible: false,
      reason: `Root-cause mismatch: ticket is ${ticketProfile.family}, knowledge item is ${itemProfile.family}.`,
      ticketFamily: ticketProfile.family,
      itemFamily: itemProfile.family
    };
  }

  return {
    compatible: true,
    reason: `Root-cause evidence agrees on ${ticketProfile.family}.`,
    ticketFamily: ticketProfile.family,
    itemFamily: itemProfile.family
  };
}

/**
 * TODO-009 Step 3: is this lesson match strong enough EVIDENCE to authorize
 * reuse on its own? The normal path requires >=2 matched signals AND
 * multi-token signal matches. A human-authored lesson may instead contain one
 * complete, root-cause-specific signal, but only when the classified ticket
 * independently affirms at least two meaningful signal tokens. Generic
 * one-word overlaps never qualify, and Uncategorized / General tickets retain
 * the stricter multi-signal rule.
 */
export function isStrongLessonEvidence(
  lessonMatch: LessonMatchResult | null | undefined,
  ticketCategoryClassified = true
): lessonMatch is LessonMatchResult {
  if (!lessonMatch || lessonMatch.score < 1) return false;
  if (lessonMatch.score >= 2) {
    return lessonMatch.multiTokenMatches >= (ticketCategoryClassified ? 1 : 2);
  }

  if (!ticketCategoryClassified || lessonMatch.score !== 1 || lessonMatch.multiTokenMatches !== 1) return false;
  const signal = lessonMatch.matchedSignals[0] ?? "";
  const meaningfulSignalTokens = tokenizeLessonSignal(signal);
  if (meaningfulSignalTokens.length < 3) return false;
  if (lessonMatch.ticketEvidenceCoverage >= 2) return true;
  const evidence = lessonMatch.signalEvidence?.find((entry) => entry.signal === signal);
  return (evidence?.matchedConcepts.length ?? 0) >= 2;
}

function isTicketCategoryClassified(understanding: Understanding): boolean {
  return understanding.category !== UNCATEGORIZED_CATEGORY && understanding.category !== "General";
}

function isStrongValidatedLessonMatch(understanding: Understanding, ticket: Ticket, item: KnowledgeItem): boolean {
  const lessonMatch = findMatchingLesson(ticket, item);
  return isStrongLessonEvidence(lessonMatch, isTicketCategoryClassified(understanding))
    && !ticketContradictsLesson(ticket, lessonMatch.lesson);
}

/**
 * Returns true only when category and root-cause evidence authorize the item as
 * a source of customer-facing templates. A strong validated lesson is the
 * explicit narrow exception because its signals are root-cause-specific.
 */
function isCategoryCompatible(ticketCategory: string, itemCategory: string): boolean {
  return ticketCategory === itemCategory
    || ticketCategory === "General"
    || ticketCategory === UNCATEGORIZED_CATEGORY
    || (Array.isArray(COMPATIBLE_CATEGORIES[ticketCategory]) && COMPATIBLE_CATEGORIES[ticketCategory].includes(itemCategory));
}

export function isCompatibleForDrafting(
  understanding: Understanding,
  item: KnowledgeItem,
  ticket?: Ticket
): boolean {
  if (!isCategoryCompatible(understanding.category, item.category)) {
    // A newly named canonical problem can carry a provisional category equal
    // to its title while the first validated lesson establishes the actual
    // operational boundary. Strong, non-contradictory lesson evidence may
    // bridge that provisional label; ordinary keyword overlap may not.
    const provisionalCategory = item.category === "General"
      || item.category === UNCATEGORIZED_CATEGORY
      || item.category === item.canonicalProblemTitle;
    if (!ticket || !provisionalCategory || !isStrongValidatedLessonMatch(understanding, ticket, item)) return false;
  }
  if (!ticket) return true;
  // A structured domain conflict is a hard veto. It must run before the
  // strong-lesson shortcut so a highly trusted item cannot authorize a
  // cross-domain reuse candidate.
  if (assessCompatibilityDecision(understanding, item, ticket).state === "incompatible") return false;
  if (isStrongValidatedLessonMatch(understanding, ticket, item)) return true;
  return assessCompatibilityDecision(understanding, item, ticket).state === "compatible";
}

export type CompatibilityDecisionState = "compatible" | "incompatible" | "unknown";

export interface CompatibilityDecision {
  state: CompatibilityDecisionState;
  reason: string;
}

/**
 * Three-state deterministic compatibility verdict (TODO-009 Step 2).
 *
 * "compatible"   — existing deterministic evidence authorizes reuse.
 * "incompatible" — a deterministic HARD VETO: category mismatch, explicit
 *                  contradiction, or two KNOWN root-cause families that differ.
 *                  No fallback of any kind may override this state.
 * "unknown"      — root-cause evidence is merely insufficient (a family could
 *                  not be classified). This is the ONLY state the semantic
 *                  fallback is permitted to resolve.
 */
export function assessCompatibilityDecision(
  understanding: Understanding,
  item: KnowledgeItem,
  ticket: Ticket
): CompatibilityDecision {
  if ((item.lessons ?? []).some((lesson) => ticketContradictsLesson(ticket, lesson))) {
    return { state: "incompatible", reason: "Ticket evidence contradicts the lesson's required failure state." };
  }
  const facetCompatibility = assessRetrievalCompatibility(understanding, item);
  if (facetCompatibility.state === "incompatible") {
    return { state: "incompatible", reason: facetCompatibility.reason };
  }
  if (!isCategoryCompatible(understanding.category, item.category)) {
    const provisionalCategory = item.category === "General"
      || item.category === UNCATEGORIZED_CATEGORY
      || item.category === item.canonicalProblemTitle;
    if (provisionalCategory && isStrongValidatedLessonMatch(understanding, ticket, item)) {
      return { state: "compatible", reason: "Strong validated lesson evidence bridges a provisional category." };
    }
    return { state: "incompatible", reason: `Category "${item.category}" is not compatible with ticket category "${understanding.category}".` };
  }
  if (isStrongValidatedLessonMatch(understanding, ticket, item)) {
    return { state: "compatible", reason: "Strong validated lesson match authorizes reuse deterministically." };
  }
  const rootCause = assessRootCauseCompatibility(understanding, item, ticket);
  if (rootCause.compatible) {
    return { state: "compatible", reason: rootCause.reason };
  }
  if (rootCause.contradiction) {
    return { state: "incompatible", reason: rootCause.reason };
  }
  if (rootCause.ticketFamily !== "unknown" && rootCause.itemFamily !== "unknown") {
    return { state: "incompatible", reason: rootCause.reason };
  }
  if ((understanding.category === UNCATEGORIZED_CATEGORY || understanding.category === "General")
      && facetCompatibility.state === "compatible") {
    return { state: "compatible", reason: facetCompatibility.reason };
  }
  if (understanding.category === UNCATEGORIZED_CATEGORY || understanding.category === "General") {
    return { state: "incompatible", reason: "Category is unknown and deterministic compatibility evidence is insufficient." };
  }
  return { state: "unknown", reason: rootCause.reason };
}

/**
 * Candidate-pool gate used immediately after retrieval. Hard-incompatible
 * candidates are removed, while unknown candidates remain available for
 * explainability and the final fail-closed drafting/semantic authorization
 * gate. This keeps the retrieval winner from being replaced by a lower-ranked
 * sibling merely because the winner lacks enough root-cause evidence yet.
 */
export function isRetrievalCandidateEligible(
  understanding: Understanding,
  item: KnowledgeItem,
  ticket: Ticket
): boolean {
  const state = assessCompatibilityDecision(understanding, item, ticket).state;
  // Category-unknown tickets must have positive structured evidence; they may
  // not keep an unknown candidate alive merely because the category is broad.
  // Classified tickets retain the existing unknown state for the semantic
  // fallback, but hard incompatibilities are still rejected here.
  return understanding.category === UNCATEGORIZED_CATEGORY || understanding.category === "General"
    ? state === "compatible"
    : state !== "incompatible";
}

/**
 * A semantic-equivalence confirmation produced by the AI discrimination layer
 * for ONE validated lesson of ONE knowledge item. drafting re-verifies every
 * deterministic gate before honoring it (see authorizeSemanticLessonReuse), so
 * a fabricated authorization can never bypass a hard veto.
 */
export interface SemanticLessonAuthorization {
  itemId: string;
  lessonId: string;
  confidence: "high";
  reasoning: string;
}

// Semantic authorizations are created only by the provider-validation module.
// Keep a non-enumerable module-local brand so callers cannot fabricate a plain
// `{ confidence: "high" }` object and bypass the deterministic boundary.
const SEMANTIC_AUTHORIZATION_BRAND = Symbol("oip.semanticLessonAuthorization");

export function markSemanticLessonAuthorization(
  authorization: SemanticLessonAuthorization
): SemanticLessonAuthorization {
  return Object.defineProperty({ ...authorization }, SEMANTIC_AUTHORIZATION_BRAND, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false
  });
}

/**
 * Fail-closed gatekeeper for semantic lesson reuse. Returns the authorized
 * lesson only when EVERY deterministic condition holds:
 * - the ticket category was actually classified (no Uncategorized/General bypass),
 * - the deterministic decision for this item is exactly "unknown"
 *   (semantic may resolve unknown; it must never override compatible/incompatible),
 * - the authorization references this item and one of its real lessons,
 * - the ticket does not explicitly contradict that lesson,
 * - the semantic confidence is "high".
 * Anything else returns null and the caller keeps the safe no_template path.
 */
export function authorizeSemanticLessonReuse(
  understanding: Understanding,
  item: KnowledgeItem,
  ticket: Ticket,
  authorization: SemanticLessonAuthorization | null | undefined
): Lesson | null {
  if (!authorization) return null;
  if ((authorization as SemanticLessonAuthorization & { [SEMANTIC_AUTHORIZATION_BRAND]?: true })[SEMANTIC_AUTHORIZATION_BRAND] !== true) return null;
  if (authorization.confidence !== "high") return null;
  if (authorization.itemId !== item.id) return null;
  if (understanding.category === UNCATEGORIZED_CATEGORY || understanding.category === "General") return null;
  if (assessCompatibilityDecision(understanding, item, ticket).state !== "unknown") return null;
  const resolvedLessonId = resolveLessonIdForItem(item, authorization.lessonId);
  const lesson = (item.lessons ?? []).find((candidate) => candidate.id === resolvedLessonId);
  if (!lesson) return null;
  if (ticketContradictsLesson(ticket, lesson)) return null;
  return lesson;
}

const CATEGORY_TEMPLATES: Record<string, (ticket: Ticket) => string> = {
  Activation: (t) =>
    `Hi ${t.customerName}, thank you for contacting us. We can help with the activation code issue. Please reply with the activation code you are using, the purchase email, the product version, and a screenshot of the activation error so we can verify the license details safely and guide the next step.`,
  "Two-Factor Auth": (t) =>
    `Hi ${t.customerName}, I understand your two-factor authentication code is not working. Please try these steps: (1) Check that your device clock is set to sync automatically - even a small drift can invalidate codes. (2) Wait for a fresh code to appear in your authenticator app and enter it immediately. (3) If you have backup codes, you can use one of those to regain access. If none of these work, please reply with your account email and we will help you safely re-enroll two-factor authentication.`,
  Login: (t) =>
    `Hi ${t.customerName}, I understand you are having trouble logging in. Please try: (1) Clearing your browser cache and cookies before logging in again. (2) Using the "Forgot Password" option to set a fresh password. (3) If the issue continues after a password reset, let us know what error message appears and we will investigate further.`,
  Billing: (t) =>
    `Hi ${t.customerName}, thank you for contacting us about your payment. If you see a charge on your bank app but our system shows a failed transaction, this is typically a pending authorization that reverses automatically within 3-5 business days. Please do not retry the payment yet. If the charge does not reverse within 5 days, reply with the transaction details and we will investigate promptly.`,
  Refund: (t) =>
    `Hi ${t.customerName}, I have noted your refund request. To process your refund, please reply with your order number and the email address used for the purchase. Our team will review the request and respond within 2 business days.`,
  Subscription: (t) =>
    `Hi ${t.customerName}, I can help you with your subscription. To cancel before the next renewal, log in to your account, go to Settings -> Subscription, and select Cancel. If you need assistance completing this, please reply with your account email and we will process the cancellation manually.`,
  "Account Access": (t) =>
    `Hi ${t.customerName}, I understand your account is currently locked. Account locks are a security measure that protects you. Please wait 15 minutes, then use the "Forgot Password" option to reset your credentials. If access remains blocked after a password reset, reply with your account email so we can verify your identity and unlock it manually.`,
  Delivery: (t) =>
    `Hi ${t.customerName}, I am sorry your delivery has been delayed. Please allow an additional 1-2 business days, as tracking updates can lag behind actual delivery progress. If tracking has not updated by then, please reply with your order number so we can contact the courier on your behalf.`,
  "Product Version": (t) =>
    `Hi ${t.customerName}, thank you for reaching out about the product update issue. Please confirm the version you were running before the update and the version you updated to. If you see any error messages, please share a screenshot so we can investigate further.`,
  Installation: (t) =>
    `Hi ${t.customerName}, I understand you are having difficulty with installation. Please let us know the operating system you are using, the product version, and the exact error or behavior you encountered so we can help resolve this.`,
  Compatibility: (t) =>
    `Hi ${t.customerName}, thank you for reporting this compatibility issue. Please share the details of your environment including operating system, browser, and any other relevant software versions, and we will check if there are known compatibility requirements.`,
  Performance: (t) =>
    `Hi ${t.customerName}, I am sorry to hear the product is running slowly. Please let us know which specific feature or area is affected and how long this has been occurring. If possible, include a screenshot of any error or resource usage so we can investigate.`,
  "Application Stability": (t) =>
    `Hi ${t.customerName}, I understand the application is crashing or not opening correctly. Please confirm the product version you are running, your operating system, and what you were doing when the issue occurred. Any crash reports or error messages will help us investigate.`,
  General: (t) =>
    `Hi ${t.customerName}, thank you for reaching out. I have reviewed your request and will look into this for you. Could you provide more details about your issue? Our support team will respond within 1 business day.`
};

export interface LessonMatchResult {
  lesson: Lesson;
  matchedSignals: string[];
  /** Structured, non-chain-of-thought evidence for each matched signal. */
  signalEvidence?: Array<{
    signal: string;
    matchType: "literal" | "semantic";
    matchedConcepts: string[];
  }>;
  /**
   * TODO-058B: language-neutral concepts that produced this match when there was
   * no lexical evidence. Absent for every lexical (English) match, so the two
   * kinds of evidence stay separately explainable.
   */
  matchedConceptIds?: string[];
  score: number;
  /** How many matched signals carry >=2 meaningful tokens. Generic one-word
   *  overlaps ("webhook", "integration") score matches but are not evidence
   *  of the same underlying problem (TODO-009 Step 3). */
  multiTokenMatches: number;
  /** TODO-019: count of DISTINCT meaningful ticket tokens explained by the
   *  matched signals — a deterministic measure of how much of THIS ticket's
   *  evidence the lesson actually accounts for. Used ONLY to rank sibling
   *  lessons of equal primary score/strength; it never changes whether a
   *  lesson qualifies as evidence (see isStrongLessonEvidence), so it cannot
   *  weaken any compatibility, contradiction, or cold-start gate. */
  ticketEvidenceCoverage: number;
}

const LESSON_NEGATION_TOKENS = new Set([
  "no",
  "not",
  "never",
  "cannot",
  "cant",
  "dont",
  "wont",
  "without"
]);

const LESSON_SIGNAL_STOPWORDS = new Set([
  "about",
  "again",
  "always",
  "before",
  "because",
  "been",
  "being",
  "can",
  "could",
  "does",
  "doesn",
  "from",
  "have",
  "included",
  "into",
  "just",
  "like",
  "need",
  "needs",
  "now",
  "only",
  "please",
  "that",
  "the",
  "their",
  "them",
  "then",
  "this",
  "used",
  "using",
  "was",
  "were",
  "what",
  "when",
  "with",
  "your"
]);

const EXPLICIT_LOGIN_CONTRADICTION_PATTERNS: RegExp[] = [
  /\bi can sign in(?: to my account)?(?: normally)?\b/,
  /\bi can access my account\b/,
  /\bi remember my password\b/,
  /\bpassword is working\b/,
  /\bnot a login issue\b/
];

function normalizeLessonSignalToken(token: string): string {
  const lower = token.toLowerCase();
  if (lower === "remembered" || lower === "remembering") return "remember";
  if (lower === "passwords") return "password";
  if (lower === "logins") return "login";
  if (lower === "credentials") return "credential";
  return lower;
}

export function normalizeLessonSignalText(value: string): string {
  return value
    .toLowerCase()
    .replace(/can't/g, "cannot")
    .replace(/cant/g, "cannot")
    .replace(/don't/g, "do not")
    .replace(/dont/g, "do not")
    .replace(/won't/g, "will not")
    .replace(/wont/g, "will not")
    .replace(/[^a-z0-9\s-]/g, " ");
}

/**
 * Root-cause ordinals are compact, structured evidence in mature lessons
 * (for example, "root cause 04"). They must retain their identity even
 * though ordinary two-character tokens are intentionally excluded from broad
 * signal matching. This parser is used only to reject a conflicting ordinal;
 * it never makes an otherwise weak signal match on its own.
 */
function rootCauseReferences(value: string): Set<string> {
  const references = new Set<string>();
  for (const match of normalizeLessonSignalText(value).matchAll(/\broot\s+cause\s+0*(\d+)\b/g)) {
    references.add(String(Number(match[1])));
  }
  return references;
}

function tokenizeLessonSignal(value: string): string[] {
  return normalizeLessonSignalText(value)
    .split(/\s+/)
    .map(normalizeLessonSignalToken)
    .filter((token) => (token.length > 2 || LESSON_NEGATION_TOKENS.has(token)) && !LESSON_SIGNAL_STOPWORDS.has(token));
}

function hasNegation(tokens: Iterable<string>): boolean {
  for (const token of tokens) {
    if (LESSON_NEGATION_TOKENS.has(token)) return true;
  }
  return false;
}

function hasRememberPasswordConcept(tokens: Iterable<string>): boolean {
  const tokenSet = new Set(tokens);
  return tokenSet.has("remember") && tokenSet.has("password");
}

function ticketHasExplicitLoginContradiction(ticketText: string): boolean {
  return EXPLICIT_LOGIN_CONTRADICTION_PATTERNS.some((pattern) => pattern.test(ticketText));
}

function signalPolarityContradictsTicket(signalTokens: string[], ticketTokens: Set<string>): boolean {
  if (!hasRememberPasswordConcept(signalTokens) || !hasRememberPasswordConcept(ticketTokens)) return false;
  return hasNegation(signalTokens) !== hasNegation(ticketTokens);
}

function lessonRequiresLoginFailure(lesson: Lesson): boolean {
  const lessonText = normalizeLessonSignalText(
    `${lesson.title ?? ""} ${lesson.rootCause} ${lesson.solution} ${lesson.signals.join(" ")}`
  );
  return [
    "login",
    "sign in",
    "password",
    "credential",
    "reset",
    "locked out",
    "account locked",
    "authentication"
  ].some((signal) => lessonText.includes(signal));
}

export function ticketContradictsLesson(ticket: Ticket, lesson: Lesson): boolean {
  const ticketText = normalizeLessonSignalText(`${ticket.subject} ${ticket.description}`);
  if (lessonRequiresLoginFailure(lesson) && ticketHasExplicitLoginContradiction(ticketText)) return true;
  const lessonText = normalizeLessonSignalText(`${lesson.title ?? ""} ${lesson.rootCause} ${lesson.solution} ${lesson.signals.join(" ")}`);
  const lessonRequiresPermissionRecovery = /(?:\b(?:permission|permissions|access)\b[^.!?]{0,60}\b(?:disabled|denied|not granted|did not grant|does not grant|missing|blocked|unavailable)\b|\b(?:disabled|denied|not granted|did not grant|does not grant|missing|blocked|unavailable)\b[^.!?]{0,60}\b(?:permission|permissions|access)\b)/i.test(lessonText);
  const ticketReportsPermissionHealthy = /\b(?:permission|permissions|access)\b[^.!?]{0,60}\b(?:enabled|granted|allowed|active|works correctly|working correctly)\b/i.test(ticketText);
  if (lessonRequiresPermissionRecovery && ticketReportsPermissionHealthy) return true;
  const explicitSeatChange = /\b(?:changed|change|increase|decrease|added|removed|reduced|increased)\b[^.!?]{0,35}\b(?:seats?|plan|quantity|headcount)\b|\b(?:seats?|plan|quantity|headcount)\b[^.!?]{0,35}\b(?:changed|change|increased|decreased|added|removed)\b/i.test(ticketText);
  if (/\bseat change|seat reconciliation|plan change|quantity change|headcount change\b/i.test(lessonText) && !explicitSeatChange) return true;
  return false;
}

// TODO-040: bounded deterministic semantic concept groups. Each set collects
// tokens that express the SAME support/identity concept, so naturally worded
// tickets can satisfy a validated multi-token lesson signal without copying its
// exact stored phrase. Kept concept-level (not fixture phrases) so it
// generalizes; it never lowers the multi-token/score gate and is vetoed by
// proximity negation, preserving weak-overlap and contradiction safety.
const CONCEPT_SYNONYMS: ReadonlyArray<ReadonlySet<string>> = [
  // Federated-identity / SSO anchor.
  new Set([
    "authentication", "authenticate", "authenticating", "authenticated", "authentications",
    "sso", "saml", "idp", "federation", "federated", "identity", "provider", "providers",
    "assertion", "assertions", "sign-on"
  ]),
  // Signing certificate / trust material.
  new Set([
    "certificate", "certificates", "cert", "signing", "credential", "credentials",
    "material", "metadata", "trust", "key", "keys", "signing-key", "provider-key"
  ]),
  // Redirect / sign-in loop symptom.
  new Set([
    "redirect", "redirects", "redirected", "redirecting", "redirection", "loop", "loops",
    "looping", "bounce", "bounces", "bouncing", "cycle", "cycles", "cycling", "handoff",
    "hand-off", "handshake", "circle", "circles", "repeat", "repeats", "repeating",
    "repeatedly", "alternate", "alternates", "alternating", "endless", "stuck", "round",
    "timeline", "returned", "return", "returns", "returning", "again", "restart",
    "restarts", "restarted", "restarting"
  ]),
  // Billing object / amount. Paired with the duplicate-change concept below;
  // neither generic "invoice" nor "charge" alone is lesson evidence.
  new Set([
    "billing", "bill", "bills", "invoice", "invoices", "statement", "statements",
    "charge", "charges", "charged", "subscription", "seat", "seats", "license",
    "licenses", "amount", "amounts", "line", "lines", "allocation", "allocations", "ledger", "quantity", "plan",
    "adjustment"
  ]),
  // Billing duplication / replacement meaning.
  new Set([
    "duplicate", "duplicates", "duplicated", "twice", "doubled", "double", "repeat",
    "repeats", "repeated", "overlap", "overlaps", "overlapping", "second", "both",
    "old", "new", "replacement", "replaced", "reduction", "reduced", "downsizing",
    "removed", "extra", "same", "versions", "two"
  ]),
  // Billing timing / calculation boundary.
  new Set([
    "period", "month", "monthly", "annual", "renewal", "cycle", "mid-cycle", "during",
    "after", "before", "close", "window", "current", "previous", "latest", "next",
    "earlier", "later"
  ]),
  // Integration / event surface and webhook delivery.
  new Set([
    "integration", "integrations", "connector", "connectors", "api", "endpoint", "partner",
    "event", "events", "sender", "receiver", "receivers", "listener", "automation", "automations",
    "webhook", "webhooks"
  ]),
  new Set([
    "webhook", "webhooks", "callback", "callbacks", "delivery", "deliveries", "incoming",
    "inbound", "traffic", "payload", "message", "messages", "event", "events", "receiver", "receivers"
  ]),
  // Signature / credential verification meaning.
  new Set([
    "signature", "signatures", "signing", "secret", "secrets", "credential", "credentials",
    "private", "value", "proof", "verify", "verification", "verifier", "authenticity",
    "untrusted", "forged", "digest", "invalid"
  ]),
  // Integration change / event timing.
  new Set([
    "timeline", "following", "since", "when", "overnight", "yesterday", "maintenance",
    "changed", "change", "update", "updated", "replacement", "replaced", "rotated", "rotation",
    "refreshed", "rollout", "new"
  ]),
  // Permission/access surface and guest/external actor.
  new Set([
    "permission", "permissions", "access", "authorized", "authorization", "grant", "grants",
    "role", "roles", "membership", "memberships", "denied", "blocked", "unavailable", "missing",
    "hidden", "rejected", "stopped", "open", "opens", "opened", "reach", "reached", "enter", "enters",
    "sees", "see", "visible", "error", "project"
  ]),
  new Set([
    "guest", "guests", "external", "collaborator", "collaborators", "contractor", "contractors",
    "vendor", "vendors", "partner", "partners", "outside", "temporary", "reviewer", "consultant",
    "membership", "member", "members", "person", "people", "user", "users", "account", "accounts",
    "invitation", "invite", "invites"
  ]),
  // Workspace/project resource and propagation timing.
  new Set([
    "workspace", "workspaces", "project", "projects", "team", "teams", "area", "areas", "room",
    "rooms", "tenant", "organization", "org", "directory", "resource", "resources", "space", "landing", "appears"
  ]),
  new Set([
    "timeline", "after", "following", "since", "still", "remains", "remain", "visible", "appears",
    "appeared", "completed", "accepted", "assigned", "shared", "boundary", "latest", "hidden", "available",
    "unavailable", "share", "made", "error", "selecting", "reaches", "reach"
  ]),
  // Reporting/export surface and encoding/character corruption.
  new Set([
    "report", "reports", "reporting", "dashboard", "dashboards", "analytics", "rows", "row", "table",
    "tables", "columns", "column", "metrics", "finance", "spreadsheet", "spreadsheets", "file", "files",
    "web", "web-report", "download", "downloads", "csv", "output", "import", "imported", "data", "text"
  ]),
  new Set([
    "export", "exports", "download", "downloads", "downloaded", "file", "files", "spreadsheet", "spreadsheets", "csv",
    "output", "import", "imported", "saved", "opened", "open", "receiving"
  ]),
  new Set([
    "encoding", "encoded", "character", "characters", "text", "letters", "accent", "accents", "accented",
    "symbols", "garbled", "corrupted", "replacement", "unreadable", "mangle", "mangles", "misread",
    "punctuation", "international", "non-english", "broken", "strange", "substitutions"
  ]),
  // Report/export event timing. "normal"/"correct" are handled as vetoes,
  // so a control saying encoding is fine cannot satisfy this concept.
  new Set([
    "timeline", "after", "when", "downloaded", "saved", "opened", "outside", "imported", "receiving",
    "generated", "latest", "source", "on-screen", "dashboard", "preserve", "preserves", "break", "breaks", "changes", "changed"
  ]),
  // Mobile/device surface and offline state.
  new Set([
    "mobile", "phone", "handset", "tablet", "device", "android", "ios", "iphone", "ipad", "app", "application", "technician", "field"
  ]),
  // Attendance/check-in and location-access evidence. These are reusable
  // problem concepts, not a product or acceptance-ticket rule.
  new Set([
    "clock", "clock-in", "check", "check-in", "attendance", "timekeeping", "punch", "punch-in"
  ]),
  new Set([
    "location", "permission", "permissions", "access", "gps", "geolocation", "denied", "disabled", "allow", "allowed"
  ]),
  new Set([
    "offline", "disconnected", "coverage", "reception", "signal", "dead-zone", "flight", "network",
    "locally", "queued", "queue", "queues", "pending", "reconnect", "reconnects", "reconnecting"
  ]),
  // Mobile synchronization/revision and its timing.
  new Set([
    "sync", "synchronization", "synchronize", "reconnect", "reconnecting", "merge", "merged", "reconcile",
    "reconciled", "upload", "uploading", "revision", "revisions", "version", "versions", "conflict",
    "conflicts", "collision", "collisions", "server", "online", "connection", "service", "restored",
    "copy", "cloud", "behind", "unresolved", "record", "records", "advanced", "newer", "combine"
  ]),
  new Set([
    "timeline", "after", "once", "when", "then", "meanwhile", "newer", "older", "previous", "current",
    "restored", "returns", "returned", "landing", "next", "active", "shared", "visible"
  ]),
  // Notification surface, email recipient, and delivery history.
  new Set([
    "notification", "notifications", "alert", "alerts", "message", "messages", "mail", "notices", "updates",
    "send", "sends", "delivery", "deliveries", "recipient", "recipients", "subscriber", "subscribers", "subscribed", "user", "users", "contact", "outgoing", "list", "attempt"
  ]),
  new Set([
    "email", "emails", "mailbox", "mailboxes", "address", "addresses", "inbox", "contact", "recipient",
    "recipients"
  ]),
  new Set([
    "timeline", "after", "previous", "earlier", "past", "former", "still", "remains", "continues", "since",
    "again", "now", "single", "quiet", "skipped", "excluded", "withheld", "suppression", "suppressed",
    "bounce", "bounced", "failure", "rejection"
  ])
];

const CONCEPT_NAMES = [
  "sso-identity", "sso-signing-material", "sso-redirect-loop", "billing-object", "billing-duplicate",
  "billing-timing", "integration-surface", "webhook-delivery", "signature-verification", "integration-timing",
  "permission-surface", "guest-actor", "workspace-resource", "workspace-timing", "reporting-surface",
  "export-surface", "encoding-corruption", "reporting-timing", "mobile-surface", "attendance-checkin", "location-access",
  "offline-state", "mobile-synchronization", "mobile-timing", "notification-surface", "email-recipient", "notification-history"
];

// Tokens that negate an adjacent concept ("no certificate", "not redirected",
// "certificate has not changed", "sign-in works normally", "redirects are
// unrelated"). Includes contraction stems produced by normalizeLessonSignalText
// (apostrophes become spaces: "hasn't" -> "hasn").
const CONCEPT_NEGATION_TOKENS = new Set([
  // "cannot" / "can't" usually introduce the reported failure itself
  // ("cannot clock in", "can't sign in"); they must not suppress the
  // problem concept that follows. Explicit negation and healthy-state
  // predicates remain covered by the other tokens and vetoes below.
  "no", "not", "never", "dont", "wont", "without",
  "unchanged", "unrelated", "unaffected", "normally", "normal", "correct", "fine", "works", "working",
  "suspect", "suspected", "possibly", "possible", "maybe",
  "hasn", "havent", "haven", "hadn", "didn", "doesn", "wasn", "weren", "isn", "aren",
  "couldn", "wouldn", "shouldn"
]);

// A direct denial of an encoding/character problem is a hard semantic veto;
// generic contextual words such as "characters" elsewhere in the ticket must
// not resurrect "encoding is normal" as affirmative evidence.
const NEGATED_CONCEPT_ANCHORS = new Set([
  "encoding", "encoded", "csv", "garbled", "corrupted", "unreadable", "replacement"
]);

function conceptIndicesOf(token: string): number[] {
  const indices: number[] = [];
  for (let index = 0; index < CONCEPT_SYNONYMS.length; index += 1) {
    if (CONCEPT_SYNONYMS[index].has(token)) indices.push(index);
  }
  return indices;
}

/**
 * Concept indices the ticket expresses AFFIRMATIVELY. The raw (punctuated) text
 * is split into clauses; inside a clause a concept is negated when a negation
 * token appears earlier in the clause (forward scope: "no observed bounce,
 * failed handoff, ... or certificate evidence") or within two tokens after it
 * (trailing predicate: "redirects are unrelated", "certificate has not
 * changed"). Meaning-bearing negations in other clauses ("never admitted to the
 * application") do not suppress a concept, so genuine paraphrases keep their
 * evidence while explicit denials fail closed.
 */
function affirmativeConceptsOf(rawText: string): Set<number> {
  const affirmativeCounts = new Map<number, number>();
  const negatedCounts = new Map<number, number>();
  const negatedAnchors = new Set<number>();
  const clauses = rawText
    .toLowerCase()
    .split(/[.!?;\n]+|\bbut\b|\bhowever\b|\balthough\b|\bwhereas\b|\byet\b/);
  for (const clause of clauses) {
    // Keep every word (not tokenizeLessonSignal, which drops stopwords like
    // "again") so concept and negation tokens are detected in true position.
    const tokens = normalizeLessonSignalText(clause).split(/\s+/).filter(Boolean);
    let negationEarlier = false;
    for (let index = 0; index < tokens.length; index += 1) {
      const concepts = conceptIndicesOf(tokens[index]);
      if (concepts.length > 0) {
        // Trailing window of three tokens catches predicate negations such as
        // "signing certificate has not changed" without suppressing concepts
        // whose clause carries a distant, unrelated negation.
        const stoppedWorkingFailure = tokens.slice(index + 1, index + 4).join(" ").includes("stopped working");
        const trailingNegation = !stoppedWorkingFailure && (
          (CONCEPT_NEGATION_TOKENS.has(tokens[index + 1] ?? "") && !(tokens[index + 1] === "no" && tokens[index + 2] === "longer")) ||
          (CONCEPT_NEGATION_TOKENS.has(tokens[index + 2] ?? "") && !(tokens[index + 2] === "no" && tokens[index + 3] === "longer")) ||
          (CONCEPT_NEGATION_TOKENS.has(tokens[index + 3] ?? "") && !(tokens[index + 3] === "no" && tokens[index + 4] === "longer"))
        );
        const offlineStateAffirmed = concepts.includes(19)
          && (tokens[index - 1] === "without" || tokens[index - 1] === "no" || tokens[index - 1] === "working");
        const counts = offlineStateAffirmed || (!negationEarlier && !trailingNegation) ? affirmativeCounts : negatedCounts;
        if (counts === negatedCounts && NEGATED_CONCEPT_ANCHORS.has(tokens[index])) {
          concepts.forEach((concept) => negatedAnchors.add(concept));
        }
        concepts.forEach((concept) => counts.set(concept, (counts.get(concept) ?? 0) + 1));
      }
      const failurePredicate = tokens[index] === "working" && tokens[index - 1] === "stopped";
      if (CONCEPT_NEGATION_TOKENS.has(tokens[index])
          && !failurePredicate
          && !(tokens[index] === "no" && tokens[index + 1] === "longer")) negationEarlier = true;
    }
  }
  const result = new Set([...affirmativeCounts.keys()].filter((concept) =>
    !negatedAnchors.has(concept)
      && (affirmativeCounts.get(concept) ?? 0) > (negatedCounts.get(concept) ?? 0)
  ));
  const normalizedRaw = normalizeLessonSignalText(rawText);
  if (/\b(?:guest|external|collaborator|contractor|vendor|partner|consultant|outside)\b/.test(normalizedRaw)
      && !/\b(?:no|not)\s+(?:a\s+)?(?:guest|external|collaborator|contractor|vendor|partner)\b/.test(normalizedRaw)) {
    result.add(11);
  }
  if (/\b(?:not|cannot|can not)\s+(?:visible|available|reach|reached|open|see|access)\b|\baccess denied\b|\bpermission error\b|\b(?:hidden|unavailable)\b/.test(normalizedRaw)) {
    result.add(10);
    result.add(12);
    result.add(13);
  }
  // reporting-surface(14) covers any report/dashboard/export context.
  if (/\b(?:csv|spreadsheet|export|download|downloaded|file|output|import|imported|report|dashboard|text|characters|symbols)\b/.test(normalizedRaw)) {
    result.add(14);
  }
  // TODO-049: export-surface(15) requires genuine EXPORT/file evidence. A
  // dashboard-viewing or report-verb complaint ("the total on our dashboard is
  // off") is not an export, so "report"/"dashboard"/"text" alone must not
  // fabricate export evidence and let an unrelated ticket match export lessons.
  if (/\b(?:csv|spreadsheet|exports?|exported|download|downloaded|downloads|file|files|output|outputs|import|imports|imported)\b/.test(normalizedRaw)) {
    result.add(15);
  }
  // Encoding lessons describe observable CHARACTER corruption, not just the
  // export surface. TODO-049: generic value-mismatch words ("different",
  // "wrong", "changes", "incorrect", "odd", "lost", "fidelity") describe a
  // totals/data discrepancy, not character encoding, and must not fabricate
  // encoding evidence (they remain in the negation veto below). The surface
  // requirement likewise excludes bare "report"/"data".
  const encodingFailure = /\b(?:breaks?|broken|corrupt(?:ed|ion)?|garbled|unreadable|mangles?|accented|diacritics?|misread|substitutions?|strange)\b/.test(normalizedRaw)
    && !/\b(?:not|no|without)\s+(?:any\s+)?(?:break|broken|corrupt(?:ion)?|garbled|unreadable|mangling|accented|diacritics?|incorrect|odd|misread|difference|changes?|loss|fidelity|wrong|substitution|strangeness)\b/.test(normalizedRaw)
    && !(/\b(?:encoding|characters?|symbols?|files?|text|export)\b[^.!?]{0,30}\b(?:normal|correct|fine|works?|working|unaffected|preserve|preserved)\b/.test(normalizedRaw)
      && !/\b(?:breaks?|broken|corrupt(?:ed|ion)?|garbled|unreadable|mangles?|accented|diacritics?|misread|substitutions?|strange)\b/.test(normalizedRaw));
  if (encodingFailure && /\b(?:exports?|exported|download|downloaded|file|files|csv|spreadsheet|characters?|symbols?|encoding)\b/.test(normalizedRaw)) {
    result.add(16);
    result.add(17);
  }
  if (/\b(?:mobile|phone|handset|tablet|device|app|application)\b/.test(normalizedRaw)) result.add(18);
  if (/\b(?:offline|disconnected|coverage|reception|signal|dead-zone|without\s+signal|no\s+network|reconnect|reconnecting)\b/.test(normalizedRaw)
      && !/\b(?:no|not)\s+offline\b/.test(normalizedRaw)) result.add(19);
  if (/\b(?:sync|synchronization|synchronize|reconnect|reconnecting|merge|merged|reconcile|reconciled|upload|revision|revisions|conflict|server|newer|older|copy|cloud|behind|unresolved)\b/.test(normalizedRaw)) result.add(20);
  if (/\b(?:after|once|when|then|meanwhile|next|newer|older|previous|current|restored|returns|returned)\b/.test(normalizedRaw)) result.add(21);
  if (/\b(?:notification|notifications|alert|alerts|message|messages|notices|updates|delivery|deliveries|recipient|recipients|subscriber|subscribers|outgoing)\b/.test(normalizedRaw)) result.add(22);
  if (/\b(?:email|emails|mailbox|mailboxes|address|addresses|inbox|recipient|recipients|contact)\b/.test(normalizedRaw)) result.add(23);
  if (/\b(?:identity provider|idp|saml|federation|federated|authentication)\b/.test(normalizedRaw)) result.add(0);
  if (/\b(?:certificate|signing[- ]key|signing credential|provider key|trust credential|signing material)\b/.test(normalizedRaw)
      && !/\b(?:certificate|signing[- ]key|signing credential|provider key|trust credential|signing material)\b[^.!?]{0,24}\b(?:unchanged|normal|no longer changed|not changed)\b/.test(normalizedRaw)
      && !/\b(?:no|not|without)\b[^.!?]{0,24}\b(?:key rotation|certificate rotation|signing material|certificate|credential)\b/.test(normalizedRaw)) result.add(1);
  return result;
}

// TODO-049: non-discriminating "category-level" concepts. reporting-surface(14)
// is shared by every reporting lesson ("reporting <surface>" / "<surface>
// timeline" signals), and the pure timing concepts (billing/integration/
// workspace/reporting/mobile/notification timing) are activated by generic
// temporal words like "when"/"after". A purely-SEMANTIC signal match explained
// ONLY by these concepts (no literal token evidence, no discriminating concept
// such as export-surface/encoding/signature/redirect) is evidence that the
// ticket is *in the domain*, not that it describes the lesson's specific root
// cause. Authorizing on that alone let an unrelated "dashboard totals" ticket
// match a CSV-encoding/column-order lesson. This extends the TODO-030 principle
// ("generic overlaps are not evidence") to semantic concept coverage. Every
// discriminating domain signal also carries a non-generic surface/meaning
// concept, so it is never a subset of this set and is unaffected.
const GENERIC_SURFACE_TIMING_CONCEPTS = new Set([5, 9, 13, 14, 17, 23, 26]);

interface SignalMatchEvidence {
  matchType: "literal" | "semantic";
  matchedConcepts: string[];
}

function signalMatchEvidence(
  signal: string,
  ticketText: string,
  ticketTokens: Set<string>,
  affirmativeConcepts: Set<number> = affirmativeConceptsOf(ticketText)
): SignalMatchEvidence | null {
  const normalizedSignal = normalizeLessonSignalText(signal).trim();
  if (!normalizedSignal) return null;
  if (ticketText.includes(normalizedSignal)) return { matchType: "literal", matchedConcepts: [] };

  // TODO-028: the generic-overlap fallback below deliberately tolerates
  // partial phrasing. It cannot, however, turn "root cause 01" into
  // "root cause 04": those are competing structured explanations, not
  // interchangeable generic tokens. A ticket with no root-cause ordinal still
  // reaches the existing generic comparison, so specificity is never an
  // automatic preference.
  const signalRootCauseReferences = rootCauseReferences(normalizedSignal);
  const ticketRootCauseReferences = rootCauseReferences(ticketText);
  if (signalRootCauseReferences.size > 0 && ticketRootCauseReferences.size > 0) {
    const hasSharedReference = [...signalRootCauseReferences].some((reference) => ticketRootCauseReferences.has(reference));
    if (!hasSharedReference) return null;
  }

  const signalTokens = tokenizeLessonSignal(normalizedSignal);
  if (signalTokens.length === 0) return null;
  if (signalPolarityContradictsTicket(signalTokens, ticketTokens)) return null;
  const overlap = signalTokens.filter((token) => ticketTokens.has(token)).length;
  const requiredOverlap = signalTokens.length <= 2 ? signalTokens.length : Math.max(2, Math.ceil(signalTokens.length * 0.6));
  if (overlap >= requiredOverlap) return { matchType: "literal", matchedConcepts: [] };

  // TODO-040: deterministic semantic concept coverage. A signal token is
  // satisfied by an affirmatively-present equivalent concept; tokens without a
  // concept still require an exact ticket token. The same requiredOverlap gate
  // applies, so a single generic concept overlap can never satisfy a multi-token
  // signal, and negated concepts contribute nothing.
  const conceptCoveredTokens = signalTokens.filter((token) => {
    const concepts = conceptIndicesOf(token);
    return concepts.length > 0 ? concepts.some((concept) => affirmativeConcepts.has(concept)) : ticketTokens.has(token);
  });
  if (conceptCoveredTokens.length < requiredOverlap) return null;
  const coveringConcepts = [...new Set(conceptCoveredTokens
    .flatMap((token) => conceptIndicesOf(token))
    .filter((concept) => affirmativeConcepts.has(concept)))];
  // TODO-049: a semantic match carried entirely by generic surface/timing
  // concepts (and no literal token evidence) is category-level, not root-cause
  // evidence — reject it so a generic reporting ticket cannot authorize an
  // unrelated reporting lesson via shared "reporting/dashboard/timeline" words.
  const hasLiteralTokenEvidence = conceptCoveredTokens.some((token) => conceptIndicesOf(token).length === 0);
  if (!hasLiteralTokenEvidence
      && coveringConcepts.length > 0
      && coveringConcepts.every((concept) => GENERIC_SURFACE_TIMING_CONCEPTS.has(concept))) {
    return null;
  }
  return {
    matchType: "semantic",
    matchedConcepts: coveringConcepts.map((concept) => CONCEPT_NAMES[concept] ?? `concept-${concept}`)
  };
}

/**
 * TODO-058B Part F: language-neutral concept ids for a piece of text, derived at
 * runtime against the built-in vocabulary. Lessons keep their authored text; no
 * lesson is rewritten and no concept signal is stored.
 */
function conceptIdsForText(text: string): string[] {
  return extractConcepts(text, {}).conceptIds;
}

/**
 * Specific (non-generic) concepts shared by the ticket and a lesson's signals.
 * Generic concepts are excluded so broad overlap can never authorize a lesson.
 */
function sharedSpecificConcepts(ticketConceptIds: string[], lessonSignals: string[]): string[] {
  if (ticketConceptIds.length === 0) return [];
  const lessonConceptIds = new Set(lessonSignals.flatMap((signal) => conceptIdsForText(signal)));
  return ticketConceptIds.filter(
    (conceptId) => lessonConceptIds.has(conceptId) && !GENERIC_CONCEPT_IDS.includes(conceptId)
  );
}

export function signalMatchesTicket(
  signal: string,
  ticketText: string,
  ticketTokens: Set<string>,
  affirmativeConcepts: Set<number> = affirmativeConceptsOf(ticketText)
): boolean {
  return Boolean(signalMatchEvidence(signal, ticketText, ticketTokens, affirmativeConcepts));
}

/** Distinct meaningful ticket tokens explained by this lesson's matched signals. */
function ticketEvidenceCoverageOf(matchedSignals: string[], ticketTokens: Set<string>): number {
  const explained = new Set<string>();
  for (const signal of matchedSignals) {
    for (const token of tokenizeLessonSignal(signal)) {
      if (ticketTokens.has(token)) explained.add(token);
    }
  }
  return explained.size;
}

/**
 * TODO-019: deterministic sibling-lesson relevance ordering. Returns the more
 * relevant of two matched lessons using intrinsic evidence only — never lesson
 * array position and never trust. Ordering:
 *   1. primary match score (number of matched signals)
 *   2. multi-token matched-signal evidence
 *   3. ticket-evidence coverage (distinct ticket tokens the lesson explains)
 *   4. stable, deterministic fallback: lexicographically smallest lesson id
 * Because every key is an intrinsic property of the lesson/ticket pair, the
 * winner is independent of the order lessons appear in the array (CASE H), and
 * genuinely-equal evidence resolves to a stable id rather than position (CASE G).
 */
function moreRelevantLesson(a: LessonMatchResult, b: LessonMatchResult): LessonMatchResult {
  if (a.score !== b.score) return a.score > b.score ? a : b;
  if (a.multiTokenMatches !== b.multiTokenMatches) return a.multiTokenMatches > b.multiTokenMatches ? a : b;
  if (a.ticketEvidenceCoverage !== b.ticketEvidenceCoverage) {
    return a.ticketEvidenceCoverage > b.ticketEvidenceCoverage ? a : b;
  }
  return (a.lesson.id ?? "") <= (b.lesson.id ?? "") ? a : b;
}

/** TODO-058D: the language stored lessons are authored in. Defaults to English. */
export interface LessonMatchOptions {
  internalLanguage?: string;
}

export function findMatchingLesson(
  ticket: Ticket,
  item: KnowledgeItem,
  options?: LessonMatchOptions
): LessonMatchResult | null {
  if (!item.lessons || item.lessons.length === 0) return null;
  const ticketText = normalizeLessonSignalText(`${ticket.subject} ${ticket.description}`).trim();
  if (/\bno\s+concrete\s+(?:symptom|category|root cause|evidence)\b/.test(ticketText)
      || /\bwithout\s+(?:more|any)\s+detail\b/.test(ticketText)
      || /\bdoes\s+not\s+look\s+as\s+expected\b/.test(ticketText)) return null;
  if (/\b(?:sign in|login|authentication)\b[^.!?]{0,60}\b(?:normally|works?|working)\b/.test(ticketText)
      && /\bnot\b[^.!?]{0,35}\b(?:login|authentication)\b[^.!?]{0,12}\b(?:issue|problem)\b/.test(ticketText)) return null;
  // Cross-domain context is not semantic support for a lesson. These narrow
  // vetoes keep callback/permission and guest/notification controls from
  // becoming strong merely because they share generic access or delivery
  // vocabulary with a canonical.
  if (item.category === "Permissions & Access"
      && /\b(?:webhook|callback|endpoint)\b/.test(ticketText)
      && !/\b(?:invitation|membership|project|team|role)\b/.test(ticketText)) return null;
  if (item.category === "Permissions & Access"
      && /\b(?:visible|available|can reach|accessible|can access)\b/.test(ticketText)
      && (!/\b(?:cannot|can't|can not|not|missing|hidden|unavailable|denied|fails?)\b/.test(ticketText)
        || /\b(?:no|not|without)\b[^.!?]{0,35}\b(?:missing|hidden|denied|issue|problem)\b/.test(ticketText))) return null;
  if (item.category === "API & Integrations"
      && /\b(?:url|destination|configure|configuration|edit)\b/.test(ticketText)
      && !/\b(?:fail|failed|failure|reject|rejected|verification|signature|secret|delivery failure|timeout|replay)\b/.test(ticketText)) return null;
  if (item.category === "Reporting & Exports"
      && /\b(?:encoding|csv|spreadsheet|export|download|file|characters?|symbols?)\b/.test(ticketText)
      && /\b(?:no|not|without)\b[^.!?]{0,35}\b(?:corrupt(?:ed|ion)?|garbled|unreadable|mangl|broken)\b/.test(ticketText)) return null;
  if (item.category === "Reporting & Exports"
      && !/\b(?:breaks?|broken|corrupt(?:ed|ion)?|garbled|unreadable|mangles?|accented|diacritics?|incorrect(?:ly)?|odd|misread|substitutions?|strange)\b/.test(ticketText)
      && /\b(?:encoding|characters?|symbols?|files?|text|export)\b[^.!?]{0,30}\b(?:normal|correct|fine|works?|working|unaffected|preserve|preserved)\b/.test(ticketText)) return null;
  if (item.category === "Mobile Application"
      && /\b(?:no|not)\s+offline\b/.test(ticketText)) return null;
  if (item.category === "Notifications & Email"
      && /\b(?:guest|permission|access)\b/.test(ticketText)
      && !/\b(?:bounce|bounced|suppression|suppressed|delivery failure|omitted|excluded|withheld)\b/.test(ticketText)) return null;
  if (item.category === "Notifications & Email"
      && /\b(?:locale|language|translation)\b/.test(ticketText)
      && !/\b(?:bounce|bounced|suppression|suppressed|delivery failure|omitted|excluded|withheld)\b/.test(ticketText)) return null;
  if (item.category === "Notifications & Email"
      && /\b(?:locale|language|translation)\b/.test(ticketText)
      && /\b(?:normal|correct|fine|works?|working|unaffected)\b/.test(ticketText)
      && !/\b(?:bounce|bounced|suppression|suppressed|delivery failure|omitted|excluded|withheld)\b[^.!?]{0,30}\b(?:fail|issue|problem|affected)\b/.test(ticketText)) return null;
  if (item.category === "Notifications & Email"
      && /\b(?:no|not)\b[^.!?]{0,50}\b(?:suppression|bounce|bounced)\b/.test(ticketText)) return null;
  if (item.category === "Notifications & Email"
      && /\bnot\b[^.!?]{0,50}\b(?:delivery|suppression)\b[^.!?]{0,25}\b(?:issue|problem|affected|normal)\b/.test(ticketText)) return null;
  const ticketTokens = new Set(tokenizeLessonSignal(ticketText));
  // TODO-058B: extracted once per ticket, reused by every lesson below.
  const ticketConcepts = conceptIdsForText(`${ticket.subject} ${ticket.description}`);
  // TODO-058D Part C: the gate is a LANGUAGE-COMPATIBILITY test, not a script
  // test.
  //
  // It used to be `ticketTokens.size === 0`, which is only true when the ASCII
  // normalizer erased the text — i.e. CJK. Indonesian and accented Latin leave
  // tokens behind ("restablecimos", "sertifikat"), so they looked lexically
  // readable and never reached the concept path, even though those tokens can
  // never match an English-authored lesson signal. That made cross-language
  // reuse work for ja/ko/zh and silently fail for id/es/fr/de/pt/it.
  //
  // The honest test is whether lexical matching is a FAIR test at all: it is not
  // when the ticket is written in a different language from the lessons. An
  // English ticket is therefore never eligible — which is what keeps the TODO-046
  // authorization matrix at 0/14 and the English baseline exact — while all nine
  // non-English languages become eligible uniformly.
  const ticketLanguage = detectLanguage(`${ticket.subject} ${ticket.description}`);
  const lessonLanguage = options?.internalLanguage ?? DEFAULT_LANGUAGE;
  // Eligibility asks "was a language actually detected, and is it a different
  // one?" — NOT "are we confident enough to reply in it". CONFIDENT_DETECTION is
  // tuned for choosing the customer's reply language, where caution is right;
  // reusing it here rejected genuine Spanish and French tickets that scored just
  // under the bar. `fallbackApplied` is the correct signal: a fallback means the
  // language was assumed, not read, so the ticket stays on the lexical path.
  const ticketLanguageDiffersFromLessons =
    !ticketLanguage.fallbackApplied && ticketLanguage.language !== lessonLanguage;
  // Length of the folded text, which is script-agnostic: it counts CJK
  // characters as readily as Latin letters, so the bar means the same thing in
  // every supported language.
  const ticketHasSubstantiveContent = hasSubstantiveContent(`${ticket.subject} ${ticket.description}`);
  // Subject and description are separate clauses: a negation in one ("cannot
  // complete sign-in") must not scope forward into the other.
  const affirmativeConcepts = affirmativeConceptsOf(`${ticket.subject}. ${ticket.description}`);
  let best: LessonMatchResult | null = null;
  for (const lesson of item.lessons) {
    if (ticketContradictsLesson(ticket, lesson)) continue;
    const signals = lesson.signals
      .flatMap((signal) => signal.split(","))
      .map((signal) => signal.trim())
      .filter(Boolean);
    const signalEvidence = signals
      .map((signal) => {
        const normalizedSignal = normalizeLessonSignalText(signal);
        // Keep broad SSO/permission vocabulary from making a Login item
        // deterministically compatible; TODO-030's semantic fallback owns
        // that ambiguous case.
        if (item.category === "Login" && /^(?:sso|role permissions)$/.test(normalizedSignal)) return null;
        if (item.category === "Permissions & Access"
            && normalizedSignal === "permissions permission"
            && /\b(?:question|guidance|explain|how do we)\b/.test(ticketText)
            && !/\b(?:cannot|can't|can not|missing|hidden|denied|blocked|fail(?:s|ed|ure)?|delayed|delay|root cause|not visible)\b/.test(ticketText)) return null;
        const evidence = signalMatchEvidence(signal, ticketText, ticketTokens, affirmativeConcepts);
        return evidence ? { signal, ...evidence } : null;
      })
      .filter((entry): entry is { signal: string; matchType: "literal" | "semantic"; matchedConcepts: string[] } => Boolean(entry));
    let matchedSignals = signalEvidence.map((entry) => entry.signal);
    let conceptMatchedIds: string[] = [];
    if (matchedSignals.length === 0) {
      // TODO-058B Part F: cross-language lesson matching.
      //
      // Gated on the TICKET carrying no lexical evidence at all, not merely on
      // this lesson missing. Gating per-lesson was a safety defect: an English
      // ticket reaches this branch for every lesson that happens not to match
      // lexically, and English text also produces concepts, so weak-fallback and
      // forged-lesson cases became authorized (TODO-046 matrix 1/14 unsafe).
      // With the ticket-level gate an English ticket can never enter here.
      //
      // Concept ids are derived from the lesson's own signal text at runtime —
      // nothing stored, so the 180 seeded Developer Demo lessons need no
      // migration and behave identically until a ticket arrives in another
      // language. A SPECIFIC shared concept is required: generic overlap
      // ("account", "error", "permission", "report_export") can never authorize
      // a lesson, because those appear in nearly every ticket in every language.
      if (!ticketLanguageDiffersFromLessons) continue;
      // A bare term is not a ticket. "contraseña" or "sandi" on its own names a
      // thing without describing a problem, and must never authorize a lesson —
      // the concept path requires an actual message behind it.
      if (!ticketHasSubstantiveContent) continue;
      const shared = sharedSpecificConcepts(ticketConcepts, signals);
      if (shared.length === 0) continue;
      conceptMatchedIds = shared;
      matchedSignals = signals.filter((signal) =>
        conceptIdsForText(signal).some((conceptId) => shared.includes(conceptId))
      );
      if (matchedSignals.length === 0) continue;
    }
    const multiTokenMatches = matchedSignals.filter((signal) => tokenizeLessonSignal(signal).length >= 2).length;
    const candidate: LessonMatchResult = {
      lesson,
      matchedSignals,
      signalEvidence,
      score: matchedSignals.length,
      multiTokenMatches,
      ticketEvidenceCoverage: ticketEvidenceCoverageOf(matchedSignals, ticketTokens),
      // TODO-058B Part H: report concept evidence SEPARATELY from lexical
      // evidence so a reviewer can tell a cross-language concept match from a
      // literal wording match. Empty for every English match.
      ...(conceptMatchedIds.length > 0 ? { matchedConceptIds: conceptMatchedIds } : {})
    };
    best = best ? moreRelevantLesson(best, candidate) : candidate;
  }
  return best;
}

function renderLessonResponse(lesson: Lesson, ticket: Ticket, profile: OrganizationProfile, understanding: Understanding): string {
  const rendered = renderCustomerTemplateForTicket(lesson.customerResponse, ticket, profile, understanding);
  // TODO-048: a matched lesson proves similarity, not that its historical root
  // cause is confirmed for THIS ticket. Soften any "We found that <cause>"
  // assertion to a possibility unless the current ticket independently
  // establishes the cause. Investigation/resolution guidance is preserved.
  return applyRootCauseSafeLanguage(rendered, assessRootCauseEvidenceState(ticket, lesson));
}

function tonePrefix(profile: OrganizationProfile, ticket: Ticket, understanding: Understanding): string {
  const name = resolveCustomerAddressingName(ticket, understanding);
  switch (profile.customerTone) {
    case "friendly":
      return name ? `Hi ${name.split(/\s+/)[0]}, thanks for reaching out to ${profile.name}. Let's help you check this.` : `Hello, thanks for reaching out to ${profile.name}. Let's help you check this.`;
    case "formal":
      return name ? `Dear ${name}, we acknowledge your request to ${profile.name}.` : `Hello, we acknowledge your request to ${profile.name}.`;
    case "empathetic":
      return name ? `Hi ${name.split(/\s+/)[0]}, I am sorry you are running into this with ${profile.name}. We will help you check it carefully.` : `Hello, I am sorry you are running into this with ${profile.name}. We will help you check it carefully.`;
    case "professional":
    default:
      return name ? `Hello ${name}, thank you for contacting ${profile.name}.` : `Hello, thank you for contacting ${profile.name}.`;
  }
}

function applyProfileTone(draft: string, ticket: Ticket, profile: OrganizationProfile, understanding: Understanding): string {
  const withoutLegacyGreeting = draft
    .replace(/^(Hi|Hello|Dear)\b[^,]*,\s*/i, "")
    .trim();
  const ticketRef = ticket.ticketId ? `\n\nYour ticket reference is ${ticket.ticketId}.` : "";
  const closing = `${ticketRef}\n\nKind regards,\n${profile.name} Support Team`;
  return `${tonePrefix(profile, ticket, understanding)} ${withoutLegacyGreeting}${closing}`;
}

function appendTicketReferenceIfNeeded(draft: string, ticketId: string | undefined): string {
  if (!ticketId || draft.includes(ticketId)) return draft;
  return `${draft}\n\nYour ticket reference is ${ticketId}.`;
}

export function draftBusinessInquiryResponse(
  ticket: Ticket,
  understanding: Understanding,
  profile: OrganizationProfile,
  responseLanguage: string
): Pick<SuggestedResponse, "draftResponse" | "basedOnKnowledgeIds" | "confidenceNote" | "source"> {
  const classification = understanding.businessClassification;
  const intent = classification?.intent ?? "general_business_inquiry";
  const name = resolveCustomerAddressingName(ticket, understanding);
  const greeting = responseLanguage.toLowerCase().startsWith("id")
    ? name ? `Halo ${name}, terima kasih telah menghubungi ${profile.name}.` : `Halo, terima kasih telah menghubungi ${profile.name}.`
    : name ? `Hello ${name}, thank you for contacting ${profile.name}.` : `Hello, thank you for contacting ${profile.name}.`;
  const identity = understanding.extractedFields.companyName
    ? responseLanguage.toLowerCase().startsWith("id")
      ? `Kami memahami bahwa Anda menghubungi kami dari ${understanding.extractedFields.companyName}${understanding.extractedFields.senderRole ? ` sebagai ${understanding.extractedFields.senderRole}` : ""}.`
      : `We understand that you are contacting us from ${understanding.extractedFields.companyName}${understanding.extractedFields.senderRole ? ` as ${understanding.extractedFields.senderRole}` : ""}.`
    : "";
  const isIndonesian = responseLanguage.toLowerCase().startsWith("id");
  const products = profile.products.join(", ");
  const services = profile.services.join(", ");
  const domains = profile.supportedDomains.join(", ");
  const body = isIndonesian
    ? intent === "company_information"
      ? `${profile.name} adalah perusahaan di industri ${profile.industry}. Profil organisasi menjelaskan bahwa ${profile.description} Layanan yang tercatat meliputi: ${services}.`
      : intent === "product_information" || intent === "multilingual_support"
      ? `${profile.name} menawarkan produk berikut: ${products}. Produk dan kemampuan yang tercatat dalam profil mencakup: ${domains}.`
      : `Kami dapat membagikan informasi yang tercatat tentang ${profile.name}: ${profile.description} Produk yang tercatat adalah ${products}, dengan layanan ${services}.`
    : intent === "company_information"
      ? `${profile.name} operates in the ${profile.industry} industry. The approved organization profile describes it as ${profile.description} The listed services are: ${services}.`
      : intent === "product_information" || intent === "multilingual_support"
      ? `${profile.name} offers: ${products}. The capabilities currently listed in the organization profile include: ${domains}.`
      : `Here is the approved information available about ${profile.name}: ${profile.description} The listed products are ${products}, with services including ${services}.`;
  const limitation = isIndonesian
    ? `Profil organisasi saat ini tidak memuat harga, lampiran, tautan publik, atau detail integrasi, jadi informasi tersebut tidak saya karang.`
    : `The current organization profile does not include pricing, attachments, public links, or integration details, so I have not invented them.`;
  const reference = ticket.ticketId
    ? isIndonesian ? `\n\nReferensi tiket Anda adalah ${ticket.ticketId}.` : `\n\nYour ticket reference is ${ticket.ticketId}.`
    : "";
  const closing = isIndonesian ? `\n\nHormat kami,\nTim ${profile.name}` : `\n\nKind regards,\n${profile.name} Support Team`;
  return {
    draftResponse: `${greeting}${identity ? `\n\n${identity}` : ""}\n\n${body}\n\n${limitation}${reference}${closing}`,
    basedOnKnowledgeIds: [],
    confidenceNote: `Grounded business-inquiry draft based only on the approved ${profile.name} organization profile (${intent}). No operational lessons, resolved tickets, pricing, links, attachments, or unsupported integrations were used. Human review is required before sending.`,
    source: "deterministic"
  };
}

export function draftResponse(
  ticket: Ticket,
  understanding: Understanding,
  topMatch: KnowledgeMatch | null,
  profile: OrganizationProfile = defaultOrganizationProfile,
  knowledgeBaseEmpty = false,
  semanticAuthorization: SemanticLessonAuthorization | null = null
): Pick<SuggestedResponse, "draftResponse" | "basedOnKnowledgeIds" | "confidenceNote" | "source"> {
  const templateFn = CATEGORY_TEMPLATES[understanding.category] ?? CATEGORY_TEMPLATES["General"];
  const profileTemplate = getCustomerResponseTemplate(understanding.category, profile, understanding);
  let draft = profileTemplate.includes("{{customerName}}") || profileTemplate.includes("{{greetingLine}}")
    ? renderCustomerTemplateForTicket(profileTemplate, ticket, profile, understanding)
    : applyProfileTone(templateFn(ticket), ticket, profile, understanding);
  draft = appendTicketReferenceIfNeeded(draft, ticket.ticketId);
  let confidenceNote: string;
  const basedOnKnowledgeIds: string[] = [];

  const lessonSignalMatch = topMatch ? findMatchingLesson(ticket, topMatch.item) : null;
  const compatibleMatch = topMatch && isCompatibleForDrafting(understanding, topMatch.item, ticket) ? topMatch : null;
  const rejectedForCompatibility = topMatch && !compatibleMatch
    ? assessRootCauseCompatibility(understanding, topMatch.item, ticket).reason
    : null;

  const lessonMatch = compatibleMatch ? lessonSignalMatch ?? findMatchingLesson(ticket, compatibleMatch.item) : null;

  // TODO-030: compatibility makes a canonical candidate worth considering; it
  // does not make every coincidental lesson-signal overlap safe for drafting.
  // Re-apply the existing strong-evidence gate at the final authorization
  // boundary so a generic signal such as "billing invoice" cannot turn a
  // broadly compatible canonical item into a lesson-informed response. Do not
  // fall through to the canonical template in this case: a selected lesson was
  // considered, but its evidence was insufficient, so the conservative result
  // is no_template. This gate is independent of trust and runs before semantic
  // authorization, so neither can rescue weak deterministic evidence.
  if (lessonMatch && compatibleMatch && !isStrongLessonEvidence(lessonMatch, isTicketCategoryClassified(understanding))) {
    return {
      draftResponse: UNCATEGORIZED_PLACEHOLDER,
      basedOnKnowledgeIds: [],
      confidenceNote: `A possible lesson overlap was rejected because its matched signals were not strong enough to authorize drafting. Human review must author the response and capture the correct root cause in Reflection.`,
      source: "no_template"
    };
  }

  if (lessonMatch && compatibleMatch) {
    draft = renderLessonResponse(lessonMatch.lesson, ticket, profile, understanding);
    draft = appendTicketReferenceIfNeeded(draft, ticket.ticketId);
    const lessonLabel = lessonMatch.lesson.title ?? lessonMatch.lesson.rootCause;
    const evidence = assessRootCauseEvidenceState(ticket, lessonMatch.lesson);
    confidenceNote = `Lesson-informed draft: "${lessonLabel}" (matched signals: ${lessonMatch.matchedSignals.join(", ")}). ${rootCauseEvidenceNote(evidence)} Guidance used: ${lessonMatch.lesson.solution}. Human review is still required unless trust allows auto-resolution.`;
    basedOnKnowledgeIds.push(compatibleMatch.item.id);
    return { draftResponse: draft, basedOnKnowledgeIds, confidenceNote, source: "deterministic" };
  }

  // Semantic fallback (TODO-009 Step 2): only reachable when the deterministic
  // compatibility gate did NOT authorize the match. authorizeSemanticLessonReuse
  // re-verifies every deterministic gate (state must be exactly "unknown", no
  // contradiction, real lesson, high confidence) before a lesson-informed draft
  // is allowed; any failure falls through to the existing no_template path.
  const semanticLesson = !compatibleMatch && topMatch
    ? authorizeSemanticLessonReuse(understanding, topMatch.item, ticket, semanticAuthorization)
    : null;
  if (semanticLesson && topMatch) {
    draft = renderLessonResponse(semanticLesson, ticket, profile, understanding);
    draft = appendTicketReferenceIfNeeded(draft, ticket.ticketId);
    const lessonLabel = semanticLesson.title ?? semanticLesson.rootCause;
    const evidence = assessRootCauseEvidenceState(ticket, semanticLesson);
    confidenceNote = `Lesson-informed draft (semantic match): "${lessonLabel}". Deterministic root-cause evidence was insufficient, and the AI discrimination layer confirmed with high confidence that this ticket describes the same underlying problem. Reasoning: ${semanticAuthorization?.reasoning ?? "n/a"}. ${rootCauseEvidenceNote(evidence)} Guidance used: ${semanticLesson.solution}. Human review is still required unless trust allows auto-resolution.`;
    basedOnKnowledgeIds.push(topMatch.item.id);
    return { draftResponse: draft, basedOnKnowledgeIds, confidenceNote, source: "deterministic" };
  }

  // TODO-046: category/root-cause compatibility only makes a canonical item
  // eligible for consideration. It is not sufficient evidence to claim that
  // validated Organizational Memory applies. The legacy canonical-template
  // fallback below used to authorize any positive matchScore even when no
  // validated lesson matched the ticket (the TODO-041 C02 bypass). Fail closed
  // at the final authorization boundary so a customer-facing template cannot
  // be presented as grounded merely because the item shares a broad category.
  if (compatibleMatch && !lessonMatch) {
    return {
      draftResponse: UNCATEGORIZED_PLACEHOLDER,
      basedOnKnowledgeIds: [],
      confidenceNote: "A compatible canonical candidate was considered, but no validated lesson provided sufficient relevance evidence. Current-case status: NOT_CONFIRMED (no validated lesson evidence). Human review must author the response and capture the correct root cause in Reflection.",
      source: "no_template"
    };
  }

  if (!compatibleMatch || understanding.category === UNCATEGORIZED_CATEGORY) {
    return {
      draftResponse: UNCATEGORIZED_PLACEHOLDER,
      basedOnKnowledgeIds: [],
      confidenceNote: rejectedForCompatibility
        ? `No compatible knowledge template was authorized. ${rejectedForCompatibility} Current-case status: NOT_CONFIRMED (no validated lesson evidence). Human review must author the response and capture the correct root cause in Reflection.`
        : knowledgeBaseEmpty
        ? "No approved knowledge exists yet. A human must author the first response and capture the learning in Reflection."
        : "No compatible knowledge matched this ticket. Current-case status: NOT_CONFIRMED (no validated lesson evidence). A human must author the response and capture the learning in Reflection.",
      source: "no_template"
    };
  }

  if (compatibleMatch && compatibleMatch.matchScore >= 55) {
    draft = renderCustomerResponse(compatibleMatch.item, ticket, profile, understanding);
    draft = appendTicketReferenceIfNeeded(draft, ticket.ticketId);
    confidenceNote = `Moderate-to-strong canonical relevance. This draft uses the customer-facing response template, not internal agent guidance. Human review is still required unless trust allows auto-resolution.`;
    basedOnKnowledgeIds.push(compatibleMatch.item.id);
  } else if (compatibleMatch && compatibleMatch.matchScore > 0) {
    draft = renderCustomerResponse(compatibleMatch.item, ticket, profile, understanding);
    draft = appendTicketReferenceIfNeeded(draft, ticket.ticketId);
    confidenceNote = `Weak canonical relevance. The customer-facing template is used, but human review is required.`;
    basedOnKnowledgeIds.push(compatibleMatch.item.id);
  } else {
    confidenceNote = `No matching knowledge found. No prior knowledge matched this ticket. Human review is required before saving or sending.`;
  }

  return { draftResponse: draft, basedOnKnowledgeIds, confidenceNote, source: "deterministic" };
}
