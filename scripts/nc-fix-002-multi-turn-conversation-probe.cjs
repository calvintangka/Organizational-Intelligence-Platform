/*
 * NC-FIX-002 permanent focused regression probe.
 *
 * Exercises the real authenticated HTTP workflow with disposable rows and no
 * AI provider call: Customer #1 -> Agent #1 -> Customer #2 -> Agent #2 in one
 * case, immutable ordered history, waiting/reopen status transitions,
 * idempotent retries, draft separation, restart durability, and tenancy.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { promisify } = require("node:util");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

process.env.RATE_LIMIT_HASH_SECRET = process.env.RATE_LIMIT_HASH_SECRET || "nc-fix-002-probe-secret";
const baseUrl = process.env.NC_FIX_002_BASE_URL || "http://127.0.0.1:3403";
const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
const orgA = `nc-fix-002-org-a-${suffix}`;
const orgB = `nc-fix-002-org-b-${suffix}`;
const userA = `nc-fix-002-user-a-${suffix}`;
const userB = `nc-fix-002-user-b-${suffix}`;
const emailA = `${userA}@example.test`;
const emailB = `${userB}@example.test`;
const password = `NC-FIX-002-${suffix}-safe-password!`;
const ticketA = `NC-FIX-002-A-${suffix}`;
const ticketB = `NC-FIX-002-B-${suffix}`;
const customer1 = `NC-FIX-002-CUSTOMER-1-${suffix}`;
const agent1 = `NC-FIX-002-AGENT-1-${suffix}`;
const customer2 = `NC-FIX-002-CUSTOMER-2-${suffix}`;
const agent2 = `NC-FIX-002-AGENT-2-${suffix}`;
const customer3 = `NC-FIX-002-CUSTOMER-3-${suffix}`;
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
  const port = new URL(baseUrl).port || "3403";
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
async function seed(db) {
  const hash = await passwordHash(password);
  await db.query(
    'insert into organizations (id,name,industry,description,settings,"createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,current_timestamp,current_timestamp), ($6,$7,$8,$9,$5::jsonb,current_timestamp,current_timestamp)',
    [orgA, "NC-FIX-002 Disposable A", "QA", "Multi-turn conversation probe", JSON.stringify({}), orgB, "NC-FIX-002 Disposable B", "QA", "Tenant isolation probe"]
  );
  for (const [userId, email, organizationId] of [[userA, emailA, orgA], [userB, emailB, orgB]]) {
    await db.query('insert into users (id,name,email,"passwordHash","activeOrganizationId","updatedAt") values ($1,$2,$3,$4,$5,current_timestamp)', [userId, userId, email, hash, organizationId]);
    await db.query('insert into organization_memberships ("userId","organizationId",role) values ($1,$2,$3)', [userId, organizationId, "owner"]);
    await db.query('insert into organization_role_assignments (id,"organizationId","userId","roleId","assignedByUserId","updatedAt") select $1,$2,$3,id,$3,current_timestamp from rbac_roles where key=$4', [`nc-fix-002-assignment-${userId}`, organizationId, userId, "owner"]);
  }
  const tokens = { a: `nc-fix-002-a-${suffix}`, b: `nc-fix-002-b-${suffix}` };
  await db.query('insert into auth_sessions (id,"tokenHash","userId","expiresAt") values ($1,$2,$3,$4),($5,$6,$7,$4)', [`nc-fix-002-session-a-${suffix}`, tokenHash(tokens.a), userA, "2099-01-01T00:00:00.000Z", `nc-fix-002-session-b-${suffix}`, tokenHash(tokens.b), userB]);
  const classification = JSON.stringify({ category: "Verification", intent: "support", canonicalProblem: "Multi-turn lifecycle", classifiedBy: "deterministic", confidence: "high" });
  const resolution = JSON.stringify({ finalResponse: "NC-FIX-002-DRAFT-1", humanEdited: false, editDistanceNote: null, resolvedAt: null, draftRevision: 1 });
  await db.query('insert into ticket_records (id,"organizationId","ticketId","rawMessage",subject,status,"draftSource",classification,resolution,reflection,"validationRecordIds",labels,"createdAt") values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,current_timestamp)', [`nc-fix-002-row-${ticketA}`, orgA, ticketA, customer1, "Multi-turn lifecycle", "in_review", "deterministic", classification, resolution, JSON.stringify({ decision: null, lessonCreatedId: null, lessonReinforcedId: null, knowledgeChanged: null }), "[]", "[]"]);
  await db.query('insert into ticket_messages (id,"organizationId","ticketId",sequence,direction,content,"createdAt","idempotencyKey") values ($1,$2,$3,1,$4,$5,current_timestamp,$6)', [`ticket-message-${ticketA}-1`, orgA, ticketA, "customer", customer1, "initial-customer-message"]);
  await db.query('insert into ticket_records (id,"organizationId","ticketId","rawMessage",subject,status,"draftSource",classification,resolution,reflection,"validationRecordIds",labels,"createdAt") values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,current_timestamp)', [`nc-fix-002-row-${ticketB}`, orgA, ticketB, `Concurrent seed ${suffix}`, "Concurrent append", "waiting_for_customer", "deterministic", classification, JSON.stringify({ finalResponse: null, humanEdited: false, editDistanceNote: null, resolvedAt: null, draftRevision: 0 }), JSON.stringify({ decision: null, lessonCreatedId: null, lessonReinforcedId: null, knowledgeChanged: null }), "[]", "[]"]);
  await db.query('insert into ticket_messages (id,"organizationId","ticketId",sequence,direction,content,"createdAt","idempotencyKey") values ($1,$2,$3,1,$4,$5,current_timestamp,$6),($7,$2,$3,2,$8,$9,current_timestamp,$10)', [`ticket-message-${ticketB}-1`, orgA, ticketB, "customer", `Concurrent seed ${suffix}`, "initial-customer-message", `ticket-message-${ticketB}-2`, "agent", `Concurrent seed response ${suffix}`, "seed-agent-message"]);
  return tokens;
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
    const transitionFor = (ticketId, command, cookie = cookieA) => request(`/api/organizations/${orgA}/tickets/${encodeURIComponent(ticketId)}/transition`, { method: "POST", headers: jsonHeaders(cookie), body: JSON.stringify(command) });
    const transition = (command, cookie = cookieA) => transitionFor(ticketA, command, cookie);
    const send1 = await transition({ kind: "send_agent_message", finalResponse: agent1, humanEdited: true, expectedDraftRevision: 1, idempotencyKey: `send-1-${suffix}` });
    assert.equal(send1.status, 200);
    assert.equal(send1.body.data.status, "waiting_for_customer");
    assert.equal(send1.body.data.resolution.finalResponse, null, "sent history must not remain the editable draft");
    const retry1 = await transition({ kind: "send_agent_message", finalResponse: agent1, humanEdited: true, expectedDraftRevision: 1, idempotencyKey: `send-1-${suffix}` });
    assert.equal(retry1.status, 200, "same send retry must be idempotent");
    const followUp = await transition({ kind: "append_customer_message", content: customer2, idempotencyKey: `customer-2-${suffix}` });
    assert.equal(followUp.status, 200);
    assert.equal(followUp.body.data.status, "in_review");
    assert.equal(followUp.body.data.resolution.draftRevision, 0);
    const save2 = await transition({ kind: "save_draft", finalResponse: agent2, humanEdited: true, expectedDraftRevision: 0 });
    assert.equal(save2.status, 200);
    assert.equal(save2.body.data.resolution.finalResponse, agent2);
    const send2 = await transition({ kind: "send_agent_message", finalResponse: agent2, humanEdited: true, expectedDraftRevision: 1, idempotencyKey: `send-2-${suffix}` });
    assert.equal(send2.status, 200);
    assert.equal(send2.body.data.status, "waiting_for_customer");
    const thirdTurn = await transition({ kind: "append_customer_message", content: customer3, idempotencyKey: `customer-3-${suffix}` });
    assert.equal(thirdTurn.status, 200);
    assert.equal(thirdTurn.body.data.status, "in_review");
    const thirdDraft = await transition({ kind: "save_draft", finalResponse: `NC-FIX-002-AGENT-3-${suffix}`, humanEdited: true, expectedDraftRevision: 0 });
    assert.equal(thirdDraft.status, 200);
    assert.equal(thirdDraft.body.data.resolution.draftRevision, 1);
    const concurrent = await Promise.all([
      transitionFor(ticketB, { kind: "append_customer_message", content: `Concurrent follow-up A ${suffix}`, idempotencyKey: `concurrent-a-${suffix}` }),
      transitionFor(ticketB, { kind: "append_customer_message", content: `Concurrent follow-up B ${suffix}`, idempotencyKey: `concurrent-b-${suffix}` })
    ]);
    assert.deepEqual(concurrent.map((result) => result.status).sort(), [200, 200], "concurrent appends must both commit");
    const concurrentRead = await request(`/api/organizations/${orgA}/tickets/${encodeURIComponent(ticketB)}/messages`, { headers: { cookie: cookieA } });
    assert.equal(concurrentRead.status, 200);
    assert.equal(new Set(concurrentRead.body.data.map((message) => message.id)).size, concurrentRead.body.data.length);
    assert.deepEqual(concurrentRead.body.data.map((message) => message.sequence), [1, 2, 3, 4]);
    const conversation = await request(`/api/organizations/${orgA}/tickets/${encodeURIComponent(ticketA)}/messages`, { headers: { cookie: cookieA } });
    assert.equal(conversation.status, 200);
    assert.deepEqual(conversation.body.data.map((message) => [message.sequence, message.direction, message.content]), [[1, "customer", customer1], [2, "agent", agent1], [3, "customer", customer2], [4, "agent", agent2], [5, "customer", customer3]]);
    assert.equal((await transition({ kind: "append_customer_message", content: "cross-tenant", idempotencyKey: `cross-${suffix}` }, cookieB)).status, 403);
    server.kill();
    await new Promise((resolve) => setTimeout(resolve, 500));
    server = await startServer();
    assert.equal((await request("/api/auth/logout", { method: "POST", headers: { cookie: cookieA } })).status, 200);
    const loggedIn = await request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: emailA, password }) });
    assert.equal(loggedIn.status, 200);
    const activeCookie = sessionCookie(loggedIn.headers.get("set-cookie").split(";", 1)[0].split("=", 2)[1]);
    const resumed = await request(`/api/organizations/${orgA}/tickets?full=true`, { headers: { cookie: activeCookie } });
    assert.equal(resumed.status, 200);
    const record = resumed.body.data.find((row) => row.ticketId === ticketA);
    assert.equal(record.status, "in_review");
    assert.equal(record.messages.length, 5);
    assert.deepEqual(record.messages.map((message) => message.content), [customer1, agent1, customer2, agent2, customer3]);
    const crossRead = await request(`/api/organizations/${orgA}/tickets/${encodeURIComponent(ticketA)}/messages`, { headers: { cookie: cookieB } });
    assert.equal(crossRead.status, 403);
    console.log(JSON.stringify({ oneCase: true, orderedMessages: true, waitingForCustomer: true, followUpReopens: true, multipleAgentResponses: true, immutableHistory: true, draftSeparated: true, thirdTurn: true, concurrentAppend: true, idempotentRetry: true, restartDurability: true, logoutLogin: true, tenantIsolation: true }, null, 2));
    console.log("NC-FIX-002 multi-turn conversation probe passed.");
  } finally {
    if (db._connected) { await cleanup(db); cleaned = true; }
    await db.end().catch(() => undefined);
    server.kill();
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.equal(cleaned, true, "disposable probe data must be cleaned");
}
main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
