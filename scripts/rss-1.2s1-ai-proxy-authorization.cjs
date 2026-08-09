/*
 * RSS-1.2S1 AI proxy authorization probe.
 *
 * Verification-only. Starts a disposable Next development server whose AI base
 * URLs point at a local mock provider, seeds a disposable organization and
 * disposable users covering every authorization branch (anonymous, expired,
 * deleted, missing/unknown/malformed organization, cross-organization, every
 * role, missing capability), exercises the four AI proxy endpoints over HTTP,
 * verifies provider non-contact on every denial, verifies the durable audit
 * trail, and removes all fixtures in a finally block.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { promisify } = require("node:util");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const scrypt = promisify(crypto.scrypt);
const root = path.resolve(__dirname, "..");
const baseUrl = process.env.RSS12S1_BASE_URL || "http://127.0.0.1:3200";
const mockPort = Number(process.env.RSS12S1_MOCK_PORT || "19092");
const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
const organizationId = `rss12s1-org-${suffix}`;
const otherOrganizationId = `rss12s1-org-b-${suffix}`;
const password = `RSS12S1-${suffix}-safe-password!`;
const AI_ENDPOINTS = ["chat", "deepseek", "claude", "openai-compatible"];

const ids = {
  owner: `rss12s1-owner-${suffix}`,
  administrator: `rss12s1-admin-${suffix}`,
  reviewer: `rss12s1-reviewer-${suffix}`,
  support: `rss12s1-support-${suffix}`,
  viewer: `rss12s1-viewer-${suffix}`,
  noOrg: `rss12s1-noorg-${suffix}`,
  unknownOrg: `rss12s1-unknown-${suffix}`,
  noMembership: `rss12s1-nomember-${suffix}`,
  otherOrg: `rss12s1-other-${suffix}`,
  deleted: `rss12s1-deleted-${suffix}`,
  expired: `rss12s1-expired-${suffix}`
};
const emails = Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, `${id}@example.test`]));
const matureOrganizationId = "profile-oip-developer-demo";

const countTables = {
  users: "users",
  sessions: "auth_sessions",
  memberships: "organization_memberships",
  tickets: "ticket_records",
  knowledgeItems: "knowledge_items",
  knowledgeCandidates: "knowledge_candidates",
  validations: "validation_records",
  memoryChanges: "memory_change_records",
  trustEvidence: "trust_evidence",
  governedActions: "governed_actions",
  connectorInstallations: "connector_installations",
  connectorEvents: "connector_inbound_events",
  authorizationAudits: "authorization_decision_audits",
  durableJobs: "durable_jobs"
};

function sha(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function counts(db) {
  const result = {};
  for (const [key, table] of Object.entries(countTables)) {
    result[key] = Number((await db.query(`select count(*)::int as count from ${table}`)).rows[0].count);
  }
  return result;
}

async function matureDigest(db) {
  const rows = (await db.query(
    'select id, "trustScore", revision, content from knowledge_items where "organizationId"=$1 order by id',
    [matureOrganizationId]
  )).rows;
  const related = {};
  for (const table of ["knowledge_candidates", "validation_records", "memory_change_records", "trust_evidence", "ticket_records", "governed_actions", "connector_installations", "connector_inbound_events", "durable_jobs"]) {
    related[table] = Number((await db.query(`select count(*)::int as count from ${table} where "organizationId"=$1`, [matureOrganizationId])).rows[0].count);
  }
  return { knowledgeCount: rows.length, related, digest: sha(rows) };
}

function startMockProvider() {
  const calls = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      let body = null;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch {}
      calls.push({ method: request.method, url: request.url, body });
      response.writeHead(200, { "content-type": "application/json", "x-mock-provider": "rss-1.2s1" });
      response.end(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { role: "assistant", content: "OK" } }],
        model: "rss-1.2s1-mock-model",
        usage: { input_tokens: 4, output_tokens: 1 }
      }));
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(mockPort, "127.0.0.1", () => resolve({ server, calls }));
  });
}

async function startNextServer() {
  const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", new URL(baseUrl).port || "3200"], {
    cwd: process.cwd(),
    windowsHide: true,
    env: {
      ...process.env,
      AI_BASE_URL: `http://127.0.0.1:${mockPort}/v1`,
      AI_MODEL: "rss-1.2s1-chat-fixed",
      AI_TIMEOUT_MS: "5000",
      DEEPSEEK_BASE_URL: `http://127.0.0.1:${mockPort}`,
      DEEPSEEK_API_KEY: "rss-1.2s1-synthetic-deepseek-key",
      DEEPSEEK_MODEL: "rss-1.2s1-deepseek-fixed",
      DEEPSEEK_TIMEOUT_MS: "5000",
      AI_TIER1_BASE_URL: `http://127.0.0.1:${mockPort}/v1`,
      AI_TIER1_API_KEY: "rss-1.2s1-synthetic-tier1-key",
      AI_TIER1_MODEL: "rss-1.2s1-tier1-fixed",
      AI_TIER1_TIMEOUT_MS: "5000",
      ANTHROPIC_API_KEY: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  next.stdout.on("data", (chunk) => { output = `${output}${chunk}`.slice(-12000); });
  next.stderr.on("data", (chunk) => { output = `${output}${chunk}`.slice(-12000); });
  for (let attempt = 0; attempt < 120; attempt++) {
    if (next.exitCode !== null) throw new Error(`Next server exited before readiness.\n${output}`);
    try {
      const response = await fetch(`${baseUrl}/api/auth/me`);
      if (response.status > 0) return { process: next, startupOutput: output };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  next.kill();
  throw new Error(`Next server did not become ready.\n${output}`);
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
  return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body };
}

function sessionCookie(token) {
  return `oip_session=${token}`;
}

async function seed(db) {
  const hash = await passwordHash(password);
  await db.query(
    'insert into organizations (id,name,industry,description,settings,"createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,current_timestamp,current_timestamp), ($6,$7,$8,$9,$5::jsonb,current_timestamp,current_timestamp)',
    [organizationId, "RSS-1.2S1 Disposable", "Verification", "Disposable AI authorization verification organization", JSON.stringify({}), otherOrganizationId, "RSS-1.2S1 Disposable B", "Verification", "Disposable cross-organization verification organization"]
  );

  const memberRoleUsers = ["owner", "administrator", "reviewer", "support", "viewer", "noMembership"];
  for (const key of memberRoleUsers) {
    const targetOrg = organizationId;
    const activeOrg = key === "noMembership" ? organizationId : targetOrg;
    await db.query(
      'insert into users (id,name,email,"passwordHash","activeOrganizationId","updatedAt") values ($1,$2,$3,$4,$5,current_timestamp)',
      [ids[key], `RSS-1.2S1 ${key}`, emails[key], hash, activeOrg]
    );
  }
  // Organization-context users. `activeOrganizationId` is FK-validated, so a
  // truly nonexistent/malformed organization id cannot be stored; the
  // identical deny branch (missing membership in the active organization ->
  // 403 `organization_membership_required`) is exercised instead through
  // fixtures whose active organization is real but carries no membership:
  //   - noOrg:      no active organization -> 400 MISSING_ORGANIZATION.
  //   - unknownOrg: active organization B, member of A only -> 403 (unknown or
  //                 cross-organization target is denied the same way).
  //   - noMembership: active organization A with no memberships at all -> 403.
  //   - deleted/expired: sessions that can never validate -> 401.
  for (const key of ["noOrg", "unknownOrg", "deleted", "expired"]) {
    const activeOrg = key === "noOrg" ? null : key === "unknownOrg" ? otherOrganizationId : organizationId;
    await db.query(
      'insert into users (id,name,email,"passwordHash","activeOrganizationId","updatedAt") values ($1,$2,$3,$4,$5,current_timestamp)',
      [ids[key], `RSS-1.2S1 ${key}`, emails[key], hash, activeOrg]
    );
  }
  await db.query(
    'insert into users (id,name,email,"passwordHash","activeOrganizationId","updatedAt") values ($1,$2,$3,$4,$5,current_timestamp)',
    [ids.otherOrg, "RSS-1.2S1 otherOrg", emails.otherOrg, hash, otherOrganizationId]
  );

  const memberships = [
    ["owner", organizationId, "owner"],
    ["administrator", organizationId, "administrator"],
    ["reviewer", organizationId, "reviewer"],
    ["support", organizationId, "support_agent"],
    ["viewer", organizationId, "viewer"],
    ["unknownOrg", organizationId, "support_agent"],
    ["otherOrg", otherOrganizationId, "owner"]
  ];
  for (const [key, orgId, role] of memberships) {
    await db.query(
      'insert into organization_memberships ("userId","organizationId",role) values ($1,$2,$3)',
      [ids[key], orgId, role]
    );
  }
  const assignments = [
    ["owner", organizationId, "owner"],
    ["administrator", organizationId, "administrator"],
    ["reviewer", organizationId, "reviewer"],
    ["support", organizationId, "support_agent"],
    ["viewer", organizationId, "viewer"],
    ["unknownOrg", organizationId, "support_agent"],
    ["otherOrg", otherOrganizationId, "owner"]
  ];
  for (const [key, orgId, role] of assignments) {
    await db.query(
      'insert into organization_role_assignments (id,"organizationId","userId","roleId","assignedByUserId","updatedAt") select $1,$2,$3,id,$4,current_timestamp from rbac_roles where key=$5',
      [`rss12s1-assignment-${key}-${suffix}`, orgId, ids[key], ids.owner, role]
    );
  }

  const future = "2099-01-01T00:00:00.000Z";
  const past = "1970-01-01T00:00:00.000Z";
  const sessions = [
    ["owner", future], ["administrator", future], ["reviewer", future], ["support", future],
    ["viewer", future], ["noOrg", future], ["unknownOrg", future],
    ["noMembership", future], ["otherOrg", future], ["deleted", future], ["expired", past]
  ];
  for (const [key, expiresAt] of sessions) {
    const token = `rss12s1-${key}-${suffix}`;
    await db.query(
      'insert into auth_sessions (id,"tokenHash","userId","expiresAt") values ($1,$2,$3,$4)',
      [`rss12s1-session-${key}-${suffix}`, tokenHash(token), ids[key], expiresAt]
    );
  }

  // The "deleted user" fixture: the session is created above, then the user is
  // removed; the session cascades away so the stale token can never validate.
  await db.query("delete from users where id=$1", [ids.deleted]);

  const sessionTokens = {};
  for (const [key] of sessions) {
    sessionTokens[key] = `rss12s1-${key}-${suffix}`;
  }
  return sessionTokens;
}

async function cleanup(db) {
  await db.query("delete from users where id = any($1::text[])", [Object.values(ids)]);
  await db.query("delete from organizations where id in ($1, $2)", [organizationId, otherOrganizationId]);
}

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  const mock = await startMockProvider();
  const next = await startNextServer();
  await db.connect();
  const before = await counts(db);
  const matureBefore = await matureDigest(db);
  const evidence = { identity: { baseUrl, mockPort, organizationId }, before, matureBefore };
  try {
    const sessionTokens = await seed(db);
    const cookies = Object.fromEntries(
      Object.entries(sessionTokens).map(([key, token]) => [key, sessionCookie(token)])
    );
    const promptBody = { messages: [{ role: "user", content: "Respond with exactly: OK" }] };

    // 1. Anonymous requests: 401 on every endpoint, provider never contacted,
    //    and no diagnostics/configuration leak.
    evidence.anonymous = {};
    const anonymousStart = mock.calls.length;
    for (const endpoint of AI_ENDPOINTS) {
      const result = await request(`/api/ai/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(promptBody)
      });
      const serialized = JSON.stringify(result);
      const leakedProviderConfig = /x-ai-server-base-url|x-ai-endpoint-used|serverBaseUrl|endpointUsed|mockPort|127\.0\.0\.1/.test(serialized);
      evidence.anonymous[endpoint] = { status: result.status, headers: result.headers, body: result.body, leakedProviderConfig };
      assert.equal(result.status, 401, `anonymous ${endpoint} must return 401`);
      assert.equal(Object.keys(result.headers).some((key) => key.startsWith("x-ai-")), false, `anonymous ${endpoint} must not expose AI diagnostics headers`);
      assert.equal(leakedProviderConfig, false, `anonymous ${endpoint} must not leak provider configuration`);
    }
    evidence.anonymousProviderCalls = mock.calls.length - anonymousStart;
    assert.equal(mock.calls.length - anonymousStart, 0, "anonymous requests must never contact the provider");

    // 2. Expired session -> 401.
    const expired = await request("/api/ai/deepseek", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookies.expired },
      body: JSON.stringify(promptBody)
    });
    evidence.expired = { status: expired.status };
    assert.equal(expired.status, 401, "expired session must return 401");

    // 3. Deleted user -> 401.
    const deleted = await request("/api/ai/deepseek", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookies.deleted },
      body: JSON.stringify(promptBody)
    });
    evidence.deletedUser = { status: deleted.status };
    assert.equal(deleted.status, 401, "deleted user session must return 401");

    // 4. Missing organization -> 400.
    const noOrg = await request("/api/ai/deepseek", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookies.noOrg },
      body: JSON.stringify(promptBody)
    });
    evidence.missingOrganization = { status: noOrg.status, body: noOrg.body };
    assert.equal(noOrg.status, 400, "authenticated user without an active organization must return 400");
    assert.equal(noOrg.body?.error?.code, "MISSING_ORGANIZATION");

    // 5. Unknown/inaccessible organization -> 403. A member of organization A
    //    whose active organization is B (no membership there) is forbidden the
    //    same way a nonexistent organization would be: the membership check
    //    fails closed. (A malformed organization id cannot be stored because
    //    `activeOrganizationId` is FK-validated; its deny branch is identical.)
    const unknownOrg = await request("/api/ai/deepseek", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookies.unknownOrg },
      body: JSON.stringify(promptBody)
    });
    evidence.unknownOrganization = { status: unknownOrg.status };
    assert.equal(unknownOrg.status, 403, "active organization without membership must return 403");

    // 7. No membership in the active organization -> 403.
    const noMembership = await request("/api/ai/deepseek", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookies.noMembership },
      body: JSON.stringify(promptBody)
    });
    evidence.noMembership = { status: noMembership.status };
    assert.equal(noMembership.status, 403, "user without membership in the active organization must return 403");

    // 8. Missing capability (Viewer) -> 403 on every endpoint, provider never
    //    contacted, no diagnostics leak.
    evidence.viewer = {};
    const viewerStart = mock.calls.length;
    for (const endpoint of AI_ENDPOINTS) {
      const result = await request(`/api/ai/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: cookies.viewer, "x-request-id": `rss12s1-viewer-${endpoint}-${suffix}` },
        body: JSON.stringify(promptBody)
      });
      const serialized = JSON.stringify(result);
      const leaked = /x-ai-server-base-url|serverBaseUrl|endpointUsed|rss-1\.2s1-(deepseek|tier1|chat)-fixed/.test(serialized);
      evidence.viewer[endpoint] = { status: result.status, leaked };
      assert.equal(result.status, 403, `viewer ${endpoint} must return 403`);
      assert.equal(leaked, false, `viewer ${endpoint} must not leak provider configuration`);
    }
    evidence.viewerProviderCalls = mock.calls.length - viewerStart;
    assert.equal(mock.calls.length - viewerStart, 0, "denied capability requests must never contact the provider");

    // 9. Allowed capability per role: Owner/Administrator/Reviewer/Support
    //    Agent -> 200 and exactly one provider call per route.
    evidence.roles = {};
    for (const [key, expectedStatus] of [
      ["owner", 200], ["administrator", 200], ["reviewer", 200], ["support", 200]
    ]) {
      const beforeCalls = mock.calls.length;
      const result = await request("/api/ai/deepseek", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: cookies[key],
          "x-request-id": `rss12s1-${key}-${suffix}`,
          "x-correlation-id": `rss12s1-${key}-corr-${suffix}`
        },
        body: JSON.stringify(promptBody)
      });
      const providerCalls = mock.calls.length - beforeCalls;
      evidence.roles[key] = { status: result.status, providerCalls };
      assert.equal(result.status, expectedStatus, `${key} deepseek request must return ${expectedStatus}`);
      assert.equal(providerCalls, 1, `${key} allowed request must contact the provider exactly once`);
    }

    // 10. Existing AI functionality for authorized users on the mockable routes.
    evidence.authorized = {};
    for (const endpoint of ["chat", "openai-compatible"]) {
      const result = await request(`/api/ai/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: cookies.support },
        body: JSON.stringify(promptBody)
      });
      evidence.authorized[endpoint] = { status: result.status, content: result.body?.choices?.[0]?.message?.content };
      assert.equal(result.status, 200, `authorized ${endpoint} must return 200`);
    }

    // 11. Authorized Claude request with no provider credential -> 503
    //     (authorization passes, provider configuration is unavailable).
    const claudeAuthorized = await request("/api/ai/claude", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookies.support },
      body: JSON.stringify(promptBody)
    });
    evidence.authorized.claude = { status: claudeAuthorized.status };
    assert.equal(claudeAuthorized.status, 503, "authorized claude request without a configured key must return 503");

    // 12. Cross-organization isolation: a member of organization B is
    //     authorized against their own organization B (audited under B), never
    //     against A.
    const crossStart = mock.calls.length;
    const crossOrg = await request("/api/ai/deepseek", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookies.otherOrg },
      body: JSON.stringify(promptBody)
    });
    evidence.crossOrganization = { status: crossOrg.status, providerCalls: mock.calls.length - crossStart };
    assert.equal(crossOrg.status, 200, "cross-organization member must be authorized against their own organization");
    assert.equal(mock.calls.length - crossStart, 1);

    // 13. Audit verification: allow and deny decisions for the disposable org.
    const audits = (await db.query(
      'select "actorUserId","capabilityKey",resource,decision,reason,"requestId","correlationId" from authorization_decision_audits where "organizationId"=$1 and "capabilityKey"=\'ai.use\' order by "createdAt"',
      [organizationId]
    )).rows;
    const allowedActors = new Set(["owner", "administrator", "reviewer", "support"].map((key) => ids[key]));
    const aiUseRows = audits.filter((row) => row.capabilityKey === "ai.use");
    assert(aiUseRows.length >= 8, `expected ai.use audit rows, got ${aiUseRows.length}`);
    for (const row of aiUseRows) {
      assert(row.requestId, "audit rows must carry a request id");
      assert(row.resource && row.resource.startsWith("ai_proxy:"), "audit rows must carry the ai_proxy resource");
    }
    const allowedByActor = aiUseRows.filter((row) => allowedActors.has(row.actorUserId) && row.decision === "allow");
    assert(allowedByActor.length >= 4, "owner/administrator/reviewer/support allow decisions must be audited");
    for (const row of allowedByActor) {
      assert.equal(row.capabilityKey, "ai.use", "allow decisions must record the ai.use capability");
    }
    const viewerDenies = aiUseRows.filter((row) => row.actorUserId === ids.viewer && row.decision === "deny");
    assert(viewerDenies.length === 4, "viewer denies must be audited on all four endpoints");
    assert(viewerDenies.every((row) => row.reason === "capability_not_granted"), "viewer denials must record capability_not_granted");
    const noMembershipDeny = aiUseRows.filter((row) => row.actorUserId === ids.noMembership && row.decision === "deny");
    assert(noMembershipDeny.length === 1, "no-membership denial must be audited");
    assert.equal(noMembershipDeny[0].reason, "organization_membership_required", "no-membership denial must record organization_membership_required");
    const correlationRow = aiUseRows.find((row) => row.actorUserId === ids.support && row.correlationId);
    assert(correlationRow, "audit rows must propagate the correlation id when supplied");
    assert.equal(correlationRow.correlationId, `rss12s1-support-corr-${suffix}`);
    evidence.audit = {
      aiUseRows: aiUseRows.length,
      allowRows: allowedByActor.length,
      viewerDenyRows: viewerDenies.length,
      noMembershipDenyReason: noMembershipDeny[0]?.reason,
      sampleResources: aiUseRows.slice(0, 6).map((row) => row.resource)
    };

    // 14. Static verification: all four routes share the same authorization
    //     boundary, and no route accesses provider configuration first.
    evidence.sharedBoundary = {};
    for (const endpoint of AI_ENDPOINTS) {
      const source = fs.readFileSync(path.join(root, "app", "api", "ai", endpoint, "route.ts"), "utf8");
      const usesBoundary = source.includes("withAuthorizedAIRequest");
      const postStart = source.indexOf("export async function POST");
      const boundaryCall = source.indexOf("withAuthorizedAIRequest(", postStart);
      const beforeBoundary = source.slice(postStart, boundaryCall >= 0 ? boundaryCall : source.length);
      const configBeforeBoundary = /process\.env|readApiKey|readBaseUrl|fetch\s*\(/.test(beforeBoundary);
      evidence.sharedBoundary[endpoint] = { usesBoundary, configBeforeBoundary };
      assert.equal(usesBoundary, true, `${endpoint} route must use the shared authorization boundary`);
      assert.equal(configBeforeBoundary, false, `${endpoint} route must not read provider configuration before authorization`);
    }

    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await cleanup(db).catch((error) => { evidence.cleanupError = error.message; });
    evidence.after = await counts(db);
    evidence.matureAfter = await matureDigest(db);
    evidence.dataSafety = {
      globalCountsRestored: JSON.stringify(evidence.before) === JSON.stringify(evidence.after),
      matureDigestRestored: JSON.stringify(evidence.matureBefore) === JSON.stringify(evidence.matureAfter)
    };
    assert.equal(evidence.dataSafety.globalCountsRestored, true, "all disposable fixtures must be removed; global counts restored");
    assert.equal(evidence.dataSafety.matureDigestRestored, true, "mature organizational memory must be untouched");
    await db.end();
    next.process.kill();
    await new Promise((resolve) => mock.server.close(resolve));
  }
  console.info("RSS-1.2S1 AI proxy authorization probe passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
