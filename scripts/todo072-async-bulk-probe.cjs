const assert = require('node:assert/strict');
const support = require('./lib/todo072-support.cjs');

async function main() {
  const { parsed, uploadKey } = support.fixture();
  const organizationId = `todo072-probe-bulk-${Date.now()}`;
  const otherOrganizationId = `todo072-probe-other-${Date.now()}`;
  let worker = null;
  try {
    const context = await support.createOrganization(organizationId);
    const otherContext = await support.createOrganization(otherOrganizationId);
    const input = support.bulkInput(uploadKey, parsed.entries);
    const first = await support.durableJobRepository.enqueue({ context, type: 'bulk.analyze', version: 1, input, inputDigest: support.digest(input), idempotencyKey: uploadKey, maxAttempts: 3 });
    const replay = await support.durableJobRepository.enqueue({ context, type: 'bulk.analyze', version: 1, input, inputDigest: support.digest(input), idempotencyKey: uploadKey, maxAttempts: 3 });
    assert.equal(replay.replayed, true);
    assert.equal(replay.job.id, first.job.id);
    await assert.rejects(() => support.durableJobRepository.enqueue({ context, type: 'bulk.analyze', version: 1, input: support.bulkInput(uploadKey, parsed.entries.slice(0, 99)), inputDigest: support.digest({ changed: true }), idempotencyKey: uploadKey }), /different job input/);
    await assert.rejects(() => support.durableJobRepository.get(otherContext, first.job.id), /organization|authority/i);

    worker = await support.runWorker('todo072-bulk-worker-1');
    const completed = await support.waitForTerminal(context, first.job.id);
    await worker.stop();
    worker = null;
    assert.equal(completed.status, 'succeeded');
    assert.equal(completed.progress.percent, 100);
    assert.ok(completed.resultDigest);
    assert.equal(completed.attemptCount, 1);
    const result = completed.result;
    assert.equal(result.preparedCount, 100);
    assert.equal(result.analysis.total, 100);
    assert.equal(result.analysis.clusters.reduce((total, cluster) => total + cluster.count, 0) + result.analysis.unclustered.count, 100);
    const ticketCount = await support.prisma.ticketRecord.count({ where: { organizationId, bulkUploadKey: uploadKey } });
    const entryCount = await support.prisma.ticketRecord.count({ where: { organizationId, bulkUploadKey: uploadKey, intakeMode: 'bulk' } });
    assert.equal(ticketCount, 100);
    assert.equal(entryCount, 100);
    const attempts = await support.durableJobRepository.listAttempts(context, first.job.id);
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].outcome, 'succeeded');
    const completedReplay = await support.durableJobRepository.enqueue({ context, type: 'bulk.analyze', version: 1, input, inputDigest: support.digest(input), idempotencyKey: uploadKey, maxAttempts: 3 });
    assert.equal(completedReplay.replayed, true);
    assert.equal(completedReplay.job.id, first.job.id);
    console.log(JSON.stringify({ fixtureRows: parsed.entries.length, skippedRows: parsed.summary.skippedRows, organizationId, jobId: first.job.id, type: completed.type, version: completed.version, idempotencyKey: completed.idempotencyKey, inputDigest: completed.inputDigest, status: completed.status, progress: completed.progress, attemptCount: completed.attemptCount, leaseOwner: completed.leaseOwner ?? null, resultDigest: completed.resultDigest, ticketCount, entryCount, attempts }, null, 2));
  } finally {
    if (worker) await worker.stop();
    await support.cleanup();
    await support.prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
