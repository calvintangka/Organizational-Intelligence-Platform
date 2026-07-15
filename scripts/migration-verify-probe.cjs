/* TODO-004 Batch 5.6 disposable post-import verification probe. */
const assert = require("node:assert/strict");
const intakeProbe = require("./migration-intake-probe.cjs");
const { populatedPackage } = require("./migration-import-probe.cjs");

const migration = require("../lib/server/migrationImportService.ts");
const execution = require("../lib/server/migrationImportExecutionService.ts");
const verification = require("../lib/server/migrationVerificationService.ts");

const ORG = "test-oip-migration-verify-a";
const ORG_DRIFT = "test-oip-migration-verify-drift";
const ORG_MEMORY = "test-oip-migration-verify-memory";
const ORG_SEQUENCE = "test-oip-migration-verify-sequence";
const ORG_EXTRA = "test-oip-migration-verify-extra";
const ORG_CONFLICT = "test-oip-migration-verify-conflict";
const ORG_TARGET = "test-oip-migration-verify-target";
const ORG_OTHER = "test-oip-migration-verify-other";
const NOW = "2026-07-15T00:00:00.000Z";

async function importPackage(organizationId) {
  const pkg = await populatedPackage(organizationId);
  const intake = await migration.intakeMigrationExportPackage(pkg, organizationId);
  const imported = await execution.executeMigrationImport(organizationId, intake.batchId);
  assert.equal(imported.status, "imported");
  assert.equal(imported.resourceCheckpoints.filter((checkpoint) => checkpoint.status === "imported").length, 9);
  return { pkg, batchId: intake.batchId };
}

async function businessCounts(prisma, organizationId) {
  const models = ["knowledgeItem", "knowledgeCandidate", "validationRecord", "memoryChangeRecord", "ticketRecord", "emergingPattern", "intelligenceLog", "orgMetrics", "ticketSequence"];
  return Object.fromEntries(await Promise.all(models.map(async (model) => [model, await prisma[model].count({ where: { organizationId } })])));
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the migration verification probe.");
  const prisma = intakeProbe.getPrismaClient();
  const ids = [ORG, ORG_DRIFT, ORG_MEMORY, ORG_SEQUENCE, ORG_EXTRA, ORG_CONFLICT, ORG_TARGET, ORG_OTHER];
  try {
    await Promise.all(ids.map(intakeProbe.deleteIfPresent));
    await intakeProbe.persistence.upsertOrganizationProfiles(ids.map((id) => intakeProbe.profile(id)));

    const clean = await importPackage(ORG);
    const cleanBefore = await businessCounts(prisma, ORG);
    const cleanVerified = await verification.verifyMigrationImport(ORG, clean.batchId);
    assert.equal(cleanVerified.status, "passed");
    assert.equal(cleanVerified.summary.status, "verified");
    assert.equal(cleanVerified.report.overallStatus, "passed");
    assert.equal(cleanVerified.report.unresolvedConflictCount, 0);
    assert.equal(cleanVerified.report.resourceResults.every((result) => result.digestMatch), true);
    assert.equal(cleanVerified.report.lessonCount.match, true);
    assert.equal(cleanVerified.report.versionCount.match, true);
    assert.equal(cleanVerified.report.auditRelationshipStatus, "pass");
    assert.equal(cleanVerified.report.ticketSequenceActual, 15);
    assert.deepEqual(await businessCounts(prisma, ORG), cleanBefore);
    assert.equal((await migration.getMigrationImportBatch(ORG, clean.batchId)).resourceCheckpoints.every((checkpoint) => checkpoint.status === "verified"), true);
    const cleanRetry = await verification.verifyMigrationImport(ORG, clean.batchId);
    assert.equal(cleanRetry.noOp, true);
    assert.equal(cleanRetry.status, "passed");
    await intakeProbe.deleteIfPresent(ORG);

    const drift = await importPackage(ORG_DRIFT);
    await prisma.knowledgeItem.update({ where: { id: "import-knowledge-1" }, data: { title: "Drifted after import" } });
    const driftFailure = await verification.verifyMigrationImport(ORG_DRIFT, drift.batchId);
    assert.equal(driftFailure.status, "failed");
    assert.equal(driftFailure.summary.status, "imported");
    assert.equal(driftFailure.report.resourceResults.find((result) => result.resourceType === "knowledge").digestMatch, false);
    await prisma.knowledgeItem.update({ where: { id: "import-knowledge-1" }, data: { title: "Imported Login Knowledge" } });
    assert.equal((await verification.verifyMigrationImport(ORG_DRIFT, drift.batchId)).status, "passed");
    await intakeProbe.deleteIfPresent(ORG_DRIFT);

    const missingMemory = await importPackage(ORG_MEMORY);
    await prisma.memoryChangeRecord.delete({ where: { id: "import-memory-1" } });
    const missingMemoryFailure = await verification.verifyMigrationImport(ORG_MEMORY, missingMemory.batchId);
    assert.equal(missingMemoryFailure.status, "failed");
    assert.equal(missingMemoryFailure.report.resourceResults.find((result) => result.resourceType === "memoryChangeRecords").missingCount, 1);
    const memorySource = missingMemory.pkg.resources.memoryChangeRecords[0];
    await prisma.memoryChangeRecord.create({ data: {
      id: memorySource.id, organizationId: ORG_MEMORY, knowledgeItemId: memorySource.knowledgeId, candidateId: memorySource.candidateId,
      validationRecordId: memorySource.validationRecordId, actorId: null, changeType: memorySource.changeType, beforeState: null,
      afterState: memorySource.afterState, timestamp: new Date(memorySource.timestamp)
    } });
    assert.equal((await verification.verifyMigrationImport(ORG_MEMORY, missingMemory.batchId)).status, "passed");
    await intakeProbe.deleteIfPresent(ORG_MEMORY);

    const lowerSequence = await importPackage(ORG_SEQUENCE);
    await prisma.ticketSequence.update({ where: { organizationId: ORG_SEQUENCE }, data: { counter: 0 } });
    const lowerSequenceFailure = await verification.verifyMigrationImport(ORG_SEQUENCE, lowerSequence.batchId);
    assert.equal(lowerSequenceFailure.status, "failed");
    assert.equal(lowerSequenceFailure.report.ticketSequenceSafe, false);
    await prisma.ticketSequence.update({ where: { organizationId: ORG_SEQUENCE }, data: { counter: 20 } });
    const higherSequence = await verification.verifyMigrationImport(ORG_SEQUENCE, lowerSequence.batchId);
    assert.equal(higherSequence.status, "passed");
    assert.equal(higherSequence.report.ticketSequenceSafe, true);
    assert.equal(higherSequence.report.ticketSequenceActual, 20);
    await intakeProbe.deleteIfPresent(ORG_SEQUENCE);

    const extra = await importPackage(ORG_EXTRA);
    await prisma.knowledgeItem.create({ data: {
      id: "preexisting-extra-knowledge", organizationId: ORG_EXTRA, title: "Pre-existing extra", category: "access", lifecycleState: "active",
      sourceTicketId: "extra-ticket", createdAt: new Date(NOW), approvedAt: new Date(NOW), revision: 1, timesReused: 0,
      content: { problem: "extra", approvedAnswer: "extra", tags: [], lessons: [], knowledgeVersions: [], learningHistory: [], exampleTickets: [] }
    } });
    const extraResult = await verification.verifyMigrationImport(ORG_EXTRA, extra.batchId);
    assert.equal(extraResult.status, "passed");
    assert.equal(extraResult.report.resourceResults.find((result) => result.resourceType === "knowledge").extraCount, 1);
    await intakeProbe.deleteIfPresent(ORG_EXTRA);

    const conflictPackage = await populatedPackage(ORG_CONFLICT);
    await prisma.knowledgeItem.create({ data: {
      id: "import-knowledge-1", organizationId: ORG_TARGET, title: "Owned by another organization", category: "access", lifecycleState: "active",
      sourceTicketId: "foreign-ticket", createdAt: new Date(NOW), approvedAt: new Date(NOW), revision: 1, timesReused: 0,
      content: { problem: "foreign", approvedAnswer: "foreign", tags: [], lessons: [], knowledgeVersions: [], learningHistory: [], exampleTickets: [] }
    } });
    const conflictIntake = await migration.intakeMigrationExportPackage(conflictPackage, ORG_CONFLICT);
    const conflictImport = await execution.executeMigrationImport(ORG_CONFLICT, conflictIntake.batchId);
    assert.equal(conflictImport.status, "conflict");
    const conflictVerification = await verification.verifyMigrationImport(ORG_CONFLICT, conflictIntake.batchId);
    assert.equal(conflictVerification.status, "failed");
    assert.ok(conflictVerification.report.unresolvedConflictCount > 0);
    await assert.rejects(() => verification.verifyMigrationImport(ORG_OTHER, conflictIntake.batchId), (error) => error?.code === "IMPORT_NOT_FOUND");

    console.log("migration verification probe passed: clean verification, normalized digests, nested lesson/version and audit checks, retry, drift and repair, missing memory, sequence safety, extras, conflicts, and organization isolation");
  } finally {
    await Promise.all(ids.map(intakeProbe.deleteIfPresent));
  }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { importPackage, profile: intakeProbe.profile, persistence: intakeProbe.persistence, deleteIfPresent: intakeProbe.deleteIfPresent };
