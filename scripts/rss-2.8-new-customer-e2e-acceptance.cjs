/* RSS-2.8: new-customer release acceptance probe. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

require("dotenv").config({ path: ".env.local" });

const root = path.resolve(__dirname, "..");
const baseUrl = process.env.AUTH_PROBE_BASE_URL || "http://localhost:3510";
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const email = `rss-28-probe-${suffix}@example.test`;
const password = "RSS-28-New-Customer-Probe-password-2026!";
const organizationIds = new Set();
const matureOrganizations = ["profile-oip-developer-demo", "profile-fastdrop-logistics", "profile-maesa-tech"];

async function request(pathname, init = {}) { return fetch(`${baseUrl}${pathname}`, init); }
async function json(response) { return response.json().catch(() => null); }
function key(label) { return `rss28-${label}-${suffix}`; }
function headers(cookie, extra = {}) { return { cookie, ...extra }; }

function verifySourceContract() {
  const page = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
  const persistence = fs.readFileSync(path.join(root, "lib", "server", "persistenceService.ts"), "utf8");
  const start = page.indexOf("async function confirmReflectionApplication");
  const end = page.indexOf("// Retained temporarily", start);
  assert.ok(start >= 0 && end > start, "primary reflection handler must be discoverable");
  const handler = page.slice(start, end);
  assert.equal(handler.includes('kind: "approve"'), false, "reflection must not resolve before governed commit");
  assert.ok(handler.includes("await transitionTicket(activeTicketRecord.ticketId"), "reflection must await ticket transition");
  assert.ok(handler.includes('kind: "commit"'), "reflection must use governed commit transition");
  assert.equal(handler.includes("void transitionTicket"), false, "customer commit must be awaited");
  assert.match(persistence, /where: \{ organizationId: organization\.id, ticketId: \{ in: sourceTicketIds \} \}/);
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

async function signup() {
  const response = await request("/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "RSS-2.8 New Customer Probe", email, password }) });
  const payload = await json(response);
  assert.equal(response.status, 201, payload?.error?.message ?? "signup failed");
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie?.includes("HttpOnly"), "signup must establish an HttpOnly session");
  return cookie.split(";", 1)[0];
}

async function createOrganization(cookie, name, label) {
  const response = await request("/api/organizations", { method: "POST", headers: headers(cookie, { "content-type": "application/json", "idempotency-key": key(label) }), body: JSON.stringify({ name, industry: "Acceptance Probe" }) });
  const payload = await json(response);
  assert.ok(response.status === 200 || response.status === 201, payload?.error?.message ?? "organization creation failed");
  assert.ok(payload?.data?.organization?.id, "organization creation must return an id");
  organizationIds.add(payload.data.organization.id);
  return payload.data.organization;
}

async function setActive(cookie, organizationId) {
  return request("/api/auth/active-organization", { method: "PUT", headers: headers(cookie, { "content-type": "application/json" }), body: JSON.stringify({ organizationId }) });
}

async function main() {
  verifySourceContract();
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  let cookie;
  let userId;
  let matureBefore;
  try {
    console.log("RSS-2.8 probe: baseline");
    matureBefore = await matureDigest(db);
    console.log("RSS-2.8 probe: signup");
    cookie = await signup();
    const me = await json(await request("/api/auth/me", { headers: headers(cookie) }));
    userId = me.data.id;
    assert.deepEqual((await json(await request("/api/organizations", { headers: headers(cookie) }))).data, [], "new customer must have zero organizations");
    assert.equal((await json(await request("/api/auth/active-organization", { headers: headers(cookie) }))).data.activeOrganizationId, null, "zero-org customer must have no active organization");
    assert.equal((await request("/api/organizations/profile-oip-developer-demo/knowledge", { headers: headers(cookie) })).status, 403, "demo knowledge must be isolated");

    const first = await createOrganization(cookie, `RSS-2.8 Customer ${suffix}`, "first");
    console.log("RSS-2.8 probe: first organization");
    const listAfterFirst = (await json(await request("/api/organizations", { headers: headers(cookie) }))).data;
    assert.equal(listAfterFirst.length, 1);
    assert.equal((await json(await request(`/api/organizations/${first.id}/authorization`, { headers: headers(cookie) }))).data.role, "owner", "creator must be Owner");
    for (const resource of ["knowledge", "knowledge-candidates", "validation-records", "memory-change-records", "metrics", "intelligence-log", "emerging-patterns", "tickets"]) {
      const response = await request(`/api/organizations/${first.id}/${resource}`, { headers: headers(cookie) });
      assert.equal(response.status, 200, `${resource} clean read failed`);
      const value = (await json(response)).data;
      if (Array.isArray(value)) assert.equal(value.length, 0, `${resource} must start empty`);
    }

    const ticketId = `RSS28-${suffix}`;
    const ticketWrite = await request(`/api/organizations/${first.id}/tickets`, { method: "PUT", headers: headers(cookie, { "content-type": "application/json" }), body: JSON.stringify([{ ticketId, orgId: first.id, rawMessage: "A new customer reports a support issue.", subject: "New customer support issue" }]) });
    console.log("RSS-2.8 probe: customer ticket");
    assert.equal(ticketWrite.status, 200, "customer ticket write must succeed");
    const ticketRead = await json(await request(`/api/organizations/${first.id}/tickets?full=true`, { headers: headers(cookie) }));
    assert.ok(ticketRead.data.some((ticket) => ticket.ticketId === ticketId && ticket.status === "open"), "customer ticket must persist as open");
    const forbiddenAuthority = await request(`/api/organizations/${first.id}/tickets`, { method: "PUT", headers: headers(cookie, { "content-type": "application/json" }), body: JSON.stringify([{ ticketId: `RSS28-F-${suffix}`, orgId: first.id, rawMessage: "x", subject: "x", status: "resolved" }]) });
    assert.equal(forbiddenAuthority.status, 400, "client must not write server-owned ticket status");

    const duplicate = await createOrganization(cookie, `RSS-2.8 Customer ${suffix}`, "duplicate");
    console.log("RSS-2.8 probe: five organizations");
    assert.notEqual(duplicate.id, first.id, "duplicate display names must remain distinct");
    const others = [];
    for (let index = 0; index < 3; index += 1) others.push(await createOrganization(cookie, `RSS-2.8 Org ${index} ${suffix}`, `additional-${index}`));
    const all = (await json(await request("/api/organizations", { headers: headers(cookie) }))).data;
    assert.equal(all.length, 5, "five organizations must remain available");
    assert.equal(new Set(all.map((organization) => organization.id)).size, 5);
    for (const organization of [first, duplicate, others[0], others[1], others[2], first]) {
      const switched = await setActive(cookie, organization.id);
      assert.equal(switched.status, 200, "authorized switch must succeed");
      assert.equal((await json(switched)).data.activeOrganizationId, organization.id);
    }
    const invalid = await setActive(cookie, "org-rss-28-does-not-exist");
    assert.equal(invalid.status, 404, "invalid active organization must be rejected");
    const afterInvalid = await json(await request("/api/auth/active-organization", { headers: headers(cookie) }));
    assert.ok(all.some((organization) => organization.id === afterInvalid.data.activeOrganizationId), "invalid switch must not corrupt active context");

    const secondSignup = await request("/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "RSS-2.8 Second Customer", email: `rss-28-second-${suffix}@example.test`, password }) });
    console.log("RSS-2.8 probe: second customer");
    assert.equal(secondSignup.status, 201);
    const secondCookie = secondSignup.headers.get("set-cookie").split(";", 1)[0];
    assert.equal((await request(`/api/organizations/${first.id}/tickets?full=true`, { headers: headers(secondCookie) })).status, 403, "second customer must not read first customer's tickets");

    await request("/api/auth/logout", { method: "POST", headers: headers(cookie) });
    const login = await request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
    console.log("RSS-2.8 probe: relogin");
    assert.equal(login.status, 200, "logout/login must remain usable");
    cookie = login.headers.get("set-cookie").split(";", 1)[0];
    assert.equal((await json(await request("/api/organizations", { headers: headers(cookie) }))).data.length, 5, "login must restore memberships");
    assert.equal(await matureDigest(db), matureBefore, "mature organizations must remain unchanged during probe");
    console.log(`RSS-2.8 NEW_CUSTOMER_E2E_ACCEPTANCE_PROBE_PASS suffix=${suffix}`);
  } finally {
    if (userId) {
      const users = await db.query('SELECT id FROM users WHERE email IN ($1, $2)', [email, `rss-28-second-${suffix}@example.test`]);
      const ids = users.rows.map((row) => row.id);
      if (ids.length) await db.query('DELETE FROM auth_sessions WHERE "userId" = ANY($1::text[])', [ids]);
      if (ids.length) {
        const memberships = await db.query('SELECT DISTINCT "organizationId" FROM organization_memberships WHERE "userId" = ANY($1::text[])', [ids]);
        const disposableOrganizations = memberships.rows.map((row) => row.organizationId).filter((id) => !matureOrganizations.includes(id));
        if (disposableOrganizations.length) await db.query('DELETE FROM organizations WHERE id = ANY($1::text[])', [disposableOrganizations]);
      }
      if (ids.length) await db.query('DELETE FROM users WHERE id = ANY($1::text[])', [ids]);
    }
    await db.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
