/* RSS-2.7: disposable organization-lifecycle UX/API acceptance probe. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

require("dotenv").config({ path: ".env.local" });

const root = path.resolve(__dirname, "..");
const baseUrl = process.env.AUTH_PROBE_BASE_URL || "http://localhost:3000";
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const password = "RSS-27-Lifecycle-Probe-password-2026!";
const userLabel = `rss-27-user-${suffix}`;
const email = `${userLabel}@example.test`;
const organizationIds = new Set();
const matureOrganizations = ["profile-oip-developer-demo", "profile-fastdrop-logistics", "profile-maesa-tech"];

async function request(pathname, init = {}) { return fetch(`${baseUrl}${pathname}`, init); }
async function body(response) { return response.json().catch(() => null); }
function key(label) { return `rss27-${label}-${suffix}`; }

function verifySourceContract() {
  const page = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
  const menu = fs.readFileSync(path.join(root, "components", "AccountWorkspaceMenu.tsx"), "utf8");
  const view = fs.readFileSync(path.join(root, "components", "views", "OrganizationView.tsx"), "utf8");
  const start = page.indexOf("async function selectOrganization(");
  const end = page.indexOf("async function addOrganization(", start);
  assert.ok(start >= 0 && end > start, "organization switch source must be discoverable");
  const switchSource = page.slice(start, end);
  assert.equal(switchSource.includes("persistOrganizationState("), false, "switch must not snapshot-flush loaded organization state");
  assert.match(page, /FirstOrganizationOnboarding/);
  assert.match(page, /authorizedProfiles\.length === 0/);
  assert.match(page, /Switching to the selected organization/);
  assert.match(page, /Try again/);
  assert.match(menu, /Create organization/);
  assert.match(menu, /Role:/);
  assert.match(view, /server-owned organization/);
  assert.match(view, /creationError/);
}

async function signup() {
  const response = await request("/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "RSS-2.7 Lifecycle Probe", email, password })
  });
  const payload = await body(response);
  assert.equal(response.status, 201, `disposable signup must succeed: ${payload?.error?.message ?? response.status}`);
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie?.includes("HttpOnly"), "signup must establish an HttpOnly session");
  return cookie.split(";", 1)[0];
}

async function createOrganization(cookie, name, label) {
  const response = await request("/api/organizations", {
    method: "POST",
    headers: { cookie, "content-type": "application/json", "idempotency-key": key(label) },
    body: JSON.stringify({ name, industry: "Probe" })
  });
  const payload = await body(response);
  assert.ok(response.status === 201 || response.status === 200, `organization creation must succeed: ${payload?.error?.message ?? response.status}`);
  assert.ok(payload?.data?.organization?.id, "creation response must include an organization");
  organizationIds.add(payload.data.organization.id);
  return payload.data.organization;
}

async function setActive(cookie, organizationId) {
  return request("/api/auth/active-organization", {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ organizationId })
  });
}

async function matureDigest(db) {
  const tables = ["organizations", "organization_memberships", "knowledge_items", "ticket_records", "org_metrics", "organization_persistence_authority"];
  const snapshot = {};
  for (const table of tables) {
    const result = table === "organizations"
      ? await db.query(`SELECT * FROM ${table} WHERE id = ANY($1::text[])`, [matureOrganizations])
      : await db.query(`SELECT * FROM ${table} WHERE "organizationId" = ANY($1::text[])`, [matureOrganizations]);
    snapshot[table] = result.rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

async function main() {
  verifySourceContract();
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  let cookie;
  let userId;
  let matureBefore;
  try {
    matureBefore = await matureDigest(db);
    cookie = await signup();
    const me = await body(await request("/api/auth/me", { headers: { cookie } }));
    userId = me.data.id;

    const emptyOrganizations = await body(await request("/api/organizations", { headers: { cookie } }));
    assert.deepEqual(emptyOrganizations.data, [], "new account must begin with zero organizations");
    const emptyActive = await body(await request("/api/auth/active-organization", { headers: { cookie } }));
    assert.equal(emptyActive.data.activeOrganizationId, null, "zero-org account must have no active organization");
    assert.equal((await request("/api/organizations/profile-oip-developer-demo/knowledge", { headers: { cookie } })).status, 403, "zero-org account must not read demo data");

    const first = await createOrganization(cookie, `RSS-2.7 Duplicate ${suffix}`, "first");
    assert.match(first.id, /^org-/);
    const firstList = (await body(await request("/api/organizations", { headers: { cookie } }))).data;
    assert.equal(firstList.length, 1, "first creation must produce one authorized organization");
    const authorization = await body(await request(`/api/organizations/${first.id}/authorization`, { headers: { cookie } }));
    assert.equal(authorization.data.role, "owner", "creator must see the Owner role");
    for (const resource of ["knowledge", "knowledge-candidates", "validation-records", "memory-change-records", "metrics", "intelligence-log", "emerging-patterns", "tickets"]) {
      const response = await request(`/api/organizations/${first.id}/${resource}`, { headers: { cookie } });
      assert.equal(response.status, 200, `${resource} must be readable in a clean workspace`);
      const value = (await body(response)).data;
      if (Array.isArray(value)) assert.equal(value.length, 0, `${resource} must start empty`);
    }

    const duplicate = await createOrganization(cookie, `RSS-2.7 Duplicate ${suffix}`, "duplicate");
    assert.notEqual(duplicate.id, first.id, "duplicate names must remain distinct organizations");
    const additional = [];
    for (let index = 0; index < 3; index += 1) additional.push(await createOrganization(cookie, `RSS-2.7 Organization ${index} ${suffix}`, `additional-${index}`));
    const allOrganizations = (await body(await request("/api/organizations", { headers: { cookie } }))).data;
    assert.equal(allOrganizations.length, 5, "all five disposable organizations must remain selectable");
    assert.equal(new Set(allOrganizations.map((organization) => organization.id)).size, 5);
    assert.ok(allOrganizations.every((organization) => !matureOrganizations.includes(organization.id)), "demo organizations must never appear as fallback tenants");

    for (const organization of [duplicate, additional[0], first]) {
      const switched = await setActive(cookie, organization.id);
      assert.equal(switched.status, 200, "authorized organization switch must succeed");
      assert.equal((await body(switched)).data.activeOrganizationId, organization.id);
      assert.equal((await body(await request("/api/auth/active-organization", { headers: { cookie } }))).data.activeOrganizationId, organization.id);
    }
    const invalid = await setActive(cookie, "org-rss-27-does-not-exist");
    assert.equal(invalid.status, 404, "unknown active organization must be rejected");
    const afterInvalid = await body(await request("/api/auth/active-organization", { headers: { cookie } }));
    assert.ok(allOrganizations.some((organization) => organization.id === afterInvalid.data.activeOrganizationId), "invalid switch must not leave an unauthorized active context");

    const rapid = await Promise.all([first, duplicate, additional[0]].map((organization) => setActive(cookie, organization.id)));
    assert.ok(rapid.every((response) => response.status === 200), "rapid authorized switches must remain authorized");
    const rapidFinal = await body(await request("/api/auth/active-organization", { headers: { cookie } }));
    assert.ok(allOrganizations.some((organization) => organization.id === rapidFinal.data.activeOrganizationId), "rapid switch completion must resolve to an authorized organization");

    for (const [index, input] of [["blank", { name: "   ", industry: "Probe" }], ["short", { name: "x", industry: "Probe" }], ["oversized", { name: "x".repeat(161), industry: "Probe" }]]) {
      const response = await request("/api/organizations", { method: "POST", headers: { cookie, "content-type": "application/json", "idempotency-key": key(`invalid-${index}`) }, body: JSON.stringify(input) });
      assert.equal(response.status, 400, `${index} organization names must be rejected`);
    }
    const count = await db.query('SELECT COUNT(*)::int AS count FROM organizations WHERE id = ANY($1::text[])', [[...organizationIds]]);
    assert.equal(count.rows[0].count, 5, "invalid provisioning must not create partial organizations");

    await request("/api/auth/logout", { method: "POST", headers: { cookie } });
    cookie = (await (async () => {
      const response = await request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      assert.equal(response.status, 200, "logout/login must remain usable");
      return response.headers.get("set-cookie").split(";", 1)[0];
    })());
    const afterLogin = (await body(await request("/api/organizations", { headers: { cookie } }))).data;
    assert.equal(afterLogin.length, 5, "logout/login must restore all memberships");
    const matureAfter = await matureDigest(db);
    assert.equal(matureAfter, matureBefore, "mature organizations must remain unchanged");
    console.log("RSS-2.7 organization lifecycle UX probe passed.");
  } finally {
    if (userId) {
      await db.query('DELETE FROM auth_sessions WHERE "userId" = $1', [userId]);
      await db.query('DELETE FROM organizations WHERE id = ANY($1::text[])', [[...organizationIds]]);
      await db.query("DELETE FROM users WHERE id = $1", [userId]);
    }
    await db.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
