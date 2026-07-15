/* Live HTTP verification for Batch 5.4 execution. */
const assert = require("node:assert/strict");
const intakeProbe = require("./migration-intake-probe.cjs");
const { populatedPackage } = require("./migration-import-probe.cjs");

const BASE_URL = process.env.OIP_INTAKE_BASE_URL || "http://127.0.0.1:3001";
const ORG = "test-oip-migration-http";
const COLLISION_ORG = "test-oip-migration-http-collision";
const TARGET_ORG = "test-oip-migration-http-target";
const NOW = "2026-07-15T00:00:00.000Z";

async function post(path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { response, body: await response.json() };
}

async function get(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  return { response, body: await response.json() };
}

async function main() {
  const ids = [ORG, COLLISION_ORG, TARGET_ORG];
  try {
    await Promise.all(ids.map(intakeProbe.deleteIfPresent));
    await intakeProbe.persistence.upsertOrganizationProfiles(ids.map((id) => intakeProbe.profile(id)));
    const prisma = intakeProbe.getPrismaClient();
    const valid = await populatedPackage(ORG);
    const intake = await post(`/api/organizations/${ORG}/migration-import`, valid);
    assert.equal(intake.response.status, 201);
    const execute = await post(`/api/organizations/${ORG}/migration-import/${intake.body.data.batchId}/execute`);
    assert.equal(execute.response.status, 200);
    assert.equal(execute.body.data.status, "partial");
    assert.equal(execute.body.data.noOp, false);
    assert.equal(execute.body.data.resourceCheckpoints.filter((row) => row.status === "imported").length, 7);
    assert.equal(execute.body.data.resourceCheckpoints.find((row) => row.resourceType === "memoryChangeRecords").status, "pending");

    const knowledge = await get(`/api/organizations/${ORG}/knowledge`);
    assert.equal(knowledge.response.status, 200);
    assert.equal(knowledge.body.data[0].id, "import-knowledge-1");
    const tickets = await get(`/api/organizations/${ORG}/tickets`);
    assert.equal(tickets.body.data[0].ticketId, "MT-IMPORT-1");

    const retry = await post(`/api/organizations/${ORG}/migration-import/${intake.body.data.batchId}/execute`);
    assert.equal(retry.response.status, 200);
    assert.equal(retry.body.data.noOp, true);
    assert.equal(await prisma.knowledgeItem.count({ where: { organizationId: ORG } }), 1);

    const collision = await intakeProbe.packageFor(COLLISION_ORG);
    collision.resources.knowledge = [{ id: "http-collision-knowledge", organizationId: COLLISION_ORG, title: "Collision", problem: "source", approvedAnswer: "source", category: "access", tags: [], sourceTicketId: "collision-ticket", timesReused: 0, createdAt: NOW, approvedAt: NOW, revision: 1 }];
    await intakeProbe.refresh(collision);
    await prisma.knowledgeItem.create({ data: {
      id: "http-collision-knowledge", organizationId: TARGET_ORG, title: "Target", category: "access", lifecycleState: "active",
      sourceTicketId: "target-ticket", createdAt: new Date(NOW), approvedAt: new Date(NOW), revision: 1, timesReused: 0,
      content: { problem: "target", approvedAnswer: "target", tags: [], lessons: [], knowledgeVersions: [], learningHistory: [], exampleTickets: [] }
    } });
    const conflictIntake = await post(`/api/organizations/${COLLISION_ORG}/migration-import`, collision);
    const conflictExecute = await post(`/api/organizations/${COLLISION_ORG}/migration-import/${conflictIntake.body.data.batchId}/execute`);
    assert.equal(conflictExecute.response.status, 200);
    assert.equal(conflictExecute.body.data.status, "conflict");
    assert.equal(conflictExecute.body.data.unresolvedConflictCount, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(conflictExecute.body, "DATABASE_URL"), false);

    console.log("migration import HTTP probe passed: execute, GET verification, retry no-op, conflict quarantine, and safe response");
  } finally {
    await Promise.all(ids.map(intakeProbe.deleteIfPresent));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
