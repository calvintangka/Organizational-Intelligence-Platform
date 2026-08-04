const crypto = require('node:crypto');
const path = require('node:path');
const support = require('./todo072-support.cjs');
const { AsyncJobWorker } = require(path.join(support.root, 'lib/server/jobs/worker.ts'));
const { createConnectorInstallation, getConnectorInstallation, listConnectorEvents, receiveWebhook, rotateConnectorSecret, setConnectorStatus, testConnectorInstallation } = require(path.join(support.root, 'lib/server/connectors/connectorService.ts'));

async function fixture(prefix = 'todo076-probe-') {
  const organizationId = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const context = await support.createOrganization(organizationId);
  const user = await support.prisma.user.create({ data: { name: 'TODO-076 Operator', email: `${organizationId}@example.invalid`, passwordHash: 'probe-only' } });
  await support.prisma.organizationMembership.create({ data: { userId: user.id, organizationId, role: 'member' } });
  return { organizationId, context, user };
}

async function installation(fixture, secret = `todo076-secret-${crypto.randomBytes(20).toString('hex')}`) {
  const created = await createConnectorInstallation({ organizationId: fixture.organizationId, user: fixture.user, connectorType: 'generic.signed_webhook', name: 'Disposable signed webhook', signingSecret: secret, configuration: { acceptedEventTypes: ['ticket.created', 'ticket.updated'] } });
  await setConnectorStatus(fixture.organizationId, created.id, 'active');
  return { installation: await getConnectorInstallation(fixture.organizationId, created.id), secret };
}

function signedRequest(secret, event, options = {}) {
  const rawBody = options.rawBody ?? JSON.stringify(event);
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const signature = options.signature ?? `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
  return { rawBody, headers: new Headers({ 'content-type': options.contentType ?? 'application/json', 'x-oip-timestamp': String(timestamp), 'x-oip-signature': signature }) };
}

function event(id, objectId = 'external-ticket-1', type = 'ticket.created', updatedAt = new Date().toISOString()) {
  return { id, eventType: type, organizationId: 'attacker-controlled-ignored', object: { id: objectId, version: updatedAt, subject: 'Activation request', message: '<p>Please help with account activation.</p>', requester: { name: 'Disposable Requester', email: 'requester@example.invalid' }, tags: ['activation', 'connector'], createdAt: updatedAt, updatedAt, url: 'https://example.invalid/tickets/1' } };
}

async function send(installed, payload) { return receiveWebhook(installed.installation.id, signedRequest(installed.secret, payload)); }

async function waitFor(context, jobId, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await support.durableJobRepository.get(context, jobId);
    if (['succeeded', 'failed', 'cancelled', 'dead_lettered'].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for connector job ${jobId}.`);
}

async function runWorker(workerId) {
  const worker = new AsyncJobWorker({ workerId, pollMs: 20, leaseMs: 5000, concurrency: 1 });
  worker.start();
  return worker;
}

async function cleanup() {
  await support.prisma.durableWorkerHeartbeat.deleteMany({ where: { workerId: { startsWith: 'todo076-' } } });
  await support.prisma.organization.deleteMany({ where: { id: { startsWith: 'todo076-probe-' } } });
  await support.prisma.user.deleteMany({ where: { email: { startsWith: 'todo076-probe-' } } });
}

module.exports = { ...support, fixture, installation, signedRequest, event, send, receiveWebhook, waitFor, runWorker, cleanup, listConnectorEvents, rotateConnectorSecret, setConnectorStatus, testConnectorInstallation };
