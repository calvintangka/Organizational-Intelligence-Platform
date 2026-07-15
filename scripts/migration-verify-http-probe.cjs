/* Live HTTP verification for TODO-004 Batch 5.6. */
const assert = require("node:assert/strict");
const intakeProbe = require("./migration-intake-probe.cjs");
const { populatedPackage } = require("./migration-import-probe.cjs");

const BASE_URL = process.env.OIP_INTAKE_BASE_URL || "http://127.0.0.1:3001";
const ORG = "test-oip-migration-verify-http";
const ORG_DRIFT = "test-oip-migration-verify-http-drift";

async function request(path, method, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { response, body: await response.json() };
}

async function main() {
  const ids = [ORG, ORG_DRIFT];
  try {
    await Promise.all(ids.map(intakeProbe.deleteIfPresent));
    await intakeProbe.persistence.upsertOrganizationProfiles(ids.map((id) => intakeProbe.profile(id)));
    const prisma = intakeProbe.getPrismaClient();

    const intake = await request(`/api/organizations/${ORG}/migration-import`, "POST", await populatedPackage(ORG));
    assert.equal(intake.response.status, 201);
    const execute = await request(`/api/organizations/${ORG}/migration-import/${intake.body.data.batchId}/execute`, "POST");
    assert.equal(execute.response.status, 200);
    const verify = await request(`/api/organizations/${ORG}/migration-import/${intake.body.data.batchId}/verify`, "POST");
    assert.equal(verify.response.status, 200);
    assert.equal(verify.body.data.status, "passed");
    assert.equal(verify.body.data.summary.status, "verified");
    assert.equal(verify.body.data.report.resourceResults.length, 9);
    const readback = await request(`/api/organizations/${ORG}/migration-import/${intake.body.data.batchId}/verify`, "GET");
    assert.equal(readback.response.status, 200);
    assert.equal(readback.body.data.report.overallStatus, "passed");
    const retry = await request(`/api/organizations/${ORG}/migration-import/${intake.body.data.batchId}/verify`, "POST");
    assert.equal(retry.response.status, 200);
    assert.equal(retry.body.data.noOp, true);
    await intakeProbe.deleteIfPresent(ORG);

    const driftPackage = await populatedPackage(ORG_DRIFT);
    const driftIntake = await request(`/api/organizations/${ORG_DRIFT}/migration-import`, "POST", driftPackage);
    assert.equal(driftIntake.response.status, 201);
    const driftExecute = await request(`/api/organizations/${ORG_DRIFT}/migration-import/${driftIntake.body.data.batchId}/execute`, "POST");
    assert.equal(driftExecute.response.status, 200);
    await prisma.knowledgeItem.update({ where: { id: "import-knowledge-1" }, data: { title: "HTTP drift" } });
    const driftVerify = await request(`/api/organizations/${ORG_DRIFT}/migration-import/${driftIntake.body.data.batchId}/verify`, "POST");
    assert.equal(driftVerify.response.status, 409);
    assert.equal(driftVerify.body.data.status, "failed");
    assert.equal(driftVerify.body.data.report.resourceResults.find((result) => result.resourceType === "knowledge").digestMatch, false);
    await prisma.knowledgeItem.update({ where: { id: "import-knowledge-1" }, data: { title: "Imported Login Knowledge" } });
    const repaired = await request(`/api/organizations/${ORG_DRIFT}/migration-import/${driftIntake.body.data.batchId}/verify`, "POST");
    assert.equal(repaired.response.status, 200);
    assert.equal(repaired.body.data.status, "passed");

    console.log("migration verification HTTP probe passed: verify, readback, retry no-op, structured drift failure, repair, and reverify");
  } finally {
    await Promise.all(ids.map(intakeProbe.deleteIfPresent));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
