/* Focused TODO-P002-04 verification. Creates and removes only disposable auth fixtures. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const scrypt = promisify(crypto.scrypt);
const baseUrl = process.env.AUTH_PROBE_BASE_URL || "http://localhost:3000";
const password = "OrganizationSwitchProbe-password-2026!";
const userId = `organization-switch-probe-${Date.now()}`;
const email = `${userId}@example.test`;
const MAESA = "profile-maesa-tech";
const FASTDROP = "profile-fastdrop-logistics";
const NON_MEMBER = `organization-switch-probe-non-member-${Date.now()}`;
const organizationIds = [FASTDROP, MAESA];
const resources = [
  "knowledge",
  "knowledge-candidates",
  "validation-records",
  "memory-change-records",
  "metrics",
  "intelligence-log",
  "emerging-patterns",
  "tickets"
];

async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

async function request(path, init = {}) {
  return fetch(`${baseUrl}${path}`, init);
}

async function active(method, cookie, body) {
  return request("/api/auth/active-organization", {
    method,
    headers: { cookie, Accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

async function loadOrganization(id, cookie) {
  const profileResponse = await request(`/api/organizations/${id}`, { headers: { cookie } });
  assert.equal(profileResponse.status, 200, `authorized profile load must succeed for ${id}`);
  const profile = (await profileResponse.json()).data;
  assert.equal(profile.id, id, `profile must belong to ${id}`);

  const values = {};
  for (const resource of resources) {
    const response = await request(`/api/organizations/${id}/${resource}`, { headers: { cookie } });
    assert.equal(response.status, 200, `${resource} load must succeed for ${id}`);
    values[resource] = (await response.json()).data;
    if (resource === "metrics") {
      if (values[resource]) assert.equal(values[resource].organizationId, id, `${resource} must belong to ${id}`);
    } else {
      for (const record of values[resource]) {
        const owner = record.organizationId ?? record.orgId;
        if (owner !== undefined) assert.equal(owner, id, `${resource} must not leak another organization's data`);
      }
    }
  }
  const authorityResponse = await request(`/api/organizations/${id}/persistence-authority`, { headers: { cookie } });
  assert.equal(authorityResponse.status, 200, `authority lookup must succeed for ${id}`);
  assert.equal((await authorityResponse.json()).data.authority, "server", `${id} must remain server-authoritative`);
  return { profile, values };
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const before = await db.query('SELECT id, "updatedAt" FROM organizations WHERE id = ANY($1::text[]) ORDER BY id', [organizationIds]);

  try {
    await db.query('INSERT INTO users (id, name, email, "passwordHash", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)', [
      userId,
      "Organization Switch Probe",
      email,
      await passwordHash(password)
    ]);
    await db.query('INSERT INTO organizations (id, name, industry, description, settings, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)', [
      NON_MEMBER,
      "Organization Switch Probe Non-Member",
      "Test",
      "Disposable organization for authorization testing.",
      "{}"
    ]);
    await db.query('INSERT INTO organization_memberships ("userId", "organizationId", role) VALUES ($1, $2, \'member\'), ($1, $3, \'member\')', [userId, MAESA, FASTDROP]);

    const login = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    assert.equal(login.status, 200, "probe user must authenticate");
    const cookie = login.headers.get("set-cookie").split(";", 1)[0];

    const maesaSet = await active("PUT", cookie, { organizationId: MAESA });
    assert.equal(maesaSet.status, 200, "member must switch to Maesa");
    assert.equal((await active("GET", cookie).then((response) => response.json())).data.activeOrganizationId, MAESA);
    const maesa = await loadOrganization(MAESA, cookie);

    const fastDropSet = await active("PUT", cookie, { organizationId: FASTDROP });
    assert.equal(fastDropSet.status, 200, "member must switch to FastDrop");
    assert.equal((await active("GET", cookie).then((response) => response.json())).data.activeOrganizationId, FASTDROP);
    const fastDrop = await loadOrganization(FASTDROP, cookie);
    assert.notEqual(maesa.profile.id, fastDrop.profile.id, "switch must replace the complete organization profile");

    const unauthorized = await active("PUT", cookie, { organizationId: NON_MEMBER });
    assert.equal(unauthorized.status, 403, "non-member switch must be rejected");
    assert.equal((await active("GET", cookie).then((response) => response.json())).data.activeOrganizationId, FASTDROP, "rejected switch must not change active organization");

    const refreshed = await active("GET", cookie);
    assert.equal(refreshed.status, 200, "active organization must survive refresh-style reload");
    assert.equal((await refreshed.json()).data.activeOrganizationId, FASTDROP);

    const after = await db.query('SELECT id, "updatedAt" FROM organizations WHERE id = ANY($1::text[]) ORDER BY id', [organizationIds]);
    assert.deepEqual(after.rows, before.rows, "switching must not modify mature organization data");
    console.log("Organization switching probe passed.");
  } finally {
    await db.query('DELETE FROM organization_memberships WHERE "userId" = $1', [userId]);
    await db.query('DELETE FROM auth_sessions WHERE "userId" = $1', [userId]);
    await db.query("DELETE FROM users WHERE id = $1", [userId]);
    await db.query("DELETE FROM organizations WHERE id = $1", [NON_MEMBER]);
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
