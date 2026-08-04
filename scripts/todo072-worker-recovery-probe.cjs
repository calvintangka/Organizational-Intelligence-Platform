const assert = require('node:assert/strict');
const support = require('./lib/todo072-support.cjs');

async function main() {
  const { parsed, uploadKey } = support.fixture();
  const organizationId = `todo072-probe-recovery-${Date.now()}`;
  let worker = null;
  try {
    const context = await support.createOrganization(organizationId);
    const entries = parsed.entries.slice(0, 10);
    const input = support.bulkInput(`${uploadKey}-recovery`, entries);
    const created = await support.durableJobRepository.enqueue({ context, type: 'bulk.analyze', version: 1, input, inputDigest: support.digest(input), idempotencyKey: `${uploadKey}-recovery`, maxAttempts: 3 });
    const leaseStart = new Date();
    const claimed = await support.durableJobRepository.claimNext('todo072-crashed-worker', { leaseMs: 5_000, now: leaseStart });
    assert.ok(claimed);
    assert.equal(claimed.job.id, created.job.id);
    const released = await support.durableJobRepository.releaseExpiredLeases(new Date(leaseStart.getTime() + 6_000));
    assert.equal(released, 1);
    const retryState = await support.durableJobRepository.get(context, created.job.id);
    assert.equal(retryState.status, 'retry_scheduled');
    worker = await support.runWorker('todo072-restarted-worker');
    const completed = await support.waitForTerminal(context, created.job.id);
    await worker.stop();
    worker = null;
    assert.equal(completed.status, 'succeeded');
    assert.equal(await support.prisma.ticketRecord.count({ where: { organizationId, bulkUploadKey: input.uploadKey } }), 10);
    const attempts = await support.durableJobRepository.listAttempts(context, created.job.id);
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].workerId, 'todo072-crashed-worker');
    assert.equal(attempts[0].outcome, 'lease_expired');
    assert.equal(attempts[1].workerId, 'todo072-restarted-worker');
    assert.equal(attempts[1].outcome, 'succeeded');
    console.log(JSON.stringify({ jobId: created.job.id, firstWorker: attempts[0].workerId, restartedWorker: attempts[1].workerId, attempts, finalStatus: completed.status, tickets: 10 }, null, 2));
  } finally {
    if (worker) await worker.stop();
    await support.cleanup();
    await support.prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
