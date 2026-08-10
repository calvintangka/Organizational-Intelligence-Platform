/* RSS-2.5: disposable membership, ownership, RBAC, and limits probe. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

require("dotenv").config({ path: ".env.local" });

const root = path.resolve(__dirname, "..");
const baseUrl = process.env.AUTH_PROBE_BASE_URL || "http://localhost:3000";
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const password = "RSS-25-Membership-Probe-password-2026!";
const demoIds = ["profile-oip-developer-demo", "profile-fastdrop-logistics", "profile-maesa-tech"];
const identityIds = new Set();
const organizationIds = new Set();
const sessionIds = new Set();
let roleAssignmentIds = [];

function email(label) { return `rss-25-${label}-${suffix}@example.test`; }
function key(label) { return `rss-25-${label}-${suffix}`; }
async function request(pathname, init = {}) { return fetch(`${baseUrl}${pathname}`, init); }
async function json(response) { return response.json().catch(() => null); }

function sourceContract() {
  const schema = fs.readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");
  const roleService = fs.readFileSync(path.join(root, "lib", "server", "rbac", "roleService.ts"), "utf8");
  const definitions = fs.readFileSync(path.join(root, "lib", "server", "rbac", "definitions.ts"), "utf8");
  const creation = fs.readFileSync(path.join(root, "lib", "server", "organizationCreationService.ts"), "utf8");
  const memberRoute = fs.readFileSync(path.join(root, "app", "api", "organizations", "[organizationId]", "members", "[userId]", "route.ts"), "utf8");
  assert.match(schema, /@@id\(\[userId, organizationId\]\)/);
  assert.match(roleService, /last organization owner cannot be demoted/);
  assert.match(roleService, /last organization owner cannot be removed/);
  assert.match(definitions, /ROLE_KEYS = \["owner", "administrator"/);
  assert.match(creation, /randomUUID\(\)/);
  assert.match(memberRoute, /organization\.members\.manage/);
  assert.match(memberRoute, /organization\.ownership\.transfer/);
}

async function signup(label) {
  const response = await request("/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: `RSS-2.5 ${label}`, email: email(label.toLowerCase().replace(/[^a-z0-9]+/g, "-")), password })
  });
  const payload = await json(response);
  assert.equal(response.status, 201, `signup ${label} must succeed: ${payload?.error?.message ?? response.status}`);
  assert.deepEqual(Object.keys(payload.data).sort(), ["email", "id", "name"]);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie, "signup must establish an authenticated session");
  identityIds.add(payload.data.id);
  return { user: payload.data, cookie };
}

async function createOrganization(cookie, name, idempotencyKey) {
  const response = await request("/api/organizations", {
    method: "POST",
    headers: { cookie, "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify({ name, industry: "General" })
  });
  const payload = await json(response);
  assert.ok(response.status === 201 || response.status === 200, `organization creation failed: ${payload?.error?.message ?? response.status}`);
  organizationIds.add(payload.data.organization.id);
  return payload.data.organization;
}

async function active(cookie, organizationId) {
  return request("/api/auth/active-organization", {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ organizationId })
  });
}

async function protectedSnapshot(db) {
  const ids = demoIds;
  const queries = [
    ["organizations", "SELECT * FROM organizations WHERE id = ANY($1::text[]) ORDER BY id"],
    ["memberships", 'SELECT * FROM organization_memberships WHERE "organizationId" = ANY($1::text[]) ORDER BY "organizationId", "userId"'],
    ["roles", 'SELECT * FROM organization_role_assignments WHERE "organizationId" = ANY($1::text[]) ORDER BY "organizationId", "userId"'],
    ["authorities", 'SELECT * FROM organization_persistence_authority WHERE "organizationId" = ANY($1::text[]) ORDER BY "organizationId"'],
    ["metrics", 'SELECT * FROM org_metrics WHERE "organizationId" = ANY($1::text[]) ORDER BY "organizationId"'],
    ["sequences", 'SELECT * FROM ticket_sequences WHERE "organizationId" = ANY($1::text[]) ORDER BY "organizationId"'],
    ["knowledge", 'SELECT * FROM knowledge_items WHERE "organizationId" = ANY($1::text[]) ORDER BY "organizationId", id'],
    ["candidates", 'SELECT * FROM knowledge_candidates WHERE "organizationId" = ANY($1::text[]) ORDER BY "organizationId", id'],
    ["validations", 'SELECT * FROM validation_records WHERE "organizationId" = ANY($1::text[]) ORDER BY "organizationId", id'],
    ["memory", 'SELECT * FROM memory_change_records WHERE "organizationId" = ANY($1::text[]) ORDER BY "organizationId", id'],
    ["evidence", 'SELECT * FROM trust_evidence WHERE "organizationId" = ANY($1::text[]) ORDER BY "organizationId", id'],
    ["patterns", 'SELECT * FROM emerging_patterns WHERE "organizationId" = ANY($1::text[]) ORDER BY "organizationId", id'],
    ["tickets", 'SELECT * FROM ticket_records WHERE "organizationId" = ANY($1::text[]) ORDER BY "organizationId", id'],
    ["logs", 'SELECT * FROM intelligence_log WHERE "organizationId" = ANY($1::text[]) ORDER BY "organizationId", id']
  ];
  const snapshot = {};
  for (const [name, query] of queries) snapshot[name] = (await db.query(query, [ids])).rows;
  return crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

async function main() {
  sourceContract();
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const matureBefore = await protectedSnapshot(db);
    const owner = await signup("Owner");
    const other = await signup("Other");

    const ownerOrganizations = await json(await request("/api/organizations", { headers: { cookie: owner.cookie } }));
    assert.deepEqual(ownerOrganizations.data, [], "fresh account must have no memberships");
    for (const demoId of demoIds) {
      assert.equal((await request(`/api/organizations/${demoId}`, { headers: { cookie: owner.cookie } })).status, 403);
      assert.equal((await active(owner.cookie, demoId)).status, 403);
    }

    // Client-controlled identity/authority claims are not part of creation.
    const forged = await request("/api/organizations", {
      method: "POST",
      headers: { cookie: owner.cookie, "content-type": "application/json", "idempotency-key": key("forged") },
      body: JSON.stringify({ name: "Forged", industry: "General", userId: other.user.id, ownerId: other.user.id, role: "owner", organizationId: "profile-oip-developer-demo" })
    });
    assert.equal(forged.status, 400, "organization creation must reject client ownership claims");

    const ownedOrganizations = [];
    for (let index = 1; index <= 5; index += 1) {
      ownedOrganizations.push(await createOrganization(owner.cookie, `RSS-2.5 Org ${index} ${suffix}`, key(`org-${index}`)));
    }
    assert.equal(ownedOrganizations.length, 5);
    const listed = await json(await request("/api/organizations", { headers: { cookie: owner.cookie } }));
    assert.deepEqual(new Set(listed.data.map((organization) => organization.id)), new Set(ownedOrganizations.map((organization) => organization.id)), "all five organizations must remain listed");
    for (const organization of ownedOrganizations) {
      assert.equal((await active(owner.cookie, organization.id)).status, 200, "owner must switch across all organizations");
      assert.equal((await request(`/api/organizations/${organization.id}`, { headers: { cookie: owner.cookie } })).status, 200);
    }

    const ownerMemberships = await db.query('SELECT "organizationId", role FROM organization_memberships WHERE "userId" = $1 ORDER BY "organizationId"', [owner.user.id]);
    assert.equal(ownerMemberships.rowCount, 5, "one user may own at least five organizations");
    assert(ownerMemberships.rows.every((row) => row.role === "owner"));
    const ownerAssignments = await db.query('SELECT m."organizationId", r.key FROM organization_memberships m JOIN organization_role_assignments a ON a."userId" = m."userId" AND a."organizationId" = m."organizationId" JOIN rbac_roles r ON r.id = a."roleId" WHERE m."userId" = $1 ORDER BY m."organizationId"', [owner.user.id]);
    assert.equal(ownerAssignments.rowCount, 5, "creator must receive one Owner assignment per organization");
    assert(ownerAssignments.rows.every((row) => row.key === "owner"));

    const otherOrg = await createOrganization(other.cookie, `RSS-2.5 Other Org ${suffix}`, key("other-org"));
    assert.equal((await request(`/api/organizations/${otherOrg.id}`, { headers: { cookie: owner.cookie } })).status, 403, "Owner of Org A cannot access Org B");
    assert.equal((await request(`/api/organizations/${ownedOrganizations[0].id}`, { headers: { cookie: other.cookie } })).status, 403, "Owner of Org B cannot access Org A");
    assert.equal((await active(other.cookie, ownedOrganizations[0].id)).status, 403, "cross-organization active selection must be rejected");
    assert.equal((await request(`/api/organizations/${ownedOrganizations[0].id}/members/${other.user.id}`, { method: "PATCH", headers: { cookie: other.cookie, "content-type": "application/json" }, body: JSON.stringify({ role: "owner" }) })).status, 403, "non-member cannot forge Owner assignment");
    assert.equal((await request(`/api/organizations/${ownedOrganizations[0].id}/members/${other.user.id}`, { method: "PATCH", headers: { cookie: other.cookie, "content-type": "application/json" }, body: JSON.stringify({ role: "administrator" }) })).status, 403, "non-member cannot forge Admin assignment");

    // Membership creation is not public yet; explicitly seed one disposable
    // member to exercise the existing role mutation and final-owner guards.
    const testOrganizationId = ownedOrganizations[0].id;
    await db.query('INSERT INTO organization_memberships ("userId", "organizationId", role) VALUES ($1, $2, \'member\')', [other.user.id, testOrganizationId]);
    const assignmentId = `rss25-assignment-${suffix}`;
    roleAssignmentIds.push(assignmentId);
    await db.query('INSERT INTO organization_role_assignments (id, "organizationId", "userId", "roleId", "assignedByUserId", "updatedAt") VALUES ($1, $2, $3, \'role_viewer\', $4, CURRENT_TIMESTAMP)', [assignmentId, testOrganizationId, other.user.id, owner.user.id]);
    const ownerTransfer = await request(`/api/organizations/${testOrganizationId}/members/${other.user.id}`, { method: "PATCH", headers: { cookie: owner.cookie, "content-type": "application/json" }, body: JSON.stringify({ role: "owner" }) });
    assert.equal(ownerTransfer.status, 200, "Owner may explicitly assign a second Owner to an existing member");
    const twoOwners = await db.query('SELECT COUNT(*)::int AS count FROM organization_role_assignments WHERE "organizationId" = $1 AND "roleId" = \'role_owner\'', [testOrganizationId]);
    assert.equal(twoOwners.rows[0].count, 2, "multiple Owners are supported by the current contract");
    const demoteOwner = await request(`/api/organizations/${testOrganizationId}/members/${owner.user.id}`, { method: "PATCH", headers: { cookie: other.cookie, "content-type": "application/json" }, body: JSON.stringify({ role: "administrator" }) });
    assert.equal(demoteOwner.status, 200, "one Owner may demote another when another Owner remains");
    assert.equal((await request(`/api/organizations/${testOrganizationId}/members/${other.user.id}`, { method: "PATCH", headers: { cookie: other.cookie, "content-type": "application/json" }, body: JSON.stringify({ role: "viewer" }) })).status, 409, "last Owner cannot be demoted");
    assert.equal((await request(`/api/organizations/${testOrganizationId}/members/${other.user.id}`, { method: "DELETE", headers: { cookie: other.cookie } })).status, 409, "last Owner cannot be removed");
    assert.equal((await request(`/api/organizations/${testOrganizationId}/members/${owner.user.id}`, { method: "PATCH", headers: { cookie: owner.cookie, "content-type": "application/json" }, body: JSON.stringify({ role: "owner" }) })).status, 403, "demoted Administrator cannot grant ownership");

    // Database uniqueness is the duplicate-membership invariant; the second
    // logical membership insert must fail rather than create another row.
    await assert.rejects(
      () => db.query('INSERT INTO organization_memberships ("userId", "organizationId", role) VALUES ($1, $2, \'member\')', [other.user.id, testOrganizationId]),
      (error) => error?.code === "23505"
    );
    const duplicateCount = await db.query('SELECT COUNT(*)::int AS count FROM organization_memberships WHERE "userId" = $1 AND "organizationId" = $2', [other.user.id, testOrganizationId]);
    assert.equal(duplicateCount.rows[0].count, 1, "duplicate membership must remain one logical row");

    const audit = await db.query('SELECT COUNT(*)::int AS count FROM authorization_decision_audits WHERE "organizationId" = $1 AND "actorUserId" = $2', [testOrganizationId, owner.user.id]);
    assert(audit.rows[0].count > 0, "role and authorization decisions must remain auditable");
    const matureAfter = await protectedSnapshot(db);
    assert.equal(matureAfter, matureBefore, "protected mature organization state changed during probe");
    console.log("RSS-2.5 membership ownership limits probe passed.");
  } finally {
    if (roleAssignmentIds.length) await db.query('DELETE FROM organization_role_assignments WHERE id = ANY($1::text[])', [roleAssignmentIds]);
    if (sessionIds.size) await db.query('DELETE FROM auth_sessions WHERE id = ANY($1::text[])', [[...sessionIds]]);
    if (identityIds.size) await db.query('DELETE FROM auth_sessions WHERE "userId" = ANY($1::text[])', [[...identityIds]]);
    if (organizationIds.size) await db.query('DELETE FROM organizations WHERE id = ANY($1::text[])', [[...organizationIds]]);
    if (identityIds.size) await db.query('DELETE FROM users WHERE id = ANY($1::text[])', [[...identityIds]]);
    await db.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
