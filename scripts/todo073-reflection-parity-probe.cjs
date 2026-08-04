const assert = require('node:assert/strict');
const support = require('./lib/todo073-support.cjs');

async function runLanguage(language, workerId) {
  const fixture = await support.reflectionFixture(`todo073-probe-parity-${language}-${Date.now()}` , language);
  await support.addActor(fixture, `${language}-${Date.now()}`);
  const job = await support.enqueueReflection(fixture, `todo073-parity:${language}:${fixture.ticket.ticketId}`);
  const worker = await support.runWorker(workerId);
  let completed;
  try {
    completed = await support.waitForTerminal(fixture.context, job.job.id);
  } finally {
    await worker.stop();
  }
  assert.equal(completed.status, 'succeeded');
  assert.deepEqual(completed.result.reflection, fixture.direct.reflection);
  assert.equal(completed.result.promotionRequired, true);
  assert.equal(await support.prisma.preparedReflection.count({ where: { organizationId: fixture.context.organizationId } }), 1);
  return { fixture, completed };
}

async function main() {
  try {
    const english = await runLanguage('en', 'todo073-parity-en-worker');
    const indonesian = await runLanguage('id', 'todo073-parity-id-worker');
    assert.equal(english.completed.result.reflection.action, indonesian.completed.result.reflection.action);
    assert.equal(english.completed.result.reflection.isLearningEvent, indonesian.completed.result.reflection.isLearningEvent);
    console.log(JSON.stringify({ english: { jobId: english.completed.id, action: english.completed.result.reflection.action }, indonesian: { jobId: indonesian.completed.id, action: indonesian.completed.result.reflection.action }, crossLanguageParity: true, promotionRequired: true }, null, 2));
  } finally {
    await support.cleanup073();
    await support.prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
