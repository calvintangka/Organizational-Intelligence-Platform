const assert = require('node:assert/strict');
const { installProbeHarness } = require('./lib/probe-harness.cjs');
installProbeHarness();
process.env.AI_MODE = 'disabled';
process.env.NEXT_PUBLIC_AI_MODE = 'disabled';

const { prisma } = require('../lib/server/prisma.ts');
const { upsertOrganizationProfile } = require('../lib/server/persistenceService.ts');
const { createPersistenceContext } = require('../lib/persistence/context.ts');
const { durableJobRepository } = require('../lib/server/jobs/jobRepository.ts');
const { AsyncJobWorker } = require('../lib/server/jobs/worker.ts');
const { digestJobInput } = require('../lib/application/jobs/types.ts');

const organizationId = `todo018-probe-${Date.now()}`;
const context = createPersistenceContext({ organizationId, actorContext: {}, authority: 'server', requestId: 'todo018-probe-request' });
const profile = {
  id: organizationId, name: 'TODO-018 Probe', industry: 'Support', description: 'Disposable probe organization',
  products: [], services: [], supportedDomains: [], businessVocabulary: [], supportedIssueTypes: [], outOfScopeTopics: [],
  customerTone: 'professional', supportBoundaries: [], autoResolutionThreshold: 80, escalationRules: [],
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), profileRevision: 0
};
let worker = null;

async function waitForTerminal(jobId) {
  for (let i = 0; i < 600; i += 1) {
    const job = await durableJobRepository.get(context, jobId);
    if (['succeeded', 'failed', 'cancelled', 'dead_lettered'].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for durable ticket job.');
}

(async () => {
  try {
    await prisma.organization.deleteMany({ where: { id: { startsWith: 'todo018-probe-' } } });
    await upsertOrganizationProfile(profile);
    const input = { ticketInput: { description: 'The disposable async worker probe cannot sign in.' } };
    const first = await durableJobRepository.enqueue({ context, type: 'ticket.process', version: 1, input, inputDigest: digestJobInput(input), idempotencyKey: 'same-key', maxAttempts: 3 });
    const replay = await durableJobRepository.enqueue({ context, type: 'ticket.process', version: 1, input, inputDigest: digestJobInput(input), idempotencyKey: 'same-key', maxAttempts: 3 });
    assert.equal(replay.replayed, true);
    assert.equal(replay.job.id, first.job.id);
    await assert.rejects(() => durableJobRepository.enqueue({ context, type: 'ticket.process', version: 1, input: { ticketInput: { description: 'different' } }, inputDigest: digestJobInput({ different: true }), idempotencyKey: 'same-key' }), /different job input/);

    const claim1 = await durableJobRepository.claimNext('todo018-probe-worker-1', { leaseMs: 5000, organizationId });
    assert.ok(claim1);
    const claim2 = await durableJobRepository.claimNext('todo018-probe-worker-2', { leaseMs: 5000, organizationId });
    assert.equal(claim2, null);
    await durableJobRepository.renewLease(claim1.job.id, 'todo018-probe-worker-1', 5000);
    await durableJobRepository.fail(claim1.job.id, 'todo018-probe-worker-1', { errorClass: 'provider_timeout', safeMessage: 'probe retry', retryable: true });
    const retryJob = await durableJobRepository.get(context, claim1.job.id);
    assert.equal(retryJob.status, 'retry_scheduled');

    const cancelled = await durableJobRepository.enqueue({ context, type: 'pattern.discover', version: 1, input: { ticketIds: [] }, inputDigest: digestJobInput({ ticketIds: [] }), idempotencyKey: 'cancel-key' });
    const cancelledJob = await durableJobRepository.requestCancellation(context, cancelled.job.id);
    assert.equal(cancelledJob.status, 'cancelled');

    const workerJob = await durableJobRepository.enqueue({ context, type: 'ticket.process', version: 1, input: { ticketInput: { description: 'The asynchronous worker should persist this ticket once.' } }, inputDigest: digestJobInput({ ticketInput: { description: 'The asynchronous worker should persist this ticket once.' } }), idempotencyKey: 'worker-key', maxAttempts: 3 });
    // Keep the worker-job assertion isolated from the deliberately
    // retry-scheduled same-key fixture above. The production worker may run
    // concurrently, but this probe is proving single-lease completion for
    // one job, not contention between two independent jobs.
    worker = new AsyncJobWorker({ workerId: 'todo018-real-worker', pollMs: 25, leaseMs: 5000, concurrency: 1, organizationId });
    worker.start();
    const completed = await waitForTerminal(workerJob.job.id);
    await worker.stop();
    worker = null;
    assert.equal(completed.status, 'succeeded', `worker job did not succeed: ${JSON.stringify(completed)}`);
    assert.equal((await durableJobRepository.enqueue({ context, type: 'ticket.process', version: 1, input: workerJob.job.input, inputDigest: workerJob.job.inputDigest, idempotencyKey: 'worker-key' })).replayed, true);
    // The retry-scheduled `same-key` job may become eligible while the worker
    // job is executing. It is a distinct valid input and can therefore create
    // its own ticket; scope this assertion to the worker job's exact input so
    // the probe checks exactly-once persistence for the job under test rather
    // than conflating two different jobs in the same disposable organization.
    const workerTicketCount = await prisma.ticketRecord.count({ where: {
      organizationId,
      rawMessage: workerJob.job.input.ticketInput.description
    } });
    const workerJobs = await prisma.durableJob.findMany({ where: { organizationId }, select: { id: true, type: true, idempotencyKey: true, status: true, attemptCount: true, nextAttemptAt: true }, orderBy: { createdAt: "asc" } });
    assert.equal(workerTicketCount, 1, `worker must persist exactly one ticket for worker-key; observed ${JSON.stringify({ workerTicketCount, workerJobs })}`);
    console.log('TODO-018 async foundation probe passed: idempotency, single-lease ownership, retry scheduling, cancellation, worker completion, and ticket persistence.');
  } finally {
    if (worker) await worker.stop();
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
