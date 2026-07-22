/*
 * TODO-050 — Customer Context Extraction Robustness probe.
 *
 * Read-only, deterministic (no DB, no live AI). Verifies that sender/company/
 * role extraction only accepts identity from clear self-identification and never
 * turns arbitrary issue text into a name, that explicit patterns extract
 * correctly, that greetings stay safe, and that the AI merge policy cannot
 * override or invent identity (Part M, replicated from app/page.tsx).
 */
const assert = require("node:assert/strict");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness({ loadEnv: false });

const { extractCustomerContext, isLikelyPersonName, textHasExplicitRole } = require(path.join(root, "lib", "customerContext.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { renderCustomerTemplateForTicket } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { defaultOrganizationProfile } = require(path.join(root, "data", "seedOrganizationProfiles.ts"));

const profile = defaultOrganizationProfile;
function ticket(description, subject = "Support request") {
  return { id: "T", ticketId: "T", customerName: "Demo User", subject, description, category: "General", status: "new", createdAt: "2026-07-23T00:00:00.000Z" };
}
function greetingFor(description) {
  const u = understandForProfile(ticket(description), profile);
  return { fields: u.extractedFields, greeting: renderCustomerTemplateForTicket("{{greetingLine}}", ticket(description), profile, u) };
}

const cases = {};
let checks = 0, fails = 0;
function check(label, cond, detail) {
  checks += 1;
  if (!cond) { fails += 1; console.log(`FAIL ${label} :: ${detail ?? ""}`); }
  else console.log(`PASS ${label}`);
}
const name = (t) => extractCustomerContext(t).senderName;
const company = (t) => extractCustomerContext(t).companyName;
const role = (t) => extractCustomerContext(t).senderRole;

/* ---------------- Part C: arbitrary issue text must never be a name ---------------- */
const C = [
  "This is causing duplicate records.", "This is affecting our customers.",
  "This is blocking production.", "This is happening every morning.",
  "This is creating incorrect invoices.", "This is breaking our workflow.",
  "This is delaying our reports."
];
C.forEach((t, i) => check(`C${i + 1} no-name-from-issue-text`, name(t) === null, `got ${JSON.stringify(name(t))}`));
cases.C_nameSafety = fails === 0 ? `PASS (0/${C.length} issue phrases became a name)` : "FAIL";

/* ---------------- Part D: natural identity patterns ---------------- */
const D = [
  ["My name is Satya Nadella.", "Satya Nadella"],
  ["Hi, I'm Satya Nadella.", "Satya Nadella"],
  ["Hello, I am Satya Nadella.", "Satya Nadella"],
  ["This is Satya Nadella.", "Satya Nadella"],
  ["Satya Nadella here.", "Satya Nadella"],
  ["My name's Satya.", "Satya"],
  ["I'm Satya from Microsoft.", "Satya"],
  ["I am Satya Nadella and I work at Microsoft.", "Satya Nadella"],
  ["I work at Microsoft, my name is Satya Nadella.", "Satya Nadella"],
  ["My name is Satya Nadella. I work for Microsoft.", "Satya Nadella"]
];
D.forEach(([t, exp], i) => check(`D${i + 1} name-extract`, name(t) === exp, `got ${JSON.stringify(name(t))} want ${exp}`));

/* ---------------- Part E: company requires affiliation context ---------------- */
const E = [
  ["I work at Microsoft.", "Microsoft"], ["I work for Microsoft.", "Microsoft"],
  ["I'm from Microsoft.", "Microsoft"], ["I am with Microsoft.", "Microsoft"],
  ["Our company is Microsoft.", "Microsoft"], ["I am working in Microsoft.", "Microsoft"]
];
E.forEach(([t, exp], i) => check(`E${i + 1} company-extract`, company(t) === exp, `got ${JSON.stringify(company(t))}`));
check("E7 no-company-from-integration-mention", company("Our Microsoft integration is broken.") === null, company("Our Microsoft integration is broken."));
check("E8 no-company-from-usage-mention", company("The customer uses Microsoft authentication.") === null, company("The customer uses Microsoft authentication."));

/* ---------------- Part F: explicit roles only; never inferred ---------------- */
check("F1 role-it-admin", /administrator/i.test(role("I'm the IT administrator at Acme.") ?? ""), role("I'm the IT administrator at Acme."));
check("F2 role-support-manager", /manager/i.test(role("I work as a support manager.") ?? ""), role("I work as a support manager."));
check("F3 role-billing", role("I'm responsible for billing.") !== null && name("I'm responsible for billing.") === null, `${role("I'm responsible for billing.")}/${name("I'm responsible for billing.")}`);
check("F4 role-workspace-admin", /administrator/i.test(role("I am the workspace administrator.") ?? ""), role("I am the workspace administrator."));
check("F5 rishi-no-inferred-role", role("I am rishi sunak from british government.") === null && name("I am rishi sunak from british government.") === "Rishi Sunak" && company("I am rishi sunak from british government.") === "British Government", "rishi role must be null");

/* ---------------- Part G: multi-sentence boundaries ---------------- */
check("G1 identity-at-end", name("We have duplicate records. My name is Satya Nadella and I work at Microsoft.") === "Satya Nadella");
check("G2 identity-then-issue", name("My name is Satya Nadella. We have duplicate records.") === "Satya Nadella");
check("G3 identity-mid", name("We have duplicate records. This is Satya Nadella from Microsoft.") === "Satya Nadella" && company("We have duplicate records. This is Satya Nadella from Microsoft.") === "Microsoft");

/* ---------------- Part H: informal / imperfect punctuation ---------------- */
check("H1 informal", name("hi im satya from microsoft") === "Satya" && company("hi im satya from microsoft") === "Microsoft");
check("H2 informal-comma", name("hey, i'm satya nadella, microsoft") === "Satya Nadella");
check("H3 informal-runon", name("my name is satya nadella we have a problem") === "Satya Nadella");
check("H4 luna", name("im luna from mawar biru") === "Luna" && company("im luna from mawar biru") === "Mawar Biru");
check("H5 mark", name("I am mark suker from meta.") === "Mark Suker" && company("I am mark suker from meta.") === "Meta");

/* ---------------- Part I: adversarial / third-party ---------------- */
const I = [
  "My login name is admin.", "The customer name field is broken.", "The account belongs to John.",
  "Please contact Satya Nadella.", "Satya Nadella approved the request.", "Our CEO is Satya Nadella.",
  "The error says 'my name is invalid'.", "The company field shows Microsoft.", "Microsoft authentication is failing.",
  "This is causing duplicate records.", "The user is Mark.", "Reported by the customer.",
  "I spoke with Luna yesterday.", "Send this to John.", "John's account cannot login."
];
I.forEach((t, i) => check(`I${i + 1} no-false-sender`, name(t) === null, `got ${JSON.stringify(name(t))}`));

/* ---------------- Part J: sub-issue preservation (identity does not steal it) ---------------- */
const original = "I am working in Microsoft, my name is satya nadella. We noticed that one customer action created two identical events in our internal system. This is causing duplicate records.";
const oc = extractCustomerContext(original);
check("J original-sender", oc.senderName === "Satya Nadella", oc.senderName);
check("J original-company", oc.companyName === "Microsoft", oc.companyName);
check("J sub-issue-not-sender", oc.senderName !== "causing duplicate records", oc.senderName);

/* ---------------- Part K: greeting safety ---------------- */
check("K greeting-safe-issue-text", greetingFor(original).greeting === "Hello Satya Nadella,", greetingFor(original).greeting);
check("K greeting-neutral-unknown", greetingFor("We have duplicate records and need help.").greeting === "Hello,", greetingFor("We have duplicate records and need help.").greeting);
["Hello causing duplicate records,", "Hello blocking production,", "Hello our customers,"].forEach((bad) => {
  check(`K never-greeting "${bad.slice(0, 20)}..."`, greetingFor(original).greeting !== bad);
});

/* ---------------- Part M: AI merge policy (replicated from app/page.tsx) ---------------- */
function mergeIdentity(base, ai, sourceText) {
  const aiName = isLikelyPersonName(ai.senderName) ? ai.senderName : null;
  const aiRole = ai.senderRole && textHasExplicitRole(sourceText) ? ai.senderRole : null;
  return { senderName: base.senderName ?? aiName, senderRole: base.senderRole ?? aiRole, companyName: base.companyName ?? ai.companyName };
}
// Explicit deterministic name wins over a bad AI name.
check("M1 explicit-wins", mergeIdentity({ senderName: "Satya Nadella", senderRole: null, companyName: null }, { senderName: "causing duplicate records", senderRole: null, companyName: null }, "My name is Satya Nadella.").senderName === "Satya Nadella");
// AI issue-text name is rejected even when deterministic is null.
check("M2 ai-issue-text-rejected", mergeIdentity({ senderName: null, senderRole: null, companyName: null }, { senderName: "causing duplicate records", senderRole: null, companyName: null }, "This is causing duplicate records.").senderName === null);
check("M2b isLikelyPersonName-rejects", !isLikelyPersonName("causing duplicate records") && isLikelyPersonName("Satya Nadella"));
// AI role dropped when the ticket states no explicit role.
check("M3 ai-role-gated", mergeIdentity({ senderName: null, senderRole: null, companyName: null }, { senderName: null, senderRole: "British Government Official", companyName: null }, "I am rishi sunak from british government.").senderRole === null);
// AI role accepted when the ticket explicitly states a role.
check("M4 ai-role-when-explicit", mergeIdentity({ senderName: null, senderRole: null, companyName: null }, { senderName: null, senderRole: "IT administrator", companyName: null }, "I am the IT administrator at Acme.").senderRole === "IT administrator");
// AI valid name fills a null deterministic name.
check("M5 ai-valid-fills", mergeIdentity({ senderName: null, senderRole: null, companyName: null }, { senderName: "Grace Adeyemi", senderRole: null, companyName: null }, "Regards, Grace").senderName === "Grace Adeyemi");

console.log(`\n=== TODO-050 SUMMARY: ${checks - fails}/${checks} checks passed ===`);
assert.equal(fails, 0, `${fails} checks failed.`);
console.log("TODO-050 CUSTOMER CONTEXT EXTRACTION: PASS");
process.exit(0);
