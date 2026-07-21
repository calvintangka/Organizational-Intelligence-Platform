/* TODO-027 read-only canonical retrieval specificity probe. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required; TODO-027 must use persisted mature memory.");
  process.exit(1);
}

const { prisma } = require(path.join(root, "lib", "server", "prisma.ts"));
const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const { selectPreferredMatch, withPreDiscriminationLessonMatches } = require(path.join(root, "lib", "lessonSelection.ts"));
const { draftResponse, findMatchingLesson, isCompatibleForDrafting } = require(path.join(root, "lib", "drafting.ts"));

const DEMO = "profile-oip-developer-demo";
const PROTECTED = [DEMO, "profile-maesa-tech", "profile-fastdrop-logistics", "profile-pramana-consulting", "test-oip-regression"];

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
    id, ticketId: id, customerName: "TODO-027 QA", subject, description,
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
  return { understanding, rawMatches, matches, compatible, topMatch, lessonMatch, draft };
}

function check(label, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  assert.ok(condition, `${label}${detail ? `: ${detail}` : ""}`);
}

function rawSignature(understanding, items) {
  return retrieveMemory(understanding, items, new Set()).map((match) => [match.item.id, match.matchScore]);
}

async function main() {
  const before = await snapshots();
  const [profile, items] = await Promise.all([
    persistence.getOrganizationProfile(DEMO), persistence.loadKnowledge(DEMO)
  ]);

  // A/G/H — exact specific permission canonical beats a cross-domain item that
  // only inherited the analyzer's generic "delivery" vocabulary.
  const permissionTicket = ticket(
    "TODO027-A", "Permission Inheritance Delay",
    "permissions inheritance timeline root cause 01 permission-inheritance-delay"
  );
  const permission = pipeline(permissionTicket, profile, items);
  const permissionId = "demo-ki-permission-inheritance-delay";
  check("A specific canonical is raw rank 1", permission.rawMatches[0]?.item.id === permissionId,
    `${permission.rawMatches[0]?.item.id}:${permission.rawMatches[0]?.matchScore}`);
  check("G cross-domain delivery item cannot outrank exact permission canonical",
    permission.rawMatches.findIndex((match) => match.item.id === permissionId)
      < permission.rawMatches.findIndex((match) => match.item.id === "demo-ki-webhook-delivery-replay"));
  check("H M16 still fails later at category compatibility", permission.understanding.category === "Delivery"
    && permission.topMatch === null && permission.draft.source === "no_template");

  // B — trust-only changes leave raw canonical ordering and scores identical.
  const permissionUnderstanding = understandForProfile(permissionTicket, profile);
  const trustInverted = items.map((item) => ({ ...item, trustScore: 100 - (item.trustScore ?? 0) }));
  check("B trust inversion preserves canonical ordering", JSON.stringify(rawSignature(permissionUnderstanding, items))
    === JSON.stringify(rawSignature(permissionUnderstanding, trustInverted)));

  // C — exact long-tail terminology beats broader high-frequency mobile memory.
  const longTailTicket = ticket(
    "TODO027-C", "Mobile Offline Export Loses Date Filters",
    "mobile offline export timeline root cause 01 mobile-offline-export-filters"
  );
  const longTail = pipeline(longTailTicket, profile, items);
  check("C narrow long-tail canonical wins", longTail.topMatch?.item.id === "demo-ki-mobile-offline-export-filters",
    longTail.topMatch?.item.id);

  // D — genuinely equal intrinsic evidence resolves by stable canonical id,
  // independent of array order and trust.
  const source = items.find((item) => item.id === permissionId);
  const equalA = { ...source, id: "canonical-equal-aaa", canonicalProblemId: "canonical-equal-aaa", trustScore: 1 };
  const equalZ = { ...source, id: "canonical-equal-zzz", canonicalProblemId: "canonical-equal-zzz", trustScore: 100 };
  const equalForward = retrieveMemory(permissionUnderstanding, [equalZ, equalA], new Set()).map((match) => match.item.id);
  const equalReverse = retrieveMemory(permissionUnderstanding, [
    { ...equalA, trustScore: 100 }, { ...equalZ, trustScore: 1 }
  ], new Set()).map((match) => match.item.id);
  check("D equal relevance uses stable identity fallback", equalForward[0] === "canonical-equal-aaa"
    && equalReverse[0] === "canonical-equal-aaa", `${equalForward[0]}/${equalReverse[0]}`);

  // E — specificity improvements never weaken TODO-030 authorization safety.
  const weak = pipeline(ticket(
    "TODO027-E", "Invoice mentions a webhook status word",
    "I need a billing invoice address changed. No integration or signature failure occurred."
  ), profile, items);
  check("E weak overlap remains unauthorized", weak.draft.source === "no_template" && weak.draft.basedOnKnowledgeIds.length === 0);

  // F — contradiction and negation remain hard-safe.
  const contradiction = pipeline(ticket("TODO027-F1", "Report problem", "I can sign in normally and this is not a login issue. My report is blank."), profile, items);
  const negation = pipeline(ticket("TODO027-F2", "Not authentication", "I am not having a login problem. Authentication works normally."), profile, items);
  check("F contradiction and negation remain fail-closed", contradiction.draft.source === "no_template"
    && negation.draft.source === "no_template"
    && contradiction.draft.basedOnKnowledgeIds.length === 0
    && negation.draft.basedOnKnowledgeIds.length === 0);

  // H — current mature cases: M02 is present but loses at paraphrase/category;
  // M03/M05 retrieve the correct canonical and fail only at sibling choice.
  const m02Ticket = ticket(
    "M02", "Sign-in keeps bouncing after the IdP signing credential was replaced",
    "Our SAML users return to the identity provider repeatedly after we renewed the certificate. authentication certificate redirect timeline."
  );
  const m02 = pipeline(m02Ticket, profile, items);
  const heroId = "demo-ki-sso-certificate-redirect-loop";
  check("H M02 correct canonical enters retrieval but remains category-incompatible",
    m02.rawMatches.some((match) => match.item.id === heroId)
      && m02.understanding.category === "Login"
      && m02.topMatch === null);
  for (const [id, description] of [
    ["M03", "Certificate validity or signing metadata no longer matches. authentication certificate redirect timeline root cause 04 sso-certificate-redirect-loop"],
    ["M05", "Certificate signing metadata does not match after rotation. authentication certificate redirect timeline root cause 04 sso-certificate-redirect-loop"]
  ]) {
    const result = pipeline(ticket(id, "SSO Redirect Loop After Certificate Rotation", description), profile, items);
    check(`H ${id} canonical selection is already correct`, result.topMatch?.item.id === heroId, result.topMatch?.item.id);
  }

  const after = await snapshots();
  assert.deepEqual(after, before, "TODO-027 must not modify mature organizations.");
  console.log("TODO-027 focused probe passed. Canonical specificity is intrinsic and mature digests are unchanged.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
