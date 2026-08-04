/* TODO-019 live acceptance: governed label apply, approval, worker execution, reversal, and safety. */
const assert = require("node:assert/strict");
const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();
const path = require("node:path");
const { prisma } = require(path.join(root, "lib/server/prisma.ts"));
const { createPersistenceContext } = require(path.join(root, "lib/persistence/context.ts"));
const { AsyncJobWorker } = require(path.join(root, "lib/server/jobs/worker.ts"));
const { prepareGovernedAction, approveGovernedAction, reverseGovernedAction, GovernedActionError, getGovernedAction } = require(path.join(root, "lib/server/actions/actionService.ts"));
const { getActionPolicy } = require(path.join(root, "lib/server/actions/policyEngine.ts"));
const { upsertOrganizationProfile } = require(path.join(root, "lib/server/persistenceService.ts"));

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `todo019-action-${suffix}`;
const otherOrganizationId = `todo019-other-${suffix}`;
const ownerId = `todo019-owner-${suffix}`;
const viewerId = `todo019-viewer-${suffix}`;
const ticketId = `ticket-${suffix}`;

function profile(id) {
  const now = new Date().toISOString();
  return { id, name: `TODO-019 ${id}`, industry: "Support", description: "Disposable governed action acceptance organization", products: [], services: [], supportedDomains: [], businessVocabulary: [], supportedIssueTypes: [], outOfScopeTopics: [], customerTone: "professional", supportBoundaries: [], autoResolutionThreshold: 80, escalationRules: [], createdAt: now, updatedAt: now, profileRevision: 0 };
}

function context() {
  return createPersistenceContext({ organizationId, actorContext: { id: ownerId }, authority: "server", requestId: `todo019-${suffix}`, correlationId: `todo019-correlation-${suffix}` });
}

async function runWorker(workerId) {
  const worker = new AsyncJobWorker({ workerId, pollMs: 15, leaseMs: 5_000, concurrency: 1 });
  worker.start();
  return worker;
}

async function waitForTerminal(jobId) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const job = await prisma.durableJob.findUnique({ where: { id: jobId } });
    if (job && ["succeeded", "failed", "cancelled", "dead_lettered"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`Timed out waiting for governed action job ${jobId}.`);
}

async function main() {
  let workerA;
  let workerB;
  try {
    await upsertOrganizationProfile(profile(organizationId));
    await upsertOrganizationProfile(profile(otherOrganizationId));
    await prisma.user.createMany({ data: [
      { id: ownerId, name: "TODO-019 Owner", email: `${ownerId}@example.test`, passwordHash: "probe-only", updatedAt: new Date() },
      { id: viewerId, name: "TODO-019 Viewer", email: `${viewerId}@example.test`, passwordHash: "probe-only", updatedAt: new Date() }
    ] });
    await prisma.organizationMembership.createMany({ data: [
      { userId: ownerId, organizationId, role: "owner" },
      { userId: viewerId, organizationId, role: "viewer" }
    ] });
    await prisma.organizationRoleAssignment.createMany({ data: [
      { id: `assignment-owner-${suffix}`, userId: ownerId, organizationId, roleId: "role_owner", updatedAt: new Date() },
      { id: `assignment-viewer-${suffix}`, userId: viewerId, organizationId, roleId: "role_viewer", updatedAt: new Date() }
    ] });
    await prisma.ticketRecord.create({ data: { id: `record-${suffix}`, organizationId, ticketId, rawMessage: "Password reset is required.", subject: "Password reset", status: "in_review", resolution: {}, reflection: {}, validationRecordIds: [], labels: [], createdAt: new Date() } });

    const countsBefore = { knowledge: await prisma.knowledgeItem.count({ where: { organizationId } }), jobs: await prisma.durableJob.count({ where: { organizationId } }) };
    await assert.rejects(() => prepareGovernedAction({ organizationId, actorId: viewerId, actionType: "ticket.label.apply", ticketId, label: "password-reset", preparationReason: "viewer must be denied", evidenceSummary: ["deterministic classification"], requestId: `denied-${suffix}`, correlationId: `denied-${suffix}`, idempotencyKey: `denied-${suffix}` }), (error) => error instanceof GovernedActionError && error.code === "AUTHORIZATION_DENIED");
    await assert.rejects(() => prepareGovernedAction({ organizationId, actorId: ownerId, actionType: "ticket.label.apply", ticketId, label: "not-allowlisted", preparationReason: "policy must reject", evidenceSummary: ["deterministic classification"], requestId: `policy-${suffix}`, correlationId: `policy-${suffix}`, idempotencyKey: `policy-${suffix}` }), (error) => error instanceof GovernedActionError && error.code === "POLICY_DENIED");
    await assert.rejects(() => prepareGovernedAction({ organizationId: otherOrganizationId, actorId: ownerId, actionType: "ticket.label.apply", ticketId, label: "password-reset", preparationReason: "tenant must reject", evidenceSummary: ["deterministic classification"], requestId: `tenant-${suffix}`, correlationId: `tenant-${suffix}`, idempotencyKey: `tenant-${suffix}` }), (error) => error instanceof GovernedActionError && error.code === "AUTHORIZATION_DENIED");

    const preparedInput = { organizationId, actorId: ownerId, actionType: "ticket.label.apply", ticketId, label: "password-reset", preparationReason: "Deterministic password-reset classification matched the registered low-risk label action.", evidenceSummary: ["canonical password-reset classification"], requestId: `apply-${suffix}`, correlationId: `apply-correlation-${suffix}`, idempotencyKey: `apply-${suffix}` };
    const prepared = await prepareGovernedAction(preparedInput);
    assert.equal(prepared.status, "awaiting_approval");
    let ticket = await prisma.ticketRecord.findUnique({ where: { organizationId_ticketId: { organizationId, ticketId } } });
    assert.deepEqual(ticket.labels, [], "preparation must not mutate the ticket");
    const replay = await prepareGovernedAction(preparedInput);
    assert.equal(replay.id, prepared.id, "same action key and digest replay the action");
    await assert.rejects(() => prepareGovernedAction({ ...preparedInput, label: "billing" }), (error) => error instanceof GovernedActionError && error.code === "IDEMPOTENCY_CONFLICT");
    await assert.rejects(() => approveGovernedAction({ organizationId, actorId: viewerId, actionId: prepared.id, decision: "approved", requestId: `viewer-approve-${suffix}`, correlationId: `viewer-approve-${suffix}`, idempotencyKey: `viewer-approve:${prepared.id}` }), (error) => error instanceof GovernedActionError && error.code === "AUTHORIZATION_DENIED");

    const approved = await approveGovernedAction({ organizationId, actorId: ownerId, actionId: prepared.id, decision: "approved", comment: "Confirmed low-risk ticket label.", requestId: `approve-${suffix}`, correlationId: `approve-correlation-${suffix}`, idempotencyKey: `approve:${prepared.id}` });
    assert.equal(approved.status, "execution_queued");
    const executionJobId = approved.executionJobId;
    assert.equal(typeof executionJobId, "string");
    const duplicateApproval = await assert.rejects(() => approveGovernedAction({ organizationId, actorId: ownerId, actionId: prepared.id, decision: "approved", requestId: `approve-duplicate-${suffix}`, correlationId: `approve-duplicate-${suffix}`, idempotencyKey: `approve:${prepared.id}` }), /Only actions awaiting approval/);
    void duplicateApproval;

    workerA = await runWorker(`todo019-worker-a-${suffix}`);
    workerB = await runWorker(`todo019-worker-b-${suffix}`);
    const job = await waitForTerminal(executionJobId);
    await workerA.stop(); await workerB.stop(); workerA = null; workerB = null;
    assert.equal(job.status, "succeeded");
    ticket = await prisma.ticketRecord.findUnique({ where: { organizationId_ticketId: { organizationId, ticketId } } });
    assert.deepEqual(ticket.labels, ["password-reset"], "approved worker execution applies exactly one label");
    const succeededEntries = await prisma.actionLedgerEntry.count({ where: { actionId: prepared.id, eventType: "execution_succeeded" } });
    assert.equal(succeededEntries, 1, "concurrent workers produce one intended effect and one success ledger entry");

    const reversalPrepared = await reverseGovernedAction({ organizationId, actorId: ownerId, actionId: prepared.id, preparationReason: "Human requested reversal.", requestId: `reverse-${suffix}`, correlationId: `reverse-correlation-${suffix}`, idempotencyKey: `reversal:${prepared.id}` });
    assert.equal(reversalPrepared.status, "awaiting_approval");
    const reversalApproved = await approveGovernedAction({ organizationId, actorId: ownerId, actionId: reversalPrepared.id, decision: "approved", comment: "Confirmed reversal.", requestId: `reverse-approve-${suffix}`, correlationId: `reverse-approve-correlation-${suffix}`, idempotencyKey: `approval:${reversalPrepared.id}:approved` });
    workerA = await runWorker(`todo019-reversal-a-${suffix}`);
    workerB = await runWorker(`todo019-reversal-b-${suffix}`);
    const reversalJob = await waitForTerminal(reversalApproved.executionJobId);
    await workerA.stop(); await workerB.stop(); workerA = null; workerB = null;
    assert.equal(reversalJob.status, "succeeded");
    ticket = await prisma.ticketRecord.findUnique({ where: { organizationId_ticketId: { organizationId, ticketId } } });
    assert.deepEqual(ticket.labels, [], "approved reversal removes only the original label");
    const original = await prisma.governedAction.findUnique({ where: { id: prepared.id } });
    assert.equal(original.status, "reversed");
    assert.equal(original.reversalActionId, reversalPrepared.id);
    assert.equal((await prisma.actionLedgerEntry.count({ where: { actionId: prepared.id } })) >= 3, true, "original action history remains intact");

    const countsAfter = { knowledge: await prisma.knowledgeItem.count({ where: { organizationId } }), jobs: await prisma.durableJob.count({ where: { organizationId } }) };
    assert.equal(countsAfter.knowledge, countsBefore.knowledge, "governed labels do not change Organizational Memory");
    assert.equal(countsAfter.jobs, countsBefore.jobs + 2, "apply and reversal each create one durable execution job");
    const policy = await getActionPolicy(organizationId);
    assert.deepEqual(policy.allowedLabels.includes("password-reset"), true);
    console.log(JSON.stringify({ organizationId, ticketId, appliedActionId: prepared.id, reversalActionId: reversalPrepared.id, finalLabels: ticket.labels, policyVersion: policy.version, actionLedgerEntries: await prisma.actionLedgerEntry.count({ where: { organizationId } }) }, null, 2));
    console.log("TODO-019 governed action probe passed.");
  } finally {
    if (workerA) await workerA.stop();
    if (workerB) await workerB.stop();
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, viewerId] } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
