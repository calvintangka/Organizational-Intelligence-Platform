const path = require('node:path');
const support = require('./todo072-support.cjs');
const { JobHandlerRegistry } = require(path.join(support.root, 'lib/application/jobs/registry.ts'));
const { AsyncJobWorker } = require(path.join(support.root, 'lib/server/jobs/worker.ts'));
const { getOperationsSnapshot, getOperationJobDetail } = require(path.join(support.root, 'lib/server/operations/operationsService.ts'));

async function createFixture(prefix = 'todo075-probe-') {
  const organizationId = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const context = await support.createOrganization(organizationId);
  const user = await support.prisma.user.create({ data: { name: 'TODO-075 Operator', email: `${organizationId}@example.invalid`, passwordHash: 'probe-only' } });
  await support.prisma.organizationMembership.create({ data: { userId: user.id, organizationId, role: 'member' } });
  return { organizationId, context, user };
}

function customRegistry() {
  return new JobHandlerRegistry().register('ticket.process', async () => ({ processed: true, replayed: false }));
}

async function enqueue(fixture, type = 'ticket.process', suffix = Date.now(), maxAttempts = 3) {
  const input = { organizationId: fixture.organizationId, ticketInput: { description: 'Disposable probe payload that must never appear in operations output.' } };
  return support.durableJobRepository.enqueue({ context: fixture.context, type, version: 1, input, inputDigest: support.digest(input), idempotencyKey: `todo075:${fixture.organizationId}:${type}:${suffix}`, maxAttempts });
}

async function snapshot(fixture, options = {}) { return getOperationsSnapshot(fixture.organizationId, fixture.user.id, options); }
async function detail(fixture, jobId) { return getOperationJobDetail(fixture.organizationId, fixture.user.id, jobId); }
async function waitForTerminal(fixture, jobId, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await support.durableJobRepository.get(fixture.context, jobId);
    if (['succeeded', 'failed', 'cancelled', 'dead_lettered'].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for TODO-075 job ${jobId}.`);
}

async function cleanup(prefix = 'todo075-probe-') {
  await support.prisma.durableWorkerHeartbeat.deleteMany({ where: { workerId: { startsWith: 'todo075-' } } });
  await support.prisma.organization.deleteMany({ where: { id: { startsWith: prefix } } });
  await support.prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
}

module.exports = { ...support, AsyncJobWorker, JobHandlerRegistry, customRegistry, createFixture, enqueue, snapshot, detail, waitForTerminal, cleanup };
