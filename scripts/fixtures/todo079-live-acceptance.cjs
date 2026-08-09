const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const HISTORICAL_DATASET_DIGEST = "72052ea764332299722b839d0546005f853d1b096286024adc1b0bd28257905d";
const HISTORICAL_SOURCE = path.join(root, "evidence", "todo081c2", "live-results.json");

const EXPECTED = {
  1: { category: "Authentication", intent: "sso_certificate", canonical: "Authentication Infrastructure Issue", lesson: /SSO Redirect Loop.*root cause 1/i, language: "en", security: false },
  2: { category: "Billing", intent: "duplicate_invoice", canonical: "Billing Duplicate Invoice Investigation", lesson: /Duplicate Invoice.*root cause 1/i, language: "en", security: false },
  3: { category: "Permissions & Access", intent: "role_permission", canonical: "Role Permission Issue", lesson: null, language: "en", security: false },
  4: { category: "Delivery Delay", intent: "delivery_delay", canonical: "Delivery Delay", lesson: null, language: "en", security: false },
  5: { category: "Business Inquiry", intent: "product_information", canonical: "Product Information Inquiry", lesson: null, language: "en", security: false },
  6: { category: "Login", intent: "general_login_failure", canonical: "Login Issue", lesson: null, language: "id", security: false },
  7: { category: "Billing", intent: "billing_contact_update", canonical: "Billing Contact Update", lesson: null, language: "id", security: false },
  8: { category: "Security Incident", intent: "security_incident", canonical: "Security Incident", lesson: null, language: "id", security: true },
  9: { category: "Refund", intent: "refund_investigation", canonical: "Refund Investigation", lesson: null, language: "en", security: false },
  10: { category: "Reporting & Exports", intent: "report_export_timeout", canonical: "Large Report Export Timeout", lesson: null, language: "en", security: false },
  11: { category: "Activation", intent: "activation_failure", canonical: "Activation Failure", lesson: null, language: "id", security: false },
  12: { category: "Security Incident", intent: "security_incident", canonical: "Security Incident", lesson: null, language: "en", security: true }
};

function loadTodo079Dataset() {
  assert.ok(fs.existsSync(HISTORICAL_SOURCE), `Historical TODO-079 source is missing: ${HISTORICAL_SOURCE}`);
  const source = JSON.parse(fs.readFileSync(HISTORICAL_SOURCE, "utf8"));
  assert.equal(source.datasetDigest, HISTORICAL_DATASET_DIGEST, "Historical TODO-079 digest changed.");
  assert.equal(source.results?.length, 12, "Historical TODO-079 source must contain exactly 12 cases.");
  const cases = source.results.map((item) => ({
    case: item.case,
    subject: item.subject,
    message: item.message,
    expected: EXPECTED[item.case]
  }));
  for (const item of cases) {
    assert.equal(typeof item.subject, "string");
    assert.equal(typeof item.message, "string");
    assert.ok(item.expected, `Missing expected result for case ${item.case}`);
  }
  const reconstructedDigest = crypto.createHash("sha256")
    .update(JSON.stringify(cases.map(({ case: caseNumber, subject, message }) => ({ case: caseNumber, subject, message }))))
    .digest("hex");
  return { cases, historicalDigest: HISTORICAL_DATASET_DIGEST, reconstructedDigest };
}

module.exports = { EXPECTED, HISTORICAL_DATASET_DIGEST, HISTORICAL_SOURCE, loadTodo079Dataset };
