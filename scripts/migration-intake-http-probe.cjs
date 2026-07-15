/* Live HTTP verification for the Batch 5.3 organization-scoped endpoint. */
const assert = require("node:assert/strict");
const { packageFor, deleteIfPresent, profile, persistence, getPrismaClient, ORG_A, ORG_B } = require("./migration-intake-probe.cjs");

const BASE_URL = process.env.OIP_INTAKE_BASE_URL || "http://127.0.0.1:3001";

async function post(organizationId, body) {
  const response = await fetch(`${BASE_URL}/api/organizations/${organizationId}/migration-import`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  });
  return { response, body: await response.json() };
}

async function main() {
  const valid = await packageFor(ORG_A);
  try {
    await persistence.upsertOrganizationProfiles([profile(ORG_A), profile(ORG_B)]);
    const prisma = getPrismaClient();
    const businessBefore = await prisma.knowledgeItem.count({ where: { organizationId: ORG_A } });
    const first = await post(ORG_A, valid);
    assert.equal(first.response.status, 201);
    assert.equal(first.body.data.created, true);
    assert.equal(first.body.data.status, "ready");
    assert.equal(first.body.data.checkpoints.length, 9);
    assert.equal(Object.prototype.hasOwnProperty.call(first.body, "DATABASE_URL"), false);

    const replay = await post(ORG_A, valid);
    assert.equal(replay.response.status, 200);
    assert.equal(replay.body.data.reused, true);
    assert.equal(replay.body.data.batchId, first.body.data.batchId);

    const mismatch = await post(ORG_B, valid);
    assert.equal(mismatch.response.status, 409);
    assert.equal(mismatch.body.error.code, "ORGANIZATION_MISMATCH");

    const missing = await post("test-oip-migration-intake-http-missing", await packageFor("test-oip-migration-intake-http-missing"));
    assert.equal(missing.response.status, 404);
    assert.equal(missing.body.error.code, "ORGANIZATION_NOT_FOUND");

    const badDigest = JSON.parse(JSON.stringify(valid));
    badDigest.digests.resourcePayloadDigest = "0".repeat(64);
    const digestResult = await post(ORG_A, badDigest);
    assert.equal(digestResult.response.status, 400);
    assert.equal(digestResult.body.error.code, "EXPORT_DIGEST_MISMATCH");
    assert.equal(await prisma.knowledgeItem.count({ where: { organizationId: ORG_A } }), businessBefore);

    console.log("migration intake HTTP probe passed: 201/200 intake, safe errors, organization binding, and no business import");
  } finally {
    await deleteIfPresent(ORG_A);
    await deleteIfPresent(ORG_B);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
