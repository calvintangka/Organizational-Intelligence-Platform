/*
 * NC-FIX-017 permanent recurrence / optimistic-concurrency probe.
 *
 * The fixture uses only disposable organizations and exercises the server-owned
 * ticket, evidence, Reflection, validation-commit, and persistence paths. It
 * also keeps a real stale validation payload to prove that the repaired client
 * reconciliation did not weaken the guarded server write.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { promisify } = require("node:util");
const { spawn } = require("node:child_process");
const { Client } = require("pg");
const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness({ loadEnv: true });
const learning = require(path.join(root, "lib", "application", "learning", "reflectionCommands.ts"));
const canonical = require(path.join(root, "lib", "canonicalProblemEngine.ts"));

const baseUrl = process.env.NC_FIX_017_BASE_URL || "http://127.0.0.1:3417";
const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
const orgA = `nc-fix-017-org-a-${suffix}`;
const orgB = `nc-fix-017-org-b-${suffix}`;
const userA = `nc-fix-017-user-a-${suffix}`;
const userB = `nc-fix-017-user-b-${suffix}`;
const emailA = `${userA}@example.test`;
const emailB = `${userB}@example.test`;
const password = `NC-FIX-017-${suffix}-safe-password!`;
const scrypt = promisify(crypto.scrypt);

const firstIssue = "A customer cannot sign in through single sign-on after our identity provider certificate rotation. The SSO certificate thumbprint is no longer accepted and the authentication configuration must be updated.";
const firstFollowUp = "We replaced the identity-provider certificate with the current thumbprint and staged the authentication configuration. Sign-in now works for this customer.";
const firstResponse = "Verify the current identity-provider certificate thumbprint and apply the staged authentication configuration.";
const recurrenceIssue = "A different customer is stuck at single sign-on because the identity provider certificate was rotated. The current SSO certificate thumbprint needs to be verified and the staged authentication configuration applied.";
const recurrenceFollowUp = "We verified the current certificate thumbprint and applied the staged authentication configuration. Sign-in now works for this customer too.";

function tokenHash(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}
function session(token) { return `oip_session=${token}`; }
function headers(cookie, requestId) { return { cookie, "content-type": "application/json", "x-request-id": requestId, "x-correlation-id": requestId }; }
async function request(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 800); }
  return { status: response.status, headers: response.headers, body };
}
async function startServer() {
  const port = new URL(baseUrl).port || "3417";
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", port], {
    cwd: root, windowsHide: true,
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
  await db.query('insert into organizations (id,name,industry,description,settings,"createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,current_timestamp,current_timestamp), ($6,$7,$8,$9,$5::jsonb,current_timestamp,current_timestamp)', [orgA, "NC-FIX-017 Recurrence QA", "Technology", "Disposable recurrence concurrency fixture", JSON.stringify({}), orgB, "NC-FIX-017 Tenant Control", "Technology", "Cross-tenant control"]);
  for (const [userId, email, organizationId] of [[userA, emailA, orgA], [userB, emailB, orgB]]) {
    await db.query('insert into users (id,name,email,"passwordHash","activeOrganizationId","updatedAt") values ($1,$2,$3,$4,$5,current_timestamp)', [userId, userId, email, hash, organizationId]);
    await db.query('insert into organization_memberships ("userId","organizationId",role) values ($1,$2,$3)', [userId, organizationId, "owner"]);
    await db.query('insert into organization_role_assignments (id,"organizationId","userId","roleId","assignedByUserId","updatedAt") select $1,$2,$3,id,$3,current_timestamp from rbac_roles where key=$4', [`nc-fix-017-assignment-${userId}`, organizationId, userId, "owner"]);
  }
  const tokenA = `nc-fix-017-a-${suffix}`;
  const tokenB = `nc-fix-017-b-${suffix}`;
  await db.query('insert into auth_sessions (id,"tokenHash","userId","expiresAt") values ($1,$2,$3,$4),($5,$6,$7,$4)', [`nc-fix-017-session-a-${suffix}`, tokenHash(tokenA), userA, "2099-01-01T00:00:00.000Z", `nc-fix-017-session-b-${suffix}`, tokenHash(tokenB), userB]);
  return { a: session(tokenA), b: session(tokenB) };
}
async function cleanup(db) {
  await db.query('delete from users where id in ($1,$2)', [userA, userB]);
  await db.query('delete from organizations where id in ($1,$2)', [orgA, orgB]);
}
function fakePersistence() {
  return {
    context: { organizationId: orgA, authority: "server", requestId: `nc-fix-017-${suffix}`, actorContext: { id: userA, name: "NC-FIX-017 reviewer" } },
    async commitValidatedMemoryChange(input) {
      return { replayed: false, knowledgeRevision: input.knowledgeItem.revision, trustApplied: true, candidate: input.candidate, validation: input.validation, memoryChange: input.memoryChange, knowledgeItem: input.knowledgeItem, auditSummary: { organizationId: orgA, actorId: userA, actor: "NC-FIX-017 reviewer", sourceTicketIds: input.candidate.sourceTicketIds, decision: input.validation.decision, changeType: input.memoryChange.changeType } };
    }
  };
}
function ticketFor(result, status) { return { ...result.ticket, ticketId: result.ticket.ticketId ?? result.ticket.id, status }; }
function orgPath(route) { return `/api/organizations/${orgA}${route}`; }
async function transition(cookie, ticketId, command, label) {
  const response = await request(orgPath(`/tickets/${encodeURIComponent(ticketId)}/transition`), { method: "POST", headers: headers(cookie, `nc-fix-017-${label}-${suffix}`), body: JSON.stringify(command) });
  assert.equal(response.status, 200, `${label}: ${JSON.stringify(response.body)}`);
  return response.body.data;
}
async function processTicket(cookie, description, responseText, key) {
  const processed = await request(orgPath("/tickets/process"), { method: "POST", headers: headers(cookie, `nc-fix-017-process-${key}-${suffix}`), body: JSON.stringify({ description, customerName: `${key} Customer`, subject: "SSO certificate rotation", idempotencyKey: `nc-fix-017-process-${key}-${suffix}` }) });
  assert.equal(processed.status, 200, JSON.stringify(processed.body));
  const result = processed.body.data;
  const ticketId = result.ticket.ticketId;
  await transition(cookie, ticketId, { kind: "save_draft", finalResponse: responseText, humanEdited: false, expectedDraftRevision: 1 }, `${key}-save-1`);
  await transition(cookie, ticketId, { kind: "send_agent_message", finalResponse: responseText, humanEdited: false, expectedDraftRevision: 2, idempotencyKey: `nc-fix-017-send-${key}-${suffix}` }, `${key}-send-1`);
  await transition(cookie, ticketId, { kind: "append_customer_message", content: key === "first" ? firstFollowUp : recurrenceFollowUp, idempotencyKey: `nc-fix-017-follow-${key}-${suffix}` }, `${key}-follow`);
  await transition(cookie, ticketId, { kind: "save_draft", finalResponse: responseText, humanEdited: false, expectedDraftRevision: 0 }, `${key}-save-2`);
  await transition(cookie, ticketId, { kind: "send_agent_message", finalResponse: responseText, humanEdited: false, expectedDraftRevision: 1, idempotencyKey: `nc-fix-017-send-2-${key}-${suffix}` }, `${key}-send-2`);
  const messages = await request(orgPath(`/tickets/${encodeURIComponent(ticketId)}/messages`), { headers: { cookie } });
  assert.equal(messages.status, 200);
  const sourceMessageId = messages.body.data.find((message) => message.direction === "customer" && message.content === (key === "first" ? firstFollowUp : recurrenceFollowUp)).id;
  return { result, ticketId, sourceMessageId };
}
function promotionPayload({ profile, ticket, understanding, reflection, reviewedResponse, knowledgeItems, validationRecords, problemName, key }) {
  return learning.promoteKnowledgeCommand({
    organizationId: orgA,
    actor: { id: userA, name: "NC-FIX-017 reviewer" },
    authority: "server",
    requestId: `nc-fix-017-reflection-${key}-${suffix}`,
    idempotencyKey: `nc-fix-017-promotion-${key}-${suffix}`,
    organizationProfile: profile,
    ticket,
    understanding,
    reviewedResponse,
    suggestedResponse: null,
    reflection,
    problemName,
    lessonDraft: key === "first" ? { mode: "new", rootCause: "The identity provider certificate rotation left the accepted SSO thumbprint out of sync.", solution: "Verify the current identity-provider certificate thumbprint and apply the staged authentication configuration.", customerResponse: reviewedResponse, signals: ["sso certificate rotation"] } : undefined,
    knowledgeItems,
    validationRecords,
    currentOrgMetrics: {}
  }, { persistence: fakePersistence() });
}
async function prepareAndResolve(cookie, flow, reflection, key) {
  await transition(cookie, flow.ticketId, { kind: "prepare_reflection", reflection }, `${key}-prepare`);
  const evidence = await transition(cookie, flow.ticketId, { kind: "attach_resolution_evidence", evidenceType: "customer_confirmation", sourceMessageId: flow.sourceMessageId, note: "Customer confirmed that the certificate-rotation procedure restored SSO sign-in.", idempotencyKey: `nc-fix-017-evidence-${key}-${suffix}` }, `${key}-evidence`);
  const resolved = await transition(cookie, flow.ticketId, { kind: "resolve_with_evidence", evidenceId: evidence.resolutionEvidence[0].id }, `${key}-resolve`);
  assert.equal(resolved.reflection.validationEligible, true);
}
function sourceContract() {
  const engine = fs.readFileSync(path.join(root, "lib", "canonicalProblemEngine.ts"), "utf8");
  const page = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
  assert.match(engine, /Revision is persistence concurrency metadata/);
  assert.match(page, /upsertCanonicalProblem\(prev, committedItem\)/);
  assert.match(page, /expectedKnowledgeRevision/);
}
async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  sourceContract();
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  const server = await startServer();
  let cleaned = false;
  try {
    await db.connect();
    const sessions = await seed(db);
    const profileResponse = await request(orgPath(""), { headers: { cookie: sessions.a } });
    assert.equal(profileResponse.status, 200);
    const profile = profileResponse.body.data;

    const firstFlow = await processTicket(sessions.a, firstIssue, firstResponse, "first");
    const firstReflection = learning.generateReflectionCommand({ organizationId: orgA, actor: { id: userA, name: "NC-FIX-017 reviewer" }, authority: "server", requestId: `nc-fix-017-first-reflection-${suffix}`, organizationProfile: profile, ticket: ticketFor(firstFlow.result, "resolved"), understanding: firstFlow.result.understanding, reviewedResponse: firstResponse, existingMatch: null });
    assert.equal(firstReflection.reflection.action, "create_new");
    await prepareAndResolve(sessions.a, firstFlow, firstReflection.reflection, "first");
    const firstPayload = await promotionPayload({ profile, ticket: ticketFor(firstFlow.result, "resolved"), understanding: firstFlow.result.understanding, reflection: firstReflection.reflection, reviewedResponse: firstResponse, knowledgeItems: [], validationRecords: [], key: "first" });
    const firstKnowledgeItem = { ...firstPayload.knowledgeItem, organizationId: orgA };
    const firstMemoryChange = { ...firstPayload.memoryChange, afterState: { ...firstPayload.memoryChange.afterState, organizationId: orgA } };
    const firstCommit = await request(orgPath("/commits/validation"), { method: "POST", headers: headers(sessions.a, `nc-fix-017-first-commit-${suffix}`), body: JSON.stringify({ candidate: firstPayload.candidate, validation: firstPayload.validation, memoryChange: firstMemoryChange, knowledgeItem: firstKnowledgeItem, expectedKnowledgeRevision: null, idempotencyKey: `nc-fix-017-promotion-first-${suffix}` }) });
    assert.equal(firstCommit.status, 200, JSON.stringify(firstCommit.body));
    const firstMemory = (await request(orgPath("/knowledge"), { headers: { cookie: sessions.a } })).body.data;
    assert.equal(firstMemory.length, 1);
    const initialItem = firstMemory[0];
    assert.equal(initialItem.revision, 1);
    assert.equal(initialItem.lessons.length, 1);
    const lessonId = initialItem.lessons[0].id;
    const lessonVersion = initialItem.lessons[0].version;

    const secondFlow = await processTicket(sessions.a, recurrenceIssue, initialItem.lessons[0].customerResponse, "second");
    assert.equal(secondFlow.result.memoryMatch.item.id, initialItem.id);
    assert.equal(secondFlow.result.lessonMatch.lesson.id, lessonId);
    const secondExistingMatch = { item: secondFlow.result.memoryMatch.item, similarity: secondFlow.result.memoryMatch.matchScore ?? secondFlow.result.memoryMatch.similarity ?? secondFlow.result.lessonMatch.score * 100, reason: secondFlow.result.memoryMatch.matchReason ?? "persisted lesson match" };
    const secondReflection = learning.generateReflectionCommand({ organizationId: orgA, actor: { id: userA, name: "NC-FIX-017 reviewer" }, authority: "server", requestId: `nc-fix-017-second-reflection-${suffix}`, organizationProfile: profile, ticket: ticketFor(secondFlow.result, "resolved"), understanding: secondFlow.result.understanding, reviewedResponse: initialItem.lessons[0].customerResponse, existingMatch: secondExistingMatch, selectedDraft: { draftMode: "lesson_grounded", matchedLesson: secondFlow.result.lessonMatch.lesson } });
    assert.equal(secondReflection.reflection.action, "trust_update_only", JSON.stringify(secondReflection.reflection));
    await prepareAndResolve(sessions.a, secondFlow, secondReflection.reflection, "second");
    const secondPayload = await promotionPayload({ profile, ticket: ticketFor(secondFlow.result, "resolved"), understanding: secondFlow.result.understanding, reflection: secondReflection.reflection, reviewedResponse: initialItem.lessons[0].customerResponse, knowledgeItems: [initialItem], validationRecords: [firstCommit.body.data.validation], key: "second" });
    const recurrenceCommit = await request(orgPath("/commits/validation"), { method: "POST", headers: headers(sessions.a, `nc-fix-017-second-commit-${suffix}`), body: JSON.stringify({ candidate: secondPayload.candidate, validation: secondPayload.validation, memoryChange: secondPayload.memoryChange, knowledgeItem: secondPayload.knowledgeItem, expectedKnowledgeRevision: initialItem.revision, idempotencyKey: `nc-fix-017-promotion-second-${suffix}` }) });
    assert.equal(recurrenceCommit.status, 200, JSON.stringify(recurrenceCommit.body));
    const afterRecurrence = (await request(orgPath("/knowledge"), { headers: { cookie: sessions.a } })).body.data[0];
    assert.equal(afterRecurrence.revision, 2);
    assert.equal(afterRecurrence.lessons.length, 1);
    assert.equal(afterRecurrence.lessons[0].id, lessonId);
    assert.equal(afterRecurrence.lessons[0].version, lessonVersion);
    assert.ok(afterRecurrence.trustScore > initialItem.trustScore);
    assert.ok(afterRecurrence.timesSeen > initialItem.timesSeen);
    let counts = await db.query('select (select count(*) from validation_records where "organizationId"=$1)::int as validations, (select count(*) from memory_change_records where "organizationId"=$1)::int as changes, (select count(*) from trust_evidence where "organizationId"=$1)::int as trust_evidence', [orgA]);
    assert.equal(counts.rows[0].validations, 2);
    assert.equal(counts.rows[0].changes, 2);
    assert.equal(counts.rows[0].trust_evidence, 2);

    const replay = await request(orgPath("/commits/validation"), { method: "POST", headers: headers(sessions.a, `nc-fix-017-second-replay-${suffix}`), body: JSON.stringify({ candidate: secondPayload.candidate, validation: secondPayload.validation, memoryChange: secondPayload.memoryChange, knowledgeItem: secondPayload.knowledgeItem, expectedKnowledgeRevision: initialItem.revision, idempotencyKey: `nc-fix-017-promotion-second-${suffix}` }) });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.data.replayed, true);
    const afterReplay = (await request(orgPath("/knowledge"), { headers: { cookie: sessions.a } })).body.data[0];
    assert.equal(afterReplay.revision, 2);
    counts = await db.query('select (select count(*) from validation_records where "organizationId"=$1)::int as validations, (select count(*) from memory_change_records where "organizationId"=$1)::int as changes, (select count(*) from trust_evidence where "organizationId"=$1)::int as trust_evidence', [orgA]);
    assert.deepEqual(counts.rows[0], { validations: 2, changes: 2, trust_evidence: 2 });

    const thirdFlow = await processTicket(sessions.a, recurrenceIssue, afterRecurrence.lessons[0].customerResponse, "third");
    const thirdExistingMatch = { item: thirdFlow.result.memoryMatch.item, similarity: thirdFlow.result.memoryMatch.matchScore ?? thirdFlow.result.memoryMatch.similarity ?? thirdFlow.result.lessonMatch.score * 100, reason: thirdFlow.result.memoryMatch.matchReason ?? "persisted lesson match" };
    const thirdReflection = learning.generateReflectionCommand({ organizationId: orgA, actor: { id: userA, name: "NC-FIX-017 reviewer" }, authority: "server", requestId: `nc-fix-017-third-reflection-${suffix}`, organizationProfile: profile, ticket: ticketFor(thirdFlow.result, "resolved"), understanding: thirdFlow.result.understanding, reviewedResponse: afterRecurrence.lessons[0].customerResponse, existingMatch: thirdExistingMatch, selectedDraft: { draftMode: "lesson_grounded", matchedLesson: thirdFlow.result.lessonMatch.lesson } });
    assert.equal(thirdReflection.reflection.action, "trust_update_only");
    await prepareAndResolve(sessions.a, thirdFlow, thirdReflection.reflection, "third");
    const latestBeforeConflict = (await request(orgPath("/knowledge"), { headers: { cookie: sessions.a } })).body.data[0];
    const thirdPayload = await promotionPayload({ profile, ticket: ticketFor(thirdFlow.result, "resolved"), understanding: thirdFlow.result.understanding, reflection: thirdReflection.reflection, reviewedResponse: latestBeforeConflict.lessons[0].customerResponse, knowledgeItems: [latestBeforeConflict], validationRecords: [firstCommit.body.data.validation, secondPayload.validation], key: "third" });
    const competing = { ...latestBeforeConflict, title: "Authoritative competing revision" };
    const competitorWrite = await request(orgPath("/knowledge"), { method: "PUT", headers: headers(sessions.a, `nc-fix-017-competing-${suffix}`), body: JSON.stringify([competing]) });
    assert.equal(competitorWrite.status, 200);
    const countsBeforeReject = await db.query('select (select count(*) from validation_records where "organizationId"=$1)::int as validations, (select count(*) from memory_change_records where "organizationId"=$1)::int as changes, (select count(*) from trust_evidence where "organizationId"=$1)::int as trust_evidence', [orgA]);
    const stale = await request(orgPath("/commits/validation"), { method: "POST", headers: headers(sessions.a, `nc-fix-017-stale-${suffix}`), body: JSON.stringify({ candidate: thirdPayload.candidate, validation: thirdPayload.validation, memoryChange: thirdPayload.memoryChange, knowledgeItem: thirdPayload.knowledgeItem, expectedKnowledgeRevision: latestBeforeConflict.revision, idempotencyKey: `nc-fix-017-promotion-third-${suffix}` }) });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, "REVISION_CONFLICT");
    assert.equal(stale.body.error.expectedRevision, latestBeforeConflict.revision);
    assert.equal(stale.body.error.currentRevision, latestBeforeConflict.revision + 1);
    const afterReject = (await request(orgPath("/knowledge"), { headers: { cookie: sessions.a } })).body.data[0];
    assert.equal(afterReject.title, "Authoritative competing revision");
    assert.equal(afterReject.revision, latestBeforeConflict.revision + 1);
    const countsAfterReject = await db.query('select (select count(*) from validation_records where "organizationId"=$1)::int as validations, (select count(*) from memory_change_records where "organizationId"=$1)::int as changes, (select count(*) from trust_evidence where "organizationId"=$1)::int as trust_evidence', [orgA]);
    assert.deepEqual(countsAfterReject.rows[0], countsBeforeReject.rows[0]);
    const reloaded = (await request(orgPath("/knowledge"), { headers: { cookie: sessions.a } })).body.data[0];
    assert.equal(reloaded.revision, latestBeforeConflict.revision + 1);

    const crossTenant = await request(orgPath("/commits/validation"), { method: "POST", headers: headers(sessions.b, `nc-fix-017-cross-tenant-${suffix}`), body: JSON.stringify({ candidate: thirdPayload.candidate, validation: thirdPayload.validation, memoryChange: thirdPayload.memoryChange, knowledgeItem: thirdPayload.knowledgeItem, expectedKnowledgeRevision: latestBeforeConflict.revision, idempotencyKey: `nc-fix-017-cross-tenant-${suffix}` }) });
    assert.equal(crossTenant.status, 403);
    const finalRow = await db.query('select count(*)::int as count, max(revision)::int as revision, max(title) as title from knowledge_items where id=$1 and "organizationId"=$2', [afterRecurrence.id, orgA]);
    assert.equal(finalRow.rows[0].count, 1);
    assert.equal(finalRow.rows[0].revision, latestBeforeConflict.revision + 1);
    assert.equal(finalRow.rows[0].title, "Authoritative competing revision");
    const merged = canonical.mergeCanonicalProblemItems({ ...initialItem, revision: 1 }, { ...afterRecurrence, revision: 2 });
    assert.equal(merged.revision, 2);
    console.log(JSON.stringify({ initialRevision: initialItem.revision, recurrenceExpectedRevision: initialItem.revision, recurrenceRevision: afterRecurrence.revision, trustIncreased: afterRecurrence.trustScore > initialItem.trustScore, timesSeenIncreased: afterRecurrence.timesSeen > initialItem.timesSeen, lessonVersionStable: afterRecurrence.lessons[0].version === lessonVersion, idempotentReplay: true, distinctRecurrencePrepared: true, genuineConflict409: true, atomicRollback: true, reloadObservedRevision: reloaded.revision, tenantIsolation: true, cleanup: true }, null, 2));
    console.log("NC-FIX-017 recurrence trust-update concurrency probe passed.");
  } finally {
    if (db._connected) { await cleanup(db); cleaned = true; }
    await db.end().catch(() => undefined);
    server.kill();
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.equal(cleaned, true, "disposable NC-FIX-017 data must be cleaned");
}
main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
