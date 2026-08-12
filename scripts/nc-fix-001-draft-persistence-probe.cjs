/*
 * NC-FIX-001 focused regression probe.
 *
 * Uses disposable PostgreSQL rows and the real authenticated HTTP transition
 * path. No AI provider request is made. The probe proves that an in-review
 * generated draft, successive human edits, resume reads, case scoping,
 * tenant authorization, and draft revision conflicts all remain durable.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { promisify } = require("node:util");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

process.env.RATE_LIMIT_HASH_SECRET = process.env.RATE_LIMIT_HASH_SECRET || "nc-fix-001-probe-secret";

const baseUrl = process.env.NC_FIX_001_BASE_URL || "http://127.0.0.1:3401";
const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
const orgA = `nc-fix-001-org-a-${suffix}`;
const orgB = `nc-fix-001-org-b-${suffix}`;
const userA = `nc-fix-001-user-a-${suffix}`;
const userB = `nc-fix-001-user-b-${suffix}`;
const emailA = `${userA}@example.test`;
const emailB = `${userB}@example.test`;
const password = `NC-FIX-001-${suffix}-safe-password!`;
const ticketA = `NC-FIX-001-A-${suffix}`;
const ticketB = `NC-FIX-001-B-${suffix}`;
const generated = `Generated deterministic draft ${suffix}`;
const v1 = `NC-FIX-001-HUMAN-EDIT-${suffix}-v1`;
const v2 = `NC-FIX-001-HUMAN-EDIT-${suffix}-v2`;
const v3 = `NC-FIX-001-HUMAN-EDIT-${suffix}-v3`;
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
  try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
  return { status: response.status, headers: response.headers, body };
}

async function startServer() {
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", new URL(baseUrl).port || "3401"], {
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

async function seed(db) {
  const hash = await passwordHash(password);
  await db.query(
    'insert into organizations (id,name,industry,description,settings,"createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,current_timestamp,current_timestamp), ($6,$7,$8,$9,$5::jsonb,current_timestamp,current_timestamp)',
    [orgA, "NC-FIX-001 Disposable A", "QA", "Draft persistence probe", JSON.stringify({}), orgB, "NC-FIX-001 Disposable B", "QA", "Tenant isolation probe"]
  );
  const users = [[userA, emailA, orgA], [userB, emailB, orgB]];
  for (const [userId, email, organizationId] of users) {
    await db.query(
      'insert into users (id,name,email,"passwordHash","activeOrganizationId","updatedAt") values ($1,$2,$3,$4,$5,current_timestamp)',
      [userId, `NC-FIX-001 ${userId}`, email, hash, organizationId]
    );
    await db.query('insert into organization_memberships ("userId","organizationId",role) values ($1,$2,$3)', [userId, organizationId, "owner"]);
    await db.query(
      'insert into organization_role_assignments (id,"organizationId","userId","roleId","assignedByUserId","updatedAt") select $1,$2,$3,id,$3,current_timestamp from rbac_roles where key=$4',
      [`nc-fix-001-assignment-${userId}`, organizationId, userId, "owner"]
    );
  }
  const tokens = { a: `nc-fix-001-a-${suffix}`, b: `nc-fix-001-b-${suffix}` };
  await db.query(
    'insert into auth_sessions (id,"tokenHash","userId","expiresAt") values ($1,$2,$3,$4),($5,$6,$7,$4)',
    [`nc-fix-001-session-a-${suffix}`, tokenHash(tokens.a), userA, "2099-01-01T00:00:00.000Z", `nc-fix-001-session-b-${suffix}`, tokenHash(tokens.b), userB]
  );
  const classification = JSON.stringify({ category: "Verification", intent: "support", canonicalProblem: "Draft persistence", classifiedBy: "deterministic", confidence: "high" });
  const resolutionA = JSON.stringify({ finalResponse: generated, humanEdited: false, editDistanceNote: null, resolvedAt: null, draftRevision: 1 });
  const resolutionB = JSON.stringify({ finalResponse: "Case B draft", humanEdited: false, editDistanceNote: null, resolvedAt: null, draftRevision: 1 });
  for (const [ticketId, resolution] of [[ticketA, resolutionA], [ticketB, resolutionB]]) {
    await db.query(
      'insert into ticket_records (id,"organizationId","ticketId","rawMessage",subject,status,"draftSource",classification,resolution,reflection,"validationRecordIds",labels,"createdAt") values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,current_timestamp)',
      [`nc-fix-001-row-${ticketId}`, orgA, ticketId, `Disposable case ${ticketId}`, "Draft persistence", "in_review", "deterministic", classification, resolution, JSON.stringify({ decision: null, lessonCreatedId: null, lessonReinforcedId: null, knowledgeChanged: null }), "[]", "[]"]
    );
  }
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
    const initial = await request(`/api/organizations/${orgA}/tickets?full=true`, { headers: { cookie: cookieA } });
    assert.equal(initial.status, 200);
    const initialA = initial.body.data.find((row) => row.ticketId === ticketA);
    assert.equal(initialA.status, "in_review");
    assert.equal(initialA.resolution.finalResponse, generated, "generated draft must be durable before editing");

    const save = async (value, expectedDraftRevision) => request(`/api/organizations/${orgA}/tickets/${encodeURIComponent(ticketA)}/transition`, {
      method: "POST", headers: jsonHeaders(cookieA), body: JSON.stringify({ kind: "save_draft", finalResponse: value, humanEdited: true, expectedDraftRevision })
    });
    assert.equal((await save(v1, 1)).status, 200);
    assert.equal((await save(v2, 2)).status, 200);
    const latest = await save(v3, 3);
    assert.equal(latest.status, 200);
    assert.equal(latest.body.data.resolution.finalResponse, v3);
    assert.equal(latest.body.data.resolution.draftRevision, 4);

    const stale = await save("stale", 3);
    assert.equal(stale.status, 409, "stale draft writes must retain revision protection");
    assert.equal(stale.body.error.code, "REVISION_CONFLICT");

    // A fresh Cases read is the resume boundary used by the UI.
    server.kill();
    await new Promise((resolve) => setTimeout(resolve, 500));
    server = await startServer();
    const loggedOut = await request("/api/auth/logout", { method: "POST", headers: { cookie: cookieA } });
    assert.equal(loggedOut.status, 200, "logout must succeed for the disposable account");
    const loggedIn = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: emailA, password })
    });
    assert.equal(loggedIn.status, 200, "login must succeed for the disposable account");
    const activeCookie = sessionCookie(loggedIn.headers.get("set-cookie").split(";", 1)[0].split("=", 2)[1]);
    const resumed = await request(`/api/organizations/${orgA}/tickets?full=true`, { headers: { cookie: activeCookie } });
    const resumedA = resumed.body.data.find((row) => row.ticketId === ticketA);
    const resumedB = resumed.body.data.find((row) => row.ticketId === ticketB);
    assert.equal(resumedA.resolution.finalResponse, v3, "resume must restore the latest human edit");
    assert.notEqual(resumedB.resolution.finalResponse, v3, "case drafts must not mix");

    const crossTenant = await request(`/api/organizations/${orgA}/tickets?full=true`, { headers: { cookie: cookieB } });
    assert.equal(crossTenant.status, 403, "another organization must not read the draft");
    const crossTransition = await request(`/api/organizations/${orgA}/tickets/${encodeURIComponent(ticketA)}/transition`, {
      method: "POST", headers: jsonHeaders(cookieB), body: JSON.stringify({ kind: "save_draft", finalResponse: "leak", humanEdited: true, expectedDraftRevision: 4 })
    });
    assert.equal(crossTransition.status, 403, "another organization must not write the draft");

    console.log(JSON.stringify({ generatedPersisted: true, humanEditPersisted: true, latestEdit: v3, resumed: true, logoutLogin: true, serverRestart: true, caseIsolation: true, tenantIsolation: true, revisionConflict: true }, null, 2));
    console.log("NC-FIX-001 draft persistence probe passed.");
  } finally {
    if (db._connected) { await cleanup(db); cleaned = true; }
    await db.end().catch(() => undefined);
    server.kill();
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.equal(cleaned, true, "disposable probe data must be cleaned");
}

main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
