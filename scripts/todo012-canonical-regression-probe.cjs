/*
 * TODO-012 deterministic broad canonical regression probe.
 *
 * Exercises every classifier category with a direct case and a materially
 * different wording, checks canonical mapping and memory reachability, then
 * covers the distinct intents plus compact weak-overlap/ambiguity/cold-start
 * safety cases. Uses only in-memory fixtures; no database writes.
 */
const fs = require("node:fs");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness({ loadEnv: false });

const { getRecognizedClassifierCategories, understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { identifyCanonicalProblem, withCanonicalProblemDefaults } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const { draftResponse, isCompatibleForDrafting } = require(path.join(root, "lib", "drafting.ts"));
const { containsSignal } = require(path.join(root, "lib", "textSignal.ts"));
const { seedOrganizationProfiles } = require(path.join(root, "data", "seedOrganizationProfiles.ts"));

const NOW = "2026-07-17T00:00:00.000Z";

function unique(values) { return [...new Set(values)]; }
function slug(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function unionField(field) { return unique(seedOrganizationProfiles.flatMap((profile) => profile[field] ?? [])); }

const recognizedCategories = getRecognizedClassifierCategories();
const profile = {
  ...seedOrganizationProfiles[0],
  id: "test-oip-regression",
  name: "OIP Regression Test",
  industry: "Cross-domain regression",
  description: "Deterministic all-category QA profile.",
  products: unionField("products"),
  services: unionField("services"),
  supportedDomains: unique([...unionField("supportedDomains"), ...recognizedCategories]),
  businessVocabulary: unionField("businessVocabulary"),
  supportedIssueTypes: unique([...unionField("supportedIssueTypes"), ...recognizedCategories]),
  outOfScopeTopics: [],
  supportBoundaries: unionField("supportBoundaries"),
  escalationRules: unionField("escalationRules")
};

function ticketOf(label, text, explicitCategory = "General") {
  return {
    id: `todo012-${slug(label)}`,
    customerName: "Regression Customer",
    subject: label,
    description: text,
    category: explicitCategory,
    status: "new",
    createdAt: NOW
  };
}

const categoryCases = [
  ["Activation", "Activation Failure", "Activation code rejected", "My activation code is rejected after purchase.", "License key will not redeem", "The purchased serial key is invalid when I try to activate the product."],
  ["Two-Factor Auth", "Two-Factor Authentication Issue", "2FA code rejected", "My authenticator app OTP is rejected during two-factor login.", "Second factor unavailable", "The six digit verification code from my MFA app never works."],
  ["Authentication", "Authentication Infrastructure Issue", "SAML redirect loop", "Our SAML users are stuck in a single sign-on redirect loop after the identity provider certificate rotation.", "Identity provider certificate issue", "The IdP signing certificate and authentication metadata no longer match."],
  ["Login", "Login Issue", "Invalid login credentials", "I cannot sign in because the site says invalid credentials.", "Unable to enter workspace", "The account keeps rejecting my password when I try to log in."],
  ["Billing", "Billing & Charge Issue", "Unexpected card charge", "There is an unfamiliar charge on our billing card.", "Unfamiliar card debit", "A payment appears on the company bank statement and needs review."],
  ["Refund", "Refund Request", "Request a refund", "I want a refund for the purchase.", "Need reimbursement", "Please return my payment because the order was cancelled."],
  ["Subscription", "Subscription Change", "Cancel subscription", "Please cancel my subscription before renewal.", "Stop recurring plan", "I need to unsubscribe from the current plan."],
  ["Account Access", "Account Access Failure", "Account suspended", "My account is suspended and blocked.", "Profile access blocked", "The service says my account was banned and I cannot access it."],
  ["Permissions & Access", "Permissions & Access Issue", "Permission inheritance delayed", "Role permission inheritance has not propagated to the workspace.", "Access grant pending", "An administrator approval for the role assignment and access grant remains pending."],
  ["Delivery", "Delivery Problem", "General shipping question", "I have a general delivery question about shipping options for a new order.", "Order dispatch information", "Which shipment service will carry my order after it is sent?"],
  ["Delivery Delay", "Delivery Delay", "Delivery is late", "My delivery is delayed and the order has not arrived.", "Shipment overdue", "The package is late and tracking has not updated for several days."],
  ["Package Tracking", "Package Tracking Issue", "Tracking status missing", "The tracking number has no package status.", "Parcel progress unavailable", "Where can I follow this shipment? Its tracking has not updated."],
  ["Lost Package", "Lost Package", "Missing package", "The package is missing and never arrived.", "Parcel cannot be found", "My lost parcel has disappeared after dispatch."],
  ["Address Change", "Delivery Address Change", "Change delivery address", "Please change the delivery address before shipping.", "Correct destination", "The order has the wrong address and must go to my new address."],
  ["Courier Issue", "Courier Issue", "Courier did not call", "The courier did not call and skipped the pickup.", "Delivery driver complaint", "The delivery person was rude and mishandled the parcel."],
  ["Client Portal Access", "Client Portal Access Issue", "Cannot access client portal", "I cannot access the client portal login.", "Legal workspace unavailable", "The client login for the portal refuses to open my case workspace."],
  ["Consultation Booking", "Consultation Booking Issue", "Book legal consultation", "I need to book an appointment for a lawyer consultation.", "Schedule adviser meeting", "Please schedule a consultation with an attorney."],
  ["Document Status", "Document Status Request", "Document status update", "What is the current status of my case document filing?", "Legal draft progress", "Please tell me whether the case document draft is ready."],
  ["Appointment Rescheduling", "Appointment Rescheduling", "Reschedule appointment", "I need to reschedule my appointment to another day.", "Move scheduled meeting", "Can you change my appointment time?"],
  ["Product Version", "Product Version Issue", "Latest version update", "The software update says I am not on the latest version.", "Upgrade patch question", "Which product version includes the newest patch?"],
  ["Installation", "Installation Issue", "Installer fails", "The installer fails while I install the application.", "Setup cannot complete", "The downloaded setup will not finish, even after a reinstall."],
  ["Compatibility", "Compatibility Issue", "Product incompatible", "The application is not compatible with my operating system.", "Unsupported environment", "Do the system requirements support this device?"],
  ["Performance", "Performance Issue", "Application is slow", "The application is slow and keeps freezing while loading.", "Interface hangs", "Pages take forever to respond and the software becomes unresponsive."],
  ["Application Stability", "Application Stability Issue", "Application crashes", "The application crashes and closes immediately after launch.", "Software will not start", "The program is not launching and force quits during startup."]
].map(([category, canonicalTitle, directLabel, directText, paraphraseLabel, paraphraseText]) => ({
  category, canonicalTitle, direct: ticketOf(directLabel, directText), paraphrase: ticketOf(paraphraseLabel, paraphraseText)
}));

function knowledgeFor(testCase) {
  const id = `todo012-memory-${slug(testCase.category)}`;
  return withCanonicalProblemDefaults({
    id,
    canonicalProblemId: id,
    canonicalProblemTitle: testCase.canonicalTitle,
    title: testCase.canonicalTitle,
    problem: `Validated organizational memory for ${testCase.category}.`,
    problemSummary: `Validated organizational memory for ${testCase.category}.`,
    approvedAnswer: `Use the validated ${testCase.category} workflow.`,
    category: testCase.category,
    tags: [slug(testCase.category)],
    sourceTicketId: `source-${slug(testCase.category)}`,
    timesReused: 2,
    trustScore: 90,
    createdAt: NOW,
    approvedAt: NOW,
    lessons: []
  });
}

const memory = categoryCases.map(knowledgeFor);
const failures = [];
let totalCases = 0;

function fail(caseName, classification, expected, actual, stage, detail) {
  failures.push({ caseName, classification, expected, actual, stage, detail });
}

function checkCategoryCase(testCase, variant) {
  totalCases += 1;
  const ticket = testCase[variant];
  const understanding = understandForProfile(ticket, profile);
  const canonical = identifyCanonicalProblem(understanding, profile);
  if (understanding.category !== testCase.category) {
    fail(`${testCase.category} ${variant}`, "CLASSIFICATION_FAILURE", testCase.category, understanding.category, "category", `signals=[${understanding.detectedSignals.join(", ")}] intent=${understanding.intent ?? "-"}`);
    return;
  }
  if (canonical.title !== testCase.canonicalTitle || canonical.category !== testCase.category) {
    fail(`${testCase.category} ${variant}`, "CANONICAL_MAPPING_FAILURE", `${testCase.canonicalTitle} (${testCase.category})`, `${canonical.title} (${canonical.category})`, "canonical problem", `intent=${understanding.intent ?? "-"}`);
    return;
  }
  const expectedMemoryId = `todo012-memory-${slug(testCase.category)}`;
  const matches = retrieveMemory(understanding, memory, new Set());
  if (matches[0]?.item.id !== expectedMemoryId) {
    fail(`${testCase.category} ${variant}`, "RETRIEVAL_FALSE_NEGATIVE", expectedMemoryId, matches[0]?.item.id ?? "none", "candidate retrieval", `topScore=${matches[0]?.matchScore ?? 0}`);
  }
}

totalCases += 2;
if (containsSignal("The parcel is ready for dispatch.", "patch")) {
  fail("Word boundary: dispatch", "CLASSIFICATION_FAILURE", "patch not matched", "patch matched", "signal matching", "A signal must not match inside a larger word.");
}
if (!containsSignal("Please install the patch before retrying.", "patch")) {
  fail("Word boundary: patch", "CLASSIFICATION_FAILURE", "patch matched", "patch missed", "signal matching", "A standalone signal must still match.");
}

for (const testCase of categoryCases) {
  checkCategoryCase(testCase, "direct");
  checkCategoryCase(testCase, "paraphrase");
}

const intentCases = [
  ["Login email recovery", "I forgot the email address used for my account and cannot log in.", "Login", "email_recovery", "Account Email Recovery"],
  ["Login credentials unavailable", "I moved to a new laptop, the saved password did not transfer, and I never memorized it.", "Login", "credentials_unavailable", "Login Issue"],
  ["Login credentials rejected", "The site reports invalid credentials whenever I sign in.", "Login", "credentials_rejected", "Login Issue"],
  ["Login account locked", "Login failed after too many attempts and now the account is locked out.", "Login", "account_locked", "Login Issue"],
  ["Login generic failure", "I cannot log in to my account.", "Login", "general_login_failure", "Login Issue"],
  ["Account access locked", "My account is suspended and blocked.", "Account Access", "account_locked", "Account Access Failure"],
  ["Account access generic", "There is a problem with access to my account profile.", "Account Access", "general_account_problem", "Account Access Failure"],
  ["2FA backup codes", "My two-factor backup codes are unavailable.", "Two-Factor Auth", "backup_codes_unavailable", "Two-Factor Authentication Issue"],
  ["2FA verification rejected", "The authenticator app verification code is rejected.", "Two-Factor Auth", "verification_code_rejected", "Two-Factor Authentication Issue"],
  ["2FA generic failure", "Two-factor authentication is not working.", "Two-Factor Auth", "general_2fa_failure", "Two-Factor Authentication Issue"],
  ["Billing invoice", "Please send a copy of our latest invoice.", "Billing", "invoice_question", "Billing & Invoice Issue"],
  ["Billing authorization", "The card transaction shows a pending authorization.", "Billing", "payment_authorization_confusion", "Payment Authorization Confusion"],
  ["Billing charge", "There is an unfamiliar charge on our billing card.", "Billing", "billing_charge_issue", "Billing & Charge Issue"],
  ["Subscription trial", "My subscription trial expired and I need help.", "Subscription", "trial_expired", "Subscription Change"],
  ["Subscription cancellation", "Please cancel my subscription.", "Subscription", "cancellation_request", "Subscription Change"],
  ["Subscription renewal", "I need to change my plan before renewal.", "Subscription", "renewal_or_plan_change", "Subscription Change"],
  ["Subscription generic", "I need help with my subscription.", "Subscription", "subscription_help", "Subscription Change"],
  ["Activation key rejected", "The activation code and product key are rejected.", "Activation", "code_or_key_rejected", "Activation Failure"],
  ["Activation version mismatch", "License activation reports a product version mismatch.", "Activation", "version_mismatch", "Activation Failure"],
  ["Activation generic", "Please help me activate the purchased product.", "Activation", "activation_help", "Activation Failure"],
  ["Refund request", "I want a refund and reimbursement for this purchase.", "Refund", "refund_request", "Refund Request"]
];

for (const [label, text, expectedCategory, expectedIntent, expectedCanonical] of intentCases) {
  totalCases += 1;
  const understanding = understandForProfile(ticketOf(label, text), profile);
  const canonical = identifyCanonicalProblem(understanding, profile);
  if (understanding.category !== expectedCategory) {
    fail(label, "CLASSIFICATION_FAILURE", expectedCategory, understanding.category, "category", `signals=[${understanding.detectedSignals.join(", ")}]`);
  } else if (understanding.intent !== expectedIntent) {
    fail(label, "CLASSIFICATION_FAILURE", expectedIntent, understanding.intent ?? "none", "intent", `category=${understanding.category}`);
  } else if (canonical.title !== expectedCanonical) {
    fail(label, "CANONICAL_MAPPING_FAILURE", expectedCanonical, canonical.title, "canonical problem", `category=${understanding.category} intent=${understanding.intent}`);
  }
}

// TODO-011 billing relevance matrix: specific Billing/Refund meanings must not
// collapse into Subscription or an unsupported authorization explanation.
const billingRegressionCases = [
  ["Billing profile update", "Our company moved. Update the company name and billing address on the account going forward.", "Billing", "billing_charge_issue", "Billing & Charge Issue", false],
  ["Duplicate charge", "I was charged twice for the same subscription renewal. Two identical charges appear.", "Billing", "billing_charge_issue", "Billing & Charge Issue", false],
  ["Refund after cancellation", "I cancelled the subscription and want a refund for unused months.", "Refund", "refund_request", "Refund Request", false],
  ["Invoice copy", "Please send a copy of last month's invoice for our records.", "Billing", "invoice_question", "Billing & Invoice Issue", false],
  ["Payment failure", "Payment keeps failing during renewal even though the card is valid and the transaction does not go through.", "Billing", "payment_authorization_confusion", "Payment Authorization Confusion", true]
];

for (const [label, text, expectedCategory, expectedIntent, expectedCanonical, allowsAuthorization] of billingRegressionCases) {
  totalCases += 1;
  const ticket = ticketOf(label, text);
  const understanding = understandForProfile(ticket, profile);
  const canonical = identifyCanonicalProblem(understanding, profile);
  const compatible = retrieveMemory(understanding, memory, new Set()).filter((match) => isCompatibleForDrafting(understanding, match.item, ticket));
  const subscriptionSelected = compatible[0]?.item.category === "Subscription";
  const inappropriateAuthorization = !allowsAuthorization && canonical.title === "Payment Authorization Confusion";
  if (understanding.category !== expectedCategory || understanding.intent !== expectedIntent || canonical.title !== expectedCanonical || subscriptionSelected || inappropriateAuthorization) {
    fail(label, "IRRELEVANT_FALLBACK", `${expectedCategory}/${expectedIntent}/${expectedCanonical}; no Subscription fallback`, `${understanding.category}/${understanding.intent ?? "-"}/${canonical.title}; top=${compatible[0]?.item.category ?? "none"}`, "canonical/retrieval", `authorizationAllowed=${allowsAuthorization}`);
  }
}

// Vague delivery evidence may remain generic, but must not be forced into a
// specific logistics subtype.
{
  totalCases += 1;
  const ticket = ticketOf("Vague delivery issue", "Something is wrong with my delivery, but I do not have more details yet.");
  const understanding = understandForProfile(ticket, profile);
  const canonical = identifyCanonicalProblem(understanding, profile);
  const compatible = retrieveMemory(understanding, memory, new Set()).filter((match) => isCompatibleForDrafting(understanding, match.item, ticket));
  const draft = draftResponse(ticket, understanding, compatible[0] ?? null, profile, false);
  const genericDelivery = understanding.category === "Delivery" && canonical.title === "Delivery Problem";
  const safelyAmbiguous = understanding.category === "Uncategorized" && compatible.length === 0 && draft.source === "no_template";
  if (!genericDelivery && !safelyAmbiguous) {
    fail("Vague Delivery", "CLASSIFICATION_FAILURE", "generic Delivery or safe ambiguity", `${understanding.category} / ${canonical.title} / ${draft.source}`, "specificity", "Weak evidence must not force a specific logistics subtype.");
  }
}

// Weak overlap: explicit login vocabulary must not displace the actual billing problem.
{
  totalCases += 1;
  const ticket = ticketOf("Billing address after login", "My password works and I can sign in normally. Update the billing address shown on future invoices.");
  const understanding = understandForProfile(ticket, profile);
  const canonical = identifyCanonicalProblem(understanding, profile);
  const compatible = retrieveMemory(understanding, memory, new Set()).filter((match) => isCompatibleForDrafting(understanding, match.item, ticket));
  if (understanding.category !== "Billing" || canonical.title !== "Billing & Invoice Issue" || compatible.some((match) => match.item.category === "Login")) {
    fail("Weak overlap Login vs Billing", "RETRIEVAL_FALSE_POSITIVE", "Billing invoice; no Login reuse", `${understanding.category}; ${canonical.title}; compatible=[${compatible.map((match) => match.item.category).join(",")}]`, "compatibility/retrieval", "Explicit login contradiction must veto Login memory.");
  }
}

// Ambiguity: insufficient information must remain unclassified and template-free.
{
  totalCases += 1;
  const ticket = ticketOf("Need some help", "Something is wrong, but I do not know what. Can a person review this?");
  const understanding = understandForProfile(ticket, profile);
  const matches = retrieveMemory(understanding, memory, new Set()).filter((match) => isCompatibleForDrafting(understanding, match.item, ticket));
  const draft = draftResponse(ticket, understanding, matches[0] ?? null, profile, false);
  if (understanding.category !== "Uncategorized" || matches.length !== 0 || draft.source !== "no_template" || draft.basedOnKnowledgeIds.length !== 0) {
    fail("Ambiguous request", "AMBIGUITY_SAFETY_FAILURE", "Uncategorized, no_template, no memory", `${understanding.category}, ${draft.source}, basedOn=${draft.basedOnKnowledgeIds.length}`, "final drafting path", `compatible=[${matches.map((match) => match.item.id).join(",")}]`);
  }
}

// Cold start: an unsupported webhook problem must not borrow unrelated memory.
{
  totalCases += 1;
  const ticket = ticketOf("Webhook signature mismatch", "Our HMAC webhook signature verification fails for every event payload.");
  const understanding = understandForProfile(ticket, profile);
  const matches = retrieveMemory(understanding, memory, new Set()).filter((match) => isCompatibleForDrafting(understanding, match.item, ticket));
  const draft = draftResponse(ticket, understanding, matches[0] ?? null, profile, false);
  if (matches.length !== 0 || draft.source !== "no_template" || draft.basedOnKnowledgeIds.length !== 0) {
    fail("Cold-start webhook", "COLD_START_FALSE_POSITIVE", "no_template, no memory", `${draft.source}, basedOn=${draft.basedOnKnowledgeIds.length}`, "final drafting path", `category=${understanding.category} compatible=[${matches.map((match) => match.item.id).join(",")}]`);
  }
}

const definedCategories = new Set(categoryCases.map((testCase) => testCase.category));
for (const category of recognizedCategories) {
  if (!definedCategories.has(category)) fail("Coverage inventory", "OTHER", category, "missing", "test inventory", "Every recognized classifier category requires a direct and paraphrase case.");
}
for (const category of definedCategories) {
  if (!recognizedCategories.includes(category)) fail("Coverage inventory", "OTHER", "recognized category", category, "test inventory", "Probe contains a stale category.");
}

console.log(`TODO-012 broad canonical regression: ${recognizedCategories.length} categories, ${totalCases} cases, ${failures.length} failure(s).`);
if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`\nFAIL: ${failure.caseName}`);
    console.error(`classification: ${failure.classification}`);
    console.error(`expected: ${failure.expected}`);
    console.error(`actual: ${failure.actual}`);
    console.error(`exact stage: ${failure.stage}`);
    console.error(`detail: ${failure.detail}`);
  }
  process.exitCode = 1;
} else {
  console.log("All deterministic category, intent, retrieval, ambiguity, and cold-start cases passed. No data was written.");
}
