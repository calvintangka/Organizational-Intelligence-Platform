/* Focused stale organization-profile overwrite regression probe. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const scrypt = promisify(crypto.scrypt);
const baseUrl = process.env.AUTH_PROBE_BASE_URL || "http://localhost:3000";
const suffix = Date.now();
const userId = `stale-profile-probe-${suffix}`;
const organizationId = `stale-profile-probe-org-${suffix}`;
const email = `${userId}@example.test`;
const password = "StaleProfileProbe-password-2026!";

async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

async function request(path, init = {}) {
  return fetch(`${baseUrl}${path}`, init);
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const settings = {
    products: ["Probe Console"],
    services: ["Probe Support"],
    supportedDomains: ["probe operations"],
    businessVocabulary: ["probe vocabulary"],
    supportedIssueTypes: ["probe issue"],
    outOfScopeTopics: [],
    customerTone: "professional",
    supportBoundaries: [],
    autoResolutionThreshold: 80,
    escalationRules: []
  };

  try {
    await db.query(
      'INSERT INTO users (id, name, email, "passwordHash", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [userId, "Stale Profile Probe", email, await passwordHash(password)]
    );
    await db.query(
      'INSERT INTO organizations (id, name, industry, description, settings, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [organizationId, "Stale Profile Probe Organization", "Testing", "Disposable profile concurrency fixture.", JSON.stringify(settings)]
    );
    await db.query('INSERT INTO organization_memberships ("userId", "organizationId", role) VALUES ($1, $2, \'member\')', [userId, organizationId]);

    const login = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    assert.equal(login.status, 200, "probe user must authenticate");
    const cookie = login.headers.get("set-cookie").split(";", 1)[0];

    const loaded = await request(`/api/organizations/${organizationId}`, { headers: { cookie } });
    assert.equal(loaded.status, 200);
    const original = (await loaded.json()).data;
    const stale = {
      ...original,
      products: [],
      services: [],
      supportedDomains: [],
      businessVocabulary: [],
      updatedAt: new Date(new Date(original.updatedAt).getTime() - 1000).toISOString()
    };

    const authoritativeUpdate = await request(`/api/organizations/${organizationId}`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ ...original, description: "Authoritative populated profile." })
    });
    assert.equal(authoritativeUpdate.status, 200, "legitimate profile update must persist");
    await authoritativeUpdate.json();

    const staleWrite = await request(`/api/organizations/${organizationId}`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(stale)
    });
    assert.equal(staleWrite.status, 409, "older profile snapshot must be rejected");

    const afterStale = await request(`/api/organizations/${organizationId}`, { headers: { cookie } });
    const preserved = (await afterStale.json()).data;
    assert.deepEqual(preserved.products, settings.products);
    assert.deepEqual(preserved.services, settings.services);
    assert.deepEqual(preserved.supportedDomains, settings.supportedDomains);
    assert.deepEqual(preserved.businessVocabulary, settings.businessVocabulary);

    const legitimateEdit = await request(`/api/organizations/${organizationId}`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ ...preserved, description: "Legitimate edit after stale write." })
    });
    assert.equal(legitimateEdit.status, 200, "legitimate edit after rejection must persist");
    const finalProfile = (await (await request(`/api/organizations/${organizationId}`, { headers: { cookie } })).json()).data;
    assert.equal(finalProfile.description, "Legitimate edit after stale write.");
    assert.deepEqual(finalProfile.businessVocabulary, settings.businessVocabulary);
    console.log("Stale organization profile overwrite probe passed.");
  } finally {
    await db.query('DELETE FROM organization_memberships WHERE "userId" = $1', [userId]);
    await db.query('DELETE FROM auth_sessions WHERE "userId" = $1', [userId]);
    await db.query("DELETE FROM users WHERE id = $1", [userId]);
    await db.query("DELETE FROM organizations WHERE id = $1", [organizationId]);
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
