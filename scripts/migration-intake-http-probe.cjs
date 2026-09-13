/* Live HTTP verification for the Batch 5.3 organization-scoped endpoint. */
const assert = require("node:assert/strict");
const { packageFor, deleteIfPresent, profile, persistence, getPrismaClient, ORG_A, ORG_B } = require("./migration-intake-probe.cjs");
const { createMigrationHttpAuth } = require("./lib/migration-http-auth.cjs");

const BASE_URL = process.env.OIP_INTAKE_BASE_URL || "http://127.0.0.1:3001";

async function post(organizationId, body, cookie) {
  const response = await fetch(`${BASE_URL}/api/organizations/${organizationId}/migration-import`, {
    method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body)
  });
  return { response, body: await response.json() };
}

async function main() {
  const valid = await packageFor(ORG_A);
  try {
    await persistence.upsertOrganizationProfiles([profile(ORG_A), profile(ORG_B)]);
    const auth = await createMigrationHttpAuth(BASE_URL, [ORG_A, ORG_B], "migration-intake-http");
    try {
    const prisma = getPrismaClient();
    const businessBefore = await prisma.knowledgeItem.count({ where: { organizationId: ORG_A } });
    const first = await post(ORG_A, valid, auth.cookie);
    assert.equal(first.response.status, 201);
    assert.equal(first.body.data.created, true);
    assert.equal(first.body.data.status, "ready");
    assert.equal(first.body.data.checkpoints.length, 9);
    assert.equal(Object.prototype.hasOwnProperty.call(first.body, "DATABASE_URL"), false);

    const replay = await post(ORG_A, valid, auth.cookie);
    assert.equal(replay.response.status, 200);
    assert.equal(replay.body.data.reused, true);
    assert.equal(replay.body.data.batchId, first.body.data.batchId);

    const mismatch = await post(ORG_B, valid, auth.cookie);
    assert.equal(mismatch.response.status, 409);
    assert.equal(mismatch.body.error.code, "ORGANIZATION_MISMATCH");

    const missing = await post("test-oip-migration-intake-http-missing", await packageFor("test-oip-migration-intake-http-missing"), auth.cookie);
    assert.equal(missing.response.status, 403);
    assert.equal(missing.body.error.code, "FORBIDDEN");

    const badDigest = await packageFor(ORG_B);
    badDigest.digests.resourcePayloadDigest = "0".repeat(64);
    const digestResult = await post(ORG_B, badDigest, auth.cookie);
    assert.equal(digestResult.response.status, 409, JSON.stringify(digestResult.body));
    assert.equal(digestResult.body.error.code, "EXPORT_DIGEST_MISMATCH", JSON.stringify(digestResult.body));
    assert.equal(await prisma.knowledgeItem.count({ where: { organizationId: ORG_A } }), businessBefore);

    console.log("migration intake HTTP probe passed: 201/200 intake, safe errors, organization binding, and no business import");
    } finally {
      await auth.cleanup();
    }
  } finally {
    await deleteIfPresent(ORG_A);
    await deleteIfPresent(ORG_B);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
