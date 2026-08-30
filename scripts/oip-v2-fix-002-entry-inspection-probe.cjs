/* OIP-V2-FIX-002 deterministic domain-neutral entry and inspection proof. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Client } = require("pg");
const { promisify } = require("node:util");
require("dotenv").config({ path: ".env.local" });

const baseUrl = process.env.OIP_V2_FIX_002_BASE_URL || "http://127.0.0.1:3000";
const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
const orgId = `oip-v2-fix-002-org-${suffix}`;
const isolationOrgId = `oip-v2-fix-002-isolation-${suffix}`;
const userId = `oip-v2-fix-002-user-${suffix}`;
const email = `${userId}@example.test`;
const password = `OIP-V2-FIX-002-${suffix}-safe-password!`;
const sourceKey = `experience-${suffix}`;
const sessionToken = `oip-v2-fix-002-session-${suffix}`;
const scrypt = promisify(crypto.scrypt);

function tokenHash(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}
function headers() { return { cookie: `oip_session=${sessionToken}`, "content-type": "application/json" }; }
async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...headers(), ...(options.headers ?? {}) } });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 1000); }
  return { status: response.status, body };
}
function data(result) { return result.body?.data; }
function expectStatus(result, status) { assert.equal(result.status, status, JSON.stringify(result.body)); }
async function post(path, body, status = 201) {
  const result = await request(path, { method: "POST", body: JSON.stringify(body) });
  expectStatus(result, status);
  return data(result);
}

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  let cleaned = false;
  try {
    await db.connect();
    const hash = await passwordHash(password);
    await db.query("BEGIN");
    await db.query('insert into organizations (id,name,industry,description,settings,"createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,current_timestamp,current_timestamp),($6,$7,$3,$4,$5::jsonb,current_timestamp,current_timestamp)', [orgId, "OIP V2 Fix 002 Probe", "QA", "Disposable domain-neutral memory acceptance", "{}", isolationOrgId, "OIP V2 Fix 002 Isolation"]);
    await db.query('insert into users (id,name,email,"passwordHash","activeOrganizationId","updatedAt") values ($1,$2,$3,$4,$5,current_timestamp)', [userId, userId, email, hash, orgId]);
    await db.query('insert into organization_memberships ("userId","organizationId",role) values ($1,$2,$3),($1,$4,$3)', [userId, orgId, "owner", isolationOrgId]);
    await db.query('insert into organization_role_assignments (id,"organizationId","userId","roleId","assignedByUserId","updatedAt") select $1,$2,$3,id,$3,current_timestamp from rbac_roles where key=$4', [`oip-v2-fix-002-role-${suffix}`, orgId, userId, "owner"]);
    await db.query('insert into organization_role_assignments (id,"organizationId","userId","roleId","assignedByUserId","updatedAt") select $1,$2,$3,id,$3,current_timestamp from rbac_roles where key=$4', [`oip-v2-fix-002-isolation-role-${suffix}`, isolationOrgId, userId, "owner"]);
    await db.query('insert into auth_sessions (id,"tokenHash","userId","expiresAt") values ($1,$2,$3,$4)', [`oip-v2-fix-002-session-row-${suffix}`, tokenHash(sessionToken), userId, "2099-01-01T00:00:00.000Z"]);
    await db.query("COMMIT");

    const source = await post(`/api/organizations/${orgId}/memory/experiences`, {
      title: "Warehouse scanner synchronization incident",
      sourceKind: "OPERATIONAL_EVENT",
      occurredAt: new Date().toISOString(),
      description: "Handheld scanners lost inventory synchronization during a specific Wi-Fi roaming transition.",
      location: "Warehouse A",
      context: "Backend health remained normal; the network profile was corrected.",
      idempotencyKey: sourceKey
    });
    const evidenceTexts = [
      ["observation", "Scanners continued functioning during the synchronization failures."],
      ["investigation", "Failures aligned with handheld Wi-Fi roaming transitions."],
      ["system_result", "Inventory backend health checks remained normal."],
      ["action_taken", "The affected scanner network profile was changed to prevent problematic roaming."],
      ["confirmation", "Subsequent inventory synchronization succeeded after the change."]
    ];
    for (const [evidenceType, content] of evidenceTexts) {
      await post(`/api/organizations/${orgId}/memory/experiences/${source.id}/evidence`, { evidenceType, content, occurredAt: new Date().toISOString(), idempotencyKey: `evidence-${evidenceType}-${suffix}` });
    }
    const prepared = await post(`/api/organizations/${orgId}/memory/experiences/${source.id}/prepare`, {}, 201);
    assert.equal(prepared.candidate.sourceTicketIds.length, 0);
    assert.equal((await db.query('select count(*)::int as count from ticket_records where "organizationId"=$1', [orgId])).rows[0].count, 0);

    const validated = await post(`/api/organizations/${orgId}/memory/experiences/${source.id}/validate`, { candidateId: prepared.candidate.id, rationale: "Human reviewer verified the Source and all five Evidence records.", idempotencyKey: `validate-${suffix}` }, 200);
    const knowledgeId = validated.knowledgeItem.id;
    const inspected = await request(`/api/organizations/${orgId}/memory/knowledge/${knowledgeId}`);
    expectStatus(inspected, 200);
    assert.equal(data(inspected).evidence.length, 5);
    assert.equal(data(inspected).history.validationRecords.length, 1);
    assert.equal(data(inspected).knowledgeItem.provenance.sourceTicketId, source.id);

    const currentRevision = data(inspected).knowledgeItem.revision;
    const neutralOutcome = {
      knowledgeItemId: knowledgeId,
      knowledgeVersionId: data(inspected).knowledgeItem.knowledgeVersions.at(-1)?.versionId ?? null,
      expectedKnowledgeRevision: currentRevision,
      classification: "SUCCESS",
      reuseMode: "human",
      idempotencyKey: `reuse-${suffix}`,
      source: { sourceKind: "OPERATIONAL_EVENT", sourceSystem: "oip.organizational_memory", sourceObjectType: "reuse_event", sourceObjectId: `reuse-${suffix}` },
      evidence: { evidenceType: "outcome", evidenceRole: "reuse_outcome", content: "The corrected profile worked during the next scanning shift.", idempotencyKey: `reuse-evidence-${suffix}` }
    };
    const outcome = await post(`/api/organizations/${orgId}/memory/outcomes`, neutralOutcome);
    const replay = await post(`/api/organizations/${orgId}/memory/outcomes`, neutralOutcome);
    assert.equal(replay.id, outcome.id);
    assert.equal((await db.query('select count(*)::int as count from knowledge_reuse_outcomes where "organizationId"=$1 and "idempotencyKey"=$2', [orgId, neutralOutcome.idempotencyKey])).rows[0].count, 1);

    const afterOutcome = data(await request(`/api/organizations/${orgId}/memory/knowledge/${knowledgeId}`));
    assert.equal(afterOutcome.outcomes.length, 1);
    assert.equal(afterOutcome.outcomes[0].classification, "SUCCESS");
    assert.equal(afterOutcome.knowledgeItem.trustScore, 25);
    const challenge = await post(`/api/organizations/${orgId}/memory/challenges`, {
      knowledgeItemId: knowledgeId,
      knowledgeVersionId: afterOutcome.knowledgeItem.knowledgeVersions.at(-1)?.versionId ?? null,
      expectedKnowledgeRevision: afterOutcome.knowledgeItem.revision,
      rationale: "The lesson must be limited to the observed warehouse roaming condition.",
      idempotencyKey: `challenge-${suffix}`,
      source: { sourceKind: "OPERATIONAL_EVENT", sourceSystem: "oip.organizational_memory", sourceObjectType: "challenge_event", sourceObjectId: `challenge-${suffix}` },
      evidence: { evidenceType: "outcome", evidenceRole: "challenge", content: "The supporting evidence is specific to one warehouse roaming condition.", idempotencyKey: `challenge-evidence-${suffix}` }
    });
    const challenged = data(await request(`/api/organizations/${orgId}/memory/knowledge/${knowledgeId}`));
    assert.equal(challenged.knowledgeItem.governanceState, "challenged");
    assert.equal(challenged.knowledgeItem.autoResponseEligible, false);
    const reviewed = await request(`/api/organizations/${orgId}/memory/challenges/${challenge.id}`, { method: "PATCH", body: JSON.stringify({ disposition: "SCOPE_UPDATED", rationale: "Reviewer narrowed the lesson to the verified warehouse condition.", expectedKnowledgeRevision: challenged.knowledgeItem.revision, scopePatch: { scopeNote: "Only affected handheld warehouse roaming transitions." } }) });
    expectStatus(reviewed, 200);
    const finalInspection = data(await request(`/api/organizations/${orgId}/memory/knowledge/${knowledgeId}`));
    assert.equal(finalInspection.knowledgeItem.governanceState, "trusted");
    assert.equal(finalInspection.challenges[0].state, "RESOLVED");
    assert.equal(finalInspection.challenges[0].disposition, "SCOPE_UPDATED");
    assert.ok(finalInspection.knowledgeItem.knowledgeVersions.length >= 2);
    assert.equal(finalInspection.knowledgeItem.provenance.sourceTicketId, source.id);

    const crossTenant = await request(`/api/organizations/${isolationOrgId}/memory/knowledge/${knowledgeId}`);
    assert.equal(crossTenant.status, 404);
    console.log(JSON.stringify({
      entry: { sourceCreated: true, evidenceCount: 5, candidatePendingBeforeValidation: true, noTicketRecordRequired: true },
      validation: { memoryCreated: true, provenanceInspectable: true, evidenceInspectable: true },
      outcomes: { successRecorded: true, retryIdempotent: true, trustUpdatedOnce: true },
      challenges: { openChallenge: true, automationDowngraded: true, scopeUpdated: true, versionHistoryPreserved: true },
      isolation: { crossOrganizationReadBlocked: true },
      verdict: "OIP_V2_FIX_002_ENTRY_AND_INSPECTION_PROBE_PASSED"
    }, null, 2));
  } finally {
    if (db._connected) {
      await db.query("delete from organizations where id in ($1,$2)", [orgId, isolationOrgId]).catch(() => undefined);
      cleaned = true;
    }
    await db.end().catch(() => undefined);
  }
  assert.equal(cleaned, true, "disposable probe data must be cleaned");
}

main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
