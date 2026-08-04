const assert = require('node:assert/strict');
const support = require('./lib/todo074-support.cjs');

async function main() {
  const organizationId = `todo074-probe-multilingual-${Date.now()}`;
  let worker = null;
  try {
    const english = await support.patternFixture(organizationId, { suffix: `${Date.now()}-en`, language: 'en', subject: 'Activation invitation pending', description: 'A newly invited account remains pending activation.', tags: ['account', 'activation'], detectedSignals: ['activation', 'invitation'], category: 'Access', understandingSummary: 'Account activation remains pending' });
    const indonesian = await support.patternFixture(organizationId, { suffix: `${Date.now()}-id`, language: 'id', subject: 'Undangan aktivasi tertunda', description: 'Akun baru tetap tertunda setelah undangan aktivasi dikirim.', tags: ['account', 'activation'], detectedSignals: ['activation', 'invitation'], category: 'Access', understandingSummary: 'Account activation remains pending' });
    const first = await support.enqueuePattern(english, `todo074-multilingual:${english.ticket.ticketId}`);
    const second = await support.enqueuePattern(indonesian, `todo074-multilingual:${indonesian.ticket.ticketId}`);
    worker = await support.runWorker('todo074-multilingual-worker', { concurrency: 1 });
    const [doneEnglish, doneIndonesian] = await Promise.all([support.waitForTerminal(english.context, first.job.id), support.waitForTerminal(indonesian.context, second.job.id)]);
    await worker.stop(); worker = null;
    assert.equal(doneEnglish.status, 'succeeded');
    assert.equal(doneIndonesian.status, 'succeeded');
    assert.equal(doneEnglish.result.action, 'created');
    assert.equal(doneIndonesian.result.action, 'strengthened');
    const patterns = await support.prisma.emergingPattern.findMany({ where: { organizationId } });
    const evidence = await support.prisma.patternDiscoveryEvidence.findMany({ where: { organizationId }, orderBy: { createdAt: 'asc' } });
    assert.equal(patterns.length, 1);
    assert.equal(evidence.length, 2);
    assert.equal(patterns[0].category, 'Access');
    assert.equal(patterns[0].timesSeen, 2);
    assert.equal(patterns[0].category, 'Access');
    assert.equal(new Set(evidence.map((entry) => entry.language)).size, 2);
    console.log(JSON.stringify({ english: { jobId: first.job.id, action: doneEnglish.result.action }, indonesian: { jobId: second.job.id, action: doneIndonesian.result.action }, patterns: patterns.length, evidence: evidence.length, languageNeutralIdentity: true, decisionParity: true }, null, 2));
  } finally {
    if (worker) await worker.stop();
    await support.cleanup074();
    await support.prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
