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

/**
 * Returns true only when the knowledge item's category is an acceptable source of
 * customer response templates for the given ticket understanding. Compatibility is
 * checked before any template is rendered - it is not affected by trust or similarity.
 */
export function isCompatibleForDrafting(understanding: Understanding, item: KnowledgeItem): boolean {
  const ticketCategory = understanding.category;
  const itemCategory = item.category;
  if (ticketCategory === itemCategory) return true;
  if (ticketCategory === "General" || ticketCategory === UNCATEGORIZED_CATEGORY) return true;
  const allowed = COMPATIBLE_CATEGORIES[ticketCategory];
  return Array.isArray(allowed) ? allowed.includes(itemCategory) : false;
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

const LESSON_SIGNAL_STOPWORDS = new Set([
  "about",
  "again",
  "always",
  "before",
  "because",
  "been",
  "being",
  "can",
  "cannot",
  "could",
  "does",
  "doesn",
  "don",
  "from",
  "have",
  "included",
  "into",
  "just",
  "like",
  "need",
  "needs",
  "never",
  "not",
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

function normalizeLessonSignalToken(token: string): string {
  const lower = token.toLowerCase();
  if (lower === "remembered" || lower === "remembering") return "remember";
  if (lower === "passwords") return "password";
  if (lower === "logins") return "login";
  if (lower === "credentials") return "credential";
  return lower;
}

function tokenizeLessonSignal(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map(normalizeLessonSignalToken)
    .filter((token) => token.length > 2 && !LESSON_SIGNAL_STOPWORDS.has(token));
}

function signalMatchesTicket(signal: string, ticketText: string, ticketTokens: Set<string>): boolean {
  const normalizedSignal = signal.trim().toLowerCase();
  if (!normalizedSignal) return false;
  if (ticketText.includes(normalizedSignal)) return true;

  const signalTokens = tokenizeLessonSignal(normalizedSignal);
  if (signalTokens.length === 0) return false;
  const overlap = signalTokens.filter((token) => ticketTokens.has(token)).length;
  const requiredOverlap = signalTokens.length <= 2 ? signalTokens.length : Math.max(2, Math.ceil(signalTokens.length * 0.6));
  return overlap >= requiredOverlap;
}

export function findMatchingLesson(ticket: Ticket, item: KnowledgeItem): LessonMatchResult | null {
  if (!item.lessons || item.lessons.length === 0) return null;
  const ticketText = `${ticket.subject} ${ticket.description}`.toLowerCase();
  const ticketTokens = new Set(tokenizeLessonSignal(ticketText));
  let best: LessonMatchResult | null = null;
  for (const lesson of item.lessons) {
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
  const compatibleMatch = topMatch && (isCompatibleForDrafting(understanding, topMatch.item) || lessonSignalMatch) ? topMatch : null;
  const rejectedForCategory =
    topMatch && !compatibleMatch
      ? `Top match "${topMatch.item.title}" (${topMatch.item.category}) rejected - category incompatible with "${understanding.category}" ticket. Using correct template instead.`
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

  if (understanding.category === UNCATEGORIZED_CATEGORY) {
    return {
      draftResponse: UNCATEGORIZED_PLACEHOLDER,
      basedOnKnowledgeIds: [],
      confidenceNote: "No template available. This issue type has not been seen before. A human must author the first response and capture the learning in Reflection.",
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
  } else if (rejectedForCategory) {
    confidenceNote = `Category mismatch detected. ${rejectedForCategory} Human review required.`;
  } else if (knowledgeBaseEmpty) {
    confidenceNote = "No approved knowledge exists yet. This is a category template starter - not a knowledge-backed answer. Write the correct response below, then approve it to teach the organization its first lesson.";
  } else {
    confidenceNote = `No matching knowledge found. No prior knowledge matched this ticket. This draft uses the "${understanding.category}" category template only. Human review is required before saving or sending.`;
  }

  return { draftResponse: draft, basedOnKnowledgeIds, confidenceNote, source: "deterministic" };
}
