/* RSS-2.6: disposable multi-client optimistic-concurrency acceptance probe. */
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
const userA = `rss-26-user-a-${suffix}`;
const userB = `rss-26-user-b-${suffix}`;
const userU = `rss-26-user-u-${suffix}`;
const emailA = `${userA}@example.test`;
const emailB = `${userB}@example.test`;
const emailU = `${userU}@example.test`;
const password = "RSS-26-Concurrency-Probe-password-2026!";
const orgA = `rss-26-org-a-${suffix}`;
const orgB = `rss-26-org-b-${suffix}`;
const knowledgeA = `rss-26-knowledge-a-${suffix}`;
const knowledgeB = `rss-26-knowledge-b-${suffix}`;
const burstKnowledge = `rss-26-knowledge-burst-${suffix}`;
const matureOrganizations = ["profile-oip-developer-demo", "profile-fastdrop-logistics", "profile-maesa-tech"];

async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

function sourceContract() {
  const page = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
  const start = page.indexOf("async function selectOrganization(");
  const end = page.indexOf("async function addOrganization(", start);
  assert.ok(start >= 0 && end > start, "selectOrganization source must be discoverable");
  const switchSource = page.slice(start, end);
  assert.equal(switchSource.includes("persistOrganizationState("), false, "switch must not snapshot-flush the outgoing organization");
  assert.equal(switchSource.includes("saveKnowledge("), false, "switch must not write outgoing knowledge");
  assert.match(fs.readFileSync(path.join(root, "lib", "server", "persistenceService.ts"), "utf8"), /REVISION_CONFLICT/);
  assert.match(fs.readFileSync(path.join(root, "lib", "persistence", "serverPersistenceAdapter.ts"), "utf8"), /currentRevision/);
  assert.match(page, /Reload latest/);
}

async function request(pathname, init = {}) {
  return fetch(`${baseUrl}${pathname}`, init);
}

async function login(email) {
  const response = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `rss26-login-${suffix}` },
    body: JSON.stringify({ email, password })
  });
  assert.equal(response.status, 200, `login must succeed for ${email}`);
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie, "login must return a session cookie");
  return cookie.split(";", 1)[0];
}

async function json(response) {
  return response.json().catch(() => null);
}

async function digestMature(db) {
  const tables = [
    ["organizations", 'SELECT * FROM organizations WHERE id = ANY($1::text[])'],
    ["organization_memberships", 'SELECT * FROM organization_memberships WHERE "organizationId" = ANY($1::text[])'],
    ["organization_role_assignments", 'SELECT * FROM organization_role_assignments WHERE "organizationId" = ANY($1::text[])'],
    ["knowledge_items", 'SELECT * FROM knowledge_items WHERE "organizationId" = ANY($1::text[])'],
    ["knowledge_candidates", 'SELECT * FROM knowledge_candidates WHERE "organizationId" = ANY($1::text[])'],
    ["validation_records", 'SELECT * FROM validation_records WHERE "organizationId" = ANY($1::text[])'],
    ["memory_change_records", 'SELECT * FROM memory_change_records WHERE "organizationId" = ANY($1::text[])'],
    ["ticket_records", 'SELECT * FROM ticket_records WHERE "organizationId" = ANY($1::text[])'],
    ["org_metrics", 'SELECT * FROM org_metrics WHERE "organizationId" = ANY($1::text[])'],
    ["intelligence_log", 'SELECT * FROM intelligence_log WHERE "organizationId" = ANY($1::text[])'],
    ["emerging_patterns", 'SELECT * FROM emerging_patterns WHERE "organizationId" = ANY($1::text[])'],
    ["organization_persistence_authority", 'SELECT * FROM organization_persistence_authority WHERE "organizationId" = ANY($1::text[])']
  ];
  const snapshot = {};
  for (const [name, query] of tables) {
    const rows = (await db.query(query, [matureOrganizations])).rows;
    snapshot[name] = rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

function knowledgePayload(item, title) {
  return { ...item, title, organizationId: item.organizationId };
}

async function main() {
  sourceContract();
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  let matureBefore;
  let cookieA;
  let cookieB;
  try {
    matureBefore = await digestMature(db);
    const hash = await passwordHash(password);
    await db.query(
      'INSERT INTO users (id, name, email, "passwordHash", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP), ($5, $6, $7, $4, CURRENT_TIMESTAMP), ($8, $9, $10, $4, CURRENT_TIMESTAMP)',
      [userA, "RSS-2.6 Client A", emailA, hash, userB, "RSS-2.6 Client B", emailB, userU, "RSS-2.6 Unauthorized", emailU]
    );
    for (const [id, name] of [[orgA, "RSS-2.6 Concurrency A"], [orgB, "RSS-2.6 Isolation B"]]) {
      await db.query(
        'INSERT INTO organizations (id, name, industry, description, settings, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [id, name, "Probe", "Disposable RSS-2.6 concurrency fixture", "{}"]
      );
    }
    await db.query(
      'INSERT INTO organization_memberships ("userId", "organizationId", role) VALUES ($1, $2, $3), ($1, $4, $3), ($5, $2, $3)',
      [userA, orgA, "member", orgB, userB]
    );
    await db.query(
      'INSERT INTO organization_role_assignments (id, "organizationId", "userId", "roleId", "assignedByUserId", "updatedAt") VALUES ($1, $2, $3, $4, $3, CURRENT_TIMESTAMP), ($5, $6, $3, $4, $3, CURRENT_TIMESTAMP), ($7, $2, $8, $4, $3, CURRENT_TIMESTAMP)',
      [`rsa-${suffix}-a`, orgA, userA, "role_owner", `rsa-${suffix}-b`, orgB, `rsa-${suffix}-c`, userB]
    );
    const now = new Date();
    const content = JSON.stringify({ problem: "Concurrent probe", approvedAnswer: "Use the current revision.", tags: [] });
    await db.query(
      'INSERT INTO knowledge_items (id, "organizationId", title, category, "sourceTicketId", "timesReused", "createdAt", "approvedAt", content, revision) VALUES ($1, $2, $3, $4, $5, 0, $6, $6, $7::jsonb, 1), ($8, $2, $9, $4, $10, 0, $6, $6, $7::jsonb, 1), ($11, $2, $12, $4, $13, 0, $6, $6, $7::jsonb, 1), ($14, $15, $16, $4, $17, 0, $6, $6, $7::jsonb, 1)',
      [knowledgeA, orgA, "RSS-2.6 A", "Probe", `rss26-ticket-a-${suffix}`, now, content, knowledgeB, "RSS-2.6 B", `rss26-ticket-b-${suffix}`, burstKnowledge, "RSS-2.6 Burst", `rss26-ticket-burst-${suffix}`, `rss26-knowledge-orgb-${suffix}`, orgB, "RSS-2.6 Org B", `rss26-ticket-orgb-${suffix}`]
    );

    cookieA = await login(emailA);
    cookieB = await login(emailB);
    const authHeaders = (cookie, requestId) => ({ cookie, "content-type": "application/json", "x-request-id": requestId, "x-correlation-id": requestId });
    const list = await request(`/api/organizations/${orgA}/knowledge`, { headers: { cookie: cookieA } });
    assert.equal(list.status, 200);
    const firstPayload = await json(list);
    const firstSnapshot = firstPayload.data.find((item) => item.id === knowledgeA);
    assert.ok(firstSnapshot, "client A must load the disposable knowledge item");
    assert.equal(firstSnapshot.revision, 1, "both clients must start at revision N");
    const secondList = await request(`/api/organizations/${orgA}/knowledge`, { headers: { cookie: cookieB } });
    const secondPayload = await json(secondList);
    const secondSnapshot = secondPayload.data.find((item) => item.id === knowledgeA);
    assert.equal(secondSnapshot.revision, 1);

    const firstWrite = await request(`/api/organizations/${orgA}/knowledge`, { method: "PUT", headers: authHeaders(cookieA, `rss26-first-${suffix}`), body: JSON.stringify(secondPayload.data.map((item) => item.id === knowledgeA ? knowledgePayload(item, "A authoritative update") : item)) });
    assert.equal(firstWrite.status, 200, "first concurrent writer must succeed");
    const staleWrite = await request(`/api/organizations/${orgA}/knowledge`, { method: "PUT", headers: authHeaders(cookieB, `rss26-stale-${suffix}`), body: JSON.stringify(secondPayload.data.map((item) => item.id === knowledgeA ? knowledgePayload(item, "B stale update") : item)) });
    const staleBody = await json(staleWrite);
    assert.equal(staleWrite.status, 409, "second stale writer must receive HTTP 409");
    assert.equal(staleBody.error.code, "REVISION_CONFLICT");
    assert.equal(staleBody.error.resourceType, "knowledge");
    assert.equal(staleBody.error.resourceId, knowledgeA);
    assert.equal(staleBody.error.expectedRevision, 1);
    assert.equal(staleBody.error.currentRevision, 2);
    assert.equal(staleBody.error.requestId, `rss26-stale-${suffix}`);

    const afterStale = (await json(await request(`/api/organizations/${orgA}/knowledge`, { headers: { cookie: cookieB } }))).data.find((item) => item.id === knowledgeA);
    assert.equal(afterStale.title, "A authoritative update");
    assert.equal(afterStale.revision, 2, "rejected stale write must not increment revision");
    const reloadPayload = await json(await request(`/api/organizations/${orgA}/knowledge`, { headers: { cookie: cookieB } }));
    const retry = await request(`/api/organizations/${orgA}/knowledge`, { method: "PUT", headers: authHeaders(cookieB, `rss26-retry-${suffix}`), body: JSON.stringify(reloadPayload.data.map((item) => item.id === knowledgeA ? knowledgePayload(item, "B intentional retry") : item)) });
    assert.equal(retry.status, 200, "retry from reloaded revision must succeed");
    const afterRetry = (await json(await request(`/api/organizations/${orgA}/knowledge`, { headers: { cookie: cookieA } }))).data.find((item) => item.id === knowledgeA);
    assert.equal(afterRetry.title, "B intentional retry");
    assert.equal(afterRetry.revision, 3);

    const unrelatedPayload = await json(await request(`/api/organizations/${orgA}/knowledge`, { headers: { cookie: cookieA } }));
    const unrelated = unrelatedPayload.data.find((item) => item.id === knowledgeB);
    const unrelatedWrite = await request(`/api/organizations/${orgA}/knowledge`, { method: "PUT", headers: authHeaders(cookieA, `rss26-unrelated-${suffix}`), body: JSON.stringify(unrelatedPayload.data.map((item) => item.id === knowledgeB ? knowledgePayload(item, "Unrelated remains writable") : item)) });
    assert.equal(unrelatedWrite.status, 200, "unrelated resource must remain writable");

    const burstPayload = await json(await request(`/api/organizations/${orgA}/knowledge`, { headers: { cookie: cookieA } }));
    const burstBase = burstPayload.data.find((item) => item.id === burstKnowledge);
    const burstResponses = await Promise.all(Array.from({ length: 10 }, (_, index) => request(`/api/organizations/${orgA}/knowledge`, { method: "PUT", headers: authHeaders(cookieA, `rss26-burst-${index}-${suffix}`), body: JSON.stringify(burstPayload.data.map((item) => item.id === burstKnowledge ? knowledgePayload(item, `burst-${index}`) : item)) })));
    assert.equal(burstResponses.filter((response) => response.status === 200).length, 1, "same-revision burst must have exactly one winner");
    assert.equal(burstResponses.filter((response) => response.status === 409).length, 9, "same-revision burst losers must be controlled conflicts");
    const burstFinal = (await json(await request(`/api/organizations/${orgA}/knowledge`, { headers: { cookie: cookieA } }))).data.find((item) => item.id === burstKnowledge);
    assert.equal(burstFinal.revision, burstBase.revision + 1, "burst winner must advance only one revision from its baseline");

    const forbidden = await request(`/api/organizations/${orgA}/knowledge`, { method: "PUT", headers: { cookie: await login(emailU), "content-type": "application/json" }, body: JSON.stringify([knowledgePayload(afterRetry, "unauthorized probe")]) });
    const forbiddenBody = await json(forbidden);
    assert.equal(forbidden.status, 403, "unauthorized caller must be rejected before revision comparison");
    assert.equal(forbiddenBody.error.code, "FORBIDDEN");
    assert.equal(Object.hasOwn(forbiddenBody.error, "currentRevision"), false, "unauthorized response must not expose revision details");
    const expired = await request(`/api/organizations/${orgA}/knowledge`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify([knowledgePayload(afterRetry, "expired probe")]) });
    assert.equal(expired.status, 401, "missing session must be authentication failure");

    const crossOrg = (await json(await request(`/api/organizations/${orgB}/knowledge`, { headers: { cookie: cookieA } }))).data[0];
    const crossWrite = await request(`/api/organizations/${orgB}/knowledge`, { method: "PUT", headers: authHeaders(cookieA, `rss26-cross-org-${suffix}`), body: JSON.stringify([knowledgePayload(crossOrg, "Org B remains independent")]) });
    assert.equal(crossWrite.status, 200, "Org B must remain writable after Org A conflict");
    const finalRows = await db.query('SELECT id, "organizationId", revision, title FROM knowledge_items WHERE id = ANY($1::text[]) ORDER BY id', [[knowledgeA, knowledgeB, burstKnowledge]]);
    assert.equal(finalRows.rows.filter((row) => row.organizationId === orgA).length, 3, "no duplicate Org A resources");
    assert.equal((await db.query('SELECT revision FROM knowledge_items WHERE id = $1', [knowledgeA])).rows[0].revision, 5);
    assert.ok((await db.query('SELECT count(*)::int AS count FROM authorization_decision_audits WHERE "organizationId" = $1', [orgA])).rows[0].count > 0, "authorization diagnostics must exist");

    const matureAfter = await digestMature(db);
    assert.equal(matureAfter, matureBefore, "protected mature data must remain unchanged");
    console.log("RSS-2.6 concurrent client revision observability probe passed.");
  } finally {
    await db.query('DELETE FROM auth_sessions WHERE "userId" = ANY($1::text[])', [[userA, userB, userU]]);
    await db.query('DELETE FROM users WHERE id = ANY($1::text[])', [[userA, userB, userU]]);
    await db.query('DELETE FROM organizations WHERE id = ANY($1::text[])', [[orgA, orgB]]);
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
