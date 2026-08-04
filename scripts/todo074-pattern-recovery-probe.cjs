const assert = require('node:assert/strict');
const support = require('./lib/todo074-support.cjs');

async function main() {
  const organizationId = `todo074-probe-recovery-${Date.now()}`;
  let worker = null;
  try {
    const fixture = await support.patternFixture(organizationId);
    const created = await support.enqueuePattern(fixture, `todo074-recovery:${fixture.input.sourceTicketId}`);
    const leaseStart = new Date();
    const claimed = await support.durableJobRepository.claimNext('todo074-crashed-pattern-worker', { leaseMs: 5000, now: leaseStart });
    assert.ok(claimed);
    assert.equal(claimed.job.id, created.job.id);
    assert.equal(await support.durableJobRepository.releaseExpiredLeases(new Date(leaseStart.getTime() + 6000)), 1);
    worker = await support.runWorker('todo074-restarted-pattern-worker');
    const completed = await support.waitForTerminal(fixture.context, created.job.id);
    await worker.stop(); worker = null;
    assert.equal(completed.status, 'succeeded');
    assert.equal(await support.prisma.emergingPattern.count({ where: { organizationId } }), 1);
    assert.equal(await support.prisma.patternDiscoveryEvidence.count({ where: { organizationId } }), 1);
    const attempts = await support.durableJobRepository.listAttempts(fixture.context, created.job.id);
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].outcome, 'lease_expired');
    assert.equal(attempts[1].outcome, 'succeeded');
    assert.equal(attempts[1].workerId, 'todo074-restarted-pattern-worker');
    const ticket = await support.prisma.ticketRecord.findFirst({ where: { organizationId, ticketId: fixture.ticket.ticketId } });
    assert.equal(ticket?.status, 'in_review');
    console.log(JSON.stringify({ jobId: created.job.id, attempts, patterns: 1, evidence: 1, originalTicketStatus: ticket?.status, finalStatus: completed.status }, null, 2));
  } finally {
    if (worker) await worker.stop();
    await support.cleanup074();
    await support.prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
