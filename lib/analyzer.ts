import type { Ticket } from "@/types";
import type { ExtractedTicketFields, Observation, Understanding, ReasoningSummary, Confidence, BusinessRelevance } from "@/types/oip";
import type { KnowledgeMatch, OrganizationProfile } from "@/types";
import { defaultOrganizationProfile } from "@/data/seedOrganizationProfiles";
import { normalizeOrganizationProfile, profileKeywordBank } from "@/lib/organizationProfile";
import { containsSignal } from "@/lib/textSignal";
import { extractCustomerContext } from "@/lib/customerContext";

const FALLBACK_PROFILE = defaultOrganizationProfile;

const EMAIL_RECOVERY_SIGNALS = [
  "forgot my email",
  "forgot email",
  "forgotten my email",
  "retrieve my email",
  "retrieving my email",
  "recover my email",
  "cannot remember my email",
  "cant remember my email",
  "forgot account email",
  "dont remember my login email",
  "don't remember my login email",
  "unable to log in because i forgot my email"
];

const BUSINESS_RELEVANCE_SIGNALS = [
  // Activation
  "activation", "activate", "activation code",
  // Login / authentication synonyms
  "login", "log in", "sign in", "signin",
  "credentials", "credential",
  "authentication", "authenticate",
  "username",
  "locked out", "account locked", "access denied",
  // Account
  "password", "account", "blocked", "locked",
  // Account recovery (email/username lookup, forgot credentials)
  "email", "email address", "forgot email", "retrieve email",
  "forgot", "recover", "recovery", ...EMAIL_RECOVERY_SIGNALS,
  // Billing / commerce
  "payment", "billing", "invoice", "refund", "subscription",
  "cancel", "purchase", "bought", "license",
  // Delivery
  "delivery", "shipment", "order",
  // Product / tech
  "product", "app", "dashboard", "technical", "error", "bug", "access",
  // Software updates & versions
  "update", "updated", "updating", "latest version", "product version",
  "version", "new version", "software", "application",
  // Installation & compatibility
  "install", "installation", "installer",
  "compatibility", "compatible", "incompatible",
  // Crashes & startup
  "crash", "crashes", "crashing",
  "wont open", "cannot open", "cant open", "won t open",
  "launch", "launching", "startup", "start up",
  "closes immediately", "stops working", "not working",
  // Performance
  "loading", "loading screen", "freezing", "freeze",
  "performance", "slow", "lag", "unresponsive",
  // Features & data
  "feature", "sync", "syncing",
  "importing", "import", "exporting", "export"
];

const OUT_OF_SCOPE_SIGNALS = [
  "boyfriend",
  "girlfriend",
  "relationship",
  "dating",
  "marriage",
  "family problem",
  "medical",
  "doctor",
  "legal",
  "lawyer",
  "politics",
  "religion",
  "homework",
  "school assignment",
  "personal advice"
];

const LEGAL_SUBSTANCE_SIGNALS = [
  "should i sue",
  "sue my",
  "lawsuit",
  "legal strategy",
  "case strategy",
  "legal advice",
  "my employer",
  "court",
  "settlement",
  "file a claim"
];

function normalizeForSignalMatching(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findMatchedSignals(text: string, signals: string[]): string[] {
  return signals.filter((signal) => containsSignal(text, signal));
}

function emptyExtractedTicketFields(): ExtractedTicketFields {
  return {
    senderName: null,
    senderRole: null,
    companyName: null,
    deadline: null,
    subIssues: [],
    urgencyIndicators: []
  };
}

// TODO-050: deterministic sender/company/role extraction lives in
// lib/customerContext.ts. It only accepts identity from clear self-introduction
// / affiliation / explicit-role statements and validates that the captured span
// looks like a name — so arbitrary issue text ("This is causing duplicate
// records.") can never become the sender.
function extractFallbackTicketFields(ticket: Ticket): ExtractedTicketFields {
  const context = extractCustomerContext(ticket.description);
  return {
    ...emptyExtractedTicketFields(),
    senderName: context.senderName,
    companyName: context.companyName,
    senderRole: context.senderRole
  };
}

export function assessBusinessRelevance(ticketText: string): BusinessRelevance {
  return assessBusinessRelevanceForProfile(ticketText, FALLBACK_PROFILE);
}

export function assessBusinessRelevanceForProfile(
  ticketText: string,
  inputProfile: OrganizationProfile = FALLBACK_PROFILE
): BusinessRelevance {
  const profile = normalizeOrganizationProfile(inputProfile);
  const normalizedText = normalizeForSignalMatching(ticketText);
  const profileSignals = [
    ...profileKeywordBank(profile),
    ...BUSINESS_RELEVANCE_SIGNALS
  ];
  const profileOutOfScope = [...profile.outOfScopeTopics, ...profile.supportBoundaries, ...OUT_OF_SCOPE_SIGNALS];
  const matchedBusinessSignals = findMatchedSignals(normalizedText, [...new Set(profileSignals.map((signal) => signal.toLowerCase()))]);
  const detectedOutOfScopeSignals = findMatchedSignals(
    normalizedText,
    [...new Set(profileOutOfScope.flatMap((signal) => [signal.toLowerCase(), ...signal.toLowerCase().split(/[,.;]/)]))]
      .map((signal) => signal.trim())
      .filter((signal) => signal.length > 2)
  );
  const legalSubstanceSignals =
    profile.industry.toLowerCase().includes("legal") || profile.supportBoundaries.some((boundary) => boundary.toLowerCase().includes("legal advice"))
      ? findMatchedSignals(normalizedText, LEGAL_SUBSTANCE_SIGNALS)
      : [];

  if (legalSubstanceSignals.length > 0) {
    return {
      isRelevant: false,
      status: "uncertain",
      supportedDomain: profile.supportedDomains.join(", "),
      organizationName: profile.name,
      reason: `${profile.name} can help with support operations, but legal substance must be routed to human review before any response or learning.`,
      matchedBusinessSignals,
      detectedOutOfScopeSignals: [...new Set([...detectedOutOfScopeSignals, ...legalSubstanceSignals])],
      recommendedAction: "ask_clarifying_question"
    };
  }

  if (matchedBusinessSignals.length > 0 && detectedOutOfScopeSignals.length === 0) {
    return {
      isRelevant: true,
      status: "relevant",
      supportedDomain: profile.supportedDomains.join(", "),
      organizationName: profile.name,
      reason: `The request matches ${profile.name}'s configured products, services, vocabulary, or supported issue types.`,
      matchedBusinessSignals,
      detectedOutOfScopeSignals,
      recommendedAction: "continue"
    };
  }

  if (detectedOutOfScopeSignals.length > 0 && matchedBusinessSignals.length === 0) {
    return {
      isRelevant: false,
      status: "out_of_scope",
      supportedDomain: profile.supportedDomains.join(", "),
      organizationName: profile.name,
      reason: `The request appears outside ${profile.name}'s configured support scope, with no matching business support signals.`,
      matchedBusinessSignals,
      detectedOutOfScopeSignals,
      recommendedAction: "dismiss"
    };
  }

  if (matchedBusinessSignals.length > 0 && detectedOutOfScopeSignals.length > 0) {
    return {
      isRelevant: false,
      status: "uncertain",
      supportedDomain: profile.supportedDomains.join(", "),
      organizationName: profile.name,
      reason: `The request contains both ${profile.name} support signals and configured boundary or out-of-scope signals.`,
      matchedBusinessSignals,
      detectedOutOfScopeSignals,
      recommendedAction: "ask_clarifying_question"
    };
  }

  return {
    isRelevant: false,
    status: "uncertain",
    supportedDomain: profile.supportedDomains.join(", "),
    organizationName: profile.name,
    reason: `The request does not contain enough context from ${profile.name}'s configured products, services, domains, or vocabulary.`,
    matchedBusinessSignals,
    detectedOutOfScopeSignals,
    recommendedAction: "ask_clarifying_question"
  };
}

const CATEGORY_RULES: Array<{ category: string; keywords: string[]; tags: string[] }> = [
  {
    category: "Activation",
    keywords: ["activation", "activate", "activation code", "license", "key", "serial", "product key", "redeem"],
    tags: ["activation", "activation-code", "license"]
  },
  {
    // Checked before Login â€” 2FA terms overlap with generic auth vocabulary but describe a distinct problem
    category: "Two-Factor Auth",
    keywords: [
      "two-factor", "2fa", "two factor", "authenticator app", "authenticator",
      "verification code", "otp", "one-time password", "one time password",
      "backup codes", "backup code", "second factor", "mfa", "multi-factor",
      "totp", "6-digit code", "6 digit code"
    ],
    tags: ["2fa", "two-factor", "otp", "mfa"]
  },
  {
    // Authentication infrastructure is distinct from an end user's ordinary
    // password/login problem. Keep this vocabulary deliberately specific so a
    // generic "sign in" ticket still follows the Login rule below.
    category: "Authentication",
    keywords: [
      "single sign-on", "sso", "saml", "identity provider", "idp",
      "identity metadata", "certificate rotation", "signing certificate",
      "authentication certificate", "redirect loop",
      // TODO-039: federated-identity vocabulary so naturally worded SSO problems
      // classify as Authentication without requiring the exact stored phrases.
      // Every term here is SSO/federation-specific — never a bare generic word.
      "federated", "federation", "federated login", "federated authentication",
      "federated access", "federated sign-in", "external authentication",
      "identity service", "identity platform", "identity system",
      "corporate identity", "enterprise identity",
      "saml assertion", "assertions",
      "signing material", "signing key", "signing credential",
      "trust material", "trust certificate", "federation key", "federation credential"
    ],
    tags: ["authentication", "sso", "identity-provider"]
  },
  {
    category: "Login",
    keywords: [
      "login", "log in", "sign in", "signin",
      "credentials", "credential",
      "username",
      "invalid credentials", "invalid password", "incorrect password",
      "cannot access account", "cant access account",
      "access denied",
      "account locked", "locked out",
      "unable to log in", "unable to sign in",
      "login failed", "authentication failed",
      "cannot login", "cant login", "cant log in",
      "forgot password", "reset password",
      ...EMAIL_RECOVERY_SIGNALS,
      "password"
    ],
    tags: ["login", "password", "access"]
  },
  {
    category: "Billing",
    keywords: ["payment", "charge", "charged", "billing", "invoice", "transaction", "receipt", "card", "bank", "authorization"],
    tags: ["payment", "billing", "transaction"]
  },
  {
    category: "Refund",
    keywords: ["refund", "money back", "return payment", "cancel payment", "wrong plan", "reimbursement"],
    tags: ["refund", "payment"]
  },
  {
    category: "Subscription",
    keywords: ["subscription", "plan", "renew", "renewal", "cancel subscription", "cancel my subscription", "unsubscribe"],
    tags: ["subscription", "renewal", "plan"]
  },
  {
    category: "Account Access",
    keywords: ["account", "locked", "blocked", "suspended", "banned", "lock", "cannot access account", "account blocked"],
    tags: ["account", "locked", "access"]
  },
  {
    // Access-control administration has distinct evidence from delivery
    // timing: permission and inheritance terms must not be classified by an
    // incidental word such as "delay".
    category: "Permissions & Access",
    keywords: [
      "permission inheritance", "permissions inheritance", "permission", "permissions",
      "role inheritance", "role assignment", "role", "access grant",
      "effective permissions", "administrator approval"
    ],
    tags: ["permissions", "role", "access-control"]
  },
  {
    // Developer Demo cross-domain integration vocabulary. Keep generic
    // connection/sync words weak; specific event, callback, and signature
    // concepts should identify integration incidents without stealing tickets
    // whose actual problem is access or authentication.
    category: "API & Integrations",
    keywords: [
      "api", "api integration", "integration", "integrations", "webhook",
      "callback", "event delivery", "event receiver", "event message", "event payload",
      "external system", "third-party", "third party", "connector", "endpoint",
      "shared secret", "signing secret", "signature", "signature check", "payload",
      "incoming event", "event source", "delivery attempt", "listener", "event listener",
      "authenticity test", "traffic refused", "callback trust check"
    ],
    tags: ["api", "integrations", "webhook", "event-delivery"]
  },
  {
    // Reporting/export vocabulary is intentionally artifact-oriented. A bare
    // "data" or "report" is not enough to force this category.
    category: "Reporting & Exports",
    keywords: [
      "reporting", "dashboard", "analytics", "csv", "csv export", "export", "exported",
      "downloaded table", "downloaded file", "spreadsheet", "report export", "data export",
      "rows", "columns", "date range", "totals", "encoding", "accented", "replacement marks",
      "character fidelity", "downloaded data", "csv output", "broken characters", "punctuation",
      "text import", "report downloads", "file format"
    ],
    tags: ["reporting", "export", "analytics"]
  },
  {
    // Mobile incidents need device/app context. Offline alone remains weak so
    // a generic offline capability question can stay unclassified.
    category: "Mobile Application",
    keywords: [
      "mobile app", "mobile application", "mobile", "phone", "tablet", "handset", "on the phone",
      "on a tablet", "device", "offline", "offline work", "offline edit", "reconnect", "reconnecting",
      "field", "mobile sync", "device sync", "local queue", "without reception", "without coverage"
    ],
    tags: ["mobile", "mobile-application", "device"]
  },
  {
    // Notification vocabulary is recipient/delivery oriented. Email by itself
    // remains insufficient because email can occur in authentication or
    // account-recovery tickets.
    category: "Notifications & Email",
    keywords: [
      "notification", "notifications", "email notification", "push notification", "alert", "alerts",
      "message delivery", "recipient", "recipients", "mailbox", "mail delivery", "bounce", "bounced",
      "delivery failure", "suppression", "subscriber", "outgoing list", "notification service",
      "event notification", "product mail"
    ],
    tags: ["notifications", "email-delivery", "message-delivery"]
  },
  {
    category: "Delivery",
    keywords: ["delivery", "shipping", "tracking", "order", "arrived", "delayed", "delay", "package", "shipment"],
    tags: ["delivery", "tracking", "shipping"]
  },
  {
    category: "Delivery Delay",
    keywords: ["delivery delay", "delayed", "late", "not arrived", "has not arrived", "tracking has not updated", "tracking not updated"],
    tags: ["delivery", "delay", "tracking"]
  },
  {
    category: "Package Tracking",
    keywords: ["tracking", "tracking number", "package", "parcel", "shipment", "not updated", "status"],
    tags: ["package", "tracking", "shipment"]
  },
  {
    category: "Lost Package",
    keywords: ["lost package", "missing package", "lost parcel", "missing parcel", "cannot find", "never arrived"],
    tags: ["lost-package", "package", "delivery"]
  },
  {
    category: "Address Change",
    keywords: ["address change", "change address", "wrong address", "delivery address", "new address"],
    tags: ["address", "delivery"]
  },
  {
    category: "Courier Issue",
    keywords: ["courier", "driver", "delivery person", "rude", "did not call", "pickup"],
    tags: ["courier", "delivery"]
  },
  {
    category: "Client Portal Access",
    keywords: ["client portal", "portal access", "cannot access portal", "portal login", "client login"],
    tags: ["client-portal", "access", "login"]
  },
  {
    category: "Consultation Booking",
    keywords: ["consultation", "booking", "book appointment", "schedule consultation", "lawyer appointment"],
    tags: ["consultation", "booking"]
  },
  {
    category: "Document Status",
    keywords: ["document status", "case document", "document", "filing status", "draft status"],
    tags: ["document", "status"]
  },
  {
    category: "Appointment Rescheduling",
    keywords: ["reschedule", "appointment", "change appointment", "move my appointment"],
    tags: ["appointment", "reschedule"]
  },
  {
    category: "Product Version",
    keywords: [
      "update", "updated", "updating", "latest version", "product version",
      "version", "new version", "upgrade", "upgraded", "patch",
      "software update", "app update"
    ],
    tags: ["product-version", "update", "version"]
  },
  {
    category: "Installation",
    keywords: [
      "install", "installation", "installer", "setup", "set up",
      "uninstall", "reinstall", "download", "downloading"
    ],
    tags: ["installation", "setup"]
  },
  {
    category: "Compatibility",
    keywords: [
      "compatibility", "compatible", "incompatible", "not compatible",
      "doesnt work with", "does not work with", "unsupported",
      "system requirements", "requirements"
    ],
    tags: ["compatibility"]
  },
  {
    category: "Performance",
    keywords: [
      "slow", "performance", "lag", "lagging", "freezing", "freeze",
      "frozen", "hanging", "loading", "loading screen", "unresponsive",
      "not responding", "takes long", "takes forever"
    ],
    tags: ["performance"]
  },
  {
    category: "Application Stability",
    keywords: [
      "crash", "crashes", "crashing", "wont open", "won t open",
      "cannot open", "cant open", "closes immediately",
      "shuts down", "not launching", "launch", "launching",
      "startup", "start up", "stops working", "stopped working",
      "not working", "force close", "force quit"
    ],
    tags: ["stability", "crash"]
  }
];

export function getRecognizedClassifierCategories(): string[] {
  return [...new Set(CATEGORY_RULES.map((rule) => rule.category))];
}

export function isRecognizedClassifierCategory(category: string): boolean {
  const normalized = category.trim().toLowerCase();
  return CATEGORY_RULES.some((rule) => rule.category.toLowerCase() === normalized);
}

// Weighted signals for categories where multiple related terms should accumulate
// confidence instead of requiring one exact phrase. Categories not listed here
// fall back to the default 1-point-per-keyword system.
const CATEGORY_WEIGHTS: Record<string, Array<[string, number]>> = {
  Activation: [
    ["activation code", 8],
    ["product key", 8],
    ["activation", 6],
    ["activate", 5],
    ["license", 6],
    ["serial", 5],
    ["version mismatch", 5],
    ["product version", 1],
    ["version", 1]
  ],
  // 2FA terms are highly specific â€” any single strong signal wins over Login
  "Two-Factor Auth": [
    ["two-factor", 8],
    ["2fa", 8],
    ["two factor", 8],
    ["authenticator app", 8],
    ["one-time password", 8],
    ["one time password", 8],
    ["backup codes", 8],
    ["backup code", 8],
    ["second factor", 8],
    ["multi-factor", 8],
    ["mfa", 6],
    ["totp", 6],
    ["otp", 6],
    ["6-digit code", 6],
    ["6 digit code", 6],
    ["verification code", 6],
    ["authenticator", 4]
  ],
  Authentication: [
    ["single sign-on", 9],
    ["sso", 9],
    ["saml", 9],
    ["identity provider", 9],
    ["idp", 9],
    ["identity metadata", 8],
    ["certificate rotation", 8],
    ["signing certificate", 8],
    ["authentication certificate", 7],
    ["redirect loop", 7],
    // TODO-039: federated-identity SSO vocabulary. These are SSO/federation-
    // specific (not bare "certificate"/"redirect"/"login"/"access"), so a strong
    // combination — or a single specific SSO term — outranks the generic Login
    // rule for naturally worded SSO problems while generic tickets stay Login.
    ["federated authentication", 9],
    ["federated login", 9],
    ["federated sign-in", 9],
    ["federated access", 9],
    ["federated", 7],
    ["federation", 7],
    ["identity service", 8],
    ["identity platform", 8],
    ["identity system", 7],
    ["corporate identity", 8],
    ["enterprise identity", 8],
    ["external authentication", 7],
    ["saml assertion", 8],
    ["assertions", 4],
    ["signing material", 6],
    ["signing key", 5],
    ["signing credential", 6],
    ["trust material", 6],
    ["trust certificate", 6],
    ["federation key", 8],
    ["federation credential", 8]
  ],
  // TODO-011: strong problem-specific Billing/Refund phrases must outrank
  // incidental Subscription vocabulary ("subscription", "renewal", "plan")
  // so validated billing lessons stay reachable. Base keywords keep weight 1.
  Billing: [
    ["charged two times", 8],
    ["charged twice", 8],
    ["charged me twice", 8],
    ["double charged", 8],
    ["duplicate charge", 8],
    ["repeated charge", 8],
    ["two charges", 8],
    ["second charge", 7],
    ["extra bill", 7],
    ["overlapping charges", 7],
    ["seat change", 7],
    ["seat adjustment", 7],
    ["subscription quantity", 7],
    ["changed the plan", 6],
    ["old total", 5],
    ["both versions", 5],
    ["ledger", 4],
    ["removed seats", 6],
    ["reduced seats", 6],
    ["lowered capacity", 6],
    ["license change", 6],
    ["line items", 5],
    ["statement", 3],
    ["bill", 3],
    ["tax", 3],
    ["currency", 3],
    ["headcount", 4],
    ["payment keeps failing", 8],
    ["payment failure", 8],
    ["payment failed", 8],
    ["card declined", 8],
    ["transaction does not go through", 8],
    ["transaction declined", 8],
    ["charged twice", 6],
    ["double charged", 6],
    ["duplicate charge", 6],
    ["charged me again", 6],
    ["two charges", 5],
    // Refund phrases also count as Billing evidence: profiles without a
    // dedicated refund domain (e.g. Maesa) disable the Refund category rule,
    // and Billing's compatible categories already include Refund knowledge.
    // When both rules are active, Refund's higher weights still win.
    ["request a refund", 6],
    ["refund request", 6],
    ["want a refund", 6],
    ["payment", 1],
    ["charge", 1],
    ["charged", 1],
    ["billing", 1],
    ["invoice", 1],
    ["transaction", 1],
    ["receipt", 1],
    ["card", 1],
    ["bank", 1],
    ["authorization", 1]
  ],
  Refund: [
    ["request a refund", 6],
    ["refund request", 6],
    ["want a refund", 6],
    ["refund", 3],
    ["money back", 3],
    ["reimbursement", 3],
    ["return payment", 1],
    ["cancel payment", 1],
    ["wrong plan", 1]
  ],
  Login: [
    ["login failed", 4],
    ["authentication failed", 4],
    ["invalid credentials", 4],
    ["locked out", 4],
    ["unable to log in", 4],
    ["unable to sign in", 4],
    ["cant log in", 4],
    ["cannot login", 4],
    ["login", 3],
    ["log in", 3],
    ["sign in", 3],
    ["signin", 3],
    ["credentials", 3],
    ["credential", 3],
    // "authentication" and "invalid" removed â€” they match 2FA tickets and are not
    // specific enough to diagnose a login-credential problem on their own
    ["username", 2],
    ["password", 2],
    ["account locked", 2],
    ["access denied", 2],
    ["invalid password", 2],
    ["incorrect password", 2],
    ["cannot access account", 2],
    ["cant access account", 2],
    ["forgot password", 2],
    ["reset password", 2],
    ["forgot my email", 5],
    ["forgot email", 5],
    ["forgotten my email", 5],
    ["retrieve my email", 5],
    ["recover my email", 5],
    ["cannot remember my email", 5],
    ["cant remember my email", 5],
    ["forgot account email", 5],
    ["dont remember my login email", 5],
    ["don't remember my login email", 5],
    ["access", 1]
  ],
  "Account Access": [
    ["cannot access account", 8],
    ["cant access account", 8],
    ["account access", 7],
    ["access to my account", 7],
    ["account blocked", 7],
    ["account suspended", 7],
    ["account banned", 7],
    ["blocked", 5],
    ["suspended", 5],
    ["banned", 5],
    ["account", 1]
  ],
  "Permissions & Access": [
    ["guest workspace", 10],
    ["workspace access", 9],
    ["shared workspace", 9],
    ["external collaborator", 9],
    ["access denied", 8],
    ["permission error", 8],
    ["organization boundary", 7],
    ["organization roster", 7],
    ["team space", 7],
    ["project invite", 7],
    ["guest", 6],
    ["collaborator", 5],
    ["contractor", 5],
    ["vendor", 5],
    ["invitation", 4],
    ["shared area", 4],
    ["permission inheritance", 10],
    ["permissions inheritance", 10],
    ["role inheritance", 9],
    ["effective permissions", 9],
    ["role assignment", 8],
    ["access grant", 8],
    ["administrator approval", 7],
    ["permissions", 5],
    ["permission", 5],
    ["role", 3],
    ["inheritance", 6]
  ],
  "API & Integrations": [
    ["webhook signature", 10],
    ["signature check", 9],
    ["signing secret", 9],
    ["shared secret", 8],
    ["event receiver", 8],
    ["event listener", 8],
    ["event delivery", 8],
    ["event payload", 8],
    ["incoming event", 8],
    ["authenticity test", 8],
    ["callback trust check", 8],
    ["listener", 5],
    ["callback", 7],
    ["webhook", 7],
    ["connector", 6],
    ["external system", 6],
    ["third-party", 6],
    ["third party", 6],
    ["integration", 5],
    ["integrations", 5],
    ["endpoint", 3],
    ["signature", 4],
    ["payload", 3],
    ["api", 3],
    ["event", 2]
  ],
  "Reporting & Exports": [
    ["csv export", 10],
    ["csv output", 10],
    ["report export", 9],
    ["data export", 9],
    ["downloaded table", 9],
    ["downloaded file", 8],
    ["downloaded data", 8],
    ["character fidelity", 8],
    ["replacement marks", 8],
    ["broken characters", 8],
    ["text import", 7],
    ["report downloads", 7],
    ["punctuation", 5],
    ["file format", 5],
    ["spreadsheet", 7],
    ["dashboard", 7],
    ["analytics", 6],
    ["encoding", 6],
    ["accented", 5],
    ["date range", 5],
    ["columns", 4],
    ["rows", 4],
    ["totals", 4],
    ["reporting", 4],
    ["exported", 4],
    ["export", 3]
  ],
  "Mobile Application": [
    ["mobile application", 10],
    ["mobile app", 9],
    ["mobile sync", 8],
    ["device sync", 8],
    ["offline edit", 8],
    ["offline work", 8],
    ["without reception", 8],
    ["without coverage", 8],
    ["local queue", 8],
    ["on a tablet", 7],
    ["on the phone", 7],
    ["reconnecting", 6],
    ["reconnect", 5],
    ["handset", 5],
    ["tablet", 5],
    ["phone", 5],
    ["offline", 3],
    ["field", 3],
    ["device", 2],
    ["mobile", 4]
  ],
  "Notifications & Email": [
    ["email notification", 10],
    ["push notification", 10],
    ["event notification", 9],
    ["notification service", 9],
    ["delivery failure", 9],
    ["outgoing list", 8],
    ["message delivery", 8],
    ["product mail", 8],
    ["recipient", 6],
    ["recipients", 6],
    ["mailbox", 6],
    ["suppression", 7],
    ["bounced", 5],
    ["bounce", 5],
    ["subscriber", 5],
    ["notifications", 5],
    ["notification", 5],
    ["alerts", 4],
    ["alert", 4]
  ],
  Delivery: [
    ["delivery", 1],
    ["shipping", 1],
    ["tracking", 1],
    ["order", 1],
    ["arrived", 1],
    ["delayed", 1],
    ["delay", 1],
    ["package", 1],
    ["shipment", 1]
  ],
  "Delivery Delay": [
    ["delivery delay", 9],
    ["tracking has not updated", 6],
    ["tracking not updated", 6],
    ["has not arrived", 8],
    ["not arrived", 8],
    ["delayed", 7],
    ["late", 6],
    ["delivery", 1],
    ["tracking", 1],
    ["package", 1],
    ["shipment", 1]
  ],
  "Package Tracking": [
    ["tracking number", 8],
    ["package tracking", 8],
    ["tracking", 4],
    ["not updated", 3],
    ["status", 1],
    ["package", 1],
    ["parcel", 1],
    ["shipment", 1]
  ],
  "Lost Package": [
    ["lost package", 9],
    ["missing package", 9],
    ["lost parcel", 9],
    ["missing parcel", 9],
    ["never arrived", 9],
    ["cannot find", 6],
    ["package", 1],
    ["parcel", 1]
  ],
  "Address Change": [
    ["address change", 9],
    ["change address", 9],
    ["wrong address", 9],
    ["delivery address", 9],
    ["new address", 8]
  ],
  "Courier Issue": [
    ["courier", 7],
    ["delivery person", 7],
    ["driver", 6],
    ["did not call", 6],
    ["pickup", 5]
  ],
  "Client Portal Access": [
    ["cannot access portal", 10],
    ["client portal", 9],
    ["portal access", 9],
    ["portal login", 9],
    ["client login", 9]
  ],
  "Consultation Booking": [
    ["schedule consultation", 10],
    ["book appointment", 8],
    ["lawyer appointment", 8],
    ["consultation", 6],
    ["booking", 5]
  ],
  "Appointment Rescheduling": [
    ["change appointment", 9],
    ["move my appointment", 9],
    ["reschedule", 9],
    ["appointment", 1]
  ]
};

const CATEGORY_INTENT_PATTERNS: Record<string, Array<[string | RegExp, number]>> = {
  Login: [
    [/\bforgot password\b/, 5],
    [/\breset password\b/, 5],
    [/\binvalid credentials\b/, 6],
    [/\bincorrect password\b/, 5],
    [/\bkeeps rejecting my password\b/, 6],
    [/\bpassword is correct but\b/, 6],
    [/\blocked out\b/, 6],
    [/\baccount locked\b/, 6],
    [/\bunable to sign in\b/, 6],
    [/\bunable to log in\b/, 6],
    [/\bcannot sign in\b/, 6],
    [/\bcant sign in\b/, 6],
    [/\bcannot log in\b/, 6],
    [/\bcant log in\b/, 6]
  ],
  Billing: [
    [/\bbilling address\b/, 7],
    [/\binvoice address\b/, 7],
    [/\bupdate billing address\b/, 7],
    [/\bupdate the billing address\b/, 7],
    [/\bfuture invoices\b/, 6],
    [/\bshown on future invoices\b/, 6],
    [/\bcompany address\b/, 4],
    [/\bprevious company address\b/, 5],
    [/\binvoice still shows\b/, 5],
    [/\bbilling invoice\b/, 4]
  ]
};

const LOGIN_CONTRADICTION_PATTERNS: RegExp[] = [
  /\bi can sign in(?: to my account)?(?: normally)?\b/,
  /\bi can access my account\b/,
  /\bi remember my password\b/,
  /\bpassword is working\b/,
  /\bnot a login issue\b/,
  /\bsign in normally\b/
];

const URGENCY_HIGH_WORDS = ["urgent", "immediately", "asap", "today", "blocked", "emergency", "critical", "right now", "cannot wait", "important"];
const URGENCY_LOW_WORDS = ["whenever", "not urgent", "no rush", "at some point", "eventually", "low priority"];

const CORE_PROBLEM_MAP: Record<string, string> = {
  Activation: "Customer cannot activate product after purchase",
  "Two-Factor Auth": "Customer cannot complete two-factor authentication to access the account",
  Authentication: "Customer has an authentication infrastructure issue",
  Login: "Customer cannot log in to the account",
  Billing: "Customer has a payment or billing issue",
  Refund: "Customer is requesting a refund",
  Subscription: "Customer needs help with subscription management",
  "Account Access": "Customer cannot access their account",
  "Permissions & Access": "Customer has a permissions or access-control issue",
  "API & Integrations": "Customer has an API or integration issue",
  "Reporting & Exports": "Customer has a reporting or data-export issue",
  "Mobile Application": "Customer has a mobile application issue",
  "Notifications & Email": "Customer has a notification or email-delivery issue",
  Delivery: "Customer has a delivery or shipping issue",
  "Delivery Delay": "Customer reports a delayed delivery or stale tracking update",
  "Package Tracking": "Customer needs package tracking support",
  "Lost Package": "Customer reports a missing package",
  "Address Change": "Customer needs to change a delivery address",
  "Courier Issue": "Customer reports a courier issue",
  "Client Portal Access": "Client cannot access the client portal",
  "Consultation Booking": "Client needs help booking a consultation",
  "Document Status": "Client requests a document status update",
  "Appointment Rescheduling": "Client needs to reschedule an appointment",
  "Product Version": "Customer has a product update or version issue",
  Installation: "Customer has a software installation issue",
  Compatibility: "Customer has a compatibility issue",
  Performance: "Customer reports performance or slowness issues",
  "Application Stability": "Customer reports crashes or application instability",
  General: "Customer needs support assistance"
};

const UNCATEGORIZED_CATEGORY = "Uncategorized";
const UNCATEGORIZED_INTENT = "Unknown - requires human classification";
const UNCATEGORIZED_REASONING = "No existing category matched this query with sufficient confidence. Human review will classify this issue and teach the system.";

function scoreIntentEvidence(category: string, fullText: string): number {
  const patterns = CATEGORY_INTENT_PATTERNS[category] ?? [];
  return patterns.reduce((total, [pattern, weight]) => {
    const matched = typeof pattern === "string" ? containsSignal(fullText, pattern) : pattern.test(fullText);
    return matched ? total + weight : total;
  }, 0);
}

function hasExplicitLoginContradiction(fullText: string): boolean {
  return LOGIN_CONTRADICTION_PATTERNS.some((pattern) => pattern.test(fullText));
}

export function observe(ticket: Ticket, source: "manual-demo-input" | "seed-ticket"): Observation {
  return {
    ticketId: ticket.id,
    originalText: ticket.description,
    source,
    createdAt: new Date().toISOString(),
    preservedOriginalText: ticket.description
  };
}

export function understand(ticket: Ticket): Understanding {
  return understandForProfile(ticket, FALLBACK_PROFILE);
}

function categoryAllowedByProfile(rule: { category: string; keywords: string[]; tags: string[] }, profile: OrganizationProfile): boolean {
  const profileText = profileKeywordBank(profile).join(" ").toLowerCase();
  const categoryText = `${rule.category} ${rule.tags.join(" ")} ${rule.keywords.join(" ")}`.toLowerCase();
  return rule.keywords.some((keyword) => containsSignal(profileText, keyword)) ||
    rule.tags.some((tag) => containsSignal(profileText, tag.replace("-", " "))) ||
    containsSignal(profileText, rule.category) ||
    profile.supportedDomains.some((domain) => containsSignal(categoryText, domain));
}

/**
 * Normalize contractions and possessives without collapsing the possessive
 * stem into a different token. `provider's webhook` must retain `provider`
 * evidence, while `can't sign in` must still match the existing `cant` rules.
 */
function normalizeAnalyzerText(value: string): string {
  return value
    .toLowerCase()
    .replace(/([a-z])['’]s\b/g, "$1 s")
    .replace(/([a-z])['’](?=[a-z])/g, "$1")
    .replace(/`/g, "");
}

export function understandForProfile(ticket: Ticket, inputProfile: OrganizationProfile = FALLBACK_PROFILE): Understanding {
  const profile = normalizeOrganizationProfile(inputProfile);
  // Normalize contractions while preserving the stem of possessives such as
  // "provider's webhook" for bounded classifier concepts.
  const fullText = normalizeAnalyzerText(`${ticket.subject} ${ticket.description}`);

  let bestCategory = "General";
  let bestScore = 0;
  let detectedCategoryTags: string[] = [];
  let explicitCategoryMatched = false;

  const rules = CATEGORY_RULES.filter((rule) => categoryAllowedByProfile(rule, profile));
  const loginContradiction = hasExplicitLoginContradiction(fullText);
  const rankedCategories = rules.map((rule) => {
    let score = 0;
    const weights = CATEGORY_WEIGHTS[rule.category];
    if (weights) {
      for (const [keyword, weight] of weights) {
        if (containsSignal(fullText, keyword)) score += weight;
      }
    } else {
      for (const keyword of rule.keywords) {
        if (containsSignal(fullText, keyword)) score++;
      }
    }

    const intentEvidence = scoreIntentEvidence(rule.category, fullText);
    const contradictionPenalty = loginContradiction && rule.category === "Login" ? 6 : 0;
    const effectiveScore = score + intentEvidence - contradictionPenalty;
    return {
      rule,
      score,
      intentEvidence,
      contradictionPenalty,
      effectiveScore
    };
  });

  // Natural-language tickets often mention a neighboring domain while
  // explicitly negating it (for example, "no callback failure" in a report
  // ticket). Remove that lexical noise before selecting the category. This is
  // intentionally bounded to explicit negation/access contexts so the
  // classifier remains deterministic and does not alter retrieval safety.
  const hasNegatedConcept = (concept: string): boolean => {
    const escaped = concept.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const absencePattern = new RegExp(`\\b(?:no|without)\\b[^.!?]{0,100}\\b${escaped}\\b[^.!?]{0,45}\\b(?:detail|details|failure|issue|problem|symptom|context)\\b`);
    const notAnIssuePattern = new RegExp(`\\bnot (?:a|an|the)\\b[^.!?]{0,100}\\b${escaped}\\b`);
    const unrelatedPattern = new RegExp(`\\bunrelated to\\b[^.!?]{0,100}\\b${escaped}\\b`);
    return absencePattern.test(fullText) || notAnIssuePattern.test(fullText) || unrelatedPattern.test(fullText);
  };
  const adjust = (category: string, delta: number): void => {
    const entry = rankedCategories.find((candidate) => candidate.rule.category === category);
    if (entry) entry.effectiveScore += delta;
  };
  const hasAccessIncident = /\b(?:access denied|access is denied|cannot open|can't open|permission(?:s)? (?:was|were) removed|removed (?:the )?(?:connector )?permission(?:s)?|role lacks permission|cannot access)\b/.test(fullText);
  const hasCredentialIncident = /\b(?:password is rejected|ordinary login|login form|cannot access my account|forgot(?:ten)? (?:my )?(?:login )?email|account recovery)\b/.test(fullText);
  const hasIntegrationFailure = /\b(?:invalid|fails?|failed|refused|rejected|cannot deliver|delivery failure|signature .*?(?:invalid|fails?|failed))\b/.test(fullText);

  if (hasNegatedConcept("invoice") || hasNegatedConcept("payment")) adjust("Billing", -12);
  if (hasNegatedConcept("callback") || hasNegatedConcept("endpoint") || hasNegatedConcept("event") || hasNegatedConcept("api")) adjust("API & Integrations", -12);
  if (hasNegatedConcept("role") || hasNegatedConcept("permission") || hasNegatedConcept("workspace")) adjust("Permissions & Access", -12);
  if (hasNegatedConcept("dashboard") || hasNegatedConcept("analytics") || hasNegatedConcept("export")) adjust("Reporting & Exports", -12);
  if (hasNegatedConcept("mobile") || hasNegatedConcept("device") || hasNegatedConcept("synchronization")) adjust("Mobile Application", -12);
  if (hasNegatedConcept("email") || hasNegatedConcept("push delivery")) adjust("Notifications & Email", -12);

  if (hasAccessIncident && !hasCredentialIncident) {
    adjust("Permissions & Access", 16);
    if (!hasIntegrationFailure) adjust("API & Integrations", -12);
    if (!hasIntegrationFailure && /\baccess (?:is )?denied\b/.test(fullText)) {
      adjust("Permissions & Access", 10);
      adjust("API & Integrations", -20);
    }
  }
  if (hasCredentialIncident) {
    adjust("Login", 10);
    adjust("Permissions & Access", -12);
  }
  if (containsSignal(fullText, "identity provider") && containsSignal(fullText, "certificate")) adjust("Authentication", 6);
  if (containsSignal(fullText, "invoice charges") || containsSignal(fullText, "duplicate invoice")) adjust("Billing", 8);
  if ((containsSignal(fullText, "billing address") || containsSignal(fullText, "invoice address")) && !hasIntegrationFailure) {
    adjust("Billing", 12);
    adjust("API & Integrations", -12);
  }
  if (/\b(?:general|access|connection|offline) question\b/.test(fullText)) {
    if (!hasAccessIncident && !hasIntegrationFailure) {
      adjust("Permissions & Access", -8);
      adjust("API & Integrations", -8);
      adjust("Mobile Application", -8);
    }
  }
  if (/\breport a bug\b/.test(fullText)) adjust("Reporting & Exports", -12);
  if (/\b(?:there is|there are) no\b[^.!?]{0,90}\b(?:callback|endpoint|event delivery|api)\b/.test(fullText)) adjust("API & Integrations", -12);
  if (/\boperating system\b/.test(fullText)) adjust("Mobile Application", -12);
  if (/\b(?:electrical|static) charge\b/.test(fullText)) adjust("Mobile Application", -12);

  rankedCategories.sort((left, right) => {
    if (right.effectiveScore !== left.effectiveScore) return right.effectiveScore - left.effectiveScore;
    if (right.intentEvidence !== left.intentEvidence) return right.intentEvidence - left.intentEvidence;
    return right.score - left.score;
  });

  const rankedBest = rankedCategories[0];
  if (rankedBest) {
    bestScore = rankedBest.effectiveScore;
    bestCategory = rankedBest.rule.category;
    detectedCategoryTags = rankedBest.rule.tags;
  }

  const tiedBest = rankedBest
    ? rankedCategories.filter((entry) => entry.effectiveScore === rankedBest.effectiveScore)
    : [];

  if (tiedBest.length > 1) {
    const highestIntentEvidence = Math.max(...tiedBest.map((entry) => entry.intentEvidence));
    const bestIntentMatches = tiedBest.filter((entry) => entry.intentEvidence === highestIntentEvidence);
    if (highestIntentEvidence > 0 && bestIntentMatches.length === 1) {
      bestCategory = bestIntentMatches[0].rule.category;
      detectedCategoryTags = bestIntentMatches[0].rule.tags;
      bestScore = bestIntentMatches[0].effectiveScore;
    } else {
      bestCategory = UNCATEGORIZED_CATEGORY;
      detectedCategoryTags = [];
      bestScore = 0;
    }
  }

  if (bestScore <= 0 && ticket.category && ticket.category !== "General") {
    const rule = rules.find((candidate) => candidate.category.toLowerCase() === ticket.category.toLowerCase());
    if (rule) {
      bestCategory = rule.category;
      detectedCategoryTags = rule.tags;
      explicitCategoryMatched = true;
    }
  }

  if (bestScore <= 0 && !explicitCategoryMatched) {
    bestCategory = UNCATEGORIZED_CATEGORY;
    detectedCategoryTags = [];
  }

















  let urgency: "low" | "medium" | "high" = "medium";
  if (URGENCY_HIGH_WORDS.some((word) => fullText.includes(word))) urgency = "high";
  else if (URGENCY_LOW_WORDS.some((word) => fullText.includes(word))) urgency = "low";

  const detectedSignals: string[] = [];
  for (const rule of rules) {
    for (const keyword of rule.keywords) {
      if (containsSignal(fullText, keyword) && !detectedSignals.includes(keyword)) {
        detectedSignals.push(keyword);
 










       if (detectedSignals.length >= 8) break;
      }
    }
    if (detectedSignals.length >= 8) break;
  }

  const tags = [...new Set([...detectedCategoryTags])];
  if (fullText.includes("purchase") || fullText.includes("bought") || fullText.includes("buy")) {
 







   if (!tags.includes("purchase")) tags.push("purchase");
  }
  if (fullText.includes("email")) {
    if (!tags.includes("email")) tags.push("email");
  }

  const isUncategorized = bestCategory === UNCATEGORIZED_CATEGORY;
 






 const coreProblem = isUncategorized ? ticket.subject : CORE_PROBLEM_MAP[bestCategory] ?? ticket.subject;
  const intent = isUncategorized ? UNCATEGORIZED_INTENT : inferIntent(bestCategory, detectedSignals, fullText);
  const signalSummary = detectedSignals.slice(0, 3).join(", ");
  const summary = isUncategorized
    ? UNCATEGORIZED_REASONING
 




   : signalSummary
    ? `Customer reports: "${ticket.subject}". Key signals detected: ${signalSummary}.`
    : `Customer reports: "${ticket.subject}". No strong category signals detected.`;

 



  const extractedFields = extractFallbackTicketFields(ticket);

 return {
    ticketId: ticket.id,
    originalText: `${ticket.subject} ${ticket.description}`,
    summary,
    coreProblem,
 



   category: bestCategory,
    intent,
    urgency,
    tags: [...new Set(tags)],
    detectedSignals: detectedSignals.slice(0, 6),
    extractedFields
  };
}
function inferIntent(category: string, detectedSignals: string[], fullText: string): string | undefined {
  const hasSignal = (matcher: string | RegExp) =>
    typeof matcher === "string"
      ? detectedSignals.includes(matcher) || containsSignal(fullText, matcher)
      : matcher.test(fullText);
  const hasEmailRecoverySignal =
    EMAIL_RECOVERY_SIGNALS.some((signal) => containsSignal(fullText, signal)) ||
    (
      fullText.includes("email") &&
      ["forgot", "forgotten", "retrieve", "retrieving", "recover", "remember"].some((term) => fullText.includes(term))
    );
  const hasPasswordRecoverySignal =
    fullText.includes("password") &&
    ["forgot", "forgotten", "reset", "changed"].some((term) => fullText.includes(term));
  const hasCredentialUnavailableSignal =
    /\bnew\s+(?:laptop|computer|device)\b/.test(fullText) ||
    /\b(?:saved|stored)\s+password\b[^.!?\n]{0,80}\b(?:did not|didnt|does not|doesnt|failed to)\s+(?:transfer|carry|move|sync)\b/.test(fullText) ||
    /\b(?:never|do not|dont|did not|didnt)\s+(?:memorize|remember|know)\s+(?:the\s+)?password\b/.test(fullText) ||
    /\bforgot(?:ten)?\s+(?:my\s+)?password\b/.test(fullText);

  switch (category) {
    case "Login":
      if (hasEmailRecoverySignal) {
        return "email_recovery";
      }
      if (hasCredentialUnavailableSignal) {
        return "credentials_unavailable";
      }
      if (hasPasswordRecoverySignal || hasSignal("forgot password") || hasSignal("reset password")) {
        return "credentials_rejected";
      }
      if (
        hasSignal("invalid credentials") ||
        hasSignal("invalid password") ||
        hasSignal("incorrect password") ||
        hasSignal("credentials") ||
        hasSignal("credential")
      ) {
        return "credentials_rejected";
      }
      if (
        hasSignal("account locked") ||
        hasSignal("locked out") ||
        hasSignal("login failed") ||
        hasSignal("authentication failed")
      ) {
        return "account_locked";
      }
      return "general_login_failure";
    case "Account Access":
      if (hasEmailRecoverySignal) {
        return "email_recovery";
      }
      if (hasSignal("account locked") || hasSignal("locked out") || hasSignal("blocked") || hasSignal("suspended")) {
        return "account_locked";
      }
      return "general_account_problem";
    case "Two-Factor Auth":
      if (hasSignal("backup codes") || hasSignal("backup code")) return "backup_codes_unavailable";
      if (hasSignal("verification code") || hasSignal("otp") || hasSignal("one-time password") || hasSignal("authenticator app")) {
        return "verification_code_rejected";
      }
      return "general_2fa_failure";
    case "Billing":
      if (hasSignal("invoice") || hasSignal("invoices")) return "invoice_question";
      if (hasSignal("authorization") || hasSignal("transaction")) return "payment_authorization_confusion";
      return "billing_charge_issue";
    case "Subscription":
      if (hasSignal("trial expired")) return "trial_expired";
      if (hasSignal("cancel subscription") || hasSignal("unsubscribe") || hasSignal("cancel my subscription")) return "cancellation_request";
      if (hasSignal("renew") || hasSignal("renewal") || hasSignal("plan")) return "renewal_or_plan_change";
      return "subscription_help";
    case "Activation":
      if (hasSignal("version mismatch") || hasSignal("product version")) return "version_mismatch";
      if (hasSignal("activation code") || hasSignal("product key") || hasSignal("license")) return "code_or_key_rejected";
      if (hasSignal("version")) return "version_mismatch";
      return "activation_help";
    case "Refund":
      return "refund_request";
    default:
      return undefined;
  }
}

export function buildReasoning(understanding: Understanding, topMatch: KnowledgeMatch | null): ReasoningSummary {
  if (understanding.category === UNCATEGORIZED_CATEGORY) {
    return {
      ticketId: understanding.ticketId,
      understood: "The system could not match this ticket to an existing category with sufficient confidence. It is being held for human classification.",
      relevantMemory: topMatch ? topMatch.item.title : null,
      relevanceReason: topMatch ? topMatch.matchReason : null,
      uncertainty: topMatch
        ? `A possible knowledge candidate exists (${topMatch.matchScore}%), but OIP is not confident enough to classify this issue automatically.`
        : "No prior knowledge matched this ticket. No template is available yet.",
      humanReviewRationale:
        "A human reviewer must classify this new issue type, author the first validated response, and capture the lesson before OIP can reuse it safely."
    };
  }

  const signalList = understanding.detectedSignals.slice(0, 3).join(", ");
  const understood = signalList
    ? `The system classified this as a "${understanding.category}" issue based on detected signals: ${signalList}. Core problem: ${understanding.coreProblem}.`
    : `The system classified this as a "${understanding.category}" issue. Core problem: ${understanding.coreProblem}.`;

  const uncertainty =
    topMatch && topMatch.matchScore >= 70
      ? `High-confidence match found (${topMatch.matchScore}%), but the specific details may differ. Verify with the customer before sending.`
      : topMatch
      ? `A partial match was found (${topMatch.matchScore}%), but overlap is limited. The draft may need significant editing.`
      : "No prior knowledge matched this ticket. The draft is based on a category template only.";






  return {
    ticketId: understanding.ticketId,
    understood,
    relevantMemory: topMatch ? topMatch.item.title : null,
    relevanceReason: topMatch ? topMatch.matchReason : null,
    uncertainty,
    humanReviewRationale:
      "The OIP engine cannot confirm correctness. A human reviewer must verify the response before it is saved as reusable knowledge or sent to the customer."
 








 };
}
export function buildConfidence(understanding: Understanding, topMatch: KnowledgeMatch | null): Confidence {
  let score = 20;
  const basis: string[] = [];
  const uncertaintyFactors: string[] = [];
  const hasKnownCategory = understanding.category !== "General" && understanding.category !== UNCATEGORIZED_CATEGORY;

  if (hasKnownCategory) {
    score += 20;
    basis.push("Category identified from ticket signals");
  } else {
    uncertaintyFactors.push("Category could not be determined with confidence");
  }

  if (understanding.detectedSignals.length >= 2) {
    score += 10;
    basis.push(`${understanding.detectedSignals.length} signals detected in ticket`);
  }

  if (understanding.tags.length >= 2) {
    score += 5;
    basis.push("Multiple tags extracted");
  }

  if (topMatch) {
    const memoryBoost = Math.round(topMatch.matchScore * 0.45);



    score += memoryBoost;
    basis.push(`Memory match: ${topMatch.matchScore}% similarity`);
    if (topMatch.matchScore < 60) {
      uncertaintyFactors.push("Memory match is partial, not exact");
    }
    if (topMatch.matchedTags && topMatch.matchedTags.length > 0) {
      basis.push(`Shared tags: ${topMatch.matchedTags.join(", ")}`);
    }
  } else {
    uncertaintyFactors.push("No prior knowledge matches this ticket");
  }

  score = Math.min(score, 95);
  const level: "low" | "medium" | "high" = score >= 70 ? "high" : score >= 40 ? "medium" : "low";

  return { level, score, basis, uncertainty: uncertaintyFactors };
}
