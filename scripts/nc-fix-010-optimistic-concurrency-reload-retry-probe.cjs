/* NC-FIX-010: optimistic-concurrency reload/retry recovery probe. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { promisify } = require("node:util");
const { Client } = require("pg");

require("dotenv").config({ path: ".env.local" });

const scrypt = promisify(crypto.scrypt);
const root = path.resolve(__dirname, "..");
const baseUrl = process.env.AUTH_PROBE_BASE_URL || "http://localhost:3000";
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const userA = `nc010-client-a-${suffix}`;
const userB = `nc010-client-b-${suffix}`;
const userU = `nc010-unauthorized-${suffix}`;
const emailA = `${userA}@example.test`;
const emailB = `${userB}@example.test`;
const emailU = `${userU}@example.test`;
const password = "NC-FIX-010-concurrency-probe-password-2026!";
const organizationId = `nc010-org-${suffix}`;
const knowledgeId = `nc010-knowledge-${suffix}`;
const roleA = `nc010-role-a-${suffix}`;
const roleB = `nc010-role-b-${suffix}`;

async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

function request(pathname, init = {}) {
  return fetch(`${baseUrl}${pathname}`, init);
}

async function json(response) {
  return response.json().catch(() => null);
}

async function login(email) {
  const response = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  assert.equal(response.status, 200, `login must succeed for ${email}`);
  return response.headers.get("set-cookie").split(";", 1)[0];
}

function authHeaders(cookie, requestId) {
  return {
    cookie,
    "content-type": "application/json",
    "x-request-id": requestId,
    "x-correlation-id": requestId
  };
}

function sourceContract() {
  const page = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
  const route = fs.readFileSync(path.join(root, "app", "api", "organizations", "[organizationId]", "commits", "validation", "route.ts"), "utf8");
  assert.match(page, /localWorkPreserved/);
  assert.match(page, /Your unsaved review remains available/);
  assert.match(page, /Review the latest version, then retry the original action deliberately/);
  assert.match(page, /generation !== organizationSwitchGeneration\.current/);
  assert.match(page, /console\.warn\(`Expected recoverable persistence conflict/);
  assert.match(route, /safe\.details/);
}

async function main() {
  sourceContract();
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  let cookieA;
  let cookieB;
  try {
    const hash = await passwordHash(password);
    await db.query(
      'INSERT INTO users (id, name, email, "passwordHash", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP), ($5, $6, $7, $4, CURRENT_TIMESTAMP), ($8, $9, $10, $4, CURRENT_TIMESTAMP)',
      [userA, "NC-FIX-010 Client A", emailA, hash, userB, "NC-FIX-010 Client B", emailB, userU, "NC-FIX-010 Unauthorized", emailU]
    );
    await db.query(
      'INSERT INTO organizations (id, name, industry, description, settings, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [organizationId, "NC-FIX-010 Concurrency Probe", "Support", "Disposable optimistic-concurrency recovery fixture.", "{}"]
    );
    await db.query(
      'INSERT INTO organization_memberships ("userId", "organizationId", role) VALUES ($1, $2, \'member\'), ($3, $2, \'member\')',
      [userA, organizationId, userB]
    );
    await db.query(
      'INSERT INTO organization_role_assignments (id, "organizationId", "userId", "roleId", "assignedByUserId", "updatedAt") VALUES ($1, $2, $3, \'role_owner\', $3, CURRENT_TIMESTAMP), ($4, $2, $5, \'role_owner\', $5, CURRENT_TIMESTAMP)',
      [roleA, organizationId, userA, roleB, userB]
    );
    const now = new Date();
    await db.query(
      'INSERT INTO knowledge_items (id, "organizationId", title, category, "sourceTicketId", "timesReused", "createdAt", "approvedAt", content, revision) VALUES ($1, $2, $3, $4, $5, 0, $6, $6, $7::jsonb, 1)',
      [knowledgeId, organizationId, "NC-FIX-010 baseline", "Probe", `nc010-source-${suffix}`, now, JSON.stringify({ problem: "Concurrency recovery", approvedAnswer: "Use the latest revision.", tags: [] })]
    );

    cookieA = await login(emailA);
    cookieB = await login(emailB);
    const knowledgePath = `/api/organizations/${organizationId}/knowledge`;
    const initialAResponse = await request(knowledgePath, { headers: { cookie: cookieA } });
    const initialBResponse = await request(knowledgePath, { headers: { cookie: cookieB } });
    const initialA = (await json(initialAResponse)).data.find((item) => item.id === knowledgeId);
    const initialB = (await json(initialBResponse)).data.find((item) => item.id === knowledgeId);
    assert.equal(initialA.revision, 1);
    assert.equal(initialB.revision, 1);

    const competing = await request(knowledgePath, {
      method: "PUT",
      headers: authHeaders(cookieA, `nc010-competing-${suffix}`),
      body: JSON.stringify([{ ...initialA, title: "Authoritative competing update" }])
    });
    assert.equal(competing.status, 200);

    const localMarker = "NC-FIX-010 LOCAL EDIT";
    const stale = await request(knowledgePath, {
      method: "PUT",
      headers: authHeaders(cookieB, `nc010-stale-${suffix}`),
      body: JSON.stringify([{ ...initialB, title: localMarker }])
    });
    const staleBody = await json(stale);
    assert.equal(stale.status, 409);
    assert.equal(staleBody.error.code, "REVISION_CONFLICT");
    assert.equal(staleBody.error.resourceType, "knowledge");
    assert.equal(staleBody.error.resourceId, knowledgeId);
    assert.equal(staleBody.error.expectedRevision, 1);
    assert.equal(staleBody.error.currentRevision, 2);

    const afterReject = (await json(await request(knowledgePath, { headers: { cookie: cookieB } }))).data.find((item) => item.id === knowledgeId);
    assert.equal(afterReject.title, "Authoritative competing update");
    assert.equal(afterReject.revision, 2);

    // Model the repaired UX contract: Reload latest makes the server snapshot
    // authoritative while retaining the identifiable local work for explicit,
    // deliberate reconciliation. There is no automatic stale replay.
    const latest = (await json(await request(knowledgePath, { headers: { cookie: cookieB } }))).data.find((item) => item.id === knowledgeId);
    assert.equal(latest.revision, 2);
    assert.equal(localMarker, "NC-FIX-010 LOCAL EDIT");
    const retry = await request(knowledgePath, {
      method: "PUT",
      headers: authHeaders(cookieB, `nc010-retry-${suffix}`),
      body: JSON.stringify([{ ...latest, title: localMarker }])
    });
    assert.equal(retry.status, 200);
    const afterRetry = (await json(await request(knowledgePath, { headers: { cookie: cookieA } }))).data.find((item) => item.id === knowledgeId);
    assert.equal(afterRetry.title, localMarker);
    assert.equal(afterRetry.revision, 3);

    const unauthorized = await request(knowledgePath, {
      method: "PUT",
      headers: authHeaders(await login(emailU), `nc010-unauthorized-${suffix}`),
      body: JSON.stringify([{ ...afterRetry, title: "unauthorized" }])
    });
    const unauthorizedBody = await json(unauthorized);
    assert.equal(unauthorized.status, 403);
    assert.equal(unauthorizedBody.error.code, "FORBIDDEN");
    assert.equal(Object.hasOwn(unauthorizedBody.error, "currentRevision"), false);

    const rows = await db.query('SELECT count(*)::int AS count, max(revision)::int AS revision, max(title) AS title FROM knowledge_items WHERE id = $1 AND "organizationId" = $2', [knowledgeId, organizationId]);
    assert.deepEqual(rows.rows[0], { count: 1, revision: 3, title: localMarker });
    console.log("NC-FIX-010 optimistic-concurrency reload/retry probe passed.");
  } finally {
    await db.query('DELETE FROM auth_sessions WHERE "userId" = ANY($1::text[])', [[userA, userB, userU]]);
    await db.query('DELETE FROM users WHERE id = ANY($1::text[])', [[userA, userB, userU]]);
    await db.query('DELETE FROM organizations WHERE id = $1', [organizationId]);
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
