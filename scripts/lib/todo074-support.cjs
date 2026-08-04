const path = require('node:path');
const support = require('./todo072-support.cjs');
const { createTicketRecord } = require(path.join(support.root, 'lib/ticketRecords.ts'));
const { understandForProfile } = require(path.join(support.root, 'lib/analyzer.ts'));
const { detectEmergingPattern } = require(path.join(support.root, 'lib/patternDiscovery.ts'));
const { buildPatternDiscoveryInput, patternDiscoveryIdempotencyKey } = require(path.join(support.root, 'lib/application/jobs/patternTypes.ts'));

async function patternFixture(organizationId, options = {}) {
  const context = await support.createOrganization(organizationId);
  const profile = await support.persistence.getOrganizationProfile(organizationId);
  const suffix = options.suffix ?? Date.now();
  const ticketId = options.ticketId ?? `TODO074-${suffix}`;
  const subject = options.subject ?? 'Activation invitation remains pending';
  const description = options.description ?? 'A newly invited account remains pending activation after the invitation was sent.';
  const ticket = { id: `ticket-${ticketId}`, ticketId, customerName: 'Disposable Customer', subject, description, category: 'General', status: 'drafted', createdAt: new Date().toISOString() };
  const understanding = understandForProfile(ticket, profile);
  const record = createTicketRecord(ticketId, organizationId, description, subject);
  record.status = 'in_review';
  await support.persistence.saveTicketRecords(organizationId, [record]);
  const input = buildPatternDiscoveryInput({
    organizationId,
    sourceTicketId: ticketId,
    understandingSummary: options.understandingSummary ?? understanding.coreProblem,
    detectedSignals: options.detectedSignals ?? understanding.detectedSignals,
    tags: options.tags ?? understanding.tags,
    category: options.category ?? understanding.category,
    language: options.language ?? 'en',
    triggerType: 'ticket_follow_up'
  });
  const direct = detectEmergingPattern(ticket, understanding, []);
  return { context, profile, ticket, record, understanding, input, direct };
}

async function enqueuePattern(fixture, key = patternDiscoveryIdempotencyKey(fixture.context.organizationId, fixture.input.sourceTicketId)) {
  return support.durableJobRepository.enqueue({ context: fixture.context, type: 'pattern.discover', version: 1, input: fixture.input, inputDigest: support.digest(fixture.input), idempotencyKey: key, maxAttempts: 3 });
}

async function waitForTerminal(context, jobId, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await support.durableJobRepository.get(context, jobId);
    if (['succeeded', 'failed', 'cancelled', 'dead_lettered'].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for durable pattern job ${jobId}.`);
}

async function cleanup074(prefix = 'todo074-probe-') {
  await support.prisma.organization.deleteMany({ where: { id: { startsWith: prefix } } });
}

module.exports = { ...support, patternFixture, enqueuePattern, waitForTerminal, cleanup074, buildPatternDiscoveryInput, patternDiscoveryIdempotencyKey, detectEmergingPattern };
