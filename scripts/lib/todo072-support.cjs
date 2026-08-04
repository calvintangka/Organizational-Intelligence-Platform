const fs = require('node:fs');
const path = require('node:path');
const { installProbeHarness } = require('./probe-harness.cjs');
const { root } = installProbeHarness();
process.env.AI_MODE = 'disabled';
process.env.NEXT_PUBLIC_AI_MODE = 'disabled';

const { prisma } = require(path.join(root, 'lib/server/prisma.ts'));
const persistence = require(path.join(root, 'lib/server/persistenceService.ts'));
const { createPersistenceContext } = require(path.join(root, 'lib/persistence/context.ts'));
const { durableJobRepository } = require(path.join(root, 'lib/server/jobs/jobRepository.ts'));
const { AsyncJobWorker } = require(path.join(root, 'lib/server/jobs/worker.ts'));
const { parseBulkUploadFile, bulkUploadKey } = require(path.join(root, 'lib/bulkUpload.ts'));
const { digestJobInput } = require(path.join(root, 'lib/application/jobs/types.ts'));

const fixturePath = path.join(root, 'tmp', 'TODO-062B-developer-bulk.csv');
const fixtureFileName = 'TODO-062B-developer-bulk.csv';

function fixture() {
  if (!fs.existsSync(fixturePath)) throw new Error(`Required unchanged fixture is missing: ${fixturePath}`);
  const content = fs.readFileSync(fixturePath, 'utf8');
  const parsed = parseBulkUploadFile(fixtureFileName, content);
  if (parsed.needsMapping || parsed.entries.length !== 100 || parsed.summary.skippedRows !== 0) throw new Error('TODO-062B fixture did not parse as 100 rows with zero skips.');
  return { content, parsed, uploadKey: bulkUploadKey(fixtureFileName, content) };
}

function profile(id) {
  const now = new Date().toISOString();
  return { id, name: `TODO-072 ${id}`, industry: 'Support', description: 'Disposable async bulk acceptance organization', products: [], services: [], supportedDomains: [], businessVocabulary: [], supportedIssueTypes: [], outOfScopeTopics: [], customerTone: 'professional', supportBoundaries: [], autoResolutionThreshold: 80, escalationRules: [], createdAt: now, updatedAt: now, profileRevision: 0 };
}

async function createOrganization(id) {
  await persistence.upsertOrganizationProfile(profile(id));
  return createPersistenceContext({ organizationId: id, actorContext: {}, authority: 'server', requestId: `todo072-${id}` });
}

async function cleanup(prefix = 'todo072-probe-') {
  await prisma.organization.deleteMany({ where: { id: { startsWith: prefix } } });
}

async function waitForTerminal(context, jobId, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await durableJobRepository.get(context, jobId);
    if (['succeeded', 'failed', 'cancelled', 'dead_lettered'].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for durable job ${jobId}.`);
}

function bulkInput(uploadKey, entries) { return { uploadKey, entries }; }
function digest(input) { return digestJobInput(input); }

async function runWorker(workerId, options = {}) {
  const worker = new AsyncJobWorker({ workerId, pollMs: 25, leaseMs: options.leaseMs ?? 5_000, concurrency: options.concurrency ?? 1 });
  worker.start();
  return worker;
}

module.exports = { root, prisma, persistence, durableJobRepository, createPersistenceContext, fixture, createOrganization, cleanup, waitForTerminal, bulkInput, digest, runWorker };
