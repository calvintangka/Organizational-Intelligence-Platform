/*
 * NC-ACCEPT-001 permanent learning-loop acceptance probe.
 *
 * This is a disposable, authenticated HTTP replay. It starts with two empty
 * organizations, creates the first ticket through the server-owned processing
 * endpoint, carries the conversation through draft persistence, follow-up,
 * evidence, resolution, Reflection, and validation, then proves retrieval and
 * tenant/negative controls. No KnowledgeItem or evidence row is seeded.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { promisify } = require("node:util");
const { Client } = require("pg");
const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness({ loadEnv: true });
const learning = require(require("node:path").join(root, "lib", "application", "learning", "reflectionCommands.ts"));

process.env.RATE_LIMIT_HASH_SECRET = process.env.RATE_LIMIT_HASH_SECRET || "nc-accept-001-probe-secret";
const baseUrl = process.env.NC_ACCEPT_001_BASE_URL || "http://127.0.0.1:3405";
const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
const orgA = `nc-accept-001-org-a-${suffix}`;
const orgB = `nc-accept-001-org-b-${suffix}`;
const userA = `nc-accept-001-user-a-${suffix}`;
const userB = `nc-accept-001-user-b-${suffix}`;
const emailA = `${userA}@example.test`;
const emailB = `${userB}@example.test`;
const password = `NC-ACCEPT-001-${suffix}-safe-password!`;
const scrypt = promisify(crypto.scrypt);

const initialIssue = "Customer Rina Prasetyo from PT Sinar Karya Abadi reports that Andi Wibowo cannot clock in through the NusaCloud mobile app because the application requests location access. Other employees can still clock in normally. Please help investigate.";
const customerFollowUp = "We checked Andi's phone and location permission for NusaCloud was set to 'Don't allow.' We changed it to 'Allow while using the app' and he can clock in again now.";
const firstEdit = "Hello Rina Prasetyo, please confirm whether Andi has granted location permission to the NusaCloud mobile app and share the device model and app version if the issue continues. Best regards, NusaCloud HR Support Team";
const followUpEdit = "Hello Rina Prasetyo, thank you for confirming that changing the NusaCloud location permission resolved Andi's clock-in issue. Best regards, NusaCloud HR Support Team";

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
  try { body = JSON.parse(text); } catch { body = text.slice(0, 600); }
  return { status: response.status, headers: response.headers, body };
}
async function startServer() {
  const port = new URL(baseUrl).port || "3405";
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
  await db.query('insert into organizations (id,name,industry,description,settings,"createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,current_timestamp,current_timestamp), ($6,$7,$8,$9,$5::jsonb,current_timestamp,current_timestamp)', [orgA, "NC-ACCEPT-001 Disposable Learning Loop", "HR", "Acceptance replay organization", JSON.stringify({}), orgB, "NC-ACCEPT-001 Disposable Tenant Control", "HR", "Cross-tenant control"]);
  for (const [userId, email, organizationId] of [[userA, emailA, orgA], [userB, emailB, orgB]]) {
    await db.query('insert into users (id,name,email,"passwordHash","activeOrganizationId","updatedAt") values ($1,$2,$3,$4,$5,current_timestamp)', [userId, userId, email, hash, organizationId]);
    await db.query('insert into organization_memberships ("userId","organizationId",role) values ($1,$2,$3)', [userId, organizationId, "owner"]);
    await db.query('insert into organization_role_assignments (id,"organizationId","userId","roleId","assignedByUserId","updatedAt") select $1,$2,$3,id,$3,current_timestamp from rbac_roles where key=$4', [`nc-accept-001-assignment-${userId}`, organizationId, userId, "owner"]);
  }
  const tokenA = `nc-accept-001-a-${suffix}`;
  const tokenB = `nc-accept-001-b-${suffix}`;
  await db.query('insert into auth_sessions (id,"tokenHash","userId","expiresAt") values ($1,$2,$3,$4),($5,$6,$7,$4)', [`nc-accept-001-session-a-${suffix}`, tokenHash(tokenA), userA, "2099-01-01T00:00:00.000Z", `nc-accept-001-session-b-${suffix}`, tokenHash(tokenB), userB]);
  return { a: cookie(tokenA), b: cookie(tokenB) };
}
async function cleanup(db) {
  await db.query('delete from users where id in ($1,$2)', [userA, userB]);
  await db.query('delete from organizations where id in ($1,$2)', [orgA, orgB]);
}
function fakeLearningPersistence() {
  return {
    context: { organizationId: orgA, authority: "server", requestId: `nc-accept-001-${suffix}`, actorContext: { id: userA, name: "NC-ACCEPT-001 reviewer" } },
    async commitValidatedMemoryChange(input) {
      return {
        replayed: false,
        knowledgeRevision: 1,
        trustApplied: true,
        candidate: { ...input.candidate, status: "validated" },
        validation: input.validation,
        memoryChange: input.memoryChange,
        knowledgeItem: { ...input.knowledgeItem, revision: 1 },
        auditSummary: { organizationId: orgA, actorId: userA, actor: "NC-ACCEPT-001 reviewer", sourceTicketIds: input.candidate.sourceTicketIds, decision: input.validation.decision, changeType: input.memoryChange.changeType }
      };
    }
  };
}
function reflectionTicket(result) {
  return { ...result.ticket, ticketId: result.ticket.ticketId ?? result.ticket.id, status: "drafted" };
}
async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  let server = await startServer();
  let cleaned = false;
  try {
    await db.connect();
    const sessions = await seed(db);
    const orgPath = (org, path) => `/api/organizations/${org}${path}`;
    const transition = (org, ticketId, command, session = sessions.a) => request(orgPath(org, `/tickets/${encodeURIComponent(ticketId)}/transition`), { method: "POST", headers: headers(session), body: JSON.stringify(command) });
    const orgProfile = await request(orgPath(orgA, ""), { headers: { cookie: sessions.a } });
    assert.equal(orgProfile.status, 200);
    const initialMemory = await request(orgPath(orgA, "/knowledge"), { headers: { cookie: sessions.a } });
    assert.equal(initialMemory.status, 200);
    assert.equal(initialMemory.body.data.length, 0, "a new organization must start without the target lesson");

    const processed = await request(orgPath(orgA, "/tickets/process"), { method: "POST", headers: headers(sessions.a), body: JSON.stringify({ description: initialIssue, customerName: "Rina Prasetyo", subject: "Mobile clock-in asks for location access", idempotencyKey: `initial-${suffix}` }) });
    assert.equal(processed.status, 200, JSON.stringify(processed.body));
    const first = processed.body.data;
    const ticketId = first.ticket.ticketId;
    assert.equal(first.memoryMatch, null, "the first ticket must have no target lesson retrieval");
    assert.ok(first.persistedTicket.resolution.finalResponse, "the first AI/deterministic draft must persist");

    const saved = await transition(orgA, ticketId, { kind: "save_draft", finalResponse: firstEdit, humanEdited: true, expectedDraftRevision: 1 });
    assert.equal(saved.status, 200);
    const sent1 = await transition(orgA, ticketId, { kind: "send_agent_message", finalResponse: firstEdit, humanEdited: true, expectedDraftRevision: 2, idempotencyKey: `send-1-${suffix}` });
    assert.equal(sent1.status, 200);
    assert.equal(sent1.body.data.status, "waiting_for_customer");
    const follow = await transition(orgA, ticketId, { kind: "append_customer_message", content: customerFollowUp, idempotencyKey: `follow-${suffix}` });
    assert.equal(follow.status, 200);
    assert.equal(follow.body.data.status, "in_review");
    const saved2 = await transition(orgA, ticketId, { kind: "save_draft", finalResponse: followUpEdit, humanEdited: true, expectedDraftRevision: 0 });
    assert.equal(saved2.status, 200);
    const sent2 = await transition(orgA, ticketId, { kind: "send_agent_message", finalResponse: followUpEdit, humanEdited: true, expectedDraftRevision: 1, idempotencyKey: `send-2-${suffix}` });
    assert.equal(sent2.status, 200);
    const messages = await request(orgPath(orgA, `/tickets/${encodeURIComponent(ticketId)}/messages`), { headers: { cookie: sessions.a } });
    assert.equal(messages.status, 200);
    assert.deepEqual(messages.body.data.map((message) => message.direction), ["customer", "agent", "customer", "agent"]);
    const sourceMessageId = messages.body.data.find((message) => message.direction === "customer" && message.content === customerFollowUp).id;

    const profile = orgProfile.body.data;
    const ticket = reflectionTicket(first);
    const generated = learning.generateReflectionCommand({ organizationId: orgA, actor: { id: userA, name: "NC-ACCEPT-001 reviewer" }, authority: "server", requestId: `reflection-${suffix}`, organizationProfile: profile, ticket, understanding: first.understanding, reviewedResponse: followUpEdit, existingMatch: null });
    assert.equal(generated.reflection.action, "create_new");
    const lessonDraft = { mode: "new", rootCause: "Location permission was disabled for the affected employee's NusaCloud mobile app.", solution: "Enable location permission while using the app and retry mobile clock-in.", customerResponse: "Hello {{customerName}}, enable location permission for the NusaCloud mobile app and retry clock-in.", signals: ["mobile clock-in location permission", "one employee cannot clock in", "other employees unaffected"] };
    const learningResult = await learning.promoteKnowledgeCommand({ organizationId: orgA, actor: { id: userA, name: "NC-ACCEPT-001 reviewer" }, authority: "server", requestId: `promotion-${suffix}`, idempotencyKey: `promotion-${suffix}`, organizationProfile: profile, ticket, understanding: first.understanding, reviewedResponse: followUpEdit, reflection: generated.reflection, lessonDraft, problemName: `Mobile Clock-In - Location Permission Disabled ${suffix}`, knowledgeItems: [], validationRecords: [] }, { persistence: fakeLearningPersistence() });
    const commitPayload = { candidate: learningResult.candidate, validation: learningResult.validation, memoryChange: learningResult.memoryChange, knowledgeItem: learningResult.knowledgeItem, expectedKnowledgeRevision: null, idempotencyKey: `promotion-${suffix}` };

    const premature = await request(orgPath(orgA, "/commits/validation"), { method: "POST", headers: headers(sessions.a), body: JSON.stringify(commitPayload) });
    assert.equal(premature.status, 409);
    assert.equal(premature.body.error.code, "RESOLUTION_EVIDENCE_REQUIRED", "unresolved validation must be blocked");
    const prepared = await transition(orgA, ticketId, { kind: "prepare_reflection", reflection: generated.reflection });
    assert.equal(prepared.status, 200);
    const evidence = await transition(orgA, ticketId, { kind: "attach_resolution_evidence", evidenceType: "customer_confirmation", sourceMessageId, note: "Customer explicitly confirmed that changing location permission restored clock-in.", idempotencyKey: `evidence-${suffix}` });
    assert.equal(evidence.status, 200);
    const resolved = await transition(orgA, ticketId, { kind: "resolve_with_evidence", evidenceId: evidence.body.data.resolutionEvidence[0].id });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.data.status, "resolved");
    assert.equal(resolved.body.data.reflection.validationEligible, true);
    const committed = await request(orgPath(orgA, "/commits/validation"), { method: "POST", headers: headers(sessions.a), body: JSON.stringify(commitPayload) });
    assert.equal(committed.status, 200, JSON.stringify(committed.body));
    const knowledge = await request(orgPath(orgA, "/knowledge"), { headers: { cookie: sessions.a } });
    assert.equal(knowledge.status, 200);
    assert.equal(knowledge.body.data.length, 1);
    const item = knowledge.body.data[0];
    assert.ok(item.lessons?.length >= 1, "the committed KnowledgeItem must contain the authored lesson");
    assert.ok(JSON.stringify(item).includes(ticketId), "KnowledgeItem provenance must retain the source ticket relationship");
    const committedTickets = await request(orgPath(orgA, "/tickets?full=true"), { headers: { cookie: sessions.a } });
    const persisted = committedTickets.body.data.find((row) => row.ticketId === ticketId);
    assert.equal(persisted.status, "resolved");
    assert.equal(persisted.messages.length, 4);
    assert.equal(persisted.resolutionEvidence.length, 1);

    const similar = await request(orgPath(orgA, "/tickets/process"), { method: "POST", headers: headers(sessions.a), body: JSON.stringify({ description: "Customer Marco Santoso from PT Sinar Karya Abadi reports that Budi Hartono cannot clock in through the NusaCloud mobile app because the application requests location access. Other employees can still clock in normally. Please help investigate.", customerName: "Marco Santoso", idempotencyKey: `similar-${suffix}` }) });
    assert.equal(similar.status, 200);
    assert.ok(similar.body.data.memoryMatch, "the second similar ticket must retrieve the validated lesson");
    assert.equal(similar.body.data.memoryMatch.item.id, item.id);
    assert.ok(similar.body.data.draft.draftMode === "lesson_grounded" || similar.body.data.draft.groundingLabel, "the second response must be grounded by the lesson");
    assert.doesNotMatch(similar.body.data.draft.draftResponse, /definitely disabled|confirmed root cause/i, "reuse must not fabricate certainty");

    const unrelated = await request(orgPath(orgA, "/tickets/process"), { method: "POST", headers: headers(sessions.a), body: JSON.stringify({ description: "We suspect an unauthorized administrator changed the account password and accessed confidential employee records. Please escalate this security incident immediately.", customerName: "Security Customer", idempotencyKey: `unrelated-${suffix}` }) });
    assert.equal(unrelated.status, 200);
    assert.equal(unrelated.body.data.memoryMatch, null, "an unrelated ticket must not reuse the mobile clock-in lesson");
    const otherMemory = await request(orgPath(orgB, "/knowledge"), { headers: { cookie: sessions.b } });
    assert.equal(otherMemory.status, 200);
    assert.equal(otherMemory.body.data.length, 0, "another organization must not retrieve the lesson");
    assert.equal((await request(orgPath(orgA, "/knowledge"), { headers: { cookie: sessions.b } })).status, 403);

    await request("/api/auth/logout", { method: "POST", headers: { cookie: sessions.a } });
    const loggedIn = await request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: emailA, password }) });
    assert.equal(loggedIn.status, 200);
    const active = cookie(loggedIn.headers.get("set-cookie").split(";", 1)[0].split("=", 2)[1]);
    const afterLogin = await request(orgPath(orgA, "/knowledge"), { headers: { cookie: active } });
    assert.equal(afterLogin.status, 200);
    assert.equal(afterLogin.body.data[0].id, item.id);

    console.log(JSON.stringify({ newOrgWithoutLesson: true, firstTicketColdStart: true, responsePersisted: true, sameTicketFollowUp: true, orderedConversation: true, prematureValidationBlocked: true, customerEvidence: true, evidenceBackedResolution: true, resolvedEvidenceEligible: true, knowledgeItemCreated: true, provenanceLinked: true, secondTicketRetrievedLesson: true, groundedReuse: true, noFalseCertainty: true, unrelatedNegativeControl: true, crossTenantIsolation: true, logoutLoginDurability: true, cleanup: true }, null, 2));
    console.log("NC-ACCEPT-001 learning loop probe passed.");
  } finally {
    if (db._connected) { await cleanup(db); cleaned = true; }
    await db.end().catch(() => undefined);
    server.kill();
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.equal(cleaned, true, "disposable acceptance data must be cleaned");
}
main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
