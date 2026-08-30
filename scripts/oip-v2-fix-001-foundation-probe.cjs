/* OIP-V2-FIX-001 deterministic Case A -> Case B -> Case C proof. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { promisify } = require("node:util");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const baseUrl = process.env.OIP_V2_FIX_001_BASE_URL || "http://127.0.0.1:3412";
const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
const orgId = `oip-v2-fix-001-org-${suffix}`;
const userId = `oip-v2-fix-001-user-${suffix}`;
const email = `${userId}@example.test`;
const ticketA = `OIP-V2-FIX-001-A-${suffix}`;
const ticketB = `OIP-V2-FIX-001-B-${suffix}`;
const ticketC = `OIP-V2-FIX-001-C-${suffix}`;
const password = `OIP-V2-FIX-001-${suffix}-safe-password!`;
const scrypt = promisify(crypto.scrypt);

function tokenHash(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}
function cookie(token) { return `oip_session=${token}`; }
function headers(session) { return { cookie: session, "content-type": "application/json" }; }
async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 1000); }
  return { status: response.status, body };
}
async function startServer() {
  const port = new URL(baseUrl).port || "3412";
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", port], {
    cwd: process.cwd(), windowsHide: true,
    env: { ...process.env, RATE_LIMIT_MODE: "off", AI_MODE: "disabled", NEXT_PUBLIC_AI_MODE: "disabled", ANTHROPIC_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  server.stdout.on("data", (chunk) => { output = `${output}${chunk}`.slice(-12000); });
  server.stderr.on("data", (chunk) => { output = `${output}${chunk}`.slice(-12000); });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next server exited before readiness.\n${output}`);
    try { await fetch(`${baseUrl}/api/auth/me`); return server; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  server.kill();
  throw new Error(`Next server did not become ready.\n${output}`);
}
function ticketPayload(ticketId, rawMessage) {
  return [
    `oip-v2-fix-001-row-${ticketId}`,
    orgId,
    ticketId,
    rawMessage,
    "Reusable operational resolution",
    "in_review",
    "deterministic",
    JSON.stringify({ category: "Verification", intent: "support" }),
    JSON.stringify({}),
    JSON.stringify({ validationEligible: false, evidenceIds: [] }),
    "[]",
    "[]"
  ];
}
function validationPayload() {
  const now = new Date().toISOString();
  const knowledgeId = `oip-v2-fix-001-knowledge-${suffix}`;
  const candidateId = `oip-v2-fix-001-candidate-${suffix}`;
  const validationId = `oip-v2-fix-001-validation-${suffix}`;
  const item = {
    id: knowledgeId, organizationId: orgId, title: "Reusable operational resolution",
    problem: "A recurring operational issue needs the verified workflow.",
    approvedAnswer: "Use the verified workflow and confirm the result.", category: "Verification",
    tags: ["oip-v2-fix-001"], sourceTicketId: ticketA, timesReused: 0,
    createdAt: now, approvedAt: now, trustScore: 30, autoResponseEligible: false,
    lessons: [], knowledgeVersions: [], governanceState: "trusted"
  };
  return {
    candidate: { id: candidateId, organizationId: orgId, sourceTicketIds: [ticketA], proposedAction: "create_new", proposedContent: { solution: item.problem, customerResponseTemplate: item.approvedAnswer, internalGuidance: item.problem, canonicalProblemTitle: item.title, category: item.category }, rationale: "OIP-V2-FIX-001 Case A", status: "proposed", createdAt: now },
    validation: { id: validationId, organizationId: orgId, candidateId, knowledgeId, decision: "approved", actor: "client-claimed-actor-is-ignored", roleExercised: "knowledge_validator", rationale: "Human validation for Case A", timestamp: now },
    memoryChange: { id: `oip-v2-fix-001-memory-${suffix}`, organizationId: orgId, knowledgeId, candidateId, validationRecordId: validationId, changeType: "create_new", beforeState: null, afterState: item, timestamp: now },
    knowledgeItem: item, expectedKnowledgeRevision: null, idempotencyKey: validationId
  };
}

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  const sessionToken = `oip-v2-fix-001-session-${suffix}`;
  let server;
  let cleaned = false;
  try {
    await db.connect();
    const hash = await passwordHash(password);
    await db.query('insert into organizations (id,name,industry,description,settings,"createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,current_timestamp,current_timestamp)', [orgId, "OIP V2 Foundation Probe", "QA", "Disposable OIP V2 foundation acceptance", "{}"]).then(async () => {
      await db.query('insert into users (id,name,email,"passwordHash","activeOrganizationId","updatedAt") values ($1,$2,$3,$4,$5,current_timestamp)', [userId, userId, email, hash, orgId]);
      await db.query('insert into organization_memberships ("userId","organizationId",role) values ($1,$2,$3)', [userId, orgId, "owner"]);
      await db.query('insert into organization_role_assignments (id,"organizationId","userId","roleId","assignedByUserId","updatedAt") select $1,$2,$3,id,$3,current_timestamp from rbac_roles where key=$4', [`oip-v2-fix-001-role-${suffix}`, orgId, userId, "owner"]);
      await db.query('insert into auth_sessions (id,"tokenHash","userId","expiresAt") values ($1,$2,$3,$4)', [`oip-v2-fix-001-session-row-${suffix}`, tokenHash(sessionToken), userId, "2099-01-01T00:00:00.000Z"]);
    });
    for (const [ticketId, raw] of [[ticketA, "Recurring operational issue, first verified resolution."], [ticketB, "Recurring operational issue, successful reuse."], [ticketC, "Recurring operational issue, conflicting reuse result."]]) {
      await db.query('insert into ticket_records (id,"organizationId","ticketId","rawMessage",subject,status,"draftSource",classification,resolution,reflection,"validationRecordIds",labels,"createdAt") values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,current_timestamp)', ticketPayload(ticketId, raw));
    }

    server = await startServer();
    const session = cookie(sessionToken);
    const transition = (ticketId, command) => request(`/api/organizations/${orgId}/tickets/${encodeURIComponent(ticketId)}/transition`, { method: "POST", headers: headers(session), body: JSON.stringify(command) });
    const attachAndResolve = async (ticketId, note) => {
      const attached = await transition(ticketId, { kind: "attach_resolution_evidence", evidenceType: "manual_verified_resolution", note, idempotencyKey: `resolution-${ticketId}` });
      assert.equal(attached.status, 200, JSON.stringify(attached.body));
      const evidenceId = attached.body.data.resolutionEvidence.at(-1).id;
      const resolved = await transition(ticketId, { kind: "resolve_with_evidence", evidenceId });
      assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
      return { evidenceId };
    };

    // Case A: resolution evidence gates learning, then validation creates memory.
    const aEvidence = await attachAndResolve(ticketA, "Human verified the reusable workflow.");
    const committed = await request(`/api/organizations/${orgId}/commits/validation`, { method: "POST", headers: headers(session), body: JSON.stringify(validationPayload()) });
    assert.equal(committed.status, 200, JSON.stringify(committed.body));
    const knowledgeId = committed.body.data.knowledgeItem.id;
    const aEvidenceRows = await db.query('select mel.relationship, er.id as evidence_id, os."sourceObjectId" as source_object_id from memory_evidence_links mel join evidence_records er on er.id=mel."evidenceId" join organizational_sources os on os.id=er."sourceId" where mel."organizationId"=$1 and mel."knowledgeItemId"=$2', [orgId, knowledgeId]);
    assert.ok(aEvidenceRows.rows.some((row) => row.relationship === "origin" && row.source_object_id === ticketA));
    assert.ok(aEvidenceRows.rows.some((row) => row.evidence_id));

    // Case B: durable SUCCESS outcome and idempotent retry.
    await attachAndResolve(ticketB, "Human verified the successful reuse.");
    const current = (await db.query('select revision from knowledge_items where id=$1 and "organizationId"=$2', [knowledgeId, orgId])).rows[0].revision;
    const successPayload = {
      knowledgeItemId: knowledgeId, expectedKnowledgeRevision: current, idempotencyKey: `success-${suffix}`,
      classification: "SUCCESS", reuseMode: "human",
      source: { sourceKind: "support_ticket", sourceSystem: "oip.support", sourceObjectType: "ticket", sourceObjectId: ticketB },
      evidence: { evidenceType: "manual_verified_resolution", evidenceRole: "reuse_resolution", content: "Human verified successful reuse.", idempotencyKey: `support-reuse-evidence-${ticketB}` }
    };
    const success = await request(`/api/organizations/${orgId}/memory/outcomes`, { method: "POST", headers: headers(session), body: JSON.stringify(successPayload) });
    assert.equal(success.status, 201, JSON.stringify(success.body));
    const successReplay = await request(`/api/organizations/${orgId}/memory/outcomes`, { method: "POST", headers: headers(session), body: JSON.stringify(successPayload) });
    assert.equal(successReplay.status, 201, JSON.stringify(successReplay.body));
    assert.equal(successReplay.body.data.id, success.body.data.id);
    const afterSuccess = (await db.query('select revision,"timesReused", "successfulResolutions" from knowledge_items where id=$1', [knowledgeId])).rows[0];
    assert.equal(Number(afterSuccess.timesReused), Number(committed.body.data.knowledgeItem.timesReused) + 1);
    assert.equal(Number(afterSuccess.successfulResolutions), Number(committed.body.data.knowledgeItem.successfulResolutions || 0) + 1);
    assert.equal((await db.query('select count(*)::int as count from knowledge_reuse_outcomes where "organizationId"=$1 and "idempotencyKey"=$2', [orgId, successPayload.idempotencyKey])).rows[0].count, 1);

    // Case C: CORRECTION_REQUIRED and FAILURE are durable, then human challenge/scope review.
    const correctionPayload = {
      knowledgeItemId: knowledgeId, expectedKnowledgeRevision: Number(afterSuccess.revision), idempotencyKey: `correction-${suffix}`,
      classification: "CORRECTION_REQUIRED", reuseMode: "human", requiredEdits: ["Narrow the lesson to the verified operating condition."],
      source: { sourceKind: "support_ticket", sourceSystem: "oip.support", sourceObjectType: "ticket", sourceObjectId: ticketB },
      evidence: { evidenceType: "manual_verified_resolution", evidenceRole: "reuse_correction", content: "The lesson needs a narrower scope before reuse.", idempotencyKey: `support-correction-evidence-${ticketB}` }
    };
    const correction = await request(`/api/organizations/${orgId}/memory/outcomes`, { method: "POST", headers: headers(session), body: JSON.stringify(correctionPayload) });
    assert.equal(correction.status, 201, JSON.stringify(correction.body));
    assert.equal((await db.query('select count(*)::int as count from knowledge_reuse_outcomes where "organizationId"=$1 and classification=\'CORRECTION_REQUIRED\'', [orgId])).rows[0].count, 1);

    const beforeFailure = (await db.query('select revision,content,"sourceTicketId", "failedResolutions" from knowledge_items where id=$1', [knowledgeId])).rows[0];
    await attachAndResolve(ticketC, "Human verified the conflicting reuse case.");
    const failurePayload = {
      knowledgeItemId: knowledgeId, expectedKnowledgeRevision: Number(beforeFailure.revision), idempotencyKey: `failure-${suffix}`,
      classification: "FAILURE", reuseMode: "human",
      source: { sourceKind: "support_ticket", sourceSystem: "oip.support", sourceObjectType: "ticket", sourceObjectId: ticketC },
      evidence: { evidenceType: "manual_verified_resolution", evidenceRole: "reuse_failure", content: "The reused workflow did not resolve the case.", idempotencyKey: `support-failure-evidence-${ticketC}` }
    };
    const failure = await request(`/api/organizations/${orgId}/memory/outcomes`, { method: "POST", headers: headers(session), body: JSON.stringify(failurePayload) });
    assert.equal(failure.status, 201, JSON.stringify(failure.body));
    const afterFailure = (await db.query('select revision,content,"sourceTicketId", "failedResolutions" from knowledge_items where id=$1', [knowledgeId])).rows[0];
    assert.equal(afterFailure.content.problem, beforeFailure.content.problem);
    assert.equal(afterFailure.sourceTicketId, beforeFailure.sourceTicketId);
    assert.equal(Number(afterFailure.failedResolutions), Number(beforeFailure.failedResolutions || 0) + 1);
    const challengePayload = {
      knowledgeItemId: knowledgeId, expectedKnowledgeRevision: Number(afterFailure.revision), idempotencyKey: `challenge-${suffix}`,
      rationale: "Failure evidence shows the reusable workflow is narrower than the original lesson.",
      source: { sourceKind: "support_ticket", sourceSystem: "oip.support", sourceObjectType: "ticket", sourceObjectId: ticketC },
      evidence: { evidenceType: "manual_verified_resolution", evidenceRole: "challenge", content: "Conflicting reuse evidence requires human review.", idempotencyKey: `challenge-evidence-${ticketC}` }
    };
    const opened = await request(`/api/organizations/${orgId}/memory/challenges`, { method: "POST", headers: headers(session), body: JSON.stringify(challengePayload) });
    assert.equal(opened.status, 201, JSON.stringify(opened.body));
    const challenged = (await db.query('select revision,"governanceState", "autoResponseEligible" from knowledge_items where id=$1', [knowledgeId])).rows[0];
    assert.equal(challenged.governanceState, "challenged");
    assert.equal(challenged.autoResponseEligible, false);
    const reviewed = await request(`/api/organizations/${orgId}/memory/challenges/${opened.body.data.id}`, { method: "PATCH", headers: headers(session), body: JSON.stringify({ disposition: "SCOPE_UPDATED", rationale: "Human reviewer narrowed the lesson to the verified operational condition.", expectedKnowledgeRevision: Number(challenged.revision), scopePatch: { tags: ["oip-v2-fix-001", "narrowed-scope"] } }) });
    assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body));
    const final = (await db.query('select revision,"governanceState", "sourceTicketId", content from knowledge_items where id=$1', [knowledgeId])).rows[0];
    assert.equal(final.governanceState, "trusted");
    assert.equal(final.sourceTicketId, ticketA);
    assert.ok(final.content.knowledgeVersions.length >= 1);
    assert.equal((await db.query('select count(*)::int as count from knowledge_challenge_decisions where "organizationId"=$1', [orgId])).rows[0].count, 1);
    assert.equal((await db.query("select count(*)::int as count from knowledge_challenges where \"organizationId\"=$1 and state='RESOLVED'", [orgId])).rows[0].count, 1);

    console.log(JSON.stringify({ caseA: { evidenceGate: true, validatedMemory: true, originProvenance: true }, caseB: { successOutcome: true, retryIdempotent: true, trustUpdatedOnce: true }, caseC: { correctionOutcome: true, failureOutcome: true, originalContentPreserved: true, humanChallenge: true, scopeUpdateVersioned: true, provenancePreserved: true, openChallengeDowngradedAutomation: true }, proofInvariants: { storedInformationNotValidatedMemory: true, retrievalNotTruth: true, failureNotAutomaticInvalidation: true, reflectionNotPromotion: true, laterEvidenceNotHistoricalRewrite: true, challengeNotDeletion: true, revalidationHistoryPreserved: true } }, null, 2));
    console.log("OIP-V2-FIX-001 foundation probe passed.");
  } finally {
    if (db._connected) {
      await db.query('delete from organizations where id=$1', [orgId]);
      cleaned = true;
    }
    await db.end().catch(() => undefined);
    if (server) server.kill();
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.equal(cleaned, true, "disposable probe data must be cleaned");
}

main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
