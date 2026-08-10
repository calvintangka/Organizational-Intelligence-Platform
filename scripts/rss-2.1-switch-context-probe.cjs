/* RSS-2.1: source-contract and disposable-fixture regression for switching. */
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
const userId = `rss-21-switch-user-${suffix}`;
const email = `${userId}@example.test`;
const password = "RSS-21-Switch-Context-Probe-password-2026!";
const orgA = `rss-21-switch-a-${suffix}`;
const orgB = `rss-21-switch-b-${suffix}`;
const forbiddenOrg = `rss-21-switch-forbidden-${suffix}`;
const knowledgeId = `rss-21-stale-knowledge-${suffix}`;

async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

function switchFunctionSource() {
  const source = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
  const start = source.indexOf("async function selectOrganization(");
  const end = source.indexOf("async function addOrganization(", start);
  assert.ok(start >= 0 && end > start, "selectOrganization source must be discoverable");
  return source.slice(start, end);
}

function verifySwitchSourceContract() {
  const source = switchFunctionSource();
  for (const forbidden of [
    "persistOrganizationState(",
    ".saveKnowledge(",
    ".saveKnowledgeCandidates(",
    ".saveOrgMetrics(",
    ".saveOrgLog(",
    ".saveEmergingPatterns(",
    ".saveOrganizationProfile("
  ]) {
    assert.equal(source.includes(forbidden), false, `switch must not invoke ${forbidden}`);
  }
  assert.ok(source.indexOf("await flushTicketSaves") < source.indexOf('fetch("/api/auth/active-organization"'), "ticket drain must precede the server transition");
  assert.ok(source.indexOf('fetch("/api/auth/active-organization"') < source.indexOf("await loadOrganizationState"), "server transition must precede target hydration");
  assert.match(source, /serverTransitioned = true/);
  assert.match(source, /window\.location\.reload\(\)/);

  const pageSource = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
  assert.match(pageSource, /suppressHydratedCollectionPersistence\(\)/, "authoritative hydration must suppress echo persistence");
}

async function request(pathname, init = {}) {
  return fetch(`${baseUrl}${pathname}`, init);
}

async function active(cookie, organizationId) {
  return request("/api/auth/active-organization", {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ organizationId })
  });
}

async function main() {
  verifySwitchSourceContract();
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const now = new Date();
    await db.query(
      'INSERT INTO users (id, name, email, "passwordHash", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [userId, "RSS-2.1 Switch Probe", email, await passwordHash(password)]
    );
    for (const [id, name] of [[orgA, "RSS-2.1 Source A"], [orgB, "RSS-2.1 Target B"], [forbiddenOrg, "RSS-2.1 Forbidden"]]) {
      await db.query(
        'INSERT INTO organizations (id, name, industry, description, settings, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [id, name, "Test", "Disposable RSS-2.1 probe fixture", "{}"]
      );
    }
    await db.query(
      'INSERT INTO organization_memberships ("userId", "organizationId", role) VALUES ($1, $2, $3), ($1, $4, $3)',
      [userId, orgA, "member", orgB]
    );
    await db.query(
      'INSERT INTO knowledge_items (id, "organizationId", title, category, "sourceTicketId", "timesReused", "createdAt", "approvedAt", content, revision) VALUES ($1, $2, $3, $4, $5, 0, $6, $6, $7::jsonb, 1)',
      [knowledgeId, orgA, "RSS-2.1 stale write fixture", "Test", "RSS-21-0001", now, JSON.stringify({ problem: "Stale write fixture", approvedAnswer: "Use current revision.", tags: [] })]
    );

    const login = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    assert.equal(login.status, 200, "fixture user must authenticate");
    const cookie = login.headers.get("set-cookie").split(";", 1)[0];

    assert.equal((await active(cookie, orgA)).status, 200, "fixture user must activate source organization");
    const knowledgeResponse = await request(`/api/organizations/${orgA}/knowledge`, { headers: { cookie } });
    assert.equal(knowledgeResponse.status, 200, "source knowledge must load");
    const staleSnapshot = await knowledgeResponse.json();
    assert.equal(staleSnapshot.data[0].revision, 1, "client fixture must hold revision one");

    // Another writer advances the authoritative row. The stale client copy is
    // then used only for the direct-write negative control, never for switching.
    await db.query('UPDATE knowledge_items SET revision = 2, "lastUpdatedAt" = CURRENT_TIMESTAMP WHERE id = $1', [knowledgeId]);
    const staleWrite = await request(`/api/organizations/${orgA}/knowledge`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(staleSnapshot.data)
    });
    assert.equal(staleWrite.status, 409, "direct stale knowledge write must remain rejected");

    const switched = await active(cookie, orgB);
    assert.equal(switched.status, 200, "context transition with stale outgoing knowledge must succeed");
    const activeAfter = await request("/api/auth/active-organization", { headers: { cookie } });
    assert.equal((await activeAfter.json()).data.activeOrganizationId, orgB, "server active organization must match target");
    const targetKnowledge = await request(`/api/organizations/${orgB}/knowledge`, { headers: { cookie } });
    assert.equal(targetKnowledge.status, 200, "target load must remain tenant-scoped");
    assert.deepEqual((await targetKnowledge.json()).data, [], "target must not receive source knowledge");
    const sourceAfter = await db.query('SELECT revision FROM knowledge_items WHERE id = $1', [knowledgeId]);
    assert.equal(sourceAfter.rows[0].revision, 2, "switching must not overwrite newer source knowledge");

    const forbidden = await active(cookie, forbiddenOrg);
    assert.equal(forbidden.status, 403, "unauthorized organization must remain inaccessible");
    const missing = await active(cookie, `rss-21-missing-${suffix}`);
    assert.equal(missing.status, 404, "nonexistent organization must remain inaccessible");
    const finalActive = await request("/api/auth/active-organization", { headers: { cookie } });
    assert.equal((await finalActive.json()).data.activeOrganizationId, orgB, "failed transitions must not replace the valid active organization");

    console.log("RSS-2.1 switch-context probe passed.");
  } finally {
    await db.query('DELETE FROM auth_sessions WHERE "userId" = $1', [userId]);
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
    await db.query('DELETE FROM organizations WHERE id = ANY($1::text[])', [[orgA, orgB, forbiddenOrg]]);
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
