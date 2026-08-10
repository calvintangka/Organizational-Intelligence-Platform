/* RSS-2.3: disposable HTTP acceptance probe for account-to-first-tenant onboarding. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

require("dotenv").config({ path: ".env.local" });

const root = path.resolve(__dirname, "..");
const baseUrl = process.env.AUTH_PROBE_BASE_URL || "http://localhost:3000";
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const password = "RSS-23-Onboarding-Probe-password-2026!";
const identities = [];
const organizationIds = new Set();
let failureTrigger = null;

function email(label) { return `rss-23-${label}-${suffix}@example.test`; }
function key(label) { return `rss-23-${label}-${suffix}`; }
async function request(pathname, init = {}) { return fetch(`${baseUrl}${pathname}`, init); }
async function body(response) { return response.json().catch(() => null); }

function verifySourceContract() {
  const signupRoute = fs.readFileSync(path.join(root, "app", "api", "auth", "signup", "route.ts"), "utf8");
  const service = fs.readFileSync(path.join(root, "lib", "server", "accountCreationService.ts"), "utf8");
  const page = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
  assert.match(signupRoute, /auth\.signup\.ip/);
  assert.match(signupRoute, /auth\.signup\.account/);
  assert.match(signupRoute, /sessionCookieOptions/);
  assert.match(service, /hashPassword/);
  assert.match(service, /createSessionWithClient/);
  assert.match(service, /prisma\.\$transaction/);
  assert.match(page, /FirstOrganizationOnboarding/);
  assert.match(page, /authorizedProfiles\.length === 0/);
}

async function signup(input) {
  return request("/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
}

async function signupSuccess(input, message) {
  const response = await signup(input);
  const payload = await body(response);
  assert.equal(response.status, 201, `${message}: ${payload?.error?.message ?? response.status}`);
  assert.deepEqual(Object.keys(payload.data).sort(), ["email", "id", "name"], "signup response must expose only safe user fields");
  assert.equal(Object.hasOwn(payload.data, "passwordHash"), false, "signup must never return password hash");
  assert.equal(Object.hasOwn(payload.data, "token"), false, "signup must never return session token in JSON");
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie?.includes("HttpOnly"), "signup session must be HttpOnly");
  assert.match(setCookie, /SameSite=Lax/i, "signup session must retain SameSite=Lax");
  const cookie = setCookie.split(";", 1)[0];
  identities.push({ id: payload.data.id, email: payload.data.email, name: payload.data.name });
  return { user: payload.data, cookie };
}

async function login(emailAddress) {
  const response = await request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: emailAddress, password }) });
  assert.equal(response.status, 200, "new account must log in");
  return response.headers.get("set-cookie").split(";", 1)[0];
}

async function createOrganization(cookie, name, idempotencyKey) {
  const response = await request("/api/organizations", {
    method: "POST",
    headers: { cookie, "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify({ name, industry: "General" })
  });
  const payload = await body(response);
  assert.ok(response.status === 200 || response.status === 201, `first organization creation must succeed: ${payload?.error?.message ?? response.status}`);
  organizationIds.add(payload.data.organization.id);
  return payload.data;
}

async function active(cookie, organizationId) {
  return request("/api/auth/active-organization", { method: "PUT", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ organizationId }) });
}

async function main() {
  verifySourceContract();
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const accountA = await signupSuccess({ name: "RSS-2.3 Account A", email: `  ${email("A").toUpperCase()}  `, password }, "signup must succeed");
    assert.equal(accountA.user.email, email("a"), "signup email identity must normalize case and whitespace");
    const accountARow = await db.query('SELECT "passwordHash" FROM users WHERE id = $1', [accountA.user.id]);
    assert.equal(accountARow.rowCount, 1, "signup account must persist");
    assert.notEqual(accountARow.rows[0].passwordHash, password, "password must not be stored in plaintext");
    assert.match(accountARow.rows[0].passwordHash, /^scrypt-v1\$/);

    const zeroOrganizations = await request("/api/organizations", { headers: { cookie: accountA.cookie } });
    assert.deepEqual((await body(zeroOrganizations)).data, [], "new signup must begin with zero organizations");
    const zeroActive = await request("/api/auth/active-organization", { headers: { cookie: accountA.cookie } });
    const zeroActiveBody = await body(zeroActive);
    assert.equal(zeroActive.status, 200, "zero-organization active context is valid");
    assert.equal(zeroActiveBody.data.activeOrganizationId, null, "zero-organization user must have no active tenant");
    const refreshedIdentity = await request("/api/auth/me", { headers: { cookie: accountA.cookie } });
    assert.equal(refreshedIdentity.status, 200, "signup session must survive refresh-style reads");
    const arbitraryRead = await request("/api/organizations/profile-oip-developer-demo/knowledge", { headers: { cookie: accountA.cookie } });
    assert.equal(arbitraryRead.status, 403, "zero-organization user must not read a demo tenant");

    const logoutBefore = await request("/api/auth/logout", { method: "POST", headers: { cookie: accountA.cookie } });
    assert.equal(logoutBefore.status, 200, "logout before first organization must succeed");
    assert.equal((await request("/api/auth/me", { headers: { cookie: accountA.cookie } })).status, 401, "logout must invalidate signup session");
    const reloggedA = await login(accountA.user.email);
    const stillZero = await request("/api/organizations", { headers: { cookie: reloggedA } });
    assert.deepEqual((await body(stillZero)).data, [], "logout/login must preserve valid zero-organization state");

    const firstKey = key("first-org");
    const first = await createOrganization(reloggedA, `RSS-2.3 Org A ${suffix}`, firstKey);
    const replay = await createOrganization(reloggedA, `RSS-2.3 Org A ${suffix}`, firstKey);
    assert.equal(replay.organization.id, first.organization.id, "first-organization retry must be idempotent");
    const orgA = first.organization.id;
    const switchedA = await active(reloggedA, orgA);
    assert.equal(switchedA.status, 200, "first organization must become selectable/active through RSS-2.1 contract");
    const membershipA = await db.query('SELECT m.role, r.key AS role_key FROM organization_memberships m JOIN organization_role_assignments a ON a."userId" = m."userId" AND a."organizationId" = m."organizationId" JOIN rbac_roles r ON r.id = a."roleId" WHERE m."userId" = $1 AND m."organizationId" = $2', [accountA.user.id, orgA]);
    assert.deepEqual(membershipA.rows, [{ role: "owner", role_key: "owner" }], "first creator must be the only Owner membership");
    const membershipsA = await db.query('SELECT "organizationId" FROM organization_memberships WHERE "userId" = $1', [accountA.user.id]);
    assert.deepEqual(membershipsA.rows, [{ organizationId: orgA }], "new account must receive exactly its intended first membership");
    const empty = await db.query(`SELECT (SELECT COUNT(*)::int FROM knowledge_items WHERE "organizationId" = $1) AS knowledge, (SELECT COUNT(*)::int FROM ticket_records WHERE "organizationId" = $1) AS tickets, (SELECT COUNT(*)::int FROM knowledge_candidates WHERE "organizationId" = $1) AS candidates, (SELECT COUNT(*)::int FROM validation_records WHERE "organizationId" = $1) AS validations, (SELECT COUNT(*)::int FROM memory_change_records WHERE "organizationId" = $1) AS memory, (SELECT COUNT(*)::int FROM trust_evidence WHERE "organizationId" = $1) AS evidence, (SELECT COUNT(*)::int FROM emerging_patterns WHERE "organizationId" = $1) AS patterns`, [orgA]);
    for (const count of Object.values(empty.rows[0])) assert.equal(Number(count), 0, "first tenant must start empty");

    const logoutAfter = await request("/api/auth/logout", { method: "POST", headers: { cookie: reloggedA } });
    assert.equal(logoutAfter.status, 200);
    const restoredA = await login(accountA.user.email);
    const afterFirstLogin = await request("/api/organizations", { headers: { cookie: restoredA } });
    assert.ok((await body(afterFirstLogin)).data.some((organization) => organization.id === orgA), "logout/login must restore first tenant membership");

    const accountB = await signupSuccess({ name: "RSS-2.3 Account B", email: email("b"), password }, "second signup must succeed");
    const accountBOrganizations = await body(await request("/api/organizations", { headers: { cookie: accountB.cookie } }));
    assert.deepEqual(accountBOrganizations.data, [], "second account must also begin empty");
    const firstB = await createOrganization(accountB.cookie, `RSS-2.3 Org B ${suffix}`, key("first-org-b"));
    const orgB = firstB.organization.id;
    assert.equal((await active(accountB.cookie, orgB)).status, 200);
    assert.equal((await request(`/api/organizations/${encodeURIComponent(orgA)}/knowledge`, { headers: { cookie: accountB.cookie } })).status, 403, "account B cannot read account A tenant");
    assert.equal((await request(`/api/organizations/${encodeURIComponent(orgB)}/knowledge`, { headers: { cookie: restoredA } })).status, 403, "account A cannot read account B tenant");

    // Controlled first-organization failure proves that a valid account remains
    // retryable and that the organization transaction leaves no partial tenant.
    const accountC = await signupSuccess({ name: "RSS-2.3 Account C", email: email("c"), password }, "third signup must succeed");
    const firstFailureName = `RSS-2.3 Retry Org ${suffix}`;
    const firstFailureKey = key("first-org-retry");
    const firstFunctionName = `rss_23_fail_first_org_${suffix.replace(/-/g, "_")}`;
    const firstTriggerName = `rss_23_fail_first_org_trigger_${suffix.replace(/-/g, "_")}`;
    await db.query(`CREATE OR REPLACE FUNCTION ${firstFunctionName}() RETURNS trigger AS $$ BEGIN IF NEW."userId" = '${accountC.user.id}' THEN RAISE EXCEPTION 'RSS-2.3 disposable first-organization provisioning failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await db.query(`CREATE TRIGGER ${firstTriggerName} BEFORE INSERT ON organization_memberships FOR EACH ROW EXECUTE FUNCTION ${firstFunctionName}()`);
    failureTrigger = { functionName: firstFunctionName, triggerName: firstTriggerName, table: "organization_memberships" };
    const failedFirstOrganization = await request("/api/organizations", {
      method: "POST",
      headers: { cookie: accountC.cookie, "content-type": "application/json", "idempotency-key": firstFailureKey },
      body: JSON.stringify({ name: firstFailureName, industry: "General" })
    });
    assert.equal(failedFirstOrganization.status, 500, "first-organization provisioning failure must be safe");
    assert.equal((await request("/api/auth/me", { headers: { cookie: accountC.cookie } })).status, 200, "account must remain valid after first-organization failure");
    assert.deepEqual((await body(await request("/api/organizations", { headers: { cookie: accountC.cookie } }))).data, [], "failed first organization must not create a membership");
    assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM organizations WHERE name = $1', [firstFailureName])).rows[0].count, 0, "failed first organization must roll back tenant creation");
    await db.query(`DROP TRIGGER ${firstTriggerName} ON organization_memberships`);
    await db.query(`DROP FUNCTION ${firstFunctionName}()`);
    failureTrigger = null;
    const retriedFirstOrganization = await createOrganization(accountC.cookie, firstFailureName, firstFailureKey);
    assert.equal((await active(accountC.cookie, retriedFirstOrganization.organization.id)).status, 200, "first organization must be retryable after failure");

    const duplicate = await signup({ name: "Duplicate", email: accountA.user.email, password: "Different-password-2026!" });
    assert.equal(duplicate.status, 409, "duplicate signup must be rejected");
    const concurrentEmail = email("concurrent");
    const concurrent = await Promise.all([signup({ name: "Concurrent", email: concurrentEmail, password }), signup({ name: "Concurrent", email: concurrentEmail.toUpperCase(), password })]);
    assert.equal(concurrent.filter((response) => response.status === 201).length, 1, "concurrent duplicate signup creates one account");
    assert.equal(concurrent.filter((response) => response.status === 409).length, 1, "concurrent duplicate signup rejects the duplicate safely");
    const concurrentUser = await db.query('SELECT id, email FROM users WHERE email = $1', [concurrentEmail]);
    assert.equal(concurrentUser.rowCount, 1, "concurrent signup leaves one identity");
    identities.push(concurrentUser.rows[0]);

    for (const forbidden of [{ id: "client-id", name: "Bad", email: email("bad-id"), password }, { role: "owner", name: "Bad", email: email("bad-role"), password }, { organizationId: "profile-oip-developer-demo", name: "Bad", email: email("bad-org"), password }]) {
      assert.equal((await signup(forbidden)).status, 400, "server-only signup fields must be rejected");
    }
    for (const invalid of [{ name: "Bad", email: "not-an-email", password }, { name: "Bad", email: email("short-password"), password: "short" }, { name: "Bad", email: "x".repeat(250) + "@x.test", password }]) {
      assert.equal((await signup(invalid)).status, 400, "invalid signup identity input must be rejected");
    }

    // Controlled auth-session failure proves signup's user/session transaction
    // leaves no partial user identity when session provisioning fails.
    const failureEmail = email("session-failure");
    const functionName = `rss_23_fail_signup_session_${suffix.replace(/-/g, "_")}`;
    const triggerName = `rss_23_fail_signup_session_trigger_${suffix.replace(/-/g, "_")}`;
    await db.query(`CREATE OR REPLACE FUNCTION ${functionName}() RETURNS trigger AS $$ BEGIN IF EXISTS (SELECT 1 FROM users WHERE id = NEW."userId" AND email = '${failureEmail}') THEN RAISE EXCEPTION 'RSS-2.3 disposable session provisioning failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await db.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON auth_sessions FOR EACH ROW EXECUTE FUNCTION ${functionName}()`);
    failureTrigger = { functionName, triggerName, table: "auth_sessions" };
    assert.equal((await signup({ name: "Failure", email: failureEmail, password })).status, 500, "session provisioning failure must return safe error");
    assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM users WHERE email = $1', [failureEmail])).rows[0].count, 0, "session failure must roll back account");
    await db.query(`DROP TRIGGER ${triggerName} ON auth_sessions`);
    await db.query(`DROP FUNCTION ${functionName}()`);
    failureTrigger = null;

    console.log("RSS-2.3 account-first-organization onboarding probe passed.");
  } finally {
    if (failureTrigger) {
      await db.query(`DROP TRIGGER IF EXISTS ${failureTrigger.triggerName} ON ${failureTrigger.table}`);
      await db.query(`DROP FUNCTION IF EXISTS ${failureTrigger.functionName}()`);
    }
    const ids = identities.map((identity) => identity.id);
    if (ids.length) await db.query('DELETE FROM auth_sessions WHERE "userId" = ANY($1::text[])', [ids]);
    if (organizationIds.size) await db.query('DELETE FROM organizations WHERE id = ANY($1::text[])', [[...organizationIds]]);
    if (ids.length) await db.query('DELETE FROM users WHERE id = ANY($1::text[])', [ids]);
    await db.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
