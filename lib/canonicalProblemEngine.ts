import type {
  KnowledgeItem,
  Ticket,
  CanonicalProblemExample,
  KnowledgeVersion,
  LearningHistoryEntry,
  OrganizationProfile
} from "@/types";
import type { Understanding } from "@/types/oip";
import { defaultOrganizationProfile } from "@/data/seedOrganizationProfiles";
import { profileKeywordBank } from "@/lib/organizationProfile";

export const CANONICAL_MATCH_THRESHOLD = 58;

interface CanonicalProblemIdentity {
  id: string;
  title: string;
  problemSummary: string;
  category: string;
  tags: string[];
}

const INTENT_CANONICAL_RULES: Record<string, CanonicalProblemIdentity> = {
  email_recovery: {
    id: "canonical-account-email-recovery",
    title: "Account Email Recovery",
    problemSummary: "Customers cannot log in because they do not remember the email address or account identifier associated with their account.",
    category: "Login",
    tags: ["login", "account", "email", "email-recovery"]
  }
};

export interface CanonicalProblemMatch {
  item: KnowledgeItem;
  similarity: number;
  reason: string;
}

const CANONICAL_RULES: Array<{
  id: string;
  title: string;
  category: string;
  signals: string[];
  tags: string[];
  summary: string;
}> = [
  {
    id: "canonical-activation-failure",
    title: "Activation Failure",
    category: "Activation",
    signals: ["activation", "activate", "activation code", "invalid", "license", "key", "product key", "purchase", "purchased"],
    tags: ["activation", "activation-code", "purchase", "license"],
    summary: "Customers cannot activate a purchased product because the activation code or license key is rejected."
  },
  {
    id: "canonical-two-factor-auth",
    title: "Two-Factor Authentication Issue",
    category: "Two-Factor Auth",
    signals: [
      "two-factor", "2fa", "two factor", "authenticator app", "authenticator",
      "verification code", "otp", "one-time password", "one time password",
      "backup codes", "backup code", "second factor", "mfa", "multi-factor", "totp"
    ],
    tags: ["2fa", "two-factor", "otp", "mfa"],
    summary: "Customers cannot complete two-factor authentication because their OTP, verification code, or authenticator app code is rejected or unavailable."
  },
  {
    id: "canonical-login-issue",
    title: "Login Issue",
    category: "Login",
    signals: ["login", "log in", "sign in", "cannot log in", "can't log in", "password reset", "reset password", "forgot password", "reset email"],
    tags: ["login", "password", "account"],
    summary: "Customers cannot log in to their account due to password, authentication, or login session issues."
  },
  {
    id: "canonical-account-access",
    title: "Account Access Failure",
    category: "Account Access",
    signals: ["account", "locked", "blocked", "password", "login", "log in", "access"],
    tags: ["account", "locked", "login", "password", "access"],
    summary: "Customers cannot access their account because login, password, lock, or account status prevents access."
  },
  {
    id: "canonical-payment-authorization",
    title: "Payment Authorization Confusion",
    category: "Billing",
    signals: ["payment", "billing", "charge", "charged", "invoice", "authorization", "card", "transaction"],
    tags: ["payment", "billing", "authorization"],
    summary: "Customers see payment failure or billing confusion caused by pending authorization or transaction status."
  },
  {
    id: "canonical-refund-request",
    title: "Refund Request",
    category: "Refund",
    signals: ["refund", "money back", "reimbursement", "return payment"],
    tags: ["refund", "payment"],
    summary: "Customers request a refund or reimbursement for a purchase."
  },
  {
    id: "canonical-subscription-change",
    title: "Subscription Change",
    category: "Subscription",
    signals: ["subscription", "cancel", "unsubscribe", "plan", "renew", "renewal"],
    tags: ["subscription", "plan", "renewal"],
    summary: "Customers need help changing, cancelling, or understanding a subscription."
  },
  {
    id: "canonical-delivery-delay",
    title: "Delivery Delay",
    category: "Delivery Delay",
    signals: ["delivery", "shipment", "shipping", "tracking", "package", "order", "delayed", "late", "not arrived"],
    tags: ["delivery", "shipping", "tracking", "order", "delay"],
    summary: "Customers need support because an order, shipment, or delivery is delayed or unclear."
  },
  {
    id: "canonical-package-tracking",
    title: "Package Tracking Issue",
    category: "Package Tracking",
    signals: ["tracking", "tracking number", "package", "parcel", "shipment", "status", "not updated"],
    tags: ["package", "tracking", "shipment"],
    summary: "Customers need help because package tracking is missing, stale, or unclear."
  },
  {
    id: "canonical-lost-package",
    title: "Lost Package",
    category: "Lost Package",
    signals: ["lost package", "missing package", "lost parcel", "missing parcel", "never arrived"],
    tags: ["lost-package", "package", "delivery"],
    summary: "Customers report that a package appears lost or missing."
  },
  {
    id: "canonical-address-change",
    title: "Delivery Address Change",
    category: "Address Change",
    signals: ["address change", "change address", "wrong address", "delivery address"],
    tags: ["address", "delivery"],
    summary: "Customers need to change or correct a delivery address."
  },
  {
    id: "canonical-courier-issue",
    title: "Courier Issue",
    category: "Courier Issue",
    signals: ["courier", "driver", "delivery person", "pickup"],
    tags: ["courier", "delivery"],
    summary: "Customers report an issue with courier behavior, pickup, or delivery handling."
  },
  {
    id: "canonical-client-portal-access",
    title: "Client Portal Access Issue",
    category: "Client Portal Access",
    signals: ["client portal", "portal access", "cannot access portal", "portal login", "client login"],
    tags: ["client-portal", "access", "login"],
    summary: "Clients cannot access the law firm's client portal."
  },
  {
    id: "canonical-consultation-booking",
    title: "Consultation Booking Issue",
    category: "Consultation Booking",
    signals: ["consultation", "booking", "book appointment", "schedule consultation"],
    tags: ["consultation", "booking"],
    summary: "Clients need help booking a consultation."
  },
  {
    id: "canonical-document-status",
    title: "Document Status Request",
    category: "Document Status",
    signals: ["document status", "case document", "document", "filing status"],
    tags: ["document", "status"],
    summary: "Clients request an update on document status."
  },
  {
    id: "canonical-appointment-rescheduling",
    title: "Appointment Rescheduling",
    category: "Appointment Rescheduling",
    signals: ["reschedule", "appointment", "change appointment", "move my appointment"],
    tags: ["appointment", "reschedule"],
    summary: "Clients need help rescheduling an appointment."
  },
  {
    id: "canonical-product-version",
    title: "Product Version Issue",
    category: "Product Version",
    signals: ["update", "updated", "updating", "latest version", "product version", "version", "new version", "upgrade", "patch"],
    tags: ["product-version", "update", "version"],
    summary: "Customer has an issue related to product updates or version changes."
  },
  {
    id: "canonical-installation",
    title: "Installation Issue",
    category: "Installation",
    signals: ["install", "installation", "installer", "setup", "set up", "uninstall", "reinstall", "download"],
    tags: ["installation", "setup"],
    summary: "Customer has difficulty installing, setting up, or reinstalling software."
  },
  {
    id: "canonical-compatibility",
    title: "Compatibility Issue",
    category: "Compatibility",
    signals: ["compatibility", "compatible", "incompatible", "not compatible", "unsupported", "system requirements"],
    tags: ["compatibility"],
    summary: "Customer reports a compatibility issue between the product and their environment."
  },
  {
    id: "canonical-performance",
    title: "Performance Issue",
    category: "Performance",
    signals: ["slow", "performance", "lag", "freezing", "freeze", "loading", "unresponsive", "not responding"],
    tags: ["performance"],
    summary: "Customer reports performance degradation, slowness, or unresponsiveness."
  },
  {
    id: "canonical-application-stability",
    title: "Application Stability Issue",
    category: "Application Stability",
    signals: ["crash", "crashes", "crashing", "wont open", "cannot open", "closes immediately", "not launching", "startup", "stops working", "not working"],
    tags: ["stability", "crash"],
    summary: "Customer reports application crashes, failure to launch, or instability."
  }
];

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function makeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const GENERIC_GREETING_ADDRESSEES = new Set([
  "there",
  "team",
  "support",
  "support team",
  "customer",
  "everyone",
  "all"
]);

const LEGACY_TICKET_REFERENCE_PATTERNS = [
  /Your ticket reference is\s+MT-\d{8}-\d{4}\./gi,
  /Ticket reference:\s*MT-\d{8}-\d{4}/gi
];

function looksLikeSpecificCustomerAddressee(value: string): boolean {
  const candidate = value.trim();
  if (!candidate || candidate.includes("{{")) return false;

  const lowered = candidate.toLowerCase().replace(/\s+/g, " ");
  if (GENERIC_GREETING_ADDRESSEES.has(lowered)) return false;

  const tokens = lowered.split(" ").filter(Boolean);
  if (tokens.length === 0 || tokens.length > 4) return false;
  if (tokens.some((token) => token.length < 2)) return false;
  if (tokens[tokens.length - 1] && GENERIC_GREETING_ADDRESSEES.has(tokens[tokens.length - 1])) return false;

  return tokens.every((token) => /^[a-z][a-z.'-]*$/.test(token));
}

export function normalizeReusableLessonTemplate(template: string): string {
  if (!template.trim()) return template;

  const lines = template.replace(/\r\n/g, "\n").split("\n");
  const firstLine = lines[0]?.trim() ?? "";
  const greetingMatch = firstLine.match(/^(Hi|Hello|Dear)\s+([^,\n]+),\s*$/i);

  if (greetingMatch && looksLikeSpecificCustomerAddressee(greetingMatch[2])) {
    lines[0] = "Hi {{customerName}},";
  }

  let normalized = lines.join("\n");
  for (const pattern of LEGACY_TICKET_REFERENCE_PATTERNS) {
    normalized = normalized.replace(pattern, (match) =>
      match.toLowerCase().startsWith("your ticket reference is")
        ? "Your ticket reference is {{ticketId}}."
        : "Ticket reference: {{ticketId}}"
    );
  }

  return normalized;
}

export function normalizeReusableResponseTemplate(template: string): string {
  return normalizeReusableLessonTemplate(template);
}

export function templateIncludesTicketReference(template: string): boolean {
  const normalized = normalizeReusableLessonTemplate(template);
  return normalized.includes("{{ticketId}}") || /MT-\d{8}-\d{4}/.test(normalized);
}

export function renderResponseTemplate(
  template: string,
  context: {
    greetingLine: string;
    customerName: string;
    organizationName: string;
    ticketId?: string;
  }
): string {
  const ticketId = context.ticketId?.trim() ?? "";
  let rendered = normalizeReusableLessonTemplate(template)
    .replaceAll("{{greetingLine}}", context.greetingLine)
    .replaceAll("{{customerName}}", context.customerName)
    .replaceAll("{{organizationName}}", context.organizationName)
    .replaceAll("{{ticketId}}", ticketId);

  if (!ticketId) {
    rendered = rendered.replace(/^[ \t]*(?:Your ticket reference is|Ticket reference:)\s*\.?\s*$/gim, "");
  }

  return rendered.replace(/\n{3,}/g, "\n\n").trim();
}

export function resolveCustomerAddressingName(ticket: Ticket, understanding?: Understanding): string | null {
  const extractedName = understanding?.extractedFields.senderName?.trim();
  if (extractedName) return extractedName;

  const fallbackName = ticket.customerName?.trim();
  if (!fallbackName || fallbackName.toLowerCase() === "demo user") return null;
  return fallbackName;
}

function buildGreetingLine(
  ticket: Ticket,
  profile: OrganizationProfile = defaultOrganizationProfile,
  understanding?: Understanding
): string {
  const name = resolveCustomerAddressingName(ticket, understanding);
  if (!name) return "Hello,";

  switch (profile.customerTone) {
    case "friendly":
    case "empathetic":
      return `Hi ${name.split(/\s+/)[0]},`;
    case "formal":
      return `Dear ${name},`;
    case "professional":
    default:
      return `Hello ${name},`;
  }
}

export function renderCustomerTemplateForTicket(
  template: string,
  ticket: Ticket,
  profile: OrganizationProfile = defaultOrganizationProfile,
  understanding?: Understanding
): string {
  const resolvedName = resolveCustomerAddressingName(ticket, understanding);
  return renderResponseTemplate(template, {
    greetingLine: buildGreetingLine(ticket, profile, understanding),
    customerName: resolvedName ?? "there",
    organizationName: profile.name,
    ticketId: ticket.ticketId
  });
}

function toneIntro(profile: OrganizationProfile): string {
  switch (profile.customerTone) {
    case "friendly":
      return `Thanks for reaching out to ${profile.name}. Let's help you check this.`;
    case "formal":
      return `We acknowledge your request to ${profile.name}.`;
    case "empathetic":
      return `I am sorry you are running into this with ${profile.name}. We will help you check it carefully.`;
    case "professional":
    default:
      return `Thank you for contacting ${profile.name}.`;
  }
}

function toneClosing(profile: OrganizationProfile): string {
  return `${profile.name} Support Team`;
}

function normalizeIntent(intent?: string): string {
  return intent?.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_") ?? "";
}

function buildTemplate(intro: string, closing: string, body: string[]): string {
  return [
    "{{greetingLine}}",
    "",
    intro,
    ...body,
    "",
    "Kind regards,",
    closing
  ].join("\n");
}

function getIntentAwareCustomerResponseTemplate(
  category: string,
  intro: string,
  closing: string,
  intent: string
): string {
  switch (category) {
    case "Activation":
      if (intent === "version_mismatch") {
        return buildTemplate(intro, closing, [
          "",
          "It looks like the product version may not match the license or activation that was applied.",
          "Please confirm the version installed locally, the version shown in the product, and whether the purchase was for a different edition or release.",
          "",
          "If possible, reply with the purchase confirmation email and a screenshot of the version mismatch so we can verify the license assignment."
        ]);
      }
      if (intent === "code_or_key_rejected") {
        return buildTemplate(intro, closing, [
          "",
          "It sounds like the activation code or license key is being rejected.",
          "Please copy and paste the activation code directly from the purchase email, confirm there are no extra spaces, and verify that you are activating the correct product version.",
          "",
          "If it still fails, send us the exact error message, a screenshot of the activation error, the purchase email, and the product version so we can validate the code safely."
        ]);
      }
      return buildTemplate(intro, closing, [
        "",
        "Please confirm that you are using the same email address used during your purchase.",
        "Next, copy and paste your activation code without extra spaces and verify that it matches the correct product version.",
        "",
        "If the issue continues, please send us:",
        "- your purchase confirmation email",
        "- a screenshot of the activation error",
        "- the activation code, partially masked if needed",
        "",
        "We will investigate further once we receive those details."
      ]);
    case "Two-Factor Auth":
      if (intent === "backup_codes_unavailable") {
        return buildTemplate(intro, closing, [
          "",
          "It sounds like you cannot complete sign-in because your backup codes are unavailable or not working.",
          "Please first try a fresh code from your authenticator app and make sure your device clock is set to automatic sync.",
          "If backup codes still fail, reply with the account email address and the exact error you see so we can help you safely disable and re-enroll two-factor authentication."
        ]);
      }
      if (intent === "verification_code_rejected") {
        return buildTemplate(intro, closing, [
          "",
          "It sounds like your two-factor authentication code is being rejected.",
          "Please check that your device clock is set to automatic or synced, wait for a fresh authenticator code, and enter it immediately while it is still valid.",
          "If you have backup codes, please try one of those as a fallback.",
          "",
          "If none of these steps works, reply with the account email address and the exact error so we can help you safely re-enroll two-factor authentication."
        ]);
      }
      return buildTemplate(intro, closing, [
        "",
        "Two-factor authentication codes are time-sensitive (usually valid for 30 seconds). Please try these steps:",
        "1. Check that your device clock is set to automatic or synced; even a small clock drift can invalidate codes.",
        "2. Open your authenticator app, wait for a fresh code to appear, and enter it immediately.",
        "3. If you have backup codes from when you set up 2FA, you can use one of those instead.",
        "",
        "If none of the above works, please reply with the account email address and we will help you safely disable and re-enroll two-factor authentication."
      ]);
    case "Account Access":
      if (intent === "account_locked") {
        return buildTemplate(intro, closing, [
          "",
          "It looks like the account may be locked after repeated sign-in attempts.",
          "Please wait for the lockout period to clear before trying again, and do not continue retrying while the account is still blocked.",
          "If the account does not unlock after the wait time, reply with the account email address and the exact lockout message so we can verify access safely and assist with the unlock process."
        ]);
      }
      return buildTemplate(intro, closing, [
        "",
        "Please tell us what you were trying to access in the account and the exact message or behavior you saw.",
        "If there is an error on screen, include the wording or a screenshot so we can confirm whether this is an account access issue, a settings issue, or something else."
      ]);
    case "Login":
      if (intent === "email_recovery") {
        return buildTemplate(intro, closing, [
          "",
          "We can help you recover the email associated with your account.",
          "For security reasons, please send us any details that may help us verify your account, such as:",
          "- your full name",
          "- purchase email if you remember it",
          "- invoice number or order ID",
          "- subscription details",
          "- approximate purchase date",
          "- last four digits of the payment method, if applicable",
          "",
          "Please do not send your full card number or password.",
          "Once we verify the account, we can help you identify the correct login email or guide you through the next recovery step."
        ]);
      }
      if (intent === "credentials_rejected") {
        return buildTemplate(intro, closing, [
          "",
          "It sounds like your credentials are being rejected even though you expected them to work.",
          "Please check for caps lock, confirm that no saved password is auto-filling an older value, and verify whether the password was recently changed on another device.",
          "You can use password reset as one option, but please also reply with the exact error message you see so we can confirm whether this is a credential mismatch or a different sign-in issue."
        ]);
      }
      if (intent === "account_locked") {
        return buildTemplate(intro, closing, [
          "",
          "It looks like the account may be locked after repeated sign-in attempts.",
          "Please wait for the lockout period to clear before trying again, and do not continue retrying while the account is still blocked.",
          "If the account does not unlock after the wait time, reply with the account email address and the exact lockout message so we can verify access safely and assist with the unlock process."
        ]);
      }
      return buildTemplate(intro, closing, [
        "",
        "Please try signing in again from a fresh browser session and confirm the exact error message if it fails.",
        "If you still cannot access the account, reply with the account email address so we can verify access safely and advise the next step."
      ]);
    case "Billing":
      if (intent === "invoice_question") {
        return buildTemplate(intro, closing, [
          "",
          "It sounds like there is a question about the invoice details.",
          "Please send the invoice number, the billed amount you expected to see, and a short note describing what looks incorrect so we can review the charge line by line."
        ]);
      }
      if (intent === "payment_authorization_confusion") {
        return buildTemplate(intro, closing, [
          "",
          "If your bank shows a charge while our product shows a failed payment, it may be a pending authorization that reverses automatically.",
          "Please avoid retrying the payment immediately, and send the transaction time, amount, and invoice or order details if the charge does not clear."
        ]);
      }
      return buildTemplate(intro, closing, [
        "",
        "It sounds like there may be a billing or charge issue with the account.",
        "Please reply with the invoice or order details, the billed amount, and any payment error you saw so we can review it carefully."
      ]);
    case "Refund":
      return buildTemplate(intro, closing, [
        "",
        "Please reply with your order number, the purchase email address, and the reason for the refund request.",
        "Our team will review the request and follow up with the next step."
      ]);
    case "Subscription":
      if (intent === "trial_expired") {
        return buildTemplate(intro, closing, [
          "",
          "It sounds like the account is showing a trial expired state.",
          "Please confirm whether a paid subscription was already purchased and send the account email address or invoice reference so we can verify whether the subscription was applied to the correct account."
        ]);
      }
      if (intent === "cancellation_request") {
        return buildTemplate(intro, closing, [
          "",
          "We can help with the subscription cancellation request.",
          "Please review the subscription page in account settings first, then reply with the account email address if you need us to confirm the cancellation status or process it manually."
        ]);
      }
      if (intent === "renewal_or_plan_change") {
        return buildTemplate(intro, closing, [
          "",
          "It sounds like this question is about subscription renewal, plan changes, or the next billing cycle.",
          "Please send the current plan name, the renewal date you expected, and any invoice reference so we can review the subscription timeline with you."
        ]);
      }
      return buildTemplate(intro, closing, [
        "",
        "Please send the account email address and a short description of the subscription issue so we can review the plan, renewal status, and billing timeline."
      ]);
    case "Delivery Delay":
    case "Package Tracking":
    case "Delivery":
      return buildTemplate(intro, closing, [
        "",
        "Please send your tracking number and delivery address area so we can check the latest package status.",
        "If tracking has not updated recently, we will review the courier scan history and advise the next step."
      ]);
    case "Lost Package":
      return buildTemplate(intro, closing, [
        "",
        "Please provide the tracking number, delivery address area, and the last tracking status you saw.",
        "We will check the courier record and escalate the package search if it appears missing."
      ]);
    case "Address Change":
      return buildTemplate(intro, closing, [
        "",
        "Please share the tracking number, current address, and corrected address. We will confirm whether the package can still be rerouted."
      ]);
    case "Client Portal Access":
      return [
        "Dear {{customerName}},",
        "",
        intro,
        "Please confirm the email address associated with your client portal account and any error message you see.",
        "For security, we may need to verify your identity before restoring access.",
        "",
        "Sincerely,",
        closing
      ].join("\n");
    case "Consultation Booking":
    case "Appointment Rescheduling":
      return [
        "Dear {{customerName}},",
        "",
        intro,
        "Please provide your preferred appointment date, time window, and the matter reference if you have one.",
        "We will check availability and confirm the schedule with you.",
        "",
        "Sincerely,",
        closing
      ].join("\n");
    case "Document Status":
      return [
        "Dear {{customerName}},",
        "",
        intro,
        "Please provide the document name or matter reference so we can check the current status.",
        "We can share administrative status updates, while legal substance will be reviewed by the responsible lawyer.",
        "",
        "Sincerely,",
        closing
      ].join("\n");
    case "Product Version":
      return buildTemplate(intro, closing, [
        "",
        "It sounds like this issue may be related to a recent product update or version change.",
        "Please confirm the version you are currently running and the version you updated from.",
        "If possible, include any error messages or screenshots so we can investigate further."
      ]);
    case "Installation":
      return buildTemplate(intro, closing, [
        "",
        "It sounds like you are having difficulty with installation or setup.",
        "Please let us know the operating system, the product version, and the exact error or behavior you encountered during the install process."
      ]);
    case "Compatibility":
      return buildTemplate(intro, closing, [
        "",
        "It sounds like you may have encountered a compatibility issue.",
        "Please share the environment details, including the operating system, browser, or other relevant software versions, and a description of the problem."
      ]);
    case "Performance":
      return buildTemplate(intro, closing, [
        "",
        "We understand the product is not performing as expected.",
        "Please let us know which specific feature or area is affected, how long it has been occurring, and any error messages you have seen."
      ]);
    case "Application Stability":
      return buildTemplate(intro, closing, [
        "",
        "We are sorry to hear the application is not behaving as expected.",
        "Please confirm what you were doing when the issue occurred, the product version, and any error messages or crash reports, so we can investigate."
      ]);
    default:
      return buildTemplate(intro, closing, [
        "",
        "Please share the relevant support details so we can investigate."
      ]);
  }
}

export function getCustomerResponseTemplate(
  category: string,
  profile: OrganizationProfile = defaultOrganizationProfile,
  understanding?: Understanding
): string {
  const intro = toneIntro(profile);
  const closing = toneClosing(profile);
  const intent = normalizeIntent(understanding?.intent);
  return getIntentAwareCustomerResponseTemplate(category, intro, closing, intent);
}

export function renderCustomerResponse(
  item: KnowledgeItem,
  ticket: Ticket,
  profile: OrganizationProfile = defaultOrganizationProfile,
  understanding?: Understanding
): string {
  return renderCustomerTemplateForTicket(
    item.customerResponseTemplate ?? getCustomerResponseTemplate(item.category, profile),
    ticket,
    profile,
    understanding
  );
}

export function getInternalGuidance(category: string): string {
  switch (category) {
    case "Activation":
      return [
        "Ask the customer to confirm:",
        "- purchase email",
        "- activation code",
        "- product version",
        "- screenshot of the activation error",
        "Verify license status before escalating."
      ].join("\n");
    case "Two-Factor Auth":
      return [
        "Confirm the customer's device clock is synced to automatic time.",
        "Ask which authenticator app they are using (Google Authenticator, Authy, Microsoft, etc.).",
        "Verify whether they have backup codes available.",
        "If recovery is needed: confirm account identity before disabling 2FA â€” never disable on unverified accounts."
      ].join("\n");
    case "Account Access":
    case "Login":
      return [
        "Verify account ownership before unlocking access.",
        "Confirm password reset status, lockout timer, account email, and exact login error."
      ].join("\n");
    case "Billing":
      return [
        "Check transaction status before advising repayment.",
        "Distinguish failed payment from pending bank authorization."
      ].join("\n");
    case "Delivery Delay":
    case "Package Tracking":
    case "Delivery":
      return "Check tracking number, courier scan history, promised delivery window, and address area before responding.";
    case "Lost Package":
      return "Check courier scan history and escalate to package search if tracking indicates a missing item.";
    case "Address Change":
      return "Confirm whether the shipment has been dispatched before promising an address change.";
    case "Client Portal Access":
      return "Verify client identity before changing portal access or account details.";
    case "Consultation Booking":
    case "Appointment Rescheduling":
      return "Confirm availability before promising appointment times.";
    case "Document Status":
      return "Share administrative document status only. Route legal substance to the responsible lawyer.";
    case "Product Version":
      return "Check current version, update history, and whether the issue correlates with a specific release.";
    case "Installation":
      return "Confirm OS, product edition, and installer version. Check for known install blockers.";
    case "Compatibility":
      return "Verify environment requirements and known compatibility gaps for the customer's setup.";
    case "Performance":
      return "Gather affected feature, duration, resource usage, and reproduction steps before escalating.";
    case "Application Stability":
      return "Collect crash logs, product version, OS, and reproduction steps. Check for known stability issues.";
    default:
      return "Ask for enough product, account, billing, subscription, delivery, or technical context before resolving.";
  }
}

export function getResolutionWorkflow(category: string): string[] {
  switch (category) {
    case "Activation":
      return [
        "Confirm purchase email",
        "Confirm activation code and product version",
        "Request screenshot if rejection continues",
        "Verify license status",
        "Escalate only if the license appears valid but activation fails"
      ];
    case "Two-Factor Auth":
      return [
        "Confirm device clock is synced (common root cause)",
        "Guide customer to wait for fresh code and enter immediately",
        "Offer backup-code alternative if available",
        "Verify identity before disabling/re-enrolling 2FA",
        "Escalate only if account is fully inaccessible after all self-service steps"
      ];
    case "Account Access":
    case "Login":
      return ["Confirm identity", "Check lockout status", "Guide password reset", "Escalate manual unlock if needed"];
    case "Billing":
      return ["Check payment status", "Check invoice/order record", "Explain pending authorization", "Escalate unresolved charge"];
    case "Delivery Delay":
    case "Package Tracking":
    case "Delivery":
      return ["Collect tracking number", "Check courier scan history", "Confirm delivery address area", "Escalate stale tracking"];
    case "Lost Package":
      return ["Collect tracking number", "Review last scan", "Open courier investigation", "Escalate unresolved loss"];
    case "Address Change":
      return ["Collect tracking number", "Check dispatch status", "Confirm corrected address", "Escalate if already out for delivery"];
    case "Client Portal Access":
      return ["Confirm client identity", "Check portal account status", "Guide access reset", "Escalate unresolved access"];
    case "Consultation Booking":
    case "Appointment Rescheduling":
      return ["Collect preferred schedule", "Check availability", "Confirm appointment", "Escalate complex scheduling"];
    case "Document Status":
      return ["Collect matter reference", "Check document status", "Share administrative update", "Route legal substance to lawyer"];
    case "Product Version":
      return ["Confirm current and previous version", "Check release notes for known issues", "Guide rollback or update", "Escalate persistent version issues"];
    case "Installation":
      return ["Confirm OS and product edition", "Check for known install blockers", "Guide installation steps", "Escalate failed installs"];
    case "Compatibility":
      return ["Verify system requirements", "Check known compatibility gaps", "Suggest workarounds", "Escalate confirmed incompatibility"];
    case "Performance":
      return ["Identify affected feature", "Gather resource usage data", "Check for known performance issues", "Escalate persistent degradation"];
    case "Application Stability":
      return ["Collect crash logs and version info", "Check for known stability issues", "Guide troubleshooting", "Escalate persistent crashes"];
    default:
      return ["Clarify support domain", "Collect evidence", "Resolve or escalate", "Record validated learning"];
  }
}

function ruleAllowedByProfile(
  rule: { title: string; category: string; signals: string[]; tags: string[] },
  profile: OrganizationProfile
): boolean {
  const profileText = profileKeywordBank(profile).join(" ").toLowerCase();
  const ruleText = `${rule.title} ${rule.category} ${rule.signals.join(" ")} ${rule.tags.join(" ")}`.toLowerCase();
  return (
    profile.supportedDomains.some((domain) => ruleText.includes(domain.toLowerCase())) ||
    profile.supportedIssueTypes.some((issueType) => ruleText.includes(issueType.toLowerCase())) ||
    rule.signals.some((signal) => profileText.includes(signal)) ||
    rule.tags.some((tag) => profileText.includes(tag.replace("-", " ")))
  );
}

export function identifyCanonicalProblem(
  understanding: Understanding,
  profile: OrganizationProfile = defaultOrganizationProfile
): CanonicalProblemIdentity {
  const intent = normalizeIntent(understanding.intent);
  const intentRule = INTENT_CANONICAL_RULES[intent];
  if (intentRule) {
    return {
      ...intentRule,
      tags: unique([...intentRule.tags, ...understanding.tags])
    };
  }

  const text = `${understanding.summary} ${understanding.coreProblem} ${understanding.category} ${understanding.tags.join(" ")} ${understanding.detectedSignals.join(" ")}`.toLowerCase();
  const allowedRules = CANONICAL_RULES.filter((rule) => ruleAllowedByProfile(rule, profile));
  const rule =
    allowedRules.find((candidate) => candidate.category === understanding.category) ??
    allowedRules.find((candidate) => candidate.signals.some((signal) => text.includes(signal)));

  if (rule) {
    return {
      id: rule.id,
      title: rule.title,
      problemSummary: rule.summary,
      category: rule.category,
      tags: unique([...rule.tags, ...understanding.tags])
    };
  }

  const title = understanding.category === "General" ? "General Support Problem" : `${understanding.category} Problem`;
  return {
    id: `canonical-${makeSlug(title)}`,
    title,
    problemSummary: understanding.coreProblem,
    category: understanding.category,
    tags: unique(understanding.tags)
  };
}

export function withCanonicalProblemDefaults(item: KnowledgeItem): KnowledgeItem {
  const title =
    item.canonicalProblemTitle ??
    (item.category === "Activation" ? "Activation Failure" :
     item.category === "Two-Factor Auth" ? "Two-Factor Authentication Issue" :
     item.title);
  const id = item.canonicalProblemId ?? `canonical-${makeSlug(title)}`;
  const createdAt = item.createdAt ?? new Date().toISOString();
  const lastUpdated = item.lastUpdated ?? item.lastUsedAt ?? item.approvedAt ?? createdAt;
  const internalGuidance = item.internalGuidance ?? item.approvedAnswer ?? getInternalGuidance(item.category);
  const customerResponseTemplate = item.customerResponseTemplate ?? getCustomerResponseTemplate(item.category);

  return {
    ...item,
    id,
    title,
    canonicalProblemId: id,
    canonicalProblemTitle: title,
    problemSummary: item.problemSummary ?? item.problem,
    internalGuidance,
    customerResponseTemplate,
    approvedAnswer: customerResponseTemplate,
    resolutionWorkflow: item.resolutionWorkflow ?? getResolutionWorkflow(item.category),
    exampleTickets:
      item.exampleTickets && item.exampleTickets.length > 0
        ? item.exampleTickets
        : [
            {
              ticketId: item.sourceTicketId,
              customerName: "Historical customer",
              originalIssue: item.problem,
              createdAt,
              resolutionMode: "human"
            }
          ],
    knowledgeVersions:
      item.knowledgeVersions && item.knowledgeVersions.length > 0
        ? item.knowledgeVersions
        : [
            {
              versionId: `${id}-v1`,
              createdAt,
              changeReason: "Initial canonical problem version",
              sourceTicketId: item.sourceTicketId
            }
          ],
    learningHistory: item.learningHistory ?? [
      {
        id: `${id}-history-1`,
        event: "Canonical problem initialized",
        detail: title,
        createdAt
      }
    ],
    lastUpdated,
    lastValidated: item.lastValidated ?? item.lastValidatedAt ?? item.approvedAt
  };
}

export function findCanonicalProblem(
  understanding: Understanding,
  knowledgeItems: KnowledgeItem[],
  profile: OrganizationProfile = defaultOrganizationProfile
): CanonicalProblemMatch | null {
  const identity = identifyCanonicalProblem(understanding, profile);
  const inputTokens = new Set(tokenize(`${identity.title} ${identity.problemSummary} ${identity.tags.join(" ")} ${understanding.detectedSignals.join(" ")}`));

  const matches = knowledgeItems.map((raw) => {
    const item = withCanonicalProblemDefaults(raw);
    const itemTokens = tokenize(
      `${item.canonicalProblemTitle ?? item.title} ${item.problemSummary ?? item.problem} ${item.category} ${item.tags.join(" ")}`
    );
    const overlap = itemTokens.filter((token) => inputTokens.has(token));
    const sameCanonical = item.canonicalProblemId === identity.id || item.canonicalProblemTitle === identity.title;
    const sameCategory = item.category === identity.category;
    const tagOverlap = item.tags.filter((tag) => identity.tags.includes(tag));
    const similarity =
      (sameCanonical ? 70 : 0) +
      (sameCategory ? 25 : 0) +
      Math.min(tagOverlap.length * 6, 24) +
      Math.min(overlap.length * 3, 18);

    return {
      item,
      similarity: Math.min(similarity, 100),
      reason: [
        sameCanonical ? `canonical match: ${identity.title}` : "",
        sameCategory ? `category match: ${identity.category}` : "",
        tagOverlap.length > 0 ? `shared canonical tags: ${tagOverlap.join(", ")}` : "",
        overlap.length > 0 ? `keyword overlap: ${overlap.slice(0, 4).join(", ")}` : ""
      ].filter(Boolean).join("; ")
    };
  }).sort((a, b) => b.similarity - a.similarity);

  const best = matches[0];
  return best && best.similarity >= CANONICAL_MATCH_THRESHOLD ? best : null;
}

export function createCanonicalProblem(
  ticket: Ticket,
  understanding: Understanding,
  reviewedResponse: string,
  profile: OrganizationProfile = defaultOrganizationProfile,
  createdAt = new Date().toISOString(),
  identityOverride?: { id?: string; title?: string; problemSummary?: string; category?: string; tags?: string[] }
): KnowledgeItem {
  const baseIdentity = identifyCanonicalProblem(understanding, profile);
  const title = identityOverride?.title?.trim() || baseIdentity.title;
  const category = identityOverride?.category?.trim() || baseIdentity.category;
  const identity = {
    id: identityOverride?.id?.trim() || `canonical-${makeSlug(title)}`,
    title,
    problemSummary: identityOverride?.problemSummary?.trim() || baseIdentity.problemSummary,
    category,
    tags: unique(identityOverride?.tags?.length ? identityOverride.tags : baseIdentity.tags)
  };
  const customerResponseTemplate = reviewedResponse.trim() || getCustomerResponseTemplate(identity.category, profile, understanding);

  return withCanonicalProblemDefaults({
    id: identity.id,
    title: identity.title,
    problem: identity.problemSummary,
    approvedAnswer: customerResponseTemplate,
    category: identity.category,
    tags: identity.tags,
    sourceTicketId: ticket.id,
    timesReused: 0,
    createdAt,
    approvedAt: createdAt,
    lifecycleState: "active",
    problemSummary: identity.problemSummary,
    internalGuidance: getInternalGuidance(identity.category),
    customerResponseTemplate,
    resolutionWorkflow: getResolutionWorkflow(identity.category),
    timesSeen: 1,
    successfulResolutions: 0,
    failedResolutions: 0,
    successRate: 100,
    trustScore: 20,
    lastUsedAt: createdAt,
    lastValidatedAt: createdAt,
    lastValidated: createdAt,
    autoResponseEligible: false,
    humanReviewCount: 1,
    automaticResolutionCount: 0,
    exampleTickets: [
      {
        ticketId: ticket.id,
        customerName: ticket.customerName,
        originalIssue: ticket.description,
        createdAt: ticket.createdAt,
        resolutionMode: "human"
      }
    ],
    knowledgeVersions: [
      {
        versionId: `${identity.id}-v1`,
        createdAt,
        changeReason: "Created from first validated ticket",
        sourceTicketId: ticket.id
      }
    ],
    learningHistory: [
      {
        id: `${identity.id}-history-${Date.now()}`,
        event: "Canonical problem created",
        detail: `Created from ticket ${ticket.id}`,
        createdAt
      }
    ]
  });
}

export function mergeIntoCanonicalProblem(
  item: KnowledgeItem,
  ticket: Ticket,
  understanding: Understanding,
  reviewedInternalGuidance?: string,
  resolutionMode: "human" | "automatic" | "pending" = "human",
  at = new Date().toISOString()
): KnowledgeItem {
  const base = withCanonicalProblemDefaults(item);
  const existingExample = base.exampleTickets?.some((example) => example.ticketId === ticket.id);
  const exampleTickets = existingExample
    ? base.exampleTickets ?? []
    : [
        ...(base.exampleTickets ?? []),
        {
          ticketId: ticket.id,
          customerName: ticket.customerName,
          originalIssue: ticket.description,
          createdAt: ticket.createdAt,
          resolutionMode
        }
      ];

  const shouldCreateVersion = !!reviewedInternalGuidance?.trim() && reviewedInternalGuidance.trim() !== base.internalGuidance;
  const knowledgeVersions = shouldCreateVersion
    ? [
        ...(base.knowledgeVersions ?? []),
        {
          versionId: `${base.canonicalProblemId}-v${(base.knowledgeVersions?.length ?? 0) + 1}`,
          createdAt: at,
          changeReason: "Human review strengthened internal guidance",
          sourceTicketId: ticket.id
        }
      ]
    : base.knowledgeVersions ?? [];

  return {
    ...base,
    tags: unique([...base.tags, ...understanding.tags]),
    internalGuidance: reviewedInternalGuidance?.trim() || base.internalGuidance,
    exampleTickets,
    knowledgeVersions,
    learningHistory: [
      ...(base.learningHistory ?? []),
      {
        id: `${base.canonicalProblemId}-history-${Date.now()}`,
        event: "Ticket merged into canonical problem",
        detail: `${ticket.customerName}: ${ticket.description}`,
        createdAt: at
      }
    ],
    timesSeen: (base.timesSeen ?? 0) + (existingExample ? 0 : 1),
    lastUpdated: at,
    lastValidated: resolutionMode === "human" ? at : base.lastValidated,
    lastValidatedAt: resolutionMode === "human" ? at : base.lastValidatedAt
  };
}

export function updateCanonicalProblem(item: KnowledgeItem, updates: Partial<KnowledgeItem>): KnowledgeItem {
  return withCanonicalProblemDefaults({
    ...item,
    ...updates,
    lastUpdated: new Date().toISOString()
  });
}

/* ---------------- Deduplication / merge of canonical problems ---------------- */

function newerTimestamp(a?: string | null, b?: string | null): string | undefined {
  if (!a) return b ?? undefined;
  if (!b) return a ?? undefined;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function earlierTimestamp(a?: string | null, b?: string | null): string | undefined {
  if (!a) return b ?? undefined;
  if (!b) return a ?? undefined;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

/** A rough "completeness" score used to keep guidance/templates from the richest record. */
function completeness(item: KnowledgeItem): number {
  return (
    (item.internalGuidance?.length ?? 0) +
    (item.customerResponseTemplate?.length ?? 0) +
    (item.exampleTickets?.length ?? 0) * 50 +
    (item.knowledgeVersions?.length ?? 0) * 20 +
    (item.resolutionWorkflow?.length ?? 0) * 10
  );
}

/**
 * Merge two knowledge items that represent the SAME canonical problem (same id).
 * Conservative: keeps highest trust, maxes usage counters (no inflation),
 * unions example tickets / versions / history, keeps newest timestamps and the
 * most complete guidance + customer template.
 */
export function mergeCanonicalProblemItems(a: KnowledgeItem, b: KnowledgeItem): KnowledgeItem {
  const x = withCanonicalProblemDefaults(a);
  const y = withCanonicalProblemDefaults(b);

  const xTrust = x.trustScore ?? 0;
  const yTrust = y.trustScore ?? 0;

  // Primary record = higher trust, then more complete.
  let primary = x;
  let secondary = y;
  if (yTrust > xTrust || (yTrust === xTrust && completeness(y) > completeness(x))) {
    primary = y;
    secondary = x;
  }
  const richest = completeness(y) > completeness(x) ? y : x;

  const exampleMap = new Map<string, CanonicalProblemExample>();
  for (const example of [...(x.exampleTickets ?? []), ...(y.exampleTickets ?? [])]) {
    if (!exampleMap.has(example.ticketId)) exampleMap.set(example.ticketId, example);
  }

  const versionMap = new Map<string, KnowledgeVersion>();
  for (const version of [...(x.knowledgeVersions ?? []), ...(y.knowledgeVersions ?? [])]) {
    if (!versionMap.has(version.versionId)) versionMap.set(version.versionId, version);
  }

  const historyMap = new Map<string, LearningHistoryEntry>();
  for (const entry of [...(x.learningHistory ?? []), ...(y.learningHistory ?? [])]) {
    if (!historyMap.has(entry.id)) historyMap.set(entry.id, entry);
  }

  const successfulResolutions = Math.max(x.successfulResolutions ?? 0, y.successfulResolutions ?? 0);
  const failedResolutions = Math.max(x.failedResolutions ?? 0, y.failedResolutions ?? 0);
  const totalResolutions = successfulResolutions + failedResolutions;
  const trustScore = Math.max(xTrust, yTrust);

  return {
    ...primary,
    id: primary.id,
    canonicalProblemId: primary.canonicalProblemId,
    canonicalProblemTitle: primary.canonicalProblemTitle,
    title: primary.title,
    problem: primary.problem,
    problemSummary: primary.problemSummary ?? secondary.problemSummary,
    category: primary.category,
    tags: [...new Set([...(x.tags ?? []), ...(y.tags ?? [])])],

    trustScore,
    timesSeen: Math.max(x.timesSeen ?? 0, y.timesSeen ?? 0),
    timesReused: Math.max(x.timesReused ?? 0, y.timesReused ?? 0),
    successfulResolutions,
    failedResolutions,
    successRate:
      totalResolutions > 0
        ? Math.round((successfulResolutions / totalResolutions) * 100)
        : Math.max(x.successRate ?? 100, y.successRate ?? 100),
    humanReviewCount: Math.max(x.humanReviewCount ?? 0, y.humanReviewCount ?? 0),
    automaticResolutionCount: Math.max(x.automaticResolutionCount ?? 0, y.automaticResolutionCount ?? 0),
    autoResponseEligible: trustScore >= 80 || !!x.autoResponseEligible || !!y.autoResponseEligible,

    // Keep the most complete guidance + customer template.
    internalGuidance: richest.internalGuidance ?? primary.internalGuidance,
    customerResponseTemplate: richest.customerResponseTemplate ?? primary.customerResponseTemplate,
    approvedAnswer: richest.customerResponseTemplate ?? primary.approvedAnswer,
    resolutionWorkflow:
      (primary.resolutionWorkflow?.length ?? 0) >= (secondary.resolutionWorkflow?.length ?? 0)
        ? primary.resolutionWorkflow
        : secondary.resolutionWorkflow,

    exampleTickets: [...exampleMap.values()],
    knowledgeVersions: [...versionMap.values()],
    learningHistory: [...historyMap.values()],

    // Keep active lifecycle if either is active; keep validation/provenance if present.
    lifecycleState: x.lifecycleState === "active" || y.lifecycleState === "active" ? "active" : primary.lifecycleState ?? secondary.lifecycleState,
    validation: primary.validation ?? secondary.validation,
    provenance: primary.provenance ?? secondary.provenance,

    createdAt: earlierTimestamp(x.createdAt, y.createdAt) ?? primary.createdAt,
    lastUsedAt: newerTimestamp(x.lastUsedAt, y.lastUsedAt) ?? null,
    lastValidatedAt: newerTimestamp(x.lastValidatedAt, y.lastValidatedAt) ?? null,
    lastValidated: newerTimestamp(x.lastValidated, y.lastValidated),
    lastUpdated: newerTimestamp(x.lastUpdated, y.lastUpdated)
  };
}

/**
 * Collapse a list of knowledge items so each canonical problem id appears once.
 * Duplicates are merged (not dropped) so no usage history or examples are lost.
 * Original ordering of first appearance is preserved.
 */
export function dedupeCanonicalProblems(items: KnowledgeItem[]): KnowledgeItem[] {
  const order: string[] = [];
  const byId = new Map<string, KnowledgeItem>();

  for (const raw of items) {
    const item = withCanonicalProblemDefaults(raw);
    const existing = byId.get(item.id);
    if (existing) {
      byId.set(item.id, mergeCanonicalProblemItems(existing, item));
    } else {
      byId.set(item.id, item);
      order.push(item.id);
    }
  }

  return order.map((id) => byId.get(id)!);
}

/**
 * Insert a canonical problem without ever creating a duplicate id. If one with
 * the same canonical id already exists, merge into it (in place); otherwise prepend.
 */
export function upsertCanonicalProblem(items: KnowledgeItem[], incoming: KnowledgeItem): KnowledgeItem[] {
  const normalized = withCanonicalProblemDefaults(incoming);
  const index = items.findIndex((item) => withCanonicalProblemDefaults(item).id === normalized.id);
  if (index === -1) {
    return [normalized, ...items];
  }
  const next = [...items];
  next[index] = mergeCanonicalProblemItems(items[index], normalized);
  return next;
}

/* ---------------- Data-integrity repair: generic template vs. lesson content ---------------- */

function overlapWords(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/\b\w{4,}\b/g) ?? []));
}

/** True if `template` is largely the same text as `lessonResponse` (word overlap heuristic). */
function templateMatchesLessonResponse(template: string, lessonResponse: string): boolean {
  const a = overlapWords(template);
  const b = overlapWords(lessonResponse);
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  return shared / Math.min(a.size, b.size) >= 0.7;
}

/**
 * One-time self-heal for knowledge items affected by a fixed bug where validating a
 * new lesson on an existing canonical problem (the `create_version` reflection path)
 * overwrote the item's generic `customerResponseTemplate` with that lesson's specific
 * `customerResponse`. Detects items with 2+ lessons whose top-level template is really
 * just one lesson's response wearing the generic slot, and restores a genuinely generic
 * category baseline. Lessons and knowledgeVersions are left untouched (append-only); a
 * learningHistory note records the correction instead of silently rewriting the past.
 */
export function repairCorruptedCustomerTemplates(
  items: KnowledgeItem[],
  profile: OrganizationProfile = defaultOrganizationProfile
): { items: KnowledgeItem[]; repairedCount: number } {
  let repairedCount = 0;
  const result = items.map((raw) => {
    const item = withCanonicalProblemDefaults(raw);
    if (!item.lessons || item.lessons.length < 2 || !item.customerResponseTemplate) return item;

    const clobberedBy = item.lessons.find((lesson) =>
      templateMatchesLessonResponse(item.customerResponseTemplate!, lesson.customerResponse)
    );
    if (!clobberedBy) return item;
    repairedCount++;

    const genericTemplate = getCustomerResponseTemplate(item.category, profile);
    const at = new Date().toISOString();
    return {
      ...item,
      customerResponseTemplate: genericTemplate,
      approvedAnswer: genericTemplate,
      learningHistory: [
        ...(item.learningHistory ?? []),
        {
          id: `${item.canonicalProblemId ?? item.id}-history-repair-${Date.now()}`,
          event: "Data integrity fix: generic template restored",
          detail: `The generic customer response template had been overwritten by lesson-specific content (root cause: "${clobberedBy.rootCause}") due to a bug where teaching a lesson during knowledge evolution overwrote the shared template. Restored to a genuinely generic baseline for "${item.canonicalProblemTitle ?? item.title}". All lessons, including their individual customer responses, are unchanged.`,
          createdAt: at
        }
      ],
      lastUpdated: at
    };
  });
  return { items: result, repairedCount };
}

export function repairLegacyLessonResponseTemplates(items: KnowledgeItem[]): { items: KnowledgeItem[]; repairedCount: number } {
  let repairedCount = 0;

  const result = items.map((raw, index) => {
    const item = withCanonicalProblemDefaults(raw);
    if (!item.lessons || item.lessons.length === 0) return item;

    let itemChanged = false;
    const repairedLessons = item.lessons.map((lesson) => {
      const normalizedResponse = normalizeReusableLessonTemplate(lesson.customerResponse);
      if (normalizedResponse === lesson.customerResponse) return lesson;
      repairedCount++;
      itemChanged = true;
      return {
        ...lesson,
        customerResponse: normalizedResponse
      };
    });

    if (!itemChanged) return item;

    const at = new Date().toISOString();
    return {
      ...item,
      lessons: repairedLessons,
      learningHistory: [
        ...(item.learningHistory ?? []),
        {
          id: `${item.canonicalProblemId ?? item.id}-history-lesson-template-repair-${index}-${Date.now()}`,
          event: "Data integrity fix: reusable lesson templates normalized",
          detail: "Legacy lesson customer-response templates were normalized to reusable placeholders before deterministic rendering. Customer-specific greetings and stored ticket references were converted to placeholder form without changing the lesson's solution or routing guidance.",
          createdAt: at
        }
      ],
      lastUpdated: at
    };
  });

  return { items: result, repairedCount };
}
