/* FIX-002 canonical prepared-learning and committed-memory projection proof. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Client } = require("pg");
const { promisify } = require("node:util");
require("dotenv").config({ path: ".env.local" });

const baseUrl = process.env.OIP_V2_FIX_002_BASE_URL || "http://127.0.0.1:3000";
const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
const orgId = `oip-v2-fix-002-projection-${suffix}`;
const isolationOrgId = `oip-v2-fix-002-projection-isolation-${suffix}`;
const userId = `oip-v2-fix-002-projection-user-${suffix}`;
const email = `${userId}@example.test`;
const password = `OIP-V2-FIX-002-${suffix}-safe-password!`;
const sessionToken = `oip-v2-fix-002-projection-session-${suffix}`;
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
function canonicalValues(canonical) {
  return [canonical.title, canonical.problem, canonical.rootCause, canonical.lesson, canonical.solution, canonical.scope, ...(canonical.exclusions ?? []), ...(canonical.signals ?? []), canonical.whenToEscalate].join(" ");
}
function assertCanonicalQuality(canonical, { cause = /mapping|synchron|stale|assignment/i, action = /reconcil|refresh|update|repair/i } = {}) {
  assert(canonical, "canonical learning must be present");
  assert(!/\.\s+within\b/i.test(canonical.lesson), "lesson must not contain malformed '. within' join");
  assert(!/\.,/.test(canonical.lesson), "lesson must not contain malformed '.,' join");
  assert(!/identified contributing condition|confirmed intervention/i.test(canonical.lesson), "specific evidence must replace generic placeholders");
  assert.match(canonical.lesson, /^(?:When|For)\b.+[.!?]$/i, "lesson must be a complete sentence");
  assert.match(canonical.lesson, cause, "lesson must carry the evidenced causal principle");
  assert.match(canonical.lesson, action, "lesson must carry the evidenced action principle");
  assert.notEqual(canonical.problem.trim().toLowerCase(), canonical.rootCause.trim().toLowerCase(), "root cause must not merely repeat the problem");
}
async function createExperience(title, description, context, evidenceTexts) {
  const source = await post(`/api/organizations/${orgId}/memory/experiences`, {
    title, sourceKind: "OPERATIONAL_EVENT", occurredAt: new Date().toISOString(), description,
    location: "Meridian North Maintenance", context, idempotencyKey: `source-${crypto.randomUUID()}`
  });
  for (const [evidenceType, content] of evidenceTexts) {
    await post(`/api/organizations/${orgId}/memory/experiences/${source.id}/evidence`, {
      evidenceType, content, occurredAt: new Date().toISOString(), idempotencyKey: `evidence-${crypto.randomUUID()}`
    });
  }
  return { source, prepared: await post(`/api/organizations/${orgId}/memory/experiences/${source.id}/prepare`, {}, 201) };
}

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  let cleaned = false;
  try {
    await db.connect();
    const hash = await passwordHash(password);
    await db.query("BEGIN");
    await db.query('insert into organizations (id,name,industry,description,settings,"createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,current_timestamp,current_timestamp),($6,$7,$3,$4,$5::jsonb,current_timestamp,current_timestamp)', [orgId, "OIP V2 Fix 002 Projection Probe", "QA", "Disposable canonical learning projection acceptance", "{}", isolationOrgId, "OIP V2 Fix 002 Projection Isolation"]);
    await db.query('insert into users (id,name,email,"passwordHash","activeOrganizationId","updatedAt") values ($1,$2,$3,$4,$5,current_timestamp)', [userId, "FIX-002 Projection Reviewer", email, hash, orgId]);
    await db.query('insert into organization_memberships ("userId","organizationId",role) values ($1,$2,$3),($1,$4,$3)', [userId, orgId, "owner", isolationOrgId]);
    await db.query('insert into organization_role_assignments (id,"organizationId","userId","roleId","assignedByUserId","updatedAt") select $1,$2,$3,id,$3,current_timestamp from rbac_roles where key=$4', [`oip-v2-fix-002-projection-role-${suffix}`, orgId, userId, "owner"]);
    await db.query('insert into organization_role_assignments (id,"organizationId","userId","roleId","assignedByUserId","updatedAt") select $1,$2,$3,id,$3,current_timestamp from rbac_roles where key=$4', [`oip-v2-fix-002-projection-isolation-role-${suffix}`, isolationOrgId, userId, "owner"]);
    await db.query('insert into auth_sessions (id,"tokenHash","userId","expiresAt") values ($1,$2,$3,$4)', [`oip-v2-fix-002-projection-session-row-${suffix}`, tokenHash(sessionToken), userId, "2099-01-01T00:00:00.000Z"]);
    await db.query("COMMIT");

    const transfer = await createExperience(
      "Maintenance zone missing after engineer transfer",
      "A field engineer could authenticate to the maintenance portal, but the newly assigned equipment zone did not appear in the inspection queue while existing zones remained available.",
      "The engineer had recently transferred to a new equipment zone; HR records showed the assignment as correct, but the maintenance-access mapping had not synchronized after the transfer.",
      [
        ["observation", "The engineer authenticated successfully and existing equipment zones remained visible, but the newly assigned zone was missing from the inspection queue."],
        ["investigation", "HR records showed the transfer and new zone assignment as correct; the maintenance-access mapping still contained the previous zone set."],
        ["system_result", "Maintenance portal health and the inspection service were normal for other engineers."],
        ["action_taken", "Operations reconciled and refreshed the engineer's maintenance-access zone mapping."],
        ["confirmation", "After the mapping refresh, the newly assigned equipment zone appeared and the engineer accessed the correct inspection queue."]
      ]
    );
    const canonical = transfer.prepared.candidate.proposedContent.canonicalLearning;
    assert(canonical, "prepared learning must expose one canonical learning object");
    assert.deepEqual(Object.keys(canonical).sort(), ["exclusions", "lesson", "problem", "rootCause", "scope", "signals", "solution", "title", "whenToEscalate"].sort());
    assert.equal(transfer.prepared.candidate.proposedContent.solution, canonical.lesson);
    assert.notEqual(canonical.lesson, "The engineer authenticated successfully and existing equipment zones remained visible, but the newly assigned zone was missing from the inspection queue. HR records showed the transfer and new zone assignment as correct; the maintenance-access mapping still contained the previous zone set. Maintenance portal health and the inspection service were normal for other engineers. Operations reconciled and refreshed the engineer's maintenance-access zone mapping. After the mapping refresh, the newly assigned equipment zone appeared and the engineer accessed the correct inspection queue.");
    assert.match(canonical.lesson, /when/i);
    assert.match(canonical.rootCause, /mapping/i);
    assert.match(canonical.solution, /mapping/i);
    assert.match(canonical.scope, /transferred|equipment zone|maintenance/i);
    assert(canonical.exclusions.length >= 1);
    assertCanonicalQuality(canonical);

    const noisy = await createExperience(
      "Inventory zone missing after supervisor transfer",
      "A warehouse supervisor could sign in to the inventory portal and access existing warehouses, but a newly assigned warehouse did not appear after an internal transfer.",
      "The supervisor recently transferred; HR recorded the new warehouse correctly, but the inventory authorization mapping still contained the previous warehouse assignments.",
      [
        ["observation", "The supervisor signed in successfully and existing warehouses remained visible, but the new warehouse was missing."],
        ["investigation", "The portal and inventory service were healthy; the missing warehouse was isolated to the new assignment."],
        ["investigation", "HR recorded the transfer correctly, but the inventory authorization mapping still contained the previous warehouse assignments."],
        ["system_result", "Other supervisors could access their assigned warehouses normally."],
        ["action_taken", "Operations reconciled and refreshed the inventory authorization mapping."],
        ["confirmation", "After reconciliation, the new warehouse appeared while existing warehouse access remained intact."]
      ]
    );
    const noisyCanonical = noisy.prepared.candidate.proposedContent.canonicalLearning;
    assert.match(noisyCanonical.rootCause, /mapping|previous warehouse/i, "confirmed cause must outrank symptom investigation");
    assertCanonicalQuality(noisyCanonical, { cause: /mapping|previous warehouse/i, action: /reconcil|refresh/i });

    const permuted = await createExperience(
      "Inventory zone missing after supervisor transfer (permuted)",
      "A warehouse supervisor could sign in to the inventory portal and access existing warehouses, but a newly assigned warehouse did not appear after an internal transfer.",
      "The supervisor recently transferred; HR recorded the new warehouse correctly, but the inventory authorization mapping still contained the previous warehouse assignments.",
      [
        ["confirmation", "After reconciliation, the new warehouse appeared while existing warehouse access remained intact."],
        ["action_taken", "Operations reconciled and refreshed the inventory authorization mapping."],
        ["investigation", "HR recorded the transfer correctly, but the inventory authorization mapping still contained the previous warehouse assignments."],
        ["observation", "The supervisor signed in successfully and existing warehouses remained visible, but the new warehouse was missing."],
        ["investigation", "The portal and inventory service were healthy; the missing warehouse was isolated to the new assignment."],
        ["system_result", "Other supervisors could access their assigned warehouses normally."]
      ]
    );
    const permutedCanonical = permuted.prepared.candidate.proposedContent.canonicalLearning;
    assert.equal(permutedCanonical.rootCause, noisyCanonical.rootCause, "Evidence order must not change the canonical root cause");
    assert.equal(permutedCanonical.lesson, noisyCanonical.lesson, "Evidence order must not change the canonical lesson");
    assert.equal(permutedCanonical.solution, noisyCanonical.solution, "Evidence order must not change the action principle");
    assert.equal(permutedCanonical.scope, noisyCanonical.scope, "Evidence order must not change scope");

    const duplicate = await createExperience(
      "Duplicate symptom evidence does not replace cause",
      "A warehouse supervisor could sign in to the inventory portal and access existing warehouses, but a newly assigned warehouse did not appear after an internal transfer.",
      "The supervisor recently transferred; HR recorded the new warehouse correctly, but the inventory authorization mapping still contained the previous warehouse assignments.",
      [
        ["investigation", "The supervisor signed in successfully and existing warehouses remained visible, but the new warehouse was missing."],
        ["investigation", "The supervisor signed in successfully and existing warehouses remained visible, but the new warehouse was missing."],
        ["investigation", "HR recorded the transfer correctly, but the inventory authorization mapping still contained the previous warehouse assignments."],
        ["action_taken", "Operations reconciled and refreshed the inventory authorization mapping."],
        ["confirmation", "After reconciliation, the new warehouse appeared while existing warehouse access remained intact."]
      ]
    );
    const duplicateCanonical = duplicate.prepared.candidate.proposedContent.canonicalLearning;
    assert.match(duplicateCanonical.rootCause, /mapping|previous warehouse/i);
    assertCanonicalQuality(duplicateCanonical, { cause: /mapping|previous warehouse/i, action: /reconcil|refresh/i });
    assert.equal(duplicateCanonical.lesson, noisyCanonical.lesson, "duplicate symptom evidence must not alter the lesson");

    const unknown = await createExperience(
      "Inventory zone missing without confirmed cause",
      "A warehouse supervisor could sign in to the inventory portal and access existing warehouses, but a newly assigned warehouse did not appear after an internal transfer.",
      "Only the newly assigned warehouse is in scope; existing warehouse access and the inventory service remained available.",
      [
        ["observation", "The supervisor signed in successfully and existing warehouses remained visible, but the new warehouse was missing."],
        ["system_result", "The inventory service was healthy and other supervisors were unaffected."],
        ["action_taken", "Operations verified the assignment and refreshed the affected access configuration."],
        ["confirmation", "The new warehouse appeared after the refresh, but the underlying cause was not confirmed."]
      ]
    );
    const unknownCanonical = unknown.prepared.candidate.proposedContent.canonicalLearning;
    assert.match(unknownCanonical.rootCause, /not yet confirmed/i, "unknown cause must remain explicitly uncertain");
    assert.notEqual(unknownCanonical.rootCause.toLowerCase(), unknownCanonical.problem.toLowerCase());
    assert(!/identified contributing condition|confirmed intervention/i.test(unknownCanonical.lesson), "unknown-cause lesson should still be bounded and readable");

    const misTyped = await createExperience(
      "Inventory zone cause recorded under observation",
      "A warehouse supervisor could sign in to the inventory portal and access existing warehouses, but the newly assigned warehouse did not appear after an internal transfer.",
      "Only the newly assigned warehouse is in scope; existing warehouse access remained available.",
      [
        ["observation", "Investigation found that the inventory authorization mapping retained the previous warehouse assignment."],
        ["action_taken", "Operations refreshed the affected access configuration."],
        ["confirmation", "The new warehouse appeared after the refresh, but the cause record was stored under the wrong Evidence type."]
      ]
    );
    const misTypedCanonical = misTyped.prepared.candidate.proposedContent.canonicalLearning;
    assert.match(misTypedCanonical.rootCause, /not yet confirmed/i, "causal text in a non-investigation Evidence type must not be promoted as a confirmed root cause");
    assert(!/retained the previous warehouse assignment/i.test(misTypedCanonical.rootCause), "mis-typed causal Evidence must not become the root cause");

    const validated = await post(`/api/organizations/${orgId}/memory/experiences/${transfer.source.id}/validate`, {
      candidateId: transfer.prepared.candidate.id,
      rationale: "Human reviewer verified the Source, Evidence, scope, and bounded canonical lesson.",
      idempotencyKey: `validate-${suffix}`
    }, 200);
    const item = validated.knowledgeItem;
    assert.deepEqual(item.canonicalLearning, canonical, "committed Memory must preserve the approved canonical object exactly");
    assert.equal(item.approvedAnswer, canonical.lesson);
    assert.equal(item.problem, canonical.problem);
    assert.equal(item.problemSummary, canonical.problem);
    assert.equal(item.internalGuidance, canonical.solution);
    assert.equal(item.scopeNote, canonical.scope);
    assert.deepEqual(item.lessons[0], {
      ...transfer.prepared.candidate.proposedContent.lessons[0]
    }, "the approved lesson record must be carried forward without regeneration");
    assert.equal(item.trustScore, 20);
    assert.equal(item.autoResponseEligible, false);
    assert.equal(item.governanceState, "trusted");
    assert.equal(item.provenance.sourceTicketId, transfer.source.id);

    const replay = await request(`/api/organizations/${orgId}/memory/experiences/${transfer.source.id}/validate`, {
      method: "POST",
      body: JSON.stringify({
      candidateId: transfer.prepared.candidate.id,
      rationale: "Human reviewer verified the Source, Evidence, scope, and bounded canonical lesson.",
      idempotencyKey: `validate-${suffix}`
      })
    });
    assert.equal(replay.status, 404, "a reviewed candidate must not be validated a second time");
    const memoryCount = await db.query('select count(*)::int as count from knowledge_items where "organizationId"=$1 and id=$2', [orgId, item.id]);
    assert.equal(memoryCount.rows[0].count, 1, "one approval must create one Memory");
    const inspected = await request(`/api/organizations/${orgId}/memory/knowledge/${item.id}`);
    expectStatus(inspected, 200);
    assert.deepEqual(data(inspected).knowledgeItem.canonicalLearning, canonical);
    assert.equal(data(inspected).evidence.length, 5);
    assert.equal(data(inspected).history.validationRecords.length, 1);
    assert.equal(data(inspected).outcomes.length, 0, "validation must not create an outcome");

    const named = await createExperience(
      "Named operator access exception",
      "Budi Hartono could sign in but the newly assigned inspection queue was absent.",
      "The maintenance-access mapping was stale after a reassignment.",
      [["observation", "Budi Hartono saw the old queue only."], ["investigation", "The mapping still held the prior assignment."], ["action_taken", "Reconcile the current maintenance mapping."], ["confirmation", "The correct queue appeared after reconciliation."]]
    );
    assert(!/Budi Hartono/i.test(canonicalValues(named.prepared.candidate.proposedContent.canonicalLearning)), "canonical learning must omit incidental employee identity");

    const chronology = await createExperience(
      "Inspection queue mismatch during handover",
      "The queue was checked, the session was restarted, the assignment was compared, and the mapping was refreshed before access returned.",
      "Only the maintenance inspection subsystem was affected during handover.",
      [["observation", "The queue showed the prior assignment."], ["investigation", "The assignment and mapping were compared."], ["action_taken", "The mapping was refreshed."], ["confirmation", "The current queue loaded after refresh."]]
    );
    const chronologyLesson = chronology.prepared.candidate.proposedContent.canonicalLearning;
    assert.notEqual(chronologyLesson.lesson, chronology.prepared.candidate.proposedContent.lessons[0].signals.join(" "));
    assert.match(chronologyLesson.lesson, /before escalating/i);

    const narrow = await createExperience(
      "North inspection tablet feed delayed",
      "One North maintenance tablet displayed a delayed inspection feed while the central service and other tablets were current.",
      "Only the North maintenance tablet feed is in scope; central inspection services were healthy.",
      [["observation", "The North tablet alone showed delayed records."], ["investigation", "Central service health was normal."], ["action_taken", "Refresh the North tablet session."], ["confirmation", "Current records appeared on the North tablet."]]
    );
    const narrowLesson = narrow.prepared.candidate.proposedContent.canonicalLearning;
    assert.match(narrowLesson.scope, /North maintenance tablet/i);
    assert(narrowLesson.exclusions.some((entry) => /only|scope|broader/i.test(entry)));
    assert(!/all system failures/i.test(canonicalValues(narrowLesson)));

    const crossTenant = await request(`/api/organizations/${isolationOrgId}/memory/knowledge/${item.id}`);
    assert.equal(crossTenant.status, 404, "another organization cannot inspect this Memory");
    console.log(JSON.stringify({
      prepared: { canonicalObject: true, boundedLesson: true, evidenceRecapRejected: true, privacyBoundary: true, scopeBoundary: true },
      projection: { humanReviewAndValidationUseSameObject: true, approvedEqualsCommitted: true, noPostApprovalRewrite: true, oneMemoryPerApproval: true },
      safety: { provenance: true, tenantIsolation: true, trustUnchanged: true, outcomesUntouched: true },
      verdict: "OIP_V2_FIX_002_CANONICAL_PROJECTION_REGRESSION_PASSED"
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
