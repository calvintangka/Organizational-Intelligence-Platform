/* OIP-V2-FIX-003 deterministic retrieval, exact-once outcome, and scope proof. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Client } = require("pg");
const { promisify } = require("node:util");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness({ loadEnv: true });
const { seedOrganizationProfiles } = require(path.join(root, "data", "seedOrganizationProfiles.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
require("dotenv").config({ path: path.join(root, ".env.local") });

const baseUrl = process.env.OIP_V2_FIX_003_BASE_URL || "http://127.0.0.1:3000";
const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
const orgId = `oip-v2-fix-003-org-${suffix}`;
const isolationOrgId = `oip-v2-fix-003-isolation-${suffix}`;
const userId = `oip-v2-fix-003-user-${suffix}`;
const email = `${userId}@example.test`;
const password = `OIP-V2-FIX-003-${suffix}-safe-password!`;
const sessionToken = `oip-v2-fix-003-session-${suffix}`;
const scrypt = promisify(crypto.scrypt);

function tokenHash(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}
function headers() { return { cookie: `oip_session=${sessionToken}`, "content-type": "application/json" }; }
async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers: { ...headers(), ...(options.headers ?? {}) } });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 1000); }
  return { status: response.status, body };
}
function data(result) { return result.body?.data; }
function expectStatus(result, status) { assert.equal(result.status, status, JSON.stringify(result.body)); }
async function post(pathname, body, status = 201) {
  const result = await request(pathname, { method: "POST", body: JSON.stringify(body) });
  expectStatus(result, status);
  return data(result);
}

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await db.connect();
    const hash = await passwordHash(password);
    await db.query("BEGIN");
    await db.query('insert into organizations (id,name,industry,description,settings,"createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,current_timestamp,current_timestamp),($6,$7,$3,$4,$5::jsonb,current_timestamp,current_timestamp)', [orgId, "OIP V2 Fix 003 Probe", "QA", "Disposable retrieval and trust acceptance", "{}", isolationOrgId, "OIP V2 Fix 003 Isolation"]);
    await db.query('insert into users (id,name,email,"passwordHash","activeOrganizationId","updatedAt") values ($1,$2,$3,$4,$5,current_timestamp)', [userId, userId, email, hash, orgId]);
    await db.query('insert into organization_memberships ("userId","organizationId",role) values ($1,$2,$3),($1,$4,$3)', [userId, orgId, "owner", isolationOrgId]);
    await db.query('insert into organization_role_assignments (id,"organizationId","userId","roleId","assignedByUserId","updatedAt") select $1,$2,$3,id,$3,current_timestamp from rbac_roles where key=$4', [`oip-v2-fix-003-role-${suffix}`, orgId, userId, "owner"]);
    await db.query('insert into organization_role_assignments (id,"organizationId","userId","roleId","assignedByUserId","updatedAt") select $1,$2,$3,id,$3,current_timestamp from rbac_roles where key=$4', [`oip-v2-fix-003-isolation-role-${suffix}`, isolationOrgId, userId, "owner"]);
    await db.query('insert into auth_sessions (id,"tokenHash","userId","expiresAt") values ($1,$2,$3,$4)', [`oip-v2-fix-003-session-row-${suffix}`, tokenHash(sessionToken), userId, "2099-01-01T00:00:00.000Z"]);
    await db.query("COMMIT");

    const source = await post(`/api/organizations/${orgId}/memory/experiences`, {
      title: "Warehouse scanner synchronization incident A",
      sourceKind: "OPERATIONAL_EVENT",
      occurredAt: "2026-08-24T16:15:00.000Z",
      description: "Handheld scanners stopped synchronizing inventory during movement between network bands while the inventory backend remained operational.",
      location: "Warehouse A",
      context: "The affected network profile was corrected after the roaming transition was isolated.",
      idempotencyKey: `experience-${suffix}`
    });
    const evidenceTexts = [
      ["observation", "Scanners themselves were functioning during the synchronization failures."],
      ["system_result", "Inventory backend was operational while the event occurred."],
      ["investigation", "Failures occurred during specific Wi-Fi roaming transitions between network bands."],
      ["action_taken", "Configuring the affected scanner network profile to prevent problematic roaming resolved the issue."],
      ["confirmation", "Subsequent inventory synchronization succeeded after the intervention."]
    ];
    for (const [evidenceType, content] of evidenceTexts) await post(`/api/organizations/${orgId}/memory/experiences/${source.id}/evidence`, { evidenceType, content, occurredAt: "2026-08-24T16:15:00.000Z", idempotencyKey: `evidence-${evidenceType}-${suffix}` });
    const prepared = await post(`/api/organizations/${orgId}/memory/experiences/${source.id}/prepare`, {});
    const validated = await post(`/api/organizations/${orgId}/memory/experiences/${source.id}/validate`, { candidateId: prepared.candidate.id, rationale: "Human reviewer verified the Source and Evidence as reusable only within its observed scope.", idempotencyKey: `validate-${suffix}` }, 200);
    let inspection = data(await request(`/api/organizations/${orgId}/memory/knowledge/${validated.knowledgeItem.id}`));
    const profile = seedOrganizationProfiles[0];
    const item = inspection.knowledgeItem;
    const eventB = { id: "FIX-003-B", ticketId: "FIX-003-B", subject: "Scanning zones lose synchronization", description: "At another warehouse, handheld inventory scanners periodically stop synchronizing while employees move between scanning zones. Inventory backend services remain healthy.", category: "General", status: "new", createdAt: "2026-08-24T17:00:00.000Z" };
    const eventBUnderstanding = understandForProfile(eventB, profile);
    const eventBMatches = retrieveMemory(eventBUnderstanding, [item], new Set());
    assert.equal(eventBMatches[0]?.item.id, item.canonicalProblemId ?? `canonical-${item.canonicalProblemTitle}`, "non-identical Event B must retrieve Event A");
    assert.match(eventBMatches[0].matchReason, /Shared problem evidence|keyword overlap|compatibility/i);
    const negatives = [
      "Scanners stopped synchronizing because expired device authentication certificates rejected the devices.",
      "An inventory backend outage caused every scanner to stop syncing across the warehouse.",
      "A firmware-specific synchronization defect was confirmed rather than a network roaming problem."
    ];
    const negativeMatches = negatives.map((description) => retrieveMemory(understandForProfile({ id: description, ticketId: description, subject: description, description, category: "General", status: "new", createdAt: "2026-08-24T17:00:00.000Z" }, profile), [item], new Set()));
    assert.equal(negativeMatches[0].length, 0, "certificate root cause must fail closed");
    assert.equal(negativeMatches[1].length, 0, "backend outage must fail closed");
    assert.equal(negativeMatches[2].length, 0, "firmware root cause must fail closed");

    async function outcome(classification, sourceObjectId, content, keySuffix) {
      const current = data(await request(`/api/organizations/${orgId}/memory/knowledge/${item.id}`));
      const key = `fix-003-${keySuffix}-${suffix}`;
      const payload = {
        knowledgeItemId: item.id,
        knowledgeVersionId: current.knowledgeItem.knowledgeVersions.at(-1)?.versionId ?? null,
        expectedKnowledgeRevision: current.knowledgeItem.revision,
        classification,
        requiredEdits: classification === "CORRECTION_REQUIRED",
        reuseMode: "human",
        idempotencyKey: key,
        source: { sourceKind: "OPERATIONAL_EVENT", sourceSystem: "oip.organizational_memory", sourceObjectType: "reuse_event", sourceObjectId, metadata: { title: `Event ${keySuffix} warehouse reuse` } },
        evidence: { evidenceType: "outcome", evidenceRole: "reuse_outcome", content, idempotencyKey: `${key}:evidence` }
      };
      const first = await post(`/api/organizations/${orgId}/memory/outcomes`, payload);
      const [retry, concurrent] = await Promise.all([post(`/api/organizations/${orgId}/memory/outcomes`, payload), post(`/api/organizations/${orgId}/memory/outcomes`, payload)]);
      assert.equal(retry.id, first.id);
      assert.equal(concurrent.id, first.id);
      return first;
    }
    await outcome("SUCCESS", `event-b-${suffix}`, "The roaming profile worked during the next scanning shift.", "B-success");
    await outcome("CORRECTION_REQUIRED", `event-b-correction-${suffix}`, "The lesson worked after a documented correction.", "B-correction");
    await outcome("FAILURE", `event-c-failure-${suffix}`, "The lesson did not work for the separate firmware case.", "C-failure");
    await outcome("FAILURE", `event-d-failure-${suffix}`, "A separate failure remained separate from Event C.", "D-failure");
    inspection = data(await request(`/api/organizations/${orgId}/memory/knowledge/${item.id}`));
    assert.equal(inspection.outcomes.length, 4, "four distinct logical outcomes must remain four rows");
    assert.equal(inspection.knowledgeItem.successfulResolutions, 1);
    assert.equal(inspection.knowledgeItem.failedResolutions, 3);
    assert.ok(inspection.outcomes.every((row) => row.source && row.evidence), "outcome context must be projected with source and evidence");

    const challenge = await post(`/api/organizations/${orgId}/memory/challenges`, {
      knowledgeItemId: item.id,
      knowledgeVersionId: inspection.knowledgeItem.knowledgeVersions.at(-1)?.versionId ?? null,
      expectedKnowledgeRevision: inspection.knowledgeItem.revision,
      rationale: "The lesson must be narrowed to verified network-transition cases.",
      idempotencyKey: `fix-003-challenge-${suffix}`,
      source: { sourceKind: "OPERATIONAL_EVENT", sourceSystem: "oip.organizational_memory", sourceObjectType: "challenge_event", sourceObjectId: `fix-003-challenge-source-${suffix}` },
      evidence: { evidenceType: "outcome", evidenceRole: "challenge", content: "Firmware-specific defects are outside this lesson's verified scope.", idempotencyKey: `fix-003-challenge-evidence-${suffix}` }
    });
    const challenged = data(await request(`/api/organizations/${orgId}/memory/knowledge/${item.id}`));
    assert.equal(challenged.knowledgeItem.autoResponseEligible, false);
    const reviewed = await request(`/api/organizations/${orgId}/memory/challenges/${challenge.id}`, { method: "PATCH", body: JSON.stringify({ disposition: "SCOPE_UPDATED", rationale: "Scope narrowed to network roaming transitions, excluding firmware-specific defects.", expectedKnowledgeRevision: challenged.knowledgeItem.revision, scopePatch: { scopeNote: "Applies to verified network roaming transitions; firmware-specific synchronization defects are out of scope." } }) });
    expectStatus(reviewed, 200);
    const finalInspection = data(await request(`/api/organizations/${orgId}/memory/knowledge/${item.id}`));
    assert.match(finalInspection.knowledgeItem.scopeNote, /firmware-specific/i);
    const eventCAfterScope = retrieveMemory(understandForProfile({ id: "FIX-003-C", ticketId: "FIX-003-C", subject: "Firmware synchronization defect", description: negatives[2], category: "General", status: "new", createdAt: "2026-08-24T17:00:00.000Z" }, profile), [finalInspection.knowledgeItem], new Set());
    assert.equal(eventCAfterScope.length, 0);
    const crossOrg = await request(`/api/organizations/${isolationOrgId}/memory/knowledge/${item.id}`);
    assert.equal(crossOrg.status, 404);
    console.log(JSON.stringify({ retrieval: { eventB: "PASS", nonExact: true, explanation: eventBMatches[0].matchReason, certificate: "PASS", backendOutage: "PASS", firmwareAfterScope: "PASS" }, outcomes: { successRetry: "PASS", correctionRetry: "PASS", failureRetry: "PASS", concurrentRetry: "PASS", separateFailures: "PASS", sourceAndEvidenceProjection: "PASS", trustEffects: "PASS" }, challenge: { failClosed: true, scopeUpdated: true }, isolation: "PASS", verdict: "OIP_V2_FIX_003_RETRIEVAL_OUTCOME_AND_TRUST_PROBE_PASSED" }, null, 2));
  } finally {
    await db.query("delete from organizations where id in ($1,$2)", [orgId, isolationOrgId]).catch(() => undefined);
    await db.end().catch(() => undefined);
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
