/* TODO-065 disposable-org transaction, redaction, and retry probe. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();
const { getPrismaClient } = require(path.join(root, "lib", "server", "prisma.ts"));
const { createOpaqueProvenanceId } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { runHistoricalAuditMigration, HISTORICAL_AUDIT_METADATA_KEY } = require(path.join(root, "lib", "server", "historicalAuditMigrationService.ts"));

async function main() {
  const prisma = getPrismaClient();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const organizationId = `todo065-disposable-${suffix}`;
  const ticketId = `TODO065-TICKET-${suffix}`;
  const knowledgeId = `todo065-knowledge-${suffix}`;
  const candidateId = `todo065-candidate-${suffix}`;
  const validationId = `todo065-validation-${suffix}`;
  const memoryId = `todo065-memory-${suffix}`;
  const now = new Date();
  try {
    await prisma.organization.create({ data: { id: organizationId, name: "TODO-065 Disposable", industry: "Test", description: "Disposable migration probe organization", settings: {}, createdAt: now, updatedAt: now } });
    await prisma.ticketRecord.create({ data: { organizationId, ticketId, rawMessage: "Historical probe ticket", subject: "Historical probe", resolution: {}, reflection: {}, validationRecordIds: [], createdAt: now } });
    const lesson = { id: `${knowledgeId}-lesson`, rootCause: "Probe cause", solution: "Probe resolution", customerResponse: "Hello {{customerName}}", signals: ["probe"], createdAt: now.toISOString(), sourceTicketId: ticketId, sourceTicketIds: [ticketId] };
    const content = { problem: "Probe problem", approvedAnswer: "Probe answer", lessons: [lesson], exampleTickets: [{ ticketId, customerName: "Probe customer", originalIssue: "Probe copied message", createdAt: now.toISOString(), resolutionMode: "human" }], knowledgeVersions: [{ versionId: `${knowledgeId}-v1`, createdAt: now.toISOString(), changeReason: "probe", sourceTicketId: ticketId }] };
    await prisma.knowledgeItem.create({ data: { id: knowledgeId, organizationId, title: "TODO-065 probe", category: "Probe", sourceTicketId: ticketId, timesReused: 0, trustScore: 30, createdAt: now, approvedAt: now, content } });
    await prisma.knowledgeCandidate.create({ data: { id: candidateId, organizationId, sourceTicketIds: [ticketId], proposedAction: "create_new", proposedContent: { solution: "Probe", customerResponseTemplate: "Probe", internalGuidance: "Probe" }, rationale: "Probe rationale", status: "validated", createdAt: now } });
    await prisma.validationRecord.create({ data: { id: validationId, organizationId, candidateId, knowledgeItemId: knowledgeId, knowledgeVersionId: `${knowledgeId}-v1`, decision: "approved", actor: "Probe validator", actorId: "probe-actor", roleExercised: "knowledge_validator", rationale: "Probe validation", timestamp: now } });
    await prisma.memoryChangeRecord.create({ data: { id: memoryId, organizationId, knowledgeItemId: knowledgeId, candidateId, validationRecordId: validationId, actorId: "probe-actor", changeType: "create_new", beforeState: null, afterState: content, timestamp: now } });
    await prisma.trustEvidence.create({ data: { organizationId, knowledgeItemId: knowledgeId, sourceTicketId: ticketId, trustEventType: "HUMAN_REUSE", validationRecordId: validationId, delta: 1, createdAt: now } });

    const before = await prisma.knowledgeItem.findUnique({ where: { id: knowledgeId }, select: { content: true, revision: true } });
    const dryRun = await runHistoricalAuditMigration(organizationId, { confirm: false });
    assert.equal(dryRun.writesPerformed, false);
    assert.equal(dryRun.inventory.expectedRowCountChanges.knowledgeItems, 0);
    assert.equal(dryRun.inventory.expectedUpdatedRows.knowledgeItems, 1);
    const afterDryRun = await prisma.knowledgeItem.findUnique({ where: { id: knowledgeId }, select: { content: true, revision: true } });
    assert.deepEqual(afterDryRun, before, "dry-run must perform zero writes");

    await assert.rejects(() => runHistoricalAuditMigration(organizationId, { confirm: true, injectFailureAfter: 1 }), /injected transaction failure/);
    const afterFailure = await prisma.knowledgeItem.findUnique({ where: { id: knowledgeId }, select: { content: true, revision: true } });
    assert.deepEqual(afterFailure, before, "injected failure must roll back the transaction");

    const committed = await runHistoricalAuditMigration(organizationId, { confirm: true });
    assert.equal(committed.writesPerformed, true);
    assert.equal(committed.rowsChanged, 1);
    const migrated = await prisma.knowledgeItem.findUnique({ where: { id: knowledgeId }, select: { content: true, revision: true } });
    assert.equal(migrated.content.lessons[0].sourceTicketId, createOpaqueProvenanceId(ticketId));
    assert.equal(migrated.content.exampleTickets[0].ticketId, createOpaqueProvenanceId(ticketId));
    assert.equal(migrated.content[HISTORICAL_AUDIT_METADATA_KEY].protectedOriginLinks[0].ticketIds[0], ticketId);

    const retry = await runHistoricalAuditMigration(organizationId, { confirm: true });
    assert.equal(retry.idempotentNoOp, true);
    assert.equal(retry.rowsChanged, 0);
    console.log(JSON.stringify({ verdict: "PASS", organizationId, dryRunWrites: dryRun.writesPerformed, rollbackPreserved: true, committedRows: committed.rowsChanged, retryRows: retry.rowsChanged }, null, 2));
  } finally {
    await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
