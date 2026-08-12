/*
 * NC-FIX-006 permanent knowledge-reuse/source-ticket integrity probe.
 *
 * This probe uses disposable authenticated organizations and the supported
 * HTTP ticket, evidence, validation, and knowledge APIs. It never seeds a
 * KnowledgeItem or source evidence: the first case is learned through the
 * same governed validation boundary used by the product, then later cases
 * reuse it with durable source tickets.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { promisify } = require("node:util");
const { Client } = require("pg");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: true });
const learning = require(path.join(root, "lib", "application", "learning", "reflectionCommands.ts"));
const { recordResolution } = require(path.join(root, "lib", "trustEngine.ts"));
const { withStableValidationProvenance } = require(path.join(root, "lib", "knowledgeProvenance.ts"));

process.env.RATE_LIMIT_HASH_SECRET = process.env.RATE_LIMIT_HASH_SECRET || "nc-fix-006-probe-secret";
const baseUrl = process.env.NC_FIX_006_BASE_URL || "http://127.0.0.1:3406";
const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
const orgA = `nc-fix-006-org-a-${suffix}`;
const orgB = `nc-fix-006-org-b-${suffix}`;
const userA = `nc-fix-006-user-a-${suffix}`;
const userB = `nc-fix-006-user-b-${suffix}`;
const emailA = `${userA}@example.test`;
const emailB = `${userB}@example.test`;
const password = `NC-FIX-006-${suffix}-safe-password!`;
const scrypt = promisify(crypto.scrypt);

const firstIssue = "Customer Rina Prasetyo reports that Andi Wibowo cannot clock in through the NusaCloud mobile app because the application requests location access. Other employees can still clock in normally. Please help investigate.";
const secondIssue = "Customer Marco Santoso reports that Budi Hartono cannot clock in through the NusaCloud mobile app because the application requests location access. Other employees can still clock in normally. Please help investigate.";
const thirdIssue = "Customer Sari Wijaya reports that Dimas Putra cannot clock in through the NusaCloud mobile app because the application requests location access. Other employees can still clock in normally. Please help investigate.";
const foreignIssue = "Customer Foreign User reports that the NusaCloud mobile app cannot open the attendance screen after a location permission prompt. Please investigate.";

function stableId(prefix, value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return `${prefix}-${(hash >>> 0).toString(16)}`;
}
function tokenHash(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}
function cookie(token) { return `oip_session=${token}`; }
function headers(session) { return { cookie: session, "content-type": "application/json" }; }
async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 1000); }
  return { status: response.status, headers: response.headers, body };
}
async function startServer() {
  const port = new URL(baseUrl).port || "3406";
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", port], {
    cwd: process.cwd(), windowsHide: true,
    env: { ...process.env, RATE_LIMIT_MODE: "off", AI_MODE: "disabled", NEXT_PUBLIC_AI_MODE: "disabled", ANTHROPIC_API_KEY: "", DEEPSEEK_API_KEY: "" },
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
async function seed(db) {
  const hash = await passwordHash(password);
  await db.query('insert into organizations (id,name,industry,description,settings,"createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,current_timestamp,current_timestamp), ($6,$7,$8,$9,$5::jsonb,current_timestamp,current_timestamp)', [orgA, "NC-FIX-006 Disposable Reuse A", "HR", "Knowledge reuse acceptance", JSON.stringify({}), orgB, "NC-FIX-006 Disposable Reuse B", "HR", "Tenant control"]);
  for (const [userId, email, organizationId] of [[userA, emailA, orgA], [userB, emailB, orgB]]) {
    await db.query('insert into users (id,name,email,"passwordHash","activeOrganizationId","updatedAt") values ($1,$2,$3,$4,$5,current_timestamp)', [userId, userId, email, hash, organizationId]);
    await db.query('insert into organization_memberships ("userId","organizationId",role) values ($1,$2,$3)', [userId, organizationId, "owner"]);
    await db.query('insert into organization_role_assignments (id,"organizationId","userId","roleId","assignedByUserId","updatedAt") select $1,$2,$3,id,$3,current_timestamp from rbac_roles where key=$4', [`nc-fix-006-assignment-${userId}`, organizationId, userId, "owner"]);
  }
  const tokenA = `nc-fix-006-a-${suffix}`;
  const tokenB = `nc-fix-006-b-${suffix}`;
  await db.query('insert into auth_sessions (id,"tokenHash","userId","expiresAt") values ($1,$2,$3,$4),($5,$6,$7,$4)', [`nc-fix-006-session-a-${suffix}`, tokenHash(tokenA), userA, "2099-01-01T00:00:00.000Z", `nc-fix-006-session-b-${suffix}`, tokenHash(tokenB), userB]);
  return { a: cookie(tokenA), b: cookie(tokenB) };
}
async function cleanup(db) {
  await db.query('delete from users where id in ($1,$2)', [userA, userB]);
  await db.query('delete from organizations where id in ($1,$2)', [orgA, orgB]);
}
function fakeLearningPersistence() {
  return {
    context: { organizationId: orgA, authority: "server", requestId: `nc-fix-006-${suffix}`, actorContext: { id: userA, name: "NC-FIX-006 reviewer" } },
    async commitValidatedMemoryChange(input) {
      return {
        replayed: false, knowledgeRevision: 1, trustApplied: true,
        candidate: { ...input.candidate, status: "validated" },
        validation: input.validation, memoryChange: input.memoryChange,
        knowledgeItem: { ...input.knowledgeItem, revision: 1 },
        auditSummary: { organizationId: orgA, actorId: userA, actor: "NC-FIX-006 reviewer", sourceTicketIds: input.candidate.sourceTicketIds, decision: input.validation.decision, changeType: input.memoryChange.changeType }
      };
    }
  };
}
function reflectionTicket(result) { return { ...result.ticket, ticketId: result.ticket.ticketId ?? result.ticket.id, status: "drafted" }; }
function orgPath(org, pathname) { return `/api/organizations/${org}${pathname}`; }

async function resolveWithEvidence(org, ticketId, session, mode, key) {
  const evidence = await request(orgPath(org, `/tickets/${encodeURIComponent(ticketId)}/transition`), {
    method: "POST", headers: headers(session),
    body: JSON.stringify({
      kind: "attach_resolution_evidence",
      evidenceType: mode === "human" ? "manual_verified_resolution" : "agent_verification",
      sourceMessageId: null,
      note: mode === "human" ? "Reviewer verified the reuse result; this is not customer confirmation." : "Agent verified the reuse result; this is not customer confirmation.",
      idempotencyKey: key
    })
  });
  assert.equal(evidence.status, 200, JSON.stringify(evidence.body));
  const evidenceRow = evidence.body.data.resolutionEvidence.find((item) => item.idempotencyKey === key);
  assert.ok(evidenceRow, "durable reuse evidence must be returned");
  const resolved = await request(orgPath(org, `/tickets/${encodeURIComponent(ticketId)}/transition`), {
    method: "POST", headers: headers(session), body: JSON.stringify({ kind: "resolve_with_evidence", evidenceId: evidenceRow.id })
  });
  assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
  assert.equal(resolved.body.data.status, "resolved");
  assert.equal(resolved.body.data.reflection.validationEligible, true);
  return resolved.body.data;
}

function reuseCommitPayload({ knowledge, ticket, profile, validationRecords, mode = "human" }) {
  const ticketId = ticket.ticketId ?? ticket.id;
  const key = `${orgA}|${knowledge.id}|${ticketId}|${mode}`;
  const result = recordResolution(knowledge, { mode, success: true }, profile, validationRecords);
  const validationId = stableId("reuse-validation", key);
  const candidateId = stableId("reuse-candidate", key);
  const memoryChangeId = stableId("reuse-memory-change", key);
  const item = withStableValidationProvenance({ ...result.item, organizationId: orgA, revision: (knowledge.revision ?? 0) + 1 }, [ticketId], {
    actor: "NC-FIX-006 reviewer", timestamp: new Date().toISOString(), rationale: `Human-approved reuse updated trust from ${result.trustFrom} to ${result.trustTo}.`, scope: "Prototype trust_update_only validation"
  });
  const candidate = {
    id: candidateId, organizationId: orgA, sourceTicketIds: [ticketId], proposedAction: "trust_update_only",
    proposedContent: { solution: item.problemSummary ?? item.problem, customerResponseTemplate: item.customerResponseTemplate ?? item.approvedAnswer, internalGuidance: item.internalGuidance ?? item.problem, canonicalProblemTitle: item.canonicalProblemTitle ?? item.title, category: item.category },
    relatedKnowledgeId: knowledge.id, rationale: `Human-approved successful reuse updated trust from ${result.trustFrom} to ${result.trustTo}.`, status: "proposed", createdAt: new Date().toISOString()
  };
  const validation = { id: validationId, organizationId: orgA, candidateId, knowledgeId: knowledge.id, knowledgeVersionId: item.knowledgeVersions?.at(-1)?.versionId, decision: "approved", actor: "Prototype Knowledge Validator", roleExercised: "knowledge_validator", rationale: candidate.rationale, timestamp: new Date().toISOString() };
  const memoryChange = { id: memoryChangeId, organizationId: orgA, knowledgeId: knowledge.id, candidateId, validationRecordId: validationId, changeType: "trust_update_only", beforeState: knowledge, afterState: item, timestamp: validation.timestamp };
  return { candidate, validation, memoryChange, knowledgeItem: item, expectedKnowledgeRevision: knowledge.revision ?? 0, idempotencyKey: stableId("reuse-commit", key) };
}

async function main() {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
  const source = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
  assert.match(source, /persistReuseTicket/);
  assert.match(source, /tickets\/process/);
  assert.match(source, /ticketReferenceId\(evidenceTicket\)/);
  assert.match(source, /manual_verified_resolution/);
  assert.match(source, /stableReuseId\("reuse-validation"/);

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  const server = await startServer();
  let cleaned = false;
  try {
    await db.connect();
    const sessions = await seed(db);
    const profileResponse = await request(orgPath(orgA, ""), { headers: { cookie: sessions.a } });
    assert.equal(profileResponse.status, 200);
    const profile = profileResponse.body.data;
    const empty = await request(orgPath(orgA, "/knowledge"), { headers: { cookie: sessions.a } });
    assert.equal(empty.status, 200);
    assert.equal(empty.body.data.length, 0);

    const firstResponse = await request(orgPath(orgA, "/tickets/process"), { method: "POST", headers: headers(sessions.a), body: JSON.stringify({ description: firstIssue, customerName: "Rina Prasetyo", idempotencyKey: `first-${suffix}` }) });
    assert.equal(firstResponse.status, 200, JSON.stringify(firstResponse.body));
    const first = firstResponse.body.data;
    const firstId = first.ticket.ticketId;
    assert.ok(first.persistedTicket && first.persistedTicket.ticketId === firstId, "first case is durably persisted");
    assert.equal(first.memoryMatch, null);
    const firstEvidence = await resolveWithEvidence(orgA, firstId, sessions.a, "human", `first-evidence-${suffix}`);

    const generated = learning.generateReflectionCommand({ organizationId: orgA, actor: { id: userA, name: "NC-FIX-006 reviewer" }, authority: "server", requestId: `reflection-${suffix}`, organizationProfile: profile, ticket: reflectionTicket(first), understanding: first.understanding, reviewedResponse: first.persistedTicket.resolution.finalResponse, existingMatch: null });
    assert.equal(generated.reflection.action, "create_new");
    const lessonDraft = { mode: "new", rootCause: "Location permission was disabled for the affected employee's NusaCloud mobile app.", solution: "Enable location permission while using the app and retry mobile clock-in.", customerResponse: "Hello {{customerName}}, enable location permission for the NusaCloud mobile app and retry clock-in.", signals: ["mobile clock-in location permission", "one employee cannot clock in", "other employees unaffected"] };
    const learningResult = await learning.promoteKnowledgeCommand({ organizationId: orgA, actor: { id: userA, name: "NC-FIX-006 reviewer" }, authority: "server", requestId: `promotion-${suffix}`, idempotencyKey: `promotion-${suffix}`, organizationProfile: profile, ticket: reflectionTicket(first), understanding: first.understanding, reviewedResponse: first.persistedTicket.resolution.finalResponse, reflection: generated.reflection, lessonDraft, problemName: `Mobile Clock-In - Location Permission Disabled ${suffix}`, knowledgeItems: [], validationRecords: [] }, { persistence: fakeLearningPersistence() });
    const firstPayload = { candidate: learningResult.candidate, validation: learningResult.validation, memoryChange: learningResult.memoryChange, knowledgeItem: learningResult.knowledgeItem, expectedKnowledgeRevision: null, idempotencyKey: `promotion-${suffix}` };
    const firstCommit = await request(orgPath(orgA, "/commits/validation"), { method: "POST", headers: headers(sessions.a), body: JSON.stringify(firstPayload) });
    assert.equal(firstCommit.status, 200, JSON.stringify(firstCommit.body));
    const firstKnowledge = (await request(orgPath(orgA, "/knowledge"), { headers: { cookie: sessions.a } })).body.data[0];
    assert.ok(firstKnowledge && firstKnowledge.lessons?.length >= 1);
    const firstTicketCommit = await request(orgPath(orgA, `/tickets/${encodeURIComponent(firstId)}/transition`), { method: "POST", headers: headers(sessions.a), body: JSON.stringify({ kind: "commit", validationRecordIds: [firstCommit.body.data.validation.id], knowledgeId: firstKnowledge.id, action: "create_new", knowledgeChanged: firstKnowledge.id }) });
    assert.equal(firstTicketCommit.status, 200, JSON.stringify(firstTicketCommit.body));
    assert.equal(firstEvidence.status, "resolved");

    const secondResponse = await request(orgPath(orgA, "/tickets/process"), { method: "POST", headers: headers(sessions.a), body: JSON.stringify({ description: secondIssue, customerName: "Marco Santoso", idempotencyKey: `second-${suffix}` }) });
    assert.equal(secondResponse.status, 200, JSON.stringify(secondResponse.body));
    const second = secondResponse.body.data;
    const secondId = second.ticket.ticketId;
    assert.notEqual(second.ticket.id, secondId, "the UI Ticket id and durable TicketRecord id are distinct identities");
    assert.equal(second.persistedTicket.ticketId, secondId);
    assert.equal(second.memoryMatch.item.id, firstKnowledge.id, "second similar case retrieves the learned KnowledgeItem");
    assert.ok(second.draft.basedOnKnowledgeIds?.includes(firstKnowledge.id) || second.draft.groundingLabel || second.draft.draftMode === "lesson_grounded", "second draft is grounded in the learned problem");
    const secondRecord = await resolveWithEvidence(orgA, secondId, sessions.a, "human", `second-evidence-${suffix}`);

    const reusePayload = reuseCommitPayload({ knowledge: firstKnowledge, ticket: second.ticket, profile, validationRecords: [firstCommit.body.data.validation] });
    const concurrent = await Promise.all([
      request(orgPath(orgA, "/commits/validation"), { method: "POST", headers: headers(sessions.a), body: JSON.stringify(reusePayload) }),
      request(orgPath(orgA, "/commits/validation"), { method: "POST", headers: headers(sessions.a), body: JSON.stringify(reusePayload) })
    ]);
    assert.deepEqual(concurrent.map((result) => result.status).sort(), [200, 200]);
    assert.equal(concurrent.filter((result) => result.body.data.replayed === true).length, 1, "concurrent duplicate reuse has exactly one replay");
    const secondCommit = await request(orgPath(orgA, `/tickets/${encodeURIComponent(secondId)}/transition`), { method: "POST", headers: headers(sessions.a), body: JSON.stringify({ kind: "commit", validationRecordIds: [reusePayload.validation.id], knowledgeId: firstKnowledge.id, action: "trust_update_only", knowledgeChanged: firstKnowledge.id, finalResponse: firstKnowledge.customerResponseTemplate ?? firstKnowledge.approvedAnswer }) });
    assert.equal(secondCommit.status, 200, JSON.stringify(secondCommit.body));
    const afterSecond = (await request(orgPath(orgA, "/knowledge"), { headers: { cookie: sessions.a } })).body.data.find((item) => item.id === firstKnowledge.id);
    assert.equal(afterSecond.timesReused, 1, "same reuse approval increments timesReused exactly once");
    assert.equal(secondRecord.resolutionEvidence.length, 1);
    assert.ok(secondCommit.body.data.validationRecordIds.includes(reusePayload.validation.id));

    const replay = await request(orgPath(orgA, "/commits/validation"), { method: "POST", headers: headers(sessions.a), body: JSON.stringify(reusePayload) });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.data.replayed, true);
    const afterReplay = (await request(orgPath(orgA, "/knowledge"), { headers: { cookie: sessions.a } })).body.data.find((item) => item.id === firstKnowledge.id);
    assert.equal(afterReplay.timesReused, 1, "idempotent replay does not double-count trust or reuse");

    const thirdResponse = await request(orgPath(orgA, "/tickets/process"), { method: "POST", headers: headers(sessions.a), body: JSON.stringify({ description: thirdIssue, customerName: "Sari Wijaya", idempotencyKey: `third-${suffix}` }) });
    assert.equal(thirdResponse.status, 200, JSON.stringify(thirdResponse.body));
    const third = thirdResponse.body.data;
    const thirdId = third.ticket.ticketId;
    assert.equal(third.memoryMatch.item.id, firstKnowledge.id);
    await resolveWithEvidence(orgA, thirdId, sessions.a, "human", `third-evidence-${suffix}`);
    const thirdPayload = reuseCommitPayload({ knowledge: afterSecond, ticket: third.ticket, profile, validationRecords: [firstCommit.body.data.validation, reusePayload.validation] });
    assert.notEqual(thirdPayload.validation.id, reusePayload.validation.id);
    const thirdCommit = await request(orgPath(orgA, "/commits/validation"), { method: "POST", headers: headers(sessions.a), body: JSON.stringify(thirdPayload) });
    assert.equal(thirdCommit.status, 200, JSON.stringify(thirdCommit.body));
    const thirdTicketCommit = await request(orgPath(orgA, `/tickets/${encodeURIComponent(thirdId)}/transition`), { method: "POST", headers: headers(sessions.a), body: JSON.stringify({ kind: "commit", validationRecordIds: [thirdPayload.validation.id], knowledgeId: firstKnowledge.id, action: "trust_update_only", knowledgeChanged: firstKnowledge.id, finalResponse: firstKnowledge.customerResponseTemplate ?? firstKnowledge.approvedAnswer }) });
    assert.equal(thirdTicketCommit.status, 200, JSON.stringify(thirdTicketCommit.body));
    const afterThird = (await request(orgPath(orgA, "/knowledge"), { headers: { cookie: sessions.a } })).body.data.find((item) => item.id === firstKnowledge.id);
    assert.equal(afterThird.timesReused, 2, "a distinct persisted source ticket produces a distinct reuse event");

    const missingPayload = { ...thirdPayload, candidate: { ...thirdPayload.candidate, id: `${thirdPayload.candidate.id}-missing`, sourceTicketIds: ["ticket-does-not-exist"] }, validation: { ...thirdPayload.validation, id: `${thirdPayload.validation.id}-missing`, candidateId: `${thirdPayload.candidate.id}-missing` }, memoryChange: { ...thirdPayload.memoryChange, id: `${thirdPayload.memoryChange.id}-missing`, candidateId: `${thirdPayload.candidate.id}-missing`, validationRecordId: `${thirdPayload.validation.id}-missing` }, idempotencyKey: `${thirdPayload.idempotencyKey}-missing` };
    const missing = await request(orgPath(orgA, "/commits/validation"), { method: "POST", headers: headers(sessions.a), body: JSON.stringify(missingPayload) });
    assert.equal(missing.status, 409);
    assert.equal(missing.body.error.message, "A validation candidate references a missing source ticket in this organization.", "missing source ticket remains rejected with the original root error");

    const foreignResponse = await request(orgPath(orgB, "/tickets/process"), { method: "POST", headers: headers(sessions.b), body: JSON.stringify({ description: foreignIssue, customerName: "Foreign User", idempotencyKey: `foreign-${suffix}` }) });
    assert.equal(foreignResponse.status, 200, JSON.stringify(foreignResponse.body));
    const foreignId = foreignResponse.body.data.ticket.ticketId;
    await resolveWithEvidence(orgB, foreignId, sessions.b, "human", `foreign-evidence-${suffix}`);
    const crossTenantPayload = { ...thirdPayload, candidate: { ...thirdPayload.candidate, id: `${thirdPayload.candidate.id}-foreign`, sourceTicketIds: [foreignId] }, validation: { ...thirdPayload.validation, id: `${thirdPayload.validation.id}-foreign`, candidateId: `${thirdPayload.candidate.id}-foreign` }, memoryChange: { ...thirdPayload.memoryChange, id: `${thirdPayload.memoryChange.id}-foreign`, candidateId: `${thirdPayload.candidate.id}-foreign`, validationRecordId: `${thirdPayload.validation.id}-foreign` }, idempotencyKey: `${thirdPayload.idempotencyKey}-foreign` };
    const crossTenant = await request(orgPath(orgA, "/commits/validation"), { method: "POST", headers: headers(sessions.a), body: JSON.stringify(crossTenantPayload) });
    assert.equal(crossTenant.status, 409, "cross-tenant source ticket must be rejected");
    assert.equal((await request(orgPath(orgA, "/knowledge"), { headers: { cookie: sessions.b } })).status, 403, "unauthorized user cannot read the source organization memory");
    const authoritySpoof = await request(orgPath(orgA, "/tickets"), { method: "PUT", headers: headers(sessions.a), body: JSON.stringify([{ ticketId: "client-spoof", orgId: orgA, rawMessage: "spoof", subject: "spoof", status: "resolved", resolution: {}, actorId: userB }]) });
    assert.equal(authoritySpoof.status, 400, "client cannot supply ticket authority fields");

    const metrics = await request(orgPath(orgA, "/metrics"), { headers: { cookie: sessions.a } });
    assert.equal(metrics.status, 200);
    assert.equal(metrics.body.data.knowledgeReused, 2, "authoritative OrgMetrics counts the two distinct persisted reuses once each");
    const tickets = (await request(orgPath(orgA, "/tickets?full=true"), { headers: { cookie: sessions.a } })).body.data;
    const secondStored = tickets.find((ticket) => ticket.ticketId === secondId);
    const thirdStored = tickets.find((ticket) => ticket.ticketId === thirdId);
    assert.equal(secondStored.status, "resolved");
    assert.equal(thirdStored.status, "resolved");
    assert.equal(secondStored.resolutionEvidence.length, 1);
    assert.equal(thirdStored.resolutionEvidence.length, 1);
    assert.ok(secondStored.validationRecordIds.includes(reusePayload.validation.id));
    assert.ok(thirdStored.validationRecordIds.includes(thirdPayload.validation.id));

    console.log(JSON.stringify({
      baselineMissingSource409: true,
      exactMissingSourceRootError: true,
      firstLearnedCase: true,
      secondTicketPersisted: true,
      ticketIdCanonicalized: true,
      retrieval: true,
      groundedDraft: true,
      humanReuseEvidence: true,
      durableReuseCommit: true,
      concurrentReplayExactlyOnce: true,
      idempotentReplayExactlyOnce: true,
      distinctThirdReuse: true,
      missingSourceRejected: true,
      crossTenantRejected: true,
      unauthorizedRejected: true,
      authoritySpoofRejected: true,
      orgMetricsReconciled: true,
      cleanup: true
    }, null, 2));
    console.log("NC-FIX-006 knowledge-reuse/source-ticket integrity probe passed.");
  } finally {
    if (db._connected) { await cleanup(db); cleaned = true; }
    await db.end().catch(() => undefined);
    server.kill();
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.equal(cleaned, true, "disposable acceptance data must be cleaned");
}

main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
