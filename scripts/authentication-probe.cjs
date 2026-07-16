/* Focused TODO-P002-01 verification. Creates and removes only its own test user. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const scrypt = promisify(crypto.scrypt);
const baseUrl = process.env.AUTH_PROBE_BASE_URL || "http://localhost:3000";
const email = `auth-probe-${Date.now()}@example.test`;
const password = "AuthProbe-password-2026!";
const organizationIds = ["profile-fastdrop-logistics", "profile-maesa-tech", "profile-pramana-legal"];

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
  const before = await db.query('SELECT id, "updatedAt" FROM organizations WHERE id = ANY($1::text[]) ORDER BY id', [organizationIds]);
  const userId = `auth-probe-${Date.now()}`;

  try {
    await db.query('INSERT INTO users (id, name, email, "passwordHash", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)', [userId, "Authentication Probe", email, await passwordHash(password)]);

    const unauthenticated = await request("/api/auth/me");
    assert.equal(unauthenticated.status, 401, "unauthenticated identity lookup must be rejected");

    const login = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    assert.equal(login.status, 200, "valid credentials must authenticate");
    const cookieHeader = login.headers.get("set-cookie");
    assert.ok(cookieHeader, "login must create a persistent session cookie");
    const cookie = cookieHeader.split(";", 1)[0];

    const authenticated = await request("/api/auth/me", { headers: { cookie } });
    assert.equal(authenticated.status, 200, "authenticated identity lookup must succeed");
    assert.deepEqual((await authenticated.json()).data, { id: userId, name: "Authentication Probe", email });

    const refreshed = await request("/api/auth/me", { headers: { cookie } });
    assert.equal(refreshed.status, 200, "session must survive a refresh-style request");

    const logout = await request("/api/auth/logout", { method: "POST", headers: { cookie } });
    assert.equal(logout.status, 200, "logout must succeed");
    const afterLogout = await request("/api/auth/me", { headers: { cookie } });
    assert.equal(afterLogout.status, 401, "logout must invalidate the session");

    const after = await db.query('SELECT id, "updatedAt" FROM organizations WHERE id = ANY($1::text[]) ORDER BY id', [organizationIds]);
    assert.deepEqual(after.rows, before.rows, "authentication must not alter mature organization data");
    console.log("Authentication foundation probe passed.");
  } finally {
    await db.query("DELETE FROM auth_sessions WHERE \"userId\" = $1", [userId]);
    await db.query("DELETE FROM users WHERE id = $1", [userId]);
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
