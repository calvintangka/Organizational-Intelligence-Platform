/*
 * NC-FIX-003 permanent regression probe.
 *
 * Exercises the real authenticated HTTP boundary with disposable tenants and
 * no AI calls: unresolved validation rejection, Reflection-only rejection,
 * explicit evidence attachment, evidence-backed resolution, validation after
 * resolution, agent/manual verification, concurrency, tenancy, and restart
 * durability.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { promisify } = require("node:util");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

process.env.RATE_LIMIT_HASH_SECRET = process.env.RATE_LIMIT_HASH_SECRET || "nc-fix-003-probe-secret";
const baseUrl = process.env.NC_FIX_003_BASE_URL || "http://127.0.0.1:3404";
const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
const orgA = `nc-fix-003-org-a-${suffix}`;
const orgB = `nc-fix-003-org-b-${suffix}`;
const userA = `nc-fix-003-user-a-${suffix}`;
const userB = `nc-fix-003-user-b-${suffix}`;
const emailA = `${userA}@example.test`;
const emailB = `${userB}@example.test`;
const password = `NC-FIX-003-${suffix}-safe-password!`;
const ticketA = `NC-FIX-003-A-${suffix}`;
const ticketB = `NC-FIX-003-B-${suffix}`;
const ticketC = `NC-FIX-003-C-${suffix}`;
const ticketD = `NC-FIX-003-D-${suffix}`;
const scrypt = promisify(crypto.scrypt);

function tokenHash(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}
function sessionCookie(token) { return `oip_session=${token}`; }
function jsonHeaders(cookie) { return { cookie, "content-type": "application/json" }; }
async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
  return { status: response.status, headers: response.headers, body };
}
async function startServer() {
  const port = new URL(baseUrl).port || "3404";
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
function classification() {
  return JSON.stringify({ category: "Verification", intent: "support", canonicalProblem: "Resolution evidence gating", classifiedBy: "deterministic", confidence: "high" });
}
function reflection() {
  return JSON.stringify({ decision: "create_new", lessonCreatedId: null, lessonReinforcedId: null, knowledgeChanged: null, validationEligible: false, validationEligibilityReason: "Resolution evidence is required before validation.", evidenceIds: [] });
}
function resolution(finalResponse = null) {
  return JSON.stringify({ finalResponse, humanEdited: false, editDistanceNote: null, resolvedAt: null, draftRevision: finalResponse ? 1 : 0 });
}
async function seed(db) {
  const hash = await passwordHash(password);
  await db.query('insert into organizations (id,name,industry,description,settings,"createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,current_timestamp,current_timestamp), ($6,$7,$8,$9,$5::jsonb,current_timestamp,current_timestamp)', [orgA, "NC-FIX-003 Disposable A", "QA", "Resolution evidence probe", JSON.stringify({}), orgB, "NC-FIX-003 Disposable B", "QA", "Tenant isolation probe"]);
  for (const [userId, email, organizationId] of [[userA, emailA, orgA], [userB, emailB, orgB]]) {
    await db.query('insert into users (id,name,email,"passwordHash","activeOrganizationId","updatedAt") values ($1,$2,$3,$4,$5,current_timestamp)', [userId, userId, email, hash, organizationId]);
    await db.query('insert into organization_memberships ("userId","organizationId",role) values ($1,$2,$3)', [userId, organizationId, "owner"]);
    await db.query('insert into organization_role_assignments (id,"organizationId","userId","roleId","assignedByUserId","updatedAt") select $1,$2,$3,id,$3,current_timestamp from rbac_roles where key=$4', [`nc-fix-003-assignment-${userId}`, organizationId, userId, "owner"]);
  }
  const tokens = { a: `nc-fix-003-a-${suffix}`, b: `nc-fix-003-b-${suffix}` };
  await db.query('insert into auth_sessions (id,"tokenHash","userId","expiresAt") values ($1,$2,$3,$4),($5,$6,$7,$4)', [`nc-fix-003-session-a-${suffix}`, tokenHash(tokens.a), userA, "2099-01-01T00:00:00.000Z", `nc-fix-003-session-b-${suffix}`, tokenHash(tokens.b), userB]);
  const values = [
    [ticketA, "Initial customer confirmation candidate", "in_review", "Initial customer says the issue is fixed.", "Agent sent a response but no evidence has been recorded."],
    [ticketB, "Agent verification candidate", "in_review", "Customer issue requiring agent verification.", "Agent verified the fix manually."],
    [ticketC, "Manual verification candidate", "in_review", "Customer issue requiring manual verification.", "Manual review confirms resolution."],
    [ticketD, "Concurrent evidence candidate", "in_review", "Concurrent resolution case.", "Agent response for concurrent case."]
  ];
  for (const [ticketId, subject, status, rawMessage] of values) {
    await db.query('insert into ticket_records (id,"organizationId","ticketId","rawMessage",subject,status,"draftSource",classification,resolution,reflection,"validationRecordIds",labels,"createdAt") values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,current_timestamp)', [`nc-fix-003-row-${ticketId}`, orgA, ticketId, rawMessage, subject, status, "deterministic", classification(), resolution(), reflection(), "[]", "[]"]);
  }
  for (const [ticketId, customer, agent] of [[ticketA, "Customer confirms the original issue is fixed.", "Agent response sent without confirmation."], [ticketB, "Customer needs a verified fix.", "Agent verified the fix after checking the account."], [ticketC, "Customer needs manual review.", "Agent response awaiting manual verification."], [ticketD, "Customer confirms concurrent case is fixed.", "Agent response for concurrent evidence test."]]) {
    await db.query('insert into ticket_messages (id,"organizationId","ticketId",sequence,direction,content,"createdAt","idempotencyKey") values ($1,$2,$3,1,$4,$5,current_timestamp,$6),($7,$2,$3,2,$8,$9,current_timestamp,$10)', [`ticket-message-${ticketId}-1`, orgA, ticketId, "customer", customer, `seed-customer-${ticketId}`, `ticket-message-${ticketId}-2`, "agent", agent, `seed-agent-${ticketId}`]);
  }
  return tokens;
}
function validationPayload(ticketId) {
  const now = new Date().toISOString();
  const candidateId = `nc-fix-003-candidate-${ticketId}`;
  const validationId = `nc-fix-003-validation-${ticketId}`;
  const knowledgeId = `nc-fix-003-knowledge-${ticketId}`;
  const item = {
    id: knowledgeId, organizationId: orgA, title: `NC-FIX-003 ${ticketId}`, problem: "Disposable evidence gate problem.", approvedAnswer: "Disposable evidence-backed answer.", category: "Probe", tags: ["nc-fix-003"], sourceTicketId: ticketId, timesReused: 0, createdAt: now, approvedAt: now, trustScore: 30, lessons: [], knowledgeVersions: []
  };
  return {
    candidate: { id: candidateId, organizationId: orgA, sourceTicketIds: [ticketId], proposedAction: "create_new", proposedContent: { solution: item.problem, customerResponseTemplate: item.approvedAnswer, internalGuidance: item.problem, canonicalProblemTitle: item.title, category: "Probe" }, rationale: "NC-FIX-003 evidence gate probe.", status: "proposed", createdAt: now },
    validation: { id: validationId, organizationId: orgA, candidateId, knowledgeId, decision: "approved", actor: "client-claimed-actor-must-not-win", roleExercised: "knowledge_validator", rationale: "NC-FIX-003 probe.", timestamp: now },
    memoryChange: { id: `nc-fix-003-memory-${ticketId}`, organizationId: orgA, knowledgeId, candidateId, validationRecordId: validationId, changeType: "create_new", beforeState: null, afterState: item, timestamp: now },
    knowledgeItem: item, expectedKnowledgeRevision: null, idempotencyKey: validationId
  };
}
async function cleanup(db) {
  await db.query('delete from users where id in ($1,$2)', [userA, userB]);
  await db.query('delete from organizations where id in ($1,$2)', [orgA, orgB]);
}

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  let server = await startServer();
  let cleaned = false;
  try {
    await db.connect();
    const tokens = await seed(db);
    const cookieA = sessionCookie(tokens.a);
    const cookieB = sessionCookie(tokens.b);
    const transition = (ticketId, command, cookie = cookieA) => request(`/api/organizations/${orgA}/tickets/${encodeURIComponent(ticketId)}/transition`, { method: "POST", headers: jsonHeaders(cookie), body: JSON.stringify(command) });
    const validation = (ticketId, cookie = cookieA) => request(`/api/organizations/${orgA}/commits/validation`, { method: "POST", headers: jsonHeaders(cookie), body: JSON.stringify(validationPayload(ticketId)) });

    const unresolved = await validation(ticketA);
    assert.equal(unresolved.status, 409);
    assert.equal(unresolved.body.error.code, "RESOLUTION_EVIDENCE_REQUIRED");
    const reflectionOnly = await transition(ticketA, { kind: "commit", validationRecordIds: [], knowledgeId: null, action: "create_new", automatic: false });
    assert.equal(reflectionOnly.status, 409);
    assert.equal(reflectionOnly.body.error.code, "RESOLUTION_EVIDENCE_REQUIRED");
    const nonConfirmingReply = await transition(ticketA, { kind: "append_customer_message", content: "I have another question, but I have not confirmed the fix.", idempotencyKey: `non-confirming-${suffix}` });
    assert.equal(nonConfirmingReply.status, 200);
    assert.equal(nonConfirmingReply.body.data.status, "in_review");
    const stillBlocked = await validation(ticketA);
    assert.equal(stillBlocked.status, 409);
    assert.equal(stillBlocked.body.error.code, "RESOLUTION_EVIDENCE_REQUIRED");

    const sourceMessageId = `ticket-message-${ticketA}-1`;
    const evidence = await transition(ticketA, { kind: "attach_resolution_evidence", evidenceType: "customer_confirmation", sourceMessageId, note: "Customer explicitly confirmed the original issue is fixed.", idempotencyKey: `customer-confirmation-${suffix}` });
    assert.equal(evidence.status, 200);
    assert.equal(evidence.body.data.resolutionEvidence.length, 1);
    assert.equal(evidence.body.data.resolutionEvidence[0].sourceMessageId, sourceMessageId);
    const evidenceRead = await request(`/api/organizations/${orgA}/tickets/${encodeURIComponent(ticketA)}/evidence`, { headers: { cookie: cookieA } });
    assert.equal(evidenceRead.status, 200);
    assert.equal(evidenceRead.body.data[0].type, "customer_confirmation");
    const resolved = await transition(ticketA, { kind: "resolve_with_evidence", evidenceId: evidence.body.data.resolutionEvidence[0].id });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.data.status, "resolved");
    assert.equal(resolved.body.data.resolution.resolvedBy, userA);
    assert.equal(resolved.body.data.reflection.validationEligible, true);
    assert.equal(resolved.body.data.resolution.evidenceIds.length, 1);
    const committed = await validation(ticketA);
    assert.equal(committed.status, 200);
    assert.equal(committed.body.data.auditSummary.sourceTicketIds[0], ticketA);
    const replay = await validation(ticketA);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.data.replayed, true);

    for (const [ticketId, type, note] of [[ticketB, "agent_verification", "Agent verified the resolution after checking the account."], [ticketC, "manual_verified_resolution", "Authorized reviewer manually verified the resolution."]]) {
      const attached = await transition(ticketId, { kind: "attach_resolution_evidence", evidenceType: type, note, idempotencyKey: `${type}-${suffix}` });
      assert.equal(attached.status, 200);
      const done = await transition(ticketId, { kind: "resolve_with_evidence", evidenceId: attached.body.data.resolutionEvidence[0].id });
      assert.equal(done.status, 200);
      assert.equal(done.body.data.status, "resolved");
      assert.equal(done.body.data.resolutionEvidence[0].type, type);
    }

    const firstEvidence = await transition(ticketD, { kind: "attach_resolution_evidence", evidenceType: "agent_verification", note: "Concurrent test agent verification.", idempotencyKey: `concurrent-agent-${suffix}` });
    const secondEvidence = await transition(ticketD, { kind: "attach_resolution_evidence", evidenceType: "manual_verified_resolution", note: "Concurrent test manual verification.", idempotencyKey: `concurrent-manual-${suffix}` });
    assert.equal(firstEvidence.status, 200);
    assert.equal(secondEvidence.status, 200);
    const concurrent = await Promise.all([
      transition(ticketD, { kind: "resolve_with_evidence", evidenceId: firstEvidence.body.data.resolutionEvidence[0].id }),
      transition(ticketD, { kind: "resolve_with_evidence", evidenceId: secondEvidence.body.data.resolutionEvidence[1].id })
    ]);
    assert.deepEqual(concurrent.map((result) => result.status).sort(), [200, 409]);
    const concurrentRead = await request(`/api/organizations/${orgA}/tickets/${encodeURIComponent(ticketD)}/evidence`, { headers: { cookie: cookieA } });
    assert.equal(concurrentRead.status, 200);
    assert.equal(concurrentRead.body.data.length, 2);

    assert.equal((await request(`/api/organizations/${orgA}/tickets/${encodeURIComponent(ticketA)}/evidence`, { headers: { cookie: cookieB } })).status, 403);
    assert.equal((await transition(ticketA, { kind: "attach_resolution_evidence", evidenceType: "manual_verified_resolution", note: "cross tenant", idempotencyKey: `cross-${suffix}` }, cookieB)).status, 403);

    server.kill();
    await new Promise((resolve) => setTimeout(resolve, 500));
    server = await startServer();
    const logout = await request("/api/auth/logout", { method: "POST", headers: { cookie: cookieA } });
    assert.equal(logout.status, 200);
    const loggedIn = await request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: emailA, password }) });
    assert.equal(loggedIn.status, 200);
    const activeCookie = sessionCookie(loggedIn.headers.get("set-cookie").split(";", 1)[0].split("=", 2)[1]);
    const resumed = await request(`/api/organizations/${orgA}/tickets?full=true`, { headers: { cookie: activeCookie } });
    assert.equal(resumed.status, 200);
    const resumedA = resumed.body.data.find((row) => row.ticketId === ticketA);
    assert.equal(resumedA.status, "resolved");
    assert.equal(resumedA.reflection.validationEligible, true);
    assert.equal(resumedA.resolutionEvidence.length, 1);
    assert.equal(resumedA.resolutionEvidence[0].sourceMessageId, sourceMessageId);

    console.log(JSON.stringify({ unresolvedValidationBlocked: true, reflectionOnlyBlocked: true, nonConfirmingReplyBlocked: true, customerConfirmationLinked: true, evidenceBackedResolution: true, agentVerification: true, manualVerifiedResolution: true, concurrentResolutionSerialized: true, tenantIsolation: true, restartDurability: true, logoutLogin: true }, null, 2));
    console.log("NC-FIX-003 resolution evidence/reflection gating probe passed.");
  } finally {
    if (db._connected) { await cleanup(db); cleaned = true; }
    await db.end().catch(() => undefined);
    server.kill();
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.equal(cleaned, true, "disposable probe data must be cleaned");
}
main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
