/* TODO-078 focused RBAC, tenant-isolation, audit, and last-owner probe. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const scrypt = promisify(crypto.scrypt);
const baseUrl = process.env.AUTH_PROBE_BASE_URL || "http://localhost:3000";
const password = "TODO078-RBAC-probe-password-2026!";
const suffix = Date.now().toString(36);
const ownerId = `todo078-owner-${suffix}`;
const viewerId = `todo078-viewer-${suffix}`;
const deletedUserId = `todo078-deleted-${suffix}`;
const ownerEmail = `${ownerId}@example.test`;
const viewerEmail = `${viewerId}@example.test`;
const organizationId = "profile-maesa-tech";
const otherOrganizationId = "profile-fastdrop-logistics";

async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

async function login(email) {
  const response = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  assert.equal(response.status, 200, `fixture login must succeed for ${email}`);
  return response.headers.get("set-cookie").split(";", 1)[0];
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const hash = await passwordHash(password);
    await db.query(
      'INSERT INTO users (id, name, email, "passwordHash", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP), ($5, $6, $7, $4, CURRENT_TIMESTAMP), ($8, $9, $10, $4, CURRENT_TIMESTAMP)',
      [ownerId, "TODO078 Owner", ownerEmail, hash, viewerId, "TODO078 Viewer", viewerEmail, deletedUserId, "TODO078 Deleted", `${deletedUserId}@example.test`]
    );
    await db.query(
      'INSERT INTO organization_memberships ("userId", "organizationId", role) VALUES ($1, $3, \'owner\'), ($2, $3, \'viewer\'), ($1, $4, \'owner\')',
      [ownerId, viewerId, organizationId, otherOrganizationId]
    );
    await db.query(
      'INSERT INTO organization_role_assignments (id, "organizationId", "userId", "roleId", "updatedAt") VALUES ($1, $3, $4, \'role_owner\', CURRENT_TIMESTAMP), ($2, $3, $5, \'role_viewer\', CURRENT_TIMESTAMP), ($6, $7, $4, \'role_owner\', CURRENT_TIMESTAMP)',
      [`todo078-assignment-owner-${suffix}`, `todo078-assignment-viewer-${suffix}`, organizationId, ownerId, viewerId, `todo078-assignment-other-${suffix}`, otherOrganizationId]
    );

    const ownerCookie = await login(ownerEmail);
    const viewerCookie = await login(viewerEmail);
    const json = async (response) => response.json();

    let response = await request(`/api/organizations/${organizationId}`);
    assert.equal(response.status, 401, "anonymous requests are unauthenticated");

    response = await request(`/api/organizations/%20`, { headers: { cookie: viewerCookie } });
    assert.equal(response.status, 400, "invalid organization ids are rejected deterministically");

    response = await request(`/api/organizations/${organizationId}/authorization`, { headers: { cookie: viewerCookie } });
    assert.equal(response.status, 200, "viewer can inspect own effective authorization");
    let body = await json(response);
    assert.equal(body.data.role, "viewer");
    assert(body.data.capabilities.includes("organization.read"));
    assert(!body.data.capabilities.includes("organization.members.manage"));

    response = await request(`/api/organizations/${organizationId}`, { headers: { cookie: viewerCookie } });
    assert.equal(response.status, 200, "viewer can read organization-scoped data");

    response = await request(`/api/organizations/${otherOrganizationId}`, { headers: { cookie: viewerCookie } });
    assert.equal(response.status, 403, "tenant isolation rejects an organization without membership");

    response = await request(`/api/organizations/organization-that-does-not-exist`, { headers: { cookie: viewerCookie } });
    assert.equal(response.status, 403, "unknown organizations do not disclose existence to non-members");

    response = await request(`/api/organizations/${organizationId}/audit`, { headers: { cookie: viewerCookie } });
    assert.equal(response.status, 403, "viewer cannot read authorization audit records");

    response = await request(`/api/organizations/${organizationId}/connectors`, {
      method: "POST",
      headers: { cookie: viewerCookie, "content-type": "application/json" },
      body: JSON.stringify({ connectorType: "generic", name: "must-not-create", signingSecret: "probe-secret" })
    });
    assert.equal(response.status, 403, "viewer cannot install connectors");

    response = await request(`/api/organizations/${organizationId}`, {
      method: "PUT",
      headers: { cookie: ownerCookie, "content-type": "application/json" },
      body: "{ malformed"
    });
    assert.equal(response.status, 400, "malformed authenticated requests are client errors");

    const expiredToken = `todo078-expired-${suffix}`;
    await db.query(
      'INSERT INTO auth_sessions (id, "tokenHash", "userId", "expiresAt") VALUES ($1, $2, $3, $4)',
      [`todo078-expired-session-${suffix}`, tokenHash(expiredToken), ownerId, "1970-01-01T00:00:00.000Z"]
    );
    const expiredSession = await db.query('SELECT "expiresAt" FROM auth_sessions WHERE "tokenHash" = $1', [tokenHash(expiredToken)]);
    assert(expiredSession.rows[0].expiresAt < new Date(), "expired fixture must be expired");
    response = await request(`/api/organizations/${organizationId}`, { headers: { cookie: `oip_session=${expiredToken}` } });
    assert.equal(response.status, 401, "expired sessions are unauthenticated");

    const deletedToken = `todo078-deleted-${suffix}`;
    await db.query(
      'INSERT INTO auth_sessions (id, "tokenHash", "userId", "expiresAt") VALUES ($1, $2, $3, $4)',
      [`todo078-deleted-session-${suffix}`, tokenHash(deletedToken), deletedUserId, "2099-01-01T00:00:00.000Z"]
    );
    await db.query('DELETE FROM users WHERE id = $1', [deletedUserId]);
    response = await request(`/api/organizations/${organizationId}`, { headers: { cookie: `oip_session=${deletedToken}` } });
    assert.equal(response.status, 401, "deleted users cannot authenticate with stale sessions");

    response = await request(`/api/organizations/${organizationId}/members/${viewerId}`, {
      method: "PATCH",
      headers: { cookie: ownerCookie, "content-type": "application/json" },
      body: JSON.stringify({ role: "reviewer" })
    });
    assert.equal(response.status, 200, "owner can assign a role");

    response = await request(`/api/organizations/${organizationId}/authorization`, { headers: { cookie: viewerCookie } });
    assert.equal(response.status, 200);
    body = await json(response);
    assert.equal(body.data.role, "reviewer", "role assignment changes effective authorization");
    assert(body.data.capabilities.includes("reflection.approve"));

    response = await request(`/api/organizations/${organizationId}/members/${ownerId}`, {
      method: "PATCH",
      headers: { cookie: ownerCookie, "content-type": "application/json" },
      body: JSON.stringify({ role: "viewer" })
    });
    assert.equal(response.status, 409, "last owner cannot be demoted");

    response = await request(`/api/organizations/${organizationId}/members/${ownerId}`, {
      method: "DELETE",
      headers: { cookie: ownerCookie }
    });
    assert.equal(response.status, 409, "last owner cannot be removed");

    const audit = await db.query(
      'SELECT "capabilityKey", decision, "actorUserId", "organizationId", "requestId", "correlationId", resource FROM authorization_decision_audits WHERE "actorUserId" = $1 AND "organizationId" = $2 ORDER BY "createdAt"',
      [viewerId, organizationId]
    );
    assert(audit.rowCount >= 5, "allow and deny decisions are durably audited");
    assert(audit.rows.some((row) => row.decision === "deny" && row.capabilityKey === "connector.install"));
    assert(audit.rows.every((row) => row.actorUserId === viewerId && row.organizationId === organizationId));
    assert(audit.rows.every((row) => row.requestId && row.resource && !JSON.stringify(row).includes("probe-secret")), "audit rows contain safe metadata only");

    const roleMatrix = await db.query('SELECT r."key", count(rc."capabilityId")::int AS capability_count FROM rbac_roles r LEFT JOIN rbac_role_capabilities rc ON rc."roleId" = r.id GROUP BY r."key" ORDER BY r."key"');
    assert.equal(roleMatrix.rowCount, 6, "all six system roles are durable");
    assert(roleMatrix.rows.every((row) => row.capability_count > 0), "every role has independent capabilities");

    await db.query('DELETE FROM organization_memberships WHERE "userId" = $1 AND "organizationId" = $2', [viewerId, organizationId]);
    response = await request(`/api/organizations/${organizationId}`, { headers: { cookie: viewerCookie } });
    assert.equal(response.status, 403, "removed memberships are forbidden");
    console.log("TODO-078 RBAC probe passed.");
  } finally {
    await db.query('DELETE FROM authorization_decision_audits WHERE "actorUserId" IN ($1, $2, $3)', [ownerId, viewerId, deletedUserId]);
    await db.query('DELETE FROM organization_memberships WHERE "userId" IN ($1, $2, $3)', [ownerId, viewerId, deletedUserId]);
    await db.query('DELETE FROM auth_sessions WHERE "userId" IN ($1, $2, $3)', [ownerId, viewerId, deletedUserId]);
    await db.query("DELETE FROM users WHERE id IN ($1, $2, $3)", [ownerId, viewerId, deletedUserId]);
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
