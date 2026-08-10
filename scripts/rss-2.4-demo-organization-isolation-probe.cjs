/* RSS-2.4: disposable customer/demo organization-isolation acceptance probe. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { Client } = require("pg");

require("dotenv").config({ path: ".env.local" });

const root = path.resolve(__dirname, "..");
const baseUrl = process.env.AUTH_PROBE_BASE_URL || "http://localhost:3000";
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const password = "RSS-24-Isolation-Probe-password-2026!";
const demoOrganizations = [
  { id: "profile-oip-developer-demo", name: "OIP Developer Demo" },
  { id: "profile-fastdrop-logistics", name: "FastDrop Logistics" },
  { id: "profile-maesa-tech", name: "Maesa Tech" }
];
const organizationIds = new Set();
const identityIds = new Set();
const sessionIds = new Set();
let failureTrigger = null;

function email(label) { return `rss-24-${label}-${suffix}@example.test`; }
function key(label) { return `rss-24-${label}-${suffix}`; }
async function request(pathname, init = {}) { return fetch(`${baseUrl}${pathname}`, init); }
async function json(response) { return response.json().catch(() => null); }

function sourceContract() {
  const page = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
  const active = fs.readFileSync(path.join(root, "lib", "server", "activeOrganization.ts"), "utf8");
  const authorization = fs.readFileSync(path.join(root, "lib", "server", "authorization.ts"), "utf8");
  const developmentSeed = fs.readFileSync(path.join(root, "scripts", "seed-development-memberships.cjs"), "utf8");
  assert.match(active, /membership/);
  assert.match(authorization, /requireCapability/);
  assert.match(page, /authorizedProfiles\.length === 0/);
  assert.match(developmentSeed, /AUTH_DEVELOPMENT_USER_EMAIL/);
  assert.match(developmentSeed, /organization_memberships/);
  assert.equal(page.includes("profile-oip-developer-demo"), false, "customer UI must not hardcode a demo fallback");
}

async function signup(input) {
  return request("/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
}

async function signupSuccess(label) {
  const response = await signup({ name: `RSS-2.4 ${label}`, email: email(label.toLowerCase().replace(/[^a-z0-9]+/g, "-")), password });
  const payload = await json(response);
  assert.equal(response.status, 201, `signup ${label} must succeed: ${payload?.error?.message ?? response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie, "signup must establish a session cookie");
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
  assert.ok(response.status === 201 || response.status === 200, `customer organization must be created: ${payload?.error?.message ?? response.status}`);
  organizationIds.add(payload.data.organization.id);
  return payload.data.organization;
}

async function expectDemoDenied(cookie, organizationId) {
  const resources = [
    "", "knowledge", "knowledge-candidates", "validation-records", "memory-change-records",
    "metrics", "emerging-patterns", "tickets"
  ];
  for (const resource of resources) {
    const suffixPath = resource === "" ? "" : `/${resource}`;
    const response = await request(`/api/organizations/${organizationId}${suffixPath}`, { headers: { cookie } });
    assert.equal(response.status, 403, `customer must be denied demo resource ${organizationId}${suffixPath}`);
  }
  const active = await request("/api/auth/active-organization", {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ organizationId })
  });
  assert.equal(active.status, 403, `customer must not select demo ${organizationId}`);
}

async function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const sessionId = `rss24-session-${suffix}`;
  const session = await db.query('INSERT INTO auth_sessions (id, "tokenHash", "userId", "expiresAt") VALUES ($1, $2, $3, NOW() + INTERVAL \'30 days\') RETURNING id', [sessionId, tokenHash, userId]);
  sessionIds.add(session.rows[0].id);
  return `oip_session=${token}`;
}

async function protectedSnapshot(db) {
  const ids = demoOrganizations.map((organization) => organization.id);
  const tables = [
    ["organizations", "SELECT * FROM organizations WHERE id = ANY($1::text[]) ORDER BY id"],
    ["memberships", 'SELECT * FROM organization_memberships WHERE "organizationId" = ANY($1::text[]) ORDER BY "organizationId", "userId"'],
    ["roleAssignments", 'SELECT * FROM organization_role_assignments WHERE "organizationId" = ANY($1::text[]) ORDER BY "organizationId", "userId"'],
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
  for (const [name, query] of tables) snapshot[name] = (await db.query(query, [ids])).rows;
  return crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

async function main() {
  sourceContract();
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const matureBefore = await protectedSnapshot(db);
    const customerA = await signupSuccess("Customer A");

    const initialOrganizations = await json(await request("/api/organizations", { headers: { cookie: customerA.cookie } }));
    assert.deepEqual(initialOrganizations.data, [], "new customer must start with zero organizations");
    const initialMemberships = await db.query('SELECT "organizationId" FROM organization_memberships WHERE "userId" = $1', [customerA.user.id]);
    assert.deepEqual(initialMemberships.rows, [], "new customer must start with zero memberships");
    for (const demo of demoOrganizations) await expectDemoDenied(customerA.cookie, demo.id);

    // An invalid active reference resolves to the authorized membership set;
    // it never becomes an implicit demo fallback.
    await db.query('UPDATE users SET "activeOrganizationId" = $1 WHERE id = $2', [demoOrganizations[0].id, customerA.user.id]);
    const emptyActive = await json(await request("/api/auth/active-organization", { headers: { cookie: customerA.cookie } }));
    assert.equal(emptyActive.data.activeOrganizationId, null, "invalid active demo reference must resolve to empty onboarding state");

    const customerOrg = await createOrganization(customerA.cookie, `RSS-2.4 Customer ${suffix}`, key("customer-org"));
    const customerMemberships = await db.query('SELECT "organizationId", role FROM organization_memberships WHERE "userId" = $1 ORDER BY "organizationId"', [customerA.user.id]);
    assert.deepEqual(customerMemberships.rows, [{ organizationId: customerOrg.id, role: "owner" }], "customer must have only its own Owner membership");
    const activeCustomer = await request("/api/auth/active-organization", {
      method: "PUT",
      headers: { cookie: customerA.cookie, "content-type": "application/json" },
      body: JSON.stringify({ organizationId: customerOrg.id })
    });
    assert.equal(activeCustomer.status, 200);
    for (const demo of demoOrganizations) await expectDemoDenied(customerA.cookie, demo.id);

    const customerResources = await db.query(`SELECT
      (SELECT COUNT(*) FROM knowledge_items WHERE "organizationId" = $1) AS knowledge,
      (SELECT COUNT(*) FROM knowledge_candidates WHERE "organizationId" = $1) AS candidates,
      (SELECT COUNT(*) FROM validation_records WHERE "organizationId" = $1) AS validations,
      (SELECT COUNT(*) FROM memory_change_records WHERE "organizationId" = $1) AS memory,
      (SELECT COUNT(*) FROM trust_evidence WHERE "organizationId" = $1) AS evidence,
      (SELECT COUNT(*) FROM ticket_records WHERE "organizationId" = $1) AS tickets,
      (SELECT COUNT(*) FROM emerging_patterns WHERE "organizationId" = $1) AS patterns`, [customerOrg.id]);
    for (const count of Object.values(customerResources.rows[0])) assert.equal(Number(count), 0, "customer tenant must not inherit demo resources");

    // A display-name collision remains a separate server-generated tenant.
    const sameName = await createOrganization(customerA.cookie, "OIP Developer Demo", key("same-name"));
    assert.notEqual(sameName.id, "profile-oip-developer-demo", "display-name collision must not collide with demo identity");
    assert.equal(sameName.id.startsWith("org-"), true, "customer organization identity must remain server-generated");
    assert.equal((await signup({ name: "Spoof", email: email("spoof"), password, id: "profile-oip-developer-demo" })).status, 400, "signup must reject identity injection");

    // Replaying the explicit development-membership seed is operator-scoped;
    // it must not touch the disposable customer's membership set.
    const customerMembershipBeforeSeed = await db.query('SELECT "organizationId", role FROM organization_memberships WHERE "userId" = $1 ORDER BY "organizationId"', [customerA.user.id]);
    if (process.env.AUTH_DEVELOPMENT_USER_EMAIL) {
      execFileSync(process.execPath, [path.join(root, "scripts", "seed-development-memberships.cjs")], { cwd: root, env: process.env, stdio: "pipe", timeout: 30_000 });
    }
    const customerMembershipAfterSeed = await db.query('SELECT "organizationId", role FROM organization_memberships WHERE "userId" = $1 ORDER BY "organizationId"', [customerA.user.id]);
    assert.deepEqual(customerMembershipAfterSeed.rows, customerMembershipBeforeSeed.rows, "development seed replay must not attach demo memberships to customers");

    // A failed first-organization transaction must leave a valid zero-org
    // account in onboarding, never a demo fallback.
    const customerC = await signupSuccess("Customer C");
    const failureName = `RSS-2.4 Failed Org ${suffix}`;
    const functionName = `rss_24_fail_org_${suffix.replace(/-/g, "_")}`;
    const triggerName = `rss_24_fail_org_trigger_${suffix.replace(/-/g, "_")}`;
    await db.query(`CREATE OR REPLACE FUNCTION ${functionName}() RETURNS trigger AS $$ BEGIN IF NEW."userId" = '${customerC.user.id}' THEN RAISE EXCEPTION 'RSS-2.4 controlled failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await db.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON organization_memberships FOR EACH ROW EXECUTE FUNCTION ${functionName}()`);
    failureTrigger = { functionName, triggerName };
    const failed = await request("/api/organizations", {
      method: "POST",
      headers: { cookie: customerC.cookie, "content-type": "application/json", "idempotency-key": key("failed-org") },
      body: JSON.stringify({ name: failureName, industry: "General" })
    });
    assert.equal(failed.status, 500, "controlled first-organization failure must return safe error");
    assert.deepEqual((await json(await request("/api/organizations", { headers: { cookie: customerC.cookie } }))).data, [], "failed onboarding must remain zero-org");
    const failedActive = await json(await request("/api/auth/active-organization", { headers: { cookie: customerC.cookie } }));
    assert.equal(failedActive.data.activeOrganizationId, null, "failed onboarding must not select a demo");
    for (const demo of demoOrganizations) await expectDemoDenied(customerC.cookie, demo.id);
    await db.query(`DROP TRIGGER ${triggerName} ON organization_memberships`);
    await db.query(`DROP FUNCTION ${functionName}()`);
    failureTrigger = null;

    // Explicit development access remains available through existing durable
    // memberships; the probe creates only a temporary session, never a role.
    const configuredDevelopmentEmail = process.env.AUTH_DEVELOPMENT_USER_EMAIL?.trim().toLowerCase();
    assert.ok(configuredDevelopmentEmail, "development account must be explicitly configured for this acceptance probe");
    const developmentUser = await db.query('SELECT id FROM users WHERE email = $1', [configuredDevelopmentEmail]);
    assert.equal(developmentUser.rowCount, 1, "configured development account must exist");
    const developmentCookie = await createSession(db, developmentUser.rows[0].id);
    const developmentOrganizations = await json(await request("/api/organizations", { headers: { cookie: developmentCookie } }));
    for (const demo of demoOrganizations) {
      assert.ok(developmentOrganizations.data.some((organization) => organization.id === demo.id), `development account must retain ${demo.id}`);
      const switched = await request("/api/auth/active-organization", {
        method: "PUT",
        headers: { cookie: developmentCookie, "content-type": "application/json" },
        body: JSON.stringify({ organizationId: demo.id })
      });
      assert.equal(switched.status, 200, `development account must switch to ${demo.id}`);
      assert.equal((await request(`/api/organizations/${demo.id}/knowledge`, { headers: { cookie: developmentCookie } })).status, 200);
    }

    const matureAfter = await protectedSnapshot(db);
    assert.equal(matureAfter, matureBefore, "protected demo state changed during RSS-2.4 probe");
    console.log("RSS-2.4 demo organization isolation probe passed.");
  } finally {
    if (failureTrigger) {
      await db.query(`DROP TRIGGER IF EXISTS ${failureTrigger.triggerName} ON organization_memberships`);
      await db.query(`DROP FUNCTION IF EXISTS ${failureTrigger.functionName}()`);
    }
    if (sessionIds.size) await db.query('DELETE FROM auth_sessions WHERE id = ANY($1::text[])', [[...sessionIds]]);
    if (identityIds.size) await db.query('DELETE FROM auth_sessions WHERE "userId" = ANY($1::text[])', [[...identityIds]]);
    if (organizationIds.size) await db.query('DELETE FROM organizations WHERE id = ANY($1::text[])', [[...organizationIds]]);
    if (identityIds.size) await db.query('DELETE FROM users WHERE id = ANY($1::text[])', [[...identityIds]]);
    await db.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
