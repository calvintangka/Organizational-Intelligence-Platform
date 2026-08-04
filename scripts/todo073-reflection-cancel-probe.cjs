const assert = require('node:assert/strict');
const support = require('./lib/todo073-support.cjs');

async function main() {
  const organizationId = `todo073-probe-cancel-${Date.now()}`;
  try {
    const fixture = await support.reflectionFixture(organizationId);
    await support.addActor(fixture, Date.now());
    const queued = await support.enqueueReflection(fixture, `todo073-queued-cancel:${fixture.ticket.ticketId}`);
    assert.equal((await support.durableJobRepository.requestCancellation(fixture.context, queued.job.id)).status, 'cancelled');
    assert.equal(await support.prisma.preparedReflection.count({ where: { organizationId } }), 0);
    const running = await support.enqueueReflection(fixture, `todo073-running-cancel:${fixture.ticket.ticketId}`);
    const claimed = await support.durableJobRepository.claimNext('todo073-cancel-worker', { leaseMs: 5_000 });
    assert.ok(claimed);
    assert.equal(claimed.job.id, running.job.id);
    assert.equal((await support.durableJobRepository.requestCancellation(fixture.context, running.job.id)).status, 'cancellation_requested');
    assert.equal((await support.durableJobRepository.fail(running.job.id, 'todo073-cancel-worker', { errorClass: 'cancelled', safeMessage: 'Reflection generation cancelled at a safe boundary.', retryable: false })).status, 'cancelled');
    const unsafe = support.learning.validateReflectionCommand({ organizationId, actor: { id: 'todo073-actor', name: 'TODO-073 Reviewer' }, authority: 'server', requestId: 'todo073-unsafe', reflection: fixture.direct.reflection, lessonDraft: { mode: 'new', rootCause: 'Use password: secret123', solution: 'Temporary workaround', customerResponse: 'Reply to customer@example.com', signals: ['ticket #123456'] }, safetyContext: { customerName: fixture.ticket.customerName, organizationName: fixture.profile.name, sourceTicketId: fixture.ticket.ticketId, sourceTicketText: fixture.ticket.description } });
    assert.equal(unsafe.accepted, false);
    console.log(JSON.stringify({ queued: 'cancelled', running: 'cancelled', preparedReflections: 0, unsafeReflectionRejected: true }, null, 2));
  } finally {
    await support.cleanup073();
    await support.prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
