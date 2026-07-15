/* TODO-004 Batch 5.4 deterministic dependency-ordered import probe. */
const assert = require("node:assert/strict");
const { packageFor, refresh, deleteIfPresent, profile, persistence, getPrismaClient } = require("./migration-intake-probe.cjs");

const migration = require("../lib/server/migrationImportService.ts");
const execution = require("../lib/server/migrationImportExecutionService.ts");

const ORG = "test-oip-migration-import-a";
const ORG_TARGET = "test-oip-migration-import-b";
const ORG_COLLISION = "test-oip-migration-import-c";
const ORG_FAILURE = "test-oip-migration-import-f";
const ORG_UNIQUE = "test-oip-migration-import-u";
const NOW = "2026-07-15T00:00:00.000Z";

function populatedResources(organizationId) {
  return {
    knowledge: [{
      id: "import-knowledge-1", organizationId, title: "Imported Login Knowledge", problem: "Users cannot sign in",
      approvedAnswer: "Reset the sign-in session.", category: "access", tags: ["login"], sourceTicketId: "MT-IMPORT-1",
      timesReused: 2, createdAt: NOW, approvedAt: NOW, revision: 4,
      knowledgeVersions: [{ versionId: "import-version-1", version: 1, createdAt: NOW, changeReason: "historical", sourceTicketId: "MT-IMPORT-1", summary: "Initial version" }],
      lessons: [{ id: "import-lesson-1", rootCause: "Expired session", solution: "Reset session", customerResponse: "Please retry after resetting your session.", signals: ["login"], createdAt: NOW, sourceTicketId: "MT-IMPORT-1" }],
      learningHistory: [{ id: "import-history-1", event: "historical import", createdAt: NOW }]
    }],
    knowledgeCandidates: [{
      id: "import-candidate-1", organizationId, sourceTicketIds: ["MT-IMPORT-1"], proposedAction: "create_new",
      proposedContent: { solution: "Reset the session", customerResponseTemplate: "Retry after reset", internalGuidance: "Check session expiry" },
      relatedKnowledgeId: "import-knowledge-1", rationale: "Historical candidate", status: "validated", createdAt: NOW
    }],
    validationRecords: [{
      id: "import-validation-1", organizationId, candidateId: "import-candidate-1", knowledgeId: "import-knowledge-1",
      knowledgeVersionId: "import-version-1", decision: "approved", actor: "Historical Reviewer", roleExercised: "knowledge_validator",
      rationale: "Historical approval", timestamp: NOW
    }],
    memoryChangeRecords: [],
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
      status: "monitoring", tags: ["login"], keywords: ["session"], exampleTickets: ["MT-IMPORT-1"], timesSeen: 1,
      confidenceScore: 0.8, suggestedCanonicalProblem: false, firstSeenAt: NOW, lastSeenAt: NOW
    }],
    ticketRecords: [{
      ticketId: "MT-IMPORT-1", orgId: organizationId, createdAt: NOW, rawMessage: "Cannot sign in", subject: "Login",
      classification: null, memoryMatch: null, draftSource: "deterministic", resolution: { status: "resolved" },
      reflection: { decision: "approved", lessonCreatedId: "import-lesson-1", lessonReinforcedId: null, knowledgeChanged: "import-knowledge-1" },
      validationRecordIds: ["import-validation-1"], status: "resolved"
    }],
    ticketSequence: null
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
  const ticketId = `${prefix}-ticket-1`;
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
  }], knowledgeCandidates: [], validationRecords: [], orgMetrics: null, intelligenceLog: [], emergingPatterns: [], ticketRecords: [], ticketSequence: null } });
  updateStatuses(pkg);
  return refresh(pkg);
}

async function deleteAll(ids) {
  await Promise.all(ids.map(deleteIfPresent));
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the migration import probe.");
  const prisma = getPrismaClient();
  const ids = [ORG, ORG_TARGET, ORG_COLLISION, ORG_FAILURE, ORG_UNIQUE];
  try {
    await deleteAll(ids);
    await persistence.upsertOrganizationProfiles(ids.map((id) => profile(id)));

    const valid = await populatedPackage(ORG);
    const intake = await migration.intakeMigrationExportPackage(valid, ORG);
    const imported = await execution.executeMigrationImport(ORG, intake.batchId);
    assert.equal(imported.status, "partial");
    assert.equal(imported.resourceCheckpoints.find((row) => row.resourceType === "memoryChangeRecords").status, "pending");
    assert.equal(imported.resourceCheckpoints.find((row) => row.resourceType === "ticketSequence").status, "pending");
    assert.equal(imported.resourceCheckpoints.filter((row) => row.status === "imported").length, 7);
    assert.equal(await prisma.knowledgeItem.count({ where: { organizationId: ORG } }), 1);
    assert.equal((await prisma.knowledgeItem.findUnique({ where: { id: "import-knowledge-1" } })).revision, 4);
    const knowledge = await prisma.knowledgeItem.findUnique({ where: { id: "import-knowledge-1" } });
    assert.equal(knowledge.content.lessons[0].id, "import-lesson-1");
    assert.equal(knowledge.content.knowledgeVersions[0].versionId, "import-version-1");
    assert.equal(await prisma.knowledgeCandidate.count({ where: { organizationId: ORG } }), 1);
    assert.equal(await prisma.validationRecord.count({ where: { organizationId: ORG } }), 1);
    assert.equal(await prisma.ticketRecord.count({ where: { organizationId: ORG, ticketId: "MT-IMPORT-1" } }), 1);
    assert.equal(await prisma.emergingPattern.count({ where: { organizationId: ORG } }), 1);
    assert.equal(await prisma.intelligenceLog.count({ where: { organizationId: ORG } }), 1);
    assert.equal(await prisma.orgMetrics.count({ where: { organizationId: ORG } }), 1);
    assert.equal(await prisma.memoryChangeRecord.count({ where: { organizationId: ORG } }), 0);
    assert.equal(await prisma.ticketSequence.count({ where: { organizationId: ORG } }), 0);

    const retry = await execution.executeMigrationImport(ORG, intake.batchId);
    assert.equal(retry.status, "partial");
    assert.equal(retry.noOp, true);
    assert.equal(await prisma.knowledgeItem.count({ where: { organizationId: ORG } }), 1);
    assert.equal(await prisma.ticketRecord.count({ where: { organizationId: ORG } }), 1);

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

    const unique = await populatedPackage(ORG_UNIQUE);
    namespacePackage(unique, "unique");
    unique.resources.knowledge = [];
    unique.resources.knowledgeCandidates[0].relatedKnowledgeId = undefined;
    unique.resources.validationRecords[0].knowledgeId = undefined;
    unique.resources.validationRecords[0].knowledgeVersionId = undefined;
    unique.resources.ticketRecords = [];
    unique.resources.emergingPatterns = [];
    unique.resources.intelligenceLog = [];
    unique.resources.orgMetrics = null;
    updateStatuses(unique);
    await refresh(unique);
    await prisma.knowledgeCandidate.create({ data: {
      id: "unique-candidate-1", organizationId: ORG_UNIQUE, sourceTicketIds: ["unique-ticket-1"], proposedAction: "create_new",
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
