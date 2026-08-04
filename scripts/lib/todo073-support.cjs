const path = require('node:path');
const support = require('./todo072-support.cjs');
const { createTicketRecord } = require(path.join(support.root, 'lib/ticketRecords.ts'));
const { understandForProfile } = require(path.join(support.root, 'lib/analyzer.ts'));
const learning = require(path.join(support.root, 'lib/application/learning/reflectionCommands.ts'));
const { createPersistenceContext } = require(path.join(support.root, 'lib/persistence/context.ts'));

async function reflectionFixture(organizationId, language = 'en') {
  const context = await support.createOrganization(organizationId);
  const profile = await support.persistence.getOrganizationProfile(organizationId);
  const ticketId = `TODO073-${language}-${Date.now()}`;
  const ticket = {
    id: `ticket-${ticketId}`,
    ticketId,
    customerName: 'Disposable Customer',
    subject: language === 'id' ? 'Masalah aktivasi' : 'Activation issue',
    description: language === 'id' ? 'Akun baru belum aktif setelah undangan dikirim.' : 'A newly invited account is still pending activation after the invitation was sent.',
    category: 'General',
    status: 'drafted',
    createdAt: new Date().toISOString()
  };
  const understanding = understandForProfile(ticket, profile);
  const record = createTicketRecord(ticketId, organizationId, `${ticket.subject} ${ticket.description}`, ticket.subject);
  record.status = 'in_review';
  await support.persistence.saveTicketRecords(organizationId, [record]);
  const reviewedResponse = language === 'id' ? 'Silakan buka email undangan dan selesaikan langkah aktivasi akun.' : 'Please open the invitation email and complete the account activation steps.';
  const input = {
    ticket,
    understanding,
    reviewedResponse,
    existingMatch: null,
    selectedDraft: { draftMode: 'cold_start' },
    languageContext: { responseLanguage: language, internalLanguage: 'en' }
  };
  const direct = learning.generateReflectionCommand({ organizationId, actor: { id: 'todo073-actor', name: 'TODO-073 Reviewer' }, authority: 'server', requestId: `todo073-direct-${ticketId}`, organizationProfile: profile, ticket, understanding, reviewedResponse, existingMatch: null, selectedDraft: input.selectedDraft, languageContext: input.languageContext });
  return { context, profile, ticket, understanding, input, direct };
}

async function enqueueReflection(fixture, idempotencyKey = `reflection:${fixture.ticket.ticketId}`) {
  return support.durableJobRepository.enqueue({ context: fixture.context, type: 'reflection.generate', version: 1, input: fixture.input, inputDigest: support.digest(fixture.input), idempotencyKey, maxAttempts: 3 });
}

async function addActor(fixture, suffix = Date.now()) {
  const uniqueSuffix = `${suffix}-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  const user = await support.prisma.user.create({ data: { name: 'TODO-073 Reviewer', email: `todo073-${uniqueSuffix}@example.invalid`, passwordHash: 'probe-only' } });
  await support.prisma.organizationMembership.create({ data: { userId: user.id, organizationId: fixture.context.organizationId, role: 'member' } });
  fixture.context = createPersistenceContext({ organizationId: fixture.context.organizationId, actorContext: { id: user.id, name: user.name, email: user.email }, authority: 'server', requestId: `todo073-${uniqueSuffix}` });
  return user;
}

async function cleanup073() {
  await support.cleanup('todo073-probe-');
  await support.prisma.user.deleteMany({ where: { email: { startsWith: 'todo073-' } } });
}

module.exports = { ...support, reflectionFixture, enqueueReflection, addActor, cleanup073, learning };
