/* RSS-2.2: disposable HTTP acceptance probe for tenant provisioning. */
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
const userA = `rss-22-owner-${suffix}`;
const userB = `rss-22-outsider-${suffix}`;
const emailA = `${userA}@example.test`;
const emailB = `${userB}@example.test`;
const password = "RSS-22-Organization-Creation-Probe-password-2026!";
const createdOrganizationIds = new Set();
const rollbackName = `RSS-2.2 Rollback ${suffix}`;

async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

async function request(pathname, init = {}) {
  return fetch(`${baseUrl}${pathname}`, init);
}

async function login(email) {
  const response = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  assert.equal(response.status, 200, `${email} must authenticate`);
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie, "login must set a session cookie");
  return cookie.split(";", 1)[0];
}

function key(label) {
  return `rss-22-${label}-${suffix}`;
}

async function create(cookie, body, idempotencyKey) {
  return request("/api/organizations", {
    method: "POST",
    headers: { cookie, "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify(body)
  });
}

async function created(response, message) {
  const payload = await response.json();
  assert.ok(response.status === 200 || response.status === 201, `${message}: ${response.status} ${payload?.error?.message ?? "unknown error"}`);
  assert.ok(payload?.data?.organization?.id, `${message}: response must include server organization`);
  createdOrganizationIds.add(payload.data.organization.id);
  return payload.data;
}

function verifySourceContract() {
  const route = fs.readFileSync(path.join(root, "app", "api", "organizations", "route.ts"), "utf8");
  const service = fs.readFileSync(path.join(root, "lib", "server", "organizationCreationService.ts"), "utf8");
  const view = fs.readFileSync(path.join(root, "components", "views", "OrganizationView.tsx"), "utf8");
  assert.match(route, /export async function POST/);
  assert.match(route, /requireAuthenticatedUser\(\)/);
  assert.match(route, /idempotency-key/);
  assert.match(service, /prisma\.\$transaction/);
  assert.match(service, /isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(service, /organizationMembership\.create/);
  assert.match(service, /organizationRoleAssignment\.create/);
  assert.match(service, /orgMetrics\.create/);
  assert.match(service, /ticketSequence\.create/);
  assert.match(service, /organizationPersistenceAuthority\.create/);
  assert.match(service, /authorizationDecisionAudit\.create/);
  assert.match(service, /organizationCreationRequest\.create/);
  assert.equal(view.includes("Date.now().toString(36)"), false, "UI must not fabricate an organization ID");
}

async function expectStatus(response, expected, message) {
  assert.equal(response.status, expected, message);
  return response.json().catch(() => null);
}

async function main() {
  verifySourceContract();
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  let triggerInstalled = false;
  let installedTriggerName = null;
  let installedFunctionName = null;
  await db.connect();
  try {
    await db.query(
      'INSERT INTO users (id, name, email, "passwordHash", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP), ($5, $6, $7, $4, CURRENT_TIMESTAMP)',
      [userA, "RSS-2.2 Owner", emailA, await passwordHash(password), userB, "RSS-2.2 Outsider", emailB]
    );

    await expectStatus(await create("", { name: "Unauthenticated" }, key("anonymous")), 401, "unauthenticated creation must be rejected");
    const cookieA = await login(emailA);
    const cookieB = await login(emailB);

    const primaryRequest = { name: `NusaCloud ${suffix}`, industry: "Software / SaaS", customerTone: "friendly", accentColor: "#7c3aed", logoInitials: "NC" };
    const primaryKey = key("primary");
    const primary = await created(await create(cookieA, primaryRequest, primaryKey), "authenticated creation must succeed");
    const primaryId = primary.organization.id;
    assert.match(primaryId, /^org-[0-9a-f-]{36}$/i, "organization identity must be server-generated UUID material");
    assert.equal(primary.idempotentReplay, false, "first request must not be a replay");
    assert.equal(primary.organization.name, primaryRequest.name, "server must preserve a valid display name");

    const replay = await created(await create(cookieA, primaryRequest, primaryKey), "same request replay must succeed");
    assert.equal(replay.organization.id, primaryId, "same idempotency key must return the original organization");
    assert.equal(replay.idempotentReplay, true, "same request replay must be identified");
    await expectStatus(await create(cookieA, { ...primaryRequest, name: `Changed ${suffix}` }, primaryKey), 409, "same key with changed payload must be rejected");

    const durable = await db.query(
      `SELECT o.id,
              (SELECT role FROM organization_memberships m WHERE m."organizationId" = o.id AND m."userId" = $2) AS membership_role,
              (SELECT r.key FROM organization_role_assignments a JOIN rbac_roles r ON r.id = a."roleId" WHERE a."organizationId" = o.id AND a."userId" = $2) AS role_key,
              (SELECT authority FROM organization_persistence_authority p WHERE p."organizationId" = o.id) AS authority,
              (SELECT counter FROM ticket_sequences t WHERE t."organizationId" = o.id) AS ticket_counter,
              (SELECT COUNT(*)::int FROM authorization_decision_audits a WHERE a."organizationId" = o.id AND a."actorUserId" = $2 AND a."capabilityKey" = 'organization.create') AS creation_audit_count
       FROM organizations o WHERE o.id = $1`,
      [primaryId, userA]
    );
    assert.equal(durable.rowCount, 1, "organization must persist in PostgreSQL");
    assert.equal(durable.rows[0].membership_role, "owner", "creator must have an owner membership");
    assert.equal(durable.rows[0].role_key, "owner", "creator must have the Owner RBAC assignment");
    assert.equal(durable.rows[0].authority, "server", "new tenant must be server authoritative");
    assert.equal(Number(durable.rows[0].ticket_counter), 0, "ticket sequence must initialize at zero");
    assert.equal(durable.rows[0].creation_audit_count, 1, "creation provenance must be recorded");

    const emptiness = await db.query(
      `SELECT
        (SELECT COUNT(*)::int FROM knowledge_items WHERE "organizationId" = $1) AS knowledge,
        (SELECT COUNT(*)::int FROM knowledge_candidates WHERE "organizationId" = $1) AS candidates,
        (SELECT COUNT(*)::int FROM validation_records WHERE "organizationId" = $1) AS validations,
        (SELECT COUNT(*)::int FROM memory_change_records WHERE "organizationId" = $1) AS memory_changes,
        (SELECT COUNT(*)::int FROM trust_evidence WHERE "organizationId" = $1) AS evidence,
        (SELECT COUNT(*)::int FROM ticket_records WHERE "organizationId" = $1) AS tickets,
        (SELECT COUNT(*)::int FROM emerging_patterns WHERE "organizationId" = $1) AS patterns,
        (SELECT COUNT(*)::int FROM intelligence_log WHERE "organizationId" = $1) AS logs,
        (SELECT COUNT(*)::int FROM org_metrics WHERE "organizationId" = $1) AS metrics`,
      [primaryId]
    );
    for (const [resource, count] of Object.entries(emptiness.rows[0])) {
      assert.equal(Number(count), resource === "metrics" ? 1 : 0, `new organization ${resource} must start isolated`);
    }

    const listed = await request("/api/organizations", { headers: { cookie: cookieA } });
    const listedPayload = await listed.json();
    assert.ok(listedPayload.data.some((organization) => organization.id === primaryId), "creator organization list must include the new membership");
    await expectStatus(await request("/api/auth/active-organization", { method: "PUT", headers: { cookie: cookieA, "content-type": "application/json" }, body: JSON.stringify({ organizationId: primaryId }) }), 200, "creator must select the new organization");
    for (const resource of ["knowledge", "knowledge-candidates", "validation-records", "memory-change-records", "tickets", "emerging-patterns", "metrics"]) {
      const response = await request(`/api/organizations/${encodeURIComponent(primaryId)}/${resource}`, { headers: { cookie: cookieA } });
      assert.equal(response.status, 200, `owner must read initialized ${resource}`);
    }
    await expectStatus(await request(`/api/organizations/${encodeURIComponent(primaryId)}/knowledge`, { headers: { cookie: cookieB } }), 403, "non-member reads must be rejected");
    await expectStatus(await request("/api/auth/active-organization", { method: "PUT", headers: { cookie: cookieB, "content-type": "application/json" }, body: JSON.stringify({ organizationId: primaryId }) }), 403, "non-member selection must be rejected");
    await expectStatus(await create(cookieA, { ...primaryRequest, ownerId: userB }, key("owner-spoof")), 400, "client supplied owner assignments must be rejected");
    await expectStatus(await create(cookieA, { ...primaryRequest, id: "profile-oip-developer-demo" }, key("spoof")), 400, "client supplied organization IDs must be rejected");

    // Four distinct tenants prove there is no accidental three-organization cap.
    const fourIds = [primaryId];
    for (const index of [2, 3, 4]) {
      const response = await created(await create(cookieA, { name: `RSS-2.2 Four Org ${index} ${suffix}`, industry: "General" }, key(`four-${index}`)), `organization ${index} must be created`);
      fourIds.push(response.organization.id);
    }
    assert.equal(new Set(fourIds).size, 4, "four independent organizations must exist for one user");
    const fourMemberships = await db.query('SELECT COUNT(*)::int AS count FROM organization_memberships WHERE "userId" = $1 AND "organizationId" = ANY($2::text[])', [userA, fourIds]);
    assert.equal(fourMemberships.rows[0].count, 4, "all four organizations must retain creator membership");

    // Same-key simultaneous submissions must provision exactly one tenant.
    const concurrentKey = key("concurrent");
    const concurrentPayload = { name: `Concurrent ${suffix}`, industry: "General" };
    const concurrent = await Promise.all([create(cookieA, concurrentPayload, concurrentKey), create(cookieA, concurrentPayload, concurrentKey)]);
    const concurrentData = await Promise.all(concurrent.map((response) => created(response, "concurrent creation must succeed")));
    assert.equal(concurrentData[0].organization.id, concurrentData[1].organization.id, "concurrent retries must converge on one organization");
    const concurrentCount = await db.query('SELECT COUNT(*)::int AS count FROM organization_creation_requests WHERE "userId" = $1 AND "idempotencyKey" = $2', [userA, concurrentKey]);
    assert.equal(concurrentCount.rows[0].count, 1, "concurrent retries must create one idempotency record");

    // Inject a disposable database failure after Organization creation but before
    // Membership completion. The real HTTP path must roll the tenant back.
    await db.query(`CREATE OR REPLACE FUNCTION rss_22_fail_membership_${suffix.replace(/-/g, "_")}() RETURNS trigger AS $$ BEGIN IF NEW."userId" = '${userA}' THEN RAISE EXCEPTION 'RSS-2.2 disposable membership failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await db.query(`CREATE TRIGGER rss_22_fail_membership_trigger_${suffix.replace(/-/g, "_")} BEFORE INSERT ON organization_memberships FOR EACH ROW EXECUTE FUNCTION rss_22_fail_membership_${suffix.replace(/-/g, "_")}()`);
    triggerInstalled = true;
    installedTriggerName = `rss_22_fail_membership_trigger_${suffix.replace(/-/g, "_")}`;
    installedFunctionName = `rss_22_fail_membership_${suffix.replace(/-/g, "_")}`;
    await expectStatus(await create(cookieA, { name: rollbackName, industry: "General" }, key("rollback")), 500, "provisioning failure must be surfaced safely");
    const rollback = await db.query('SELECT (SELECT COUNT(*)::int FROM organizations WHERE name = $1) AS organizations, (SELECT COUNT(*)::int FROM organization_creation_requests WHERE "userId" = $2 AND "idempotencyKey" = $3) AS requests', [rollbackName, userA, key("rollback")]);
    assert.equal(rollback.rows[0].organizations, 0, "failed provisioning must not leave an organization");
    assert.equal(rollback.rows[0].requests, 0, "failed provisioning must not leave an idempotency artifact");
    await db.query(`DROP TRIGGER rss_22_fail_membership_trigger_${suffix.replace(/-/g, "_")} ON organization_memberships`);
    await db.query(`DROP FUNCTION rss_22_fail_membership_${suffix.replace(/-/g, "_")}()`);
    triggerInstalled = false;
    installedTriggerName = null;
    installedFunctionName = null;

    // Fail after the creator membership exists to prove an Owner-assignment
    // failure also rolls back the organization and membership together.
    const roleFunction = `rss_22_fail_owner_${suffix.replace(/-/g, "_")}`;
    const roleTrigger = `rss_22_fail_owner_trigger_${suffix.replace(/-/g, "_")}`;
    const roleRollbackName = `RSS-2.2 Owner Rollback ${suffix}`;
    await db.query(`CREATE OR REPLACE FUNCTION ${roleFunction}() RETURNS trigger AS $$ BEGIN IF NEW."userId" = '${userA}' THEN RAISE EXCEPTION 'RSS-2.2 disposable owner assignment failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await db.query(`CREATE TRIGGER ${roleTrigger} BEFORE INSERT ON organization_role_assignments FOR EACH ROW EXECUTE FUNCTION ${roleFunction}()`);
    triggerInstalled = true;
    installedTriggerName = roleTrigger;
    installedFunctionName = roleFunction;
    await expectStatus(await create(cookieA, { name: roleRollbackName, industry: "General" }, key("owner-rollback")), 500, "owner assignment failure must be surfaced safely");
    const ownerRollback = await db.query('SELECT (SELECT COUNT(*)::int FROM organizations WHERE name = $1) AS organizations, (SELECT COUNT(*)::int FROM organization_memberships m JOIN organizations o ON o.id = m."organizationId" WHERE o.name = $1) AS memberships', [roleRollbackName]);
    assert.equal(ownerRollback.rows[0].organizations, 0, "owner assignment failure must not leave an organization");
    assert.equal(ownerRollback.rows[0].memberships, 0, "owner assignment failure must not leave a membership");
    await db.query(`DROP TRIGGER ${roleTrigger} ON organization_role_assignments`);
    await db.query(`DROP FUNCTION ${roleFunction}()`);
    triggerInstalled = false;
    installedTriggerName = null;
    installedFunctionName = null;

    // Validation controls: names are display text, not identifiers; unsafe
    // control characters are rejected while Unicode and encoded HTML-like text
    // remain inert data and duplicate display names are allowed.
    for (const name of ["", "   ", "x".repeat(161), "bad\u0000name"]) {
      await expectStatus(await create(cookieA, { name }, key(`invalid-${crypto.randomUUID()}`)), 400, "invalid display name must be rejected");
    }
    const unicode = await created(await create(cookieA, { name: `Núsa 株式会社 ${suffix}`, industry: "General" }, key("unicode")), "Unicode name must be accepted safely");
    const html = await created(await create(cookieA, { name: `<script>inert</script> ${suffix}`, industry: "General" }, key("html")), "HTML-like name must remain inert display text");
    const duplicateOne = await created(await create(cookieA, { name: `Duplicate Name ${suffix}`, industry: "General" }, key("duplicate-1")), "first duplicate display name must be accepted");
    const duplicateTwo = await created(await create(cookieA, { name: `Duplicate Name ${suffix}`, industry: "General" }, key("duplicate-2")), "second duplicate display name must be accepted");
    assert.notEqual(duplicateOne.organization.id, duplicateTwo.organization.id, "duplicate display names must still receive unique server IDs");
    assert.ok(unicode.organization.id && html.organization.id, "safe display-name controls must create durable tenants");

    await expectStatus(await request("/api/auth/logout", { method: "POST", headers: { cookie: cookieA } }), 200, "logout must succeed");
    const reloggedCookie = await login(emailA);
    const afterLogin = await request("/api/organizations", { headers: { cookie: reloggedCookie } });
    const afterLoginPayload = await afterLogin.json();
    assert.ok(afterLoginPayload.data.some((organization) => organization.id === primaryId), "organization must survive logout/login and hard refresh list read");

    console.log("RSS-2.2 organization-creation ownership probe passed.");
  } finally {
    if (triggerInstalled) {
      const table = installedTriggerName?.includes("owner") ? "organization_role_assignments" : "organization_memberships";
      await db.query(`DROP TRIGGER IF EXISTS ${installedTriggerName} ON ${table}`);
      await db.query(`DROP FUNCTION IF EXISTS ${installedFunctionName}()`);
    }
    await db.query('DELETE FROM auth_sessions WHERE "userId" = ANY($1::text[])', [[userA, userB]]);
    await db.query('DELETE FROM users WHERE id = ANY($1::text[])', [[userA, userB]]);
    if (createdOrganizationIds.size) await db.query('DELETE FROM organizations WHERE id = ANY($1::text[])', [[...createdOrganizationIds]]);
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
