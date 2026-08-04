const assert = require('node:assert/strict');
const support = require('./lib/todo073-support.cjs');

async function main() {
  const organizationId = `todo073-probe-recovery-${Date.now()}`;
  let worker = null;
  try {
    const fixture = await support.reflectionFixture(organizationId);
    await support.addActor(fixture, Date.now());
    const created = await support.enqueueReflection(fixture, `todo073-recovery:${fixture.ticket.ticketId}`);
    const leaseStart = new Date();
    const claimed = await support.durableJobRepository.claimNext('todo073-crashed-reflection-worker', { leaseMs: 5_000, now: leaseStart });
    assert.ok(claimed);
    assert.equal(claimed.job.id, created.job.id);
    assert.equal(await support.durableJobRepository.releaseExpiredLeases(new Date(leaseStart.getTime() + 6_000)), 1);
    assert.equal((await support.durableJobRepository.get(fixture.context, created.job.id)).status, 'retry_scheduled');
    worker = await support.runWorker('todo073-restarted-reflection-worker');
    const completed = await support.waitForTerminal(fixture.context, created.job.id);
    await worker.stop(); worker = null;
    assert.equal(completed.status, 'succeeded');
    assert.equal(await support.prisma.preparedReflection.count({ where: { organizationId } }), 1);
    const attempts = await support.durableJobRepository.listAttempts(fixture.context, created.job.id);
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].outcome, 'lease_expired');
    assert.equal(attempts[1].outcome, 'succeeded');
    assert.equal(attempts[1].workerId, 'todo073-restarted-reflection-worker');
    console.log(JSON.stringify({ jobId: created.job.id, attempts, preparedReflections: 1, finalStatus: completed.status }, null, 2));
  } finally {
    if (worker) await worker.stop();
    await support.cleanup073();
    await support.prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
