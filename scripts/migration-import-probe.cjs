/* TODO-004 Batch 5.5 deterministic history and sequence reconciliation probe. */
const assert = require("node:assert/strict");
const { packageFor, refresh, deleteIfPresent, profile, persistence, getPrismaClient } = require("./migration-intake-probe.cjs");

const migration = require("../lib/server/migrationImportService.ts");
const execution = require("../lib/server/migrationImportExecutionService.ts");

const ORG = "test-oip-migration-import-a";
const ORG_TARGET = "test-oip-migration-import-b";
const ORG_COLLISION = "test-oip-migration-import-c";
const ORG_FAILURE = "test-oip-migration-import-f";
const ORG_UNIQUE = "test-oip-migration-import-u";
const ORG_MEMORY_CONFLICT = "test-oip-migration-import-m";
const ORG_BAD_SEQUENCE = "test-oip-migration-import-s";
const ORG_MEMORY_ROLLBACK = "test-oip-migration-import-r";
const ORG_SEQUENCE_ROLLBACK = "test-oip-migration-import-q";
const ORG_DUPLICATE_MEMORY = "test-oip-migration-import-d";
const ORG_CROSS_MEMORY = "test-oip-migration-import-x";
const ORG_SEQUENCE_SERVER = "test-oip-migration-import-b20";
const ORG_SEQUENCE_LOCAL = "test-oip-migration-import-c30";
const ORG_SEQUENCE_TICKET = "test-oip-migration-import-d42";
const ORG_SEQUENCE_EMPTY = "test-oip-migration-import-e0";
const ORG_SEQUENCE_CONCURRENT = "test-oip-migration-import-zc";
const NOW = "2026-07-15T00:00:00.000Z";

function populatedResources(organizationId) {
  return {
    knowledge: [{
      id: "import-knowledge-1", organizationId, title: "Imported Login Knowledge", problem: "Users cannot sign in",
      approvedAnswer: "Reset the sign-in session.", category: "access", tags: ["login"], sourceTicketId: "MT-20260715-0015",
      timesReused: 2, createdAt: NOW, approvedAt: NOW, revision: 4,
      knowledgeVersions: [{ versionId: "import-version-1", version: 1, createdAt: NOW, changeReason: "historical", sourceTicketId: "MT-20260715-0015", summary: "Initial version" }],
      lessons: [{ id: "import-lesson-1", rootCause: "Expired session", solution: "Reset session", customerResponse: "Please retry after resetting your session.", signals: ["login"], createdAt: NOW, sourceTicketId: "MT-20260715-0015" }],
      learningHistory: [{ id: "import-history-1", event: "historical import", createdAt: NOW }]
    }],
    knowledgeCandidates: [{
      id: "import-candidate-1", organizationId, sourceTicketIds: ["MT-20260715-0015"], proposedAction: "create_new",
      proposedContent: { solution: "Reset the session", customerResponseTemplate: "Retry after reset", internalGuidance: "Check session expiry" },
      relatedKnowledgeId: "import-knowledge-1", rationale: "Historical candidate", status: "validated", createdAt: NOW
    }],
    validationRecords: [{
      id: "import-validation-1", organizationId, candidateId: "import-candidate-1", knowledgeId: "import-knowledge-1",
      knowledgeVersionId: "import-version-1", decision: "approved", actor: "Historical Reviewer", roleExercised: "knowledge_validator",
      rationale: "Historical approval", timestamp: NOW
    }],
    memoryChangeRecords: [{
      id: "import-memory-1", organizationId, knowledgeId: "import-knowledge-1", candidateId: "import-candidate-1",
      validationRecordId: "import-validation-1", changeType: "create_version", beforeState: null,
      afterState: { id: "import-knowledge-1", title: "Imported Login Knowledge", revision: 4 }, timestamp: NOW
    }],
    orgMetrics: {
      organizationId, lifetimeTickets: 1, knowledgeReused: 2, autoResolutions: 0, humanResolutions: 1,
      totalResolutionTimeSec: 30, resolutionsCount: 1, memoryGrowthToday: 1, memoryGrowthDate: "2026-07-15",
      mergedTickets: 0, duplicatePreventions: 0, knowledgeVersions: 1, emergingPatternsDetected: 1, promotedPatterns: 0,
      aiCalls: 0, aiSuccesses: 0, aiFailures: 0, aiFallbacks: 0, aiAgreementSamples: 0, aiAgreementTotal: 0,
      humanAcceptedAISuggestions: 0, lastUpdatedAt: NOW
    },
    intelligenceLog: [{ id: "import-log-1", timestamp: NOW, event: "historical import probe", detail: "safe" }],
    emergingPatterns: [{
      id: "import-pattern-1", organizationId, title: "Login pattern", summary: "Repeated login issue", category: "access",
      status: "monitoring", tags: ["login"], keywords: ["session"], exampleTickets: ["MT-20260715-0015"], timesSeen: 1,
      confidenceScore: 0.8, suggestedCanonicalProblem: false, firstSeenAt: NOW, lastSeenAt: NOW
    }],
    ticketRecords: [{
      ticketId: "MT-20260715-0015", orgId: organizationId, createdAt: NOW, rawMessage: "Cannot sign in", subject: "Login",
      classification: null, memoryMatch: null, draftSource: "deterministic", resolution: { status: "resolved" },
      reflection: { decision: "approved", lessonCreatedId: "import-lesson-1", lessonReinforcedId: null, knowledgeChanged: "import-knowledge-1" },
      validationRecordIds: ["import-validation-1"], status: "resolved"
    }],
    ticketSequence: { organizationId, counter: 10, updatedAt: null }
  };
}

function updateStatuses(pkg) {
  for (const [name, status] of Object.entries(pkg.sourceResourceStatuses)) {
    const value = pkg.resources[name];
    const count = Array.isArray(value) ? value.length : value === null ? 0 : 1;
    status.source = count > 0 ? "scoped" : "absent";
    status.scopedPresent = count > 0;
    status.scopedRecordCount = count;
    status.resolvedRecordCount = count;
    if (pkg.migrationState.organizations[pkg.organizationId]?.resources[name]) {
      pkg.migrationState.organizations[pkg.organizationId].resources[name].status = count > 0 ? "copied" : "absent";
    }
  }
}

async function populatedPackage(organizationId) {
  const pkg = await packageFor(organizationId, { resources: populatedResources(organizationId) });
  updateStatuses(pkg);
  return refresh(pkg);
}

function namespacePackage(pkg, prefix) {
  const knowledge = pkg.resources.knowledge[0];
  const candidate = pkg.resources.knowledgeCandidates[0];
  const validation = pkg.resources.validationRecords[0];
  const ticket = pkg.resources.ticketRecords[0];
  const knowledgeId = `${prefix}-knowledge-1`;
  const candidateId = `${prefix}-candidate-1`;
  const validationId = `${prefix}-validation-1`;
  const ticketId = `${prefix}-20260715-0001`;
  knowledge.id = knowledgeId;
  knowledge.sourceTicketId = ticketId;
  knowledge.knowledgeVersions[0].versionId = `${prefix}-version-1`;
  knowledge.knowledgeVersions[0].sourceTicketId = ticketId;
  knowledge.lessons[0].id = `${prefix}-lesson-1`;
  knowledge.lessons[0].sourceTicketId = ticketId;
  knowledge.learningHistory[0].id = `${prefix}-history-1`;
  candidate.id = candidateId;
  candidate.relatedKnowledgeId = knowledgeId;
  candidate.sourceTicketIds = [ticketId];
  validation.id = validationId;
  validation.candidateId = candidateId;
  validation.knowledgeId = knowledgeId;
  validation.knowledgeVersionId = `${prefix}-version-1`;
  pkg.resources.memoryChangeRecords[0].id = `${prefix}-memory-1`;
  pkg.resources.memoryChangeRecords[0].knowledgeId = knowledgeId;
  pkg.resources.memoryChangeRecords[0].candidateId = candidateId;
  pkg.resources.memoryChangeRecords[0].validationRecordId = validationId;
  ticket.ticketId = ticketId;
  ticket.validationRecordIds = [validationId];
  ticket.reflection.lessonCreatedId = `${prefix}-lesson-1`;
  ticket.reflection.knowledgeChanged = knowledgeId;
  pkg.resources.emergingPatterns[0].id = `${prefix}-pattern-1`;
  pkg.resources.emergingPatterns[0].exampleTickets = [ticketId];
  pkg.resources.intelligenceLog[0].id = `${prefix}-log-1`;
  return pkg;
}

async function emptyKnowledgePackage(organizationId, id, title = "Collision Knowledge") {
  const pkg = await packageFor(organizationId, { resources: { ...populatedResources(organizationId), knowledge: [{
    id, organizationId, title, problem: "Collision problem", approvedAnswer: "Collision answer", category: "access",
    tags: [], sourceTicketId: "collision-ticket", timesReused: 0, createdAt: NOW, approvedAt: NOW, revision: 1
    }], knowledgeCandidates: [], validationRecords: [], memoryChangeRecords: [], orgMetrics: null, intelligenceLog: [], emergingPatterns: [], ticketRecords: [], ticketSequence: null } });
  updateStatuses(pkg);
  return refresh(pkg);
}

async function deleteAll(ids) {
  await Promise.all(ids.map(deleteIfPresent));
}

async function withFailureInjection(kind, action) {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousInjection = process.env.MIGRATION_IMPORT_FAILURE_INJECTION;
  process.env.NODE_ENV = "test";
  process.env.MIGRATION_IMPORT_FAILURE_INJECTION = kind;
  try {
    return await action();
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousInjection === undefined) delete process.env.MIGRATION_IMPORT_FAILURE_INJECTION;
    else process.env.MIGRATION_IMPORT_FAILURE_INJECTION = previousInjection;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the migration import probe.");
  const prisma = getPrismaClient();
  const ids = [ORG, ORG_TARGET, ORG_COLLISION, ORG_FAILURE, ORG_UNIQUE, ORG_MEMORY_CONFLICT, ORG_BAD_SEQUENCE, ORG_MEMORY_ROLLBACK, ORG_SEQUENCE_ROLLBACK, ORG_DUPLICATE_MEMORY, ORG_CROSS_MEMORY, ORG_SEQUENCE_SERVER, ORG_SEQUENCE_LOCAL, ORG_SEQUENCE_TICKET, ORG_SEQUENCE_EMPTY, ORG_SEQUENCE_CONCURRENT];
  try {
    await deleteAll(ids);
    await persistence.upsertOrganizationProfiles(ids.map((id) => profile(id)));

    const valid = await populatedPackage(ORG);
    const intake = await migration.intakeMigrationExportPackage(valid, ORG);
    const imported = await execution.executeMigrationImport(ORG, intake.batchId);
    assert.equal(imported.status, "imported");
    assert.equal(imported.resourceCheckpoints.find((row) => row.resourceType === "memoryChangeRecords").status, "imported");
    assert.equal(imported.resourceCheckpoints.find((row) => row.resourceType === "ticketSequence").status, "imported");
    assert.equal(imported.resourceCheckpoints.filter((row) => row.status === "imported").length, 9);
    assert.equal(await prisma.knowledgeItem.count({ where: { organizationId: ORG } }), 1);
    assert.equal((await prisma.knowledgeItem.findUnique({ where: { id: "import-knowledge-1" } })).revision, 4);
    const knowledge = await prisma.knowledgeItem.findUnique({ where: { id: "import-knowledge-1" } });
    assert.equal(knowledge.content.lessons[0].id, "import-lesson-1");
    assert.equal(knowledge.content.knowledgeVersions[0].versionId, "import-version-1");
    assert.equal(await prisma.knowledgeCandidate.count({ where: { organizationId: ORG } }), 1);
    assert.equal(await prisma.validationRecord.count({ where: { organizationId: ORG } }), 1);
    assert.equal(await prisma.ticketRecord.count({ where: { organizationId: ORG, ticketId: "MT-20260715-0015" } }), 1);
    assert.equal(await prisma.emergingPattern.count({ where: { organizationId: ORG } }), 1);
    assert.equal(await prisma.intelligenceLog.count({ where: { organizationId: ORG } }), 1);
    assert.equal(await prisma.orgMetrics.count({ where: { organizationId: ORG } }), 1);
    const memory = await prisma.memoryChangeRecord.findUnique({ where: { id: "import-memory-1" } });
    assert.equal(memory.organizationId, ORG);
    assert.equal(memory.validationRecordId, "import-validation-1");
    assert.deepEqual(memory.afterState, { id: "import-knowledge-1", title: "Imported Login Knowledge", revision: 4 });
    assert.equal(await prisma.ticketSequence.findUnique({ where: { organizationId: ORG } }).then((row) => row.counter), 15);

    const retry = await execution.executeMigrationImport(ORG, intake.batchId);
    assert.equal(retry.status, "imported");
    assert.equal(retry.noOp, true);
    assert.equal(await prisma.knowledgeItem.count({ where: { organizationId: ORG } }), 1);
    assert.equal(await prisma.ticketRecord.count({ where: { organizationId: ORG } }), 1);

    const serverHigher = await populatedPackage(ORG_SEQUENCE_SERVER);
    namespacePackage(serverHigher, "serverhigher");
    await refresh(serverHigher);
    await prisma.ticketSequence.create({ data: { organizationId: ORG_SEQUENCE_SERVER, counter: 20 } });
    const serverHigherBatch = await migration.intakeMigrationExportPackage(serverHigher, ORG_SEQUENCE_SERVER);
    assert.equal((await execution.executeMigrationImport(ORG_SEQUENCE_SERVER, serverHigherBatch.batchId)).status, "imported");
    assert.equal((await prisma.ticketSequence.findUnique({ where: { organizationId: ORG_SEQUENCE_SERVER } })).counter, 20);

    const localHigher = await populatedPackage(ORG_SEQUENCE_LOCAL);
    namespacePackage(localHigher, "localhigher");
    localHigher.resources.ticketSequence.counter = 30;
    await refresh(localHigher);
    const localHigherBatch = await migration.intakeMigrationExportPackage(localHigher, ORG_SEQUENCE_LOCAL);
    assert.equal((await execution.executeMigrationImport(ORG_SEQUENCE_LOCAL, localHigherBatch.batchId)).status, "imported");
    assert.equal((await prisma.ticketSequence.findUnique({ where: { organizationId: ORG_SEQUENCE_LOCAL } })).counter, 30);

    const ticketHigher = await populatedPackage(ORG_SEQUENCE_TICKET);
    namespacePackage(ticketHigher, "tickethigher");
    ticketHigher.resources.ticketRecords[0].ticketId = "tickethigher-20260715-0042";
    ticketHigher.resources.ticketSequence.counter = 0;
    await refresh(ticketHigher);
    const ticketHigherBatch = await migration.intakeMigrationExportPackage(ticketHigher, ORG_SEQUENCE_TICKET);
    assert.equal((await execution.executeMigrationImport(ORG_SEQUENCE_TICKET, ticketHigherBatch.batchId)).status, "imported");
    assert.equal((await prisma.ticketSequence.findUnique({ where: { organizationId: ORG_SEQUENCE_TICKET } })).counter, 42);

    const emptySequence = await emptyKnowledgePackage(ORG_SEQUENCE_EMPTY, "sequence-empty-knowledge");
    const emptySequenceBatch = await migration.intakeMigrationExportPackage(emptySequence, ORG_SEQUENCE_EMPTY);
    assert.equal((await execution.executeMigrationImport(ORG_SEQUENCE_EMPTY, emptySequenceBatch.batchId)).status, "imported");
    assert.equal((await prisma.ticketSequence.findUnique({ where: { organizationId: ORG_SEQUENCE_EMPTY } })).counter, 0);

    const concurrentSequence = await populatedPackage(ORG_SEQUENCE_CONCURRENT);
    namespacePackage(concurrentSequence, "concurrent");
    concurrentSequence.resources.ticketRecords[0].ticketId = "concurrent-20260715-0015";
    await refresh(concurrentSequence);
    const concurrentBatch = await migration.intakeMigrationExportPackage(concurrentSequence, ORG_SEQUENCE_CONCURRENT);
    const [, allocatedIds] = await Promise.all([
      execution.executeMigrationImport(ORG_SEQUENCE_CONCURRENT, concurrentBatch.batchId),
      persistence.allocateTicketIds(ORG_SEQUENCE_CONCURRENT, 1)
    ]);
    assert.equal(allocatedIds.length, 1);
    assert.ok((await prisma.ticketSequence.findUnique({ where: { organizationId: ORG_SEQUENCE_CONCURRENT } })).counter >= 15);

    const collision = await emptyKnowledgePackage(ORG_COLLISION, "cross-org-knowledge-1");
    await prisma.knowledgeItem.create({ data: {
      id: "cross-org-knowledge-1", organizationId: ORG_TARGET, title: "Owned Elsewhere", category: "access", lifecycleState: "active",
      sourceTicketId: "other-ticket", createdAt: new Date(NOW), approvedAt: new Date(NOW), revision: 1,
      timesReused: 0, content: { problem: "Other", approvedAnswer: "Other", tags: [], lessons: [], knowledgeVersions: [], learningHistory: [], exampleTickets: [] }
    } });
    const collisionBatch = await migration.intakeMigrationExportPackage(collision, ORG_COLLISION);
    const collisionResult = await execution.executeMigrationImport(ORG_COLLISION, collisionBatch.batchId);
    assert.equal(collisionResult.status, "conflict");
    const conflictCount = await prisma.migrationImportConflict.count({ where: { batchId: collisionBatch.batchId } });
    assert.equal(conflictCount, 1);
    const collisionRetry = await execution.executeMigrationImport(ORG_COLLISION, collisionBatch.batchId);
    assert.equal(collisionRetry.unresolvedConflictCount, 1);
    assert.equal(await prisma.migrationImportConflict.count({ where: { batchId: collisionBatch.batchId } }), conflictCount);
    assert.equal(await prisma.knowledgeItem.count({ where: { organizationId: ORG_COLLISION } }), 0);

    const memoryConflict = await populatedPackage(ORG_MEMORY_CONFLICT);
    namespacePackage(memoryConflict, "memory");
    await refresh(memoryConflict);
    const firstMemoryBatch = await migration.intakeMigrationExportPackage(memoryConflict, ORG_MEMORY_CONFLICT);
    const firstMemoryResult = await execution.executeMigrationImport(ORG_MEMORY_CONFLICT, firstMemoryBatch.batchId);
    assert.equal(firstMemoryResult.status, "imported");
    await prisma.memoryChangeRecord.update({ where: { id: "memory-memory-1" }, data: { afterState: { different: true } } });
    memoryConflict.resources.ticketSequence.counter = 11;
    await refresh(memoryConflict);
    const memoryConflictBatch = await migration.intakeMigrationExportPackage(memoryConflict, ORG_MEMORY_CONFLICT);
    const memoryConflictResult = await execution.executeMigrationImport(ORG_MEMORY_CONFLICT, memoryConflictBatch.batchId);
    assert.equal(memoryConflictResult.status, "conflict");
    assert.equal(memoryConflictResult.resourceCheckpoints.find((row) => row.resourceType === "memoryChangeRecords").status, "conflict");
    assert.equal(await prisma.memoryChangeRecord.count({ where: { organizationId: ORG_MEMORY_CONFLICT } }), 1);
    assert.deepEqual((await prisma.memoryChangeRecord.findUnique({ where: { id: "memory-memory-1" } })).afterState, { different: true });

    const memoryRollback = await populatedPackage(ORG_MEMORY_ROLLBACK);
    namespacePackage(memoryRollback, "rollback");
    const secondCandidate = JSON.parse(JSON.stringify(memoryRollback.resources.knowledgeCandidates[0]));
    secondCandidate.id = "rollback-candidate-2";
    const secondValidation = JSON.parse(JSON.stringify(memoryRollback.resources.validationRecords[0]));
    secondValidation.id = "rollback-validation-2";
    secondValidation.candidateId = secondCandidate.id;
    const secondMemory = JSON.parse(JSON.stringify(memoryRollback.resources.memoryChangeRecords[0]));
    secondMemory.id = "rollback-memory-2";
    secondMemory.candidateId = secondCandidate.id;
    secondMemory.validationRecordId = secondValidation.id;
    memoryRollback.resources.knowledgeCandidates.push(secondCandidate);
    memoryRollback.resources.validationRecords.push(secondValidation);
    memoryRollback.resources.memoryChangeRecords.push(secondMemory);
    updateStatuses(memoryRollback);
    await refresh(memoryRollback);
    const memoryRollbackBatch = await migration.intakeMigrationExportPackage(memoryRollback, ORG_MEMORY_ROLLBACK);
    const injectedMemoryResult = await withFailureInjection("memory-after-first", () => execution.executeMigrationImport(ORG_MEMORY_ROLLBACK, memoryRollbackBatch.batchId));
    assert.equal(injectedMemoryResult.status, "failed");
    assert.equal(await prisma.memoryChangeRecord.count({ where: { organizationId: ORG_MEMORY_ROLLBACK } }), 0);
    assert.equal((await execution.executeMigrationImport(ORG_MEMORY_ROLLBACK, memoryRollbackBatch.batchId)).status, "imported");
    assert.equal(await prisma.memoryChangeRecord.count({ where: { organizationId: ORG_MEMORY_ROLLBACK } }), 2);

    const sequenceRollback = await populatedPackage(ORG_SEQUENCE_ROLLBACK);
    namespacePackage(sequenceRollback, "sequence");
    await refresh(sequenceRollback);
    const sequenceRollbackBatch = await migration.intakeMigrationExportPackage(sequenceRollback, ORG_SEQUENCE_ROLLBACK);
    const injectedSequenceResult = await withFailureInjection("ticket-sequence-after-reconcile", () => execution.executeMigrationImport(ORG_SEQUENCE_ROLLBACK, sequenceRollbackBatch.batchId));
    assert.equal(injectedSequenceResult.status, "failed");
    assert.equal(await prisma.ticketSequence.count({ where: { organizationId: ORG_SEQUENCE_ROLLBACK } }), 0);
    assert.equal((await execution.executeMigrationImport(ORG_SEQUENCE_ROLLBACK, sequenceRollbackBatch.batchId)).status, "imported");
    assert.equal((await prisma.ticketSequence.findUnique({ where: { organizationId: ORG_SEQUENCE_ROLLBACK } })).counter, 10);

    const malformedSequence = await populatedPackage(ORG_BAD_SEQUENCE);
    namespacePackage(malformedSequence, "badsequence");
    malformedSequence.resources.ticketRecords[0].ticketId = "MT-IMPORT-1";
    await refresh(malformedSequence);
    const malformedBatch = await migration.intakeMigrationExportPackage(malformedSequence, ORG_BAD_SEQUENCE);
    const malformedResult = await execution.executeMigrationImport(ORG_BAD_SEQUENCE, malformedBatch.batchId);
    assert.equal(malformedResult.status, "conflict");
    assert.equal(malformedResult.resourceCheckpoints.find((row) => row.resourceType === "ticketSequence").status, "conflict");
    assert.equal(await prisma.ticketSequence.count({ where: { organizationId: ORG_BAD_SEQUENCE } }), 0);

    const duplicateMemory = await populatedPackage(ORG_DUPLICATE_MEMORY);
    namespacePackage(duplicateMemory, "duplicate");
    await refresh(duplicateMemory);
    const duplicateFirstBatch = await migration.intakeMigrationExportPackage(duplicateMemory, ORG_DUPLICATE_MEMORY);
    assert.equal((await execution.executeMigrationImport(ORG_DUPLICATE_MEMORY, duplicateFirstBatch.batchId)).status, "imported");
    const duplicateRecord = JSON.parse(JSON.stringify(duplicateMemory.resources.memoryChangeRecords[0]));
    duplicateRecord.id = "duplicate-memory-2";
    duplicateMemory.resources.memoryChangeRecords.push(duplicateRecord);
    duplicateMemory.resources.ticketSequence.counter = 11;
    await refresh(duplicateMemory);
    const duplicateBatch = await migration.intakeMigrationExportPackage(duplicateMemory, ORG_DUPLICATE_MEMORY);
    const duplicateResult = await execution.executeMigrationImport(ORG_DUPLICATE_MEMORY, duplicateBatch.batchId);
    assert.equal(duplicateResult.resourceCheckpoints.find((row) => row.resourceType === "memoryChangeRecords").status, "conflict");
    assert.equal(await prisma.memoryChangeRecord.count({ where: { organizationId: ORG_DUPLICATE_MEMORY } }), 1);

    const crossMemory = await populatedPackage(ORG_CROSS_MEMORY);
    namespacePackage(crossMemory, "crossmemory");
    await prisma.memoryChangeRecord.create({ data: {
      id: "crossmemory-memory-1", organizationId: ORG_TARGET, knowledgeItemId: "foreign-knowledge", candidateId: "foreign-candidate",
      validationRecordId: "foreign-validation", actorId: null, changeType: "create_version", beforeState: null,
      afterState: { foreign: true }, timestamp: new Date(NOW)
    } });
    await refresh(crossMemory);
    const crossMemoryBatch = await migration.intakeMigrationExportPackage(crossMemory, ORG_CROSS_MEMORY);
    const crossMemoryResult = await execution.executeMigrationImport(ORG_CROSS_MEMORY, crossMemoryBatch.batchId);
    assert.equal(crossMemoryResult.resourceCheckpoints.find((row) => row.resourceType === "memoryChangeRecords").status, "conflict");
    assert.equal(await prisma.memoryChangeRecord.count({ where: { organizationId: ORG_CROSS_MEMORY } }), 0);
    assert.equal(await prisma.memoryChangeRecord.count({ where: { organizationId: ORG_TARGET, id: "crossmemory-memory-1" } }), 1);

    const unique = await populatedPackage(ORG_UNIQUE);
    namespacePackage(unique, "unique");
    unique.resources.knowledge = [];
    unique.resources.knowledgeCandidates[0].relatedKnowledgeId = undefined;
    unique.resources.validationRecords[0].knowledgeId = undefined;
    unique.resources.validationRecords[0].knowledgeVersionId = undefined;
    unique.resources.ticketRecords = [];
    unique.resources.memoryChangeRecords = [];
    unique.resources.ticketSequence = null;
    unique.resources.emergingPatterns = [];
    unique.resources.intelligenceLog = [];
    unique.resources.orgMetrics = null;
    updateStatuses(unique);
    await refresh(unique);
    await prisma.knowledgeCandidate.create({ data: {
      id: "unique-candidate-1", organizationId: ORG_UNIQUE, sourceTicketIds: ["unique-20260715-0001"], proposedAction: "create_new",
      proposedContent: { solution: "Reset the session", customerResponseTemplate: "Retry after reset", internalGuidance: "Check session expiry" }, rationale: "Historical candidate",
      status: "validated", createdAt: new Date(NOW)
    } });
    await prisma.validationRecord.create({ data: {
      id: "unique-existing-validation", organizationId: ORG_UNIQUE, candidateId: "unique-candidate-1", knowledgeItemId: null,
      knowledgeVersionId: null, decision: "approved", actor: "Existing", actorId: null, roleExercised: "knowledge_validator",
      rationale: "Existing validation", timestamp: new Date(NOW)
    } });
    const uniqueBatch = await migration.intakeMigrationExportPackage(unique, ORG_UNIQUE);
    const uniqueResult = await execution.executeMigrationImport(ORG_UNIQUE, uniqueBatch.batchId);
    assert.equal(uniqueResult.status, "conflict");
    assert.equal(uniqueResult.resourceCheckpoints.find((row) => row.resourceType === "knowledgeCandidates").skippedIdenticalCount, 1);
    assert.equal(uniqueResult.resourceCheckpoints.find((row) => row.resourceType === "validationRecords").status, "conflict");
    assert.equal(await prisma.validationRecord.count({ where: { organizationId: ORG_UNIQUE } }), 1);
    assert.equal(await prisma.migrationImportConflict.count({ where: { batchId: uniqueBatch.batchId } }), 1);

    const failure = await populatedPackage(ORG_FAILURE);
    namespacePackage(failure, "failure");
    failure.resources.knowledge = failure.resources.knowledge.slice(0, 1);
    failure.resources.knowledgeCandidates[0].createdAt = "not-a-date";
    updateStatuses(failure);
    await refresh(failure);
    const failureBatch = await migration.intakeMigrationExportPackage(failure, ORG_FAILURE);
    const failureResult = await execution.executeMigrationImport(ORG_FAILURE, failureBatch.batchId);
    assert.equal(failureResult.status, "failed");
    const failedSummary = await migration.getMigrationImportBatch(ORG_FAILURE, failureBatch.batchId);
    assert.equal(failedSummary.status, "failed");
    assert.equal(failedSummary.resourceCheckpoints.find((row) => row.resourceType === "knowledge").status, "imported");
    assert.equal(failedSummary.resourceCheckpoints.find((row) => row.resourceType === "knowledgeCandidates").status, "failed");
    assert.equal(await prisma.knowledgeItem.count({ where: { organizationId: ORG_FAILURE } }), 1);
    assert.equal(await prisma.knowledgeCandidate.count({ where: { organizationId: ORG_FAILURE } }), 0);

    console.log("migration import probe passed: dependency order, preservation, deferral, idempotency, conflicts, isolation, and resource rollback");
  } finally {
    await deleteAll(ids);
  }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { populatedPackage, updateStatuses, profile, persistence, deleteIfPresent, ORG, ORG_TARGET, ORG_COLLISION };
