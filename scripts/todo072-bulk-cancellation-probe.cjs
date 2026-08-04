const assert = require('node:assert/strict');
const support = require('./lib/todo072-support.cjs');

async function main() {
  const { parsed, uploadKey } = support.fixture();
  const organizationId = `todo072-probe-cancel-${Date.now()}`;
  let worker = null;
  try {
    const context = await support.createOrganization(organizationId);
    const queuedInput = support.bulkInput(`${uploadKey}-queued-cancel`, parsed.entries.slice(0, 10));
    const queued = await support.durableJobRepository.enqueue({ context, type: 'bulk.analyze', version: 1, input: queuedInput, inputDigest: support.digest(queuedInput), idempotencyKey: queuedInput.uploadKey });
    assert.equal((await support.durableJobRepository.requestCancellation(context, queued.job.id)).status, 'cancelled');
    assert.equal(await support.prisma.ticketRecord.count({ where: { organizationId, bulkUploadKey: queuedInput.uploadKey } }), 0);

    const runningInput = support.bulkInput(`${uploadKey}-running-cancel`, parsed.entries.slice(0, 10));
    const running = await support.durableJobRepository.enqueue({ context, type: 'bulk.analyze', version: 1, input: runningInput, inputDigest: support.digest(runningInput), idempotencyKey: runningInput.uploadKey });
    const claimed = await support.durableJobRepository.claimNext('todo072-cancel-worker', { leaseMs: 5_000 });
    assert.ok(claimed);
    assert.equal(claimed.job.id, running.job.id);
    const requested = await support.durableJobRepository.requestCancellation(context, running.job.id);
    assert.equal(requested.status, 'cancellation_requested');
    const cancelled = await support.durableJobRepository.fail(running.job.id, 'todo072-cancel-worker', { errorClass: 'cancelled', safeMessage: 'Cancelled at a durable checkpoint.', retryable: false });
    assert.equal(cancelled.status, 'cancelled');

    const failingInput = support.bulkInput(`${uploadKey}-dead-letter`, parsed.entries.slice(0, 1));
    const failing = await support.durableJobRepository.enqueue({ context, type: 'bulk.analyze', version: 1, input: failingInput, inputDigest: support.digest(failingInput), idempotencyKey: failingInput.uploadKey, maxAttempts: 1 });
    const failingClaim = await support.durableJobRepository.claimNext('todo072-dead-letter-worker', { leaseMs: 5_000 });
    assert.ok(failingClaim);
    assert.equal(failingClaim.job.id, failing.job.id);
    const dead = await support.durableJobRepository.fail(failing.job.id, 'todo072-dead-letter-worker', { errorClass: 'permanent_failure', safeMessage: 'Permanent disposable probe failure.', retryable: true });
    assert.equal(dead.status, 'dead_lettered');
    const requeued = await support.durableJobRepository.retry(context, failing.job.id);
    assert.equal(requeued.status, 'queued');
    const attempts = await support.durableJobRepository.listAttempts(context, failing.job.id);
    assert.equal(attempts.length, 1);
    console.log(JSON.stringify({ queuedCancellation: 'cancelled', runningCancellation: cancelled.status, deadLetter: dead.status, operatorRetry: requeued.status, attempts }, null, 2));
  } finally {
    if (worker) await worker.stop();
    await support.cleanup();
    await support.prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
