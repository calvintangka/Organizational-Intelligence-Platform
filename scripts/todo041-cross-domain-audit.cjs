/*
 * TODO-041 — Cross-domain natural-language retrieval and lesson-matching audit.
 *
 * This is deliberately read-only. It imports the production analyzer,
 * canonical retrieval, lesson ranking, compatibility gates, and drafting
 * boundary, but never creates tickets or writes metrics/history.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required; TODO-041 is a read-only persisted-memory audit.");
  process.exit(1);
}

const { prisma } = require(path.join(root, "lib", "server", "prisma.ts"));
const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const {
  assessCompatibilityDecision,
  draftResponse,
  findMatchingLesson,
  isCompatibleForDrafting,
  isStrongLessonEvidence
} = require(path.join(root, "lib", "drafting.ts"));
const { selectPreferredMatch, withPreDiscriminationLessonMatches } = require(path.join(root, "lib", "lessonSelection.ts"));
const { evaluateSemanticLessonCompatibility } = require(path.join(root, "lib", "ai", "semanticCompatibility.ts"));

const fixture = JSON.parse(fs.readFileSync(path.join(root, "scripts", "fixtures", "todo041-cross-domain-fixtures.json"), "utf8"));
const todo037Fixture = JSON.parse(fs.readFileSync(path.join(root, "scripts", "fixtures", "todo037-natural-paraphrase-fixtures.json"), "utf8"));
const DEMO = "profile-oip-developer-demo";
const HERO = "demo-ki-sso-certificate-redirect-loop";
const PROTECTED = [DEMO, "profile-maesa-tech", "profile-fastdrop-logistics", "profile-pramana-consulting", "test-oip-regression"];

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function organizationSnapshot(organizationId) {
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
    counts: {
      knowledge: knowledge.length,
      candidates: candidates.length,
      validations: validations.length,
      memory: memory.length,
      tickets: tickets.length,
      evidence: evidence.length,
      patterns: patterns.length
    }
  };
}

async function snapshots() {
  return Object.fromEntries(await Promise.all(PROTECTED.map(async (id) => [id, await organizationSnapshot(id)])));
}

function ticket(definition, prefix = "TODO041") {
  return {
    id: `${prefix}-${definition.id}`,
    ticketId: `${prefix}-${definition.id}`,
    customerName: "TODO-041 Audit",
    subject: definition.subject,
    description: definition.description,
    category: "General",
    status: "new",
    createdAt: "2026-07-22T00:00:00.000Z"
  };
}

function runPipeline(input, profile, items) {
  const understanding = understandForProfile(input, profile);
  const canonical = identifyCanonicalProblem(understanding, profile);
  const rawMatches = retrieveMemory(understanding, items, new Set());
  const matches = withPreDiscriminationLessonMatches(input, understanding, rawMatches, items, canonical.title);
  const compatibleMatches = matches.filter((match) => isCompatibleForDrafting(understanding, match.item, input));
  const selected = compatibleMatches.length ? selectPreferredMatch(input, compatibleMatches) : null;
  const topMatch = selected?.match ?? null;
  const lessonMatch = topMatch ? findMatchingLesson(input, topMatch.item) : null;
  const compatibility = topMatch ? assessCompatibilityDecision(understanding, topMatch.item, input) : null;
  const draft = draftResponse(input, understanding, topMatch, profile, false);
  return { understanding, canonical, rawMatches, matches, compatibleMatches, selected, topMatch, lessonMatch, compatibility, draft };
}

function failureLayer(result, expected, expectedAuthorized) {
  if (result.understanding.category !== expected.expectedCategory) return "CLASSIFICATION_FAILURE";
  if (!result.rawMatches.some((match) => match.item.id === expected.expectedCanonicalId)) return "CANONICAL_RETRIEVAL_FAILURE";
  if (result.topMatch?.item.id !== expected.expectedCanonicalId) return "CANONICAL_SELECTION_FAILURE";
  if (!result.lessonMatch) return "LESSON_RETRIEVAL_FAILURE";
  if (result.lessonMatch.lesson.id !== expected.expectedLessonId) return "LESSON_RANKING_FAILURE";
  if (!isStrongLessonEvidence(result.lessonMatch, result.understanding.category !== "Uncategorized" && result.understanding.category !== "General")) return "LESSON_EVIDENCE_FAILURE";
  if (result.compatibility?.state !== "compatible") return "COMPATIBILITY_FAILURE";
  if (expectedAuthorized && !result.draft.basedOnKnowledgeIds.includes(expected.expectedCanonicalId)) return "DRAFTING_AUTHORIZATION_FAILURE";
  return expectedAuthorized ? null : (result.draft.basedOnKnowledgeIds.length ? "FALSE_POSITIVE_AUTHORIZATION" : null);
}

function summarizePositive(definition, expected, result) {
  const rank = result.rawMatches.findIndex((match) => match.item.id === expected.expectedCanonicalId);
  const authorized = result.draft.basedOnKnowledgeIds.includes(expected.expectedCanonicalId);
  const strongEvidence = Boolean(result.lessonMatch && isStrongLessonEvidence(
    result.lessonMatch,
    result.understanding.category !== "Uncategorized" && result.understanding.category !== "General"
  ));
  return {
    id: definition.id,
    domain: expected.domain,
    subject: definition.subject,
    expectedCategory: expected.expectedCategory,
    analyzerCategory: result.understanding.category,
    expectedCanonicalId: expected.expectedCanonicalId,
    canonicalProblem: result.canonical.title,
    rawCandidates: result.rawMatches.slice(0, 5).map((match) => ({ id: match.item.id, score: match.matchScore })),
    candidateRank: rank < 0 ? null : rank + 1,
    top3Recall: rank >= 0 && rank < 3,
    selectedCanonicalId: result.topMatch?.item.id ?? null,
    selectedLessonId: result.lessonMatch?.lesson.id ?? null,
    expectedLessonId: expected.expectedLessonId,
    matchedSignals: result.lessonMatch?.matchedSignals ?? [],
    lessonEvidenceScore: result.lessonMatch?.score ?? 0,
    multiTokenEvidence: result.lessonMatch?.multiTokenMatches ?? 0,
    ticketEvidenceCoverage: result.lessonMatch?.ticketEvidenceCoverage ?? 0,
    strongLessonEvidence: strongEvidence,
    compatibility: result.compatibility?.state ?? "none",
    compatibilityReason: result.compatibility?.reason ?? null,
    finalAuthorization: authorized,
    draftSource: result.draft.source,
    failureLayer: failureLayer(result, { ...expected, domain: expected.domain }, true),
    passed: authorized && result.topMatch?.item.id === expected.expectedCanonicalId && result.lessonMatch?.lesson.id === expected.expectedLessonId
  };
}

function summarizeControl(definition, result) {
  const authorized = result.draft.basedOnKnowledgeIds.length > 0;
  return {
    id: definition.id,
    domain: definition.domain,
    label: definition.label,
    subject: definition.subject,
    analyzerCategory: result.understanding.category,
    rawCandidates: result.rawMatches.slice(0, 5).map((match) => ({ id: match.item.id, score: match.matchScore })),
    selectedCanonicalId: result.topMatch?.item.id ?? null,
    selectedLessonId: result.lessonMatch?.lesson.id ?? null,
    matchedSignals: result.lessonMatch?.matchedSignals ?? [],
    lessonEvidenceScore: result.lessonMatch?.score ?? 0,
    multiTokenEvidence: result.lessonMatch?.multiTokenMatches ?? 0,
    compatibility: result.compatibility?.state ?? "none",
    finalAuthorization: authorized,
    failureLayer: authorized ? "FALSE_POSITIVE_AUTHORIZATION" : null,
    passed: !authorized
  };
}

function appendSignal(definition, signal, suffix) {
  return {
    ...definition,
    id: `${definition.id}-${suffix}`,
    description: `${definition.description} ${signal}`
  };
}

function providerResult(data, label = "TODO-041 controlled Claude mock") {
  return {
    ok: true,
    providerMode: "claude",
    providerLabel: label,
    latencyMs: 0,
    data
  };
}

async function aiSafetyCases(profile, hero) {
  const validTicket = ticket({
    id: "AI-VALID-UNKNOWN",
    subject: "Enterprise identity trouble after maintenance",
    description: "Staff using the corporate identity service describe intermittent trouble completing enterprise workspace access after a scheduled maintenance window. We have no clear symptom details yet."
  }, "TODO041-AI");
  const validUnderstanding = understandForProfile(validTicket, profile);
  const validCalls = [];
  const validEvaluation = await evaluateSemanticLessonCompatibility({
    async discriminateMatch(input) {
      validCalls.push(input.matchedCanonicalTitle);
      return providerResult({ isDistinctFromMatch: false, confidence: "high", reasoning: "Controlled audit authorization." });
    }
  }, validTicket, validUnderstanding, hero);
  const validDraft = draftResponse(validTicket, validUnderstanding, {
    item: hero, matchScore: 1, matchReason: "controlled semantic candidate", matchedTags: [], matchedKeywords: [], matchedCategory: hero.category
  }, profile, false, validEvaluation.authorization);

  const contradictionTicket = ticket({
    id: "AI-CONTRADICTION",
    subject: "Reports fail after successful sign-in",
    description: "I can sign in normally and this is not an authentication issue. The reports page is unavailable."
  }, "TODO041-AI");
  const contradictionCalls = [];
  const contradictionEvaluation = await evaluateSemanticLessonCompatibility({
    async discriminateMatch() {
      contradictionCalls.push(true);
      return providerResult({ isDistinctFromMatch: false, confidence: "high", reasoning: "Should never be reached." });
    }
  }, contradictionTicket, understandForProfile(contradictionTicket, profile), hero);

  const incompatibleTicket = ticket({
    id: "AI-INCOMPATIBLE",
    subject: "The invoice has a duplicate charge",
    description: "Finance sees two amounts for one billing period; this is not an identity-provider or sign-in issue."
  }, "TODO041-AI");
  const incompatibleCalls = [];
  const incompatibleEvaluation = await evaluateSemanticLessonCompatibility({
    async discriminateMatch() {
      incompatibleCalls.push(true);
      return providerResult({ isDistinctFromMatch: false, confidence: "high", reasoning: "Should never be reached." });
    }
  }, incompatibleTicket, understandForProfile(incompatibleTicket, profile), hero);

  const malformedCalls = [];
  const malformedEvaluation = await evaluateSemanticLessonCompatibility({
    async discriminateMatch() {
      malformedCalls.push(true);
      return providerResult({ isDistinctFromMatch: false, confidence: "not-a-valid-confidence", reasoning: "Malformed controlled output." });
    }
  }, validTicket, validUnderstanding, hero);

  const failureCalls = [];
  const failureEvaluation = await evaluateSemanticLessonCompatibility({
    async discriminateMatch() {
      failureCalls.push(true);
      return { ok: false, providerMode: "claude", providerLabel: "TODO-041 controlled failure", latencyMs: 0, error: "controlled provider failure" };
    }
  }, validTicket, validUnderstanding, hero);

  const fakeLessonDraft = draftResponse(validTicket, validUnderstanding, {
    item: hero, matchScore: 1, matchReason: "controlled semantic candidate", matchedTags: [], matchedKeywords: [], matchedCategory: hero.category
  }, profile, false, validEvaluation.authorization && { ...validEvaluation.authorization, lessonId: "nonexistent-lesson" });

  const weakTicket = ticket({
    id: "AI-WEAK-OVERLAP",
    subject: "A general workspace question",
    description: "We need guidance about an unfamiliar workspace setting, but no concrete failure details are available."
  }, "TODO041-AI");
  const weakCalls = [];
  const weakEvaluation = await evaluateSemanticLessonCompatibility({
    async discriminateMatch() {
      weakCalls.push(true);
      return providerResult({ isDistinctFromMatch: false, confidence: "high", reasoning: "Should not bypass weak overlap." });
    }
  }, weakTicket, understandForProfile(weakTicket, profile), hero);

  return {
    validUnknown: {
      category: validUnderstanding.category,
      providerCalls: validCalls.length,
      authorized: Boolean(validEvaluation.authorization),
      draftedFromKnowledge: validDraft.basedOnKnowledgeIds.includes(HERO),
      mechanism: validDraft.basedOnKnowledgeIds.includes(HERO) ? "AI-ASSISTED SEMANTIC AUTHORIZATION" : "none"
    },
    contradiction: { providerCalls: contradictionCalls.length, authorized: Boolean(contradictionEvaluation.authorization), blocked: !contradictionEvaluation.authorization && contradictionCalls.length === 0 },
    incompatible: { providerCalls: incompatibleCalls.length, authorized: Boolean(incompatibleEvaluation.authorization), blocked: !incompatibleEvaluation.authorization && incompatibleCalls.length === 0 },
    malformed: { providerCalls: malformedCalls.length, authorized: Boolean(malformedEvaluation.authorization), blocked: !malformedEvaluation.authorization },
    providerFailure: { providerCalls: failureCalls.length, authorized: Boolean(failureEvaluation.authorization), blocked: !failureEvaluation.authorization },
    nonexistentLesson: { authorized: fakeLessonDraft.basedOnKnowledgeIds.length > 0, blocked: fakeLessonDraft.basedOnKnowledgeIds.length === 0 },
    weakOverlap: { providerCalls: weakCalls.length, authorized: Boolean(weakEvaluation.authorization), blocked: !weakEvaluation.authorization && weakCalls.length === 0 }
  };
}

async function main() {
  const before = await snapshots();
  const [profile, items] = await Promise.all([persistence.getOrganizationProfile(DEMO), persistence.loadKnowledge(DEMO)]);
  if (profile.id !== DEMO || items.length !== 45) throw new Error(`Expected mature Developer Demo profile with 45 items; got ${profile.id}/${items.length}.`);
  const expectedHero = items.find((item) => item.id === HERO);
  if (!expectedHero) throw new Error(`Missing ${HERO}.`);

  const positiveRows = [];
  const exactWordRows = [];
  for (const domain of fixture.domains) {
    for (const definition of domain.paraphrases) {
      const result = runPipeline(ticket(definition), profile, items);
      positiveRows.push(summarizePositive(definition, domain, result));
      const natural = result;
      const oneSignal = runPipeline(ticket(appendSignal(definition, domain.oneSignal, "one-signal")), profile, items);
      const manySignals = runPipeline(ticket(appendSignal(definition, domain.manySignals, "many-signals")), profile, items);
      exactWordRows.push({
        id: definition.id,
        domain: domain.domain,
        naturalAuthorized: natural.draft.basedOnKnowledgeIds.includes(domain.expectedCanonicalId),
        oneSignalAuthorized: oneSignal.draft.basedOnKnowledgeIds.includes(domain.expectedCanonicalId),
        manySignalsAuthorized: manySignals.draft.basedOnKnowledgeIds.includes(domain.expectedCanonicalId),
        naturalFailureLayer: failureLayer(natural, domain, true),
        oneSignalFailureLayer: failureLayer(oneSignal, domain, true),
        manySignalsFailureLayer: failureLayer(manySignals, domain, true)
      });
    }
  }

  const controls = fixture.controls.map((definition) => summarizeControl(definition, runPipeline(ticket(definition), profile, items)));
  const nonSsoRows = positiveRows.filter((row) => row.domain !== "Authentication / SSO");
  const ssoRows = positiveRows.filter((row) => row.domain === "Authentication / SSO");
  const metric = (rows, key) => rows.filter((row) => row[key]).length;
  const rate = (count, total) => total ? Number((count / total).toFixed(4)) : 0;
  const positiveMetrics = (rows) => ({
    total: rows.length,
    correctClassification: rows.filter((row) => row.analyzerCategory === row.expectedCategory).length === rows.length,
    correctClassificationCount: rows.filter((row) => row.analyzerCategory === row.expectedCategory).length,
    candidateRecallCount: rows.filter((row) => row.candidateRank !== null).length,
    top3RecallCount: metric(rows, "top3Recall"),
    correctCanonicalSelectionCount: rows.filter((row) => row.selectedCanonicalId === row.expectedCanonicalId).length,
    correctLessonSelectionCount: rows.filter((row) => row.selectedLessonId === row.expectedLessonId).length,
    strongLessonEvidenceCount: metric(rows, "strongLessonEvidence"),
    finalAuthorizationCount: metric(rows, "finalAuthorization"),
    falseNegativeCount: rows.filter((row) => !row.finalAuthorization).length
  });
  const overall = positiveMetrics(positiveRows);
  const excludingSso = positiveMetrics(nonSsoRows);
  const ssoControlRows = todo037Fixture.genuineParaphrases.slice(0, 10).map((definition) => {
    const expected = {
      domain: "Authentication / SSO",
      expectedCategory: "Authentication",
      expectedCanonicalId: HERO,
      expectedLessonId: "demo-les-sso-certificate-redirect-loop-001"
    };
    return summarizePositive(definition, expected, runPipeline(ticket(definition, "TODO041-SSO-CONTROL"), profile, items));
  });
  const ssoControlMetrics = positiveMetrics(ssoControlRows);
  const domainResults = Object.fromEntries(fixture.domains.map((domain) => {
    const rows = positiveRows.filter((row) => row.domain === domain.domain);
    return [domain.domain, {
      ...positiveMetrics(rows),
      rates: {
        classification: rate(rows.filter((row) => row.analyzerCategory === row.expectedCategory).length, rows.length),
        candidateRecall: rate(rows.filter((row) => row.candidateRank !== null).length, rows.length),
        top3Recall: rate(rows.filter((row) => row.top3Recall).length, rows.length),
        canonicalSelection: rate(rows.filter((row) => row.selectedCanonicalId === row.expectedCanonicalId).length, rows.length),
        lessonSelection: rate(rows.filter((row) => row.selectedLessonId === row.expectedLessonId).length, rows.length),
        strongEvidence: rate(rows.filter((row) => row.strongLessonEvidence).length, rows.length),
        authorization: rate(rows.filter((row) => row.finalAuthorization).length, rows.length)
      }
    }];
  }));

  const dependency = {
    total: exactWordRows.length,
    naturalAuthorized: exactWordRows.filter((row) => row.naturalAuthorized).length,
    oneSignalAuthorized: exactWordRows.filter((row) => row.oneSignalAuthorized).length,
    manySignalsAuthorized: exactWordRows.filter((row) => row.manySignalsAuthorized).length,
    cases: exactWordRows
  };

  const trustTarget = fixture.domains.find((domain) => domain.id === "billing-duplicate-invoice");
  const trustCompetitor = items.find((item) => item.id === "demo-ki-annual-renewal-seat-count");
  const trustDefinition = {
    id: "TRUST-STRONG-BILLING",
    subject: "Duplicate invoice after seat changes",
    description: "Our billing invoice charged twice after we reduced seats. Please check the billing duplicate invoice timeline and root cause 01 duplicate-invoice-seat-change."
  };
  const trustItems = items.map((item) => ({ ...item, trustScore: item.id === trustTarget.expectedCanonicalId ? 1 : item.id === trustCompetitor.id ? 100 : item.trustScore }));
  const trustResult = runPipeline(ticket(trustDefinition, "TODO041-TRUST"), profile, trustItems);
  const trustNegativeDefinition = fixture.controls.find((control) => control.id === "C02");
  const trustNegativeResult = runPipeline(ticket(trustNegativeDefinition, "TODO041-TRUST"), profile, trustItems);
  const trust = {
    correctLowTrustSelected: trustResult.topMatch?.item.id === trustTarget.expectedCanonicalId,
    wrongHighTrustSelected: trustResult.topMatch?.item.id === trustCompetitor.id,
    negativeHighTrustAuthorized: trustNegativeResult.draft.basedOnKnowledgeIds.length > 0,
    targetTrust: 1,
    competitorTrust: 100
  };

  const ai = await aiSafetyCases(profile, expectedHero);
  const safetyKeys = ["blocked"];
  const aiSafetyPass = Object.values(ai).every((entry) => safetyKeys.some((key) => entry[key] === true) || entry.draftedFromKnowledge === true);
  const controlFalsePositives = controls.filter((row) => row.finalAuthorization);
  const negativeAmbiguous = {
    total: controls.length,
    passed: controls.filter((row) => row.passed).length,
    falsePositiveAuthorizations: controlFalsePositives.length,
    falsePositiveRate: rate(controlFalsePositives.length, controls.length)
  };
  const failureLayers = {};
  for (const row of positiveRows) if (row.failureLayer) failureLayers[row.failureLayer] = (failureLayers[row.failureLayer] ?? 0) + 1;

  const after = await snapshots();
  const protectedUnchanged = JSON.stringify(before) === JSON.stringify(after);
  const heroAfter = (await persistence.loadKnowledge(DEMO)).find((item) => item.id === HERO);
  const provenance = {
    sourceTicketId: heroAfter?.sourceTicketId ?? null,
    sourceTicketIds: heroAfter?.sourceTicketIds ?? [],
    expectedSourceTicketId: "OIP-20230104-0001",
    intact: heroAfter?.sourceTicketId === "OIP-20230104-0001"
  };

  const coreWeakness = excludingSso.finalAuthorizationCount < excludingSso.total;
  const safetyFailure = !protectedUnchanged || !provenance.intact || negativeAmbiguous.falsePositiveAuthorizations > 0 || !aiSafetyPass || trust.wrongHighTrustSelected || trust.negativeHighTrustAuthorized;
  const verdict = safetyFailure ? "SAFETY_FAILURE" : coreWeakness ? "CROSS_DOMAIN_RETRIEVAL_WEAKNESS_CONFIRMED" : "PASS";
  const report = {
    verdict,
    environment: { organizationId: DEMO, knowledgeItems: items.length, lessons: items.reduce((sum, item) => sum + (item.lessons?.length ?? 0), 0), readOnly: true },
    overall,
    excludingSso,
    domainResults,
    ssoControl: { source: "TODO-037/TODO-040 representative subset", ...ssoControlMetrics, rows: ssoControlRows },
    positiveRows,
    controls,
    negativeAmbiguous,
    dependency,
    failureLayers,
    trust,
    ai,
    aiSafetyPass,
    provenance,
    protectedUnchanged,
    snapshots: { before, after }
  };
  console.log(`TODO041 DOMAINS ${fixture.domains.map((domain) => `${domain.domain}=${domain.paraphrases.length}`).join(" ")}`);
  console.log(`TODO041 POSITIVES overall=${overall.total} nonSso=${excludingSso.total} authorization=${overall.finalAuthorizationCount}/${overall.total} nonSsoAuthorization=${excludingSso.finalAuthorizationCount}/${excludingSso.total}`);
  console.log(`TODO041 CONTROLS total=${negativeAmbiguous.total} falsePositives=${negativeAmbiguous.falsePositiveAuthorizations}`);
  console.log(`TODO041 EXACT-WORD natural=${dependency.naturalAuthorized}/${dependency.total} oneSignal=${dependency.oneSignalAuthorized}/${dependency.total} manySignals=${dependency.manySignalsAuthorized}/${dependency.total}`);
  console.log(`TODO041 TRUST ${JSON.stringify(trust)}`);
  console.log(`TODO041 AI ${JSON.stringify({ aiSafetyPass, ai })}`);
  console.log(`TODO041 SNAPSHOTS ${protectedUnchanged ? "UNCHANGED" : "DRIFT DETECTED"}`);
  console.log(`TODO041 PROVENANCE ${JSON.stringify(provenance)}`);
  console.log(`TODO041 VERDICT ${verdict}`);
  console.log(JSON.stringify(report, null, 2));
  if (safetyFailure) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await prisma.$disconnect(); } catch { /* ignore shutdown errors */ }
  });
