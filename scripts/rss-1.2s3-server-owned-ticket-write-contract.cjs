/*
 * RSS-1.2S3 server-owned ticket write contract probe.
 *
 * Verification-only. Starts a disposable Next development server, seeds two
 * disposable organizations, disposable users, and disposable knowledge/
 * validation fixtures, and verifies that every attempt to forge server-owned
 * ticket state (status, actor, organization, resolution mode, resolution,
 * review state, knowledge references, validation references, trust state) is
 * rejected with the database unchanged, that legitimate client-owned writes
 * produce server-derived authority, and that server-owned transitions are
 * durable and audited. All fixtures are removed in a finally block.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { promisify } = require("node:util");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

process.env.RATE_LIMIT_HASH_SECRET = process.env.RATE_LIMIT_HASH_SECRET || "rss12s3-probe-secret";

const scrypt = promisify(crypto.scrypt);
const baseUrl = process.env.RSS12S3_BASE_URL || "http://127.0.0.1:3400";
const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
const organizationId = `rss12s3-org-${suffix}`;
const otherOrganizationId = `rss12s3-org-b-${suffix}`;
const password = `RSS12S3-${suffix}-safe-password!`;

const ids = {
  owner: `rss12s3-owner-${suffix}`,
  support: `rss12s3-support-${suffix}`,
  viewer: `rss12s3-viewer-${suffix}`,
  otherUser: `rss12s3-other-${suffix}`
};
const emails = Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, `${id}@example.test`]));
const knowledgeId = `rss12s3-knowledge-${suffix}`;
const validationId = `rss12s3-validation-${suffix}`;
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
  durableJobs: "durable_jobs",
  ticketTransitionAudits: "ticket_transition_audits"
};

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

async function startNextServer() {
  const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", new URL(baseUrl).port || "3400"], {
    cwd: process.cwd(),
    windowsHide: true,
    env: {
      ...process.env,
      RATE_LIMIT_MODE: "off",
      RATE_LIMIT_HASH_SECRET: "rss12s3-probe-secret",
      AI_MODE: "disabled",
      NEXT_PUBLIC_AI_MODE: "disabled",
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
    'insert into organizations (id,name,industry,description,settings,"createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,current_timestamp,current_timestamp), ($6,$7,$8,$9,$5::jsonb,current_timestamp,current_timestamp)',
    [organizationId, "RSS-1.2S3 Disposable", "Verification", "Disposable write-contract verification", JSON.stringify({}), otherOrganizationId, "RSS-1.2S3 Disposable B", "Verification", "Disposable cross-tenant verification"]
  );
  const memberships = { owner: "owner", support: "support_agent", viewer: "viewer", otherUser: "owner" };
  for (const key of Object.keys(ids)) {
    const org = key === "otherUser" ? otherOrganizationId : organizationId;
    await db.query(
      'insert into users (id,name,email,"passwordHash","activeOrganizationId","updatedAt") values ($1,$2,$3,$4,$5,current_timestamp)',
      [ids[key], `RSS-1.2S3 ${key}`, emails[key], hash, org]
    );
    await db.query(
      'insert into organization_memberships ("userId","organizationId",role) values ($1,$2,$3)',
      [ids[key], org, memberships[key]]
    );
    await db.query(
      'insert into organization_role_assignments (id,"organizationId","userId","roleId","assignedByUserId","updatedAt") select $1,$2,$3,id,$4,current_timestamp from rbac_roles where key=$5',
      [`rss12s3-assignment-${key}-${suffix}`, org, ids[key], ids.owner, memberships[key]]
    );
  }
  // Reference fixtures used by transition-reference validation.
  await db.query(
    'insert into knowledge_items (id,"organizationId",title,category,"sourceTicketId",revision,"createdAt","approvedAt",content) values ($1,$2,$3,$4,$5,0,current_timestamp,current_timestamp,$6::jsonb)',
    [knowledgeId, organizationId, "Probe Knowledge", "Verification", "fixture", JSON.stringify({ summary: "Fixture", answer: "Fixture", tags: [] })]
  );
  await db.query(
    'insert into validation_records (id,"organizationId","candidateId",decision,actor,"actorId","roleExercised","timestamp") values ($1,$2,$3,$4,$5,$6,$7,current_timestamp)',
    [validationId, organizationId, "fixture-candidate", "approved", "Probe Validator", ids.owner, "reviewer"]
  );
  const sessions = {};
  for (const key of ["owner", "support", "viewer", "otherUser"]) {
    const token = `rss12s3-${key}-${suffix}`;
    sessions[key] = token;
    await db.query(
      'insert into auth_sessions (id,"tokenHash","userId","expiresAt") values ($1,$2,$3,$4)',
      [`rss12s3-session-${key}-${suffix}`, tokenHash(token), ids[key], "2099-01-01T00:00:00.000Z"]
    );
  }
  return sessions;
}

function sessionCookie(token) { return `oip_session=${token}`; }

async function cleanup(db) {
  await db.query("delete from users where id = any($1::text[])", [Object.values(ids)]);
  await db.query("delete from organizations where id in ($1, $2)", [organizationId, otherOrganizationId]);
  await db.query("delete from ticket_transition_audits where \"organizationId\" in ($1, $2)", [organizationId, otherOrganizationId]);
}

async function main() {
  const mark = (label) => console.log(`[rss12s3] ${label}`);
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  const next = await startNextServer();
  mark("dev server up");
  await db.connect();
  await db.query("delete from ticket_transition_audits");
  const before = await counts(db);
  const matureBefore = await matureDigest(db);
  const evidence = { identity: { baseUrl, organizationId }, before, matureBefore };
  try {
    const sessions = await seed(db);
    mark("seed complete");
    const supportCookie = sessionCookie(sessions.support);
    const ownerCookie = sessionCookie(sessions.owner);
    const otherCookie = sessionCookie(sessions.otherUser);
    const viewerCookie = sessionCookie(sessions.viewer);
    const jsonHeaders = (cookie, extra = {}) => ({ "content-type": "application/json", cookie, ...extra });
    const ticketId = `RSS12S3-${suffix}-A`;
    const forgedTicketId = `RSS12S3-${suffix}-FORGED`;

    // --------------------------------------------------------- FORGERY MATRIX
    // Every server-owned field must be rejected (400 AUTHORITY_FIELD_REJECTED)
    // and must never reach the database.
    const forgedAttempts = [
      ["status", { status: "resolved" }],
      ["status.approved", { status: "approved" }],
      ["actorId", { actorId: "forged-admin" }],
      ["actorId.random", { actorId: `random-${suffix}` }],
      ["resolutionMode", { resolutionMode: "human" }],
      ["resolution", { resolution: { finalResponse: "forged", humanEdited: false, editDistanceNote: null, resolvedAt: "1970-01-01T00:00:00.000Z" } }],
      ["reflection", { reflection: { decision: "approved", lessonCreatedId: "forged-lesson", lessonReinforcedId: null, knowledgeChanged: "forged" } }],
      ["classification", { classification: { category: "Forged", intent: "forged", canonicalProblem: "forged", classifiedBy: "deterministic", confidence: "high" } }],
      ["memoryMatch", { memoryMatch: { knowledgeId: "forged-knowledge", matchType: "lesson", lessonId: "forged-lesson" } }],
      ["validationRecordIds", { validationRecordIds: ["forged-validation"] }],
      ["labels", { labels: ["forged"] }],
      ["createdAt", { createdAt: "1970-01-01T00:00:00.000Z" }],
      ["draftSource", { draftSource: "ai_advisory" }]
    ];
    evidence.forgeryRejections = {};
    for (const [label, authorityFields] of forgedAttempts) {
      const payload = { ticketId: forgedTicketId, orgId: organizationId, rawMessage: "Disposable harmless ticket", subject: "Forgery attempt", ...authorityFields };
      const result = await request(`/api/organizations/${organizationId}/tickets`, {
        method: "PUT", headers: jsonHeaders(supportCookie), body: JSON.stringify([payload])
      });
      evidence.forgeryRejections[label] = { status: result.status, code: result.body?.error?.code };
      assert.equal(result.status, 400, `forging ${label} must be rejected with 400`);
      assert.equal(result.body?.error?.code, "AUTHORITY_FIELD_REJECTED", `forging ${label} must be rejected as AUTHORITY_FIELD_REJECTED`);
    }
    const forgedRow = (await db.query('select count(*)::int as count from ticket_records where "organizationId"=$1 and "ticketId"=$2', [organizationId, forgedTicketId])).rows[0].count;
    evidence.forgedPersisted = forgedRow;
    assert.equal(forgedRow, 0, "forged tickets must never be persisted");

    // Cross-organization identifiers must be rejected.
    const crossTenant = await request(`/api/organizations/${organizationId}/tickets`, {
      method: "PUT", headers: jsonHeaders(supportCookie), body: JSON.stringify([{ ticketId: `RSS12S3-${suffix}-X`, orgId: otherOrganizationId, rawMessage: "x", subject: "x" }])
    });
    evidence.crossTenant = { status: crossTenant.status, code: crossTenant.body?.error?.code };
    assert.equal(crossTenant.status, 403, "cross-organization orgId must be rejected");
    assert.equal(crossTenant.body?.error?.code, "CROSS_ORGANIZATION_REJECTED", "cross-organization orgId must use CROSS_ORGANIZATION_REJECTED");

    // ------------------------------------------------------- LEGITIMATE WRITE
    const legitWrite = await request(`/api/organizations/${organizationId}/tickets`, {
      method: "PUT", headers: jsonHeaders(supportCookie), body: JSON.stringify([{ ticketId, orgId: organizationId, rawMessage: "Customer reported a login issue", subject: "Login issue" }])
    });
    evidence.legitWrite = { status: legitWrite.status };
    assert.equal(legitWrite.status, 200, "a client-owned ticket write must be accepted");
    const row = (await db.query(
      'select "actorId",status,"resolutionMode",classification,"memoryMatch","draftSource","createdAt" from ticket_records where "organizationId"=$1 and "ticketId"=$2',
      [organizationId, ticketId]
    )).rows[0];
    evidence.derived = {
      actorId: row.actorId,
      status: row.status,
      resolutionMode: row.resolutionMode,
      classification: row.classification,
      draftSource: row.draftSource,
      createdAt: String(row.createdAt)
    };
    assert.equal(row.actorId, ids.support, "actorId must be derived from the authenticated session");
    assert.equal(row.status, "open", "status must be server-derived (open)");
    assert.equal(row.resolutionMode, null, "resolutionMode must be server-derived (null)");
    assert.equal(row.classification, null, "classification must be server-derived (null)");
    assert.equal(row.draftSource, null, "draftSource must be server-derived (null)");
    const createdAtMs = Date.parse(String(row.createdAt));
    assert(Number.isFinite(createdAtMs) && createdAtMs > 0, "createdAt must be a valid server-derived timestamp");
    assert(createdAtMs > Date.now() - 24 * 60 * 60 * 1000, "createdAt must come from the server clock (not the client)");

    // A later client write may update client facts only; server-owned columns
    // must be preserved.
    const factUpdate = await request(`/api/organizations/${organizationId}/tickets`, {
      method: "PUT", headers: jsonHeaders(supportCookie), body: JSON.stringify([{ ticketId, orgId: organizationId, rawMessage: "Updated customer message", subject: "Updated subject" }])
    });
    assert.equal(factUpdate.status, 200, "a client fact update must be accepted");
    const afterUpdate = (await db.query('select subject,"actorId",status from ticket_records where "organizationId"=$1 and "ticketId"=$2', [organizationId, ticketId])).rows[0];
    assert.equal(afterUpdate.subject, "Updated subject", "client facts must be updatable");
    assert.equal(afterUpdate.actorId, ids.support, "server-owned actorId must be preserved on fact update");
    assert.equal(afterUpdate.status, "open", "server-owned status must be preserved on fact update");

    // ------------------------------------------------------------ TRANSITIONS
    // approve
    const approve = await request(`/api/organizations/${organizationId}/tickets/${encodeURIComponent(ticketId)}/transition`, {
      method: "POST", headers: jsonHeaders(supportCookie), body: JSON.stringify({ kind: "approve", finalResponse: "Thank you for your patience.", humanEdited: true })
    });
    evidence.approve = { status: approve.status, data: approve.body?.data };
    assert.equal(approve.status, 200, "an approve transition must be accepted");
    assert.equal(approve.body?.data?.status, "resolved", "approve must resolve the ticket");
    assert.equal(approve.body?.data?.resolutionMode, "human", "approve must set resolutionMode to human");
    assert.equal(approve.body?.data?.resolution?.finalResponse, "Thank you for your patience.", "approve must record the final response");
    const resolvedRow = (await db.query('select status,"resolutionMode",resolution from ticket_records where "organizationId"=$1 and "ticketId"=$2', [organizationId, ticketId])).rows[0];
    assert.equal(resolvedRow.status, "resolved", "approve must persist resolved status");
    assert.equal(resolvedRow.resolutionMode, "human", "approve must persist resolution mode");

    // discard is invalid once resolved
    const discardResolved = await request(`/api/organizations/${organizationId}/tickets/${encodeURIComponent(ticketId)}/transition`, {
      method: "POST", headers: jsonHeaders(supportCookie), body: JSON.stringify({ kind: "discard" })
    });
    evidence.discardResolved = { status: discardResolved.status };
    assert.equal(discardResolved.status, 409, "discarding a resolved ticket must be rejected");

    // A second ticket for attach_analysis + commit with valid references.
    const ticketId2 = `RSS12S3-${suffix}-B`;
    await request(`/api/organizations/${organizationId}/tickets`, {
      method: "PUT", headers: jsonHeaders(supportCookie), body: JSON.stringify([{ ticketId: ticketId2, orgId: organizationId, rawMessage: "Bulk row message", subject: "Bulk row" }])
    });

    // attach_analysis with a forged knowledge reference must be rejected
    const forgedKnowledge = await request(`/api/organizations/${organizationId}/tickets/${encodeURIComponent(ticketId2)}/transition`, {
      method: "POST", headers: jsonHeaders(supportCookie), body: JSON.stringify({ kind: "attach_analysis", classification: { category: "X", intent: "y", canonicalProblem: "z", classifiedBy: "deterministic", confidence: "high" }, memoryMatch: { knowledgeId: "forged-knowledge", matchType: "lesson", lessonId: null } })
    });
    evidence.forgedKnowledge = { status: forgedKnowledge.status, code: forgedKnowledge.body?.error?.code };
    assert.equal(forgedKnowledge.status, 400, "a forged knowledge reference must be rejected");
    assert.equal(forgedKnowledge.body?.error?.code, "INVALID_TRANSITION_REFERENCE", "forged knowledge reference must use INVALID_TRANSITION_REFERENCE");

    const attach = await request(`/api/organizations/${organizationId}/tickets/${encodeURIComponent(ticketId2)}/transition`, {
      method: "POST", headers: jsonHeaders(supportCookie), body: JSON.stringify({ kind: "attach_analysis", classification: { category: "Integrations", intent: "restore", canonicalProblem: "Webhook Failure", classifiedBy: "deterministic", confidence: "high" }, memoryMatch: { knowledgeId, matchType: "template", lessonId: null } })
    });
    evidence.attachAnalysis = { status: attach.status, statusAfter: attach.body?.data?.status };
    assert.equal(attach.status, 200, "attach_analysis with a valid org reference must be accepted");
    assert.equal(attach.body?.data?.status, "in_review", "attach_analysis must move the ticket to in_review");

    const forgedValidation = await request(`/api/organizations/${organizationId}/tickets/${encodeURIComponent(ticketId2)}/transition`, {
      method: "POST", headers: jsonHeaders(supportCookie), body: JSON.stringify({ kind: "commit", validationRecordIds: ["forged-validation"], knowledgeId, action: "create_new" })
    });
    evidence.forgedValidation = { status: forgedValidation.status, code: forgedValidation.body?.error?.code };
    assert.equal(forgedValidation.status, 400, "a forged validation reference must be rejected");

    const commit = await request(`/api/organizations/${organizationId}/tickets/${encodeURIComponent(ticketId2)}/transition`, {
      method: "POST", headers: jsonHeaders(supportCookie), body: JSON.stringify({ kind: "commit", validationRecordIds: [validationId], knowledgeId, action: "create_new", lessonCreatedId: "lesson-1", knowledgeChanged: knowledgeId })
    });
    evidence.commit = { status: commit.status, statusAfter: commit.body?.data?.status, resolutionMode: commit.body?.data?.resolutionMode, reflection: commit.body?.data?.reflection };
    assert.equal(commit.status, 200, "commit with valid org references must be accepted");
    assert.equal(commit.body?.data?.status, "resolved", "commit must resolve the ticket");
    assert.equal(commit.body?.data?.resolutionMode, "human", "commit must set resolution mode");
    assert.equal(commit.body?.data?.reflection?.decision, "create_new", "commit must record the reflection decision");

    // language reviewer override (on a new open ticket)
    const ticketId3 = `RSS12S3-${suffix}-C`;
    await request(`/api/organizations/${organizationId}/tickets`, {
      method: "PUT", headers: jsonHeaders(supportCookie), body: JSON.stringify([{ ticketId: ticketId3, orgId: organizationId, rawMessage: "Hola, necesito ayuda", subject: "Ayuda" }])
    });
    const language = await request(`/api/organizations/${organizationId}/tickets/${encodeURIComponent(ticketId3)}/transition`, {
      method: "POST", headers: jsonHeaders(supportCookie), body: JSON.stringify({ kind: "language", language: "es" })
    });
    evidence.language = { status: language.status, language: language.body?.data?.classification?.language };
    assert.equal(language.status, 200, "a reviewer language transition must be accepted");
    assert.equal(language.body?.data?.classification?.language?.method, "reviewer", "the language override must be recorded as a reviewer decision");
    assert.equal(language.body?.data?.classification?.language?.reviewerOverride, true, "the language override must be flagged");

    // viewer (no ticket.review capability) must be denied a transition
    const viewerTransition = await request(`/api/organizations/${organizationId}/tickets/${encodeURIComponent(ticketId3)}/transition`, {
      method: "POST", headers: jsonHeaders(viewerCookie), body: JSON.stringify({ kind: "discard" })
    });
    evidence.viewerTransition = { status: viewerTransition.status };
    assert.equal(viewerTransition.status, 403, "a viewer without review capability must be denied a transition");

    // Cross-tenant transition: org B's session cannot transition org A's ticket.
    const crossTenantTransition = await request(`/api/organizations/${organizationId}/tickets/${encodeURIComponent(ticketId3)}/transition`, {
      method: "POST", headers: jsonHeaders(otherCookie), body: JSON.stringify({ kind: "discard" })
    });
    evidence.crossTenantTransition = { status: crossTenantTransition.status };
    assert.equal(crossTenantTransition.status, 403, "a member of another organization must be denied a transition");

    // ------------------------------------------------------- TRANSITION AUDIT
    const audits = (await db.query(
      'select action,"actorId","ticketId","previousStatus","newStatus","requestId","correlationId" from ticket_transition_audits where "organizationId"=$1 order by "createdAt"',
      [organizationId]
    )).rows;
    evidence.transitionAudits = { count: audits.length, actions: [...new Set(audits.map((row) => row.action))].sort(), allActorBound: audits.every((row) => row.actorId === ids.support) };
    assert(audits.length >= 3, "server-owned transitions must be durably audited");
    assert(audits.every((row) => row.actorId === ids.support), "transition audits must carry the authenticated actor");

    console.log(JSON.stringify(evidence, null, 2));
    const fs = require("node:fs");
    fs.writeFileSync(path.join(path.resolve(__dirname, ".."), "tmp", "rss12s3-evidence.json"), JSON.stringify(evidence, null, 2));
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
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.equal(evidence.dataSafety.globalCountsRestored, true, "all disposable fixtures must be removed; global counts restored");
  assert.equal(evidence.dataSafety.matureDigestRestored, true, "mature organizational memory must be untouched");
  console.log(JSON.stringify(evidence.dataSafety));
  console.info("RSS-1.2S3 server-owned ticket write contract probe passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
