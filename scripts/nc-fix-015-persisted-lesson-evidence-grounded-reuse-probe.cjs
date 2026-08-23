/*
 * NC-FIX-015 permanent persisted-lesson evidence / grounded-reuse probe.
 *
 * This is a disposable authenticated HTTP replay. It creates the first
 * lesson through the server-owned ticket, resolution-evidence, Reflection,
 * and validation paths, deliberately persists exactly one specific signal,
 * then proves that a second compatible ticket can use that lesson. It also
 * proves generic/weak and unrelated negatives, recurrence classification,
 * idempotent commit behavior, and tenant isolation. No fixture KnowledgeItem
 * or lesson is inserted.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { promisify } = require("node:util");
const { Client } = require("pg");
const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness({ loadEnv: true });
const path = require("node:path");
const learning = require(path.join(root, "lib", "application", "learning", "reflectionCommands.ts"));

process.env.RATE_LIMIT_HASH_SECRET = process.env.RATE_LIMIT_HASH_SECRET || "nc-fix-015-probe-secret";
const baseUrl = process.env.NC_FIX_015_BASE_URL || "http://127.0.0.1:3415";
const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
const orgA = `nc-fix-015-org-a-${suffix}`;
const orgB = `nc-fix-015-org-b-${suffix}`;
const userA = `nc-fix-015-user-a-${suffix}`;
const userB = `nc-fix-015-user-b-${suffix}`;
const emailA = `${userA}@example.test`;
const emailB = `${userB}@example.test`;
const password = `NC-FIX-015-${suffix}-safe-password!`;
const scrypt = promisify(crypto.scrypt);

const firstIssue = "A customer cannot sign in through single sign-on after our identity provider certificate rotation. The SSO certificate thumbprint is no longer accepted and the authentication configuration must be updated.";
const firstFollowUp = "We replaced the identity-provider certificate with the current thumbprint and staged configuration. Sign-in now works for the affected customer.";
const firstResponse = "Hello {{customerName}}, verify the current identity-provider certificate thumbprint and apply the staged authentication configuration.";
const secondIssue = "A different customer is stuck at single sign-on because the identity provider certificate was rotated. The current SSO certificate thumbprint needs to be verified and the staged authentication configuration applied.";
const secondFollowUp = "We verified the current certificate thumbprint and applied the staged authentication configuration. Sign-in now works for this customer too.";

function tokenHash(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}
function cookie(token) { return `oip_session=${token}`; }
function headers(session) { return { cookie: session, "content-type": "application/json" }; }
async function request(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 800); }
  return { status: response.status, headers: response.headers, body };
}
async function startServer() {
  const port = new URL(baseUrl).port || "3415";
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
  await db.query('insert into organizations (id,name,industry,description,settings,"createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,current_timestamp,current_timestamp), ($6,$7,$8,$9,$5::jsonb,current_timestamp,current_timestamp)', [orgA, "NC-FIX-015 Persisted Lesson QA", "Technology", "Disposable grounded-reuse probe organization", JSON.stringify({}), orgB, "NC-FIX-015 Tenant Control", "Technology", "Cross-tenant control"]);
  for (const [userId, email, organizationId] of [[userA, emailA, orgA], [userB, emailB, orgB]]) {
    await db.query('insert into users (id,name,email,"passwordHash","activeOrganizationId","updatedAt") values ($1,$2,$3,$4,$5,current_timestamp)', [userId, userId, email, hash, organizationId]);
    await db.query('insert into organization_memberships ("userId","organizationId",role) values ($1,$2,$3)', [userId, organizationId, "owner"]);
    await db.query('insert into organization_role_assignments (id,"organizationId","userId","roleId","assignedByUserId","updatedAt") select $1,$2,$3,id,$3,current_timestamp from rbac_roles where key=$4', [`nc-fix-015-assignment-${userId}`, organizationId, userId, "owner"]);
  }
  const tokenA = `nc-fix-015-a-${suffix}`;
  const tokenB = `nc-fix-015-b-${suffix}`;
  await db.query('insert into auth_sessions (id,"tokenHash","userId","expiresAt") values ($1,$2,$3,$4),($5,$6,$7,$4)', [`nc-fix-015-session-a-${suffix}`, tokenHash(tokenA), userA, "2099-01-01T00:00:00.000Z", `nc-fix-015-session-b-${suffix}`, tokenHash(tokenB), userB]);
  return { a: cookie(tokenA), b: cookie(tokenB) };
}
async function cleanup(db) {
  await db.query('delete from ticket_transition_audits where "organizationId" in ($1,$2)', [orgA, orgB]);
  await db.query("delete from users where id in ($1,$2)", [userA, userB]);
  await db.query("delete from organizations where id in ($1,$2)", [orgA, orgB]);
}
function fakePersistence() {
  return {
    context: { organizationId: orgA, authority: "server", requestId: `nc-fix-015-${suffix}`, actorContext: { id: userA, name: "NC-FIX-015 reviewer" } },
    async commitValidatedMemoryChange(input) {
      return {
        replayed: false,
        knowledgeRevision: input.knowledgeItem.revision,
        trustApplied: true,
        candidate: input.candidate,
        validation: input.validation,
        memoryChange: input.memoryChange,
        knowledgeItem: input.knowledgeItem,
        auditSummary: { organizationId: orgA, actorId: userA, actor: "NC-FIX-015 reviewer", sourceTicketIds: input.candidate.sourceTicketIds, decision: input.validation.decision, changeType: input.memoryChange.changeType }
      };
    }
  };
}
function reflectionTicket(result, status = "drafted") { return { ...result.ticket, ticketId: result.ticket.ticketId ?? result.ticket.id, status }; }
async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  const server = await startServer();
  let cleaned = false;
  try {
    await db.connect();
    const sessions = await seed(db);
    const orgPath = (org, route) => `/api/organizations/${org}${route}`;
    const transition = (ticketId, command, session = sessions.a) => request(orgPath(orgA, `/tickets/${encodeURIComponent(ticketId)}/transition`), { method: "POST", headers: headers(session), body: JSON.stringify(command) });
    const profileResponse = await request(orgPath(orgA, ""), { headers: { cookie: sessions.a } });
    assert.equal(profileResponse.status, 200);
    const profile = profileResponse.body.data;
    const empty = await request(orgPath(orgA, "/knowledge"), { headers: { cookie: sessions.a } });
    assert.equal(empty.status, 200);
    assert.equal(empty.body.data.length, 0);

    const firstProcessed = await request(orgPath(orgA, "/tickets/process"), { method: "POST", headers: headers(sessions.a), body: JSON.stringify({ description: firstIssue, customerName: "First Customer", subject: "SSO certificate rotation", idempotencyKey: `first-${suffix}` }) });
    assert.equal(firstProcessed.status, 200, JSON.stringify(firstProcessed.body));
    const first = firstProcessed.body.data;
    const firstTicketId = first.ticket.ticketId;
    assert.equal(first.memoryMatch, null);
    const firstSaved = await transition(firstTicketId, { kind: "save_draft", finalResponse: firstResponse, humanEdited: true, expectedDraftRevision: 1 });
    assert.equal(firstSaved.status, 200);
    const firstSent = await transition(firstTicketId, { kind: "send_agent_message", finalResponse: firstResponse, humanEdited: true, expectedDraftRevision: 2, idempotencyKey: `first-send-${suffix}` });
    assert.equal(firstSent.status, 200);
    const firstFollow = await transition(firstTicketId, { kind: "append_customer_message", content: firstFollowUp, idempotencyKey: `first-follow-${suffix}` });
    assert.equal(firstFollow.status, 200);
    const firstSaved2 = await transition(firstTicketId, { kind: "save_draft", finalResponse: firstResponse, humanEdited: true, expectedDraftRevision: 0 });
    assert.equal(firstSaved2.status, 200);
    const firstSent2 = await transition(firstTicketId, { kind: "send_agent_message", finalResponse: firstResponse, humanEdited: true, expectedDraftRevision: 1, idempotencyKey: `first-send-2-${suffix}` });
    assert.equal(firstSent2.status, 200);
    const firstMessages = await request(orgPath(orgA, `/tickets/${encodeURIComponent(firstTicketId)}/messages`), { headers: { cookie: sessions.a } });
    const sourceMessageId = firstMessages.body.data.find((message) => message.direction === "customer" && message.content === firstFollowUp).id;
    const firstTicket = reflectionTicket(first, "drafted");
    const reflection = learning.generateReflectionCommand({ organizationId: orgA, actor: { id: userA, name: "NC-FIX-015 reviewer" }, authority: "server", requestId: `reflection-${suffix}`, organizationProfile: profile, ticket: firstTicket, understanding: first.understanding, reviewedResponse: firstResponse, existingMatch: null });
    assert.equal(reflection.reflection.action, "create_new");
    const lessonDraft = { mode: "new", rootCause: "The identity provider certificate rotation left the accepted SSO thumbprint out of sync.", solution: "Verify the current identity-provider certificate thumbprint and apply the staged authentication configuration.", customerResponse: firstResponse, signals: ["sso certificate rotation"] };
    const promoted = await learning.promoteKnowledgeCommand({ organizationId: orgA, actor: { id: userA, name: "NC-FIX-015 reviewer" }, authority: "server", requestId: `promotion-${suffix}`, idempotencyKey: `promotion-${suffix}`, organizationProfile: profile, ticket: firstTicket, understanding: first.understanding, reviewedResponse: firstResponse, reflection: reflection.reflection, lessonDraft, problemName: "SSO Certificate Rotation", knowledgeItems: [], validationRecords: [] }, { persistence: fakePersistence() });
    const commitPayload = { candidate: promoted.candidate, validation: promoted.validation, memoryChange: promoted.memoryChange, knowledgeItem: promoted.knowledgeItem, expectedKnowledgeRevision: null, idempotencyKey: `promotion-${suffix}` };
    const premature = await request(orgPath(orgA, "/commits/validation"), { method: "POST", headers: headers(sessions.a), body: JSON.stringify(commitPayload) });
    assert.equal(premature.status, 409);
    assert.equal(premature.body.error.code, "RESOLUTION_EVIDENCE_REQUIRED");
    assert.equal((await transition(firstTicketId, { kind: "prepare_reflection", reflection: reflection.reflection })).status, 200);
    const evidence = await transition(firstTicketId, { kind: "attach_resolution_evidence", evidenceType: "customer_confirmation", sourceMessageId, note: "Customer confirmed that the current certificate and staged configuration restored SSO sign-in.", idempotencyKey: `evidence-${suffix}` });
    assert.equal(evidence.status, 200);
    const resolved = await transition(firstTicketId, { kind: "resolve_with_evidence", evidenceId: evidence.body.data.resolutionEvidence[0].id });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.data.reflection.validationEligible, true);
    const firstCommit = await request(orgPath(orgA, "/commits/validation"), { method: "POST", headers: headers(sessions.a), body: JSON.stringify(commitPayload) });
    assert.equal(firstCommit.status, 200, JSON.stringify(firstCommit.body));
    const memoryAfterFirst = await request(orgPath(orgA, "/knowledge"), { headers: { cookie: sessions.a } });
    assert.equal(memoryAfterFirst.body.data.length, 1);
    const item = memoryAfterFirst.body.data[0];
    assert.equal(item.lessons.length, 1);
    assert.deepEqual(item.lessons[0].signals, ["sso certificate rotation"]);
    assert.ok(JSON.stringify(item).includes(firstTicketId));
    assert.match(item.lessons[0].sourceTicketId, /^evidence-/);

    const secondProcessed = await request(orgPath(orgA, "/tickets/process"), { method: "POST", headers: headers(sessions.a), body: JSON.stringify({ description: secondIssue, customerName: "Second Customer", subject: "SSO thumbprint after certificate rotation", idempotencyKey: `second-${suffix}` }) });
    assert.equal(secondProcessed.status, 200, JSON.stringify(secondProcessed.body));
    const second = secondProcessed.body.data;
    assert.ok(second.memoryMatch, "the persisted lesson must be retrieved");
    assert.equal(second.memoryMatch.item.id, item.id);
    assert.equal(second.lessonMatch.lesson.id, item.lessons[0].id);
    assert.equal(second.lessonMatch.score, 1);
    assert.equal(second.lessonMatch.multiTokenMatches, 1);
    assert.ok(second.lessonMatch.ticketEvidenceCoverage >= 2);
    assert.equal(second.draft.draftMode, "lesson_grounded");
    assert.ok(second.draft.groundingLabel);
    assert.doesNotMatch(second.draft.draftResponse, /issue type is new|no organizational knowledge/i);

    const weak = await request(orgPath(orgA, "/tickets/process"), { method: "POST", headers: headers(sessions.a), body: JSON.stringify({ description: "The customer asks about certificate settings but gives no product or account context.", customerName: "Weak Customer", idempotencyKey: `weak-${suffix}` }) });
    assert.equal(weak.status, 200);
    assert.notEqual(weak.body.data.draft.draftMode, "lesson_grounded", "a weak generic mention must not authorize lesson grounding");
    assert.doesNotMatch(weak.body.data.draft.confidenceNote ?? "", /Lesson-informed draft/i);
    const negation = await request(orgPath(orgA, "/tickets/process"), { method: "POST", headers: headers(sessions.a), body: JSON.stringify({ description: "The customer says the signing certificate is unchanged and sign-on works normally; they need a copy of an invoice instead.", subject: "Invoice copy request", customerName: "Negation Customer", idempotencyKey: `negation-${suffix}` }) });
    assert.equal(negation.status, 200);
    assert.notEqual(negation.body.data.draft.draftMode, "lesson_grounded", "an explicit negation must not authorize lesson grounding");
    assert.doesNotMatch(negation.body.data.draft.confidenceNote ?? "", /Lesson-informed draft/i);
    const unrelated = await request(orgPath(orgA, "/tickets/process"), { method: "POST", headers: headers(sessions.a), body: JSON.stringify({ description: "An unauthorized administrator accessed confidential employee records and changed the account password. Escalate this security incident immediately.", customerName: "Security Customer", idempotencyKey: `unrelated-${suffix}` }) });
    assert.equal(unrelated.status, 200);
    assert.equal(unrelated.body.data.memoryMatch, null, "an unrelated domain must not retrieve the lesson");
    const otherMemory = await request(orgPath(orgB, "/knowledge"), { headers: { cookie: sessions.b } });
    assert.equal(otherMemory.status, 200);
    assert.equal(otherMemory.body.data.length, 0);
    assert.equal((await request(orgPath(orgA, "/knowledge"), { headers: { cookie: sessions.b } })).status, 403);

    const secondTicketId = second.ticket.ticketId;
    const secondEdit = second.draft.draftResponse;
    assert.equal((await transition(secondTicketId, { kind: "save_draft", finalResponse: secondEdit, humanEdited: false, expectedDraftRevision: 1 })).status, 200);
    assert.equal((await transition(secondTicketId, { kind: "send_agent_message", finalResponse: secondEdit, humanEdited: false, expectedDraftRevision: 2, idempotencyKey: `second-send-${suffix}` })).status, 200);
    const secondFollow = await transition(secondTicketId, { kind: "append_customer_message", content: secondFollowUp, idempotencyKey: `second-follow-${suffix}` });
    assert.equal(secondFollow.status, 200);
    assert.equal((await transition(secondTicketId, { kind: "save_draft", finalResponse: secondEdit, humanEdited: false, expectedDraftRevision: 0 })).status, 200);
    assert.equal((await transition(secondTicketId, { kind: "send_agent_message", finalResponse: secondEdit, humanEdited: false, expectedDraftRevision: 1, idempotencyKey: `second-send-2-${suffix}` })).status, 200);
    const secondMessages = await request(orgPath(orgA, `/tickets/${encodeURIComponent(secondTicketId)}/messages`), { headers: { cookie: sessions.a } });
    const secondSourceMessageId = secondMessages.body.data.find((message) => message.direction === "customer" && message.content === secondFollowUp).id;
    const secondPrepared = await transition(secondTicketId, { kind: "prepare_reflection", reflection: learning.generateReflectionCommand({ organizationId: orgA, actor: { id: userA, name: "NC-FIX-015 reviewer" }, authority: "server", requestId: `second-reflection-${suffix}`, organizationProfile: profile, ticket: reflectionTicket(second, "drafted"), understanding: second.understanding, reviewedResponse: item.lessons[0].customerResponse, existingMatch: second.memoryMatch }).reflection });
    assert.equal(secondPrepared.status, 200);
    const secondEvidence = await transition(secondTicketId, { kind: "attach_resolution_evidence", evidenceType: "customer_confirmation", sourceMessageId: secondSourceMessageId, note: "Second customer confirmed that the same certificate-rotation procedure restored SSO sign-in.", idempotencyKey: `second-evidence-${suffix}` });
    assert.equal(secondEvidence.status, 200);
    assert.equal((await transition(secondTicketId, { kind: "resolve_with_evidence", evidenceId: secondEvidence.body.data.resolutionEvidence[0].id })).status, 200);
    const recurrence = learning.generateReflectionCommand({ organizationId: orgA, actor: { id: userA, name: "NC-FIX-015 reviewer" }, authority: "server", requestId: `second-reflection-final-${suffix}`, organizationProfile: profile, ticket: reflectionTicket(second, "resolved"), understanding: second.understanding, reviewedResponse: item.lessons[0].customerResponse, existingMatch: second.memoryMatch });
    assert.ok(["trust_update_only", "merge_existing"].includes(recurrence.reflection.action), JSON.stringify(recurrence.reflection));
    assert.notEqual(recurrence.reflection.action, "improves_existing");

    const replay = await request(orgPath(orgA, "/commits/validation"), { method: "POST", headers: headers(sessions.a), body: JSON.stringify(commitPayload) });
    assert.equal(replay.status, 200);
    assert.ok(replay.body.data.replayed || replay.body.data.committed?.replayed, "repeating the first commit must be idempotent");
    console.log(JSON.stringify({ persistedSingleSignal: true, opaqueLessonProvenance: true, groundedReuse: true, lessonScore: second.lessonMatch.score, multiTokenMatches: second.lessonMatch.multiTokenMatches, ticketEvidenceCoverage: second.lessonMatch.ticketEvidenceCoverage, weakNegative: true, negationNegative: true, unrelatedNegative: true, crossTenantIsolation: true, resolutionEvidenceToReflection: true, recurrenceMatchesExisting: true, noFalseImprovesExisting: true, idempotentCommitReplay: true, cleanup: true }, null, 2));
    console.log("NC-FIX-015 persisted lesson evidence probe passed.");
  } finally {
    if (db._connected) { await cleanup(db); cleaned = true; }
    await db.end().catch(() => undefined);
    server.kill();
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.equal(cleaned, true, "disposable NC-FIX-015 data must be cleaned");
}
main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
