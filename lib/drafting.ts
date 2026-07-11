import type { Ticket } from "@/types";
import type { Understanding } from "@/types/oip";
import type { KnowledgeItem, KnowledgeMatch, OrganizationProfile, SuggestedResponse, Lesson } from "@/types";
import {
  getCustomerResponseTemplate,
  renderCustomerResponse,
  renderCustomerTemplateForTicket,
  resolveCustomerAddressingName
} from "@/lib/canonicalProblemEngine";
import { defaultOrganizationProfile } from "@/data/seedOrganizationProfiles";

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
      itemFamily: "unknown"
    };
  }

  const ticketProfile = classifyRootCause(ticketText, understanding.intent);
  const itemProfile = classifyRootCause(knowledgeRootCauseText(item));

  if (ticketProfile.family === "unknown" || itemProfile.family === "unknown") {
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

function isStrongValidatedLessonMatch(ticket: Ticket, item: KnowledgeItem): boolean {
  const lessonMatch = findMatchingLesson(ticket, item);
  return !!lessonMatch && lessonMatch.score >= 2 && !ticketContradictsLesson(ticket, lessonMatch.lesson);
}

/**
 * Returns true only when category and root-cause evidence authorize the item as
 * a source of customer-facing templates. A strong validated lesson is the
 * explicit narrow exception because its signals are root-cause-specific.
 */
export function isCompatibleForDrafting(
  understanding: Understanding,
  item: KnowledgeItem,
  ticket?: Ticket
): boolean {
  const ticketCategory = understanding.category;
  const itemCategory = item.category;
  const categoryCompatible = ticketCategory === itemCategory
    || ticketCategory === "General"
    || ticketCategory === UNCATEGORIZED_CATEGORY
    || (Array.isArray(COMPATIBLE_CATEGORIES[ticketCategory]) && COMPATIBLE_CATEGORIES[ticketCategory].includes(itemCategory));
  if (!categoryCompatible) return false;
  if (!ticket) return true;
  if (isStrongValidatedLessonMatch(ticket, item)) return true;
  return assessRootCauseCompatibility(understanding, item, ticket).compatible;
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
  score: number;
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
  /\bnot a login issue\b/,
  /\bsign in normally\b/
];

function normalizeLessonSignalToken(token: string): string {
  const lower = token.toLowerCase();
  if (lower === "remembered" || lower === "remembering") return "remember";
  if (lower === "passwords") return "password";
  if (lower === "logins") return "login";
  if (lower === "credentials") return "credential";
  return lower;
}

function normalizeLessonSignalText(value: string): string {
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
  return lessonRequiresLoginFailure(lesson) && ticketHasExplicitLoginContradiction(ticketText);
}

function signalMatchesTicket(signal: string, ticketText: string, ticketTokens: Set<string>): boolean {
  const normalizedSignal = normalizeLessonSignalText(signal).trim();
  if (!normalizedSignal) return false;
  if (ticketText.includes(normalizedSignal)) return true;

  const signalTokens = tokenizeLessonSignal(normalizedSignal);
  if (signalTokens.length === 0) return false;
  if (signalPolarityContradictsTicket(signalTokens, ticketTokens)) return false;
  const overlap = signalTokens.filter((token) => ticketTokens.has(token)).length;
  const requiredOverlap = signalTokens.length <= 2 ? signalTokens.length : Math.max(2, Math.ceil(signalTokens.length * 0.6));
  return overlap >= requiredOverlap;
}

export function findMatchingLesson(ticket: Ticket, item: KnowledgeItem): LessonMatchResult | null {
  if (!item.lessons || item.lessons.length === 0) return null;
  const ticketText = normalizeLessonSignalText(`${ticket.subject} ${ticket.description}`).trim();
  const ticketTokens = new Set(tokenizeLessonSignal(ticketText));
  let best: LessonMatchResult | null = null;
  for (const lesson of item.lessons) {
    if (ticketContradictsLesson(ticket, lesson)) continue;
    const signals = lesson.signals
      .flatMap((signal) => signal.split(","))
      .map((signal) => signal.trim())
      .filter(Boolean);
    const matchedSignals = signals.filter((signal) => signalMatchesTicket(signal, ticketText, ticketTokens));
    if (matchedSignals.length > 0 && (!best || matchedSignals.length > best.score)) {
      best = { lesson, matchedSignals, score: matchedSignals.length };
    }
  }
  return best;
}

function renderLessonResponse(lesson: Lesson, ticket: Ticket, profile: OrganizationProfile, understanding: Understanding): string {
  return renderCustomerTemplateForTicket(lesson.customerResponse, ticket, profile, understanding);
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

export function draftResponse(
  ticket: Ticket,
  understanding: Understanding,
  topMatch: KnowledgeMatch | null,
  profile: OrganizationProfile = defaultOrganizationProfile,
  knowledgeBaseEmpty = false
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

  if (lessonMatch && compatibleMatch) {
    draft = renderLessonResponse(lessonMatch.lesson, ticket, profile, understanding);
    draft = appendTicketReferenceIfNeeded(draft, ticket.ticketId);
    const lessonLabel = lessonMatch.lesson.title ?? lessonMatch.lesson.rootCause;
    confidenceNote = `Lesson-informed draft: "${lessonLabel}" (matched signals: ${lessonMatch.matchedSignals.join(", ")}). Root cause: ${lessonMatch.lesson.rootCause}. Solution: ${lessonMatch.lesson.solution}. Human review is still required unless trust allows auto-resolution.`;
    basedOnKnowledgeIds.push(compatibleMatch.item.id);
    return { draftResponse: draft, basedOnKnowledgeIds, confidenceNote, source: "deterministic" };
  }

  if (!compatibleMatch || understanding.category === UNCATEGORIZED_CATEGORY) {
    return {
      draftResponse: UNCATEGORIZED_PLACEHOLDER,
      basedOnKnowledgeIds: [],
      confidenceNote: rejectedForCompatibility
        ? `No compatible knowledge template was authorized. ${rejectedForCompatibility} Human review must author the response and capture the correct root cause in Reflection.`
        : knowledgeBaseEmpty
        ? "No approved knowledge exists yet. A human must author the first response and capture the learning in Reflection."
        : "No compatible knowledge matched this ticket. A human must author the response and capture the learning in Reflection.",
      source: "no_template"
    };
  }

  if (compatibleMatch && compatibleMatch.matchScore >= 55) {
    draft = renderCustomerResponse(compatibleMatch.item, ticket, profile, understanding);
    draft = appendTicketReferenceIfNeeded(draft, ticket.ticketId);
    confidenceNote = `Medium-high confidence (canonical problem match ${compatibleMatch.matchScore}%). This draft uses the customer-facing response template, not internal agent guidance. Human review is still required unless trust allows auto-resolution.`;
    basedOnKnowledgeIds.push(compatibleMatch.item.id);
  } else if (compatibleMatch && compatibleMatch.matchScore > 0) {
    draft = renderCustomerResponse(compatibleMatch.item, ticket, profile, understanding);
    draft = appendTicketReferenceIfNeeded(draft, ticket.ticketId);
    confidenceNote = `Low-medium confidence (partial canonical problem match ${compatibleMatch.matchScore}%). The customer-facing template is used, but human review is required.`;
    basedOnKnowledgeIds.push(compatibleMatch.item.id);
  } else {
    confidenceNote = `No matching knowledge found. No prior knowledge matched this ticket. Human review is required before saving or sending.`;
  }

  return { draftResponse: draft, basedOnKnowledgeIds, confidenceNote, source: "deterministic" };
}
