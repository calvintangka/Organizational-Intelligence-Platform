/* NC-FIX-013: current Open tickets metric and discarded-ticket lifecycle probe. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { Client } = require("pg");

require("dotenv").config({ path: ".env.local" });

const scrypt = promisify(crypto.scrypt);
const baseUrl = process.env.AUTH_PROBE_BASE_URL || "http://localhost:3000";
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const userId = `nc013-metrics-user-${suffix}`;
const email = `${userId}@example.test`;
const password = "NC-FIX-013-dashboard-metric-probe-password-2026!";
const organizationIds = [
  `nc013-core-${suffix}`,
  `nc013-status-matrix-${suffix}`,
  `nc013-tenant-b-${suffix}`
];
const [coreOrganizationId, statusMatrixOrganizationId, tenantBOrganizationId] = organizationIds;

function request(pathname, init = {}) {
  return fetch(`${baseUrl}${pathname}`, init);
}

async function json(response) {
  return response.json().catch(() => null);
}

async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

async function login() {
  const response = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  assert.equal(response.status, 200, "probe operator login must succeed");
  return response.headers.get("set-cookie").split(";", 1)[0];
}

function headers(cookie, requestId) {
  return {
    cookie,
    "content-type": "application/json",
    "x-request-id": requestId,
    "x-correlation-id": requestId
  };
}

async function loadMetrics(cookie, organizationId) {
  const response = await request(`/api/organizations/${organizationId}/metrics`, { headers: { cookie } });
  const body = await json(response);
  assert.equal(response.status, 200, `metrics read must succeed for ${organizationId}`);
  assert.ok(body?.data, "metrics response must contain data");
  return body.data;
}

async function transition(cookie, organizationId, ticketId, command, label) {
  const requestId = `nc013-${label}-${suffix}`;
  const response = await request(`/api/organizations/${organizationId}/tickets/${encodeURIComponent(ticketId)}/transition`, {
    method: "POST",
    headers: headers(cookie, requestId),
    body: JSON.stringify(command)
  });
  const body = await json(response);
  assert.equal(response.status, 200, `${label} transition must succeed: ${JSON.stringify(body)}`);
  assert.ok(body?.data, `${label} transition must return a ticket`);
  return body.data;
}

async function insertOrganization(db, organizationId, userHash) {
  await db.query(
    'INSERT INTO organizations (id, name, industry, description, settings, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
    [organizationId, `NC-FIX-013 ${organizationId}`, "Support", "Disposable open-ticket metric fixture.", "{}"]
  );
  await db.query(
    'INSERT INTO organization_memberships ("userId", "organizationId", role) VALUES ($1, $2, \'member\')',
    [userId, organizationId]
  );
  await db.query(
    'INSERT INTO organization_role_assignments (id, "organizationId", "userId", "roleId", "assignedByUserId", "updatedAt") VALUES ($1, $2, $3, \'role_owner\', $3, CURRENT_TIMESTAMP)',
    [`nc013-role-${organizationId}`, organizationId, userId]
  );
  await db.query(
    'INSERT INTO org_metrics ("organizationId", "lifetimeTickets", "knowledgeReused", "autoResolutions", "humanResolutions", "totalResolutionTimeSec", "resolutionsCount", "memoryGrowthToday", "memoryGrowthDate", "lastUpdatedAt") VALUES ($1, 0, 0, 0, 0, 0, 0, 0, CURRENT_DATE::text, CURRENT_TIMESTAMP)',
    [organizationId]
  );
}

async function insertTicket(db, organizationId, ticketId, status) {
  const completed = status === "resolved" || status === "rejected";
  await db.query(
    'INSERT INTO ticket_records (id, "organizationId", "ticketId", "rawMessage", subject, status, "draftSource", classification, resolution, reflection, "validationRecordIds", labels, "actorId", "resolutionMode", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, CURRENT_TIMESTAMP)',
    [
      `nc013-ticket-row-${organizationId}-${ticketId}`,
      organizationId,
      ticketId,
      `NC-FIX-013 fixture ${ticketId}`,
      `NC-FIX-013 ${ticketId}`,
      status,
      "deterministic",
      JSON.stringify({ category: "Support", intent: "metric_probe", confidence: "high", classifiedBy: "deterministic" }),
      JSON.stringify({ finalResponse: completed ? "Completed by fixture." : null, humanEdited: false, editDistanceNote: null, resolvedAt: completed ? new Date().toISOString() : null, draftRevision: 0 }),
      JSON.stringify({ decision: null, validationEligible: false }),
      "[]",
      "[]",
      userId,
      completed ? "human" : null
    ]
  );
}

async function insertEvidence(db, organizationId, ticketId) {
  const evidenceId = `resolution-evidence-nc013-${suffix}`;
  await db.query(
    'INSERT INTO ticket_resolution_evidence (id, "organizationId", "ticketId", type, "sourceMessageId", "actorId", note, "createdAt", "idempotencyKey") VALUES ($1, $2, $3, \'manual_verified_resolution\', NULL, $4, $5, CURRENT_TIMESTAMP, $6)',
    [evidenceId, organizationId, ticketId, userId, "NC-FIX-013 fixture resolution evidence.", `nc013-evidence-${suffix}`]
  );
  return evidenceId;
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  let cookie;
  const evidence = {};
  try {
    await db.connect();
    const hash = await passwordHash(password);
    await db.query(
      'INSERT INTO users (id, name, email, "passwordHash", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [userId, "NC-FIX-013 Metric Probe", email, hash]
    );
    for (const organizationId of organizationIds) await insertOrganization(db, organizationId, hash);

    // Core lifecycle: two active rows, discard one, then resolve the other.
    await insertTicket(db, coreOrganizationId, "NC013-A", "in_review");
    await insertTicket(db, coreOrganizationId, "NC013-B", "open");
    const coreBefore = await loadMetrics(cookie = await login(), coreOrganizationId);
    assert.equal(coreBefore.openTickets, 2);
    assert.equal(coreBefore.lifetimeTickets, 0, "lifetime metric remains independent of current Open tickets");

    const discarded = await transition(cookie, coreOrganizationId, "NC013-B", { kind: "discard" }, "discard");
    assert.equal(discarded.status, "discarded");
    const discardedRow = await db.query('SELECT status FROM ticket_records WHERE "organizationId" = $1 AND "ticketId" = $2', [coreOrganizationId, "NC013-B"]);
    assert.equal(discardedRow.rows[0].status, "discarded");
    const discardAudit = await db.query('SELECT count(*)::int AS count FROM ticket_transition_audits WHERE "organizationId" = $1 AND "ticketId" = $2 AND action = \'discard\'', [coreOrganizationId, "NC013-B"]);
    assert.equal(discardAudit.rows[0].count, 1);
    const coreAfterDiscard = await loadMetrics(cookie, coreOrganizationId);
    const coreAfterDiscardFresh = await loadMetrics(cookie, coreOrganizationId);
    assert.equal(coreAfterDiscard.openTickets, 1);
    assert.equal(coreAfterDiscardFresh.openTickets, 1);
    evidence.discardedRetained = true;
    evidence.discardedExcluded = true;
    evidence.refreshRead = true;

    const evidenceId = await insertEvidence(db, coreOrganizationId, "NC013-A");
    const resolved = await transition(cookie, coreOrganizationId, "NC013-A", { kind: "resolve_with_evidence", evidenceId }, "resolve");
    assert.equal(resolved.status, "resolved");
    const coreAfterResolve = await loadMetrics(cookie, coreOrganizationId);
    assert.equal(coreAfterResolve.openTickets, 0);

    // Status matrix: open and in_review count; waiting remains operationally active;
    // resolved, rejected, and discarded remain retained but excluded.
    await insertTicket(db, statusMatrixOrganizationId, "NC013-M-OPEN", "open");
    await insertTicket(db, statusMatrixOrganizationId, "NC013-M-REVIEW", "in_review");
    await insertTicket(db, statusMatrixOrganizationId, "NC013-M-RESOLVED", "resolved");
    await insertTicket(db, statusMatrixOrganizationId, "NC013-M-REJECTED", "rejected");
    await insertTicket(db, statusMatrixOrganizationId, "NC013-M-DISCARDED", "discarded");
    const matrixBeforeWaiting = await loadMetrics(cookie, statusMatrixOrganizationId);
    assert.equal(matrixBeforeWaiting.openTickets, 2);
    const waiting = await transition(cookie, statusMatrixOrganizationId, "NC013-M-REVIEW", {
      kind: "send_agent_message",
      finalResponse: "Please confirm the requested detail.",
      humanEdited: true,
      expectedDraftRevision: 0,
      idempotencyKey: `nc013-waiting-${suffix}`
    }, "waiting");
    assert.equal(waiting.status, "waiting_for_customer");
    const matrixAfterWaiting = await loadMetrics(cookie, statusMatrixOrganizationId);
    assert.equal(matrixAfterWaiting.openTickets, 2, "waiting-for-customer remains counted as active");
    evidence.statusMatrix = true;

    // Tenant isolation: a discarded tenant-B record cannot affect tenant A.
    await insertTicket(db, tenantBOrganizationId, "NC013-TENANT-B", "open");
    const tenantARead = await loadMetrics(cookie, coreOrganizationId);
    const tenantBRead = await loadMetrics(cookie, tenantBOrganizationId);
    assert.equal(tenantARead.openTickets, 0);
    assert.equal(tenantBRead.openTickets, 1);
    await transition(cookie, tenantBOrganizationId, "NC013-TENANT-B", { kind: "discard" }, "tenant-b-discard");
    assert.equal((await loadMetrics(cookie, tenantBOrganizationId)).openTickets, 0);
    assert.equal((await loadMetrics(cookie, coreOrganizationId)).openTickets, 0);
    evidence.tenantIsolation = true;

    const metricKeys = ["lifetimeTickets", "knowledgeReused", "autoResolutions", "humanResolutions", "totalResolutionTimeSec", "resolutionsCount", "memoryGrowthToday", "memoryGrowthDate"];
    for (const key of metricKeys) assert.equal(coreBefore[key], coreAfterDiscard[key], `${key} must remain unchanged by Open tickets repair`);
    evidence.otherMetricsUnchanged = true;

    console.log(JSON.stringify({
      activePairCount: coreBefore.openTickets,
      afterDiscardCount: coreAfterDiscard.openTickets,
      afterRefreshCount: coreAfterDiscardFresh.openTickets,
      afterFinalResolutionCount: coreAfterResolve.openTickets,
      waitingCount: matrixAfterWaiting.openTickets,
      discardedPersisted: evidence.discardedRetained,
      discardedExcluded: evidence.discardedExcluded,
      statusMatrix: evidence.statusMatrix,
      tenantIsolation: evidence.tenantIsolation,
      otherMetricsUnchanged: evidence.otherMetricsUnchanged,
      exactOrganizations: organizationIds
    }, null, 2));
    console.log("NC-FIX-013 dashboard Open tickets/discard lifecycle probe passed.");
  } finally {
    await db.query('DELETE FROM organizations WHERE id = ANY($1::text[])', [organizationIds]);
    await db.query('DELETE FROM auth_sessions WHERE "userId" = $1', [userId]);
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
