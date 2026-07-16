/* Focused TODO-P002-03 verification. Creates and removes only disposable auth fixtures. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const scrypt = promisify(crypto.scrypt);
const baseUrl = process.env.AUTH_PROBE_BASE_URL || "http://localhost:3000";
const password = "ActiveOrganizationProbe-password-2026!";
const memberId = `active-org-probe-member-${Date.now()}`;
const emptyId = `active-org-probe-empty-${Date.now()}`;
const memberEmail = `${memberId}@example.test`;
const emptyEmail = `${emptyId}@example.test`;
const MAESA = "profile-maesa-tech";
const FASTDROP = "profile-fastdrop-logistics";
const matureOrganizations = [FASTDROP, MAESA];

async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

async function login(email) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  assert.equal(response.status, 200, `fixture login must succeed for ${email}`);
  return response.headers.get("set-cookie").split(";", 1)[0];
}

async function active(method, cookie, body) {
  return fetch(`${baseUrl}/api/auth/active-organization`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const before = await db.query('SELECT id, "updatedAt" FROM organizations WHERE id = ANY($1::text[]) ORDER BY id', [matureOrganizations]);

  try {
    const hash = await passwordHash(password);
    await db.query('INSERT INTO users (id, name, email, "passwordHash", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP), ($5, $6, $7, $4, CURRENT_TIMESTAMP)', [
      memberId, "Active Organization Probe Member", memberEmail, hash,
      emptyId, "Active Organization Probe Empty", emptyEmail
    ]);
    await db.query('INSERT INTO organization_memberships ("userId", "organizationId", role) VALUES ($1, $2, \'member\'), ($1, $3, \'member\') ON CONFLICT ("userId", "organizationId") DO NOTHING', [memberId, MAESA, FASTDROP]);

    assert.equal((await active("GET")).status, 401, "unauthenticated get must be rejected");
    assert.equal((await active("PUT", undefined, { organizationId: MAESA })).status, 401, "unauthenticated set must be rejected");

    const memberCookie = await login(memberEmail);
    const initial = await active("GET", memberCookie);
    assert.equal(initial.status, 200);
    assert.equal((await initial.json()).data.activeOrganizationId, FASTDROP, "default must choose the first deterministic membership");

    const setMaesa = await active("PUT", memberCookie, { organizationId: MAESA });
    assert.equal(setMaesa.status, 200, "member must set an authorized active organization");
    assert.equal((await setMaesa.json()).data.activeOrganizationId, MAESA);
    const refreshed = await active("GET", memberCookie);
    assert.equal((await refreshed.json()).data.activeOrganizationId, MAESA, "active organization must survive refresh");

    assert.equal((await active("PUT", memberCookie, { organizationId: "profile-does-not-exist" })).status, 404, "unknown organization must return 404");

    await db.query('UPDATE users SET "activeOrganizationId" = $1 WHERE id = $2', [FASTDROP, memberId]);
    await db.query('DELETE FROM organization_memberships WHERE "userId" = $1 AND "organizationId" = $2', [memberId, FASTDROP]);
    const stale = await active("GET", memberCookie);
    assert.equal((await stale.json()).data.activeOrganizationId, MAESA, "unauthorized stale active organization must fall back safely");
    const storedFallback = await db.query('SELECT "activeOrganizationId" FROM users WHERE id = $1', [memberId]);
    assert.equal(storedFallback.rows[0].activeOrganizationId, MAESA, "fallback must be persisted for the user");

    const emptyCookie = await login(emptyEmail);
    const noOrganization = await active("GET", emptyCookie);
    assert.equal(noOrganization.status, 200);
    assert.deepEqual((await noOrganization.json()).data, { activeOrganizationId: null, organization: null }, "no-membership user must receive a clear no-org state");

    const after = await db.query('SELECT id, "updatedAt" FROM organizations WHERE id = ANY($1::text[]) ORDER BY id', [matureOrganizations]);
    assert.deepEqual(after.rows, before.rows, "active organization context must not alter mature organization data");
    console.log("Active organization probe passed.");
  } finally {
    await db.query('DELETE FROM organization_memberships WHERE "userId" IN ($1, $2)', [memberId, emptyId]);
    await db.query("DELETE FROM auth_sessions WHERE \"userId\" IN ($1, $2)", [memberId, emptyId]);
    await db.query("DELETE FROM users WHERE id IN ($1, $2)", [memberId, emptyId]);
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
