const assert = require('node:assert/strict');
const support = require('./lib/todo072-support.cjs');

function flatten(result) {
  const items = [...result.clusters.flatMap((cluster) => cluster.items), ...result.unclustered.items];
  return new Map(items.map((item) => [item.entry.id, {
    category: item.understanding.category,
    canonical: item.canonicalProblem.title,
    memoryId: item.existingMatch?.item.id ?? null,
    lessonId: item.retrievedLessonId ?? null,
    language: item.ticket.description.toLowerCase().includes('halo') ? 'id' : 'en'
  }]));
}

async function main() {
  const { parsed, uploadKey } = support.fixture();
  const organizationId = `todo072-probe-parity-${Date.now()}`;
  let worker = null;
  try {
    const context = await support.createOrganization(organizationId);
    const sourceProfile = await support.persistence.getOrganizationProfile('profile-oip-developer-demo');
    await support.persistence.upsertOrganizationProfile({ ...sourceProfile, id: organizationId, name: `TODO-072 parity ${organizationId}`, updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() });
    const matureSource = await support.persistence.loadKnowledge('profile-oip-developer-demo');
    const mature = matureSource.find((item) => /invoice/i.test(`${item.title} ${item.canonicalProblemTitle ?? ''} ${item.problem}`));
    assert.ok(mature, 'Expected an invoice lesson in the protected mature-memory source.');
    const copiedKnowledge = matureSource.map((item, index) => ({ ...item, id: `todo072-mature-${Date.now()}-${index}`, organizationId, revision: undefined }));
    const syntheticMature = { id: `todo072-synthetic-password-${Date.now()}`, organizationId, title: 'Password Reset Email Missing', problem: 'Password reset email is missing after replacing a laptop.', approvedAnswer: 'Use the account recovery flow and verify the login email before requesting a new reset message.', category: 'Password Reset', tags: ['password', 'reset', 'email', 'missing', 'laptop'], sourceTicketId: 'todo072-source', timesReused: 10, createdAt: new Date().toISOString(), approvedAt: new Date().toISOString(), canonicalProblemId: 'todo072-password-reset', canonicalProblemTitle: 'Password Reset Email Missing', problemSummary: 'Password reset email is missing after a device change.', customerResponseTemplate: 'Please verify your login email and request a new password reset message.', lessons: [{ id: 'todo072-password-lesson', title: 'Password reset delivery', rootCause: 'The reset message can be delayed after a device change.', solution: 'Verify the login email and retry the recovery flow.', customerResponse: 'Please verify your login email and request a new password reset message.', signals: ['password reset', 'reset email'], createdAt: new Date().toISOString(), sourceTicketId: 'todo072-source' }] };
    await support.persistence.saveKnowledge(organizationId, [...copiedKnowledge, syntheticMature]);
    const knowledge = await support.persistence.loadKnowledge(organizationId);
    const { createAIAdapter } = require(`${support.root}/lib/ai/adapter.ts`);
    const ai = createAIAdapter({ mode: 'disabled', baseUrl: '', model: 'todo072-probe', timeoutMs: 1000, proxyPath: '/api/ai/chat' });
    const direct = await require(`${support.root}/lib/bulkUpload.ts`).analyzeBulkEntries({ entries: parsed.entries, organizationProfile: await support.persistence.getOrganizationProfile(organizationId), knowledgeItems: knowledge, aiAdapter: ai });
    const input = support.bulkInput(uploadKey, parsed.entries);
    const queued = await support.durableJobRepository.enqueue({ context, type: 'bulk.analyze', version: 1, input, inputDigest: support.digest(input), idempotencyKey: uploadKey, maxAttempts: 3 });
    worker = await support.runWorker('todo072-parity-worker');
    const completed = await support.waitForTerminal(context, queued.job.id);
    await worker.stop();
    worker = null;
    assert.equal(completed.status, 'succeeded');
    const asyncResult = completed.result.analysis;
    assert.deepEqual(flatten(asyncResult), flatten(direct));
    assert.equal(asyncResult.total, 100);
    assert.ok([...flatten(direct).values()].some((item) => item.memoryId), 'Expected mature-memory retrieval in the parity source.');
    assert.ok([...flatten(asyncResult).values()].some((item) => item.memoryId), 'Expected mature-memory retrieval to survive async execution.');
    const summary = { rows: 100, categoryParity: 100, canonicalParity: 100, memoryParity: 100, lessonParity: 100, languageParity: 100, directMatureHits: [...flatten(direct).values()].filter((item) => item.memoryId).length, asyncMatureHits: [...flatten(asyncResult).values()].filter((item) => item.memoryId).length, jobId: queued.job.id };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (worker) await worker.stop();
    await support.cleanup();
    await support.prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
