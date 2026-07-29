/*
 * TODO-058F — new multilingual lesson promotion.
 *
 * Drives the REAL commitValidation transaction and the REAL lesson-merge
 * function (mergeLessonIntoExisting) against a DISPOSABLE organization, to prove
 * a genuinely new operational lesson is promoted EXACTLY ONCE and is then
 * strengthened — not duplicated — by equivalent tickets in other languages.
 *
 * Mature organizations are never referenced. Cleanup runs in a finally block.
 *
 * Scope note: the promoted lesson's TEXT is authored by the human reviewer in
 * the Reflection step (app/page.tsx applyLessonToItem consumes a reviewer-supplied
 * lessonDraft). The pipeline neither translates it nor derives it from the
 * customer-facing draft, so "authored in the internal documentation language" is
 * a property of what the reviewer submits. This probe asserts the pipeline
 * PRESERVES the authored language and never substitutes the customer's.
 */
const assert = require("node:assert/strict");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

const service = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { getPrismaClient } = require(path.join(root, "lib", "server", "prisma.ts"));
const {
  withCanonicalProblemDefaults,
  mergeLessonIntoExisting,
  normalizeReusableLessonTemplate
} = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { findMatchingLesson } = require(path.join(root, "lib", "drafting.ts"));

const ORG = `test-oip-058f-${Date.now()}`;
const ACTOR = { id: "todo058f-actor", name: "TODO-058F Probe" };
const MATURE = ["profile-oip-developer-demo", "profile-maesa-tech", "profile-fastdrop-logistics", "test-oip-regression"];
const NOW = "2026-07-29T00:00:00.000Z";
// A knowledge item persists under its CANONICAL id (withCanonicalProblemDefaults
// rewrites the item id), and canonical ids are global — so the fixture uses one
// fixture-scoped id for both. Learned in TODO-058E.
const KI = "todo058f-canonical-mfa";
const SEED_LESSON = "todo058f-lesson-seed";

let clock = Date.parse("2026-07-29T12:00:00.000Z");
const nextTime = () => new Date((clock += 1000)).toISOString();

const failures = [];
async function check(label, fn) {
  try {
    await fn();
    console.log(`  PASS  ${label}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    console.log(`  FAIL  ${label} -- ${error.message}`);
  }
}

function profile() {
  return {
    id: ORG, name: "TODO-058F Fixture", industry: "Software / SaaS", description: "Disposable TODO-058F org.",
    products: ["workspace"], services: [], supportedDomains: ["access"], businessVocabulary: ["workspace"],
    supportedIssueTypes: ["access"], outOfScopeTopics: [], customerTone: "professional", supportBoundaries: [],
    autoResolutionThreshold: 80, escalationRules: [], logoInitials: "5F", createdAt: NOW, updatedAt: NOW,
    languagePolicy: { organizationLanguage: "en", responseMode: "customer_language", internalLanguage: "en", minimumDetectionConfidence: 0.6 }
  };
}

/** Existing canonical with ONE unrelated seed lesson, so promotion is genuinely new. */
function seedItem() {
  return withCanonicalProblemDefaults({
    id: KI, organizationId: ORG, title: "MFA verification failure", category: "Two-Factor Auth",
    canonicalProblemId: KI, canonicalProblemTitle: "MFA Verification Failure",
    problem: "MFA verification failure", problemSummary: "MFA verification failure",
    approvedAnswer: "We re-issued the verification code.",
    customerResponseTemplate: "We re-issued the verification code.",
    tags: ["mfa"], sourceTicketId: "todo058f-seed-ticket", trustScore: 40, createdAt: NOW, approvedAt: NOW,
    lessons: [{
      id: SEED_LESSON, rootCause: "The verification code expired before it was entered.",
      solution: "Re-issue the verification code.",
      customerResponse: "We re-issued your verification code.",
      signals: ["code expired"], createdAt: NOW, sourceTicketId: "todo058f-seed-ticket"
    }],
    knowledgeVersions: [{ versionId: `${KI}-v1`, version: 1, createdAt: NOW, changeReason: "seed", sourceTicketId: "todo058f-seed-ticket", summary: "v1" }]
  });
}

/**
 * The genuinely NEW operational lesson, authored by the reviewer in the
 * organization's internal documentation language (English) even though the
 * source ticket that triggered it is Japanese.
 */
const NEW_LESSON_DRAFT = {
  rootCause: "The authenticator secret stayed bound to the previous device after a device replacement.",
  solution: "Reset the MFA enrolment and have the customer re-enrol the authenticator on the new device.",
  customerResponse: "We reset your MFA enrolment so you can re-enrol the authenticator on your new device.",
  signals: ["device replacement", "mfa enrolment"]
};

/** Equivalent tickets describing the SAME new operational problem. */
const TICKETS = {
  ja: ["機種変更後にMFAが使えません", "新しいデバイスに機種変更したところ、認証コードが使えなくなりました。"],
  es: ["MFA tras cambiar de dispositivo", "Cambié de dispositivo y el código de verificación ya no funciona."],
  id: ["MFA setelah ganti perangkat", "Saya mengganti perangkat dan kode verifikasi tidak berfungsi lagi."],
  en: ["MFA after new device", "I replaced my device and the verification code no longer works."]
};

function ticketOf(id, subject, description) {
  return { id, customerName: "Probe Customer", subject, description, category: "General", status: "new", createdAt: NOW };
}

function commitPayload({ lang, item, expectedRevision, action, ids }) {
  return {
    candidate: {
      id: ids.candidate, organizationId: ORG, sourceTicketIds: [ids.ticket], proposedAction: action,
      proposedContent: { solution: NEW_LESSON_DRAFT.solution, customerResponseTemplate: item.customerResponseTemplate, internalGuidance: NEW_LESSON_DRAFT.solution },
      rationale: `TODO-058F ${lang}`, status: "proposed", createdAt: nextTime()
    },
    validation: {
      id: ids.validation, organizationId: ORG, candidateId: ids.candidate, knowledgeId: item.id,
      knowledgeVersionId: `${KI}-v1`, decision: "approved", actor: ACTOR.name,
      roleExercised: "knowledge_validator", rationale: `TODO-058F ${lang}`, timestamp: nextTime()
    },
    memoryChange: {
      id: ids.memory, organizationId: ORG, knowledgeId: item.id, candidateId: ids.candidate,
      validationRecordId: ids.validation, changeType: action, beforeState: null, afterState: item, timestamp: nextTime()
    },
    knowledgeItem: item,
    expectedKnowledgeRevision: expectedRevision
  };
}

/** Apply a new lesson exactly as production does (same merge function). */
function applyNewLesson(item, lessonId, sourceTicketId) {
  const lesson = {
    id: lessonId,
    rootCause: NEW_LESSON_DRAFT.rootCause,
    solution: NEW_LESSON_DRAFT.solution,
    customerResponse: normalizeReusableLessonTemplate(NEW_LESSON_DRAFT.customerResponse),
    signals: NEW_LESSON_DRAFT.signals,
    createdAt: nextTime(),
    sourceTicketId
  };
  const merged = mergeLessonIntoExisting(item.lessons ?? [], lesson, item.canonicalProblemId ?? item.id);
  return { ...item, lessons: merged.lessons };
}

async function matureSnapshot(prisma) {
  const rows = [];
  for (const id of MATURE) {
    rows.push({
      id,
      knowledge: await prisma.knowledgeItem.count({ where: { organizationId: id } }),
      validations: await prisma.validationRecord.count({ where: { organizationId: id } }),
      memory: await prisma.memoryChangeRecord.count({ where: { organizationId: id } }),
      evidence: await prisma.trustEvidence.count({ where: { organizationId: id } })
    });
  }
  return JSON.stringify(rows);
}

async function cleanup() {
  try {
    await service.deleteOrganization(ORG);
  } catch (error) {
    if (error?.code !== "ORGANIZATION_NOT_FOUND") throw error;
  }
}

async function main() {
  const prisma = getPrismaClient();
  const matureBefore = await matureSnapshot(prisma);
  const timings = [];
  let promotedLessonId = null;

  try {
    console.log("TODO-058F new multilingual lesson promotion probe\n");

    await service.upsertOrganizationProfile(profile());
    await service.saveKnowledge(ORG, [seedItem()]);
    const seeded = (await service.loadKnowledge(ORG)).find((item) => item.id === KI);
    assert.ok(seeded, "fixture knowledge must exist");
    assert.equal(seeded.lessons.length, 1, "fixture starts with exactly one (unrelated) lesson");
    console.log(`  fixture ${ORG} created (1 knowledge item, 1 seed lesson)\n`);

    /* ---------- Part C: promote a genuinely new lesson from a JAPANESE ticket ---------- */
    {
      const current = (await service.loadKnowledge(ORG)).find((item) => item.id === KI);
      const withNew = applyNewLesson(current, "todo058f-lesson-device-replacement", "todo058f-ticket-ja");
      promotedLessonId = withNew.lessons.find((lesson) => lesson.id !== SEED_LESSON)?.id ?? null;
      assert.ok(promotedLessonId, "a new lesson must have been merged in");
      const started = Date.now();
      const result = await service.commitValidation(ORG, commitPayload({
        lang: "ja", item: { ...withNew, trustScore: current.trustScore + 3 },
        expectedRevision: current.revision, action: "create_version",
        ids: { candidate: "c-promote", validation: "v-promote", memory: "m-promote", ticket: "todo058f-ticket-ja" }
      }), ACTOR);
      timings.push(Date.now() - started);
      assert.equal(result.replayed, false, "promotion must be a real write");
    }

    await check("C: exactly ONE new lesson was promoted", async () => {
      const items = await service.loadKnowledge(ORG);
      assert.equal(items.length, 1, "no second knowledge item");
      assert.equal(items[0].lessons.length, 2, `expected seed + promoted lesson, got ${items[0].lessons.length}`);
      const promoted = items[0].lessons.find((lesson) => lesson.id !== SEED_LESSON);
      assert.ok(promoted, "the promoted lesson must persist");
    });

    await check("C: the promoted lesson attaches to the correct canonical, with provenance", async () => {
      const items = await service.loadKnowledge(ORG);
      assert.equal(items[0].canonicalProblemId, KI, "canonical must be unchanged");
      const promoted = items[0].lessons.find((lesson) => lesson.id !== SEED_LESSON);
      assert.equal(promoted.sourceTicketId, "todo058f-ticket-ja", "provenance must reference the source ticket");
    });

    /* ---------- Part F: internal documentation language ---------- */
    await check("F: the promoted lesson is stored in the internal language, not the customer's", async () => {
      const items = await service.loadKnowledge(ORG);
      const promoted = items[0].lessons.find((lesson) => lesson.id !== SEED_LESSON);
      const text = `${promoted.rootCause} ${promoted.solution} ${promoted.customerResponse}`;
      assert.ok(!/[぀-ゟ゠-ヿ一-鿿]/u.test(text), `promoted lesson must contain no Japanese: ${text.slice(0, 80)}`);
      assert.ok(/authenticator/i.test(promoted.rootCause), "the authored English root cause must be preserved");
      assert.equal(promoted.solution, NEW_LESSON_DRAFT.solution, "the authored solution must be preserved verbatim");
    });

    /* ---------- Part D: other languages strengthen, never duplicate ---------- */
    const strengthenLangs = ["es", "id", "en"];
    const selected = {};
    for (const lang of strengthenLangs) {
      const [subject, description] = TICKETS[lang];
      const current = (await service.loadKnowledge(ORG)).find((item) => item.id === KI);
      const match = findMatchingLesson(ticketOf(`todo058f-${lang}`, subject, description), current);
      selected[lang] = match?.lesson?.id ?? null;
      const started = Date.now();
      await service.commitValidation(ORG, commitPayload({
        lang, item: { ...current, trustScore: current.trustScore + 5 },
        expectedRevision: current.revision, action: "trust_update_only",
        ids: { candidate: `c-${lang}`, validation: `v-${lang}`, memory: `m-${lang}`, ticket: `todo058f-ticket-${lang}` }
      }), ACTOR);
      timings.push(Date.now() - started);
    }

    await check("D: later languages selected the PROMOTED lesson, not a new one", () => {
      for (const lang of ["es", "id"]) {
        assert.equal(selected[lang], promotedLessonId, `${lang}: selected ${selected[lang]}`);
      }
    });

    await check("D: no second lesson was ever created", async () => {
      const items = await service.loadKnowledge(ORG);
      assert.equal(items.length, 1, "one knowledge item");
      assert.equal(items[0].lessons.length, 2, `expected exactly seed + promoted, got ${items[0].lessons.length}`);
      const ids = items[0].lessons.map((lesson) => lesson.id);
      assert.equal(new Set(ids).size, ids.length, "lesson ids must be unique");
    });

    /* ---------- Part E: database assertions ---------- */
    await check("E: validation, memory-change, and trust rows all target one item", async () => {
      const validations = await prisma.validationRecord.findMany({ where: { organizationId: ORG } });
      const changes = await prisma.memoryChangeRecord.findMany({ where: { organizationId: ORG } });
      const evidence = await prisma.trustEvidence.findMany({ where: { organizationId: ORG } });
      assert.equal(validations.length, 4, `expected 4 validations, got ${validations.length}`);
      assert.equal(changes.length, 4, `expected 4 memory changes, got ${changes.length}`);
      for (const row of [...validations, ...changes]) assert.equal(row.knowledgeItemId, KI, "must target the fixture item");
      for (const row of evidence) assert.equal(row.knowledgeItemId, KI, "trust evidence must not fork");
      const validationIds = new Set(validations.map((v) => v.id));
      for (const change of changes) assert.ok(validationIds.has(change.validationRecordId), "no orphan memory change");
    });

    await check("E: no lesson or canonical id is language-scoped", async () => {
      const items = await service.loadKnowledge(ORG);
      for (const id of [items[0].id, items[0].canonicalProblemId, ...items[0].lessons.map((l) => l.id)]) {
        assert.ok(!/[_-](?:en|es|ja|id|fr|de|pt|it|ko|zh)$/iu.test(String(id)), `${id} must not be language-scoped`);
      }
    });

    await check("E: version lineage is unique and did not fork per language", async () => {
      const items = await service.loadKnowledge(ORG);
      const versionIds = (items[0].knowledgeVersions ?? []).map((version) => version.versionId);
      assert.equal(new Set(versionIds).size, versionIds.length, "version ids must be unique");
    });

    /* ---------- Part G: transaction safety ---------- */
    await check("G: a failing promotion rolls back and leaves no partial lesson", async () => {
      const current = (await service.loadKnowledge(ORG)).find((item) => item.id === KI);
      const before = {
        lessons: current.lessons.length,
        validations: await prisma.validationRecord.count({ where: { organizationId: ORG } }),
        changes: await prisma.memoryChangeRecord.count({ where: { organizationId: ORG } }),
        trust: current.trustScore
      };
      const poisoned = applyNewLesson(current, "todo058f-lesson-should-not-persist", "todo058f-ticket-bad");
      let threw = false;
      try {
        await service.commitValidation(ORG, commitPayload({
          lang: "fr", item: { ...poisoned, trustScore: current.trustScore + 5 },
          expectedRevision: current.revision, action: "create_version",
          ids: { candidate: "c-bad", validation: "v-bad", memory: "m-promote", ticket: "todo058f-ticket-bad" }
        }), ACTOR);
      } catch {
        threw = true;
      }
      assert.ok(threw, "the poisoned promotion must fail");
      const after = (await service.loadKnowledge(ORG)).find((item) => item.id === KI);
      assert.equal(after.lessons.length, before.lessons, "no partial lesson may persist");
      assert.ok(!after.lessons.some((lesson) => lesson.id === "todo058f-lesson-should-not-persist"), "the rolled-back lesson must be absent");
      assert.equal(await prisma.validationRecord.count({ where: { organizationId: ORG } }), before.validations, "no orphan validation");
      assert.equal(await prisma.memoryChangeRecord.count({ where: { organizationId: ORG } }), before.changes, "no orphan memory change");
      assert.equal(after.trustScore, before.trust, "trust unchanged after rollback");
    });

    await check("G: retry after rollback succeeds and still leaves ONE promoted lesson", async () => {
      const current = (await service.loadKnowledge(ORG)).find((item) => item.id === KI);
      const result = await service.commitValidation(ORG, commitPayload({
        lang: "fr", item: { ...current, trustScore: current.trustScore + 5 },
        expectedRevision: current.revision, action: "trust_update_only",
        ids: { candidate: "c-retry", validation: "v-retry", memory: "m-retry", ticket: "todo058f-ticket-retry" }
      }), ACTOR);
      assert.equal(result.replayed, false, "retry must be a real write");
      const items = await service.loadKnowledge(ORG);
      assert.equal(items[0].lessons.length, 2, "still exactly seed + promoted");
    });

    await check("G: replaying the promotion commit is idempotent", async () => {
      const current = (await service.loadKnowledge(ORG)).find((item) => item.id === KI);
      const before = await prisma.validationRecord.count({ where: { organizationId: ORG } });
      const replay = await service.commitValidation(ORG, commitPayload({
        lang: "ja", item: current, expectedRevision: current.revision, action: "create_version",
        ids: { candidate: "c-promote", validation: "v-promote", memory: "m-promote", ticket: "todo058f-ticket-ja" }
      }), ACTOR);
      assert.equal(replay.replayed, true, "a repeated validation id must replay");
      assert.equal(await prisma.validationRecord.count({ where: { organizationId: ORG } }), before, "replay must not add rows");
      const items = await service.loadKnowledge(ORG);
      assert.equal(items[0].lessons.length, 2, "replay must not duplicate the promoted lesson");
    });

    const avg = timings.reduce((sum, value) => sum + value, 0) / timings.length;
    console.log(`\n  promotion/strengthening timing: avg ${avg.toFixed(1)}ms, worst ${Math.max(...timings)}ms over ${timings.length} commits`);
  } finally {
    await cleanup();
    const remaining = await prisma.organization.count({ where: { id: ORG } });
    const matureAfter = await matureSnapshot(prisma);
    console.log("");
    await check("B: the fixture organization was fully removed", () => {
      assert.equal(remaining, 0, "fixture organization must be deleted");
    });
    await check("J: mature organizations are byte-identical", () => {
      assert.equal(matureAfter, matureBefore, "no mature organization row may change");
    });
  }

  console.log("");
  if (failures.length > 0) {
    console.error(`TODO-058F probe FAILED (${failures.length}):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("TODO-058F probe passed: a new lesson is promoted once and strengthened across languages.");
  }
}

main().catch(async (error) => {
  console.error("TODO-058F probe ERROR:", error.message);
  try { await cleanup(); } catch { /* best effort */ }
  process.exitCode = 1;
});
