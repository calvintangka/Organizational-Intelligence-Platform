/*
 * TODO-014 focused mature Organizational Memory lifecycle QA probe.
 *
 * Drives the REAL server persistence transaction (service.commitValidation) and
 * the REAL lifecycle libraries (lib/reflection, lib/trustEngine,
 * lib/canonicalProblemEngine) against the dedicated regression organization
 * (test-oip-regression) ONLY. Mature Maesa/FastDrop/Pramana data is snapshot-
 * compared before/after to prove it is untouched. Every record this probe
 * creates is prefixed `todo014-` and deleted at the end; final counts must
 * return to the captured baseline.
 *
 * It exercises, end to end:
 *   Phase 1  human-edited generic template -> create_version (durable human
 *            content, new KnowledgeVersion, revision bump, trust unchanged)
 *   Phase 2  genuinely new lesson (no template change) -> no spurious version
 *   Phase 3  reinforcement (trust_update_only) vs new-knowledge distinction
 *   Phase 4  fresh PostgreSQL reload durability (no browser state)
 *   Phase 5  same sourceTicket / NEW candidate -> repeat trust (risk probe)
 *   Phase 6  duplicate lesson content with a new id (dedup observation)
 *   + provenance / actorId attribution / spoof-rejection / org isolation
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(root, ".env.local") });
require("dotenv").config({ path: path.join(root, ".env") });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not configured; the TODO-014 lifecycle probe cannot run.");
  process.exit(1);
}

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveProjectAlias(request, parent, isMain, options) {
  if (request === "server-only") return path.join(__dirname, "stubs", "server-only.cjs");
  if (request.startsWith("@/")) {
    const mapped = path.join(root, request.slice(2));
    if (fs.existsSync(`${mapped}.ts`)) return `${mapped}.ts`;
    if (fs.existsSync(`${mapped}.tsx`)) return `${mapped}.tsx`;
    if (fs.existsSync(path.join(mapped, "index.ts"))) return path.join(mapped, "index.ts");
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
for (const extension of [".ts", ".tsx"]) {
  require.extensions[extension] = function transpileTypeScript(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: filename
    });
    module._compile(output.outputText.replace(/import\.meta\.url/g, "require('node:url').pathToFileURL(__filename).href"), filename);
  };
}

const service = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { getPrismaClient } = require(path.join(root, "lib", "server", "prisma.ts"));
const { generateReflection } = require(path.join(root, "lib", "reflection.ts"));
const { recordResolution, TRUST_INITIAL } = require(path.join(root, "lib", "trustEngine.ts"));
const { withCanonicalProblemDefaults, normalizeReusableLessonTemplate } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));

const ORG = "test-oip-regression";
const MATURE = ["profile-maesa-tech", "profile-fastdrop-logistics", "profile-pramana-legal"];
const TARGET = "todo014-target";
// Trusted server-resolved actor (TODO-007). The payload actor below is a spoof
// that the server must ignore.
const ACTOR = { id: "todo014-actor-user", name: "TODO-014 Lifecycle Validator" };
const SPOOF_ACTOR_NAME = "Prototype Knowledge Validator";

// Deterministic monotonically-increasing timestamps.
let clock = Date.parse("2026-07-17T12:00:00.000Z");
function nextTime() { clock += 1000; return new Date(clock).toISOString(); }

function regressionProfile() {
  const NOW = "2026-07-15T00:00:00.000Z";
  return {
    id: ORG, name: "OIP Regression Test", industry: "Software / SaaS",
    description: "Dedicated deterministic organization for OIP regression testing.",
    products: ["OIP regression fixture"], services: ["regression testing"],
    supportedDomains: ["access", "billing", "technical support"],
    businessVocabulary: ["regression fixture", "known test state"],
    supportedIssueTypes: ["access", "billing", "technical support"],
    outOfScopeTopics: [], customerTone: "professional",
    supportBoundaries: ["This organization is for testing only."],
    autoResolutionThreshold: 80, escalationRules: ["Escalate failed regression scenarios."],
    logoInitials: "OR", createdAt: NOW, updatedAt: NOW
  };
}

function latestVersionId(item) {
  const versions = item.knowledgeVersions ?? [];
  return versions.length > 0 ? versions[versions.length - 1].versionId : undefined;
}

/** Build + commit one validation transaction exactly like the client commit path. */
async function commit({ suffix, action, sourceTicketId, beforeState, afterState, expectedRevision }) {
  const timestamp = nextTime();
  const candidateId = `todo014-candidate-${suffix}`;
  const validationId = `todo014-validation-${suffix}`;
  const memoryId = `todo014-memory-${suffix}`;
  const item = { ...afterState, organizationId: ORG, revision: (expectedRevision ?? 0) + 1 };
  const payload = {
    candidate: {
      id: candidateId, organizationId: ORG, sourceTicketIds: [sourceTicketId],
      proposedAction: action,
      proposedContent: { solution: "todo014", customerResponseTemplate: item.customerResponseTemplate, internalGuidance: "todo014" },
      rationale: `TODO-014 ${action}`, status: "proposed", createdAt: timestamp
    },
    validation: {
      id: validationId, organizationId: ORG, candidateId, knowledgeId: item.id,
      knowledgeVersionId: latestVersionId(item),
      decision: "approved",
      // Spoofed attribution: the server MUST override this with the trusted actor.
      actor: SPOOF_ACTOR_NAME, actorId: "spoofed-actor-id",
      roleExercised: "knowledge_validator", rationale: `TODO-014 ${action}`, timestamp
    },
    memoryChange: {
      id: memoryId, organizationId: ORG, knowledgeId: item.id, candidateId,
      validationRecordId: validationId, actorId: "spoofed-actor-id",
      changeType: action, beforeState: beforeState ?? null, afterState: item, timestamp
    },
    knowledgeItem: item,
    expectedKnowledgeRevision: expectedRevision
  };
  const res = await service.commitValidation(ORG, payload, ACTOR);
  return { res, candidateId, validationId, memoryId };
}

async function reload() {
  const items = await service.loadKnowledge(ORG);
  return items.find((i) => i.id === TARGET);
}

async function counts(prisma, organizationId) {
  const out = {};
  for (const m of ["knowledgeItem", "knowledgeCandidate", "validationRecord", "memoryChangeRecord", "ticketRecord"]) {
    out[m] = await prisma[m].count({ where: { organizationId } });
  }
  return out;
}

async function matureSnapshot(prisma) {
  const snap = {};
  for (const id of MATURE) {
    const rows = await prisma.knowledgeItem.findMany({
      where: { organizationId: id },
      select: { id: true, trustScore: true, revision: true, content: true },
      orderBy: { id: "asc" }
    });
    const c = await counts(prisma, id);
    snap[id] = crypto.createHash("sha256").update(JSON.stringify({ rows, c })).digest("hex");
  }
  return snap;
}

async function main() {
  const prisma = getPrismaClient();
  const report = {};

  // ---- Phase 0: controlled baseline via supported service primitives ----
  // Idempotent: reuse the existing regression org if present (re-sending the
  // fixed-timestamp profile would be correctly rejected by the stale-profile
  // overwrite protection). Only create the profile when the org is absent.
  let orgExists = true;
  try { await service.getOrganizationProfile(ORG); }
  catch (error) { if (error?.code === "ORGANIZATION_NOT_FOUND") orgExists = false; else throw error; }
  if (!orgExists) await service.upsertOrganizationProfiles([regressionProfile()]);
  await service.resetOrganizationData(ORG);
  const baselineCounts = await counts(prisma, ORG);
  assert.deepEqual(baselineCounts, { knowledgeItem: 0, knowledgeCandidate: 0, validationRecord: 0, memoryChangeRecord: 0, ticketRecord: 0 }, "baseline must be clean");
  const matureBefore = await matureSnapshot(prisma);
  const profile = await service.getOrganizationProfile(ORG);

  // ---- Baseline KnowledgeItem (create_new) ----
  const T0 = "Hello, please reply with your invoice number, the billed amount you expected to see, and a short note describing what looks wrong so our billing team can review the specific charge line by line.";
  const baseLessonId = "todo014-lesson-base";
  const baseItem = withCanonicalProblemDefaults({
    id: TARGET, organizationId: ORG, title: "Billing charge dispute", category: "Billing",
    canonicalProblemId: TARGET, canonicalProblemTitle: "Billing charge dispute",
    problem: "Customer disputes a charge on the billing account.",
    problemSummary: "Customer disputes a charge on the billing account.",
    approvedAnswer: T0, customerResponseTemplate: T0, internalGuidance: "Check the charge before advising.",
    tags: ["billing", "charge"], sourceTicketId: "todo014-ticket-0001",
    trustScore: TRUST_INITIAL, timesReused: 0, createdAt: nextTime(), approvedAt: nextTime(),
    lessons: [{ id: baseLessonId, rootCause: "Duplicate charge from a retried authorization", solution: "Confirm the two charge dates and refund the duplicate.", customerResponse: "Hi {{customerName}}, we will review the duplicate charge.", signals: ["charged twice", "duplicate charge"], createdAt: nextTime(), sourceTicketId: "todo014-ticket-0001" }],
    knowledgeVersions: [{ versionId: `${TARGET}-v1`, version: 1, createdAt: nextTime(), changeReason: "Initial", sourceTicketId: "todo014-ticket-0001", summary: "v1: initial" }],
    provenance: { sourceTicketId: "todo014-ticket-0001", contributingTicketIds: ["todo014-ticket-0001"], createdBy: "oip_prototype", createdAt: nextTime(), validatedBy: SPOOF_ACTOR_NAME, validatedAt: nextTime(), validationBasis: "seed", validationScope: "Prototype create_new validation" }
  });
  const created = await commit({ suffix: "base", action: "create_new", sourceTicketId: "todo014-ticket-0001", beforeState: null, afterState: baseItem, expectedRevision: null });
  assert.equal(created.res.replayed, false);
  assert.equal(created.res.knowledgeRevision, 1, "baseline revision must be 1");
  let current = await reload();
  report.baseline = { revision: current.revision, trustScore: current.trustScore, versions: current.knowledgeVersions.length, lessons: current.lessons.map((l) => l.id), template: current.customerResponseTemplate };
  assert.equal(current.trustScore, TRUST_INITIAL);
  assert.equal(current.knowledgeVersions.length, 1);

  // ============ PHASE 1: human-edited generic template -> create_version ============
  const R1 = "To progress this matter we now require a screenshot of the failed transaction, the final four digits of the payment card, and the exact date-time displayed inside your mobile banking application before any escalation proceeds.";
  const p1Reflection = generateReflection({ category: "Billing" }, R1, { item: current, similarity: 85, reason: "high canonical similarity" });
  assert.equal(p1Reflection.action, "create_version", "P1: meaningful generic-template edit must route to create_version");
  const p1Versions = [...(current.knowledgeVersions ?? []), { versionId: `${TARGET}-v2`, version: 2, createdAt: nextTime(), changeReason: p1Reflection.versionReason ?? "Human review improved response", sourceTicketId: "todo014-ticket-0002", summary: "v2: Updated customer response template" }];
  const p1After = { ...current, customerResponseTemplate: R1, approvedAnswer: R1, knowledgeVersions: p1Versions, exampleTickets: [...(current.exampleTickets ?? []), { ticketId: "todo014-ticket-0002", customerName: "Probe", originalIssue: "edit", createdAt: nextTime(), resolutionMode: "human" }], timesSeen: (current.timesSeen ?? 0) + 1, humanReviewCount: (current.humanReviewCount ?? 0) + 1, lastUpdated: nextTime(), provenance: { ...current.provenance, validatedBy: SPOOF_ACTOR_NAME } };
  const p1 = await commit({ suffix: "p1", action: "create_version", sourceTicketId: "todo014-ticket-0002", beforeState: current, afterState: p1After, expectedRevision: current.revision });
  assert.equal(p1.res.knowledgeRevision, 2, "P1: revision must bump to 2");
  const afterP1 = await reload();
  assert.equal(afterP1.customerResponseTemplate, R1, "P1: HUMAN-approved content must be durable");
  assert.notEqual(afterP1.customerResponseTemplate, T0, "P1: original pre-edit template must not remain");
  assert.equal(afterP1.knowledgeVersions.length, 2, "P1: exactly one new version");
  assert.ok(afterP1.knowledgeVersions.some((v) => v.versionId === `${TARGET}-v1`), "P1: previous version preserved");
  assert.ok(afterP1.knowledgeVersions.some((v) => v.versionId === `${TARGET}-v2`), "P1: new version present");
  assert.equal(afterP1.trustScore, TRUST_INITIAL, "P1: create_version does not change trust in the current lifecycle");
  // Provenance + actor attribution (authoritative identity is actorId).
  const p1Validation = await prisma.validationRecord.findUnique({ where: { id: p1.validationId } });
  const p1Memory = await prisma.memoryChangeRecord.findUnique({ where: { id: p1.memoryId } });
  assert.equal(p1Validation.actorId, ACTOR.id, "P1: ValidationRecord.actorId must be the trusted actor");
  assert.equal(p1Validation.actor, ACTOR.name, "P1: ValidationRecord.actor must be the trusted actor name");
  assert.notEqual(p1Validation.actorId, "spoofed-actor-id", "P1: client actorId spoof must be ignored");
  assert.equal(p1Memory.actorId, ACTOR.id, "P1: MemoryChangeRecord.actorId must be the trusted actor");
  assert.equal(p1Memory.organizationId, ORG);
  assert.equal(p1Memory.beforeState.customerResponseTemplate, T0, "P1: beforeState captures the prior template");
  assert.equal(p1Memory.afterState.customerResponseTemplate, R1, "P1: afterState captures the human-approved template");
  assert.ok(p1Memory.timestamp, "P1: memory change timestamp present");
  const displayProvenanceGap = afterP1.provenance?.validatedBy === SPOOF_ACTOR_NAME;
  report.phase1 = { revision: afterP1.revision, versions: afterP1.knowledgeVersions.map((v) => v.versionId), templatePersisted: afterP1.customerResponseTemplate === R1, trust: afterP1.trustScore, validationActorId: p1Validation.actorId, memoryActorId: p1Memory.actorId, displayProvenanceValidatedBy: afterP1.provenance?.validatedBy, displayProvenanceGap };

  // ============ PHASE 2: genuinely new lesson, NO template change ============
  const newLessonId = "todo014-lesson-refund";
  const p2After = { ...afterP1, lessons: [...afterP1.lessons, { id: newLessonId, rootCause: "Refund requested for the unused portion of the term", solution: "Collect the cancellation date and prorate the refund.", customerResponse: normalizeReusableLessonTemplate("Hi {{customerName}}, we will prorate your refund for the unused period."), signals: ["refund", "unused months"], createdAt: nextTime(), sourceTicketId: "todo014-ticket-0003" }], timesSeen: (afterP1.timesSeen ?? 0) + 1, lastUpdated: nextTime() };
  const p2 = await commit({ suffix: "p2", action: "merge_existing", sourceTicketId: "todo014-ticket-0003", beforeState: afterP1, afterState: p2After, expectedRevision: afterP1.revision });
  assert.equal(p2.res.knowledgeRevision, 3, "P2: revision must bump to 3");
  const afterP2 = await reload();
  assert.equal(afterP2.lessons.length, 2, "P2: new lesson added");
  assert.ok(afterP2.lessons.some((l) => l.id === baseLessonId), "P2: existing lesson id preserved");
  assert.ok(afterP2.lessons.some((l) => l.id === newLessonId), "P2: new lesson has its own id");
  const baseLessonAfterP2 = afterP2.lessons.find((l) => l.id === baseLessonId);
  assert.equal(baseLessonAfterP2.rootCause, "Duplicate charge from a retried authorization", "P2: existing lesson content not overwritten");
  assert.equal(afterP2.knowledgeVersions.length, 2, "P2: adding a lesson must NOT create a KnowledgeVersion");
  assert.equal(afterP2.customerResponseTemplate, R1, "P2: generic template unchanged by a lesson addition");
  assert.equal(afterP2.trustScore, TRUST_INITIAL, "P2: lesson addition does not change trust in this path");
  report.phase2 = { revision: afterP2.revision, lessons: afterP2.lessons.map((l) => l.id), versions: afterP2.knowledgeVersions.length, trust: afterP2.trustScore };

  // ============ PHASE 3: reinforcement (trust_update_only) vs new knowledge ============
  const reinforceReflection = generateReflection({ category: "Billing" }, afterP2.customerResponseTemplate, { item: afterP2, similarity: 85, reason: "same solution" });
  assert.equal(reinforceReflection.action, "trust_update_only", "P3: strong agreement must be recognized as reinforcement");
  const newKnowledgeReflection = generateReflection({ category: "Billing" }, "completely unrelated wording zzz alpha bravo charlie delta echo foxtrot", { item: afterP2, similarity: 85, reason: "divergent" });
  assert.notEqual(newKnowledgeReflection.action, "trust_update_only", "P3: meaningfully new content must NOT be treated as reinforcement");
  const reinforce = recordResolution(afterP2, { mode: "human", success: true, at: nextTime() }, profile, []);
  const trustBeforeP3 = afterP2.trustScore;
  const p3After = reinforce.item;
  const p3 = await commit({ suffix: "p3", action: "trust_update_only", sourceTicketId: "todo014-ticket-0004", beforeState: afterP2, afterState: p3After, expectedRevision: afterP2.revision });
  assert.equal(p3.res.knowledgeRevision, 4, "P3: revision bump to 4");
  const afterP3 = await reload();
  assert.equal(afterP3.trustScore, reinforce.trustTo, "P3: trust equals the trustEngine-computed value");
  assert.equal(afterP3.trustScore, trustBeforeP3 + 5, "P3: human reinforcement adds +5 (TRUST_HUMAN_REUSE)");
  assert.ok(afterP3.trustScore >= 0 && afterP3.trustScore <= 100, "P3: trust stays bounded");
  assert.equal(afterP3.knowledgeVersions.length, 2, "P3: reinforcement creates no version");
  assert.equal(afterP3.lessons.length, 2, "P3: reinforcement creates no duplicate lesson");
  assert.equal((await service.loadKnowledge(ORG)).filter((i) => i.id === TARGET).length, 1, "P3: no duplicate KnowledgeItem");
  report.phase3 = { reinforceAction: reinforceReflection.action, newKnowledgeAction: newKnowledgeReflection.action, trustBefore: trustBeforeP3, trustAfter: afterP3.trustScore, versions: afterP3.knowledgeVersions.length, lessons: afterP3.lessons.length };

  // ============ PHASE 4: fresh PostgreSQL reload durability ============
  const durable = await reload();
  const durableValidations = await prisma.validationRecord.count({ where: { organizationId: ORG, knowledgeItemId: TARGET } });
  const durableMemory = await prisma.memoryChangeRecord.count({ where: { organizationId: ORG, knowledgeItemId: TARGET } });
  assert.equal(durable.revision, 4);
  assert.equal(durable.customerResponseTemplate, R1);
  assert.equal(durable.knowledgeVersions.length, 2);
  assert.deepEqual(durable.lessons.map((l) => l.id).sort(), [baseLessonId, newLessonId].sort());
  assert.equal(durable.trustScore, trustBeforeP3 + 5);
  assert.equal(durableValidations, 4, "P4: four validation records persisted");
  assert.equal(durableMemory, 4, "P4: four memory-change records persisted");
  report.phase4 = { revision: durable.revision, template: durable.customerResponseTemplate === R1, versions: durable.knowledgeVersions.length, lessons: durable.lessons.length, trust: durable.trustScore, validationRecords: durableValidations, memoryChangeRecords: durableMemory };

  // ============ PHASE 5: same sourceTicket / NEW candidate (TODO-015 guard) ============
  // Ticket todo014-ticket-0004 already contributed a HUMAN_REUSE trust event in
  // Phase 3, so re-processing it through NEW candidates must NOT add trust again,
  // while the review still commits (revision advances, audit records written).
  const REPEAT_TICKET = "todo014-ticket-0004";
  let repeatItem = afterP3;
  const repeatTrust = [];
  const trustAppliedFlags = [];
  for (const n of [1, 2]) {
    const r = recordResolution(repeatItem, { mode: "human", success: true, at: nextTime() }, profile, []);
    const c = await commit({ suffix: `p5-${n}`, action: "trust_update_only", sourceTicketId: REPEAT_TICKET, beforeState: repeatItem, afterState: r.item, expectedRevision: repeatItem.revision });
    const reloaded = await reload();
    repeatTrust.push(reloaded.trustScore);
    trustAppliedFlags.push(c.res.trustApplied);
    repeatItem = reloaded;
    assert.equal(c.res.replayed, false, "P5: same sourceTicket with a NEW candidate still commits (not a replay)");
    assert.equal(c.res.trustApplied, false, "P5: repeated source ticket must NOT apply trust again (TODO-015)");
  }
  const afterP5 = await reload();
  assert.equal(afterP5.trustScore, trustBeforeP3 + 5, "P5: trust stays put — same ticket does not inflate trust");
  assert.equal(afterP5.revision, 6, "P5: commits still advance revision (audit preserved)");
  const p5Classification = afterP5.trustScore > (trustBeforeP3 + 5) ? "TRUST_INFLATION_RISK" : "SAFE_IDEMPOTENT";
  report.phase5 = { repeatTrust, trustAppliedFlags, finalTrust: afterP5.trustScore, revision: afterP5.revision, classification: p5Classification };

  // ============ PHASE 6: duplicate lesson content, NEW id ============
  const dupeLessonId = "todo014-lesson-base-dupe";
  const original = afterP5.lessons.find((l) => l.id === baseLessonId);
  const p6After = { ...afterP5, lessons: [...afterP5.lessons, { id: dupeLessonId, rootCause: original.rootCause, solution: original.solution, customerResponse: original.customerResponse, signals: [...original.signals], createdAt: nextTime(), sourceTicketId: "todo014-ticket-0005" }], lastUpdated: nextTime() };
  await commit({ suffix: "p6", action: "merge_existing", sourceTicketId: "todo014-ticket-0005", beforeState: afterP5, afterState: p6After, expectedRevision: afterP5.revision });
  const afterP6 = await reload();
  const dupe = afterP6.lessons.find((l) => l.id === dupeLessonId);
  const orig2 = afterP6.lessons.find((l) => l.id === baseLessonId);
  const contentIdentical = dupe && orig2 && dupe.rootCause === orig2.rootCause && dupe.solution === orig2.solution && dupe.customerResponse === orig2.customerResponse;
  const dupePersisted = !!dupe && contentIdentical && dupe.id !== orig2.id;
  const p6Protection = dupePersisted ? "NO_CONTENT_PROTECTION" : "PROTECTED";
  assert.equal(afterP6.lessons.length, 3, "P6: duplicate-content lesson with a new id is appended");
  report.phase6 = { lessons: afterP6.lessons.map((l) => l.id), duplicatePersisted: dupePersisted, protection: p6Protection };

  // ---- Mature data safety ----
  const matureAfter = await matureSnapshot(prisma);
  const matureUnchanged = MATURE.every((id) => matureBefore[id] === matureAfter[id]);
  assert.ok(matureUnchanged, "mature Maesa/FastDrop/Pramana snapshots must be byte-identical");
  report.matureUnchanged = matureUnchanged;

  // ---- Targeted deterministic cleanup: remove only this probe's records ----
  await prisma.trustEvidence.deleteMany({ where: { organizationId: ORG, knowledgeItemId: TARGET } });
  await prisma.memoryChangeRecord.deleteMany({ where: { organizationId: ORG, id: { startsWith: "todo014-" } } });
  await prisma.validationRecord.deleteMany({ where: { organizationId: ORG, id: { startsWith: "todo014-" } } });
  await prisma.knowledgeCandidate.deleteMany({ where: { organizationId: ORG, id: { startsWith: "todo014-" } } });
  await prisma.knowledgeItem.deleteMany({ where: { organizationId: ORG, id: TARGET } });
  const finalCounts = await counts(prisma, ORG);
  assert.deepEqual(finalCounts, baselineCounts, "cleanup must return test-oip-regression to its captured baseline");
  const matureAfterCleanup = await matureSnapshot(prisma);
  assert.ok(MATURE.every((id) => matureBefore[id] === matureAfterCleanup[id]), "mature data unchanged after cleanup");

  report.cleanup = { finalCounts, baselineCounts };
  console.log("TODO-014 lifecycle probe passed.");
  console.log(JSON.stringify(report, null, 2));
}

main()
  .then(async () => { await getPrismaClient().$disconnect(); })
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
    // Best-effort cleanup so a failed run does not leave probe records behind.
    try {
      const prisma = getPrismaClient();
      await prisma.trustEvidence.deleteMany({ where: { organizationId: ORG, knowledgeItemId: TARGET } });
      await prisma.memoryChangeRecord.deleteMany({ where: { organizationId: ORG, id: { startsWith: "todo014-" } } });
      await prisma.validationRecord.deleteMany({ where: { organizationId: ORG, id: { startsWith: "todo014-" } } });
      await prisma.knowledgeCandidate.deleteMany({ where: { organizationId: ORG, id: { startsWith: "todo014-" } } });
      await prisma.knowledgeItem.deleteMany({ where: { organizationId: ORG, id: TARGET } });
    } catch { /* best effort */ }
    await getPrismaClient().$disconnect();
  });
