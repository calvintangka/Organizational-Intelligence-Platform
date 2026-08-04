const assert = require('node:assert/strict');
const support = require('./lib/todo076-support.cjs');

async function main() {
  const mode = process.argv[2] || 'installation';
  const fixture = await support.fixture();
  let worker = null;
  try {
    const installed = await support.installation(fixture);
    if (mode === 'installation') {
      const tested = await support.testConnectorInstallation(fixture.organizationId, installed.installation.id);
      assert.equal(tested.ok, true);
      assert.equal(JSON.stringify(tested).includes(installed.secret), false);
      assert.equal((await support.prisma.connectorCredential.findFirst({ where: { installationId: installed.installation.id } })).encryptedMaterial.includes(installed.secret), false);
    }
    if (mode === 'webhook-security') {
      const before = await support.prisma.durableJob.count({ where: { organizationId: fixture.organizationId } });
      await assert.rejects(() => support.receiveWebhook(installed.installation.id, support.signedRequest('wrong-secret', support.event('bad-signature'))), /signature/i);
      await assert.rejects(() => support.receiveWebhook(installed.installation.id, support.signedRequest(installed.secret, support.event('expired'), { timestamp: Math.floor(Date.now() / 1000) - 1000 })), /replay window/i);
      await assert.rejects(() => support.receiveWebhook(installed.installation.id, support.signedRequest(installed.secret, support.event('bad-content'), { contentType: 'text/plain' })), /application\/json/i);
      assert.equal(await support.prisma.durableJob.count({ where: { organizationId: fixture.organizationId } }), before);
      assert.equal(await support.prisma.connectorInboundEvent.count({ where: { organizationId: fixture.organizationId } }), 0);
    }
    if (mode === 'connector-idempotency') {
      const payload = support.event('same-event');
      const deliveries = await Promise.all(Array.from({ length: 10 }, () => support.send(installed, payload)));
      assert.equal(new Set(deliveries.map((delivery) => delivery.jobId)).size, 1);
      const event = await support.prisma.connectorInboundEvent.findFirstOrThrow({ where: { organizationId: fixture.organizationId } });
      assert.equal(event.replayCount, 9);
      await assert.rejects(() => support.send(installed, { ...payload, object: { ...payload.object, message: 'Conflicting payload' } }), /different payload/i);
      assert.equal(await support.prisma.durableJob.count({ where: { organizationId: fixture.organizationId, type: 'connector.intake' } }), 1);
    }
    if (mode === 'connector-worker' || mode === 'connector-mapping') {
      const first = await support.send(installed, support.event('created-event', 'external-42'));
      worker = await support.runWorker(`todo076-${mode}-worker`);
      const completed = await support.waitFor(fixture.context, first.jobId);
      assert.equal(completed.status, 'succeeded');
      if (mode === 'connector-worker') {
        assert.equal(await support.prisma.ticketRecord.count({ where: { organizationId: fixture.organizationId } }), 1);
        assert.equal(await support.prisma.externalObjectMapping.count({ where: { organizationId: fixture.organizationId } }), 1);
        assert.equal((await support.prisma.connectorInboundEvent.findFirstOrThrow({ where: { id: first.event.id } })).status, 'processed');
      } else {
        const mapping = await support.prisma.externalObjectMapping.findFirstOrThrow({ where: { organizationId: fixture.organizationId } });
        const newerAt = new Date(Date.now() + 5000).toISOString();
        const update = await support.send(installed, support.event('update-event', 'external-42', 'ticket.updated', newerAt));
        assert.equal((await support.waitFor(fixture.context, update.jobId)).status, 'succeeded');
        const afterUpdate = await support.prisma.externalObjectMapping.findFirstOrThrow({ where: { id: mapping.id } });
        assert.equal(afterUpdate.oipResourceId, mapping.oipResourceId);
        const stale = await support.send(installed, support.event('stale-event', 'external-42', 'ticket.updated', new Date(Date.now() - 5000).toISOString()));
        assert.equal((await support.waitFor(fixture.context, stale.jobId)).status, 'succeeded');
        assert.equal(await support.prisma.ticketRecord.count({ where: { organizationId: fixture.organizationId } }), 1);
      }
    }
    if (mode === 'connector-tenancy') {
      const other = await support.fixture();
      try {
        const otherInstalled = await support.installation(other);
        const same = support.event('shared-event', 'shared-ticket');
        const [left, right] = await Promise.all([support.send(installed, same), support.send(otherInstalled, same)]);
        assert.notEqual(left.event.id, right.event.id);
        assert.equal((await support.listConnectorEvents(fixture.organizationId)).length, 1);
        await support.setConnectorStatus(fixture.organizationId, installed.installation.id, 'paused');
        await assert.rejects(() => support.send(installed, support.event('paused-event')), /not active/i);
        const newSecret = 'todo076-rotated-secret-1234567890';
        await support.rotateConnectorSecret(fixture.organizationId, installed.installation.id, fixture.user, newSecret);
        await support.setConnectorStatus(fixture.organizationId, installed.installation.id, 'active');
        await assert.rejects(() => support.send(installed, support.event('old-secret-event')), /signature/i);
        const rotated = { installation: installed.installation, secret: newSecret };
        assert.equal((await support.send(rotated, support.event('new-secret-event'))).accepted, true);
        await support.setConnectorStatus(fixture.organizationId, installed.installation.id, 'revoked');
        await assert.rejects(() => support.send(rotated, support.event('revoked-event')), /not active/i);
      } finally { /* shared final cleanup removes both disposable organizations. */ }
    }
    console.log(JSON.stringify({ mode, organizationId: fixture.organizationId, installations: await support.prisma.connectorInstallation.count({ where: { organizationId: fixture.organizationId } }), events: await support.prisma.connectorInboundEvent.count({ where: { organizationId: fixture.organizationId } }), mappings: await support.prisma.externalObjectMapping.count({ where: { organizationId: fixture.organizationId } }), jobs: await support.prisma.durableJob.count({ where: { organizationId: fixture.organizationId, type: 'connector.intake' } }), privacySafe: true }, null, 2));
  } finally {
    if (worker) await worker.stop();
    await support.cleanup();
    await support.prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
