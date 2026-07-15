/* TODO-004 Batch 5.7 disposable organization end-to-end migration probe. */
const assert = require("node:assert/strict");

// Reuse only the intake probe's TypeScript/alias/bootstrap setup. Its fixture
// data is not imported here; all organizations below are disposable and are
// created by this probe.
const {
  persistence,
  profile,
  getPrismaClient,
  deleteIfPresent
} = require("./migration-intake-probe.cjs");
const intake = require("../lib/server/migrationImportService.ts");
const execution = require("../lib/server/migrationImportExecutionService.ts");
const verification = require("../lib/server/migrationVerificationService.ts");
const persistenceService = require("../lib/server/persistenceService.ts");
const { exportOrganizationSnapshot } = require("../lib/persistence/migrationExport.ts");

const NOW = "2026-07-15T00:00:00.000Z";
const ORG_A = "test-oip-migration-e2e-a";
const ORG_B = "test-oip-migration-e2e-b";
const ORG_CONFLICT = "test-oip-migration-e2e-conflict";
const ORG_MEMORY_FAILURE = "test-oip-migration-e2e-memory-failure";
const ORG_SEQUENCE_FAILURE = "test-oip-migration-e2e-sequence-failure";
const ALL_ORGS = [ORG_A, ORG_B, ORG_CONFLICT, ORG_MEMORY_FAILURE, ORG_SEQUENCE_FAILURE];
const MATURE_ORGANIZATION_IDS = new Set([
  "profile-maesa-tech",
  "profile-fastdrop-logistics",
  "profile-pramana-legal"
]);
const RESOURCE_NAMES = [
  "knowledge",
  "knowledgeCandidates",
  "validationRecords",
  "memoryChangeRecords",
  "orgMetrics",
  "intelligenceLog",
  "emergingPatterns",
  "ticketRecords",
  "ticketSequence"
];
const MIGRATION_RESOURCE_NAMES = [
  "knowledge",
  "candidates",
  "validationRecords",
  "memoryChanges",
  "metrics",
  "patterns",
  "intelligenceLog",
  "tickets",
  "ticketCounter"
];

class MemoryStorage {
  constructor() {
    this.values = new Map();
    this.setCalls = 0;
    this.removeCalls = 0;
  }

  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(String(key)) ? this.values.get(String(key)) : null; }
  setItem(key, value) { this.setCalls += 1; this.values.set(String(key), String(value)); }
  removeItem(key) { this.removeCalls += 1; this.values.delete(String(key)); }
  clear() { this.values.clear(); }
}

let storage;

function assertDisposable(organizationId) {
  if (MATURE_ORGANIZATION_IDS.has(organizationId)) {
    throw new Error(`Safety guard: mature organization ${organizationId} is outside the Batch 5.7 probe scope.`);
  }
}

function resetStorage() {
  storage = new MemoryStorage();
  global.window = { localStorage: storage };
}

function storageSnapshot() {
  return Object.fromEntries([...storage.values.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function setJson(key, value) {
  storage.setItem(key, JSON.stringify(value));
}

function scopedKey(organizationId, resource) {
  return `oip.organization.${encodeURIComponent(organizationId)}.${resource}.v1`;
}

function testProfile(organizationId) {
  return { ...profile(organizationId), accentColor: "#2563EB" };
}

function resourcesState(status) {
  return Object.fromEntries(MIGRATION_RESOURCE_NAMES.map((resource) => [resource, { status, updatedAt: NOW }]));
}

function migrationState(legacyOwner) {
  return {
    version: "v1",
    sourceVersion: "v2",
    legacyOwnerOrganizationId: legacyOwner,
    legacyOwnershipStatus: "owned",
    legacyOwnershipReason: "explicit disposable E2E owner",
    organizations: {
      [ORG_A]: { resources: resourcesState("fallback"), legacyImportSuppressed: false },
      [ORG_B]: { resources: resourcesState("copied"), legacyImportSuppressed: false },
      [ORG_CONFLICT]: { resources: resourcesState("copied"), legacyImportSuppressed: false },
      [ORG_MEMORY_FAILURE]: { resources: resourcesState("copied"), legacyImportSuppressed: false },
      [ORG_SEQUENCE_FAILURE]: { resources: resourcesState("copied"), legacyImportSuppressed: false }
    }
  };
}

function knowledgeItem(id, organizationId, ticketId, index) {
  return {
    id,
    organizationId,
    revision: 4 + index,
    canonicalProblemId: id,
    canonicalProblemTitle: `E2E knowledge ${organizationId} ${index}`,
    title: `E2E knowledge ${organizationId} ${index}`,
    problem: `A disposable customer cannot complete workflow ${index}.`,
    approvedAnswer: `Use the verified recovery workflow ${index}.`,
    category: index % 2 === 0 ? "access" : "billing",
    tags: ["e2e", index % 2 === 0 ? "access" : "billing"],
    sourceTicketId: ticketId,
    timesReused: index + 1,
    timesSeen: index + 3,
    successfulResolutions: index + 2,
    failedResolutions: 1,
    successRate: 0.75,
    trustScore: 88 + index,
    autoResponseEligible: true,
    humanReviewCount: index + 1,
    automaticResolutionCount: index,
    createdAt: NOW,
    approvedAt: NOW,
    provenance: { source: "disposable-localstorage", reviewer: "E2E reviewer", confidence: 0.91 },
    validation: { decision: "approved", actor: "E2E reviewer", validatedAt: NOW },
    problemSummary: `Workflow ${index} summary`,
    internalGuidance: `Internal guidance ${index}`,
    customerResponseTemplate: `Hi {{customerName}}, please use workflow ${index}.`,
    resolutionWorkflow: ["confirm", "repair", "verify"],
    exampleTickets: [ticketId],
    knowledgeVersions: [
      { versionId: `${id}-version-1`, version: 1, createdAt: NOW, changeReason: "initial", sourceTicketId: ticketId, summary: "Initial historical version" },
      { versionId: `${id}-version-2`, version: 2, createdAt: NOW, changeReason: "reviewed", sourceTicketId: ticketId, summary: "Reviewed historical version" }
    ],
    learningHistory: [
      { id: `${id}-history-1`, event: "created", createdAt: NOW, actor: "E2E reviewer" },
      { id: `${id}-history-2`, event: "validated", createdAt: NOW, actor: "E2E reviewer" }
    ],
    lessons: [
      { id: `${id}-lesson-1`, rootCause: `Root cause ${index}`, solution: `Solution ${index}`, customerResponse: `Response ${index}`, signals: ["e2e"], createdAt: NOW, sourceTicketId: ticketId },
      { id: `${id}-lesson-2`, rootCause: `Secondary cause ${index}`, solution: `Secondary solution ${index}`, customerResponse: `Secondary response ${index}`, signals: ["history"], createdAt: NOW, sourceTicketId: ticketId }
    ]
  };
}

function ticket(ticketId, organizationId, index) {
  return {
    ticketId,
    orgId: organizationId,
    createdAt: NOW,
    rawMessage: `Disposable ticket ${index}`,
    subject: `E2E ticket ${index}`,
    classification: { category: "e2e", confidence: 0.94 },
    memoryMatch: { knowledgeId: `${organizationId}-knowledge-${index % 2 + 1}`, score: 0.9 },
    draftSource: "historical-import",
    resolution: { finalResponse: `Resolved ${index}`, humanEdited: true, resolvedAt: NOW },
    reflection: { decision: "approved", lessonCreatedId: `${organizationId}-knowledge-${index % 2 + 1}-lesson-1`, lessonReinforcedId: null, knowledgeChanged: null },
    validationRecordIds: [`${organizationId}-validation-${index % 5 + 1}`],
    status: index === 3 ? "resolved" : "open"
  };
}

function resourcesFor(organizationId, prefix, ticketPrefix, ticketNumbers, counter) {
  const tickets = ticketNumbers.map((number, index) => ticket(`${ticketPrefix}-20260715-${String(number).padStart(4, "0")}`, organizationId, index + 1));
  const knowledge = [
    knowledgeItem(`${organizationId}-knowledge-1`, organizationId, tickets[0].ticketId, 1),
    knowledgeItem(`${organizationId}-knowledge-2`, organizationId, tickets[1].ticketId, 2)
  ];
  const candidates = Array.from({ length: 5 }, (_, index) => ({
    id: `${organizationId}-candidate-${index + 1}`,
    organizationId,
    sourceTicketIds: [tickets[index % tickets.length].ticketId],
    proposedAction: index === 0 ? "create_new" : "create_version",
    proposedContent: { solution: `Candidate solution ${index + 1}`, customerResponseTemplate: `Candidate response ${index + 1}`, internalGuidance: `Candidate guidance ${index + 1}` },
    relatedKnowledgeId: knowledge[index % knowledge.length].id,
    rationale: `Historical candidate ${index + 1}`,
    status: "validated",
    createdAt: NOW
  }));
  const validations = candidates.map((candidate, index) => ({
    id: `${organizationId}-validation-${index + 1}`,
    organizationId,
    candidateId: candidate.id,
    knowledgeId: candidate.relatedKnowledgeId,
    knowledgeVersionId: `${candidate.relatedKnowledgeId}-version-${index % 2 + 1}`,
    decision: "approved",
    actor: "E2E historical reviewer",
    roleExercised: "knowledge_validator",
    rationale: `Historical validation ${index + 1}`,
    timestamp: NOW
  }));
  const memory = validations.map((validation, index) => ({
    id: `${organizationId}-memory-${index + 1}`,
    organizationId,
    knowledgeId: validation.knowledgeId,
    candidateId: validation.candidateId,
    validationRecordId: validation.id,
    changeType: index === 0 ? "create_new" : "create_version",
    beforeState: index === 0 ? null : { revision: index + 2 },
    afterState: { id: validation.knowledgeId, revision: index + 4, source: "historical", provenance: { actor: "E2E reviewer" } },
    timestamp: NOW
  }));
  return {
    knowledge,
    knowledgeCandidates: candidates,
    validationRecords: validations,
    memoryChangeRecords: memory,
    orgMetrics: {
      organizationId,
      lifetimeTickets: tickets.length,
      knowledgeReused: 4,
      autoResolutions: 2,
      humanResolutions: 1,
      totalResolutionTimeSec: 180,
      resolutionsCount: 3,
      memoryGrowthToday: 5,
      memoryGrowthDate: "2026-07-15",
      mergedTickets: 1,
      duplicatePreventions: 2,
      knowledgeVersions: 4,
      emergingPatternsDetected: 2,
      promotedPatterns: 1,
      aiCalls: 6,
      aiSuccesses: 5,
      aiFailures: 1,
      aiFallbacks: 1,
      aiAgreementSamples: 3,
      aiAgreementTotal: 3,
      humanAcceptedAISuggestions: 2,
      lastUpdatedAt: NOW
    },
    intelligenceLog: [1, 2, 3].map((index) => ({ id: `${organizationId}-log-${index}`, timestamp: NOW, event: `historical-e2e-${index}`, detail: `log detail ${index}` })),
    emergingPatterns: [1, 2].map((index) => ({
      id: `${organizationId}-pattern-${index}`,
      organizationId,
      title: `E2E pattern ${index}`,
      summary: `Repeated disposable pattern ${index}`,
      category: "access",
      status: index === 1 ? "promoted" : "monitoring",
      tags: ["e2e"],
      keywords: ["workflow", "retry"],
      exampleTickets: [tickets[index - 1].ticketId],
      timesSeen: index + 2,
      confidenceScore: 0.8 + index / 20,
      suggestedCanonicalProblem: index === 1,
      firstSeenAt: NOW,
      lastSeenAt: NOW
    })),
    ticketRecords: tickets,
    ticketSequence: { organizationId, counter, updatedAt: null }
  };
}

function setResourceSet(organizationId, resources, scoped) {
  const keyFor = (resource) => scoped ? scopedKey(organizationId, resource) : `oip.${resource}.v2`;
  setJson(keyFor("knowledge"), resources.knowledge);
  setJson(keyFor("knowledgeCandidates"), resources.knowledgeCandidates);
  setJson(keyFor("validationRecords"), resources.validationRecords);
  setJson(keyFor("memoryChanges"), resources.memoryChangeRecords);
  setJson(keyFor("orgMetrics"), resources.orgMetrics);
  setJson(keyFor("intelligenceLog"), resources.intelligenceLog);
  setJson(keyFor("emergingPatterns"), resources.emergingPatterns);
  setJson(keyFor("ticketRecords"), resources.ticketRecords);
  setJson(keyFor("ticketCounter"), { [organizationId]: resources.ticketSequence.counter });
}

function seedSyntheticLocalStorage() {
  resetStorage();
  setJson("oip.organizationProfile.v1", testProfile(ORG_A));
  setJson("oip.organizationList.v1", ALL_ORGS.map(testProfile));

  const a = resourcesFor(ORG_A, "a", "E2A", [55, 57, 60], 40);
  const b = resourcesFor(ORG_B, "b", "E2B", [2, 3, 4], 3);
  const c = resourcesFor(ORG_CONFLICT, "c", "E2C", [7, 8, 9], 4);
  const m = resourcesFor(ORG_MEMORY_FAILURE, "m", "E2M", [7, 8, 9], 4);
  const s = resourcesFor(ORG_SEQUENCE_FAILURE, "s", "E2S", [7, 8, 9], 4);

  // A is the explicit legacy owner. The scoped memory tail contains one
  // duplicate and one new record, exercising full-history + tail deduplication.
  setResourceSet(ORG_A, a, false);
  setJson(scopedKey(ORG_A, "memoryChanges"), [a.memoryChangeRecords[3], a.memoryChangeRecords[4]]);
  setResourceSet(ORG_B, b, true);
  setResourceSet(ORG_CONFLICT, c, true);
  setResourceSet(ORG_MEMORY_FAILURE, m, true);
  setResourceSet(ORG_SEQUENCE_FAILURE, s, true);
  setJson("oip.organizationIsolationMigration.v1", migrationState(ORG_A));

  return { a, b, c, m, s };
}

function emptyBusinessCounts() {
  return {
    knowledgeItem: 0,
    knowledgeCandidate: 0,
    validationRecord: 0,
    memoryChangeRecord: 0,
    ticketRecord: 0,
    emergingPattern: 0,
    intelligenceLog: 0,
    orgMetrics: 0,
    ticketSequence: 0
  };
}

async function businessCounts(prisma, organizationId) {
  const models = Object.keys(emptyBusinessCounts());
  return Object.fromEntries(await Promise.all(models.map(async (model) => [model, await prisma[model].count({ where: { organizationId } })])));
}

async function withFailureInjection(kind, action) {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousInjection = process.env.MIGRATION_IMPORT_FAILURE_INJECTION;
  process.env.NODE_ENV = "test";
  process.env.MIGRATION_IMPORT_FAILURE_INJECTION = kind;
  try { return await action(); }
  finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    if (previousInjection === undefined) delete process.env.MIGRATION_IMPORT_FAILURE_INJECTION; else process.env.MIGRATION_IMPORT_FAILURE_INJECTION = previousInjection;
  }
}

async function exportReady(organizationId) {
  assertDisposable(organizationId);
  const result = await exportOrganizationSnapshot(organizationId);
  assert.equal(result.ready, true, `${organizationId} export must be ready: ${result.reason ?? "unknown reason"}`);
  return result.package;
}

async function httpJson(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) }
  });
  const body = await response.json();
  assert.equal(response.ok, true, `${options.method ?? "GET"} ${pathname} failed: ${JSON.stringify(body)}`);
  return body.data;
}

async function importAndVerifyDirect(organizationId, exportPackage) {
  const intakeResult = await intake.intakeMigrationExportPackage(exportPackage, organizationId);
  const replay = await intake.intakeMigrationExportPackage(exportPackage, organizationId);
  assert.equal(replay.batchId, intakeResult.batchId);
  assert.equal(replay.reused, true);
  const imported = await execution.executeMigrationImport(organizationId, intakeResult.batchId);
  assert.equal(imported.status, "imported");
  const importedRetry = await execution.executeMigrationImport(organizationId, intakeResult.batchId);
  assert.equal(importedRetry.noOp, true);
  const verified = await verification.verifyMigrationImport(organizationId, intakeResult.batchId);
  assert.equal(verified.status, "passed");
  const verifiedRetry = await verification.verifyMigrationImport(organizationId, intakeResult.batchId);
  assert.equal(verifiedRetry.noOp, true);
  const freshSummary = await intake.getMigrationImportBatch(organizationId, intakeResult.batchId);
  assert.equal(freshSummary.status, "verified");
  return { batchId: intakeResult.batchId, verification: verified };
}

async function compareReadbacks(organizationId, exportPackage) {
  const [profileTarget, knowledge, candidates, validations, memory, metrics, logs, patterns, tickets, sequence] = await Promise.all([
    persistenceService.getOrganizationProfile(organizationId),
    persistenceService.loadKnowledge(organizationId),
    persistenceService.loadKnowledgeCandidates(organizationId),
    persistenceService.loadValidationRecords(organizationId),
    persistenceService.loadMemoryChangeRecords(organizationId),
    persistenceService.loadOrgMetrics(organizationId),
    persistenceService.loadIntelligenceLog(organizationId),
    persistenceService.loadEmergingPatterns(organizationId),
    persistenceService.loadTicketRecords(organizationId),
    persistenceService.loadTicketSequence(organizationId)
  ]);
  assert.equal(profileTarget.id, exportPackage.organizationId);
  assert.deepEqual(knowledge.map((item) => item.id).sort(), exportPackage.resources.knowledge.map((item) => item.id).sort());
  assert.deepEqual(candidates.map((item) => item.id).sort(), exportPackage.resources.knowledgeCandidates.map((item) => item.id).sort());
  assert.deepEqual(validations.map((item) => item.id).sort(), exportPackage.resources.validationRecords.map((item) => item.id).sort());
  assert.deepEqual(memory.map((item) => item.id).sort(), exportPackage.resources.memoryChangeRecords.map((item) => item.id).sort());
  assert.deepEqual(logs.map((item) => item.id).sort(), exportPackage.resources.intelligenceLog.map((item) => item.id).sort());
  assert.deepEqual(patterns.map((item) => item.id).sort(), exportPackage.resources.emergingPatterns.map((item) => item.id).sort());
  assert.deepEqual(tickets.map((item) => item.ticketId).sort(), exportPackage.resources.ticketRecords.map((item) => item.ticketId).sort());
  assert.equal(metrics?.organizationId, organizationId);
  assert.equal(metrics?.lifetimeTickets, exportPackage.resources.orgMetrics?.lifetimeTickets);
  const highestTicketNumber = Math.max(0, ...exportPackage.resources.ticketRecords.map((record) => Number(record.ticketId.split("-").at(-1))));
  assert.equal(sequence?.counter, Math.max(exportPackage.resources.ticketSequence?.counter ?? 0, highestTicketNumber));
  assert.equal(knowledge.reduce((sum, item) => sum + (item.lessons?.length ?? 0), 0), exportPackage.counts.lessons);
  assert.equal(knowledge.reduce((sum, item) => sum + (item.knowledgeVersions?.length ?? 0), 0), exportPackage.counts.knowledgeVersions);
  assert.equal(memory.length, exportPackage.resources.memoryChangeRecords.length);
  return { knowledge, candidates, validations, memory, metrics, logs, patterns, tickets, sequence };
}

async function runFailureRecovery(organizationId, exportPackage, kind, resourceType) {
  const intakeResult = await intake.intakeMigrationExportPackage(exportPackage, organizationId);
  const failed = await withFailureInjection(kind, () => execution.executeMigrationImport(organizationId, intakeResult.batchId));
  assert.equal(failed.status, "failed");
  assert.equal(failed.failedResource, resourceType);
  const retried = await execution.executeMigrationImport(organizationId, intakeResult.batchId);
  assert.equal(retried.status, "imported");
  const verified = await verification.verifyMigrationImport(organizationId, intakeResult.batchId);
  assert.equal(verified.status, "passed");
}

async function runConflictCase(exportPackage, prisma) {
  const source = exportPackage.resources.knowledge[0];
  await prisma.knowledgeItem.create({
    data: {
      id: source.id,
      organizationId: ORG_CONFLICT,
      title: "Different existing content",
      category: "access",
      lifecycleState: "active",
      sourceTicketId: source.sourceTicketId,
      createdAt: new Date(NOW),
      approvedAt: new Date(NOW),
      revision: 1,
      content: { problem: "different", approvedAnswer: "different", tags: [], lessons: [], knowledgeVersions: [], learningHistory: [], exampleTickets: [] }
    }
  });
  const intakeResult = await intake.intakeMigrationExportPackage(exportPackage, ORG_CONFLICT);
  const result = await execution.executeMigrationImport(ORG_CONFLICT, intakeResult.batchId);
  assert.equal(result.status, "conflict");
  assert.ok(result.unresolvedConflictCount > 0);
  assert.equal((await verification.verifyMigrationImport(ORG_CONFLICT, intakeResult.batchId)).status, "failed");
  return intakeResult.batchId;
}

async function runTicketConcurrency(organizationId) {
  const [first, second] = await Promise.all([
    persistence.allocateTicketIds(organizationId, 2),
    persistence.allocateTicketIds(organizationId, 2)
  ]);
  const allocated = [...first, ...second];
  assert.equal(allocated.length, 4);
  assert.equal(new Set(allocated).size, 4);
  const sequence = await persistenceService.loadTicketSequence(organizationId);
  assert.ok(sequence.counter >= 4);
}

async function runHttpA(baseUrl, exportPackage) {
  const encoded = encodeURIComponent(ORG_A);
  const intakeResult = await httpJson(baseUrl, `/api/organizations/${encoded}/migration-import`, { method: "POST", body: JSON.stringify(exportPackage) });
  const replay = await httpJson(baseUrl, `/api/organizations/${encoded}/migration-import`, { method: "POST", body: JSON.stringify(exportPackage) });
  assert.equal(replay.batchId, intakeResult.batchId);
  assert.equal(replay.reused, true);
  const imported = await httpJson(baseUrl, `/api/organizations/${encoded}/migration-import/${intakeResult.batchId}/execute`, { method: "POST", body: "{}" });
  assert.equal(imported.status, "imported");
  const retry = await httpJson(baseUrl, `/api/organizations/${encoded}/migration-import/${intakeResult.batchId}/execute`, { method: "POST", body: "{}" });
  assert.equal(retry.noOp, true);
  const verified = await httpJson(baseUrl, `/api/organizations/${encoded}/migration-import/${intakeResult.batchId}/verify`, { method: "POST", body: "{}" });
  assert.equal(verified.status, "passed");
  const verifiedRetry = await httpJson(baseUrl, `/api/organizations/${encoded}/migration-import/${intakeResult.batchId}/verify`, { method: "POST", body: "{}" });
  assert.equal(verifiedRetry.noOp, true);
  const report = await httpJson(baseUrl, `/api/organizations/${encoded}/migration-import/${intakeResult.batchId}/verify`);
  assert.equal(report.status, "passed");
  const knowledge = await httpJson(baseUrl, `/api/organizations/${encoded}/knowledge`);
  assert.equal(knowledge.length, exportPackage.resources.knowledge.length);
  return intakeResult.batchId;
}

async function main(options = {}) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the migration E2E probe.");
  for (const id of ALL_ORGS) assertDisposable(id);
  const prisma = getPrismaClient();
  const source = seedSyntheticLocalStorage();
  const beforeExport = storageSnapshot();
  const exportedA = await exportReady(ORG_A);
  assert.equal(exportedA.sourceResourceStatuses.memoryChangeRecords.source, "scoped+legacy-fallback");
  assert.equal(exportedA.resources.memoryChangeRecords.length, 5);
  assert.equal(new Set(exportedA.resources.memoryChangeRecords.map((record) => record.id)).size, 5);
  assert.equal(exportedA.resources.ticketSequence.counter, 40);
  assert.deepEqual(storageSnapshot(), beforeExport, "production exporter must preserve every source localStorage byte");
  const exportedB = await exportReady(ORG_B);
  assert.equal(exportedB.sourceResourceStatuses.knowledge.source, "scoped");
  assert.equal(exportedB.ownershipEvidence.legacyFallbackResources.length, 0);
  assert.deepEqual(storageSnapshot(), beforeExport, "exporting B must not alter A or B source bytes");

  try {
    await Promise.all(ALL_ORGS.map(deleteIfPresent));
    await persistence.upsertOrganizationProfiles(ALL_ORGS.map(testProfile));
    for (const id of ALL_ORGS) assert.deepEqual(await businessCounts(prisma, id), emptyBusinessCounts(), `${id} must start empty`);

    let aBatchId;
    if (options.baseUrl) {
      aBatchId = await runHttpA(options.baseUrl, exportedA);
    } else {
      aBatchId = (await importAndVerifyDirect(ORG_A, exportedA)).batchId;
    }
    await compareReadbacks(ORG_A, exportedA);

    const bResult = await importAndVerifyDirect(ORG_B, exportedB);
    await compareReadbacks(ORG_B, exportedB);
    assert.notEqual(aBatchId, bResult.batchId, "organization-scoped batches must not collide");

    // An independent ticket allocation racing the import must never lower the
    // reconciled counter or reuse an existing historical ID.
    await runTicketConcurrency(ORG_B);

    const conflictPackage = await exportReady(ORG_CONFLICT);
    const conflictBatchId = await runConflictCase(conflictPackage, prisma);
    const conflictSummary = await intake.getMigrationImportBatch(ORG_CONFLICT, conflictBatchId);
    assert.ok(conflictSummary.resourceCheckpoints.some((row) => row.status === "conflict"));

    const memoryPackage = await exportReady(ORG_MEMORY_FAILURE);
    await runFailureRecovery(ORG_MEMORY_FAILURE, memoryPackage, "memory-after-first", "memoryChangeRecords");
    const sequencePackage = await exportReady(ORG_SEQUENCE_FAILURE);
    await runFailureRecovery(ORG_SEQUENCE_FAILURE, sequencePackage, "ticket-sequence-after-reconcile", "ticketSequence");

    assert.deepEqual(storageSnapshot(), beforeExport, "the complete migration workflow must not mutate source localStorage");
    assert.equal(storage.removeCalls, 0, "the probe must never remove a source localStorage key");
    assert.equal(storage.setCalls > 0, true);
    console.log(JSON.stringify({
      status: "passed",
      mode: options.baseUrl ? "http-a-direct-b" : "direct-services",
      organizations: { a: ORG_A, b: ORG_B },
      verified: [ORG_A, ORG_B],
      conflict: { organizationId: ORG_CONFLICT, batchId: conflictBatchId, quarantined: true, openConflictBlocksVerification: true },
      failureRecovery: ["memoryChangeRecords", "ticketSequence"],
      sourceLocalStorageUnchanged: true,
      matureOrganizationsTouched: false,
      cutoverPerformed: false
    }, null, 2));
  } finally {
    await Promise.all(ALL_ORGS.map(deleteIfPresent));
    // Only synthetic in-memory storage is cleared. No browser storage is
    // connected to this probe.
    storage.clear();
    delete global.window;
  }
}

if (require.main === module) {
  const baseUrl = process.env.OIP_E2E_BASE_URL?.replace(/\/$/, "");
  main({ baseUrl }).catch((error) => { console.error(error); process.exitCode = 1; });
}

module.exports = { main, seedSyntheticLocalStorage, exportReady, ORG_A, ORG_B };
