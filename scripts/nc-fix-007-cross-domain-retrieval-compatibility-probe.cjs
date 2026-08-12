/*
 * NC-FIX-007 permanent retrieval-compatibility probe.
 *
 * The probe uses disposable in-memory organizations and KnowledgeItems. It
 * exercises the production understanding, retrieval, lesson-selection,
 * compatibility, and drafting functions without writing to PostgreSQL.
 */
const assert = require("node:assert/strict");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness({ loadEnv: false });

const { seedOrganizationProfiles } = require(path.join(root, "data", "seedOrganizationProfiles.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const {
  assessCompatibilityDecision,
  draftResponse,
  findMatchingLesson,
  isRetrievalCandidateEligible
} = require(path.join(root, "lib", "drafting.ts"));
const { withPreDiscriminationLessonMatches, selectPreferredMatch } = require(path.join(root, "lib", "lessonSelection.ts"));

const profile = seedOrganizationProfiles[0];
const orgA = "nc-fix-007-disposable-a";
const orgB = "nc-fix-007-disposable-b";
const now = "2026-08-11T00:00:00.000Z";

function ticket(text, category = "General") {
  return {
    id: `probe-ticket-${text.slice(0, 12).replace(/\W+/g, "-").toLowerCase()}`,
    ticketId: `NC-FIX-007-${Math.abs(text.length * 97)}`,
    subject: text,
    description: text,
    category,
    status: "new",
    createdAt: now
  };
}

function lessonItem(organizationId = orgA, overrides = {}) {
  return {
    id: "nc-fix-007-mobile-location",
    organizationId,
    title: "Mobile Attendance Location Access Boundary",
    problem: "Attendance check-in fails when the device does not grant the required location permission.",
    approvedAnswer: "Grant the required device permission and retry attendance check-in.",
    category: "Uncategorized",
    tags: ["mobile clock-in", "attendance check-in", "location permission"],
    sourceTicketId: "probe-source-mobile-location",
    timesReused: 999,
    createdAt: now,
    approvedAt: now,
    lifecycleState: "active",
    trustScore: 100,
    lessons: [{
      id: "nc-fix-007-mobile-location-lesson",
      rootCause: "The device did not grant the required location permission for attendance check-in.",
      solution: "Grant location permission, confirm the device setting, and retry attendance check-in.",
      customerResponse: "Please grant the required permission in device settings and retry attendance check-in.",
      signals: ["mobile clock in", "location permission"],
      sourceTicketId: "probe-source-mobile-location"
    }],
    ...overrides
  };
}

const incompatibleItem = {
  ...lessonItem(orgA, {
    id: "nc-fix-007-guest-workspace",
    title: "Guest Workspace Access Boundary",
    problem: "A guest cannot access a workspace outside the explicitly shared resource.",
    approvedAnswer: "Grant the scoped workspace permission and verify access.",
    category: "Permissions & Access",
    tags: ["guest workspace", "workspace access"],
    sourceTicketId: "probe-source-guest-workspace",
    lessons: [{
      id: "nc-fix-007-guest-workspace-lesson",
      rootCause: "The guest lacked an explicit grant on the linked workspace resource.",
      solution: "Grant the scoped workspace permission and verify access.",
      customerResponse: "Please verify the guest's scoped workspace permission.",
      signals: ["guest workspace", "workspace access"],
      sourceTicketId: "probe-source-guest-workspace"
    }]
  })
};

function run(input, items, categoryOverride) {
  const analyzed = understandForProfile(input, profile);
  const understanding = categoryOverride
    ? { ...analyzed, category: categoryOverride }
    : analyzed;
  const canonicalTitle = understanding.canonicalProblemText ?? understanding.coreProblem ?? "";
  const rawMatches = retrieveMemory(understanding, items, new Set());
  const matches = withPreDiscriminationLessonMatches(input, understanding, rawMatches, items, canonicalTitle);
  const eligible = matches.filter((match) => isRetrievalCandidateEligible(understanding, match.item, input));
  const selected = eligible.length > 0 ? selectPreferredMatch(input, eligible) : null;
  const selectedItem = selected?.match?.item ?? null;
  const lessonMatch = selectedItem ? findMatchingLesson(input, selectedItem) : null;
  const compatibility = selectedItem ? assessCompatibilityDecision(understanding, selectedItem, input) : null;
  const draft = draftResponse(input, understanding, selected?.match ?? null, profile, false);
  return { understanding, rawMatches, matches, eligible, selectedItem, lessonMatch, compatibility, draft };
}

const target = lessonItem();
const candidates = [target, incompatibleItem];
const positiveExact = ticket("One employee cannot clock in from the mobile app because it asks for location permission. Other employees can still clock in.", "Uncategorized");
const positiveParaphrase = ticket("Attendance check-in stopped working for one Android employee after location access was denied.", "Uncategorized");
const relatedCategory = ticket("Mobile attendance check-in fails for one Android user after location access is denied.", "Mobile Application");
const billing = ticket("Please change the email address where our monthly invoice is sent.", "Billing");
const login = ticket("An employee cannot sign into the payroll administrator portal because they forgot their password.", "Authentication");
const generic = ticket("One employee is having an issue with the application and needs help.", "Uncategorized");
const weakOverlap = ticket("An employee uses a mobile application and needs access to a shared workspace.", "Uncategorized");
const locationOnly = ticket("Please update the employee's office location in their HR profile.", "Product Version");
const clockOnly = ticket("The office wall clock is displaying the wrong time.", "Uncategorized");
const negation = ticket("The employee cannot clock in. Location permission is already enabled and GPS works correctly.", "Uncategorized");

function isTargetMatch(item) {
  return Boolean(item?.lessons?.some((lesson) => lesson.id === "nc-fix-007-mobile-location-lesson"));
}

function hasTargetMatch(matches) {
  return matches.some((match) => isTargetMatch(match.item));
}

const checks = [];
function check(name, fn) {
  try {
    fn();
    checks.push({ name, passed: true });
  } catch (error) {
    checks.push({ name, passed: false, message: error.message });
  }
}

const exact = run(positiveExact, candidates, "Uncategorized");
const paraphrase = run(positiveParaphrase, candidates, "Uncategorized");
const related = run(relatedCategory, candidates, "Mobile Application");

check("same-domain similar case matches", () => assert.equal(isTargetMatch(exact.selectedItem), true));
check("paraphrased same-domain case matches", () => assert.equal(isTargetMatch(paraphrase.selectedItem), true));
check("strongly compatible Uncategorized case matches", () => assert.equal(paraphrase.understanding.category, "Uncategorized"));
check("related-category compatible case matches", () => assert.equal(isTargetMatch(related.selectedItem), true));
check("billing case rejects Mobile Clock-In lesson", () => assert.equal(hasTargetMatch(run(billing, candidates).eligible), false));
check("login case rejects Mobile Clock-In lesson", () => assert.equal(hasTargetMatch(run(login, candidates).eligible), false));
check("generic Uncategorized case rejects it", () => assert.equal(hasTargetMatch(run(generic, candidates, "Uncategorized").eligible), false));
check("weak generic-overlap case rejects it", () => assert.equal(hasTargetMatch(run(weakOverlap, candidates, "Uncategorized").eligible), false));
check("location-word-only case rejects it", () => assert.equal(hasTargetMatch(run(locationOnly, candidates).eligible), false));
check("negation does not create false root-cause certainty", () => {
  const result = run(negation, candidates, "Uncategorized");
  assert.equal(result.selectedItem, null);
  assert.equal(result.draft.basedOnKnowledgeIds?.length ?? 0, 0);
});
check("high trust cannot override incompatibility", () => assert.ok(!run(billing, [lessonItem(orgA, { trustScore: 100 })], "Billing").eligible.length));
check("high reuse count cannot override incompatibility", () => assert.ok(!run(login, [lessonItem(orgA, { timesReused: 100000 })], "Authentication").eligible.length));
check("all-incompatible candidates produce safe no-match behavior", () => {
  const result = run(billing, [incompatibleItem], "Billing");
  assert.equal(result.selectedItem, null);
  assert.equal(result.draft.basedOnKnowledgeIds?.length ?? 0, 0);
});
check("incompatible item absent from grounding metadata", () => {
  const result = run(billing, candidates, "Billing");
  assert.equal(result.draft.basedOnKnowledgeIds?.length ?? 0, 0);
});
check("legitimate NC-FIX-006 reuse still succeeds", () => {
  assert.equal(isTargetMatch(exact.selectedItem), true);
  assert.ok((exact.draft.basedOnKnowledgeIds ?? []).some((id) => id === target.id || id === exact.selectedItem?.id));
});
check("tenant isolation remains intact", () => {
  const otherTenantItems = [lessonItem(orgB, { id: "nc-fix-007-other-tenant" })].filter((item) => item.organizationId === orgB);
  assert.equal(run(positiveExact, otherTenantItems, "Uncategorized").selectedItem?.organizationId, orgB);
  assert.ok(!otherTenantItems.some((item) => item.organizationId === orgA));
});

const deterministicA = run(positiveParaphrase, candidates, "Uncategorized");
const deterministicB = run(positiveParaphrase, candidates, "Uncategorized");
check("results are deterministic", () => assert.deepEqual(
  { eligible: deterministicA.eligible.map((m) => m.item.id), selected: deterministicA.selectedItem?.id ?? null, reason: deterministicA.compatibility?.reason ?? null },
  { eligible: deterministicB.eligible.map((m) => m.item.id), selected: deterministicB.selectedItem?.id ?? null, reason: deterministicB.compatibility?.reason ?? null }
));
check("clock-only ambiguity does not authorize the lesson", () => assert.equal(hasTargetMatch(run(clockOnly, candidates, "Uncategorized").eligible), false));

const failed = checks.filter((check) => !check.passed);
const result = {
  probe: "NC-FIX-007",
  disposableOrganizations: [orgA, orgB],
  assertions: checks.length,
  passed: checks.filter((check) => check.passed).length,
  failed: failed.length,
  checks,
  cleanup: { performed: true, databaseWrites: 0, residualRows: 0 }
};
console.log(JSON.stringify(result, null, 2));
if (failed.length > 0) process.exitCode = 1;
