const assert = require('node:assert/strict');
const support = require('./lib/todo074-support.cjs');

async function main() {
  const suffix = Date.now();
  const organizationA = `todo074-probe-concurrency-a-${suffix}`;
  const organizationB = `todo074-probe-concurrency-b-${suffix}`;
  let workers = [];
  try {
    const a1 = await support.patternFixture(organizationA, { suffix: `${suffix}-a1`, tags: ['account', 'activation'], detectedSignals: ['activation', 'invitation'], category: 'Access', understandingSummary: 'Account activation remains pending' });
    const a2 = await support.patternFixture(organizationA, { suffix: `${suffix}-a2`, tags: ['account', 'activation'], detectedSignals: ['activation', 'invitation'], category: 'Access', understandingSummary: 'Account activation remains pending' });
    const b1 = await support.patternFixture(organizationB, { suffix: `${suffix}-b1`, tags: ['account', 'activation'], detectedSignals: ['activation', 'invitation'], category: 'Access', understandingSummary: 'Account activation remains pending' });
    const first = await support.enqueuePattern(a1, `todo074-concurrency:${a1.ticket.ticketId}`);
    const second = await support.enqueuePattern(a2, `todo074-concurrency:${a2.ticket.ticketId}`);
    const tenantB = await support.enqueuePattern(b1, `todo074-concurrency:${b1.ticket.ticketId}`);
    workers = [await support.runWorker('todo074-concurrency-worker-a'), await support.runWorker('todo074-concurrency-worker-b')];
    const [doneFirst, doneSecond, doneTenantB] = await Promise.all([
      support.waitForTerminal(a1.context, first.job.id),
      support.waitForTerminal(a2.context, second.job.id),
      support.waitForTerminal(b1.context, tenantB.job.id)
    ]);
    for (const worker of workers) await worker.stop(); workers = [];
    assert.equal(doneFirst.status, 'succeeded');
    assert.equal(doneSecond.status, 'succeeded');
    assert.equal(doneTenantB.status, 'succeeded');
    const patternsA = await support.prisma.emergingPattern.findMany({ where: { organizationId: organizationA } });
    const evidenceA = await support.prisma.patternDiscoveryEvidence.findMany({ where: { organizationId: organizationA } });
    const patternsB = await support.prisma.emergingPattern.findMany({ where: { organizationId: organizationB } });
    const evidenceB = await support.prisma.patternDiscoveryEvidence.findMany({ where: { organizationId: organizationB } });
    assert.equal(patternsA.length, 1);
    assert.equal(evidenceA.length, 2);
    assert.equal(patternsA[0].timesSeen, 2);
    assert.equal(patternsB.length, 1);
    assert.equal(evidenceB.length, 1);
    assert.notEqual(patternsA[0].organizationId, patternsB[0].organizationId);
    assert.ok(evidenceA.every((entry) => entry.organizationId === organizationA));
    assert.ok(evidenceB.every((entry) => entry.organizationId === organizationB));
    assert.equal(new Set(evidenceA.map((entry) => entry.ticketId)).size, 2);
    console.log(JSON.stringify({ organizationA, organizationB, jobs: [first.job.id, second.job.id, tenantB.job.id], patternsA: patternsA.length, evidenceA: evidenceA.length, timesSeenA: patternsA[0].timesSeen, patternsB: patternsB.length, evidenceB: evidenceB.length, tenantIsolation: true, duplicatePrevention: true }, null, 2));
  } finally {
    for (const worker of workers) await worker.stop();
    await support.cleanup074();
    await support.prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
