const assert = require('node:assert/strict');
const support = require('./lib/todo075-support.cjs');

async function main() {
  const mode = process.argv[2] || 'dashboard';
  const fixture = await support.createFixture();
  let worker = null;
  try {
    const failed = await support.enqueue(fixture, 'ticket.process', 'failed', 1);
    const failedClaim = await support.durableJobRepository.claimNext(`todo075-${mode}-failure`);
    assert.ok(failedClaim);
    await support.durableJobRepository.fail(failed.job.id, `todo075-${mode}-failure`, { errorClass: 'provider_timeout', safeMessage: 'Disposable safe failure.', retryable: true });
    assert.equal((await support.durableJobRepository.get(fixture.context, failed.job.id)).status, 'dead_lettered');
    const queued = await support.enqueue(fixture, 'ticket.process', 'queued');
    const running = await support.enqueue(fixture, 'ticket.process', 'running');
    worker = new support.AsyncJobWorker({ workerId: `todo075-${mode}-worker`, pollMs: 20, leaseMs: 5000, concurrency: 1, registry: support.customRegistry() });
    worker.start();
    const completed = await support.waitForTerminal(fixture, running.job.id);
    await worker.stop(); worker = null;
    const data = await support.snapshot(fixture);
    assert.ok(data.generatedAt);
    assert.ok(data.jobs.every((job) => !Object.prototype.hasOwnProperty.call(job, 'input')));
    assert.ok(data.jobs.every((job) => !JSON.stringify(job).includes('Disposable probe payload')));
    if (mode === 'dashboard') assert.ok(data.overview.totalJobs >= 3);
    if (mode === 'worker-health') assert.ok(data.workers.some((item) => item.workerId === `todo075-${mode}-worker`));
    if (mode === 'dead-letter') {
      assert.equal(data.deadLetters.some((job) => job.id === failed.job.id), true);
      assert.equal((await support.durableJobRepository.retry(fixture.context, failed.job.id)).status, 'queued');
    }
    if (mode === 'provider') {
      assert.ok(data.providers.some((provider) => provider.provider === 'disabled'));
      assert.ok(data.providers.every((provider) => provider.measured === true));
    }
    if (mode === 'performance') {
      assert.ok(data.performance.runtime.sampleCount >= 1);
      assert.ok(data.performance.runtime.averageMs >= 0);
    }
    if (mode === 'dashboard') {
      const job = await support.detail(fixture, completed.id);
      assert.ok(job.attempts.length >= 1);
      assert.equal(Object.prototype.hasOwnProperty.call(job, 'result'), false);
    }
    console.log(JSON.stringify({ mode, organizationId: fixture.organizationId, totalJobs: data.overview.totalJobs, workers: data.workers.length, providers: data.providers, runtime: data.performance.runtime, deadLetters: data.deadLetters.length, privacySafe: true }, null, 2));
  } finally {
    if (worker) await worker.stop();
    await support.cleanup();
    await support.prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
