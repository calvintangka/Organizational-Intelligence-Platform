/*
 * TODO-058E — persisted multilingual organizational learning.
 *
 * Drives the REAL commitValidation transaction against a DISPOSABLE organization
 * to prove the database agrees with the decision layer: equivalent validated
 * tickets in different languages strengthen ONE Organizational Memory, with no
 * duplicate lesson, knowledge item, or canonical.
 *
 * Mature organizations are never referenced. The fixture organization is deleted
 * in a finally block, so cleanup runs after success AND failure.
 */
const assert = require("node:assert/strict");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

const service = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { getPrismaClient } = require(path.join(root, "lib", "server", "prisma.ts"));
const { withCanonicalProblemDefaults } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { findMatchingLesson } = require(path.join(root, "lib", "drafting.ts"));
const { generateReflection } = require(path.join(root, "lib", "reflection.ts"));

const ORG = `test-oip-058e-${Date.now()}`;
const ACTOR = { id: "todo058e-actor", name: "TODO-058E Probe" };
const MATURE = ["profile-oip-developer-demo", "profile-maesa-tech", "profile-fastdrop-logistics", "test-oip-regression"];
const NOW = "2026-07-29T00:00:00.000Z";
// The knowledge item is persisted under its CANONICAL id (withCanonicalProblemDefaults
// rewrites the item id), so the fixture uses one id for both.
const KI = "todo058e-canonical-login";
const LESSON = "todo058e-lesson-password-reset";
const CANON = KI;

let clock = Date.parse("2026-07-29T12:00:00.000Z");
const nextTime = () => new Date((clock += 1000)).toISOString();

const failures = [];
function check(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`  PASS  ${label}`))
    .catch((error) => {
      failures.push(`${label}: ${error.message}`);
      console.log(`  FAIL  ${label} -- ${error.message}`);
    });
}

function profile() {
  return {
    id: ORG, name: "TODO-058E Fixture", industry: "Software / SaaS", description: "Disposable TODO-058E org.",
    products: ["workspace"], services: [], supportedDomains: ["access"], businessVocabulary: ["workspace"],
    supportedIssueTypes: ["access"], outOfScopeTopics: [], customerTone: "professional", supportBoundaries: [],
    autoResolutionThreshold: 80, escalationRules: [], logoInitials: "5E", createdAt: NOW, updatedAt: NOW,
    // Internal documentation language is English; replies follow the customer.
    languagePolicy: { organizationLanguage: "en", responseMode: "customer_language", internalLanguage: "en", minimumDetectionConfidence: 0.6 }
  };
}

/** One knowledge item with ONE English-authored lesson. */
function seedItem() {
  return withCanonicalProblemDefaults({
    id: KI, organizationId: ORG, title: "Password rejected at sign-in", category: "Login",
    canonicalProblemId: CANON, canonicalProblemTitle: "Login Issue",
    problem: "Password rejected at sign-in", problemSummary: "Password rejected at sign-in",
    approvedAnswer: "We reset the password and cleared cached credentials.",
    customerResponseTemplate: "We reset the password and cleared cached credentials.",
    tags: ["login"], sourceTicketId: "todo058e-seed-ticket", trustScore: 40, createdAt: NOW, approvedAt: NOW,
    lessons: [{
      id: LESSON, rootCause: "Cached credentials survived a password rotation.",
      solution: "Reset the password and clear cached credentials.",
      customerResponse: "We reset your password and cleared cached credentials.",
      signals: ["password is rejected", "login failure"], createdAt: NOW, sourceTicketId: "todo058e-seed-ticket"
    }],
    knowledgeVersions: [{ versionId: `${KI}-v1`, version: 1, createdAt: NOW, changeReason: "seed", sourceTicketId: "todo058e-seed-ticket", summary: "v1" }]
  });
}

function ticketOf(id, subject, description) {
  return { id, customerName: "Probe Customer", subject, description, category: "General", status: "new", createdAt: NOW };
}

/** Equivalent tickets: one problem, four languages. */
const TICKETS = {
  en: ["I cannot log in", "My password is rejected when I try to sign in to the workspace."],
  es: ["No puedo iniciar sesión", "Mi contraseña es rechazada cada vez que intento iniciar sesión en el espacio de trabajo."],
  ja: ["ログインできません", "ワークスペースにサインインしようとするとパスワードが拒否されます。"],
  id: ["Tidak bisa masuk", "Kata sandi saya ditolak setiap kali saya mencoba masuk ke ruang kerja."]
};

function commitPayload({ lang, item, expectedRevision, ids }) {
  return {
    candidate: {
      id: ids.candidate, organizationId: ORG, sourceTicketIds: [ids.ticket],
      proposedAction: "trust_update_only",
      proposedContent: { solution: "Reset the password and clear cached credentials.", customerResponseTemplate: item.customerResponseTemplate, internalGuidance: "Reset and clear cache." },
      rationale: `TODO-058E ${lang}`, status: "proposed", createdAt: nextTime()
    },
    validation: {
      id: ids.validation, organizationId: ORG, candidateId: ids.candidate, knowledgeId: item.id,
      knowledgeVersionId: `${KI}-v1`, decision: "approved", actor: ACTOR.name,
      roleExercised: "knowledge_validator", rationale: `TODO-058E ${lang}`, timestamp: nextTime()
    },
    memoryChange: {
      id: ids.memory, organizationId: ORG, knowledgeId: item.id, candidateId: ids.candidate,
      validationRecordId: ids.validation, changeType: "trust_update_only", beforeState: null,
      afterState: item, timestamp: nextTime()
    },
    knowledgeItem: item,
    expectedKnowledgeRevision: expectedRevision
  };
}

async function matureSnapshot(prisma) {
  const rows = [];
  for (const id of MATURE) {
    rows.push({
      id,
      knowledge: await prisma.knowledgeItem.count({ where: { organizationId: id } }),
      tickets: await prisma.ticketRecord.count({ where: { organizationId: id } }),
      validations: await prisma.validationRecord.count({ where: { organizationId: id } }),
      memory: await prisma.memoryChangeRecord.count({ where: { organizationId: id } }),
      evidence: await prisma.trustEvidence.count({ where: { organizationId: id } }),
      patterns: await prisma.emergingPattern.count({ where: { organizationId: id } })
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

  try {
    console.log("TODO-058E persisted multilingual learning probe\n");

    /* ---------- Part B: disposable fixture ---------- */
    await service.upsertOrganizationProfile(profile());
    await service.saveKnowledge(ORG, [seedItem()]);
    const seeded = (await service.loadKnowledge(ORG)).find((item) => item.id === KI);
    assert.ok(seeded, "fixture knowledge must exist");
    assert.equal(seeded.lessons.length, 1, "fixture starts with exactly one lesson");
    console.log(`  fixture organization ${ORG} created (1 knowledge item, 1 lesson)\n`);

    /* ---------- Part C: existing-lesson strengthening in four languages ---------- */
    const langs = ["en", "es", "ja", "id"];
    const selectedLessons = {};
    const reflectionActions = {};

    for (const lang of langs) {
      const [subject, description] = TICKETS[lang];
      const ticket = ticketOf(`todo058e-${lang}`, subject, description);
      const current = (await service.loadKnowledge(ORG)).find((item) => item.id === KI);

      // Real production selection + reflection.
      const match = findMatchingLesson(ticket, current);
      selectedLessons[lang] = match?.lesson?.id ?? null;
      const reflection = generateReflection(
        { category: "Login", tags: [], detectedSignals: [], intent: "login_failure" },
        current.customerResponseTemplate,
        { item: current, similarity: 92 },
        undefined,
        { responseLanguage: lang, internalLanguage: "en" }
      );
      reflectionActions[lang] = reflection.action;

      const started = Date.now();
      const result = await service.commitValidation(ORG, commitPayload({
        lang,
        item: { ...current, trustScore: current.trustScore + 5 },
        expectedRevision: current.revision,
        ids: { candidate: `c-${lang}`, validation: `v-${lang}`, memory: `m-${lang}`, ticket: `todo058e-ticket-${lang}` }
      }), ACTOR);
      timings.push(Date.now() - started);
      assert.equal(result.replayed, false, `${lang}: first commit must not be a replay`);
    }

    await check("C: every language selected the SAME persisted lesson", () => {
      for (const lang of langs) {
        assert.equal(selectedLessons[lang], LESSON, `${lang}: selected ${selectedLessons[lang]}`);
      }
    });

    await check("C: every language produced the same reflection action", () => {
      for (const lang of langs) {
        assert.equal(reflectionActions[lang], "trust_update_only", `${lang}: ${reflectionActions[lang]}`);
      }
    });

    /* ---------- Part E: database assertions ---------- */
    await check("E: exactly ONE knowledge item and ONE lesson persist", async () => {
      const items = await service.loadKnowledge(ORG);
      assert.equal(items.length, 1, `expected one knowledge item, got ${items.length}`);
      assert.equal(items[0].id, KI, "the same knowledge item must be updated");
      assert.equal(items[0].lessons.length, 1, `expected one lesson, got ${items[0].lessons.length}`);
      assert.equal(items[0].lessons[0].id, LESSON, "the lesson identity must be unchanged");
    });

    await check("E: one validation row per language, all on the same knowledge item", async () => {
      const validations = await prisma.validationRecord.findMany({ where: { organizationId: ORG } });
      assert.equal(validations.length, langs.length, `expected ${langs.length} validations, got ${validations.length}`);
      for (const validation of validations) {
        assert.equal(validation.knowledgeItemId, KI, "every validation must target the same knowledge item");
      }
    });

    await check("E: one memory-change row per language, no orphans", async () => {
      const changes = await prisma.memoryChangeRecord.findMany({ where: { organizationId: ORG } });
      assert.equal(changes.length, langs.length, `expected ${langs.length} memory changes, got ${changes.length}`);
      const validationIds = new Set((await prisma.validationRecord.findMany({ where: { organizationId: ORG } })).map((v) => v.id));
      for (const change of changes) {
        assert.equal(change.knowledgeItemId, KI, "memory change must reference the same knowledge item");
        assert.ok(validationIds.has(change.validationRecordId), "memory change must reference a real validation row");
      }
    });

    await check("E: trust evidence accrues to one knowledge item across languages", async () => {
      const evidence = await prisma.trustEvidence.findMany({ where: { organizationId: ORG } });
      for (const row of evidence) {
        assert.equal(row.knowledgeItemId, KI, "trust evidence must attach to the same knowledge item");
      }
      const distinctItems = new Set(evidence.map((row) => row.knowledgeItemId));
      assert.ok(distinctItems.size <= 1, `trust evidence must not fork by language: ${JSON.stringify([...distinctItems])}`);
    });

    await check("E: no language-scoped ids were created anywhere", async () => {
      const items = await service.loadKnowledge(ORG);
      const ids = [
        ...items.map((item) => item.id),
        ...items.flatMap((item) => item.lessons.map((lesson) => lesson.id)),
        ...items.map((item) => item.canonicalProblemId)
      ];
      for (const id of ids) {
        assert.ok(!/[_-](?:en|es|ja|id|fr|de|pt|it|ko|zh)$/iu.test(String(id)), `${id} must not be language-scoped`);
      }
    });

    await check("E: version lineage did not fork per language", async () => {
      const items = await service.loadKnowledge(ORG);
      const versions = items[0].knowledgeVersions ?? [];
      const versionIds = versions.map((version) => version.versionId);
      assert.equal(new Set(versionIds).size, versionIds.length, "version ids must be unique");
      assert.ok(versions.length <= langs.length + 1, `version lineage grew unexpectedly: ${versions.length}`);
    });

    /* ---------- Part J: idempotent retry ---------- */
    await check("J: replaying an identical commit is idempotent", async () => {
      const current = (await service.loadKnowledge(ORG)).find((item) => item.id === KI);
      const before = {
        validations: await prisma.validationRecord.count({ where: { organizationId: ORG } }),
        memory: await prisma.memoryChangeRecord.count({ where: { organizationId: ORG } }),
        trust: current.trustScore
      };
      const replay = await service.commitValidation(ORG, commitPayload({
        lang: "es", item: current, expectedRevision: current.revision,
        ids: { candidate: "c-es", validation: "v-es", memory: "m-es", ticket: "todo058e-ticket-es" }
      }), ACTOR);
      assert.equal(replay.replayed, true, "a repeated validation id must be reported as a replay");
      const after = (await service.loadKnowledge(ORG)).find((item) => item.id === KI);
      assert.equal(await prisma.validationRecord.count({ where: { organizationId: ORG } }), before.validations, "replay must not add a validation row");
      assert.equal(await prisma.memoryChangeRecord.count({ where: { organizationId: ORG } }), before.memory, "replay must not add a memory-change row");
      assert.equal(after.trustScore, before.trust, "replay must not apply trust twice");
    });

    /* ---------- Part F: transaction safety ---------- */
    await check("F: a failing commit rolls back completely, leaving no partial state", async () => {
      const current = (await service.loadKnowledge(ORG)).find((item) => item.id === KI);
      const before = {
        validations: await prisma.validationRecord.count({ where: { organizationId: ORG } }),
        memory: await prisma.memoryChangeRecord.count({ where: { organizationId: ORG } }),
        evidence: await prisma.trustEvidence.count({ where: { organizationId: ORG } }),
        trust: current.trustScore,
        revision: current.revision
      };
      // Poison the transaction: reuse an EXISTING memory-change id under a NEW
      // validation id, so the insert violates the primary key mid-transaction.
      let threw = false;
      try {
        await service.commitValidation(ORG, commitPayload({
          lang: "fr", item: { ...current, trustScore: current.trustScore + 5 },
          expectedRevision: current.revision,
          ids: { candidate: "c-fr", validation: "v-fr-new", memory: "m-en", ticket: "todo058e-ticket-fr" }
        }), ACTOR);
      } catch {
        threw = true;
      }
      assert.ok(threw, "the poisoned commit must fail");
      const after = (await service.loadKnowledge(ORG)).find((item) => item.id === KI);
      assert.equal(await prisma.validationRecord.count({ where: { organizationId: ORG } }), before.validations, "no validation row may survive a rolled-back commit");
      assert.equal(await prisma.memoryChangeRecord.count({ where: { organizationId: ORG } }), before.memory, "no memory-change row may survive");
      assert.equal(await prisma.trustEvidence.count({ where: { organizationId: ORG } }), before.evidence, "no trust evidence may survive");
      assert.equal(after.trustScore, before.trust, "trust must be unchanged after rollback");
      assert.equal(after.revision, before.revision, "revision must be unchanged after rollback");
      assert.equal((await prisma.knowledgeCandidate.findMany({ where: { organizationId: ORG, id: "c-fr" } })).length, 0, "no orphan candidate may survive");
    });

    await check("F: a legitimate commit still succeeds after a rolled-back failure", async () => {
      const current = (await service.loadKnowledge(ORG)).find((item) => item.id === KI);
      const result = await service.commitValidation(ORG, commitPayload({
        lang: "fr", item: { ...current, trustScore: current.trustScore + 5 },
        expectedRevision: current.revision,
        ids: { candidate: "c-fr2", validation: "v-fr2", memory: "m-fr2", ticket: "todo058e-ticket-fr" }
      }), ACTOR);
      assert.equal(result.replayed, false, "recovery commit must be a real write");
      const items = await service.loadKnowledge(ORG);
      assert.equal(items.length, 1, "recovery must not create a second knowledge item");
      assert.equal(items[0].lessons.length, 1, "recovery must not create a second lesson");
    });

    /* ---------- Part G/H: deduplication and provenance ---------- */
    await check("G: five commits across five languages left ONE lesson and ONE canonical", async () => {
      const items = await service.loadKnowledge(ORG);
      assert.equal(items.length, 1, "one knowledge item");
      assert.equal(items[0].lessons.length, 1, "one lesson");
      assert.equal(items[0].canonicalProblemId, CANON, "one canonical");
      const validations = await prisma.validationRecord.count({ where: { organizationId: ORG } });
      assert.equal(validations, 5, `expected 5 validation rows (en/es/ja/id/fr), got ${validations}`);
    });

    await check("H: provenance survives and does not become language-scoped", async () => {
      const items = await service.loadKnowledge(ORG);
      assert.equal(items[0].provenance?.sourceTicketId ?? items[0].sourceTicketId, "todo058e-seed-ticket",
        "the original provenance ticket must be preserved");
      assert.equal(items[0].lessons[0].sourceTicketId, "todo058e-seed-ticket", "lesson provenance must be preserved");
    });

    /* ---------- Part I: performance ---------- */
    const avg = timings.reduce((sum, value) => sum + value, 0) / timings.length;
    console.log(`\n  commit transaction timing: avg ${avg.toFixed(1)}ms, worst ${Math.max(...timings)}ms over ${timings.length} commits`);
  } finally {
    await cleanup();
    const remaining = await prisma.organization.count({ where: { id: ORG } });
    const matureAfter = await matureSnapshot(prisma);
    console.log("");
    await check("B: the fixture organization was fully removed", () => {
      assert.equal(remaining, 0, "fixture organization must be deleted");
    });
    await check("L: mature organizations are byte-identical", () => {
      assert.equal(matureAfter, matureBefore, "no mature organization row may change");
    });
  }

  console.log("");
  if (failures.length > 0) {
    console.error(`TODO-058E probe FAILED (${failures.length}):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("TODO-058E probe passed: the database agrees — one persisted memory across languages.");
  }
}

main().catch(async (error) => {
  console.error("TODO-058E probe ERROR:", error.message);
  try { await cleanup(); } catch { /* cleanup is best-effort on hard failure */ }
  process.exitCode = 1;
});
