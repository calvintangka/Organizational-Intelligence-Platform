/*
 * OIP-V2-FIX-006 candidate-to-Source provenance binding proof.
 *
 * This authenticated application-boundary probe creates disposable Sources,
 * Evidence, and proposed Candidates, then exercises mismatch/tampering paths
 * before validating the legitimate candidates. PostgreSQL is limited to
 * disposable identity setup, read assertions, and cleanup.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Client } = require("pg");
const { promisify } = require("node:util");
require("dotenv").config({ path: ".env.local" });

const baseUrl = process.env.OIP_V2_FIX_006_BASE_URL || "http://127.0.0.1:3000";
const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
const primaryOrgId = `oip-v2-fix-006-primary-${suffix}`;
const otherOrgId = `oip-v2-fix-006-other-${suffix}`;
const userId = `oip-v2-fix-006-user-${suffix}`;
const email = `${userId}@example.test`;
const password = `OIP-V2-FIX-006-${suffix}-safe-password!`;
const sessionToken = `oip-v2-fix-006-session-${suffix}`;
const scrypt = promisify(crypto.scrypt);

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

function headers() {
  return { cookie: `oip_session=${sessionToken}`, "content-type": "application/json" };
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) }
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
    description: `${title} has one bounded operational observation for provenance testing.`,
    context: "FIX-006 candidate-to-Source identity test.",
    idempotencyKey: key
  });
}

async function addEvidence(organizationId, sourceId, key, content) {
  return post(`/api/organizations/${organizationId}/memory/experiences/${sourceId}/evidence`, {
    evidenceType: "confirmation",
    content,
    occurredAt: new Date().toISOString(),
    idempotencyKey: key
  });
}

async function prepare(organizationId, sourceId) {
  return post(`/api/organizations/${organizationId}/memory/experiences/${sourceId}/prepare`, {});
}

async function rejectValidation(organizationId, sourceId, candidateId, label) {
  const result = await request(`/api/organizations/${organizationId}/memory/experiences/${sourceId}/validate`, {
    method: "POST",
    body: JSON.stringify({
      candidateId,
      rationale: `FIX-006 rejected-request test: ${label}`,
      idempotencyKey: `rejected-${label}-${suffix}`
    })
  });
  expectStatus(result, 409, label);
  assert.equal(result.body?.error?.code, "CONFLICT", `${label}: expected CONFLICT error envelope`);
  return result;
}

async function count(db, table, organizationId) {
  const result = await db.query(`select count(*)::int as count from ${table} where "organizationId"=$1`, [organizationId]);
  return result.rows[0].count;
}

async function memorySideEffects(db, organizationId) {
  return {
    knowledgeItems: await count(db, "knowledge_items", organizationId),
    validationRecords: await count(db, "validation_records", organizationId),
    memoryChanges: await count(db, "memory_change_records", organizationId),
    trustEvidence: await count(db, "trust_evidence", organizationId)
  };
}

function assertNoSideEffectChange(before, after, label) {
  assert.deepEqual(after, before, `${label}: rejected request changed trusted-memory side effects`);
}

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  let cleaned = false;
  try {
    await db.connect();
    const hash = await passwordHash(password);
    await db.query("BEGIN");
    await db.query(
      'insert into organizations (id,name,industry,description,settings,"createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,current_timestamp,current_timestamp),($6,$7,$3,$4,$5::jsonb,current_timestamp,current_timestamp)',
      [primaryOrgId, "OIP V2 FIX 006 Primary", "QA", "Disposable candidate identity regression", "{}", otherOrgId, "OIP V2 FIX 006 Other"]
    );
    await db.query(
      'insert into users (id,name,email,"passwordHash","activeOrganizationId","updatedAt") values ($1,$2,$3,$4,$5,current_timestamp)',
      [userId, "OIP V2 FIX 006 Authorized Reviewer", email, hash, primaryOrgId]
    );
    for (const organizationId of [primaryOrgId, otherOrgId]) {
      await db.query('insert into organization_memberships ("userId","organizationId",role) values ($1,$2,$3)', [userId, organizationId, "owner"]);
      await db.query(
        'insert into organization_role_assignments (id,"organizationId","userId","roleId","assignedByUserId","updatedAt") select $1,$2,$3,id,$3,current_timestamp from rbac_roles where key=$4',
        [`oip-v2-fix-006-role-${organizationId}`, organizationId, userId, "owner"]
      );
    }
    await db.query('insert into auth_sessions (id,"tokenHash","userId","expiresAt") values ($1,$2,$3,$4)', [
      `oip-v2-fix-006-session-row-${suffix}`, tokenHash(sessionToken), userId, "2099-01-01T00:00:00.000Z"
    ]);
    await db.query("COMMIT");

    const sourceA = await createSource(primaryOrgId, `source-a-${suffix}`, "FIX-006 Source A");
    const sourceB = await createSource(primaryOrgId, `source-b-${suffix}`, "FIX-006 Source B");
    const evidenceA = await addEvidence(primaryOrgId, sourceA.id, `evidence-a-${suffix}`, "Evidence A confirms the Source A intervention.");
    const evidenceB = await addEvidence(primaryOrgId, sourceB.id, `evidence-b-${suffix}`, "Evidence B confirms the Source B intervention.");
    const candidateA = (await prepare(primaryOrgId, sourceA.id)).candidate;
    const candidateB = (await prepare(primaryOrgId, sourceB.id)).candidate;

    const otherSource = await createSource(otherOrgId, `source-other-${suffix}`, "FIX-006 Other Organization Source");
    await addEvidence(otherOrgId, otherSource.id, `evidence-other-${suffix}`, "Evidence from the other organization.");
    const otherCandidate = (await prepare(otherOrgId, otherSource.id)).candidate;

    assert.equal(candidateA.id, `neutral-candidate-${sourceA.id}`);
    assert.equal(candidateB.id, `neutral-candidate-${sourceB.id}`);
    assert.equal(candidateA.proposedContent.lessons[0].sourceTicketId, sourceA.id);
    assert.equal(candidateB.proposedContent.lessons[0].sourceTicketId, sourceB.id);
    assert.notEqual(candidateA.id, candidateB.id);
    const beforePrimarySideEffects = await memorySideEffects(db, primaryOrgId);
    const beforeOtherSideEffects = await memorySideEffects(db, otherOrgId);
    assert.deepEqual(beforePrimarySideEffects, { knowledgeItems: 0, validationRecords: 0, memoryChanges: 0, trustEvidence: 0 });
    assert.deepEqual(beforeOtherSideEffects, { knowledgeItems: 0, validationRecords: 0, memoryChanges: 0, trustEvidence: 0 });

    await rejectValidation(primaryOrgId, sourceA.id, candidateB.id, "same-org-source-a-candidate-b");
    assertNoSideEffectChange(beforePrimarySideEffects, await memorySideEffects(db, primaryOrgId), "Source A + Candidate B");
    await rejectValidation(primaryOrgId, sourceB.id, candidateA.id, "same-org-source-b-candidate-a");
    assertNoSideEffectChange(beforePrimarySideEffects, await memorySideEffects(db, primaryOrgId), "Source B + Candidate A");
    await rejectValidation(primaryOrgId, sourceA.id, `neutral-candidate-fabricated-${suffix}`, "fabricated-candidate");
    await rejectValidation(primaryOrgId, sourceA.id, `neutral-candidate-${crypto.randomUUID()}`, "valid-prefix-wrong-source");
    assertNoSideEffectChange(beforePrimarySideEffects, await memorySideEffects(db, primaryOrgId), "tampered candidate IDs");

    await rejectValidation(primaryOrgId, sourceA.id, otherCandidate.id, "cross-org-source-a-other-candidate");
    assertNoSideEffectChange(beforePrimarySideEffects, await memorySideEffects(db, primaryOrgId), "cross-org candidate in primary organization");
    await rejectValidation(otherOrgId, otherSource.id, candidateA.id, "cross-org-other-source-candidate-a");
    assertNoSideEffectChange(beforeOtherSideEffects, await memorySideEffects(db, otherOrgId), "cross-org candidate in other organization");

    const validatedA = await post(`/api/organizations/${primaryOrgId}/memory/experiences/${sourceA.id}/validate`, {
      candidateId: candidateA.id,
      rationale: "Authorized reviewer verified Source A and Evidence A.",
      idempotencyKey: `validate-a-${suffix}`
    }, 200);
    const inspectedAResult = await request(`/api/organizations/${primaryOrgId}/memory/knowledge/${validatedA.knowledgeItem.id}`);
    expectStatus(inspectedAResult, 200, "Source A inspection");
    const inspectedA = data(inspectedAResult);
    assert.equal(inspectedA.knowledgeItem.provenance.sourceTicketId, sourceA.id);
    assert.equal(inspectedA.evidence.length, 1);
    assert.equal(inspectedA.evidence[0].evidence.id, evidenceA.id);
    assert.equal(inspectedA.evidence[0].evidence.sourceId, sourceA.id);
    assert.equal(inspectedA.evidence[0].source.id, sourceA.id);
    assert.equal(inspectedA.history.validationRecords.length, 1);
    assert.equal(inspectedA.history.validationRecords[0].actor, "OIP V2 FIX 006 Authorized Reviewer");
    assert.equal(inspectedA.history.validationRecords[0].rationale, "Authorized reviewer verified Source A and Evidence A.");
    const sourceBLinks = (await db.query(
      'select count(*)::int as count from memory_evidence_links where "organizationId"=$1 and "knowledgeItemId"=$2 and "evidenceId"=$3',
      [primaryOrgId, validatedA.knowledgeItem.id, evidenceB.id]
    )).rows[0].count;
    assert.equal(sourceBLinks, 0, "Evidence B must not contaminate Source A validation");
    assert.equal(await count(db, "knowledge_items", otherOrgId), 0);
    assert.equal(await count(db, "validation_records", otherOrgId), 0);

    const validatedB = await post(`/api/organizations/${primaryOrgId}/memory/experiences/${sourceB.id}/validate`, {
      candidateId: candidateB.id,
      rationale: "Authorized reviewer verified Source B and Evidence B.",
      idempotencyKey: `validate-b-${suffix}`
    }, 200);
    assert.equal(validatedB.knowledgeItem.sourceTicketId, sourceB.id);
    assert.equal(await count(db, "knowledge_items", primaryOrgId), 2);
    assert.equal(await count(db, "validation_records", primaryOrgId), 2);
    assert.equal(await count(db, "memory_change_records", primaryOrgId), 2);
    assert.equal(await count(db, "trust_evidence", primaryOrgId), 0);
    assert.equal(await count(db, "memory_evidence_links", primaryOrgId), 2);

    console.log(JSON.stringify({
      identity: {
        candidateA: candidateA.id,
        candidateB: candidateB.id,
        canonicalIdentityVerified: true,
        metadataSourceIdAdded: false
      },
      rejectedRequests: {
        sameOrgSourceACandidateB: true,
        sameOrgSourceBCandidateA: true,
        fabricatedCandidate: true,
        validPrefixWrongSource: true,
        crossOrganizationCandidate: true,
        sideEffectsBeforePositiveValidation: beforePrimarySideEffects,
        wrongSourceEvidenceExcluded: true
      },
      positivePath: {
        sourceAValidated: true,
        sourceBValidated: true,
        sourceAEvidencePreserved: evidenceA.id,
        sourceBEvidencePreserved: evidenceB.id,
        validatorIdentityPreserved: true,
        rationalePreserved: true,
        provenanceInspectable: true
      },
      verdict: "OIP_V2_FIX_006_CANDIDATE_SOURCE_PROVENANCE_PROBE_PASSED"
    }, null, 2));
  } finally {
    if (db._connected) {
      await db.query("delete from organizations where id in ($1,$2)", [primaryOrgId, otherOrgId]).catch(() => undefined);
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
