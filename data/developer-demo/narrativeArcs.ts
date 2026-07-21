import type { DemoDomain, MaturityPlan, NarrativeArc, NarrativeArcClass } from "@/lib/developerDemo/types";

interface ArcBlueprint {
  slug: string;
  domain: DemoDomain;
  title: string;
  problemSummary: string;
  symptom: string;
  introducedAt: string;
}

const DOMAIN_CONTENT: Record<DemoDomain, {
  category: string;
  rootCauses: string[];
  solutionSteps: string[];
  ticketOpeners: string[];
}> = {
  authentication: {
    category: "Authentication",
    rootCauses: [
      "identity-provider metadata is stale after a configuration change",
      "browser session cookies retain an obsolete authentication state",
      "tenant domain mapping points to the wrong identity connection",
      "certificate validity or signing metadata no longer matches",
      "device clock drift invalidates a time-bound authentication exchange",
      "user provisioning has not completed before the first sign-in",
      "a conditional-access rule excludes the user's device context",
      "the login identifier differs in case or normalization between systems",
      "a recovery method was rotated without refreshing the active session",
      "the workspace policy requires a factor the user has not enrolled"
    ],
    solutionSteps: [
      "compare the workspace identity settings with the provider metadata",
      "clear only the affected authentication session and retry in a private window",
      "confirm domain, certificate, clock, and provisioning state before changing access"
    ],
    ticketOpeners: ["We cannot complete sign-in", "Our users are returned to the login screen", "Workspace access stopped working"]
  },
  billing: {
    category: "Billing",
    rootCauses: [
      "a seat change crossed the invoice calculation boundary",
      "tax rounding was applied independently to prorated line items",
      "billing profile changes occurred after the invoice snapshot",
      "a failed payment retry overlapped the next scheduled collection",
      "an annual renewal used a seat count captured before reconciliation",
      "credit application and invoice generation completed out of order",
      "currency display settings differ from the settlement currency",
      "tax exemption evidence was still pending at invoice finalization",
      "a plan transition created both a credit and a replacement charge",
      "invoice PDF caching retained the previous billing identity"
    ],
    solutionSteps: [
      "reconstruct the billing timeline from seat, plan, and invoice events",
      "compare line-item dates before issuing any manual correction",
      "explain the adjustment and escalate only when the ledger is inconsistent"
    ],
    ticketOpeners: ["The latest invoice does not match our expectation", "Our billing administrator sees an unexpected amount", "We need help reconciling this charge"]
  },
  integrations: {
    category: "API & Integrations",
    rootCauses: [
      "a signing secret was rotated before every sender refreshed it",
      "retry delivery reused an expired timestamp window",
      "the connector schema changed before field mappings were updated",
      "an OAuth refresh token was revoked during an administrator change",
      "a pagination cursor was reused after the source collection changed",
      "rate-limit bursts exceeded the integration's backoff policy",
      "an idempotency key was shared across distinct write operations",
      "network allowlisting omitted a newly advertised endpoint range",
      "webhook replay ordering delivered a dependent event first",
      "the integration account lost access to one mapped workspace field"
    ],
    solutionSteps: [
      "confirm credentials, signatures, scopes, and endpoint versions",
      "replay a single controlled request with correlation identifiers",
      "apply bounded retry and mapping changes before resuming the full sync"
    ],
    ticketOpeners: ["Our integration stopped processing events", "The API workflow now fails consistently", "Webhook delivery is not reaching our service"]
  },
  permissions: {
    category: "Permissions & Access",
    rootCauses: [
      "role inheritance has not propagated to the target workspace",
      "a custom role omits one dependent permission",
      "guest access is limited by an organization-wide policy",
      "an administrator approval remains pending for a delegated action",
      "cached authorization claims predate the latest role assignment",
      "resource ownership moved without transferring its explicit grants",
      "a group mapping resolves to a similarly named inactive group",
      "audit visibility is restricted to a narrower administrative scope",
      "a temporary access grant expired while the session remained active",
      "the requested action requires both workspace and resource permission"
    ],
    solutionSteps: [
      "compare effective permissions at organization, workspace, and resource levels",
      "refresh authorization claims after confirming the intended role",
      "record the smallest approved permission change and its owner"
    ],
    ticketOpeners: ["A team member cannot access the expected resource", "The role looks correct but the action is denied", "Our administrator cannot see the required control"]
  },
  reporting: {
    category: "Reporting & Exports",
    rootCauses: [
      "the report timezone differs from the viewer's workspace timezone",
      "a saved filter references a field that changed during rollout",
      "large exports exceed the synchronous processing window",
      "CSV encoding does not match the consuming spreadsheet locale",
      "dashboard cache refresh trails the source transaction window",
      "column order migration reset a saved export layout",
      "date boundaries were evaluated before timezone conversion",
      "aggregated totals exclude records still being indexed",
      "a permission filter removes rows from the report result",
      "an offline export retained filters from an earlier mobile session"
    ],
    solutionSteps: [
      "reproduce the report with explicit timezone and filter boundaries",
      "compare source counts with the generated export job",
      "use an asynchronous export or corrected saved view when required"
    ],
    ticketOpeners: ["The report output does not match the dashboard", "Our scheduled export contains unexpected results", "The downloaded CSV cannot be used as expected"]
  },
  mobile: {
    category: "Mobile Application",
    rootCauses: [
      "an offline mutation conflicts with a newer server revision",
      "a stale push token remains registered after device migration",
      "biometric credentials were invalidated by an operating-system update",
      "a deep link retained the previous workspace identifier",
      "cellular upload resumed with an expired attachment session",
      "the installed application version predates the required sync protocol",
      "background refresh was disabled by device power policy",
      "offline report filters were serialized before the latest selection",
      "local cache eviction removed a pending synchronization cursor",
      "device locale formatting changed a date or numeric filter"
    ],
    solutionSteps: [
      "confirm app version, workspace, connectivity, and pending offline changes",
      "refresh only the affected local session before retrying synchronization",
      "preserve unsent work and escalate with device diagnostics when necessary"
    ],
    ticketOpeners: ["The mobile app behaves differently from the web workspace", "Our device cannot complete the expected action", "Mobile synchronization is stuck"]
  },
  notifications: {
    category: "Notifications & Email",
    rootCauses: [
      "recipient suppression remains after an earlier delivery failure",
      "DMARC alignment does not match the configured sender domain",
      "notification preferences were evaluated in the wrong workspace",
      "digest scheduling used the account timezone instead of the workspace timezone",
      "a provider incident delayed delivery beyond the relevance window",
      "locale fallback selected an untranslated or empty template variant",
      "duplicate campaign events entered separate delivery partitions",
      "a stale mobile token accepted but did not display the notification",
      "email routing rules moved the message outside the primary inbox",
      "template variables were unavailable for one notification subtype"
    ],
    solutionSteps: [
      "trace preference, template, provider, and recipient delivery states",
      "remove suppression only after confirming the recipient and sender configuration",
      "send one controlled notification before restoring normal delivery volume"
    ],
    ticketOpeners: ["Expected notifications are not arriving", "The email digest was delivered incorrectly", "Our users received duplicate alerts"]
  }
};

const HERO_BLUEPRINTS: ArcBlueprint[] = [
  { slug: "sso-certificate-redirect-loop", domain: "authentication", title: "SSO Redirect Loop After Certificate Rotation", problemSummary: "Users repeatedly return to sign-in after an identity-provider certificate rotation.", symptom: "a redirect loop begins immediately after certificate maintenance", introducedAt: "2023-01-03T02:00:00.000Z" },
  { slug: "duplicate-invoice-seat-change", domain: "billing", title: "Duplicate Invoice After Seat Changes", problemSummary: "Seat changes near a billing boundary appear as duplicate or overlapping invoice charges.", symptom: "two invoice lines appear to charge for the same seat period", introducedAt: "2023-01-08T02:00:00.000Z" },
  { slug: "webhook-signature-secret-rotation", domain: "integrations", title: "Webhook Signature Failure After Secret Rotation", problemSummary: "Webhook consumers reject valid deliveries after signing-secret rotation.", symptom: "signature verification starts failing after a planned secret rotation", introducedAt: "2023-01-12T02:00:00.000Z" }
];

const PRIMARY_FREQUENCY_BLUEPRINTS: ArcBlueprint[] = [
  { slug: "mfa-device-clock-drift", domain: "authentication", title: "MFA Codes Rejected by Device Clock Drift", problemSummary: "Time-based authentication codes fail when a device clock is not synchronized.", symptom: "fresh authenticator codes are rejected on one device", introducedAt: "2023-02-01T02:00:00.000Z" },
  { slug: "scim-delayed-provisioning", domain: "authentication", title: "Delayed SCIM User Provisioning", problemSummary: "New users cannot sign in because SCIM provisioning has not completed.", symptom: "a newly assigned user remains unavailable in the workspace", introducedAt: "2023-03-01T02:00:00.000Z" },
  { slug: "invoice-tax-rounding", domain: "billing", title: "Invoice Tax Rounding Difference", problemSummary: "Prorated invoice line items produce a small but explainable tax rounding difference.", symptom: "line-item tax totals differ from the summary by a small amount", introducedAt: "2023-03-15T02:00:00.000Z" },
  { slug: "proration-credit-mismatch", domain: "billing", title: "Proration Credit Timing Mismatch", problemSummary: "Plan changes show a charge before the related proration credit is visible.", symptom: "the replacement charge appears before its matching credit", introducedAt: "2023-04-01T02:00:00.000Z" },
  { slug: "api-rate-limit-burst", domain: "integrations", title: "API Rate-Limit Burst During Synchronization", problemSummary: "Large synchronization bursts exceed API limits without sufficient backoff.", symptom: "a scheduled synchronization receives repeated rate-limit responses", introducedAt: "2023-04-20T02:00:00.000Z" },
  { slug: "oauth-refresh-token-revoked", domain: "integrations", title: "Revoked OAuth Refresh Token", problemSummary: "An integration loses authorization after its refresh token is revoked.", symptom: "the connector requests authorization again after an admin change", introducedAt: "2023-05-10T02:00:00.000Z" },
  { slug: "permission-inheritance-delay", domain: "permissions", title: "Permission Inheritance Delay", problemSummary: "New role assignments take time to become effective across workspace resources.", symptom: "a user remains denied shortly after receiving the correct role", introducedAt: "2023-06-01T02:00:00.000Z" },
  { slug: "custom-role-cache", domain: "permissions", title: "Custom Role Claim Cache", problemSummary: "Cached authorization claims hide a recent custom-role change.", symptom: "a custom role looks correct while the active session retains old claims", introducedAt: "2023-06-20T02:00:00.000Z" },
  { slug: "scheduled-report-timezone", domain: "reporting", title: "Scheduled Report Timezone Boundary", problemSummary: "Scheduled reports include the wrong date boundary when workspace timezones differ.", symptom: "a daily report includes records from the adjacent calendar day", introducedAt: "2023-07-01T02:00:00.000Z" },
  { slug: "csv-export-encoding", domain: "reporting", title: "CSV Export Encoding Mismatch", problemSummary: "Exported text is misread when spreadsheet locale and CSV encoding differ.", symptom: "accented text or delimiters appear corrupted after opening the export", introducedAt: "2023-08-01T02:00:00.000Z" },
  { slug: "mobile-offline-sync-conflict", domain: "mobile", title: "Mobile Offline Synchronization Conflict", problemSummary: "Offline edits conflict with a newer server revision when a device reconnects.", symptom: "an offline change cannot merge after connectivity returns", introducedAt: "2023-09-01T02:00:00.000Z" },
  { slug: "email-notification-suppression", domain: "notifications", title: "Email Notification Suppression", problemSummary: "Valid recipients remain suppressed after a previous delivery failure.", symptom: "notification settings are enabled but email remains suppressed", introducedAt: "2023-10-01T02:00:00.000Z" }
];

const MEDIUM_FREQUENCY_BLUEPRINTS: ArcBlueprint[] = [
  { slug: "passwordless-link-expiry", domain: "authentication", title: "Passwordless Link Expiry", problemSummary: "Passwordless links expire before users complete sign-in.", symptom: "the sign-in link is already invalid when opened", introducedAt: "2023-11-01T02:00:00.000Z" },
  { slug: "session-cookie-samesite", domain: "authentication", title: "Session Cookie SameSite Restriction", problemSummary: "Browser cookie policy interrupts an embedded authentication flow.", symptom: "embedded sign-in loses its session after returning from the provider", introducedAt: "2023-12-01T02:00:00.000Z" },
  { slug: "sso-domain-verification", domain: "authentication", title: "SSO Domain Verification Pending", problemSummary: "An SSO connection cannot activate until its organization domain is verified.", symptom: "SSO configuration remains pending despite valid metadata", introducedAt: "2024-01-10T02:00:00.000Z" },
  { slug: "invoice-pdf-stale-address", domain: "billing", title: "Invoice PDF Shows Previous Address", problemSummary: "A generated invoice PDF retains billing details captured before a profile update.", symptom: "the PDF shows the old address while settings show the new one", introducedAt: "2024-02-01T02:00:00.000Z" },
  { slug: "failed-card-retry-schedule", domain: "billing", title: "Failed Card Retry Schedule", problemSummary: "Customers misunderstand scheduled payment retries after a failed collection.", symptom: "a failed payment appears to be charged again unexpectedly", introducedAt: "2024-02-20T02:00:00.000Z" },
  { slug: "annual-renewal-seat-count", domain: "billing", title: "Annual Renewal Seat Reconciliation", problemSummary: "Annual renewal uses a seat snapshot taken before a recent reduction.", symptom: "the renewal invoice includes seats removed shortly before renewal", introducedAt: "2024-03-01T02:00:00.000Z" },
  { slug: "webhook-delivery-replay", domain: "integrations", title: "Webhook Delivery Replay Ordering", problemSummary: "Replayed webhook events arrive out of dependency order.", symptom: "an update event arrives before the related create event", introducedAt: "2024-03-20T02:00:00.000Z" },
  { slug: "api-pagination-cursor", domain: "integrations", title: "API Pagination Cursor Invalidated", problemSummary: "A pagination cursor becomes invalid after the underlying result set changes.", symptom: "the next page request fails after records are added or removed", introducedAt: "2024-04-01T02:00:00.000Z" },
  { slug: "connector-field-mapping", domain: "integrations", title: "Connector Field Mapping Drift", problemSummary: "Connector mappings reference fields changed by a source schema update.", symptom: "synchronization skips a field after the source schema changes", introducedAt: "2024-04-20T02:00:00.000Z" },
  { slug: "guest-workspace-access", domain: "permissions", title: "Guest Workspace Access Boundary", problemSummary: "Guest users cannot access resources outside their explicitly shared workspace.", symptom: "a guest sees the workspace but not the linked resource", introducedAt: "2024-05-01T02:00:00.000Z" },
  { slug: "audit-log-visibility", domain: "permissions", title: "Audit Log Visibility Scope", problemSummary: "Administrators with limited scope cannot see organization-wide audit events.", symptom: "an administrator can manage a workspace but sees an empty audit view", introducedAt: "2024-06-01T02:00:00.000Z" },
  { slug: "dashboard-filter-persistence", domain: "reporting", title: "Dashboard Filter Persistence", problemSummary: "A saved dashboard reopens with stale or missing filter selections.", symptom: "the dashboard resets one filter after navigation", introducedAt: "2024-07-01T02:00:00.000Z" },
  { slug: "large-export-timeout", domain: "reporting", title: "Large Export Processing Timeout", problemSummary: "Large exports exceed the synchronous request window and appear to fail.", symptom: "a large export stops before a downloadable file is ready", introducedAt: "2024-08-01T02:00:00.000Z" },
  { slug: "mobile-push-token-stale", domain: "mobile", title: "Stale Mobile Push Token", problemSummary: "Push notifications target an obsolete device token after migration.", symptom: "web notifications arrive while the replacement phone stays silent", introducedAt: "2024-09-01T02:00:00.000Z" },
  { slug: "digest-email-timezone", domain: "notifications", title: "Digest Email Timezone Shift", problemSummary: "Digest emails run using account rather than workspace timezone.", symptom: "the daily digest arrives on the wrong local-day boundary", introducedAt: "2024-10-01T02:00:00.000Z" }
];

const LONG_TAIL_BLUEPRINTS: ArcBlueprint[] = [
  { slug: "biometric-unlock-reset", domain: "mobile", title: "Biometric Unlock Reset", problemSummary: "An operating-system update invalidates the app's biometric credential.", symptom: "biometric unlock stops after a device security update", introducedAt: "2024-11-01T02:00:00.000Z" },
  { slug: "mobile-deep-link-workspace", domain: "mobile", title: "Mobile Deep Link Workspace Mismatch", problemSummary: "A deep link opens the previously active workspace instead of its target.", symptom: "a mobile link opens the correct record in the wrong workspace", introducedAt: "2024-12-01T02:00:00.000Z" },
  { slug: "cellular-attachment-resume", domain: "mobile", title: "Cellular Attachment Upload Resume", problemSummary: "A resumed mobile attachment upload uses an expired session.", symptom: "an attachment stalls after switching from Wi-Fi to cellular data", introducedAt: "2025-01-15T02:00:00.000Z" },
  { slug: "notification-locale-fallback", domain: "notifications", title: "Notification Locale Fallback", problemSummary: "An incomplete locale template produces an empty notification body.", symptom: "one translated notification arrives without its expected message", introducedAt: "2025-02-01T02:00:00.000Z" },
  { slug: "email-dmarc-alignment", domain: "notifications", title: "Email DMARC Alignment Failure", problemSummary: "A custom sender domain fails alignment after DNS changes.", symptom: "mail is rejected after the sender domain configuration changes", introducedAt: "2025-03-01T02:00:00.000Z" },
  { slug: "notification-digest-duplication", domain: "notifications", title: "Notification Digest Duplication", problemSummary: "A campaign event enters two digest delivery partitions.", symptom: "some users receive the same digest twice", introducedAt: "2025-04-01T02:00:00.000Z" },
  { slug: "saml-nameid-case", domain: "authentication", title: "SAML NameID Case Sensitivity", problemSummary: "Identity identifiers differ only by case between the provider and workspace.", symptom: "one user cannot sign in because their identifier casing changed", introducedAt: "2025-05-01T02:00:00.000Z" },
  { slug: "mfa-recovery-code-exhaustion", domain: "authentication", title: "MFA Recovery Code Exhaustion", problemSummary: "A user has consumed every recovery code and cannot access a factor.", symptom: "all saved recovery codes are reported as already used", introducedAt: "2025-06-01T02:00:00.000Z" },
  { slug: "invoice-currency-display", domain: "billing", title: "Invoice Currency Display Difference", problemSummary: "Invoice display currency differs from the settled payment currency.", symptom: "the invoice symbol differs from the card settlement statement", introducedAt: "2025-07-01T02:00:00.000Z" },
  { slug: "vat-exemption-review", domain: "billing", title: "VAT Exemption Document Review", problemSummary: "Tax exemption remains pending while documents are under review.", symptom: "tax appears while exemption evidence is still being reviewed", introducedAt: "2025-08-01T02:00:00.000Z" },
  { slug: "webhook-ipv6-allowlist", domain: "integrations", title: "Webhook IPv6 Allowlist Gap", problemSummary: "A receiver allowlist omits a newly used IPv6 delivery range.", symptom: "some webhook deliveries time out only over IPv6", introducedAt: "2025-09-01T02:00:00.000Z" },
  { slug: "api-idempotency-collision", domain: "integrations", title: "API Idempotency Key Collision", problemSummary: "Distinct operations accidentally reuse the same idempotency key.", symptom: "a valid write returns the result of an earlier operation", introducedAt: "2025-10-01T02:00:00.000Z" },
  { slug: "delegated-admin-approval", domain: "permissions", title: "Delegated Administrator Approval", problemSummary: "A delegated administrator action waits for organization approval.", symptom: "the control is visible but remains pending after submission", introducedAt: "2025-11-01T02:00:00.000Z" },
  { slug: "report-column-order-migration", domain: "reporting", title: "Report Column Order Migration", problemSummary: "A report migration resets the order of saved export columns.", symptom: "a saved export contains the correct columns in a new order", introducedAt: "2025-12-01T02:00:00.000Z" },
  { slug: "mobile-offline-export-filters", domain: "mobile", title: "Mobile Offline Export Loses Date Filters", problemSummary: "An offline mobile export uses filters captured before the latest selection.", symptom: "the export includes dates outside the selected offline range", introducedAt: "2026-01-05T02:00:00.000Z" }
];

const INCIDENT_MONTHS: Record<DemoDomain, string[]> = {
  authentication: ["2023-01", "2024-01", "2025-01", "2026-01"],
  billing: ["2023-03", "2023-12", "2024-03", "2024-12", "2025-03", "2025-12", "2026-03"],
  integrations: ["2023-06", "2024-02", "2024-10", "2025-06", "2026-02"],
  permissions: ["2023-09", "2024-04", "2025-01", "2025-09", "2026-04"],
  reporting: ["2023-03", "2023-12", "2024-06", "2024-12", "2025-06", "2025-12", "2026-06"],
  mobile: ["2023-09", "2024-05", "2024-11", "2025-04", "2025-10", "2026-03"],
  notifications: ["2023-11", "2024-03", "2024-11", "2025-03", "2025-11", "2026-05"]
};

function tagsFor(blueprint: ArcBlueprint): string[] {
  const words = blueprint.slug.split("-");
  return [...new Set([blueprint.domain, ...words.filter((word) => word.length > 3)])].slice(0, 7);
}

function materializeArc(
  blueprint: ArcBlueprint,
  arcClass: NarrativeArcClass,
  maturityPlan: MaturityPlan,
  targets: NarrativeArc["targets"]
): NarrativeArc {
  const domain = DOMAIN_CONTENT[blueprint.domain];
  return {
    id: `demo-arc-${blueprint.slug}`,
    arcClass,
    domain: blueprint.domain,
    maturityPlan,
    canonical: {
      id: `demo-ki-${blueprint.slug}`,
      title: blueprint.title,
      problemSummary: blueprint.problemSummary,
      category: domain.category,
      tags: tagsFor(blueprint)
    },
    content: {
      symptom: blueprint.symptom,
      initialGuidance: `Confirm the affected workspace and timeline, then ${domain.solutionSteps[0]}. Preserve the observed evidence before changing configuration.`,
      initialCustomerResponse: `Hello {{customerName}},\n\nThank you for contacting OIP Developer Demo. We will verify ${blueprint.title.toLowerCase()} using the workspace timeline and the safest scoped checks.\n\nKind regards,\nOIP Developer Demo Support Team`,
      rootCauses: domain.rootCauses,
      solutionSteps: domain.solutionSteps,
      ticketOpeners: domain.ticketOpeners
    },
    lifecycle: {
      introducedAt: blueprint.introducedAt,
      firstKnowledgeAfterTickets: arcClass === "HERO" ? 7 : arcClass === "HIGH_FREQUENCY" ? 5 : 3,
      incidentMonths: INCIDENT_MONTHS[blueprint.domain].filter((month) => `${month}-28T23:59:59.000Z` >= blueprint.introducedAt)
    },
    targets
  };
}

export const developerDemoNarrativeArcs: readonly NarrativeArc[] = [
  ...HERO_BLUEPRINTS.map((blueprint) => materializeArc(blueprint, "HERO", "high", {
    tickets: 350,
    validations: 140,
    lessons: 10,
    versions: 7,
    trustEvidence: 300
  })),
  ...PRIMARY_FREQUENCY_BLUEPRINTS.map((blueprint, index) => materializeArc(
    blueprint,
    "HIGH_FREQUENCY",
    index < 7 ? "high" : "established",
    {
      tickets: index < 6 ? 188 : 187,
      validations: 60,
      lessons: 6,
      versions: index < 6 ? 5 : 4,
      trustEvidence: 180
    }
  )),
  ...MEDIUM_FREQUENCY_BLUEPRINTS.map((blueprint, index) => materializeArc(
    blueprint,
    "HIGH_FREQUENCY",
    index < 10 ? "established" : "developing",
    {
      tickets: 80,
      validations: 28,
      lessons: index < 9 ? 4 : 3,
      versions: index < 10 ? 3 : 2,
      trustEvidence: 70
    }
  )),
  ...LONG_TAIL_BLUEPRINTS.map((blueprint, index) => materializeArc(
    blueprint,
    "LONG_TAIL",
    index < 7 ? "developing" : "young",
    {
      tickets: index < 5 ? 34 : 33,
      validations: 16,
      lessons: index < 9 ? 2 : 1,
      versions: 1,
      trustEvidence: 26
    }
  ))
] as const;
