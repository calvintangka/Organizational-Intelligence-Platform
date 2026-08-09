/*
 * RSS-1.2S0 security verification probe.
 *
 * Verification-only. Creates one disposable organization and four disposable
 * users, uses synthetic connector/provider secrets, starts a dedicated Next
 * development server whose configurable AI base URLs point at the local mock,
 * and removes all fixtures in a finally block.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { promisify } = require("node:util");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const scrypt = promisify(crypto.scrypt);
const baseUrl = process.env.RSS12S0_BASE_URL || "http://127.0.0.1:3100";
const mockPort = Number(process.env.RSS12S0_MOCK_PORT || "19091");
const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
const organizationId = `rss12s0-org-${suffix}`;
const password = `RSS12S0-${suffix}-safe-password!`;
const ids = {
  owner: `rss12s0-owner-${suffix}`,
  support: `rss12s0-support-${suffix}`,
  viewer: `rss12s0-viewer-${suffix}`,
  malformed: `rss12s0-malformed-${suffix}`
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
      const requestedDelay = Array.isArray(body?.messages)
        && body.messages.some((message) => typeof message?.content === "string" && message.content.includes("RSS12S0_DELAY_5500"));
      const delay = requestedDelay ? 5500 : request.headers["x-rss12s0-delay-ms"] ? Number(request.headers["x-rss12s0-delay-ms"]) : 0;
      const send = () => {
        response.writeHead(200, { "content-type": "application/json", "x-mock-provider": "rss-1.2s0" });
        response.end(JSON.stringify({
          choices: [{ finish_reason: "stop", message: { role: "assistant", content: "OK" } }],
          model: "rss-1.2s0-mock-model",
          usage: { input_tokens: 4, output_tokens: 1 }
        }));
      };
      if (delay > 0) setTimeout(send, delay); else send();
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(mockPort, "127.0.0.1", () => resolve({ server, calls }));
  });
}

async function startNextServer() {
  const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", new URL(baseUrl).port || "3100"], {
    cwd: process.cwd(),
    windowsHide: true,
    env: {
      ...process.env,
      AI_BASE_URL: `http://127.0.0.1:${mockPort}/v1`,
      AI_MODEL: "rss-1.2s0-chat-fixed",
      AI_TIMEOUT_MS: "5000",
      DEEPSEEK_BASE_URL: `http://127.0.0.1:${mockPort}`,
      DEEPSEEK_API_KEY: "rss-1.2s0-synthetic-deepseek-key",
      DEEPSEEK_MODEL: "rss-1.2s0-deepseek-fixed",
      DEEPSEEK_TIMEOUT_MS: "5000",
      AI_TIER1_BASE_URL: `http://127.0.0.1:${mockPort}/v1`,
      AI_TIER1_API_KEY: "rss-1.2s0-synthetic-tier1-key",
      AI_TIER1_MODEL: "rss-1.2s0-tier1-fixed",
      AI_TIER1_TIMEOUT_MS: "5000"
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
  const started = Date.now();
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
  return {
    status: response.status,
    elapsedMs: Date.now() - started,
    headers: Object.fromEntries(response.headers.entries()),
    body
  };
}

function cookieFrom(response) {
  const setCookie = response.headers["set-cookie"];
  assert(setCookie, "login response must set a session cookie");
  return setCookie.split(";", 1)[0];
}

async function login(email) {
  return request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
}

function jsonHeaders(cookie, extra = {}) {
  return { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...extra };
}

async function seed(db) {
  const hash = await passwordHash(password);
  await db.query(
    'insert into organizations (id,name,industry,description,settings,"createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,current_timestamp,current_timestamp)',
    [organizationId, "RSS-1.2S0 Disposable", "Verification", "Disposable security verification organization", JSON.stringify({})]
  );
  for (const key of Object.keys(ids)) {
    await db.query(
      'insert into users (id,name,email,"passwordHash","activeOrganizationId","updatedAt") values ($1,$2,$3,$4,$5,current_timestamp)',
      [ids[key], `RSS-1.2S0 ${key}`, emails[key], hash, organizationId]
    );
  }
  const roles = { owner: "owner", support: "support_agent", viewer: "viewer", malformed: "suppport_agent" };
  for (const key of Object.keys(ids)) {
    await db.query(
      'insert into organization_memberships ("userId","organizationId",role) values ($1,$2,$3)',
      [ids[key], organizationId, roles[key]]
    );
  }
  for (const key of ["owner", "support", "viewer"]) {
    await db.query(
      'insert into organization_role_assignments (id,"organizationId","userId","roleId","assignedByUserId","updatedAt") select $1,$2,$3,id,$4,current_timestamp from rbac_roles where key=$5',
      [`rss12s0-assignment-${key}-${suffix}`, organizationId, ids[key], ids.owner, roles[key]]
    );
  }
}

async function cleanup(db) {
  await db.query('delete from organizations where id=$1', [organizationId]);
  await db.query('delete from users where id = any($1::text[])', [Object.values(ids)]);
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
    await seed(db);

    const invalidLogins = [];
    for (let i = 0; i < 10; i++) {
      invalidLogins.push(await request("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: `nonexistent-${suffix}@example.test`, password: `wrong-${i}` })
      }));
    }
    evidence.loginRateLimit = {
      statuses: invalidLogins.map((item) => item.status),
      retryAfter: invalidLogins.map((item) => item.headers["retry-after"] ?? null),
      elapsedMs: invalidLogins.map((item) => item.elapsedMs)
    };

    const ownerLogin = await login(emails.owner);
    const supportLogin = await login(emails.support);
    const viewerLogin = await login(emails.viewer);
    const malformedLogin = await login(emails.malformed);
    const ownerCookie = cookieFrom(ownerLogin);
    const supportCookie = cookieFrom(supportLogin);
    const viewerCookie = cookieFrom(viewerLogin);
    const malformedCookie = cookieFrom(malformedLogin);

    const ownerSecondLogin = await login(emails.owner);
    const ownerSecondCookie = cookieFrom(ownerSecondLogin);
    evidence.sessionRotation = {
      firstSessionStillValid: (await request("/api/auth/me", { headers: { cookie: ownerCookie } })).status,
      secondSessionValid: (await request("/api/auth/me", { headers: { cookie: ownerSecondCookie } })).status,
      storedSessionCount: Number((await db.query('select count(*)::int as count from auth_sessions where "userId"=$1', [ids.owner])).rows[0].count)
    };

    const promptBody = { messages: [{ role: "user", content: "Respond with exactly: OK" }] };
    evidence.unauthenticatedAI = {};
    for (const endpoint of ["chat", "deepseek", "openai-compatible", "claude"]) {
      evidence.unauthenticatedAI[endpoint] = await request(`/api/ai/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(promptBody)
      });
    }

    const aiBurstStart = mock.calls.length;
    const aiBurst = [];
    for (let i = 0; i < 10; i++) {
      aiBurst.push(await request("/api/ai/deepseek", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(promptBody)
      }));
    }
    evidence.aiRateLimit = {
      statuses: aiBurst.map((item) => item.status),
      retryAfter: aiBurst.map((item) => item.headers["retry-after"] ?? null),
      providerCalls: mock.calls.length - aiBurstStart
    };

    const unsafeStart = mock.calls.length;
    const unsafeBody = {
      model: "unexpected-model",
      max_tokens: 999999,
      temperature: 999,
      timeout_ms: 999999,
      response_format: { type: "arbitrary-client-value" },
      messages: [{ role: "user", content: "Respond with exactly: OK" }]
    };
    evidence.aiParameterControls = {};
    for (const endpoint of ["chat", "deepseek", "openai-compatible"]) {
      evidence.aiParameterControls[endpoint] = await request(`/api/ai/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(unsafeBody)
      });
    }
    evidence.aiParameterControls.forwarded = mock.calls.slice(unsafeStart).map((item) => ({
      url: item.url,
      model: item.body?.model,
      max_tokens: item.body?.max_tokens,
      temperature: item.body?.temperature,
      timeout_ms: item.body?.timeout_ms,
      response_format: item.body?.response_format
    }));

    evidence.perProviderDeadline = await request("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ timeout_ms: 1, messages: [{ role: "user", content: "RSS12S0_DELAY_5500" }] })
    });

    const forgedTicketId = `RSS-FORGED-${suffix}`;
    const forgedTicket = {
      ticketId: forgedTicketId,
      orgId: organizationId,
      actorId: "forged-owner-id",
      createdAt: new Date().toISOString(),
      rawMessage: "Disposable harmless ticket",
      subject: "Security verification",
      classification: { category: "Forged", intent: "forged", canonicalProblem: "forged", classifiedBy: "deterministic", confidence: "high" },
      memoryMatch: { knowledgeId: "forged-knowledge", matchType: "lesson", lessonId: "forged-lesson" },
      draftSource: "ai_advisory",
      resolution: { finalResponse: "Forged resolution", humanEdited: false, editDistanceNote: null, resolvedAt: new Date().toISOString() },
      reflection: { decision: "approved", lessonCreatedId: "forged-lesson", lessonReinforcedId: null, knowledgeChanged: "forged" },
      validationRecordIds: ["forged-validation"],
      labels: ["forged-trust-metadata"],
      status: "resolved",
      resolutionMode: "human"
    };
    const forgedResponse = await request(`/api/organizations/${organizationId}/tickets`, {
      method: "PUT", headers: jsonHeaders(supportCookie), body: JSON.stringify([forgedTicket])
    });
    const forgedRow = (await db.query(
      'select "ticketId",status,"resolutionMode","actorId",resolution,reflection,"validationRecordIds",classification,"memoryMatch" from ticket_records where "organizationId"=$1 and "ticketId"=$2',
      [organizationId, forgedTicketId]
    )).rows[0];
    const ticketAuditRows = (await db.query(
      'select "capabilityKey",resource,decision,"actorUserId" from authorization_decision_audits where "organizationId"=$1 and "actorUserId"=$2 order by "createdAt"',
      [organizationId, ids.support]
    )).rows;
    evidence.clientTrustedTicket = { response: forgedResponse, persisted: forgedRow, authorizationAudits: ticketAuditRows };

    const burstStatuses = [];
    for (let i = 0; i < 10; i++) {
      const ticket = { ...forgedTicket, ticketId: `RSS-BURST-${suffix}-${i}`, actorId: ids.support, status: "open", resolutionMode: null };
      const result = await request(`/api/organizations/${organizationId}/tickets`, {
        method: "PUT", headers: jsonHeaders(supportCookie, { "x-idempotency-key": `rss12s0-${suffix}-${i}` }), body: JSON.stringify([ticket])
      });
      burstStatuses.push(result.status);
    }
    evidence.ticketRateLimit = { statuses: burstStatuses, persistedCount: Number((await db.query('select count(*)::int as count from ticket_records where "organizationId"=$1', [organizationId])).rows[0].count) };

    const metricsPayload = {
      organizationId, lifetimeTickets: 123, knowledgeReused: 4, autoResolutions: 3, humanResolutions: 2,
      totalResolutionTimeSec: 10, resolutionsCount: 5, memoryGrowthToday: 1, memoryGrowthDate: "2026-08-06",
      aiCalls: 7, lastUpdatedAt: new Date().toISOString()
    };
    const metricsResponse = await request(`/api/organizations/${organizationId}/metrics`, {
      method: "PUT", headers: jsonHeaders(viewerCookie), body: JSON.stringify(metricsPayload)
    });
    const metricsRow = (await db.query('select "lifetimeTickets","aiCalls" from org_metrics where "organizationId"=$1', [organizationId])).rows[0];
    evidence.metricsReadAuthorizesWrite = { response: metricsResponse, persisted: metricsRow };

    const malformedRead = await request(`/api/organizations/${organizationId}`, { headers: { cookie: malformedCookie } });
    const malformedSubmit = await request(`/api/organizations/${organizationId}/tickets`, {
      method: "PUT", headers: jsonHeaders(malformedCookie), body: JSON.stringify([])
    });
    const managedMalformedAssignment = await request(`/api/organizations/${organizationId}/members/${ids.support}`, {
      method: "PATCH", headers: jsonHeaders(ownerCookie), body: JSON.stringify({ role: "administratorr" })
    });
    const retainedRole = (await db.query(
      'select r.key from organization_role_assignments a join rbac_roles r on r.id=a."roleId" where a."organizationId"=$1 and a."userId"=$2',
      [organizationId, ids.support]
    )).rows[0]?.key;
    evidence.roleNormalization = { persistedMalformedValue: "suppport_agent", readStatus: malformedRead.status, ticketSubmitStatus: malformedSubmit.status, managedAssignmentStatus: managedMalformedAssignment.status, managedAssignmentBody: managedMalformedAssignment.body, retainedRole };

    const connectorCreate = await request(`/api/organizations/${organizationId}/connectors`, {
      method: "POST", headers: jsonHeaders(ownerCookie), body: JSON.stringify({
        connectorType: "generic.signed_webhook", name: "RSS-1.2S0 disposable connector",
        configuration: { acceptedEventTypes: ["ticket.created"] }, signingSecret: `synthetic-${suffix}-connector-secret`
      })
    });
    const installationId = connectorCreate.body?.data?.installation?.id;
    assert(installationId, `connector creation failed: ${JSON.stringify(connectorCreate.body)}`);
    const connectorActivate = await request(`/api/organizations/${organizationId}/connectors/${installationId}/activate`, { method: "POST", headers: { cookie: ownerCookie } });
    const auditBeforeSecretRead = Number((await db.query('select count(*)::int as count from authorization_decision_audits where "organizationId"=$1', [organizationId])).rows[0].count);
    const connectorTest = await request(`/api/organizations/${organizationId}/connectors/${installationId}/test`, { method: "POST", headers: { cookie: ownerCookie } });
    const auditsAfterSecretRead = (await db.query(
      'select "capabilityKey",resource,decision,"requestId","correlationId" from authorization_decision_audits where "organizationId"=$1 order by "createdAt" offset $2',
      [organizationId, auditBeforeSecretRead]
    )).rows;
    evidence.connectorSecretAudit = { createStatus: connectorCreate.status, activateStatus: connectorActivate.status, testStatus: connectorTest.status, testBody: connectorTest.body, auditsCreatedDuringSecretRead: auditsAfterSecretRead };

    const root = await request("/");
    const api = await request("/api/auth/me");
    const headerNames = [
      "content-security-policy", "strict-transport-security", "x-frame-options", "x-content-type-options",
      "referrer-policy", "permissions-policy", "cross-origin-opener-policy", "cross-origin-resource-policy"
    ];
    evidence.securityHeaders = {
      rootStatus: root.status,
      root: Object.fromEntries(headerNames.map((name) => [name, root.headers[name] ?? null])),
      apiStatus: api.status,
      api: Object.fromEntries(headerNames.map((name) => [name, api.headers[name] ?? null]))
    };

    const unknownOrganization = await request(`/api/organizations/rss12s0-unknown-${suffix}`, { headers: { cookie: viewerCookie } });
    const inaccessibleOrganization = await request(`/api/organizations/${organizationId}`, { headers: { cookie: "oip_session=invalid" } });
    evidence.errorSemantics = { unknownOrganization: { status: unknownOrganization.status, body: unknownOrganization.body }, invalidSession: { status: inaccessibleOrganization.status, body: inaccessibleOrganization.body } };

    evidence.mockProviderCalls = mock.calls.map((item) => ({ url: item.url, model: item.body?.model, max_tokens: item.body?.max_tokens, temperature: item.body?.temperature }));
  } finally {
    await cleanup(db).catch((error) => { evidence.cleanupError = error.message; });
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
  console.log(JSON.stringify(evidence, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
