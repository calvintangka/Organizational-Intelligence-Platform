/* Focused TODO-P002-02 verification. Creates and removes only disposable auth fixtures. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const scrypt = promisify(crypto.scrypt);
const baseUrl = process.env.AUTH_PROBE_BASE_URL || "http://localhost:3000";
const password = "MembershipProbe-password-2026!";
const memberId = `membership-probe-member-${Date.now()}`;
const maesaOnlyId = `membership-probe-maesa-only-${Date.now()}`;
const memberEmail = `${memberId}@example.test`;
const maesaOnlyEmail = `${maesaOnlyId}@example.test`;
const MAESA = "profile-maesa-tech";
const FASTDROP = "profile-fastdrop-logistics";
const PRAMANA = "profile-pramana-legal";
const matureOrganizations = [FASTDROP, MAESA, PRAMANA];

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

async function getOrganization(id, cookie) {
  return fetch(`${baseUrl}/api/organizations/${id}`, cookie ? { headers: { cookie } } : {});
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const before = await db.query('SELECT id, "updatedAt" FROM organizations WHERE id = ANY($1::text[]) ORDER BY id', [matureOrganizations]);

  try {
    const hash = await passwordHash(password);
    await db.query('INSERT INTO users (id, name, email, "passwordHash", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP), ($5, $6, $7, $4, CURRENT_TIMESTAMP)', [
      memberId, "Membership Probe Member", memberEmail, hash,
      maesaOnlyId, "Membership Probe Maesa Only", maesaOnlyEmail
    ]);
    await db.query('INSERT INTO organization_memberships ("userId", "organizationId", role) VALUES ($1, $2, $3), ($1, $4, $3), ($5, $2, $3) ON CONFLICT ("userId", "organizationId") DO NOTHING', [memberId, MAESA, "member", FASTDROP, maesaOnlyId]);

    assert.equal((await getOrganization(MAESA)).status, 401, "unauthenticated organization access must be rejected");

    const memberCookie = await login(memberEmail);
    assert.equal((await getOrganization(MAESA, memberCookie)).status, 200, "member must access Maesa");
    assert.equal((await getOrganization(FASTDROP, memberCookie)).status, 200, "member must access FastDrop");
    const memberOrganizations = await fetch(`${baseUrl}/api/organizations`, { headers: { cookie: memberCookie } });
    assert.equal(memberOrganizations.status, 200);
    const memberOrganizationIds = (await memberOrganizations.json()).data.map((organization) => organization.id);
    assert.deepEqual(memberOrganizationIds, [FASTDROP, MAESA], "organization list must contain only memberships");

    const maesaOnlyCookie = await login(maesaOnlyEmail);
    assert.equal((await getOrganization(MAESA, maesaOnlyCookie)).status, 200, "Maesa member must access Maesa");
    assert.equal((await getOrganization(FASTDROP, maesaOnlyCookie)).status, 403, "Maesa membership must not grant FastDrop access");
    assert.equal((await getOrganization(PRAMANA, maesaOnlyCookie)).status, 403, "non-member must not access Pramana");

    const after = await db.query('SELECT id, "updatedAt" FROM organizations WHERE id = ANY($1::text[]) ORDER BY id', [matureOrganizations]);
    assert.deepEqual(after.rows, before.rows, "authorization must not alter mature organization data");
    console.log("Membership authorization probe passed.");
  } finally {
    await db.query('DELETE FROM organization_memberships WHERE "userId" IN ($1, $2)', [memberId, maesaOnlyId]);
    await db.query("DELETE FROM auth_sessions WHERE \"userId\" IN ($1, $2)", [memberId, maesaOnlyId]);
    await db.query("DELETE FROM users WHERE id IN ($1, $2)", [memberId, maesaOnlyId]);
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
