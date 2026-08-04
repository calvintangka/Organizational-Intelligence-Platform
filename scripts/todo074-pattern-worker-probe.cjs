const assert = require('node:assert/strict');
const support = require('./lib/todo074-support.cjs');

async function main() {
  const organizationId = `todo074-probe-worker-${Date.now()}`;
  let worker = null;
  try {
    const fixture = await support.patternFixture(organizationId);
    const before = {
      patterns: await support.prisma.emergingPattern.count({ where: { organizationId } }),
      evidence: await support.prisma.patternDiscoveryEvidence.count({ where: { organizationId } }),
      outcomes: await support.prisma.patternDiscoveryOutcome.count({ where: { organizationId } }),
      knowledge: await support.prisma.knowledgeItem.count({ where: { organizationId } }),
      candidates: await support.prisma.knowledgeCandidate.count({ where: { organizationId } }),
      validations: await support.prisma.validationRecord.count({ where: { organizationId } }),
      memoryChanges: await support.prisma.memoryChangeRecord.count({ where: { organizationId } }),
      trustEvidence: await support.prisma.trustEvidence.count({ where: { organizationId } })
    };
    const first = await support.enqueuePattern(fixture);
    const replay = await support.enqueuePattern(fixture);
    assert.equal(replay.replayed, true);
    assert.equal(replay.job.id, first.job.id);
    await assert.rejects(() => support.durableJobRepository.enqueue({ context: fixture.context, type: 'pattern.discover', version: 1, input: { ...fixture.input, understandingSummary: 'changed safe pattern input' }, inputDigest: support.digest({ changed: true }), idempotencyKey: first.job.idempotencyKey }), /different job input/);
    worker = await support.runWorker('todo074-pattern-worker', { concurrency: 1 });
    const completed = await support.waitForTerminal(fixture.context, first.job.id);
    await worker.stop(); worker = null;
    assert.equal(completed.status, 'succeeded');
    assert.equal(completed.result.patternFound, true);
    assert.equal(completed.result.action, 'created');
    assert.equal(completed.result.created, true);
    assert.equal(completed.result.evidenceCount, 1);
    assert.equal(completed.result.auditSummary.replayed, false);
    const patterns = await support.prisma.emergingPattern.findMany({ where: { organizationId } });
    const evidence = await support.prisma.patternDiscoveryEvidence.findMany({ where: { organizationId } });
    const outcomes = await support.prisma.patternDiscoveryOutcome.findMany({ where: { organizationId } });
    assert.equal(patterns.length, 1);
    assert.equal(evidence.length, 1);
    assert.equal(outcomes.length, 1);
    assert.equal(patterns[0].id, completed.result.patternId);
    assert.equal(patterns[0].category, fixture.direct.pattern.category);
    assert.equal(patterns[0].exampleTickets[0].customerName, 'Anonymized evidence');
    assert.equal(patterns[0].exampleTickets[0].originalIssue.includes(fixture.ticket.description), false);
    const cancelFixture = await support.patternFixture(organizationId, { suffix: `${Date.now()}-cancel` });
    const queuedCancel = await support.enqueuePattern(cancelFixture, `todo074-cancel:${cancelFixture.ticket.ticketId}`);
    assert.equal((await support.durableJobRepository.requestCancellation(cancelFixture.context, queuedCancel.job.id)).status, 'cancelled');
    const noOpInput = { organizationId, understandingSummary: 'No source was provided', detectedSignals: [], tags: [], category: 'General', triggerType: 'manual' };
    const noOp = await support.durableJobRepository.enqueue({ context: fixture.context, type: 'pattern.discover', version: 1, input: noOpInput, inputDigest: support.digest(noOpInput), idempotencyKey: `todo074-noop:${organizationId}`, maxAttempts: 1 });
    worker = await support.runWorker('todo074-pattern-noop-worker');
    const noOpCompleted = await support.waitForTerminal(fixture.context, noOp.job.id);
    await worker.stop(); worker = null;
    assert.equal(noOpCompleted.status, 'succeeded');
    assert.equal(noOpCompleted.result.action, 'no_pattern');
    const retry = await support.durableJobRepository.enqueue({ context: fixture.context, type: 'pattern.discover', version: 1, input: fixture.input, inputDigest: support.digest(fixture.input), idempotencyKey: `todo074-retry:${fixture.ticket.ticketId}`, maxAttempts: 2 });
    const retryClaimed = await support.durableJobRepository.claimNext('todo074-transient-pattern-worker', { leaseMs: 5000 });
    assert.ok(retryClaimed);
    assert.equal(retryClaimed.job.id, retry.job.id);
    assert.equal((await support.durableJobRepository.fail(retry.job.id, 'todo074-transient-pattern-worker', { errorClass: 'database_transient', safeMessage: 'Injected disposable transient failure.', retryable: true })).status, 'retry_scheduled');
    worker = await support.runWorker('todo074-retry-pattern-worker');
    const retryCompleted = await support.waitForTerminal(fixture.context, retry.job.id);
    await worker.stop(); worker = null;
    assert.equal(retryCompleted.status, 'succeeded');
    assert.equal((await support.durableJobRepository.listAttempts(fixture.context, retry.job.id)).length, 2);
    const invalidInput = { organizationId, understandingSummary: 'Invalid follow-up', detectedSignals: [], tags: [], category: 'Access', triggerType: 'ticket_follow_up' };
    const deadLetter = await support.durableJobRepository.enqueue({ context: fixture.context, type: 'pattern.discover', version: 1, input: invalidInput, inputDigest: support.digest(invalidInput), idempotencyKey: `todo074-dead-letter:${organizationId}`, maxAttempts: 1 });
    const deadLetterClaimed = await support.durableJobRepository.claimNext('todo074-dead-letter-pattern-worker', { leaseMs: 5000 });
    assert.ok(deadLetterClaimed);
    assert.equal(deadLetterClaimed.job.id, deadLetter.job.id);
    const deadLetterCompleted = await support.durableJobRepository.fail(deadLetter.job.id, 'todo074-dead-letter-pattern-worker', { errorClass: 'database_transient', safeMessage: 'Injected disposable transient failure.', retryable: true });
    assert.equal(deadLetterCompleted.status, 'dead_lettered');
    assert.equal((await support.durableJobRepository.retry(fixture.context, deadLetter.job.id)).status, 'queued');
    const after = {
      patterns: await support.prisma.emergingPattern.count({ where: { organizationId } }),
      evidence: await support.prisma.patternDiscoveryEvidence.count({ where: { organizationId } }),
      outcomes: await support.prisma.patternDiscoveryOutcome.count({ where: { organizationId } }),
      knowledge: await support.prisma.knowledgeItem.count({ where: { organizationId } }),
      candidates: await support.prisma.knowledgeCandidate.count({ where: { organizationId } }),
      validations: await support.prisma.validationRecord.count({ where: { organizationId } }),
      memoryChanges: await support.prisma.memoryChangeRecord.count({ where: { organizationId } }),
      trustEvidence: await support.prisma.trustEvidence.count({ where: { organizationId } })
    };
    assert.deepEqual(after, { ...before, patterns: 1, evidence: 1, outcomes: 2 });
    await assert.rejects(() => support.durableJobRepository.requestCancellation(fixture.context, first.job.id), /cannot be cancelled/i);
    console.log(JSON.stringify({ organizationId, jobId: first.job.id, status: completed.status, action: completed.result.action, patternId: completed.result.patternId, evidenceCount: completed.result.evidenceCount, attempts: await support.durableJobRepository.listAttempts(fixture.context, first.job.id), queuedCancellation: 'cancelled', noOp: noOpCompleted.result.action, retry: retryCompleted.status, deadLetter: deadLetterCompleted.status, before, after, privacySafe: true, promotionSideEffects: 0 }, null, 2));
  } finally {
    if (worker) await worker.stop();
    await support.cleanup074();
    await support.prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
