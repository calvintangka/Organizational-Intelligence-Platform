import type { Ticket } from "@/types";
import type { Observation, Understanding, ReasoningSummary, Confidence, BusinessRelevance } from "@/types/oip";
import type { KnowledgeMatch, OrganizationProfile } from "@/types";
import { defaultOrganizationProfile } from "@/data/seedOrganizationProfiles";
import { profileKeywordBank } from "@/lib/organizationProfile";

const FALLBACK_PROFILE = defaultOrganizationProfile;

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
  "forgot", "recover", "recovery",
  // Billing / commerce
  "payment", "billing", "invoice", "refund", "subscription",
  "cancel", "purchase", "bought", "license",
  // Delivery
  "delivery", "shipment", "order",
  // Product / tech
  "product", "app", "dashboard", "technical", "error", "bug", "access"
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
  return signals.filter((signal) => text.includes(signal));
}

export function assessBusinessRelevance(ticketText: string): BusinessRelevance {
  return assessBusinessRelevanceForProfile(ticketText, FALLBACK_PROFILE);
}

export function assessBusinessRelevanceForProfile(
  ticketText: string,
  profile: OrganizationProfile = FALLBACK_PROFILE
): BusinessRelevance {
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
  }
];

// Weighted signals for categories where multiple related terms should accumulate
// confidence instead of requiring one exact phrase. Categories not listed here
// fall back to the default 1-point-per-keyword system.
const CATEGORY_WEIGHTS: Record<string, Array<[string, number]>> = {
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
    ["access", 1]
  ]
};

const URGENCY_HIGH_WORDS = ["urgent", "immediately", "asap", "today", "blocked", "emergency", "critical", "right now", "cannot wait", "important"];
const URGENCY_LOW_WORDS = ["whenever", "not urgent", "no rush", "at some point", "eventually", "low priority"];

const CORE_PROBLEM_MAP: Record<string, string> = {
  Activation: "Customer cannot activate product after purchase",
  "Two-Factor Auth": "Customer cannot complete two-factor authentication to access the account",
  Login: "Customer cannot log in to the account",
  Billing: "Customer has a payment or billing issue",
  Refund: "Customer is requesting a refund",
  Subscription: "Customer needs help with subscription management",
  "Account Access": "Customer cannot access their account",
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
  General: "Customer needs support assistance"
};

const UNCATEGORIZED_CATEGORY = "Uncategorized";
const UNCATEGORIZED_INTENT = "Unknown - requires human classification";
const UNCATEGORIZED_REASONING = "No existing category matched this query with sufficient confidence. Human review will classify this issue and teach the system.";

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
  return rule.keywords.some((keyword) => profileText.includes(keyword)) ||
    rule.tags.some((tag) => profileText.includes(tag.replace("-", " "))) ||
    profileText.includes(rule.category.toLowerCase()) ||
    profile.supportedDomains.some((domain) => categoryText.includes(domain.toLowerCase()));
}

export function understandForProfile(ticket: Ticket, profile: OrganizationProfile = FALLBACK_PROFILE): Understanding {
  // Normalize apostrophes so "can't" matches "cant", "I'm" matches "im", etc.
  const fullText = `${ticket.subject} ${ticket.description}`
    .toLowerCase()
    .replace(/[\'\'`]/g, "");

  let bestCategory = "General";
  let bestScore = 0;
  let detectedCategoryTags: string[] = [];
  let explicitCategoryMatched = false;

  const rules = CATEGORY_RULES.filter((rule) => categoryAllowedByProfile(rule, profile));

  for (const rule of rules) {
    let score = 0;
    const weights = CATEGORY_WEIGHTS[rule.category];
    if (weights) {
      for (const [keyword, weight] of weights) {
        if (fullText.includes(keyword)) score += weight;
      }
    } else {
      for (const keyword of rule.keywords) {
        if (fullText.includes(keyword)) score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = rule.category;
      detectedCategoryTags = rule.tags;
    }
  }

  if (bestScore === 0 && ticket.category && ticket.category !== "General") {
    const rule = rules.find((candidate) => candidate.category.toLowerCase() === ticket.category.toLowerCase());
    if (rule) {
      bestCategory = rule.category;
      detectedCategoryTags = rule.tags;
      explicitCategoryMatched = true;
    }
  }

  if (bestScore === 0 && !explicitCategoryMatched) {
    bestCategory = UNCATEGORIZED_CATEGORY;
    detectedCategoryTags = [];
  }

















  let urgency: "low" | "medium" | "high" = "medium";
  if (URGENCY_HIGH_WORDS.some((word) => fullText.includes(word))) urgency = "high";
  else if (URGENCY_LOW_WORDS.some((word) => fullText.includes(word))) urgency = "low";

  const detectedSignals: string[] = [];
  for (const rule of rules) {
    for (const keyword of rule.keywords) {
      if (fullText.includes(keyword) && !detectedSignals.includes(keyword)) {
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

 



 return {
    ticketId: ticket.id,
    summary,
    coreProblem,
 



   category: bestCategory,
    intent,
    urgency,
    tags: [...new Set(tags)],
   



 detectedSignals: detectedSignals.slice(0, 6)
  };
}
function inferIntent(category: string, detectedSignals: string[], fullText: string): string | undefined {
  const hasSignal = (matcher: string | RegExp) =>
    typeof matcher === "string"
      ? detectedSignals.includes(matcher) || fullText.includes(matcher)
      : matcher.test(fullText);

  switch (category) {
    case "Login":
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
      if (hasSignal("invoice")) return "invoice_question";
      if (hasSignal("authorization") || hasSignal("transaction")) return "payment_authorization_confusion";
      return "billing_charge_issue";
    case "Subscription":
      if (hasSignal("trial expired")) return "trial_expired";
      if (hasSignal("cancel subscription") || hasSignal("unsubscribe") || hasSignal("cancel my subscription")) return "cancellation_request";
      if (hasSignal("renew") || hasSignal("renewal") || hasSignal("plan")) return "renewal_or_plan_change";
      return "subscription_help";
    case "Activation":
      if (hasSignal("activation code") || hasSignal("product key") || hasSignal("license")) return "code_or_key_rejected";
      if (hasSignal("version") || hasSignal("product version")) return "version_mismatch";
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



