/* RSS-1.2E.2 — disposable concurrency and idempotency coverage. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();
const { getPrismaClient } = require(path.join(root, "lib", "server", "prisma.ts"));
const {
  commitValidation,
  deriveAuthoritativeOrgMetricValuesTx,
  loadOrgMetrics,
  loadKnowledge,
  prepareBulkTicketRecords,
  saveEmergingPatterns,
  saveKnowledge,
  saveTicketRecords
} = require(path.join(root, "lib", "server", "persistenceService.ts"));

const prisma = getPrismaClient();
const organizationId = `rss12e2-concurrency-${Date.now()}`;
const now = new Date();

function zeroMetrics() {
  return {
    organizationId,
    lifetimeTickets: 0,
    knowledgeReused: 0,
    autoResolutions: 0,
    humanResolutions: 0,
    totalResolutionTimeSec: 0,
    resolutionsCount: 0,
    memoryGrowthToday: 0,
    memoryGrowthDate: now.toISOString().slice(0, 10),
    mergedTickets: null,
    duplicatePreventions: null,
    knowledgeVersions: null,
    emergingPatternsDetected: null,
    promotedPatterns: null,
    aiCalls: null,
    aiSuccesses: null,
    aiFailures: null,
    aiFallbacks: null,
    aiAgreementSamples: null,
    aiAgreementTotal: null,
    humanAcceptedAISuggestions: null,
    lastUpdatedAt: now
  };
}

function ticket(index, status = "open") {
  const ticketId = `RSS12E2-${String(index).padStart(4, "0")}`;
  return {
    ticketId,
    orgId: organizationId,
    createdAt: new Date(now.getTime() + index).toISOString(),
    rawMessage: `Concurrent metric probe ticket ${index}`,
    subject: `Probe ${index}`,
    classification: null,
    memoryMatch: null,
    draftSource: null,
    resolution: { finalResponse: null, humanEdited: false, editDistanceNote: null, resolvedAt: status === "resolved" ? now.toISOString() : null },
    reflection: { decision: null, lessonCreatedId: null, lessonReinforcedId: null, knowledgeChanged: null },
    validationRecordIds: [],
    status,
    resolutionMode: status === "resolved" ? "human" : null
  };
}

function knowledgeItem(id, sourceTicketId, versions) {
  return {
    id,
    organizationId,
    title: "RSS-1.2E.2 concurrency knowledge",
    category: "Probe",
    canonicalProblemId: id,
    canonicalProblemTitle: "RSS-1.2E.2 concurrency knowledge",
    lifecycleState: "active",
    sourceTicketId,
    timesReused: 0,
    timesSeen: 1,
    successfulResolutions: 1,
    failedResolutions: 0,
    successRate: 1,
    trustScore: 30,
    autoResponseEligible: false,
    humanReviewCount: 1,
    automaticResolutionCount: 0,
    createdAt: now.toISOString(),
    approvedAt: now.toISOString(),
    lastUpdatedAt: now.toISOString(),
    lastValidatedAt: now.toISOString(),
    lastValidated: now.toISOString(),
    revision: versions.length,
    problem: "A disposable concurrency test problem",
    approvedAnswer: "A disposable concurrency test answer",
    internalGuidance: "Run the disposable metric test only.",
    customerResponseTemplate: "This is a disposable probe.",
    resolutionWorkflow: [],
    tags: ["probe"],
    lessons: [],
    exampleTickets: [{ ticketId: sourceTicketId, customerName: "Probe", originalIssue: "Probe", createdAt: now.toISOString(), resolutionMode: "human" }],
    knowledgeVersions: versions,
    learningHistory: []
  };
}

async function metricValues() {
  const row = await prisma.orgMetrics.findUnique({ where: { organizationId } });
  return {
    lifetimeTickets: row?.lifetimeTickets,
    knowledgeReused: row?.knowledgeReused,
    knowledgeVersions: row?.knowledgeVersions,
    emergingPatternsDetected: row?.emergingPatternsDetected
  };
}

async function main() {
  const counters = {};
  await prisma.organization.create({ data: { id: organizationId, name: "RSS-1.2E.2 Disposable", industry: "Test", description: "Disposable concurrency probe", settings: {}, createdAt: now, updatedAt: now } });
  await prisma.orgMetrics.create({ data: zeroMetrics() });
  try {
    const concurrentTickets = Array.from({ length: 100 }, (_, index) => saveTicketRecords(organizationId, [ticket(index + 1)]));
    await Promise.all(concurrentTickets);
    counters.concurrentTicketWrites = 100;
    assert.deepEqual((await metricValues()).lifetimeTickets, 100);

    const seeds = Array.from({ length: 100 }, (_, index) => ({ uploadKey: "rss12e2-bulk", entryId: `entry-${index + 1}`, rawMessage: `Bulk ${index + 1}`, subject: `Bulk ${index + 1}` }));
    await prepareBulkTicketRecords(organizationId, seeds);
    await prepareBulkTicketRecords(organizationId, seeds);
    counters.bulkImports = 100;
    assert.equal(await prisma.ticketRecord.count({ where: { organizationId } }), 200);
    assert.deepEqual((await metricValues()).lifetimeTickets, 200);

    const sourceTicketId = "RSS12E2-0001";
    const knowledgeId = "rss12e2-concurrency-knowledge";
    const versions = [{ versionId: `${knowledgeId}-v1`, version: 1, createdAt: now.toISOString(), changeReason: "initial", sourceTicketId }];
    const promoted = knowledgeItem(knowledgeId, sourceTicketId, versions);
    await commitValidation(organizationId, {
      candidate: { id: "rss12e2-candidate", organizationId, relatedKnowledgeId: null, sourceTicketIds: [sourceTicketId], proposedAction: "create_new", proposedContent: promoted, rationale: "RSS-1.2E.2 promotion", status: "proposed", createdAt: now.toISOString() },
      validation: { id: "rss12e2-validation", organizationId, candidateId: "rss12e2-candidate", knowledgeId: knowledgeId, knowledgeVersionId: `${knowledgeId}-v1`, decision: "approved", actor: "RSS-1.2E.2", actorId: "rss12e2-actor", roleExercised: "knowledge_validator", rationale: "probe", timestamp: now.toISOString() },
      memoryChange: { id: "rss12e2-memory", organizationId, knowledgeId, candidateId: "rss12e2-candidate", validationRecordId: "rss12e2-validation", actorId: "rss12e2-actor", changeType: "create_new", beforeState: null, afterState: promoted, timestamp: now.toISOString() },
      knowledgeItem: promoted,
      expectedKnowledgeRevision: null,
      idempotencyKey: "rss12e2-promotion"
    }, { id: "rss12e2-actor", name: "RSS-1.2E.2" });
    counters.reflectionPromotions = 1;
    assert.deepEqual((await metricValues()).knowledgeVersions, 1);

    const current = (await loadKnowledge(organizationId))[0];
    const v2 = { versionId: `${knowledgeId}-v2`, version: 2, createdAt: new Date(now.getTime() + 1).toISOString(), changeReason: "version concurrency probe", sourceTicketId };
    await saveKnowledge(organizationId, [{ ...current, revision: current.revision, knowledgeVersions: [...(current.knowledgeVersions ?? []), v2] }]);
    counters.versionCreations = 1;
    assert.deepEqual((await metricValues()).knowledgeVersions, 2);

    const patterns = Array.from({ length: 50 }, (_, index) => ({
      id: `rss12e2-pattern-${index + 1}`,
      organizationId,
      title: `Pattern ${index + 1}`,
      summary: "Disposable pattern",
      category: "Probe",
      tags: ["probe"],
      keywords: ["probe"],
      exampleTickets: [],
      timesSeen: 1,
      confidenceScore: 0.5,
      suggestedCanonicalProblem: false,
      status: "monitoring",
      firstSeenAt: now.toISOString(),
      lastSeenAt: now.toISOString()
    }));
    await saveEmergingPatterns(organizationId, patterns);
    await saveEmergingPatterns(organizationId, patterns.map((pattern) => ({ ...pattern, timesSeen: 2 })));
    counters.patternCreateAndStrengthenReplay = 50;
    assert.deepEqual((await metricValues()).emergingPatternsDetected, 50);

    const derived = await prisma.$transaction((tx) => deriveAuthoritativeOrgMetricValuesTx(tx, organizationId));
    const persisted = await metricValues();
    assert.deepEqual(persisted, derived);
    console.log(JSON.stringify({ organizationId, counters, persisted, derived, idempotentBulkReplay: true, disposableFixtureDeleted: false }, null, 2));
  } finally {
    await prisma.organization.delete({ where: { id: organizationId } });
  }
  console.log(JSON.stringify({ organizationId, disposableFixtureDeleted: true }));
}

main().catch((error) => {
  console.error(error);
  prisma.organization.delete({ where: { id: organizationId } }).catch(() => {}).finally(() => prisma.$disconnect());
  process.exitCode = 1;
});
