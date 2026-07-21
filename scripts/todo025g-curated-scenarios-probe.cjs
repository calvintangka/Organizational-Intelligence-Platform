/*
 * TODO-025G — curated developer-demo scenario verification.
 *
 * This probe reads the persisted mature organization and runs the same pure
 * production retrieval, selection, compatibility, and drafting boundaries as
 * the ticket workspace. It never invokes a seed, reset, reflection, or write.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required; TODO-025G verifies persisted Developer Demo history read-only.");
  process.exit(1);
}

const { prisma } = require(path.join(root, "lib", "server", "prisma.ts"));
const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { curatedDeveloperDemoScenarios } = require(path.join(root, "data", "developerDemoScenarios.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const { withPreDiscriminationLessonMatches, selectPreferredMatch } = require(path.join(root, "lib", "lessonSelection.ts"));
const { assessCompatibilityDecision, draftResponse, findMatchingLesson, isCompatibleForDrafting } = require(path.join(root, "lib", "drafting.ts"));

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

function ticket(scenario) {
  return {
    id: `TODO025G-${scenario.id}`,
    ticketId: `TODO025G-${scenario.id}`,
    customerName: "Curated Developer Demo",
    subject: scenario.ticketSubject,
    description: scenario.ticketBody,
    category: "General",
    status: "new",
    createdAt: "2026-07-21T00:00:00.000Z"
  };
}

function runPipeline(testTicket, profile, items) {
  const understanding = understandForProfile(testTicket, profile);
  const canonical = identifyCanonicalProblem(understanding, profile);
  const rawMatches = retrieveMemory(understanding, items, new Set());
  const matches = withPreDiscriminationLessonMatches(testTicket, understanding, rawMatches, items, canonical.title);
  const compatible = matches.filter((match) => isCompatibleForDrafting(understanding, match.item, testTicket));
  const selected = compatible.length ? selectPreferredMatch(testTicket, compatible) : null;
  const topMatch = selected?.match ?? null;
  const lessonMatch = topMatch ? findMatchingLesson(testTicket, topMatch.item) : null;
  const compatibility = topMatch ? assessCompatibilityDecision(understanding, topMatch.item, testTicket) : null;
  const draft = draftResponse(testTicket, understanding, topMatch, profile, false);
  return { understanding, canonical, rawMatches, matches, compatible, selected, topMatch, lessonMatch, compatibility, draft };
}

function summary(result) {
  return {
    category: result.understanding.category,
    canonical: result.topMatch?.item.id ?? null,
    lesson: result.lessonMatch?.lesson.id ?? null,
    authorized: result.draft.basedOnKnowledgeIds.length > 0,
    source: result.draft.source,
    trust: result.topMatch?.item.trustScore ?? null,
    compatibility: result.compatibility?.state ?? "none",
    signals: result.lessonMatch?.matchedSignals ?? []
  };
}

function check(label, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  assert.ok(condition, `${label}${detail ? `: ${detail}` : ""}`);
}

function validateUiBoundary() {
  const workspace = fs.readFileSync(path.join(root, "components", "views", "TicketWorkspace.tsx"), "utf8");
  const provenance = fs.readFileSync(path.join(root, "components", "ProvenancePanel.tsx"), "utf8");
  check("developer-only scenario control is organization-gated", workspace.includes("isCuratedDeveloperDemoOrganization(organizationId)"));
  check("curated runner does not contain expected knowledge injection", !workspace.includes("expectedKnowledgeId") && !workspace.includes("expectedLessonId"));
  check("explainability renders persisted provenance", provenance.includes("Historical Provenance") && provenance.includes("provenance.sourceTicketId"));
  check("UI does not fabricate a current review timestamp", !workspace.includes("Last reviewed today"));
}

async function heroTimeline(items) {
  const item = items.find((candidate) => candidate.id === "demo-ki-sso-certificate-redirect-loop");
  assert.ok(item, "Persisted Hero SSO knowledge must exist.");
  const [validations, memory, sourceTicket] = await Promise.all([
    prisma.validationRecord.findMany({ where: { organizationId: DEMO, knowledgeItemId: item.id }, orderBy: { timestamp: "asc" } }),
    prisma.memoryChangeRecord.findMany({ where: { organizationId: DEMO, knowledgeItemId: item.id }, orderBy: { timestamp: "asc" } }),
    prisma.ticketRecord.findFirst({ where: { organizationId: DEMO, ticketId: item.provenance?.sourceTicketId } })
  ]);
  const versions = Array.isArray(item.knowledgeVersions) ? item.knowledgeVersions : [];
  const memoryText = (entry) => JSON.stringify({ before: entry.beforeState, after: entry.afterState });
  const initialTrust = memory.find((entry) => memoryText(entry).includes("20"));
  const setback2023 = memory.find((entry) => memoryText(entry).includes("45") && memoryText(entry).includes("35"));
  const setback2025 = memory.find((entry) => memoryText(entry).includes("81") && memoryText(entry).includes("71"));
  console.log(`HERO timeline source=${item.provenance?.sourceTicketId} sourceDate=${sourceTicket?.createdAt?.toISOString?.() ?? "missing"} knowledgeCreated=${item.createdAt} versions=${versions.length} lessons=${item.lessons.length} validations=${validations.length} trust=${item.trustScore}`);
  check("hero source ticket and early history are durable", Boolean(sourceTicket) && item.provenance?.sourceTicketId === "OIP-20230104-0001" && String(item.createdAt).startsWith("2023"));
  check("hero has the persisted mature evidence trail", versions.length === 7 && item.lessons.length === 10 && validations.length === 140 && item.trustScore === 95);
  check("hero trust timeline includes setbacks and recovery", Boolean(initialTrust) && Boolean(setback2023) && Boolean(setback2025));
}

async function main() {
  const before = await snapshots();
  const [profile, items] = await Promise.all([persistence.getOrganizationProfile(DEMO), persistence.loadKnowledge(DEMO)]);
  check("loads the persisted OIP Developer Demo profile", profile.id === DEMO && items.length === 45, `${profile.name}; ${items.length} knowledge items`);
  validateUiBoundary();
  await heroTimeline(items);

  for (const scenario of curatedDeveloperDemoScenarios) {
    const input = ticket(scenario);
    const result = runPipeline(input, profile, items);
    const actual = summary(result);
    console.log(`SCENARIO ${scenario.id} ${JSON.stringify(actual)}`);
    check(`${scenario.id} category`, actual.category === scenario.expectedCategory, actual.category);
    check(`${scenario.id} canonical`, actual.canonical === scenario.expectedKnowledgeId, actual.canonical ?? "none");
    check(`${scenario.id} lesson`, actual.lesson === scenario.expectedLessonId, actual.lesson ?? "none");
    check(`${scenario.id} authorization`, actual.authorized === scenario.expectedAuthorized, actual.source);
    check(`${scenario.id} drafting mode`, actual.source === scenario.expectedDraftingMode, actual.source);
    check(`${scenario.id} trust display`, actual.trust === scenario.expectedTrust, String(actual.trust));

    if (scenario.expectedAuthorized) {
      const provenance = result.topMatch?.item.provenance;
      check(`${scenario.id} has durable provenance and supporting evidence`, Boolean(provenance?.sourceTicketId) && (result.topMatch?.item.exampleTickets?.length ?? 0) > 0 && (result.topMatch?.item.knowledgeVersions?.length ?? 0) > 0);
      check(`${scenario.id} explanation has exact matched evidence`, (result.lessonMatch?.matchedSignals.length ?? 0) > 0 && result.draft.basedOnKnowledgeIds[0] === scenario.expectedKnowledgeId);
    } else {
      const forged = { itemId: result.topMatch?.item.id, lessonId: result.lessonMatch?.lesson.id, confidence: "high", reasoning: "forged curated-demo authorization" };
      const forgedDraft = result.topMatch ? draftResponse(input, result.understanding, result.topMatch, profile, false, forged) : result.draft;
      check(`${scenario.id} forged semantic approval cannot bypass final gate`, forgedDraft.source === "no_template" && forgedDraft.basedOnKnowledgeIds.length === 0);
    }

    const repeats = Array.from({ length: 3 }, () => JSON.stringify(summary(runPipeline(input, profile, items))));
    check(`${scenario.id} deterministic repeats`, new Set(repeats).size === 1);
  }

  const relevance = curatedDeveloperDemoScenarios.find((scenario) => scenario.id === "relevance-before-trust");
  const relevanceResult = runPipeline(ticket(relevance), profile, items);
  const proration = items.find((item) => item.id === "demo-ki-proration-credit-mismatch");
  check("higher-trust proration candidate exists but does not win", relevanceResult.topMatch?.item.id === relevance.expectedKnowledgeId && proration?.trustScore === 98 && relevanceResult.topMatch.item.trustScore === 95);

  const after = await snapshots();
  assert.deepEqual(after, before, "TODO-025G must not modify protected persisted organizations.");
  console.log("TODO-025G curated scenarios passed. PostgreSQL history was read-only and all decisions used the production pipeline boundaries.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
