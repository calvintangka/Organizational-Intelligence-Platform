/*
 * DOC-FIX-003 — exactly-one-Evidence admission regression protection.
 *
 * This is an authenticated application-boundary probe. PostgreSQL is used only
 * to provision disposable test identity, inspect the resulting projections and
 * provenance, and clean up the synthetic organizations.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Client } = require("pg");
const { promisify } = require("node:util");
require("dotenv").config({ path: ".env.local" });

const baseUrl = process.env.DOC_FIX_003_BASE_URL || "http://127.0.0.1:3000";
const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
const positiveOrgId = `doc-fix-003-positive-${suffix}`;
const noEvidenceOrgId = `doc-fix-003-no-evidence-${suffix}`;
const noValidationOrgId = `doc-fix-003-no-validation-${suffix}`;
const isolationOrgId = `doc-fix-003-isolation-${suffix}`;
const userId = `doc-fix-003-user-${suffix}`;
const email = `${userId}@example.test`;
const password = `DOC-FIX-003-${suffix}-safe-password!`;
const sessionToken = `doc-fix-003-session-${suffix}`;
const scrypt = promisify(crypto.scrypt);

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

function requestHeaders() {
  return { cookie: `oip_session=${sessionToken}`, "content-type": "application/json" };
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { ...requestHeaders(), ...(options.headers || {}) }
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 2000); }
  return { status: response.status, body };
}

function data(result) {
  return result.body?.data;
}

function expectStatus(result, expected, label) {
  assert.equal(result.status, expected, `${label}: ${JSON.stringify(result.body)}`);
}

async function post(pathname, body, expected = 201) {
  const result = await request(pathname, { method: "POST", body: JSON.stringify(body) });
  expectStatus(result, expected, `POST ${pathname}`);
  return data(result);
}

async function createSource(organizationId, key, title) {
  return post(`/api/organizations/${organizationId}/memory/experiences`, {
    title,
    sourceKind: "OPERATIONAL_EVENT",
    occurredAt: new Date().toISOString(),
    description: "A single observed organizational event with a bounded, evidence-backed lesson.",
    context: "This probe intentionally supplies one Source and one Evidence item.",
    idempotencyKey: key
  });
}

async function addEvidence(organizationId, sourceId, key) {
  return post(`/api/organizations/${organizationId}/memory/experiences/${sourceId}/evidence`, {
    evidenceType: "confirmation",
    content: "The bounded intervention restored the affected workflow and was confirmed by the operator.",
    occurredAt: new Date().toISOString(),
    idempotencyKey: key
  });
}

async function count(db, table, organizationId) {
  const result = await db.query(`select count(*)::int as count from ${table} where "organizationId"=$1`, [organizationId]);
  return result.rows[0].count;
}

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  let cleaned = false;
  try {
    await db.connect();
    const hash = await passwordHash(password);
    const organizations = [
      [positiveOrgId, "DOC-FIX-003 Positive"],
      [noEvidenceOrgId, "DOC-FIX-003 No Evidence"],
      [noValidationOrgId, "DOC-FIX-003 No Validation"],
      [isolationOrgId, "DOC-FIX-003 Isolation"]
    ];
    await db.query("BEGIN");
    for (const [organizationId, name] of organizations) {
      await db.query(
        'insert into organizations (id,name,industry,description,settings,"createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,current_timestamp,current_timestamp)',
        [organizationId, name, "QA", "Disposable DOC-FIX-003 regression tenant", "{}"]
      );
    }
    await db.query(
      'insert into users (id,name,email,"passwordHash","activeOrganizationId","updatedAt") values ($1,$2,$3,$4,$5,current_timestamp)',
      [userId, "DOC-FIX-003 Authorized Reviewer", email, hash, positiveOrgId]
    );
    for (const [organizationId] of organizations) {
      await db.query('insert into organization_memberships ("userId","organizationId",role) values ($1,$2,$3)', [userId, organizationId, "owner"]);
      await db.query(
        'insert into organization_role_assignments (id,"organizationId","userId","roleId","assignedByUserId","updatedAt") select $1,$2,$3,id,$3,current_timestamp from rbac_roles where key=$4',
        [`doc-fix-003-role-${organizationId}`, organizationId, userId, "owner"]
      );
    }
    await db.query('insert into auth_sessions (id,"tokenHash","userId","expiresAt") values ($1,$2,$3,$4)', [
      `doc-fix-003-session-row-${suffix}`, tokenHash(sessionToken), userId, "2099-01-01T00:00:00.000Z"
    ]);
    await db.query("COMMIT");

    const noEvidenceSource = await createSource(noEvidenceOrgId, `no-evidence-${suffix}`, "No Evidence Control");
    const noEvidencePrepare = await request(`/api/organizations/${noEvidenceOrgId}/memory/experiences/${noEvidenceSource.id}/prepare`, { method: "POST", body: "{}" });
    expectStatus(noEvidencePrepare, 400, "no-Evidence prepare control");
    assert.equal(await count(db, "knowledge_candidates", noEvidenceOrgId), 0);
    assert.equal(await count(db, "knowledge_items", noEvidenceOrgId), 0);

    const noValidationSource = await createSource(noValidationOrgId, `no-validation-${suffix}`, "No Human Validation Control");
    await addEvidence(noValidationOrgId, noValidationSource.id, `no-validation-evidence-${suffix}`);
    const noValidationPrepared = await post(`/api/organizations/${noValidationOrgId}/memory/experiences/${noValidationSource.id}/prepare`, {});
    assert.equal(noValidationPrepared.candidate.status, "proposed");
    assert.equal(await count(db, "knowledge_items", noValidationOrgId), 0);
    assert.equal(await count(db, "validation_records", noValidationOrgId), 0);
    const unvalidatedRead = await request(`/api/organizations/${noValidationOrgId}/memory/knowledge/neutral-memory-${noValidationSource.id}`);
    expectStatus(unvalidatedRead, 404, "no-human-validation control");

    const source = await createSource(positiveOrgId, `positive-${suffix}`, "Single Experience Admission");
    const evidence = await addEvidence(positiveOrgId, source.id, `positive-evidence-${suffix}`);
    const prepared = await post(`/api/organizations/${positiveOrgId}/memory/experiences/${source.id}/prepare`, {});
    assert.equal(prepared.candidate.sourceTicketIds.length, 0);
    assert.equal(prepared.candidate.status, "proposed");
    assert.equal(await count(db, "knowledge_items", positiveOrgId), 0, "preparation must not create memory");
    assert.equal(await count(db, "knowledge_reuse_outcomes", positiveOrgId), 0);
    assert.equal(await count(db, "emerging_patterns", positiveOrgId), 0);

    const validated = await post(`/api/organizations/${positiveOrgId}/memory/experiences/${source.id}/validate`, {
      candidateId: prepared.candidate.id,
      rationale: "Authorized human reviewer verified the single Source and its sufficient linked Evidence.",
      idempotencyKey: `validate-${suffix}`
    }, 200);
    const knowledgeId = validated.knowledgeItem.id;
    const inspected = await request(`/api/organizations/${positiveOrgId}/memory/knowledge/${knowledgeId}`);
    expectStatus(inspected, 200, "validated memory inspection");
    const inspection = data(inspected);
    assert.equal(inspection.knowledgeItem.lifecycleState, "active");
    assert.equal(inspection.knowledgeItem.timesReused, 0);
    assert.equal(inspection.knowledgeItem.trustScore, 20);
    assert.equal(inspection.knowledgeItem.autoResponseEligible, false);
    assert.equal(inspection.knowledgeItem.provenance.sourceTicketId, source.id);
    assert.equal(inspection.evidence.length, 1);
    assert.equal(inspection.evidence[0].evidence.id, evidence.id);
    assert.equal(inspection.evidence[0].evidence.sourceId, source.id);
    assert.equal(inspection.evidence[0].source.id, source.id);
    assert.equal(inspection.history.validationRecords.length, 1);
    assert.equal(inspection.history.validationRecords[0].actor, "DOC-FIX-003 Authorized Reviewer");
    assert.equal(inspection.history.validationRecords[0].rationale, "Authorized human reviewer verified the single Source and its sufficient linked Evidence.");
    assert.equal(inspection.outcomes.length, 0);
    assert.equal(inspection.challenges.length, 0);

    const sourceCount = await count(db, "organizational_sources", positiveOrgId);
    const evidenceCount = await count(db, "evidence_records", positiveOrgId);
    assert.equal(sourceCount, 1, "positive case must contain exactly one Source");
    assert.equal(evidenceCount, 1, "positive case must contain exactly one Evidence item");
    assert.equal(await count(db, "memory_evidence_links", positiveOrgId), 1);
    assert.equal(await count(db, "knowledge_reuse_outcomes", positiveOrgId), 0);
    assert.equal(await count(db, "emerging_patterns", positiveOrgId), 0);
    const knowledgeRow = (await db.query(
      'select "timesReused","trustScore","autoResponseEligible","successfulResolutions","failedResolutions" from knowledge_items where "organizationId"=$1 and id=$2',
      [positiveOrgId, knowledgeId]
    )).rows[0];
    assert.equal(knowledgeRow.timesReused, 0);
    assert.equal(knowledgeRow.trustScore, 20);
    assert.equal(knowledgeRow.autoResponseEligible, false);
    assert.equal(knowledgeRow.successfulResolutions, null);
    assert.equal(knowledgeRow.failedResolutions, null);
    const validationRow = (await db.query(
      'select "actorId",actor,rationale from validation_records where "organizationId"=$1 and "candidateId"=$2',
      [positiveOrgId, prepared.candidate.id]
    )).rows[0];
    assert.equal(validationRow.actorId, userId);
    assert.equal(validationRow.actor, "DOC-FIX-003 Authorized Reviewer");
    assert.equal(validationRow.rationale, "Authorized human reviewer verified the single Source and its sufficient linked Evidence.");

    const crossTenantRead = await request(`/api/organizations/${isolationOrgId}/memory/knowledge/${knowledgeId}`);
    expectStatus(crossTenantRead, 404, "cross-tenant memory read control");

    console.log(JSON.stringify({
      positiveCase: {
        sourceCount,
        evidenceCount,
        activeMemoryCreated: true,
        sourceProvenancePreserved: true,
        evidenceProvenancePreserved: true,
        validationRecorded: true,
        validatorIdentityPreserved: true,
        validatorRationalePreserved: true,
        initialTrustScore: 20,
        timesReused: 0,
        successfulResolutions: null,
        failedResolutions: null,
        patternCount: 0,
        outcomeCount: 0,
        automationEnabled: false
      },
      negativeControls: {
        noEvidenceRejected: true,
        noHumanValidationRemainsProposed: true,
        crossTenantReadBlocked: true
      },
      verdict: "DOC_FIX_003_SINGLE_EXPERIENCE_REGRESSION_PASSED"
    }, null, 2));
  } finally {
    if (db._connected) {
      await db.query("delete from organizations where id = any($1::text[])", [[positiveOrgId, noEvidenceOrgId, noValidationOrgId, isolationOrgId]]).catch(() => undefined);
      cleaned = true;
    }
    await db.end().catch(() => undefined);
  }
  assert.equal(cleaned, true, "disposable probe data must be cleaned");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
