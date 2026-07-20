/*
 * TODO-003 data-integrity marker verification probe.
 *
 * PART A (TODO-003-C-DUP-001): duplicate same-canonical KnowledgeItem merge must
 *   not silently delete valid lessons. Exercises the REAL supported merge path
 *   (dedupeCanonicalProblems -> mergeCanonicalProblemItems -> mergeLessons) as
 *   pure functions. No database and no organization data are touched.
 *
 * PART B (TODO-003-D1): a durable memory mutation and its audit MemoryChangeRecord
 *   must commit atomically. Injects a MemoryChangeRecord failure into the REAL
 *   commitValidation transaction on a DISPOSABLE organization and asserts nothing
 *   partial survives. The disposable org is deleted at the end. Mature
 *   Maesa/FastDrop/Pramana data is never referenced.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();


const {
  dedupeCanonicalProblems,
  mergeCanonicalProblemItems,
  withCanonicalProblemDefaults
} = require(path.join(root, "lib", "canonicalProblemEngine.ts"));

const NOW = "2026-07-17T00:00:00.000Z";

function lesson(id, tag) {
  return {
    id,
    rootCause: `root cause ${tag}`,
    solution: `solution ${tag}`,
    customerResponse: `Hi {{customerName}}, response ${tag}.`,
    signals: [`signal-${tag}`],
    createdAt: NOW,
    sourceTicketId: `ticket-${tag}`
  };
}

function item(orgId, id, overrides = {}) {
  return withCanonicalProblemDefaults({
    id,
    organizationId: orgId,
    title: "Duplicate canonical problem",
    category: "Billing",
    canonicalProblemId: id,
    canonicalProblemTitle: "Duplicate canonical problem",
    problem: "Same canonical problem represented by two rows.",
    problemSummary: "Same canonical problem represented by two rows.",
    approvedAnswer: "Generic answer.",
    customerResponseTemplate: "Generic answer.",
    tags: ["billing"],
    sourceTicketId: "ticket-seed",
    trustScore: 30,
    createdAt: NOW,
    approvedAt: NOW,
    lessons: [],
    knowledgeVersions: [],
    ...overrides
  });
}

/* ===================== PART A: duplicate canonical merge ===================== */
function partA() {
  const report = {};

  // C-DUP TEST 1 — unique lesson preservation.
  {
    const A = item("test-a", "dup-canonical", { lessons: [lesson("A1", "a1"), lesson("A2", "a2")] });
    const B = item("test-a", "dup-canonical", { lessons: [lesson("B1", "b1"), lesson("B2", "b2")] });
    const [merged] = dedupeCanonicalProblems([A, B]);
    const ids = merged.lessons.map((l) => l.id).sort();
    assert.deepEqual(ids, ["A1", "A2", "B1", "B2"], "TEST1: all four lessons must survive the merge");
    for (const src of [...A.lessons, ...B.lessons]) {
      const kept = merged.lessons.find((l) => l.id === src.id);
      assert.ok(kept, `TEST1: lesson ${src.id} preserved`);
      assert.equal(kept.rootCause, src.rootCause, `TEST1: lesson ${src.id} content preserved`);
      assert.equal(kept.customerResponse, src.customerResponse, `TEST1: lesson ${src.id} response preserved`);
    }
    assert.equal(dedupeCanonicalProblems([A, B]).length, 1, "TEST1: duplicate canonical rows collapse to one item");
    report.test1 = { survivingLessonIds: ids, itemCount: 1 };
  }

  // C-DUP TEST 2 — same stable lesson id, identical content.
  {
    const shared = lesson("lesson-shared", "shared");
    const A = item("test-a", "dup-canonical-2", { lessons: [{ ...shared }] });
    const B = item("test-a", "dup-canonical-2", { lessons: [{ ...shared }] });
    const [merged] = dedupeCanonicalProblems([A, B]);
    const sharedCount = merged.lessons.filter((l) => l.id === "lesson-shared").length;
    assert.equal(merged.lessons.length, 1, "TEST2: identical same-id lesson must not duplicate");
    assert.equal(sharedCount, 1, "TEST2: exactly one lesson-shared");
    report.test2 = { lessonCount: merged.lessons.length, sharedIdOccurrences: sharedCount };
  }

  // C-DUP TEST 3 — same id, DIFFERENT content -> conflict variant preserved.
  {
    const A = item("test-a", "dup-canonical-3", { lessons: [lesson("lesson-shared", "variantX")] });
    const B = item("test-a", "dup-canonical-3", { lessons: [{ ...lesson("lesson-shared", "variantY"), rootCause: "DIFFERENT root cause", solution: "DIFFERENT solution", customerResponse: "DIFFERENT response" }] });
    const [merged] = dedupeCanonicalProblems([A, B]);
    const original = merged.lessons.find((l) => l.id === "lesson-shared");
    const variant = merged.lessons.find((l) => l.conflictOfLessonId === "lesson-shared");
    assert.ok(original, "TEST3: original lesson-shared preserved");
    assert.ok(variant, "TEST3: conflicting content preserved as a conflict variant (no silent loss)");
    assert.notEqual(variant.id, "lesson-shared", "TEST3: conflict variant has a distinct deterministic id");
    assert.ok(variant.conflictReason, "TEST3: conflict variant carries a conflictReason");
    const historyNote = (merged.learningHistory ?? []).find((h) => h.event === "Conflicting duplicate lesson ID preserved");
    assert.ok(historyNote, "TEST3: an audit history entry records the conflict");
    report.test3 = { lessonCount: merged.lessons.length, variantId: variant.id, conflictOfLessonId: variant.conflictOfLessonId, conflictReason: variant.conflictReason, historyRecorded: !!historyNote };
  }

  // C-DUP TEST 4 — different ids, identical content (TODO-016 concern, not C-DUP-001).
  {
    const base = lesson("l-x", "same");
    const A = item("test-a", "dup-canonical-4", { lessons: [{ ...base, id: "l-x" }] });
    const B = item("test-a", "dup-canonical-4", { lessons: [{ ...base, id: "l-y" }] });
    const [merged] = dedupeCanonicalProblems([A, B]);
    const bothSurvive = merged.lessons.some((l) => l.id === "l-x") && merged.lessons.some((l) => l.id === "l-y");
    assert.ok(bothSurvive, "TEST4: both distinct-id lessons survive (no lesson loss)");
    report.test4 = { lessonCount: merged.lessons.length, bothSurvive, note: "different-id identical content is not deduped (TODO-016 content-level dedup, NOT a C-DUP-001 lesson-loss failure)" };
  }

  // Supporting state — trust/versions/provenance/history not silently lost.
  {
    const A = item("test-a", "dup-canonical-5", {
      lessons: [lesson("A1", "a1")], trustScore: 40,
      knowledgeVersions: [{ versionId: "v-A", version: 1, createdAt: NOW, changeReason: "A", sourceTicketId: "ticket-a", summary: "vA" }],
      provenance: { sourceTicketId: "ticket-a", contributingTicketIds: ["ticket-a"], createdBy: "oip", createdAt: NOW, validatedBy: "actor-A", validatedAt: NOW, validationBasis: "b", validationScope: "s" },
      learningHistory: [{ id: "hist-A", event: "seed A", detail: "A", createdAt: NOW }]
    });
    const B = item("test-a", "dup-canonical-5", {
      lessons: [lesson("B1", "b1")], trustScore: 70,
      knowledgeVersions: [{ versionId: "v-B", version: 1, createdAt: NOW, changeReason: "B", sourceTicketId: "ticket-b", summary: "vB" }],
      provenance: { sourceTicketId: "ticket-b", contributingTicketIds: ["ticket-b"], createdBy: "oip", createdAt: NOW, validatedBy: "actor-B", validatedAt: NOW, validationBasis: "b", validationScope: "s" },
      learningHistory: [{ id: "hist-B", event: "seed B", detail: "B", createdAt: NOW }]
    });
    const merged = mergeCanonicalProblemItems(A, B);
    assert.equal(merged.trustScore, 70, "SUPPORT: trust is the max, never reset");
    assert.ok(merged.knowledgeVersions.some((v) => v.versionId === "v-A") && merged.knowledgeVersions.some((v) => v.versionId === "v-B"), "SUPPORT: versions unioned, none lost");
    assert.ok(merged.provenance, "SUPPORT: provenance preserved");
    assert.ok(merged.learningHistory.some((h) => h.id === "hist-A") && merged.learningHistory.some((h) => h.id === "hist-B"), "SUPPORT: learning history unioned");
    assert.equal(merged.lessons.length, 2, "SUPPORT: both lessons survive");
    report.support = { trust: merged.trustScore, versions: merged.knowledgeVersions.map((v) => v.versionId), provenancePreserved: !!merged.provenance, historyPreserved: true };
  }

  return report;
}

/* ===================== PART B: D1 transactional atomicity ===================== */
async function partB() {
  const service = require(path.join(root, "lib", "server", "persistenceService.ts"));
  const { getPrismaClient } = require(path.join(root, "lib", "server", "prisma.ts"));
  const prisma = getPrismaClient();
  const ORG = "test-oip-003d1";
  const ACTOR = { id: "todo003-actor", name: "TODO-003 D1 Probe" };
  const report = {};

  async function cleanup() {
    try { await service.deleteOrganization(ORG); }
    catch (error) { if (error?.code !== "ORGANIZATION_NOT_FOUND") throw error; }
  }

  function knowledge(rev, trust, template) {
    return withCanonicalProblemDefaults({
      id: "d1-knowledge", organizationId: ORG, title: "D1 item", category: "Billing",
      canonicalProblemId: "d1-knowledge", canonicalProblemTitle: "D1 item",
      problem: "p", problemSummary: "p", approvedAnswer: template, customerResponseTemplate: template,
      tags: ["billing"], sourceTicketId: "d1-ticket", trustScore: trust, createdAt: NOW, approvedAt: NOW,
      lessons: [lesson("d1-lesson", "d1")],
      knowledgeVersions: [{ versionId: "d1-knowledge-v1", version: 1, createdAt: NOW, changeReason: "seed", sourceTicketId: "d1-ticket", summary: "v1" }],
      ...(rev !== null ? { revision: rev } : {})
    });
  }

  function payload({ suffix, item, expectedRevision, memoryChangeId }) {
    const candidateId = `d1-candidate-${suffix}`;
    const validationId = `d1-validation-${suffix}`;
    return {
      candidate: { id: candidateId, organizationId: ORG, sourceTicketIds: ["d1-ticket"], proposedAction: "merge_existing", proposedContent: { solution: "x", customerResponseTemplate: item.customerResponseTemplate, internalGuidance: "x" }, rationale: "d1", status: "proposed", createdAt: NOW },
      validation: { id: validationId, organizationId: ORG, candidateId, knowledgeId: item.id, knowledgeVersionId: "d1-knowledge-v1", decision: "approved", actor: "x", roleExercised: "knowledge_validator", rationale: "d1", timestamp: NOW },
      memoryChange: { id: memoryChangeId, organizationId: ORG, knowledgeId: item.id, candidateId, validationRecordId: validationId, changeType: "merge_existing", beforeState: null, afterState: item, timestamp: NOW },
      knowledgeItem: item,
      expectedKnowledgeRevision: expectedRevision
    };
  }

  try {
    await cleanup();
    await service.upsertOrganizationProfiles([{ id: ORG, name: "D1 Probe", industry: "Probe", description: "Disposable D1 probe org.", products: ["p"], services: [], supportedDomains: ["billing"], businessVocabulary: [], supportedIssueTypes: [], outOfScopeTopics: [], customerTone: "professional", supportBoundaries: [], autoResolutionThreshold: 80, escalationRules: [], logoInitials: "D1", createdAt: NOW, updatedAt: NOW }]);

    // 1) Establish a committed baseline item (rev 1, trust 30, template T0).
    const T0 = "Original committed template.";
    const created = await service.commitValidation(ORG, payload({ suffix: "seed", item: knowledge(null, 30, T0), expectedRevision: null, memoryChangeId: "d1-mc-seed" }), ACTOR);
    assert.equal(created.knowledgeRevision, 1, "D1: baseline committed at revision 1");

    // 2) Inject a MemoryChangeRecord failure: a NEW validation/candidate that
    //    would mutate the KnowledgeItem (trust 99, new template, revision bump),
    //    but whose MemoryChangeRecord reuses the seed's primary key -> the
    //    MemoryChangeRecord.create fails inside the transaction, after the
    //    ValidationRecord.create step and before the knowledge upsert commits.
    const T1 = "Poisoned template that must never persist.";
    const injected = payload({ suffix: "inject", item: knowledge(1, 99, T1), expectedRevision: 1, memoryChangeId: "d1-mc-seed" });
    await assert.rejects(
      () => service.commitValidation(ORG, injected, ACTOR),
      (error) => error.code === "CONFLICT",
      "D1: a duplicate MemoryChangeRecord must abort the whole transaction"
    );

    // 3) Assert nothing partial survived.
    const after = (await service.loadKnowledge(ORG)).find((i) => i.id === "d1-knowledge");
    assert.equal(after.revision, 1, "D1: KnowledgeItem revision unchanged after failed transaction");
    assert.equal(after.trustScore, 30, "D1: trust unchanged");
    assert.equal(after.customerResponseTemplate, T0, "D1: generic template unchanged (poisoned template did not persist)");
    assert.equal(after.knowledgeVersions.length, 1, "D1: KnowledgeVersion unchanged");
    const validationCount = await prisma.validationRecord.count({ where: { organizationId: ORG } });
    const memoryCount = await prisma.memoryChangeRecord.count({ where: { organizationId: ORG } });
    const candidateCount = await prisma.knowledgeCandidate.count({ where: { organizationId: ORG } });
    assert.equal(validationCount, 1, "D1: no partial ValidationRecord from the failed commit");
    assert.equal(memoryCount, 1, "D1: no partial MemoryChangeRecord from the failed commit");
    assert.equal(candidateCount, 1, "D1: no partial candidate lifecycle write from the failed commit");
    assert.equal(await prisma.knowledgeCandidate.count({ where: { organizationId: ORG, id: "d1-candidate-inject" } }), 0, "D1: injected candidate rolled back");
    assert.equal(await prisma.validationRecord.count({ where: { organizationId: ORG, id: "d1-validation-inject" } }), 0, "D1: injected validation rolled back");

    report.result = { baselineRevision: 1, afterRevision: after.revision, trust: after.trustScore, templateUnchanged: after.customerResponseTemplate === T0, versions: after.knowledgeVersions.length, validationCount, memoryCount, candidateCount };
  } finally {
    await cleanup();
  }
  return report;
}

async function main() {
  const a = partA();
  console.log("PART A (C-DUP-001) passed:", JSON.stringify(a, null, 2));
  const b = await partB();
  console.log("PART B (D1) passed:", JSON.stringify(b, null, 2));
  console.log("TODO-003 markers probe passed.");
}

main()
  .then(async () => {
    try { await require(path.join(root, "lib", "server", "prisma.ts")).getPrismaClient().$disconnect(); } catch { /* pure-A runs never open prisma */ }
  })
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
    try { await require(path.join(root, "lib", "server", "prisma.ts")).getPrismaClient().$disconnect(); } catch { /* ignore */ }
  });
