/* TODO-029 read-only trust-independent relevance selection probe. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required; TODO-029 must use persisted mature memory.");
  process.exit(1);
}

const { prisma } = require(path.join(root, "lib", "server", "prisma.ts"));
const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const { selectPreferredMatch, withPreDiscriminationLessonMatches } = require(path.join(root, "lib", "lessonSelection.ts"));
const {
  draftResponse, findMatchingLesson, isCompatibleForDrafting,
  isStrongLessonEvidence, ticketContradictsLesson
} = require(path.join(root, "lib", "drafting.ts"));

const DEMO = "profile-oip-developer-demo";
const MAESA = "profile-maesa-tech";
const PROTECTED = [DEMO, MAESA, "profile-fastdrop-logistics", "profile-pramana-consulting", "test-oip-regression"];

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function snapshot(organizationId) {
  const where = { organizationId };
  return digest(await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId } }),
    prisma.knowledgeItem.findMany({ where, orderBy: { id: "asc" } }),
    prisma.knowledgeCandidate.findMany({ where, orderBy: { id: "asc" } }),
    prisma.validationRecord.findMany({ where, orderBy: { id: "asc" } }),
    prisma.memoryChangeRecord.findMany({ where, orderBy: { id: "asc" } }),
    prisma.ticketRecord.findMany({ where, orderBy: { id: "asc" } }),
    prisma.trustEvidence.findMany({ where, orderBy: { id: "asc" } }),
    prisma.emergingPattern.findMany({ where, orderBy: { id: "asc" } }),
    prisma.intelligenceLog.findMany({ where, orderBy: { id: "asc" } }),
    prisma.orgMetrics.findUnique({ where: { organizationId } }),
    prisma.ticketSequence.findUnique({ where: { organizationId } })
  ]));
}

async function snapshots() {
  return Object.fromEntries(await Promise.all(PROTECTED.map(async (id) => [id, await snapshot(id)])));
}

function ticket(id, subject, description) {
  return {
    id, ticketId: id, customerName: "TODO-029 QA", subject, description,
    category: "General", status: "new", createdAt: "2026-07-21T00:00:00.000Z"
  };
}

function pipeline(testTicket, profile, items) {
  const understanding = understandForProfile(testTicket, profile);
  const canonical = identifyCanonicalProblem(understanding, profile);
  const rawMatches = retrieveMemory(understanding, items, new Set());
  const matches = withPreDiscriminationLessonMatches(testTicket, understanding, rawMatches, items, canonical.title);
  const compatible = matches.filter((match) => isCompatibleForDrafting(understanding, match.item, testTicket));
  const selected = compatible.length ? selectPreferredMatch(testTicket, compatible) : null;
  const topMatch = selected?.match ?? null;
  const lessonMatch = topMatch ? findMatchingLesson(testTicket, topMatch.item) : null;
  const draft = draftResponse(testTicket, understanding, topMatch, profile, false);
  return { understanding, rawMatches, matches, compatible, selected, topMatch, lessonMatch, draft };
}

function check(label, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  assert.ok(condition, `${label}${detail ? `: ${detail}` : ""}`);
}

function selectedId(testTicket, matches) {
  return selectPreferredMatch(testTicket, matches)?.match.item.id ?? null;
}

function withTrust(matches, trustById) {
  return matches.map((match) => ({
    ...match,
    item: { ...match.item, trustScore: trustById[match.item.id] ?? match.item.trustScore }
  }));
}

async function main() {
  const before = await snapshots();
  const [profile, items, maesaProfile, maesaItems] = await Promise.all([
    persistence.getOrganizationProfile(DEMO), persistence.loadKnowledge(DEMO),
    persistence.getOrganizationProfile(MAESA), persistence.loadKnowledge(MAESA)
  ]);

  const billingTicket = ticket(
    "TODO029-A", "Duplicate Invoice After Seat Changes",
    "billing duplicate invoice timeline root cause 01 duplicate-invoice-seat-change"
  );
  const billing = pipeline(billingTicket, profile, items);
  const expected = "demo-ki-duplicate-invoice-seat-change";
  const tax = "demo-ki-invoice-tax-rounding";
  const relevantLesson = findMatchingLesson(billingTicket, items.find((item) => item.id === expected));
  const taxLesson = findMatchingLesson(billingTicket, items.find((item) => item.id === tax));
  check("A lower-trust but more relevant candidate wins", billing.topMatch?.item.id === expected
    && relevantLesson.score > taxLesson.score
    && billing.topMatch.item.trustScore < items.find((item) => item.id === tax).trustScore,
    `${billing.topMatch?.item.id}; lesson ${relevantLesson.score}>${taxLesson.score}`);

  const inverted = withTrust(billing.compatible, Object.fromEntries(billing.compatible.map((match) => [match.item.id, 100 - match.item.trustScore])));
  check("B trust inversion preserves winner", selectedId(billingTicket, inverted) === expected, selectedId(billingTicket, inverted));

  const irrelevantTrust100 = withTrust(billing.compatible, { [expected]: 1, [tax]: 100 });
  check("C irrelevant Trust 100 cannot overtake", selectedId(billingTicket, irrelevantTrust100) === expected);
  const lowRelevant = selectPreferredMatch(billingTicket, irrelevantTrust100);
  check("D relevant candidate stays selected and reports low trust", lowRelevant?.match.item.id === expected && lowRelevant.match.item.trustScore === 1);

  // Retrieval itself must be invariant to trust-only changes.
  const understanding = understandForProfile(billingTicket, profile);
  const invertedItems = items.map((item) => ({ ...item, trustScore: 100 - (item.trustScore ?? 0) }));
  const rawOriginal = retrieveMemory(understanding, items, new Set()).map((match) => [match.item.id, match.matchScore]);
  const rawInverted = retrieveMemory(understanding, invertedItems, new Set()).map((match) => [match.item.id, match.matchScore]);
  check("B raw retrieval IDs and scores are trust-independent", JSON.stringify(rawOriginal) === JSON.stringify(rawInverted));

  // Equal intrinsic evidence resolves by stable item identity, never array order or trust.
  const sourceItem = items.find((item) => item.id === expected);
  const equalA = { ...billing.compatible[0], item: { ...sourceItem, id: "equal-aaa", trustScore: 1 }, matchScore: 90 };
  const equalZ = { ...billing.compatible[0], item: { ...sourceItem, id: "equal-zzz", trustScore: 100 }, matchScore: 90 };
  const equalForward = selectedId(billingTicket, [equalZ, equalA]);
  const equalReverse = selectedId(billingTicket, [{ ...equalA, item: { ...equalA.item, trustScore: 100 } }, { ...equalZ, item: { ...equalZ.item, trustScore: 1 } }]);
  check("E equal relevance uses stable identity fallback", equalForward === "equal-aaa" && equalReverse === "equal-aaa", `${equalForward}/${equalReverse}`);

  // Existing TODO-019 sibling specificity remains intrinsic and order-independent.
  const loginItem = maesaItems.find((item) => item.id === "canonical-login-issue");
  const siblingTicket = ticket(
    "TODO029-F", "Cannot sign in after switching laptops",
    "I switched laptops and my browser no longer saved my password. Saved logins did not transfer, and browser autofill had the password."
  );
  const siblingForward = findMatchingLesson(siblingTicket, loginItem);
  const siblingReverse = findMatchingLesson(siblingTicket, { ...loginItem, trustScore: 1, lessons: [...loginItem.lessons].reverse() });
  check("F sibling specificity is order- and trust-independent", siblingForward?.lesson.id === siblingReverse?.lesson.id
    && siblingForward?.score === siblingReverse?.score
    && isStrongLessonEvidence(siblingForward, true));

  // TODO-030 weak-overlap boundary remains authoritative.
  const weakTicket = ticket(
    "TODO029-G", "Invoice mentions a webhook status word",
    "I need a billing invoice address changed. No integration or signature failure occurred."
  );
  const weak = pipeline(weakTicket, profile, items);
  check("G TODO-030 weak overlap fails closed", weak.draft.source === "no_template" && weak.draft.basedOnKnowledgeIds.length === 0);

  const contradiction = pipeline(ticket("TODO029-H1", "Report problem", "I can sign in normally and this is not a login issue. My report is blank."), profile, items);
  const negation = pipeline(ticket("TODO029-H2", "Not authentication", "I am not having a login problem. Authentication works normally."), profile, items);
  check("H contradiction and negation remain hard-safe", contradiction.draft.source === "no_template"
    && negation.draft.source === "no_template"
    && contradiction.draft.basedOnKnowledgeIds.length === 0
    && negation.draft.basedOnKnowledgeIds.length === 0);

  // Trust is not present in semantic discrimination input, and a forged AI
  // authorization still cannot bypass TODO-030's weak deterministic gate.
  const forged = {
    itemId: weak.topMatch.item.id,
    lessonId: weak.lessonMatch.lesson.id,
    confidence: "high",
    reasoning: "AI preferred a trusted candidate"
  };
  const aiDraft = draftResponse(weakTicket, weak.understanding, {
    ...weak.topMatch, item: { ...weak.topMatch.item, trustScore: 100 }
  }, profile, false, forged);
  check("I AI cannot use trust to bypass relevance or safety", aiDraft.source === "no_template"
    && aiDraft.basedOnKnowledgeIds.length === 0
    && !ticketContradictsLesson(weakTicket, weak.lessonMatch.lesson));

  const after = await snapshots();
  assert.deepEqual(after, before, "TODO-029 must not modify mature organizations.");
  console.log("TODO-029 focused probe passed. Trust-only changes do not change relevance selection; mature digests are unchanged.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
