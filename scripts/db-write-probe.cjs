/*
 * LIVE PostgreSQL write-path probe for TODO-004 Batch 4.
 *
 * Exercises the real server persistence service against the development
 * database using DISPOSABLE organizations only (test-oip-write-a/b). It never
 * reads or writes browser localStorage and never touches the mature
 * Maesa/FastDrop/Pramana browser organizations' data (their profile ids are
 * not used for any write). All disposable rows are removed at the end.
 *
 * Coverage:
 *   A. concurrent single allocations, same org -> distinct IDs
 *   B. concurrent allocations across orgs -> independent sequences
 *   C. bulk allocation cannot overlap other allocations
 *   D. concurrent canonical updates -> one wins, one 409, no lost lessons
 *   E. duplicate validation submission -> replay is a no-op; new-id duplicate is 409
 *   F. failed validation transaction -> zero partial rows
 *   G. reflection-style merge commit -> same transactional guarantees
 *   +  organization isolation for writes/reset/delete, cascade verification
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(root, ".env.local") });
require("dotenv").config({ path: path.join(root, ".env") });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not configured; the live database probe cannot run.");
  process.exit(1);
}

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveProjectAlias(request, parent, isMain, options) {
  if (request === "server-only") {
    return path.join(__dirname, "stubs", "server-only.cjs");
  }
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
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: filename,
    });
    // The generated Prisma client references import.meta.url, which cannot be
    // lowered to CommonJS by transpileModule; rewrite it so Node does not
    // misdetect the transpiled output as an ES module.
    const compiled = output.outputText.replace(
      /import\.meta\.url/g,
      "require('node:url').pathToFileURL(__filename).href"
    );
    module._compile(compiled, filename);
  };
}

const service = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { getPrismaClient } = require(path.join(root, "lib", "server", "prisma.ts"));

const ORG_A = "test-oip-write-a";
const ORG_B = "test-oip-write-b";
const NOW = new Date().toISOString();

function profile(id, name, initials) {
  return {
    id,
    name,
    industry: "Probe",
    description: "Disposable Batch 4 write-probe organization.",
    products: ["Probe Product"],
    services: [],
    supportedDomains: ["probe"],
    businessVocabulary: [],
    supportedIssueTypes: [],
    outOfScopeTopics: [],
    customerTone: "professional",
    supportBoundaries: [],
    autoResolutionThreshold: 80,
    escalationRules: [],
    logoInitials: initials,
    createdAt: NOW,
    updatedAt: NOW
  };
}

function knowledgeItem(id, organizationId, lessons = []) {
  return {
    id,
    organizationId,
    title: `Probe Problem ${id}`,
    problem: "Probe problem statement.",
    approvedAnswer: "Probe approved answer.",
    category: "Probe",
    tags: ["probe"],
    sourceTicketId: "TW-PROBE-0001",
    timesReused: 0,
    createdAt: NOW,
    approvedAt: NOW,
    trustScore: 30,
    lessons,
    knowledgeVersions: [{ versionId: `${id}-v1`, createdAt: NOW, changeReason: "probe", sourceTicketId: "TW-PROBE-0001" }]
  };
}

function commitPayload(organizationId, suffix, item, expectedKnowledgeRevision) {
  const candidateId = `probe-candidate-${suffix}`;
  const validationId = `probe-validation-${suffix}`;
  return {
    candidate: {
      id: candidateId,
      organizationId,
      sourceTicketIds: ["TW-PROBE-0001"],
      proposedAction: expectedKnowledgeRevision === null ? "create_new" : "merge_existing",
      proposedContent: { solution: "Probe", customerResponseTemplate: "Probe", internalGuidance: "Probe" },
      rationale: "Probe rationale",
      status: "proposed",
      createdAt: NOW
    },
    validation: {
      id: validationId,
      organizationId,
      candidateId,
      knowledgeId: item.id,
      decision: "approved",
      actor: "Probe Validator",
      roleExercised: "knowledge_validator",
      rationale: "Probe validation",
      timestamp: NOW
    },
    memoryChange: {
      id: `probe-memory-change-${suffix}`,
      organizationId,
      knowledgeId: item.id,
      candidateId,
      validationRecordId: validationId,
      changeType: expectedKnowledgeRevision === null ? "create_new" : "merge_existing",
      beforeState: null,
      afterState: item,
      timestamp: NOW
    },
    knowledgeItem: item,
    expectedKnowledgeRevision
  };
}

async function candidateRowCounts(prisma, organizationId, candidateId) {
  const [validations, memoryChanges] = await Promise.all([
    prisma.validationRecord.count({ where: { organizationId, candidateId } }),
    prisma.memoryChangeRecord.count({ where: { organizationId, candidateId } })
  ]);
  return { validations, memoryChanges };
}

async function cleanup() {
  for (const id of [ORG_A, ORG_B]) {
    try {
      await service.deleteOrganization(id);
    } catch (error) {
      if (error?.code !== "ORGANIZATION_NOT_FOUND") throw error;
    }
  }
}

async function main() {
  const prisma = getPrismaClient();
  await cleanup();
  await service.upsertOrganizationProfiles([
    profile(ORG_A, "Test Write A", "TWA"),
    profile(ORG_B, "Test Write B", "TWB")
  ]);

  /* A. Concurrent single allocations, same organization. */
  const singles = await Promise.all(Array.from({ length: 8 }, () => service.allocateTicketIds(ORG_A, 1)));
  const singleIds = singles.flat();
  assert.equal(new Set(singleIds).size, 8, "A: concurrent allocations must be distinct");
  singleIds.forEach((id) => assert.match(id, /^TWA-\d{8}-\d{4}$/));

  /* B. Concurrent allocations across organizations are independent. */
  const [aIds, bIds] = await Promise.all([
    service.allocateTicketIds(ORG_A, 3),
    service.allocateTicketIds(ORG_B, 3)
  ]);
  assert.match(bIds[0], /^TWB-\d{8}-0001$/, "B: organization B starts its own sequence");
  assert.equal(new Set([...aIds, ...bIds]).size, 6);

  /* C. Bulk allocation cannot overlap concurrent allocations. */
  const bulkResults = await Promise.all([
    service.allocateTicketIds(ORG_A, 25),
    service.allocateTicketIds(ORG_A, 10),
    service.allocateTicketIds(ORG_A, 1),
    service.allocateTicketIds(ORG_A, 1)
  ]);
  const bulkIds = bulkResults.flat();
  assert.equal(new Set(bulkIds).size, 37, "C: bulk ranges must never overlap");
  const sequence = await service.loadTicketSequence(ORG_A);
  assert.equal(sequence.counter, 8 + 3 + 37, "sequence counter must equal total allocated");

  /* Validation commit (create) + E replay + E duplicate. */
  const itemA = knowledgeItem("probe-knowledge-a", ORG_A, [
    { id: "lesson-a1", rootCause: "Probe cause", solution: "Probe fix", customerResponse: "Hi {{customerName}}", signals: ["probe"], createdAt: NOW, sourceTicketId: "TW-PROBE-0001" }
  ]);
  const createPayload = commitPayload(ORG_A, "create", itemA, null);
  const created = await service.commitValidation(ORG_A, createPayload);
  assert.equal(created.replayed, false);
  assert.equal(created.knowledgeRevision, 1);

  const replayed = await service.commitValidation(ORG_A, createPayload);
  assert.equal(replayed.replayed, true, "E: identical resubmission must be an idempotent replay");
  let counts = await candidateRowCounts(prisma, ORG_A, createPayload.candidate.id);
  assert.deepEqual(counts, { validations: 1, memoryChanges: 1 }, "E: replay must not duplicate audit records");

  const duplicate = commitPayload(ORG_A, "dup", { ...itemA, revision: 1 }, 1);
  duplicate.candidate.id = createPayload.candidate.id;
  duplicate.validation.candidateId = createPayload.candidate.id;
  duplicate.memoryChange.candidateId = createPayload.candidate.id;
  await assert.rejects(() => service.commitValidation(ORG_A, duplicate), (error) => error.code === "CONFLICT");
  counts = await candidateRowCounts(prisma, ORG_A, createPayload.candidate.id);
  assert.deepEqual(counts, { validations: 1, memoryChanges: 1 }, "E: duplicate submission must not add audit records");

  /* D. Concurrent canonical updates: one wins, one conflicts, no lost lessons. */
  const lessonKeep = { id: "lesson-keep", rootCause: "Keep", solution: "Keep", customerResponse: "Keep {{customerName}}", signals: [], createdAt: NOW, sourceTicketId: "TW-PROBE-0002" };
  const lessonRace = { id: "lesson-race", rootCause: "Race", solution: "Race", customerResponse: "Race {{customerName}}", signals: [], createdAt: NOW, sourceTicketId: "TW-PROBE-0003" };
  const winnerItem = { ...knowledgeItem("probe-knowledge-a", ORG_A, [...itemA.lessons, lessonKeep]), revision: 2 };
  const loserItem = { ...knowledgeItem("probe-knowledge-a", ORG_A, [...itemA.lessons, lessonRace]), revision: 2 };
  const results = await Promise.allSettled([
    service.commitValidation(ORG_A, commitPayload(ORG_A, "race-1", winnerItem, 1)),
    service.commitValidation(ORG_A, commitPayload(ORG_A, "race-2", loserItem, 1))
  ]);
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");
  assert.equal(fulfilled.length, 1, "D: exactly one concurrent canonical update must win");
  assert.equal(rejected.length, 1, "D: the other concurrent update must conflict");
  assert.equal(rejected[0].reason.code, "CONFLICT");
  const storedItem = (await service.loadKnowledge(ORG_A)).find((item) => item.id === "probe-knowledge-a");
  assert.equal(storedItem.revision, 2);
  assert.equal(storedItem.lessons.length, 2, "D: winner's lessons persist; nothing is silently merged or lost");
  assert.ok(storedItem.lessons.some((lesson) => lesson.id === "lesson-a1"), "D: validated lesson survives");

  /* F. Failed validation transaction leaves no partial state. */
  const failing = commitPayload(ORG_A, "fail", { ...knowledgeItem("probe-knowledge-a", ORG_A), revision: 99 }, 99);
  await assert.rejects(() => service.commitValidation(ORG_A, failing), (error) => error.code === "CONFLICT");
  counts = await candidateRowCounts(prisma, ORG_A, failing.candidate.id);
  assert.deepEqual(counts, { validations: 0, memoryChanges: 0 }, "F: rollback must remove the audit rows");
  assert.equal(
    await prisma.knowledgeCandidate.count({ where: { organizationId: ORG_A, id: failing.candidate.id } }),
    0,
    "F: rollback must remove the candidate lifecycle write"
  );

  /* G. Reflection-style merge commit uses the same transaction. */
  const current = (await service.loadKnowledge(ORG_A)).find((item) => item.id === "probe-knowledge-a");
  const reflectionItem = { ...current, lessons: [...current.lessons, { id: "lesson-reflect", rootCause: "Reflect", solution: "Reflect", customerResponse: "Reflect {{customerName}}", signals: [], createdAt: NOW, sourceTicketId: "TW-PROBE-0004" }] };
  const reflected = await service.commitValidation(ORG_A, commitPayload(ORG_A, "reflect", reflectionItem, current.revision));
  assert.equal(reflected.knowledgeRevision, current.revision + 1, "G: reflection commit bumps the revision");
  const afterReflection = (await service.loadKnowledge(ORG_A)).find((item) => item.id === "probe-knowledge-a");
  assert.equal(afterReflection.lessons.length, 3, "G: reflection lesson persists atomically");

  /* Organization isolation for standard writes. */
  await service.saveOrgMetrics(ORG_A, { organizationId: ORG_A, lifetimeTickets: 42, knowledgeReused: 1, autoResolutions: 0, humanResolutions: 1, totalResolutionTimeSec: 60, resolutionsCount: 1, memoryGrowthToday: 1, memoryGrowthDate: NOW.slice(0, 10), lastUpdatedAt: NOW });
  await service.saveIntelligenceLog(ORG_A, [{ id: "probe-log-1", timestamp: NOW, event: "Probe event" }]);
  await service.saveEmergingPatterns(ORG_A, [{ id: "probe-pattern-1", organizationId: ORG_A, title: "Probe pattern", summary: "s", category: "Probe", tags: [], keywords: [], exampleTickets: [], timesSeen: 1, confidenceScore: 0.5, suggestedCanonicalProblem: false, status: "monitoring", firstSeenAt: NOW, lastSeenAt: NOW }]);
  await service.saveTicketRecords(ORG_A, [{ ticketId: singleIds[0], orgId: ORG_A, createdAt: NOW, rawMessage: "probe", subject: "Probe", classification: null, memoryMatch: null, draftSource: null, resolution: { finalResponse: null, humanEdited: false, editDistanceNote: null, resolvedAt: null }, reflection: { decision: null, lessonCreatedId: null, lessonReinforcedId: null, knowledgeChanged: null }, validationRecordIds: [], status: "open" }]);

  assert.equal((await service.loadKnowledge(ORG_B)).length, 0, "isolation: B has no knowledge");
  assert.equal(await service.loadOrgMetrics(ORG_B), null, "isolation: B has no metrics");
  assert.equal((await service.loadIntelligenceLog(ORG_B)).length, 0, "isolation: B has no log");
  assert.equal((await service.loadEmergingPatterns(ORG_B)).length, 0, "isolation: B has no patterns");
  assert.equal((await service.loadTicketRecords(ORG_B)).length, 0, "isolation: B has no tickets");

  /* Cross-organization write attempts are rejected. */
  await assert.rejects(
    () => service.saveKnowledge(ORG_B, [{ ...knowledgeItem("probe-knowledge-a", ORG_B), revision: undefined }]),
    (error) => error.code === "CONFLICT",
    "isolation: B cannot claim A's knowledge item id"
  );

  /* Reset isolation: reset A, B untouched, A's sequence restarts. */
  const bBefore = await service.allocateTicketIds(ORG_B, 1);
  await service.resetOrganizationData(ORG_A);
  assert.equal((await service.loadKnowledge(ORG_A)).length, 0, "reset: A knowledge cleared");
  assert.equal((await service.loadTicketRecords(ORG_A)).length, 0, "reset: A tickets cleared");
  assert.equal(await service.loadOrgMetrics(ORG_A), null, "reset: A metrics cleared");
  assert.equal(await service.loadTicketSequence(ORG_A), null, "reset: A sequence cleared");
  const bAfter = await service.allocateTicketIds(ORG_B, 1);
  assert.match(bAfter[0], /-0005$/, "reset: B sequence continues unaffected (3 + 1 + this one)");
  assert.ok(bBefore[0] !== bAfter[0]);
  assert.ok((await service.getOrganizationProfile(ORG_A)).id === ORG_A, "reset: A organization row remains");

  /* Delete isolation + cascade verification. */
  await service.allocateTicketIds(ORG_A, 1);
  await service.deleteOrganization(ORG_A);
  await assert.rejects(() => service.getOrganizationProfile(ORG_A), (error) => error.code === "ORGANIZATION_NOT_FOUND");
  for (const model of ["knowledgeItem", "knowledgeCandidate", "validationRecord", "memoryChangeRecord", "ticketRecord", "emergingPattern", "intelligenceLog", "orgMetrics", "ticketSequence"]) {
    assert.equal(await prisma[model].count({ where: { organizationId: ORG_A } }), 0, `delete cascade: no ${model} rows remain`);
  }
  assert.ok((await service.getOrganizationProfile(ORG_B)).id === ORG_B, "delete: B unaffected");
  assert.equal((await service.loadTicketSequence(ORG_B)).counter, 5, "delete: B counter unaffected");

  await cleanup();
  console.log("Live PostgreSQL write-path probe passed (A-G, isolation, reset, delete, cascade).");
}

main()
  .then(async () => {
    await getPrismaClient().$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
    try {
      await cleanup();
    } catch { /* best effort */ }
    await getPrismaClient().$disconnect();
  });
