/*
 * NC-FIX-008 permanent regression probe.
 *
 * Exercises the authenticated server workflow in the exact order that failed
 * NC-ACCEPT-001-FINAL: persisted case -> response -> waiting -> same-case
 * customer confirmation -> resolution evidence -> resolved -> Reflection.
 * The probe then proves that human validation and memory promotion remain
 * evidence-backed, tenant-scoped, and idempotent.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { promisify } = require("node:util");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

process.env.RATE_LIMIT_HASH_SECRET = process.env.RATE_LIMIT_HASH_SECRET || "nc-fix-008-probe-secret";

const baseUrl = process.env.NC_FIX_008_BASE_URL || "http://127.0.0.1:3408";
const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
const orgA = `nc-fix-008-org-a-${suffix}`;
const orgB = `nc-fix-008-org-b-${suffix}`;
const userA = `nc-fix-008-user-a-${suffix}`;
const userB = `nc-fix-008-user-b-${suffix}`;
const emailA = `${userA}@example.test`;
const emailB = `${userB}@example.test`;
const password = `NC-FIX-008-${suffix}-safe-password!`;
const ticketA = `NC-FIX-008-A-${suffix}`;
const ticketB = `NC-FIX-008-B-${suffix}`;
const foreignTicket = `NC-FIX-008-F-${suffix}`;
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
  const port = new URL(baseUrl).port || "3408";
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", port], {
    cwd: process.cwd(),
    windowsHide: true,
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
  return {
    category: "NusaCloud Support",
    intent: "mobile_clock_in",
    canonicalProblem: "Mobile Clock-In",
    classifiedBy: "deterministic",
    confidence: "high"
  };
}

function reflection() {
  return {
    isLearningEvent: true,
    action: "create_new",
    rationale: "Customer-confirmed location permission resolution for a mobile clock-in issue.",
    estimatedTrustDelta: 10,
    trustImpact: "increase",
    problemNameRequired: true,
    suggestedProblemName: "Mobile Clock-In - Location Permission Disabled"
  };
}

function validationPayload(ticketId, label = "primary", sourceTicketId = ticketId) {
  const now = new Date().toISOString();
  const candidateId = `nc-fix-008-candidate-${label}-${suffix}`;
  const validationId = `nc-fix-008-validation-${label}-${suffix}`;
  const knowledgeId = `nc-fix-008-knowledge-${label}-${suffix}`;
  const item = {
    id: knowledgeId,
    organizationId: orgA,
    title: "Mobile Clock-In - Location Permission Disabled",
    problem: "A mobile employee cannot clock in because the NusaCloud app lacks device location permission.",
    approvedAnswer: "Enable device location services and grant the NusaCloud mobile app location permission, then retry clock-in.",
    category: "NusaCloud Support",
    tags: ["mobile", "clock-in", "location permission"],
    sourceTicketId,
    timesReused: 0,
    createdAt: now,
    approvedAt: now,
    trustScore: 30,
    lessons: [],
    knowledgeVersions: []
  };
  return {
    candidate: {
      id: candidateId,
      organizationId: orgA,
      sourceTicketIds: [sourceTicketId],
      proposedAction: "create_new",
      proposedContent: {
        solution: item.approvedAnswer,
        customerResponseTemplate: "Please enable location permission for {{customerName}} and retry clock-in.",
        internalGuidance: item.problem,
        canonicalProblemTitle: item.title,
        category: item.category,
        lessons: []
      },
      rationale: "NC-FIX-008 evidence-backed Reflection probe.",
      status: "proposed",
      createdAt: now
    },
    validation: {
      id: validationId,
      organizationId: orgA,
      candidateId,
      knowledgeId,
      decision: "approved",
      actor: "client-claimed-actor-must-not-win",
      roleExercised: "knowledge_validator",
      rationale: "NC-FIX-008 human validation probe.",
      timestamp: now
    },
    memoryChange: {
      id: `nc-fix-008-memory-${label}-${suffix}`,
      organizationId: orgA,
      knowledgeId,
      candidateId,
      validationRecordId: validationId,
      changeType: "create_new",
      beforeState: null,
      afterState: item,
      timestamp: now
    },
    knowledgeItem: item,
    expectedKnowledgeRevision: null,
    idempotencyKey: validationId
  };
}

async function seed(db) {
  const hash = await passwordHash(password);
  await db.query(
    'insert into organizations (id,name,industry,description,settings,"createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,current_timestamp,current_timestamp), ($6,$7,$8,$9,$5::jsonb,current_timestamp,current_timestamp)',
    [orgA, "NC-FIX-008 Disposable A", "QA", "Post-resolution Reflection lifecycle probe", JSON.stringify({}), orgB, "NC-FIX-008 Disposable B", "QA", "Tenant isolation probe"]
  );
  for (const [userId, email, organizationId] of [[userA, emailA, orgA], [userB, emailB, orgB]]) {
    await db.query(
      'insert into users (id,name,email,"passwordHash","activeOrganizationId","updatedAt") values ($1,$2,$3,$4,$5,current_timestamp)',
      [userId, userId, email, hash, organizationId]
    );
    await db.query('insert into organization_memberships ("userId","organizationId",role) values ($1,$2,$3)', [userId, organizationId, "owner"]);
    await db.query(
      'insert into organization_role_assignments (id,"organizationId","userId","roleId","assignedByUserId","updatedAt") select $1,$2,$3,id,$3,current_timestamp from rbac_roles where key=$4',
      [`nc-fix-008-assignment-${userId}`, organizationId, userId, "owner"]
    );
  }
  const tokens = { a: `nc-fix-008-a-${suffix}`, b: `nc-fix-008-b-${suffix}` };
  await db.query(
    'insert into auth_sessions (id,"tokenHash","userId","expiresAt") values ($1,$2,$3,$4),($5,$6,$7,$4)',
    [`nc-fix-008-session-a-${suffix}`, tokenHash(tokens.a), userA, "2099-01-01T00:00:00.000Z", `nc-fix-008-session-b-${suffix}`, tokenHash(tokens.b), userB]
  );
  return tokens;
}

async function cleanup(db) {
  await db.query('delete from ticket_transition_audits where "organizationId" in ($1,$2)', [orgA, orgB]);
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
    const transition = (organizationId, ticketId, command, cookie = cookieA) => request(`/api/organizations/${organizationId}/tickets/${encodeURIComponent(ticketId)}/transition`, {
      method: "POST", headers: jsonHeaders(cookie), body: JSON.stringify(command)
    });
    const createTicket = async (organizationId, ticketId, cookie, rawMessage) => {
      const created = await request(`/api/organizations/${organizationId}/tickets`, {
        method: "PUT", headers: jsonHeaders(cookie), body: JSON.stringify([{ ticketId, orgId: organizationId, rawMessage, subject: "NC-FIX-008 lifecycle case" }])
      });
      assert.equal(created.status, 200);
      const analyzed = await transition(organizationId, ticketId, { kind: "attach_analysis", classification: classification(), memoryMatch: null }, cookie);
      assert.equal(analyzed.status, 200);
      const initialMessage = await transition(organizationId, ticketId, {
        kind: "append_customer_message",
        content: rawMessage,
        idempotencyKey: `initial-customer-${ticketId}`
      }, cookie);
      assert.equal(initialMessage.status, 200);
      assert.equal(initialMessage.body.data.status, "in_review");
    };
    const send = (organizationId, ticketId, cookie, idempotencyKey) => transition(organizationId, ticketId, {
      kind: "send_agent_message",
      finalResponse: "Please confirm the device location permission and retry clock-in.",
      humanEdited: true,
      expectedDraftRevision: 0,
      idempotencyKey
    }, cookie);
    const attachEvidence = (organizationId, ticketId, cookie, type, sourceMessageId, key) => transition(organizationId, ticketId, {
      kind: "attach_resolution_evidence",
      evidenceType: type,
      sourceMessageId,
      note: "The resolution was explicitly verified for this probe case.",
      idempotencyKey: key
    }, cookie);

    await createTicket(orgA, ticketA, cookieA, "Andi cannot clock in through the NusaCloud mobile app.");
    const sent = await send(orgA, ticketA, cookieA, `send-${suffix}`);
    assert.equal(sent.status, 200);
    assert.equal(sent.body.data.status, "waiting_for_customer");
    const followUp = await transition(orgA, ticketA, {
      kind: "append_customer_message",
      content: "We enabled the NusaCloud location permission and Andi can clock in again.",
      idempotencyKey: `follow-up-${suffix}`
    });
    assert.equal(followUp.status, 200);
    assert.equal(followUp.body.data.status, "in_review");
    assert.equal(followUp.body.data.messages.length, 3);

    const premature = await request(`/api/organizations/${orgA}/commits/validation`, {
      method: "POST", headers: jsonHeaders(cookieA), body: JSON.stringify(validationPayload(ticketA, "premature"))
    });
    assert.equal(premature.status, 409);
    assert.equal(premature.body.error.code, "RESOLUTION_EVIDENCE_REQUIRED");

    const evidence = await attachEvidence(orgA, ticketA, cookieA, "customer_confirmation", `ticket-message-${ticketA}-3`, `customer-${suffix}`);
    assert.equal(evidence.status, 200);
    const evidenceId = evidence.body.data.resolutionEvidence[0].id;
    const resolved = await transition(orgA, ticketA, { kind: "resolve_with_evidence", evidenceId });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.data.status, "resolved");
    assert.equal(resolved.body.data.reflection.validationEligible, true);
    const resolvedSupportState = {
      resolvedAt: resolved.body.data.resolution.resolvedAt,
      resolvedBy: resolved.body.data.resolution.resolvedBy,
      finalResponse: resolved.body.data.resolution.finalResponse,
      evidenceIds: resolved.body.data.resolution.evidenceIds
    };

    const preparedReflection = await transition(orgA, ticketA, { kind: "prepare_reflection", reflection: reflection() });
    assert.equal(preparedReflection.status, 200);
    assert.equal(preparedReflection.body.data.status, "resolved");
    assert.equal(preparedReflection.body.data.reflection.validationEligible, true);
    assert.deepEqual(preparedReflection.body.data.reflection.evidenceIds, [evidenceId]);
    assert.equal(preparedReflection.body.data.reflection.preparedDecision.action, "create_new");

    const duplicatePreparation = await transition(orgA, ticketA, { kind: "prepare_reflection", reflection: reflection() });
    assert.equal(duplicatePreparation.status, 409);
    assert.equal(duplicatePreparation.body.error.code, "INVALID_TRANSITION");

    server.kill();
    await new Promise((resolve) => setTimeout(resolve, 500));
    server = await startServer();
    const loggedOut = await request("/api/auth/logout", { method: "POST", headers: { cookie: cookieA } });
    assert.equal(loggedOut.status, 200);
    const loggedIn = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: emailA, password })
    });
    assert.equal(loggedIn.status, 200);
    const activeCookie = sessionCookie(loggedIn.headers.get("set-cookie").split(";", 1)[0].split("=", 2)[1]);
    const resumed = await request(`/api/organizations/${orgA}/tickets?full=true`, { headers: { cookie: activeCookie } });
    assert.equal(resumed.status, 200);
    const resumedTicket = resumed.body.data.find((row) => row.ticketId === ticketA);
    assert.equal(resumedTicket.status, "resolved");
    assert.equal(resumedTicket.reflection.validationEligible, true);
    assert.equal(resumedTicket.reflection.preparedDecision.action, "create_new");
    assert.equal(resumedTicket.resolutionEvidence[0].sourceMessageId, `ticket-message-${ticketA}-3`);

    const wrongTenantRead = await request(`/api/organizations/${orgA}/tickets?full=true`, { headers: { cookie: cookieB } });
    assert.equal(wrongTenantRead.status, 403);
    const wrongTenantPrepare = await transition(orgA, ticketA, { kind: "prepare_reflection", reflection: reflection() }, cookieB);
    assert.equal(wrongTenantPrepare.status, 403);

    await createTicket(orgB, foreignTicket, cookieB, "Foreign tenant verification case.");
    assert.equal((await send(orgB, foreignTicket, cookieB, `foreign-send-${suffix}`)).status, 200);
    const foreignEvidence = await attachEvidence(orgB, foreignTicket, cookieB, "agent_verification", null, `foreign-evidence-${suffix}`);
    assert.equal(foreignEvidence.status, 200);
    const crossEvidence = await transition(orgA, ticketA, { kind: "resolve_with_evidence", evidenceId: foreignEvidence.body.data.resolutionEvidence[0].id }, activeCookie);
    assert.equal(crossEvidence.status, 409);

    const missingSource = validationPayload(ticketA, "missing", `missing-source-${suffix}`);
    const missingSourceResult = await request(`/api/organizations/${orgA}/commits/validation`, {
      method: "POST", headers: jsonHeaders(activeCookie), body: JSON.stringify(missingSource)
    });
    assert.equal(missingSourceResult.status, 409);

    const validPayload = validationPayload(ticketA);
    const committed = await request(`/api/organizations/${orgA}/commits/validation`, {
      method: "POST", headers: jsonHeaders(activeCookie), body: JSON.stringify(validPayload)
    });
    assert.equal(committed.status, 200);
    assert.equal(committed.body.data.auditSummary.sourceTicketIds[0], ticketA);
    const ticketCommit = await transition(orgA, ticketA, {
      kind: "commit",
      validationRecordIds: [validPayload.validation.id],
      knowledgeId: validPayload.knowledgeItem.id,
      action: "create_new",
      knowledgeChanged: validPayload.knowledgeItem.id,
      finalResponse: "Please confirm the device location permission and retry clock-in.",
      automatic: false
    }, activeCookie);
    assert.equal(ticketCommit.status, 200);
    assert.equal(ticketCommit.body.data.status, "resolved");
    assert.deepEqual(ticketCommit.body.data.validationRecordIds, [validPayload.validation.id]);
    assert.deepEqual({
      resolvedAt: ticketCommit.body.data.resolution.resolvedAt,
      resolvedBy: ticketCommit.body.data.resolution.resolvedBy,
      finalResponse: ticketCommit.body.data.resolution.finalResponse,
      evidenceIds: ticketCommit.body.data.resolution.evidenceIds
    }, resolvedSupportState);

    const replay = await request(`/api/organizations/${orgA}/commits/validation`, {
      method: "POST", headers: jsonHeaders(activeCookie), body: JSON.stringify(validPayload)
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.data.replayed, true);

    const counts = await db.query(
      'select (select count(*) from knowledge_items where "organizationId"=$1)::int as knowledge, (select count(*) from validation_records where "organizationId"=$1)::int as validations, (select count(*) from memory_change_records where "organizationId"=$1)::int as memory, (select count(*) from ticket_transition_audits where "organizationId"=$1 and action=\'prepare_reflection\' and "ticketId"=$2)::int as preparations',
      [orgA, ticketA]
    );
    assert.deepEqual(counts.rows[0], { knowledge: 1, validations: 1, memory: 1, preparations: 1 });
    const source = await db.query('select "organizationId", "sourceTicketId", "timesReused" from knowledge_items where id=$1', [validPayload.knowledgeItem.id]);
    assert.deepEqual(source.rows[0], { organizationId: orgA, sourceTicketId: ticketA, timesReused: 0 });

    console.log(JSON.stringify({
      noEvidencePromotionBlocked: true,
      customerConfirmationEvidence: true,
      evidenceBackedResolution: true,
      postResolutionReflectionPreparation: true,
      reflectionPersistedAcrossRestart: true,
      duplicateReflectionPreparationSafelyRejected: true,
      humanValidationAndPromotion: true,
      canonicalProvenance: true,
      duplicatePromotionReplayed: true,
      wrongTenantRejected: true,
      unauthorizedRejected: true,
      nonexistentSourceRejected: true,
      agentVerificationEvidence: true
    }, null, 2));
    console.log("NC-FIX-008 post-resolution Reflection lifecycle probe passed.");
  } finally {
    if (db._connected) { await cleanup(db); cleaned = true; }
    await db.end().catch(() => undefined);
    server.kill();
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.equal(cleaned, true, "disposable probe data must be cleaned");
}

main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
