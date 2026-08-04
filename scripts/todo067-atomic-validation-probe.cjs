/*
 * TODO-067 Atomic Validation & Promotion Boundary probe.
 *
 * This probe drives the real server persistence service and generic candidate
 * snapshot writer against disposable PostgreSQL organizations only. It never
 * uses, resets, reseeds, or migrates mature Organizational Memory.
 */
const assert = require("node:assert/strict");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not configured; TODO-067 requires PostgreSQL.");
  process.exit(1);
}

const service = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { getPrismaClient } = require(path.join(root, "lib", "server", "prisma.ts"));
const { LocalStorageAdapter } = require(path.join(root, "lib", "persistence", "localStorageAdapter.ts"));

const suffix = Date.now();
const ORG_A = `todo067-a-${suffix}`;
const ORG_B = `todo067-b-${suffix}`;
const ACTOR_A = { id: `todo067-actor-a-${suffix}`, name: "TODO-067 Reviewer A" };
const ACTOR_B = { id: `todo067-actor-b-${suffix}`, name: "TODO-067 Reviewer B" };
const NOW = new Date().toISOString();

function profile(id, name) {
  return {
    id,
    name,
    industry: "TODO-067 Probe",
    description: "Disposable atomic validation probe organization.",
    products: ["Probe Product"],
    services: ["Probe Service"],
    supportedDomains: ["probe"],
    businessVocabulary: [],
    supportedIssueTypes: ["probe issue"],
    outOfScopeTopics: [],
    customerTone: "professional",
    supportBoundaries: [],
    autoResolutionThreshold: 80,
    escalationRules: [],
    logoInitials: name.slice(0, 3).toUpperCase(),
    createdAt: NOW,
    updatedAt: NOW
  };
}

function item(organizationId, id, revision) {
  return {
    id,
    organizationId,
    title: `TODO-067 ${id}`,
    problem: "Disposable atomic validation problem.",
    approvedAnswer: "Disposable validated answer.",
    category: "Probe",
    tags: ["todo067"],
    sourceTicketId: "TODO067-SOURCE",
    timesReused: 0,
    createdAt: NOW,
    approvedAt: NOW,
    trustScore: 30,
    ...(revision === undefined ? {} : { revision }),
    lessons: [],
    knowledgeVersions: []
  };
}

function candidate(organizationId, id, action = "create_new", status = "proposed") {
  return {
    id,
    organizationId,
    sourceTicketIds: [],
    proposedAction: action,
    proposedContent: {
      solution: "Disposable solution.",
      customerResponseTemplate: "Disposable response.",
      internalGuidance: "Disposable guidance.",
      canonicalProblemTitle: `TODO-067 ${id}`,
      category: "Probe"
    },
    rationale: "TODO-067 atomic boundary probe.",
    status,
    createdAt: NOW
  };
}

function payload(organizationId, id, knowledgeItem, expectedKnowledgeRevision, overrides = {}) {
  const candidateId = `todo067-candidate-${id}`;
  const validationId = `todo067-validation-${id}`;
  const memoryChangeId = `todo067-memory-${id}`;
  const action = expectedKnowledgeRevision === null ? "create_new" : "merge_existing";
  return {
    candidate: candidate(organizationId, candidateId, overrides.action ?? action),
    validation: {
      id: validationId,
      organizationId,
      candidateId,
      knowledgeId: knowledgeItem.id,
      decision: overrides.decision ?? "approved",
      actor: "client-claimed-actor-must-not-win",
      roleExercised: "knowledge_validator",
      rationale: "TODO-067 probe decision.",
      timestamp: NOW
    },
    memoryChange: {
      id: memoryChangeId,
      organizationId,
      knowledgeId: knowledgeItem.id,
      candidateId,
      validationRecordId: validationId,
      changeType: overrides.action ?? action,
      beforeState: null,
      afterState: knowledgeItem,
      timestamp: NOW
    },
    knowledgeItem,
    expectedKnowledgeRevision,
    idempotencyKey: overrides.idempotencyKey ?? validationId
  };
}

function withCandidate(payloadValue, candidateValue) {
  return { ...payloadValue, candidate: { ...payloadValue.candidate, ...candidateValue } };
}

async function counts(prisma, organizationId, candidateId, knowledgeId) {
  const [candidateRow, validationCount, memoryCount, knowledgeRow, trustCount] = await Promise.all([
    prisma.knowledgeCandidate.findUnique({ where: { id: candidateId } }),
    prisma.validationRecord.count({ where: { organizationId, candidateId } }),
    prisma.memoryChangeRecord.count({ where: { organizationId, candidateId } }),
    prisma.knowledgeItem.findUnique({ where: { id: knowledgeId } }),
    prisma.trustEvidence.count({ where: { organizationId, knowledgeItemId: knowledgeId } })
  ]);
  return { candidateRow, validationCount, memoryCount, knowledgeRow, trustCount };
}

function deferred() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}

async function waitFor(predicate, label) {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function cleanup() {
  service.configureValidationCommitTestHooks(null);
  try { await service.deleteOrganization(ORG_A); } catch (error) { if (error?.code !== "ORGANIZATION_NOT_FOUND") throw error; }
  try { await service.deleteOrganization(ORG_B); } catch (error) { if (error?.code !== "ORGANIZATION_NOT_FOUND") throw error; }
}

async function main() {
  const prisma = getPrismaClient();
  await cleanup();
  await service.upsertOrganizationProfiles([profile(ORG_A, "TODO-067 A"), profile(ORG_B, "TODO-067 B")]);

  /* B1/B3: failure after candidate update rolls back the whole command. */
  const failed = payload(ORG_A, "failure", item(ORG_A, `todo067-knowledge-failure-${suffix}`, undefined), null);
  await service.saveKnowledgeCandidates(ORG_A, [failed.candidate]);
  service.configureValidationCommitTestHooks({
    afterCandidateUpdate: () => { throw new Error("TODO-067 injected failure after candidate update"); }
  });
  await assert.rejects(() => service.commitValidation(ORG_A, failed, ACTOR_A));
  service.configureValidationCommitTestHooks(null);
  let state = await counts(prisma, ORG_A, failed.candidate.id, failed.knowledgeItem.id);
  assert.equal(state.candidateRow.status, "proposed", "B1: candidate remains pending after rollback");
  assert.equal(state.validationCount, 0, "B1: no validation row after rollback");
  assert.equal(state.memoryCount, 0, "B1: no memory-change row after rollback");
  assert.equal(state.knowledgeRow, null, "B1: no knowledge row after rollback");
  assert.equal(state.trustCount, 0, "B1: no trust evidence after rollback");
  const bypassAttempt = { ...failed.candidate, status: "validated" };
  await assert.rejects(
    () => service.saveKnowledgeCandidates(ORG_A, [bypassAttempt]),
    (error) => error.code === "CONFLICT",
    "B1: candidate snapshot cannot advance lifecycle while command is failing"
  );
  const reloadedAfterFailure = (await service.loadKnowledgeCandidates(ORG_A)).find((entry) => entry.id === failed.candidate.id);
  assert.equal(reloadedAfterFailure.status, "proposed", "B3: reload shows authoritative pending state");

  /* B2: delayed authoritative commit still rejects the independent snapshot. */
  const delayed = payload(ORG_A, "delayed", item(ORG_A, `todo067-knowledge-delayed-${suffix}`, undefined), null);
  await service.saveKnowledgeCandidates(ORG_A, [delayed.candidate]);
  const gate = deferred();
  let candidateHookStarted = false;
  service.configureValidationCommitTestHooks({
    afterCandidateUpdate: async () => {
      candidateHookStarted = true;
      await gate.promise;
    }
  });
  const delayedCommit = service.commitValidation(ORG_A, delayed, ACTOR_A);
  await waitFor(() => candidateHookStarted, "delayed transaction candidate step");
  await assert.rejects(
    () => service.saveKnowledgeCandidates(ORG_A, [{ ...delayed.candidate, status: "validated" }]),
    (error) => error.code === "CONFLICT",
    "B2: delayed commit cannot be bypassed by candidate snapshot"
  );
  gate.release();
  const delayedResult = await delayedCommit;
  assert.equal(delayedResult.replayed, false);
  service.configureValidationCommitTestHooks(null);
  state = await counts(prisma, ORG_A, delayed.candidate.id, delayed.knowledgeItem.id);
  assert.equal(state.candidateRow.status, "validated", "B2: candidate advances only after authoritative commit");
  assert.equal(state.validationCount, 1);
  assert.equal(state.memoryCount, 1);

  /* Normal success, exact replay, and shape/audit result contract. */
  const success = payload(ORG_A, "success", item(ORG_A, `todo067-knowledge-success-${suffix}`, undefined), null);
  const committed = await service.commitValidation(ORG_A, success, ACTOR_A);
  assert.equal(committed.replayed, false);
  assert.equal(committed.candidate.status, "validated");
  assert.equal(committed.validation.actor, ACTOR_A.name, "actor attribution is server-resolved");
  assert.equal(committed.auditSummary.actorId, ACTOR_A.id);
  assert.equal(committed.auditSummary.organizationId, ORG_A);
  assert.equal(committed.memoryChange.validationRecordId, committed.validation.id);
  assert.equal(committed.knowledgeItem.id, success.knowledgeItem.id);
  const replayed = await service.commitValidation(ORG_A, success, ACTOR_A);
  assert.equal(replayed.replayed, true, "lost-response retry replays the committed aggregate");
  assert.equal(replayed.validation.id, committed.validation.id);
  state = await counts(prisma, ORG_A, success.candidate.id, success.knowledgeItem.id);
  assert.equal(state.validationCount, 1);
  assert.equal(state.memoryCount, 1);

  /* Reused idempotency identity with a different request is rejected. */
  const altered = { ...success, validation: { ...success.validation, decision: "rejected" } };
  await assert.rejects(
    () => service.commitValidation(ORG_A, altered, ACTOR_A),
    (error) => error.code === "CONFLICT",
    "different request content under one validation identity must conflict"
  );

  /* Two reviewers: one wins, one conflicts, and only one audit chain exists. */
  const concurrentItem = item(ORG_A, `todo067-knowledge-concurrent-${suffix}`, undefined);
  const reviewerA = payload(ORG_A, "concurrent-a", concurrentItem, null);
  const reviewerB = payload(ORG_A, "concurrent-b", concurrentItem, null);
  reviewerB.candidate.id = reviewerA.candidate.id;
  reviewerB.validation.candidateId = reviewerA.candidate.id;
  reviewerB.memoryChange.candidateId = reviewerA.candidate.id;
  const concurrentResults = await Promise.allSettled([
    service.commitValidation(ORG_A, reviewerA, ACTOR_A),
    service.commitValidation(ORG_A, reviewerB, ACTOR_B)
  ]);
  assert.equal(concurrentResults.filter((result) => result.status === "fulfilled").length, 1, "I1: one reviewer commits");
  assert.equal(concurrentResults.filter((result) => result.status === "rejected").length, 1, "I1: the other reviewer conflicts");
  const concurrentState = await counts(prisma, ORG_A, reviewerA.candidate.id, concurrentItem.id);
  assert.equal(concurrentState.validationCount, 1);
  assert.equal(concurrentState.memoryCount, 1);

  /* Stale knowledge revision rolls back its candidate lifecycle write. */
  const baselineItem = item(ORG_A, `todo067-knowledge-stale-${suffix}`, undefined);
  const baseline = payload(ORG_A, "stale-baseline", baselineItem, null);
  await service.commitValidation(ORG_A, baseline, ACTOR_A);
  const stale = payload(ORG_A, "stale-revision", { ...baselineItem, revision: 1 }, 0);
  await assert.rejects(() => service.commitValidation(ORG_A, stale, ACTOR_B), (error) => error.code === "CONFLICT");
  const staleState = await counts(prisma, ORG_A, stale.candidate.id, baselineItem.id);
  assert.equal(staleState.validationCount, 0, "I3: stale revision leaves no validation");
  assert.equal(staleState.memoryCount, 0, "I3: stale revision leaves no memory change");
  assert.equal(staleState.candidateRow, null, "I3: stale revision leaves no candidate");

  /* Failure injection at every transaction boundary. */
  for (const hookName of ["afterCandidateUpdate", "afterValidationCreate", "afterMemoryChangeCreate", "afterTrustEvidenceCreate", "afterKnowledgeUpdate"]) {
    const failing = payload(ORG_A, `hook-${hookName}`, item(ORG_A, `todo067-knowledge-${hookName}-${suffix}`, undefined), null);
    service.configureValidationCommitTestHooks({ [hookName]: () => { throw new Error(`TODO-067 injected ${hookName}`); } });
    await assert.rejects(() => service.commitValidation(ORG_A, failing, ACTOR_A), `failure at ${hookName} must reject`);
    service.configureValidationCommitTestHooks(null);
    const hookState = await counts(prisma, ORG_A, failing.candidate.id, failing.knowledgeItem.id);
    assert.equal(hookState.candidateRow, null, `${hookName}: candidate rolls back`);
    assert.equal(hookState.validationCount, 0, `${hookName}: validation rolls back`);
    assert.equal(hookState.memoryCount, 0, `${hookName}: memory change rolls back`);
    assert.equal(hookState.knowledgeRow, null, `${hookName}: knowledge rolls back`);
  }

  /* Cross-organization payload and replay identity isolation. */
  const crossOrg = payload(ORG_A, "cross-org", item(ORG_A, `todo067-knowledge-cross-${suffix}`, undefined), null);
  await assert.rejects(
    () => service.commitValidation(ORG_B, crossOrg, ACTOR_B),
    (error) => error.code === "CONFLICT",
    "J: another organization cannot submit A's candidate"
  );
  const crossOrgReplay = { ...success, candidate: { ...success.candidate, organizationId: ORG_B }, validation: { ...success.validation, organizationId: ORG_B }, memoryChange: { ...success.memoryChange, organizationId: ORG_B }, knowledgeItem: { ...success.knowledgeItem, organizationId: ORG_B } };
  await assert.rejects(
    () => service.commitValidation(ORG_B, crossOrgReplay, ACTOR_B),
    (error) => error.code === "CONFLICT",
    "J: replay identity cannot cross organization boundaries"
  );

  /* Local/server result-shape parity without browser storage writes. */
  const local = new LocalStorageAdapter();
  const localPayload = payload(ORG_B, "local-shape", item(ORG_B, `todo067-knowledge-local-${suffix}`, undefined), null);
  const localResult = await local.commitValidatedMemoryChange(ORG_B, localPayload);
  assert.deepEqual(Object.keys(localResult).sort(), Object.keys(committed).sort(), "L: local and server commit result shapes match");
  assert.deepEqual(Object.keys(localResult.auditSummary).sort(), Object.keys(committed.auditSummary).sort(), "L: audit summary shape matches");

  await cleanup();
  await prisma.$disconnect();
  console.log("TODO-067 atomic validation probe passed: rollback, delayed bypass prevention, replay, concurrency, stale revision, tenant isolation, and local/server parity.");
}

main().catch(async (error) => {
  try { await cleanup(); } catch (cleanupError) { console.error("TODO-067 cleanup failed:", cleanupError); }
  console.error(error);
  process.exitCode = 1;
});
