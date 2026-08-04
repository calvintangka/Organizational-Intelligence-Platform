const assert = require('node:assert/strict');
const support = require('./lib/todo073-support.cjs');

async function main() {
  const organizationId = `todo073-probe-worker-${Date.now()}`;
  let workerA = null;
  let workerB = null;
  try {
    const fixture = await support.reflectionFixture(organizationId);
    const user = await support.addActor(fixture, Date.now());
    const before = {
      knowledge: await support.prisma.knowledgeItem.count({ where: { organizationId } }),
      candidates: await support.prisma.knowledgeCandidate.count({ where: { organizationId } }),
      validations: await support.prisma.validationRecord.count({ where: { organizationId } }),
      memoryChanges: await support.prisma.memoryChangeRecord.count({ where: { organizationId } }),
      trustEvidence: await support.prisma.trustEvidence.count({ where: { organizationId } }),
      prepared: await support.prisma.preparedReflection.count({ where: { organizationId } })
    };
    const first = await support.enqueueReflection(fixture, `todo073-reflection:${fixture.ticket.ticketId}`);
    const replay = await support.enqueueReflection(fixture, `todo073-reflection:${fixture.ticket.ticketId}`);
    assert.equal(replay.replayed, true);
    assert.equal(replay.job.id, first.job.id);
    await assert.rejects(() => support.durableJobRepository.enqueue({ context: fixture.context, type: 'reflection.generate', version: 1, input: { ...fixture.input, reviewedResponse: 'different safe response' }, inputDigest: support.digest({ changed: true }), idempotencyKey: `todo073-reflection:${fixture.ticket.ticketId}` }), /different.*input/);
    workerA = await support.runWorker('todo073-reflection-worker-a', { concurrency: 1 });
    workerB = await support.runWorker('todo073-reflection-worker-b', { concurrency: 1 });
    const completed = await support.waitForTerminal(fixture.context, first.job.id);
    await workerA.stop(); await workerB.stop(); workerA = null; workerB = null;
    assert.equal(completed.status, 'succeeded');
    assert.equal(completed.progress.stage, 'succeeded');
    assert.equal(completed.progress.percent, 100);
    assert.equal(completed.result.promotionRequired, true);
    assert.equal(completed.result.validation.accepted, true);
    assert.deepEqual(completed.result.reflection, fixture.direct.reflection);
    assert.equal(completed.result.preparedReflection.status, 'prepared');
    assert.equal(completed.result.preparedReflection.ticketId, fixture.ticket.ticketId);
    const after = {
      knowledge: await support.prisma.knowledgeItem.count({ where: { organizationId } }),
      candidates: await support.prisma.knowledgeCandidate.count({ where: { organizationId } }),
      validations: await support.prisma.validationRecord.count({ where: { organizationId } }),
      memoryChanges: await support.prisma.memoryChangeRecord.count({ where: { organizationId } }),
      trustEvidence: await support.prisma.trustEvidence.count({ where: { organizationId } }),
      prepared: await support.prisma.preparedReflection.count({ where: { organizationId } })
    };
    assert.deepEqual(after, { ...before, prepared: before.prepared + 1 });
    const attempts = await support.durableJobRepository.listAttempts(fixture.context, first.job.id);
    assert.equal(attempts.length, 1);
    assert.ok(['todo073-reflection-worker-a', 'todo073-reflection-worker-b'].includes(attempts[0].workerId));
    await assert.rejects(() => support.durableJobRepository.requestCancellation(fixture.context, first.job.id), /cannot be cancelled/i);
    console.log(JSON.stringify({ organizationId, userId: user.id, jobId: first.job.id, type: completed.type, status: completed.status, progress: completed.progress, preparedReflectionId: completed.result.preparedReflection.id, attemptCount: completed.attemptCount, attempts, before, after, promotionRequired: completed.result.promotionRequired }, null, 2));
  } finally {
    if (workerA) await workerA.stop();
    if (workerB) await workerB.stop();
    await support.cleanup073();
    await support.prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
