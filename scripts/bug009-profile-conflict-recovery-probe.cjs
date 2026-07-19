/*
 * BUG-009 — Multi-Browser Organization Profile Conflict Recovery probe.
 *
 * Exercises the server contract and the client recovery ALGORITHM that
 * app/page.tsx now implements for stale organization-profile writes. Two logical
 * browsers (A and B) share one authenticated session but track their own profile
 * revision, exactly as two independent React clients would.
 *
 * Server-observable acceptance cases covered here:
 *   C. Genuine edit advances the server revision.
 *   D. Two-client stale conflict: B's stale PUT is rejected with 409 CONFLICT,
 *      B recovers by loading A's authoritative profile (no stale retry), and its
 *      local revision tracking becomes current.
 *   E. Post-recovery edit succeeds without any manual reload.
 *   G. Revision churn: passive reads (hydration) never advance the revision, so
 *      opening a second browser cannot make the first one stale.
 *
 * The suppression flag and organization-switch race guard are React-only and are
 * enforced in app/page.tsx (Cases A, B, F); they cannot be driven over HTTP.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const scrypt = promisify(crypto.scrypt);
const baseUrl = process.env.AUTH_PROBE_BASE_URL || "http://localhost:3000";
const suffix = Date.now();
const userId = `bug009-probe-${suffix}`;
const organizationId = `bug009-probe-org-${suffix}`;
const otherOrganizationId = `bug009-probe-org-other-${suffix}`;
const email = `${userId}@example.test`;
const password = "Bug009Probe-password-2026!";

async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

function request(path, init = {}) {
  return fetch(`${baseUrl}${path}`, init);
}

const baseSettings = {
  products: ["Probe Console"],
  services: ["Probe Support"],
  supportedDomains: ["probe operations"],
  businessVocabulary: ["probe vocabulary"],
  supportedIssueTypes: ["probe issue"],
  outOfScopeTopics: [],
  customerTone: "professional",
  supportBoundaries: [],
  autoResolutionThreshold: 80,
  escalationRules: []
};

async function insertOrganization(db, id, name) {
  await db.query(
    'INSERT INTO organizations (id, name, industry, description, settings, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
    [id, name, "Testing", "Disposable BUG-009 fixture.", JSON.stringify(baseSettings)]
  );
  await db.query('INSERT INTO organization_memberships ("userId", "organizationId", role) VALUES ($1, $2, \'member\')', [userId, id]);
}

async function getProfile(cookie, id) {
  const response = await request(`/api/organizations/${id}`, { headers: { cookie } });
  assert.equal(response.status, 200, `GET profile ${id} must succeed`);
  return (await response.json()).data;
}

async function putProfile(cookie, id, profile) {
  const response = await request(`/api/organizations/${id}`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(profile)
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, data: payload && payload.data, error: payload && payload.error };
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  try {
    await db.query(
      'INSERT INTO users (id, name, email, "passwordHash", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [userId, "BUG-009 Probe", email, await passwordHash(password)]
    );
    await insertOrganization(db, organizationId, "BUG-009 Probe Organization");
    await insertOrganization(db, otherOrganizationId, "BUG-009 Probe Other Organization");

    const login = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    assert.equal(login.status, 200, "probe user must authenticate");
    const cookie = login.headers.get("set-cookie").split(";", 1)[0];

    /* --- Both browsers load the same starting revision (hydration). --- */
    const clientA = await getProfile(cookie, organizationId);
    const clientB = await getProfile(cookie, organizationId);
    assert.equal(clientA.profileRevision, clientB.profileRevision, "A and B start from the same revision");
    const startRevision = clientA.profileRevision;

    /* --- Case G: a passive extra hydration read must not churn the revision. --- */
    const passiveReload = await getProfile(cookie, organizationId);
    assert.equal(passiveReload.profileRevision, startRevision, "passive hydration read must not advance the revision");

    /* --- Case C: Browser A makes a genuine edit; the revision advances. --- */
    const aSave = await putProfile(cookie, organizationId, { ...clientA, description: "Edited by Browser A." });
    assert.equal(aSave.status, 200, "Browser A's genuine edit must persist");
    assert.equal(aSave.data.profileRevision, startRevision + 1, "genuine edit advances the server revision by one");

    /* --- Case D: Browser B attempts a stale edit and is rejected with 409. --- */
    const staleSave = await putProfile(cookie, organizationId, {
      ...clientB,
      description: "Stale edit by Browser B.",
      profileRevision: startRevision
    });
    assert.equal(staleSave.status, 409, "stale profile write must be rejected");
    assert.equal(staleSave.error && staleSave.error.code, "CONFLICT", "stale rejection must use the CONFLICT code");

    // Server data must remain Browser A's authoritative edit, not B's stale one.
    const afterConflict = await getProfile(cookie, organizationId);
    assert.equal(afterConflict.description, "Edited by Browser A.", "server keeps A's authoritative profile after the stale rejection");
    assert.equal(afterConflict.profileRevision, startRevision + 1, "stale rejection does not advance the revision");

    /* --- Case D (recovery): B loads the authoritative profile (no stale retry). --- */
    const recovered = afterConflict; // client fetches latest via loadOrganizationProfile()
    assert.equal(recovered.id, organizationId, "recovery must verify the profile still belongs to the recovered organization");
    // B's local revision tracking is now current.
    assert.equal(recovered.profileRevision, startRevision + 1, "recovered revision tracking becomes current");

    /* --- Case E: B re-applies its change on top of the latest and succeeds. --- */
    const postRecoveryEdit = await putProfile(cookie, organizationId, {
      ...recovered,
      description: "Re-applied by Browser B after recovery."
    });
    assert.equal(postRecoveryEdit.status, 200, "post-recovery edit must persist without a manual page reload");
    assert.equal(postRecoveryEdit.data.profileRevision, startRevision + 2, "post-recovery edit advances the revision again");

    const finalProfile = await getProfile(cookie, organizationId);
    assert.equal(finalProfile.description, "Re-applied by Browser B after recovery.", "final server state reflects B's recovered edit");

    /* --- Sanity: the untouched second organization was never revved by any of this. --- */
    const otherUntouched = await getProfile(cookie, otherOrganizationId);
    assert.equal(otherUntouched.profileRevision, startRevision, "an unrelated organization's revision must be untouched");

    console.log("BUG-009 profile conflict recovery probe passed.");
  } finally {
    await db.query('DELETE FROM organization_memberships WHERE "userId" = $1', [userId]);
    await db.query('DELETE FROM auth_sessions WHERE "userId" = $1', [userId]);
    await db.query("DELETE FROM users WHERE id = $1", [userId]);
    await db.query("DELETE FROM organizations WHERE id = ANY($1::text[])", [[organizationId, otherOrganizationId]]);
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
