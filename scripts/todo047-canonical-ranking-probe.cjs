/* TODO-047 — read-only canonical relevance and ranking audit. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required; TODO-047 is read-only.");

const { prisma } = require(path.join(root, "lib", "server", "prisma.ts"));
const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { draftResponse, findMatchingLesson, isCompatibleForDrafting, isStrongLessonEvidence } = require(path.join(root, "lib", "drafting.ts"));
const { selectPreferredMatch, withPreDiscriminationLessonMatches } = require(path.join(root, "lib", "lessonSelection.ts"));

const fixture = JSON.parse(fs.readFileSync(path.join(root, "scripts", "fixtures", "todo041-cross-domain-fixtures.json"), "utf8"));
const extra = JSON.parse(fs.readFileSync(path.join(root, "scripts", "fixtures", "todo047-canonical-ranking-fixtures.json"), "utf8"));
const DEMO = "profile-oip-developer-demo";
const HERO = "demo-ki-sso-certificate-redirect-loop";
const PROTECTED = [DEMO, "profile-maesa-tech", "profile-fastdrop-logistics", "profile-pramana-consulting", "test-oip-regression"];

function digest(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

async function snapshot(organizationId) {
  const where = { organizationId };
  const [organization, knowledge, candidates, validations, memory, tickets, evidence, patterns, logs, metrics, sequence] = await Promise.all([
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
  ]);
  return {
    digest: digest({ organization, knowledge, candidates, validations, memory, tickets, evidence, patterns, logs, metrics, sequence }),
    counts: { knowledge: knowledge.length, candidates: candidates.length, validations: validations.length, memory: memory.length, tickets: tickets.length, evidence: evidence.length, patterns: patterns.length }
  };
}

async function snapshots() { return Object.fromEntries(await Promise.all(PROTECTED.map(async (id) => [id, await snapshot(id)]))); }

function ticket(definition, prefix = "TODO047") {
  return {
    id: `${prefix}-${definition.id}`,
    ticketId: `${prefix}-${definition.id}`,
    customerName: "TODO-047 Audit",
    subject: definition.subject,
    description: definition.description,
    category: "General",
    status: "new",
    createdAt: "2026-07-22T00:00:00.000Z"
  };
}

function run(definition, profile, items, prefix = "TODO047") {
  const input = ticket(definition, prefix);
  const understanding = understandForProfile(input, profile);
  const canonical = identifyCanonicalProblem(understanding, profile);
  const rawMatches = retrieveMemory(understanding, items, new Set());
  const expected = definition.expectedCanonicalId;
  const rawRank = expected ? rawMatches.findIndex((match) => match.item.id === expected) : -1;
  const matches = withPreDiscriminationLessonMatches(input, understanding, rawMatches, items, canonical.title);
  const compatible = matches.filter((match) => isCompatibleForDrafting(understanding, match.item, input));
  const selected = compatible.length ? selectPreferredMatch(input, compatible) : null;
  const finalMatch = selected?.match ?? null;
  const lesson = finalMatch ? findMatchingLesson(input, finalMatch.item) : null;
  const draft = draftResponse(input, understanding, finalMatch, profile, false);
  return {
    id: definition.id,
    domain: definition.domain ?? "control",
    expectedCategory: definition.expectedCategory,
    actualCategory: understanding.category,
    expectedCanonicalId: expected ?? null,
    candidateRecall: expected ? rawRank >= 0 : null,
    rawRank: expected && rawRank >= 0 ? rawRank + 1 : null,
    rawTop1: expected ? rawRank === 0 : null,
    rawTop3: expected ? rawRank >= 0 && rawRank < 3 : null,
    rawTop3Candidates: rawMatches.slice(0, 3).map((match) => ({ id: match.item.id, score: match.matchScore, evidence: match.relevanceEvidence })),
    finalSelectedCanonicalId: finalMatch?.item.id ?? null,
    finalCanonicalCorrect: expected ? finalMatch?.item.id === expected : null,
    selectedLessonId: lesson?.lesson.id ?? null,
    strongLessonEvidence: Boolean(lesson && isStrongLessonEvidence(lesson, understanding.category !== "General" && understanding.category !== "Uncategorized")),
    authorization: draft.basedOnKnowledgeIds.length > 0,
    draftSource: draft.source,
    matchReason: rawMatches[0]?.matchReason ?? null
  };
}

function count(rows, field) { return rows.filter((row) => row[field]).length; }
function metric(rows) {
  return { total: rows.length, classification: rows.filter((row) => row.actualCategory === row.expectedCategory).length, candidateRecall: count(rows, "candidateRecall"), top3: count(rows, "rawTop3"), top1: count(rows, "rawTop1"), finalCanonical: count(rows, "finalCanonicalCorrect"), strongLesson: count(rows, "strongLessonEvidence"), authorized: count(rows, "authorization") };
}

function legacyTokenize(value) {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((token) => token.length > 2 && !new Set(["and", "are", "for", "from", "has", "have", "into", "not", "that", "the", "their", "this", "was", "were", "with"]).has(token));
}

// Reconstruct the pre-TODO-047 score for an honest before/after measurement.
function legacyRetrieve(understanding, knowledgeItems) {
  const analysisTokens = legacyTokenize(`${understanding.summary} ${understanding.coreProblem} ${understanding.category} ${understanding.tags.join(" ")}`);
  const analysisKeywords = new Set(analysisTokens);
  const normalizedAnalysis = analysisTokens.join(" ");
  return knowledgeItems.map((item) => {
    const categoryMatch = item.category.toLowerCase() === understanding.category.toLowerCase();
    const matchedTags = (item.tags ?? []).filter((tag) => understanding.tags.includes(tag));
    const itemKeywords = [...new Set(legacyTokenize(`${item.canonicalProblemTitle ?? item.title} ${item.problemSummary ?? item.problem} ${item.internalGuidance ?? ""} ${item.customerResponseTemplate ?? ""}`))];
    const matchedKeywords = itemKeywords.filter((keyword) => analysisKeywords.has(keyword));
    const titleTokens = legacyTokenize(item.canonicalProblemTitle ?? item.title);
    const exactPhrase = titleTokens.length >= 2 && normalizedAnalysis.includes(titleTokens.join(" "));
    return { id: item.id, score: Math.min((categoryMatch ? 55 : 0) + Math.min(matchedTags.length * 10, 30) + Math.min(matchedKeywords.length * 3, 12) + (exactPhrase ? 20 : 0) + Math.min((item.timesReused ?? 0) * 2, 8), 100) };
  }).filter((match) => match.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function legacyMetric(definitions, profile, items) {
  const rows = definitions.map((definition) => {
    const input = ticket(definition, "TODO047-LEGACY");
    const understanding = understandForProfile(input, profile);
    const raw = legacyRetrieve(understanding, items);
    const rank = raw.findIndex((match) => match.id === definition.expectedCanonicalId);
    return { rank, candidate: rank >= 0, top3: rank >= 0 && rank < 3, top1: rank === 0 };
  });
  return { total: rows.length, candidateRecall: count(rows, "candidate"), top3: count(rows, "top3"), top1: count(rows, "top1") };
}

function summarizeFailure(row) {
  if (row.actualCategory !== row.expectedCategory) return "CLASSIFICATION_FAILURE";
  if (!row.candidateRecall) return "CANONICAL_RETRIEVAL_FAILURE";
  if (!row.rawTop1) return "CANONICAL_SELECTION_FAILURE";
  if (!row.finalCanonicalCorrect) return "LESSON_EVIDENCE_BOUNDARY";
  if (!row.strongLessonEvidence) return "LESSON_EVIDENCE_FAILURE";
  return null;
}

async function main() {
  const before = await snapshots();
  const profile = await persistence.getOrganizationProfile(DEMO);
  const items = await persistence.loadKnowledge(DEMO);
  assert.equal(items.length, 45, "mature Developer Demo must remain 45 knowledge items");

  const positives = fixture.domains.flatMap((domain) => domain.paraphrases.map((entry) => run({ ...entry, domain: domain.domain, expectedCategory: domain.expectedCategory, expectedCanonicalId: domain.expectedCanonicalId }, profile, items, "TODO047-TODO041")));
  const unseen = extra.unseen.map((entry) => run(entry, profile, items, "TODO047-UNSEEN"));
  const competition = extra.competition.map((entry) => {
    const first = run(entry, profile, items, "TODO047-COMPETITION");
    const reversed = run(entry, profile, [...items].reverse(), "TODO047-COMPETITION-REVERSED");
    const trustInverted = items.map((item) => ({ ...item, trustScore: 100 - (item.trustScore ?? 0) }));
    const inverted = run(entry, profile, trustInverted, "TODO047-COMPETITION-TRUST");
    return { ...first, reversedRawTop: reversed.rawTop3Candidates[0]?.id ?? null, trustRawTop: inverted.rawTop3Candidates[0]?.id ?? null, stableOrder: first.rawTop3Candidates[0]?.id === reversed.rawTop3Candidates[0]?.id, trustIndependent: first.rawTop3Candidates.map((x) => `${x.id}:${x.score}`).join("|") === inverted.rawTop3Candidates.map((x) => `${x.id}:${x.score}`).join("|") };
  });
  const generic = extra.generic.map((entry) => run(entry, profile, items, "TODO047-GENERIC"));
  const wrongDomain = extra.wrongDomain.map((entry) => run(entry, profile, items, "TODO047-WRONG"));

  const beforeMetric = legacyMetric(positives.map((row, index) => ({ ...fixture.domains.flatMap((domain) => domain.paraphrases.map((entry) => ({ ...entry, domain: domain.domain, expectedCategory: domain.expectedCategory, expectedCanonicalId: domain.expectedCanonicalId })))[index] })), profile, items);
  const afterMetric = metric(positives);
  const byDomain = Object.fromEntries(fixture.domains.map((domain) => [domain.domain, metric(positives.filter((row) => row.domain === domain.domain))]));
  const unseenMetric = metric(unseen);
  const competitionPass = competition.every((row) => row.actualCategory === row.expectedCategory && row.rawTop3Candidates[0]?.id === row.expectedCanonicalId && row.stableOrder && row.trustIndependent);
  const genericPass = generic.every((row) => !row.authorization);
  const wrongDomainPass = wrongDomain.every((row) => row.actualCategory === row.expectedCategory && (!row.authorization || row.finalSelectedCanonicalId === row.expectedCanonicalId));
  const after = await snapshots();
  const protectedUnchanged = JSON.stringify(before) === JSON.stringify(after);
  const hero = items.find((item) => item.id === HERO);
  const provenance = hero?.sourceTicketId === "OIP-20230104-0001";
  const safetyRegression = !competitionPass || !genericPass || !wrongDomainPass || !protectedUnchanged || !provenance;
  const verdict = safetyRegression ? "SAFETY_REGRESSION" : afterMetric.top1 >= 63 && unseenMetric.classification === unseenMetric.total && unseenMetric.top1 >= 25 ? "COMPLETED_WITH_REMAINING_LESSON_LAYER" : "CANONICAL_RETRIEVAL_WEAKNESS_REMAINS";
  const report = { verdict, baseline: beforeMetric, after: afterMetric, byDomain, positives: positives.map((row) => ({ ...row, failureLayer: summarizeFailure(row) })), unseen: { ...unseenMetric, rows: unseen }, competition: { pass: competitionPass, rows: competition }, generic: { pass: genericPass, rows: generic }, wrongDomain: { pass: wrongDomainPass, rows: wrongDomain }, lessonBoundary: { correctCanonicalStrongLesson: positives.filter((row) => row.rawTop1 && row.strongLessonEvidence).length, correctCanonicalLessonEvidenceFailure: positives.filter((row) => row.rawTop1 && !row.strongLessonEvidence).length, wrongCanonical: positives.filter((row) => !row.rawTop1 && row.candidateRecall).length, noCanonical: positives.filter((row) => !row.candidateRecall).length, safetyRejection: positives.filter((row) => row.rawTop1 && !row.authorization).length }, protectedUnchanged, provenance, snapshots: { before, after } };
  console.log(`TODO047 BASELINE candidate=${beforeMetric.candidateRecall}/${beforeMetric.total} top3=${beforeMetric.top3}/${beforeMetric.total} top1=${beforeMetric.top1}/${beforeMetric.total}`);
  console.log(`TODO047 AFTER candidate=${afterMetric.candidateRecall}/${afterMetric.total} top3=${afterMetric.top3}/${afterMetric.total} top1=${afterMetric.top1}/${afterMetric.total} finalCanonical=${afterMetric.finalCanonical}/${afterMetric.total}`);
  console.log(`TODO047 UNSEEN classification=${unseenMetric.classification}/${unseenMetric.total} candidate=${unseenMetric.candidateRecall}/${unseenMetric.total} top3=${unseenMetric.top3}/${unseenMetric.total} top1=${unseenMetric.top1}/${unseenMetric.total}`);
  console.log(`TODO047 COMPETITION ${competitionPass ? "PASS" : "FAIL"} GENERIC ${genericPass ? "PASS" : "FAIL"} WRONG_DOMAIN ${wrongDomainPass ? "PASS" : "FAIL"}`);
  console.log(`TODO047 SNAPSHOTS ${protectedUnchanged ? "UNCHANGED" : "DRIFT DETECTED"} PROVENANCE ${provenance ? "INTACT" : "DRIFT"}`);
  console.log(`TODO047 VERDICT ${verdict}`);
  console.log(JSON.stringify(report, null, 2));
  if (safetyRegression) process.exitCode = 2;
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { try { await prisma.$disconnect(); } catch { /* ignore shutdown errors */ } });
