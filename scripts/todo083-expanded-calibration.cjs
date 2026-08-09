/* TODO-083 expanded deterministic reasoning calibration set. */
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });
const { understandForProfile, routeBusinessInquiryUnderstanding } = require(path.join(root, "lib", "analyzer.ts"));
const { defaultOrganizationProfile, seedOrganizationProfiles } = require(path.join(root, "data", "seedOrganizationProfiles.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));

const VARIANTS = [
  text => text,
  text => `${text} Earlier context is quoted below: "The previous issue was already resolved."`,
  text => `Current issue: ${text} Older context is background only.`,
  text => `${text} This ticket should remain in human review.`,
  text => `${text} English summary: active problem is unchanged.`,
  text => `${text} Sebelumnya terdapat konteks lain yang sudah selesai.`,
  text => `${text} Shared words in old context are not evidence.`,
  text => `${text} No automatic approval is requested.`,
  text => `${text} The earlier context was already resolved.`,
  text => `${text} Preserve uncertainty in the response.`
];

const CASES = [
  { name: "password-reset", category: "Login", intent: "password_reset", canonical: "Password Reset", subject: "Forgotten password reset link", body: "I forgot my password and the password reset link is not arriving. Please help me reset it." },
  { name: "email-recovery", category: "Login", intent: "email_recovery", canonical: "Account Email Recovery", subject: "I cannot sign in because I cannot remember the account email", body: "I cannot sign in because I no longer remember which email address is associated with my account. Please help me recover the account email." },
  { name: "account-locked", category: "Login", intent: "account_locked", canonical: "Login Issue", subject: "Account locked after failed sign-in", body: "My account is locked after several failed sign-in attempts and I cannot log in. Please explain the safe recovery process." },
  { name: "two-factor", category: "Two-Factor Auth", intent: "verification_code_rejected", canonical: "Two-Factor Authentication Issue", subject: "Authenticator code rejected", body: "My authenticator app generates a verification code, but the one-time password is rejected every time." },
  { name: "activation", category: "Activation", intent: "activation_failure", canonical: "Activation Failure", subject: "Invitation activation is pending", body: "The activation email for our new employee is still pending and the user cannot activate the account." },
  { name: "sso", category: "Authentication", intent: "sso_certificate", canonical: "Authentication Infrastructure Issue", subject: "SAML signing certificate redirect loop", body: "After our SAML signing certificate rotation, users are stuck in an SSO redirect loop. Please help us verify the identity-provider metadata." },
  { name: "duplicate-invoice", category: "Billing", intent: "duplicate_invoice", canonical: "Billing Duplicate Invoice Investigation", subject: "Two invoices for the same period", body: "We have duplicate invoices for the same subscription period. Please investigate why two invoices were generated; do not issue a refund immediately before confirming which invoice is valid." },
  { name: "billing-contact", category: "Billing", intent: "billing_contact_update", canonical: "Billing Contact Update", subject: "Update invoice recipient", body: "Please update the billing contact email for future invoices. The legal and physical company address must remain unchanged." },
  { name: "refund", category: "Refund", intent: "refund_investigation", canonical: "Refund Investigation", subject: "Refund eligibility review", body: "Please review whether this annual charge is eligible for a refund. Account usage and renewal history must be checked first." },
  { name: "subscription", category: "Subscription", intent: "cancellation_request", canonical: "Subscription Change", subject: "Cancel subscription at renewal", body: "Please cancel our subscription at the next renewal date and confirm the safe timing without deleting historical records." },
  { name: "permissions", category: "Permissions & Access", intent: "role_permission", canonical: "Permissions & Access Issue", subject: "Export permission denied", body: "I can sign in, but my role receives access denied when exporting reports. Please explain which permission is required; an administrator will review any change." },
  { name: "report-timeout", category: "Reporting & Exports", intent: "report_export_timeout", canonical: "Large Report Export Timeout", subject: "Large report export times out", body: "Our quarterly report export reaches 94 percent and times out. Please investigate the report export timeout and do not invent a file-size limit." },
  { name: "delivery-delay", category: "Delivery Delay", intent: "delivery_delay", canonical: "Delivery Delay", subject: "Shipment tracking has not moved", body: "The shipment tracking has not moved for six days and the delivery is late. The address was already corrected; please investigate the delay." },
  { name: "lost-package", category: "Lost Package", intent: undefined, canonical: "Lost Package Problem", subject: "Package never arrived", body: "The package never arrived and the carrier cannot locate it. Please open a delivery investigation and preserve the uncertainty." },
  { name: "api-webhook", category: "API & Integrations", intent: undefined, canonical: "API Integration Issue", subject: "Callback signature validation fails", body: "Our API callback event receiver rejects the signature and the external integration does not process event payloads. Please explain the safe diagnostic steps." },
  { name: "notification", category: "Notifications & Email", intent: undefined, canonical: "Notification Delivery Issue", subject: "Product notification email delivery fails", body: "The notification service reports a mail delivery failure and product notification emails bounce for several recipients. Ordinary mail works." },
  { name: "mobile-offline", category: "Mobile Application", intent: undefined, canonical: "Mobile Application Issue", subject: "Mobile application offline synchronization failure", body: "The mobile application queues edits while offline but does not reconnect or sync them when the device has coverage again." },
  { name: "security-phishing", category: "Security Incident", intent: "security_incident", canonical: "Security Incident", subject: "Suspicious sign-in and phishing email", body: "We saw an unrecognized login after a suspicious phishing email. Treat this as a security incident and escalate it; do not ask for our password." },
  { name: "product-info", category: "Business Inquiry", intent: "product_information", canonical: "Product Information Inquiry", subject: "Enterprise product information inquiry", body: "This business inquiry evaluates the enterprise product and needs accurate information about deployment, integrations, security, and pricing. Do not invent capabilities." },
  { name: "contradictory-refund", category: "Refund", intent: "refund_investigation", canonical: "Refund Investigation", subject: "Refund request with contradictory usage history", body: "Please review refund eligibility for the annual renewal. The account was described as unused, but audit evidence also shows a recent login, so do not approve automatically." }
];

const logisticsProfile = seedOrganizationProfiles.find((profile) => profile.id === "profile-fastdrop-logistics") ?? defaultOrganizationProfile;
const calibrationTechnicalProfile = {
  ...defaultOrganizationProfile,
  supportedDomains: [...defaultOrganizationProfile.supportedDomains, "mobile", "notifications", "email delivery"],
  businessVocabulary: [...defaultOrganizationProfile.businessVocabulary, "mobile application", "notification service", "mail delivery"],
  supportedIssueTypes: [...defaultOrganizationProfile.supportedIssueTypes, "mobile application issue", "notification delivery issue"]
};

function profileFor(scenario) {
  if (scenario.name === "lost-package" || scenario.name === "delivery-delay") return logisticsProfile;
  if (scenario.name === "mobile-offline" || scenario.name === "notification") return calibrationTechnicalProfile;
  return defaultOrganizationProfile;
}

function main() {
  const rows = [];
  let failures = 0;
  for (const scenario of CASES) {
    for (let variant = 0; variant < VARIANTS.length; variant += 1) {
      const description = VARIANTS[variant](scenario.body);
      const ticket = {
        id: `TODO083-${scenario.name}-${variant + 1}`,
        ticketId: `TODO083-${scenario.name}-${variant + 1}`,
        customerName: "Calibration Fixture",
        subject: scenario.subject,
        description,
        category: "General",
        status: "new",
        createdAt: "2026-08-05T00:00:00.000Z"
      };
      const raw = understandForProfile(ticket, profileFor(scenario));
      const routing = routeBusinessInquiryUnderstanding(raw);
      const understanding = routing.understanding;
      const canonical = routing.canonicalProblem ?? identifyCanonicalProblem(understanding, defaultOrganizationProfile);
      const actual = { category: understanding.category, intent: understanding.intent, canonical: canonical.title };
      const ok = actual.category === scenario.category && actual.intent === scenario.intent && actual.canonical === scenario.canonical;
      if (!ok) failures += 1;
    rows.push({ id: ticket.id, scenario: scenario.name, variant: variant + 1, expected: { category: scenario.category, intent: scenario.intent, canonical: scenario.canonical }, actual, security: understanding.intentIsolation?.securityIntent, active: understanding.intentIsolation?.activeProblemText, signals: understanding.detectedSignals });
    }
  }
  const result = { total: rows.length, passed: rows.length - failures, failed: failures, rows };
  console.log(JSON.stringify({ total: result.total, passed: result.passed, failed: result.failed }));
  for (const row of rows.filter((candidate) => candidate.actual.category !== candidate.expected.category || candidate.actual.intent !== candidate.expected.intent || candidate.actual.canonical !== candidate.expected.canonical)) {
    console.log(JSON.stringify(row));
  }
  if (failures > 0) process.exitCode = 1;
}

try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
