const { installProbeHarness } = require('./lib/probe-harness.cjs');
installProbeHarness({ loadEnv: true });

const { AsyncJobWorker } = require('../lib/server/jobs/worker.ts');
const worker = new AsyncJobWorker();
worker.start();
console.log(`[async-worker] started ${worker.workerId}`);

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[async-worker] ${signal}: draining`);
  await worker.stop();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
