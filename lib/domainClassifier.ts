import type { BusinessDomainClassification } from "@/types/oip";
import type { OrganizationProfile } from "@/types";
import { profileKeywordBank } from "@/lib/organizationProfile";

interface DomainRule {
  domain: string;
  signals: string[];
  weight: number;
}

const DOMAIN_RULES: DomainRule[] = [
  {
    domain: "Authentication",
    signals: [
      "login", "log in", "sign in", "signin", "credentials", "credential",
      "password", "forgot password", "reset password", "authentication",
      "authenticate", "locked out", "account locked", "access denied",
      "username", "invalid credentials", "invalid password", "incorrect password",
      "cannot access account", "cant access account", "unable to log in",
      "unable to sign in", "login failed", "authentication failed",
      "cannot login", "cant login", "cant log in"
    ],
    weight: 1
  },
  {
    domain: "Activation",
    signals: [
      "activation", "activate", "activation code", "license", "license key",
      "product key", "serial", "serial number", "redeem", "redeem code",
      "key", "registration"
    ],
    weight: 1
  },
  {
    domain: "Two-Factor Authentication",
    signals: [
      "two-factor", "2fa", "two factor", "authenticator app", "authenticator",
      "verification code", "otp", "one-time password", "one time password",
      "backup codes", "backup code", "second factor", "mfa", "multi-factor",
      "totp", "6-digit code", "6 digit code"
    ],
    weight: 2
  },
  {
    domain: "Licensing",
    signals: [
      "license", "license key", "license expired", "license renewal",
      "product key", "serial number", "registration key", "unlock",
      "trial expired", "trial"
    ],
    weight: 1
  },
  {
    domain: "Billing",
    signals: [
      "payment", "billing", "invoice", "charge", "charged", "transaction",
      "receipt", "card", "bank", "authorization", "refund", "money back",
      "reimbursement", "return payment"
    ],
    weight: 1
  },
  {
    domain: "Subscription",
    signals: [
      "subscription", "plan", "renew", "renewal", "cancel subscription",
      "cancel my subscription", "unsubscribe", "upgrade", "downgrade",
      "pricing", "tier"
    ],
    weight: 1
  },
  {
    domain: "Product Version",
    signals: [
      "update", "updated", "updating", "latest version", "product version",
      "version", "new version", "upgrade", "upgraded", "patch",
      "release", "build", "outdated"
    ],
    weight: 1
  },
  {
    domain: "Installation",
    signals: [
      "install", "installation", "installer", "setup", "set up",
      "uninstall", "reinstall", "download", "downloading"
    ],
    weight: 1
  },
  {
    domain: "Compatibility",
    signals: [
      "compatibility", "compatible", "incompatible", "not compatible",
      "doesnt work with", "does not work with", "supported", "unsupported",
      "requirements", "system requirements", "operating system", "os",
      "windows", "mac", "linux", "browser"
    ],
    weight: 1
  },
  {
    domain: "Performance",
    signals: [
      "slow", "performance", "lag", "lagging", "freezing", "freeze",
      "frozen", "hanging", "hang", "loading", "loading screen",
      "takes long", "takes forever", "unresponsive", "not responding",
      "timeout", "memory", "cpu", "resource"
    ],
    weight: 1
  },
  {
    domain: "Application Stability",
    signals: [
      "crash", "crashes", "crashing", "wont open", "won't open",
      "cannot open", "cant open", "closes immediately", "shuts down",
      "not launching", "launch", "launching", "startup", "start up",
      "application closes", "app closes", "force close", "force quit",
      "stops working", "stopped working", "not working", "broken",
      "error", "bug", "glitch"
    ],
    weight: 1
  },
  {
    domain: "Dashboard",
    signals: [
      "dashboard", "panel", "control panel", "admin panel", "admin",
      "widget", "display", "report", "analytics", "chart"
    ],
    weight: 1
  },
  {
    domain: "Account Management",
    signals: [
      "account", "profile", "settings", "preferences", "email",
      "email address", "forgot email", "retrieve email", "change email",
      "update email", "delete account", "close account", "deactivate"
    ],
    weight: 1
  },
  {
    domain: "Data Sync",
    signals: [
      "sync", "syncing", "synchronize", "synchronization", "data",
      "importing", "import", "exporting", "export", "backup",
      "restore", "transfer", "migrate", "migration"
    ],
    weight: 1
  },
  {
    domain: "API",
    signals: [
      "api", "endpoint", "rest", "webhook", "integration",
      "api key", "api error", "rate limit", "request", "response"
    ],
    weight: 1
  },
  {
    domain: "Shipping",
    signals: [
      "shipping", "shipment", "ship", "dispatch", "dispatched",
      "carrier", "freight", "express", "standard shipping"
    ],
    weight: 1
  },
  {
    domain: "Delivery",
    signals: [
      "delivery", "delivered", "not delivered", "tracking", "tracking number",
      "package", "parcel", "order", "arrived", "delayed", "delay",
      "lost package", "missing package", "courier", "driver"
    ],
    weight: 1
  },
  {
    domain: "Client Portal",
    signals: [
      "client portal", "portal access", "cannot access portal",
      "portal login", "client login", "portal"
    ],
    weight: 2
  },
  {
    domain: "Legal Document",
    signals: [
      "document status", "case document", "document", "filing status",
      "draft status", "contract", "agreement", "legal document"
    ],
    weight: 1
  },
  {
    domain: "Consultation",
    signals: [
      "consultation", "booking", "book appointment", "schedule consultation",
      "lawyer appointment", "appointment", "reschedule", "schedule"
    ],
    weight: 1
  }
];

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function domainAllowedByProfile(rule: DomainRule, profile: OrganizationProfile): boolean {
  const profileText = profileKeywordBank(profile).join(" ").toLowerCase();
  const domainLower = rule.domain.toLowerCase();
  if (profile.supportedDomains.some((d) => d.toLowerCase().includes(domainLower) || domainLower.includes(d.toLowerCase()))) return true;
  if (profile.supportedIssueTypes.some((t) => domainLower.includes(t.toLowerCase().split(/\s+/)[0]))) return true;
  if (rule.signals.some((s) => profileText.includes(s))) return true;
  if (profile.products.some((p) => rule.signals.some((s) => p.toLowerCase().includes(s)))) return true;
  if (profile.services.some((svc) => rule.signals.some((s) => svc.toLowerCase().includes(s)))) return true;
  return false;
}

export function classifyBusinessDomain(
  ticketText: string,
  ticketId: string,
  profile: OrganizationProfile
): BusinessDomainClassification {
  const text = normalizeText(ticketText);
  const scored: Array<{ domain: string; score: number }> = [];

  for (const rule of DOMAIN_RULES) {
    if (!domainAllowedByProfile(rule, profile)) continue;
    let score = 0;
    for (const signal of rule.signals) {
      if (text.includes(signal)) {
        score += rule.weight;
      }
    }
    if (score > 0) {
      scored.push({ domain: rule.domain, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      ticketId,
      domains: ["General"],
      primaryDomain: "General",
      confidence: "low",
      organizationName: profile.name,
      reason: `No specific business domain signals detected for ${profile.name}. The ticket will continue through the pipeline for human classification.`
    };
  }

  const topScore = scored[0].score;
  const threshold = Math.max(topScore * 0.5, 1);
  const relevantDomains = scored.filter((d) => d.score >= threshold).map((d) => d.domain);
  const confidence: "high" | "medium" | "low" =
    topScore >= 4 ? "high" : topScore >= 2 ? "medium" : "low";

  return {
    ticketId,
    domains: relevantDomains,
    primaryDomain: scored[0].domain,
    confidence,
    organizationName: profile.name,
    reason: `Classified under ${relevantDomains.join(", ")} for ${profile.name} based on detected domain signals.`
  };
}
