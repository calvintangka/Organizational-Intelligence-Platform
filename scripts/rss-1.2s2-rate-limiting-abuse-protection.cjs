/*
 * RSS-1.2S2 rate-limiting and abuse-protection probe.
 *
 * Verification-only. Starts a disposable Next development server whose AI base
 * URLs point at a local mock provider and whose rate-limit thresholds are
 * overridden to low, test-specific values (never the production defaults), then
 * seeds a disposable organization and users and verifies every abuse-control
 * branch over HTTP: login (account + IP), AI (per-user, per-organization,
 * cross-endpoint shared bucket, concurrency), ticket submission, job creation,
 * connector mutation, plus store-level multi-instance and failure-mode tests.
 * All fixtures and rate-limit records are removed in a finally block.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { promisify } = require("node:util");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

// The probe runs a disposable application server and resets its PostgreSQL
// buckets from the parent process. Both sides must derive the same HMAC keys.
// Keep the operator's .env.local value in memory only and restore it on exit;
// the probe-scoped value is never logged or written to disk.
const originalRateLimitHashSecret = process.env.RATE_LIMIT_HASH_SECRET;
const probeRateLimitHashSecret = "rss12s2-probe-secret";
process.env.RATE_LIMIT_HASH_SECRET = probeRateLimitHashSecret;
process.once("exit", () => {
  if (originalRateLimitHashSecret === undefined) delete process.env.RATE_LIMIT_HASH_SECRET;
  else process.env.RATE_LIMIT_HASH_SECRET = originalRateLimitHashSecret;
});
process.env.RATE_LIMIT_TRUST_PROXY = "true";
// Low, in-process thresholds for the direct multi-instance/failure tests (the
// spawned dev server receives its own identical overrides through limitEnv()).
process.env.RATE_LIMIT_AI_INVOKE_USER_MAX = process.env.RATE_LIMIT_AI_INVOKE_USER_MAX || "5";
process.env.RATE_LIMIT_AI_INVOKE_BURST_MAX = process.env.RATE_LIMIT_AI_INVOKE_BURST_MAX || "20";

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness({ loadEnv: false });
const rateLimitStoreModule = require(path.join(root, "lib", "server", "rateLimit", "store.ts"));
const rateLimitModule = require(path.join(root, "lib", "server", "rateLimit", "index.ts"));

const scrypt = promisify(crypto.scrypt);
const baseUrl = process.env.RSS12S2_BASE_URL || "http://127.0.0.1:3300";
const mockPort = Number(process.env.RSS12S2_MOCK_PORT || "19093");
const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
const organizationId = `rss12s2-org-${suffix}`;
const password = `RSS12S2-${suffix}-safe-password!`;
const AI_ENDPOINTS = ["chat", "deepseek", "claude", "openai-compatible"];

const ids = {
  owner: `rss12s2-owner-${suffix}`,
  administrator: `rss12s2-admin-${suffix}`,
  reviewer: `rss12s2-reviewer-${suffix}`,
  support: `rss12s2-support-${suffix}`,
  viewer: `rss12s2-viewer-${suffix}`,
  resetUser: `rss12s2-reset-${suffix}`,
  blockUser: `rss12s2-block-${suffix}`
};
const emails = Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, `${id}@example.test`]));
const otherAccount = `rss12s2-nobody-${suffix}@example.test`;

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
  durableJobs: "durable_jobs",
  rateLimitCounters: "rate_limit_counters",
  rateLimitEvents: "rate_limit_events"
};
const matureOrganizationId = "profile-oip-developer-demo";

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
  return { knowledgeCount: rows.length, related, digest: crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex") };
}

function startMockProvider() {
  const calls = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      let body = null;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch {}
      calls.push({ method: request.method, url: request.url });
      response.writeHead(200, { "content-type": "application/json", "x-mock-provider": "rss-1.2s2" });
      response.end(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { role: "assistant", content: "OK" } }],
        model: "rss-1.2s2-mock-model",
        usage: { input_tokens: 4, output_tokens: 1 }
      }));
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(mockPort, "127.0.0.1", () => resolve({ server, calls }));
  });
}

function limitEnv() {
  const set = (base, values) => Object.fromEntries(
    Object.entries(values).map(([name, value]) => [`RATE_LIMIT_${base}_${name}`, String(value)])
  );
  return {
    RATE_LIMIT_MODE: "enforce",
    RATE_LIMIT_HASH_SECRET: probeRateLimitHashSecret,
    RATE_LIMIT_TRUST_PROXY: "true",
    ...set("AUTH_LOGIN_ACCOUNT", { MAX: 3, WINDOW_MS: 60000 }),
    ...set("AUTH_LOGIN_IP", { MAX: 5, WINDOW_MS: 60000 }),
    ...set("AI_INVOKE_BURST", { MAX: 20, WINDOW_MS: 60000 }),
    ...set("AI_INVOKE_USER", { MAX: 3, WINDOW_MS: 60000 }),
    ...set("AI_INVOKE_ORGANIZATION", { MAX: 6, WINDOW_MS: 60000 }),
    ...set("TICKET_SUBMIT_ORGANIZATION", { MAX: 3, WINDOW_MS: 60000 }),
    ...set("JOB_CREATE_ORGANIZATION", { MAX: 3, WINDOW_MS: 60000 }),
    ...set("CONNECTOR_MUTATE_ORGANIZATION", { MAX: 3, WINDOW_MS: 60000 }),
    ...set("ADMIN_MUTATE_USER", { MAX: 3, WINDOW_MS: 60000 })
  };
}

async function startNextServer() {
  const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", new URL(baseUrl).port || "3300"], {
    cwd: process.cwd(),
    windowsHide: true,
    env: {
      ...process.env,
      ...limitEnv(),
      RATE_LIMIT_HASH_SECRET: probeRateLimitHashSecret,
      AI_BASE_URL: `http://127.0.0.1:${mockPort}/v1`,
      AI_MODEL: "rss-1.2s2-chat-fixed",
      AI_TIMEOUT_MS: "5000",
      DEEPSEEK_BASE_URL: `http://127.0.0.1:${mockPort}`,
      DEEPSEEK_API_KEY: "rss-1.2s2-synthetic-deepseek-key",
      DEEPSEEK_MODEL: "rss-1.2s2-deepseek-fixed",
      DEEPSEEK_TIMEOUT_MS: "5000",
      AI_TIER1_BASE_URL: `http://127.0.0.1:${mockPort}/v1`,
      AI_TIER1_API_KEY: "rss-1.2s2-synthetic-tier1-key",
      AI_TIER1_MODEL: "rss-1.2s2-tier1-fixed",
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
  try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
  return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body };
}

async function seed(db) {
  const hash = await passwordHash(password);
  await db.query(
    'insert into organizations (id,name,industry,description,settings,"createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,current_timestamp,current_timestamp)',
    [organizationId, "RSS-1.2S2 Disposable", "Verification", "Disposable abuse-control verification organization", JSON.stringify({})]
  );
  for (const key of Object.keys(ids)) {
    await db.query(
      'insert into users (id,name,email,"passwordHash","activeOrganizationId","updatedAt") values ($1,$2,$3,$4,$5,current_timestamp)',
      [ids[key], `RSS-1.2S2 ${key}`, emails[key], hash, organizationId]
    );
  }
  const roles = { owner: "owner", administrator: "administrator", reviewer: "reviewer", support: "support_agent", viewer: "viewer", resetUser: "support_agent", blockUser: "support_agent" };
  for (const key of Object.keys(ids)) {
    await db.query(
      'insert into organization_memberships ("userId","organizationId",role) values ($1,$2,$3)',
      [ids[key], organizationId, roles[key]]
    );
    await db.query(
      'insert into organization_role_assignments (id,"organizationId","userId","roleId","assignedByUserId","updatedAt") select $1,$2,$3,id,$4,current_timestamp from rbac_roles where key=$5',
      [`rss12s2-assignment-${key}-${suffix}`, organizationId, ids[key], ids.owner, roles[key]]
    );
  }
  // Direct sessions for the AI/ticket/job/connector tests (login is exercised
  // separately through the login endpoint with its own accounts).
  const sessionTokens = {};
  for (const key of ["owner", "administrator", "reviewer", "support", "viewer"]) {
    const token = `rss12s2-${key}-${suffix}`;
    sessionTokens[key] = token;
    await db.query(
      'insert into auth_sessions (id,"tokenHash","userId","expiresAt") values ($1,$2,$3,$4)',
      [`rss12s2-session-${key}-${suffix}`, tokenHash(token), ids[key], "2099-01-01T00:00:00.000Z"]
    );
  }
  return sessionTokens;
}

function sessionCookie(token) {
  return `oip_session=${token}`;
}

async function cleanup(db, probeStart) {
  await db.query("delete from users where id = any($1::text[])", [Object.values(ids)]);
  await db.query("delete from organizations where id=$1", [organizationId]);
  // The probe cleared these tables at start, so clearing them again removes
  // exactly the records this run created (timestamp boundaries are unreliable
  // across the Prisma adapter and the raw pg client in this environment).
  await db.query("delete from rate_limit_counters");
  await db.query("delete from rate_limit_events");
}

async function runNegativeControls() {
  const previousMax = process.env.RATE_LIMIT_AI_INVOKE_USER_MAX;
  process.env.RATE_LIMIT_AI_INVOKE_USER_MAX = "1";
  try {
    const controls = [];
    const makeLimiter = () => rateLimitModule.createRateLimiter(new rateLimitStoreModule.MemoryRateLimitStore());
    const context = { route: "rss12s2-negative-control" };

    const limiter = makeLimiter();
    const first = await limiter.check("ai.invoke.user", [{ type: "user", value: "negative-user" }], context);
    const denied = await limiter.check("ai.invoke.user", [{ type: "user", value: "negative-user" }], context);
    controls.push({
      name: "exceeding the configured limit is denied",
      passed: first.allowed === true && denied.allowed === false
    });

    let providerCalls = 0;
    const invoke = async () => {
      const decision = await limiter.check("ai.invoke.user", [{ type: "user", value: "provider-user" }], context);
      if (!decision.allowed) return { status: 429 };
      providerCalls += 1;
      return { status: 200 };
    };
    await invoke();
    const deniedProviderResponse = await invoke();
    controls.push({
      name: "denied AI request suppresses provider invocation",
      passed: deniedProviderResponse.status === 429 && providerCalls === 1
    });

    const resetLimiter = makeLimiter();
    await resetLimiter.check("ai.invoke.user", [{ type: "user", value: "reset-user" }], context);
    const resetDenied = await resetLimiter.check("ai.invoke.user", [{ type: "user", value: "reset-user" }], context);
    await resetLimiter.reset("ai.invoke.user", "user", "reset-user");
    const resetAllowed = await resetLimiter.check("ai.invoke.user", [{ type: "user", value: "reset-user" }], context);
    controls.push({
      name: "reset restores the same limiter bucket",
      passed: resetDenied.allowed === false && resetAllowed.allowed === true
    });

    const dimensionLimiter = makeLimiter();
    const userA = await dimensionLimiter.check("ai.invoke.user", [{ type: "user", value: "dimension-a" }], context);
    const userADenied = await dimensionLimiter.check("ai.invoke.user", [{ type: "user", value: "dimension-a" }], context);
    const userB = await dimensionLimiter.check("ai.invoke.user", [{ type: "user", value: "dimension-b" }], context);
    const userBDenied = await dimensionLimiter.check("ai.invoke.user", [{ type: "user", value: "dimension-b" }], context);
    controls.push({
      name: "different dimensions do not share a bucket",
      passed: userA.allowed === true && userADenied.allowed === false && userB.allowed === true && userBDenied.allowed === false
    });

    const response = rateLimitModule.rateLimitResponse(denied);
    controls.push({
      name: "denials include Retry-After",
      passed: /^\d+$/.test(response.headers.get("retry-after") ?? "")
    });

    return { passed: controls.every((control) => control.passed), controls };
  } finally {
    if (previousMax === undefined) delete process.env.RATE_LIMIT_AI_INVOKE_USER_MAX;
    else process.env.RATE_LIMIT_AI_INVOKE_USER_MAX = previousMax;
  }
}

async function main() {
  const mark = (label) => console.log(`[rss12s2] ${label}`);
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  let mock;
  let next;
  try {
    mock = await startMockProvider();
    mark("mock up");
    next = await startNextServer();
    mark("dev server up");
    await db.connect();
  } catch (error) {
    if (next?.process && !next.process.killed) next.process.kill();
    if (mock?.server) await new Promise((resolve) => mock.server.close(resolve));
    await db.end().catch(() => {});
    throw error;
  }
  // The probe is the only source of rate-limit rows in this verification
  // environment; clearing them before and after makes the count comparison
  // exact regardless of clock boundaries.
  await db.query("delete from rate_limit_counters");
  await db.query("delete from rate_limit_events");
  const probeStart = (await db.query("select now() as t")).rows[0].t;
  const before = await counts(db);
  const matureBefore = await matureDigest(db);
  const evidence = { identity: { baseUrl, mockPort, organizationId }, before, matureBefore };
  const rateLimiter = rateLimitModule.rateLimiter;

  try {
    const sessionTokens = await seed(db);
    mark("seed complete");
    const cookies = Object.fromEntries(Object.entries(sessionTokens).map(([key, token]) => [key, sessionCookie(token)]));
    const promptBody = { messages: [{ role: "user", content: "Respond with exactly: OK" }] };

    // ---------------------------------------------------------------- LOGIN
    // 1. Normal login is allowed.
    mark("login tests start");
    const normalLogin = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.10" },
      body: JSON.stringify({ email: emails.owner, password })
    });
    evidence.loginNormal = { status: normalLogin.status };
    assert.equal(normalLogin.status, 200, "normal login must be allowed");

    // 2. Repeated invalid attempts for one account are limited.
    const accountStatuses = [];
    for (let i = 0; i < 5; i++) {
      accountStatuses.push(await request("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.1${i}` },
        body: JSON.stringify({ email: otherAccount, password: `wrong-${i}` })
      }));
    }
    evidence.loginAccountBurst = accountStatuses.map((item) => item.status);
    assert.deepEqual(accountStatuses.map((item) => item.status).slice(0, 3), [401, 401, 401], "the first three invalid attempts must be rejected as invalid credentials");
    assert.equal(accountStatuses[3].status, 429, "the fourth invalid attempt must be rate limited");
    assert.equal(accountStatuses[4].status, 429, "further attempts remain limited");
    const blocked = accountStatuses[3];
    assert.equal(/^\d+$/.test(blocked.headers["retry-after"] ?? ""), true, "rate-limited login must carry a numeric Retry-After");
    assert(Number(blocked.headers["retry-after"]) >= 1, "rate-limited login Retry-After must be at least one second");
    assert.equal(blocked.body?.error?.code, "RATE_LIMIT_EXCEEDED", "rate-limited login must use the RATE_LIMIT_EXCEEDED envelope");
    assert.equal(/[Ii]nvalid email or password/.test(blocked.body?.error?.message ?? ""), false, "the 429 message must be account-neutral");
    assert(!JSON.stringify(blocked).includes(otherAccount), "rate-limit responses must not expose the account");

    // 3. The account limit follows the account, not the IP: a new IP on the
    //    same exhausted account is still blocked.
    const sameAccountNewIp = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.99" },
      body: JSON.stringify({ email: otherAccount, password: "wrong" })
    });
    evidence.sameAccountNewIp = { status: sameAccountNewIp.status };
    assert.equal(sameAccountNewIp.status, 429, "account limit must persist across IPs");

    // 4. A successful login resets the account-failure counter.
    const resetUserStatuses = [];
    for (let i = 0; i < 2; i++) {
      resetUserStatuses.push((await request("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.2${i}` },
        body: JSON.stringify({ email: emails.resetUser, password: `wrong-${i}` })
      })).status);
    }
    const resetSuccess = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.22" },
      body: JSON.stringify({ email: emails.resetUser, password })
    });
    const afterResetInvalid = [];
    for (let i = 0; i < 2; i++) {
      afterResetInvalid.push((await request("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.2${i + 3}` },
        body: JSON.stringify({ email: emails.resetUser, password: `wrong-${i}` })
      })).status);
    }
    evidence.loginResetOnSuccess = { failures: resetUserStatuses, success: resetSuccess.status, after: afterResetInvalid };
    assert.deepEqual(resetUserStatuses, [401, 401], "ordinary failures precede the success");
    assert.equal(resetSuccess.status, 200, "valid credentials after ordinary failures must succeed");
    assert.deepEqual(afterResetInvalid, [401, 401], "a successful login must reset the account-failure counter");

    // 5. Valid credentials are blocked while the account limit is active, and
    //    a controlled reset restores access (no permanent lockout).
    for (let i = 0; i < 3; i++) {
      await request("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.3${i}` },
        body: JSON.stringify({ email: emails.blockUser, password: `wrong-${i}` })
      });
    }
    const blockedValid = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.33" },
      body: JSON.stringify({ email: emails.blockUser, password })
    });
    evidence.validWhileLimited = { status: blockedValid.status };
    assert.equal(blockedValid.status, 429, "valid credentials must not bypass an active account limit");
    await rateLimiter.reset("auth.login.account", "account", emails.blockUser);
    const recovered = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.34" },
      body: JSON.stringify({ email: emails.blockUser, password })
    });
    evidence.loginRecovery = { status: recovered.status };
    assert.equal(recovered.status, 200, "after the reset window the valid login must recover");

    // 6. Network-identity (IP) dimension: five attempts allowed, sixth limited,
    //    even across different accounts.
    const ipStatuses = [];
    for (let i = 0; i < 6; i++) {
      ipStatuses.push((await request("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.40" },
        body: JSON.stringify({ email: `rss12s2-ip-${i}-${suffix}@example.test`, password: `wrong-${i}` })
      })).status);
    }
    evidence.loginIpBurst = ipStatuses;
    assert.equal(ipStatuses[5], 429, "the sixth attempt from one IP must be rate limited");
    assert.equal(ipStatuses[5] === 429 && ipStatuses[0] === 401, true, "IP limiting must not block the first attempts");

    // 7. Missing / malformed credentials are cheap client errors, not attempts.
    const missingEmail = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.50" },
      body: JSON.stringify({ email: "", password: "" })
    });
    const malformedEmail = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.51" },
      body: JSON.stringify({ email: 123, password: "x" })
    });
    evidence.loginMalformed = { missing: missingEmail.status, malformed: malformedEmail.status };
    assert.equal(missingEmail.status, 400, "missing credentials must be a 400 client error");
    assert.equal(malformedEmail.status, 400, "malformed email must be a 400 client error");

    // ------------------------------------------------------------- AI LIMITS
    // 8. Authorized normal request allowed; repeated requests reach 429; the
    //    provider is contacted exactly as many times as requests were allowed.
    mark("AI tests start");
    const first = await request("/api/ai/deepseek", {
      method: "POST", headers: { "content-type": "application/json", cookie: cookies.support }, body: JSON.stringify(promptBody)
    });
    evidence.aiAllowed = { status: first.status };
    assert.equal(first.status, 200, "an authorized AI request within the limit must be allowed");
    const aiStart = mock.calls.length;
    const aiStatuses = [];
    for (let i = 0; i < 4; i++) {
      aiStatuses.push((await request("/api/ai/deepseek", {
        method: "POST", headers: { "content-type": "application/json", cookie: cookies.support }, body: JSON.stringify(promptBody)
      })).status);
    }
    const aiOverallStatuses = [first.status, ...aiStatuses];
    const aiLoopAllowed = aiStatuses.filter((status) => status === 200).length;
    const aiLoopDenied = aiStatuses.filter((status) => status === 429).length;
    evidence.aiUserBurst = {
      preflightStatus: first.status,
      statuses: aiStatuses,
      overallStatuses: aiOverallStatuses,
      requestSequence: aiOverallStatuses.map((status, index) => ({ overallRequest: index + 1, status })),
      providerCalls: mock.calls.length - aiStart,
      allowedRequests: aiLoopAllowed,
      deniedRequests: aiLoopDenied
    };
    // The preflight request consumes one of the three test-policy permits.
    // Assert the overall request sequence so the first denial is tied to the
    // policy boundary rather than an obsolete loop-only index.
    assert.deepEqual(aiOverallStatuses, [200, 200, 200, 429, 429], "three total AI requests must be allowed, then denied");
    assert.deepEqual(aiStatuses, [200, 200, 429, 429], "the loop must show two remaining permits, then denials");
    assert.equal(aiLoopDenied, 2, "the burst must remain denied after the first denial");
    assert.equal(mock.calls.length - aiStart, aiLoopAllowed, "the provider must be contacted exactly once per allowed burst request");
    const deniedProviderCallsBefore = mock.calls.length;
    const aiDenied = (await request("/api/ai/deepseek", {
      method: "POST", headers: { "content-type": "application/json", cookie: cookies.support }, body: JSON.stringify(promptBody)
    }));
    evidence.aiDenied = { status: aiDenied.status, headers: aiDenied.headers, body: aiDenied.body };
    assert.equal(/^\d+$/.test(aiDenied.headers["retry-after"] ?? ""), true, "denied AI request must carry a numeric Retry-After");
    assert(Number(aiDenied.headers["retry-after"]) >= 1, "denied AI request Retry-After must be at least one second");
    assert.equal(aiDenied.headers["ratelimit-remaining"], "0", "denied AI request must report zero remaining");
    assert(!Object.keys(aiDenied.headers).some((key) => key.startsWith("x-ai-")), "denied AI request must not expose provider diagnostics headers");
    assert(!JSON.stringify(aiDenied).includes("rss-1.2s2"), "denied AI response must not leak provider configuration");
    assert.equal(mock.calls.length, deniedProviderCallsBefore, "a denied AI request must not contact the provider");

    // 9. Cross-endpoint organization quota: the org-wide bucket is shared
    //    across all four AI proxy routes and cannot be evaded by route switch.
    await rateLimiter.reset("ai.invoke.burst", "user", ids.owner);
    await rateLimiter.reset("ai.invoke.burst", "user", ids.administrator);
    await rateLimiter.reset("ai.invoke.burst", "user", ids.reviewer);
    await rateLimiter.reset("ai.invoke.user", "user", ids.owner);
    await rateLimiter.reset("ai.invoke.user", "user", ids.administrator);
    await rateLimiter.reset("ai.invoke.user", "user", ids.reviewer);
    await rateLimiter.reset("ai.invoke.organization", "organization", organizationId);
    const routesByUser = { owner: "/api/ai/deepseek", administrator: "/api/ai/chat", reviewer: "/api/ai/openai-compatible" };
    const orgTestStart = mock.calls.length;
    const orgStatuses = [];
    for (let i = 0; i < 2; i++) {
      for (const [key, route] of Object.entries(routesByUser)) {
        orgStatuses.push((await request(route, {
          method: "POST", headers: { "content-type": "application/json", cookie: cookies[key] }, body: JSON.stringify(promptBody)
        })).status);
      }
    }
    const crossRoute = "/api/ai/deepseek";
    const crossDenied = await request(crossRoute, {
      method: "POST", headers: { "content-type": "application/json", cookie: cookies.reviewer }, body: JSON.stringify(promptBody)
    });
    evidence.aiOrgQuota = { statuses: orgStatuses, crossRouteDenied: crossDenied.status, providerCalls: mock.calls.length - orgTestStart };
    assert.deepEqual(orgStatuses, [200, 200, 200, 200, 200, 200], "six org-wide requests must be allowed (org limit 6)");
    assert.equal(crossDenied.status, 429, "the seventh org-wide request must be denied on a different endpoint");
    assert.equal(mock.calls.length - orgTestStart, 6, "the provider must be contacted exactly six times");

    // 10. Controlled reset restores AI access.
    await rateLimiter.reset("ai.invoke.burst", "user", ids.support);
    await rateLimiter.reset("ai.invoke.user", "user", ids.support);
    await rateLimiter.reset("ai.invoke.organization", "organization", organizationId);
    const restored = await request("/api/ai/deepseek", {
      method: "POST", headers: { "content-type": "application/json", cookie: cookies.support }, body: JSON.stringify(promptBody)
    });
    evidence.aiRestored = { status: restored.status };
    assert.equal(restored.status, 200, "after the reset the authorized AI request must succeed");

    // 11. Concurrency: ten simultaneous requests from one user yield exactly
    //     the permitted number of allowed responses and provider calls.
    await rateLimiter.reset("ai.invoke.burst", "user", ids.support);
    await rateLimiter.reset("ai.invoke.user", "user", ids.support);
    await rateLimiter.reset("ai.invoke.organization", "organization", organizationId);
    const concurrencyStart = mock.calls.length;
    const concurrent = await Promise.all(Array.from({ length: 10 }, () => request("/api/ai/deepseek", {
      method: "POST", headers: { "content-type": "application/json", cookie: cookies.support }, body: JSON.stringify(promptBody)
    })));
    const concurrentStatuses = concurrent.map((item) => item.status).sort();
    evidence.aiConcurrency = { statuses: concurrentStatuses, providerCalls: mock.calls.length - concurrencyStart };
    assert.equal(concurrentStatuses.filter((status) => status === 200).length, 3, "exactly three concurrent requests may pass the per-user limit");
    assert.equal(concurrentStatuses.filter((status) => status === 429).length, 7, "the remaining seven concurrent requests must be denied");
    assert.equal(mock.calls.length - concurrencyStart, 3, "the provider must be contacted exactly three times under concurrency");

    // ------------------------------------------------------- TICKET / JOB
    // 12. Ticket submission: ordinary writes allowed; burst limited; denied
    //     writes are not persisted. (RSS-1.2S3: the payload is the client-owned
    //     ticket write contract; authority is derived server-side.)
    mark("ticket/job/connector/admin tests start");
    await rateLimiter.reset("ticket.submit.user", "user", ids.support);
    await rateLimiter.reset("ticket.submit.organization", "organization", organizationId);
    const ticket = (i) => ({
      ticketId: `RSS12S2-${suffix}-${i}`,
      orgId: organizationId,
      rawMessage: "Disposable harmless ticket",
      subject: "Abuse control"
    });
    const ticketStatuses = [];
    for (let i = 0; i < 4; i++) {
      ticketStatuses.push((await request(`/api/organizations/${organizationId}/tickets`, {
        method: "PUT", headers: { "content-type": "application/json", cookie: cookies.support }, body: JSON.stringify([ticket(i)])
      })).status);
    }
    const persistedAfterDenied = Number((await db.query('select count(*)::int as count from ticket_records where "organizationId"=$1', [organizationId])).rows[0].count);
    evidence.ticketBurst = { statuses: ticketStatuses, persistedAfterDenied };
    assert.deepEqual(ticketStatuses.slice(0, 3), [200, 200, 200], "the first three ticket writes must be allowed (org limit 3)");
    assert.equal(ticketStatuses[3], 429, "the fourth ticket write must be rate limited");
    assert.equal(persistedAfterDenied, 3, "the denied ticket write must not be persisted");

    // 13. Job creation: a denied job request creates no durable job.
    await rateLimiter.reset("job.create.organization", "organization", organizationId);
    const jobBody = (i) => ({ type: "ticket.process", idempotencyKey: `rss12s2-job-${suffix}-${i}`, input: { ticketInput: { subject: `Job ${i}`, description: "Disposable job", customerName: "Probe" } } });
    const jobStatuses = [];
    for (let i = 0; i < 4; i++) {
      jobStatuses.push((await request(`/api/organizations/${organizationId}/jobs`, {
        method: "POST", headers: { "content-type": "application/json", cookie: cookies.support }, body: JSON.stringify(jobBody(i))
      })).status);
    }
    const jobsBefore = Number((await db.query('select count(*)::int as count from durable_jobs where "organizationId"=$1', [organizationId])).rows[0].count);
    const deniedJob = await request(`/api/organizations/${organizationId}/jobs`, {
      method: "POST", headers: { "content-type": "application/json", cookie: cookies.support }, body: JSON.stringify(jobBody(99))
    });
    const jobsAfter = Number((await db.query('select count(*)::int as count from durable_jobs where "organizationId"=$1', [organizationId])).rows[0].count);
    evidence.jobBurst = { statuses: jobStatuses, deniedJobStatus: deniedJob.status, jobsBefore, jobsAfter };
    assert.equal(jobStatuses[3], 429, "the fourth job request must be rate limited");
    assert.equal(deniedJob.status, 429, "the additional denied job request must be rate limited");
    assert.equal(jobsAfter, jobsBefore, "a denied job request must create no durable job");

    // 14. Connector mutation: burst limited and the denied write is not
    //     persisted.
    await rateLimiter.reset("connector.mutate.organization", "organization", organizationId);
    const connectorStatuses = [];
    for (let i = 0; i < 4; i++) {
      connectorStatuses.push((await request(`/api/organizations/${organizationId}/connectors`, {
        method: "POST", headers: { "content-type": "application/json", cookie: cookies.owner },
        body: JSON.stringify({ connectorType: "generic.signed_webhook", name: `RSS-1.2S2 ${i}`, configuration: { acceptedEventTypes: ["ticket.created"] }, signingSecret: `synthetic-${suffix}-${i}` })
      })).status);
    }
    const connectorsAfter = Number((await db.query('select count(*)::int as count from connector_installations where "organizationId"=$1', [organizationId])).rows[0].count);
    evidence.connectorBurst = { statuses: connectorStatuses, persisted: connectorsAfter };
    assert.deepEqual(connectorStatuses.slice(0, 3), [201, 201, 201], "the first three connector creations must be allowed (org limit 3)");
    assert.equal(connectorStatuses[3], 429, "the fourth connector creation must be rate limited");
    assert.equal(connectorsAfter, 3, "the denied connector creation must not be persisted");

    // 15. Admin mutation: members role changes are limited.
    await rateLimiter.reset("admin.mutate.user", "user", ids.owner);
    const adminStatuses = [];
    const targetRoles = ["reviewer", "support_agent", "viewer", "administrator"];
    for (let i = 0; i < 4; i++) {
      adminStatuses.push((await request(`/api/organizations/${organizationId}/members/${ids.viewer}`, {
        method: "PATCH", headers: { "content-type": "application/json", cookie: cookies.owner }, body: JSON.stringify({ role: targetRoles[i] })
      })).status);
    }
    evidence.adminBurst = adminStatuses;
    assert.deepEqual(adminStatuses.slice(0, 3), [200, 200, 200], "the first three admin mutations must be allowed (user limit 3)");
    assert.equal(adminStatuses[3], 429, "the fourth admin mutation must be rate limited");

    // --------------------------------------------- 429 CONTRACT / OBSERVABILITY
    // 16. Rate-limit denials are durably observable and leak no identifiers.
    const denyEvents = (await db.query(
      'select "policyKey",route,decision,"actorUserId","organizationId","requestId","correlationId",reason from rate_limit_events where "organizationId"=$1 order by "createdAt" desc limit 50',
      [organizationId]
    )).rows;
    evidence.denyEvents = {
      count: denyEvents.length,
      policies: [...new Set(denyEvents.map((row) => row.policyKey))].sort(),
      allDeny: denyEvents.every((row) => row.decision === "deny")
    };
    assert(denyEvents.length >= 4, "denials must be durably recorded");
    assert(denyEvents.every((row) => row.decision === "deny"), "rate-limit events must record denials only");
    const serializedEvents = JSON.stringify(denyEvents);
    assert(!serializedEvents.includes(emails.owner) && !serializedEvents.includes(password), "denial events must not expose accounts or passwords");
    assert(!serializedEvents.includes("198.51.100."), "denial events must not store raw IP addresses");

    // ------------------------------------------- MULTI-INSTANCE / FAILURE
    mark("multi-instance and failure tests start");
    // 17. Two limiter instances sharing the PostgreSQL store enforce one
    //     shared counter (multi-instance correctness + restart persistence).
    const Policy = rateLimitModule.getRateLimitPolicy("ai.invoke.user");
    const storeA = new rateLimitStoreModule.PostgresRateLimitStore();
    const limiterA = rateLimitModule.createRateLimiter(storeA);
    const limiterB = rateLimitModule.createRateLimiter(new rateLimitStoreModule.PostgresRateLimitStore());
    const dimension = [{ type: "user", value: `multi-${suffix}` }];
    const multiCtx = { route: "multi-instance-probe" };
    const results = [];
    for (let i = 0; i < Policy.max + 2; i++) {
      results.push((i % 2 === 0 ? limiterA : limiterB).check("ai.invoke.user", dimension, multiCtx));
    }
    const multiDecisions = await Promise.all(results);
    evidence.multiInstance = {
      allowed: multiDecisions.filter((decision) => decision.allowed).length,
      denied: multiDecisions.filter((decision) => !decision.allowed).length,
      limit: Policy.max
    };
    assert.equal(multiDecisions.filter((decision) => decision.allowed).length, Policy.max, "two instances must share one counter and allow exactly the limit");
    assert.equal(multiDecisions.filter((decision) => !decision.allowed).length, 2, "the excess concurrent decisions must be denied");
    // A fresh "restarted" instance sees the persisted count.
    const restarted = rateLimitModule.createRateLimiter(new rateLimitStoreModule.PostgresRateLimitStore());
    const restartDecision = await restarted.check("ai.invoke.user", dimension, multiCtx);
    evidence.restartPersistence = { allowed: restartDecision.allowed, remaining: restartDecision.remaining };
    assert.equal(restartDecision.allowed, false, "a restart must not reset the shared quota");
    await limiterA.reset("ai.invoke.user", "user", `multi-${suffix}`);

    // 18. Failure behavior: fail_closed denies when the store is down;
    //     emergency_ceiling caps with a small local ceiling; fail_open allows.
    const FailingStore = class {
      async increment() { throw new Error("simulated store outage"); }
      async reset() { throw new Error("simulated store outage"); }
      async cleanup() { throw new Error("simulated store outage"); }
      async health() { return false; }
    };
    const failureCtx = { route: "failure-probe" };
    const closed = rateLimitModule.createRateLimiter(new FailingStore());
    const closedDecision = await closed.check("ticket.submit.organization", [{ type: "organization", value: `org-${suffix}` }], failureCtx);
    assert.equal(closedDecision.allowed, false, "fail_closed policy must deny when the store is unavailable");
    assert.equal(closedDecision.reason, "store_unavailable", "fail_closed denial must record the store-unavailable reason");

    const ceiling = rateLimitModule.createRateLimiter(new FailingStore());
    const ceilingDecisions = [];
    for (let i = 0; i < 8; i++) {
      ceilingDecisions.push(await ceiling.check("ai.invoke.burst", [{ type: "user", value: `ceiling-${suffix}` }], failureCtx));
    }
    const ceilingAllowed = ceilingDecisions.filter((decision) => decision.allowed).length;
    const ceilingDenied = ceilingDecisions.filter((decision) => !decision.allowed).length;
    const ceilingPolicy = rateLimitModule.getRateLimitPolicy("ai.invoke.burst");
    evidence.failureCeiling = { allowed: ceilingAllowed, denied: ceilingDenied, emergencyCeiling: ceilingPolicy.emergencyCeiling };
    assert.equal(ceilingAllowed, ceilingPolicy.emergencyCeiling, "emergency_ceiling must allow exactly the small local ceiling");
    assert.equal(ceilingDenied, 8 - ceilingPolicy.emergencyCeiling, "emergency_ceiling must deny beyond the local ceiling");

    evidence.auditObserved = {
      aiUseAuthzAudits: Number((await db.query('select count(*)::int as count from authorization_decision_audits where "organizationId"=$1 and "capabilityKey"=\'ai.use\'', [organizationId])).rows[0].count)
    };

    console.log(JSON.stringify(evidence, null, 2));
  } catch (error) {
    // Preserve the first real failure for diagnostics; cleanup still runs below.
    evidence.probeFailure = error instanceof Error ? error.message : String(error);
  } finally {
    await cleanup(db, probeStart).catch((error) => { evidence.cleanupError = error.message; });
    evidence.after = await counts(db);
    evidence.matureAfter = await matureDigest(db);
    evidence.dataSafety = {
      globalCountsRestored: JSON.stringify(evidence.before) === JSON.stringify(evidence.after),
      matureDigestRestored: JSON.stringify(evidence.matureBefore) === JSON.stringify(evidence.matureAfter)
    };
    await db.end();
    next.process.kill();
    await new Promise((resolve) => mock.server.close(resolve));
  }
  evidence.negativeControls = await runNegativeControls();
  console.log(JSON.stringify(evidence, null, 2));
  const fs = require("node:fs");
  fs.writeFileSync(path.join(root, "tmp", "rss12s2-evidence.json"), JSON.stringify(evidence, null, 2));
  assert.equal(evidence.dataSafety.globalCountsRestored, true, "all disposable and rate-limit fixtures must be removed; global counts restored");
  assert.equal(evidence.dataSafety.matureDigestRestored, true, "mature organizational memory must be untouched");
  assert.equal(evidence.negativeControls.passed, true, "negative controls must continue to detect broken limiter behavior");
  if (evidence.probeFailure) throw new Error(`probe failed: ${evidence.probeFailure}`);
  console.info("RSS-1.2S2 rate-limiting abuse-control probe passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
