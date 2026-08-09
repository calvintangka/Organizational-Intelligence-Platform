/* TODO-083 deterministic calibration probe. Pure reasoning only; no database or provider calls. */
const path = require("node:path");
const fs = require("node:fs");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });
const { understandForProfile, routeBusinessInquiryUnderstanding } = require(path.join(root, "lib", "analyzer.ts"));
const { defaultOrganizationProfile } = require(path.join(root, "data", "seedOrganizationProfiles.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));

const live = JSON.parse(fs.readFileSync(path.join(root, "evidence", "todo081c2", "live-results.json"), "utf8"));

const expected = {
  1: { category: "Authentication", intent: "sso_certificate", canonical: "Authentication Infrastructure Issue" },
  2: { category: "Billing", intent: "duplicate_invoice", canonical: "Billing Duplicate Invoice Investigation" },
  3: { category: "Permissions & Access", intent: "role_permission", canonical: "Permissions & Access Issue" },
  4: { category: "Delivery Delay", intent: "delivery_delay", canonical: "Delivery Delay" },
  5: { category: "Business Inquiry", intent: "product_information", canonical: "Product Information Inquiry" },
  6: { category: "Login", intent: "general_login_failure", canonical: "Login Issue" },
  7: { category: "Billing", intent: "billing_contact_update", canonical: "Billing Contact Update" },
  8: { category: "Security Incident", intent: "security_incident", canonical: "Security Incident" },
  9: { category: "Refund", intent: "refund_investigation", canonical: "Refund Investigation" },
  10: { category: "Reporting & Exports", intent: "report_export_timeout", canonical: "Large Report Export Timeout" },
  11: { category: "Activation", intent: "activation_failure", canonical: "Activation Failure" },
  12: { category: "Security Incident", intent: "security_incident", canonical: "Security Incident" }
};

function check(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}`);
}

function main() {
  const rows = live.results.map((entry) => {
    const ticket = {
      id: `TODO083-${entry.case}`,
      ticketId: `TODO083-${entry.case}`,
      customerName: "Calibration Probe",
      subject: entry.subject,
      description: entry.message,
      category: "General",
      status: "new",
      createdAt: "2026-08-05T00:00:00.000Z"
    };
    const raw = understandForProfile(ticket, defaultOrganizationProfile);
    const routing = routeBusinessInquiryUnderstanding(raw);
    const understanding = routing.understanding;
    const canonical = routing.canonicalProblem ?? identifyCanonicalProblem(understanding, defaultOrganizationProfile);
    return { case: entry.case, understanding, canonical };
  });
  for (const row of rows) {
    const want = expected[row.case];
    check(`case ${row.case} category`, row.understanding.category === want.category);
    check(`case ${row.case} intent`, row.understanding.intent === want.intent);
    check(`case ${row.case} canonical`, row.canonical.title === want.canonical);
    if (row.case === 3 || row.case === 11) check(`case ${row.case} security false-positive gate`, row.understanding.intentIsolation?.securityIntent?.detected === false);
    if (row.case === 8) check("case 8 critical security gate", row.understanding.intentIsolation?.securityIntent?.detected === true && row.understanding.intentIsolation?.securityIntent?.severity === "critical");
    console.log(JSON.stringify({ case: row.case, actual: { category: row.understanding.category, intent: row.understanding.intent, canonical: row.canonical.title, hint: row.understanding.intentIsolation?.primaryIssueHint, active: row.understanding.intentIsolation?.activeProblemText, security: row.understanding.intentIsolation?.securityIntent } }));
  }
}

try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
