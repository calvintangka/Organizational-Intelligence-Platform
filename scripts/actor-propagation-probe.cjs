/*
 * Focused TODO-007 verification: authenticated actor identity propagation.
 *
 * session -> authenticated user -> user.id -> ValidationRecord.actorId /
 * MemoryChangeRecord.actorId. Uses ONLY a disposable organization and
 * disposable users; mature Maesa/FastDrop/Pramana data is snapshot-compared
 * to prove it is untouched. Historical actorId = NULL records must remain NULL.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const scrypt = promisify(crypto.scrypt);
const baseUrl = process.env.AUTH_PROBE_BASE_URL || "http://localhost:3000";
const password = "ActorProbe-password-2026!";
const stamp = Date.now();
const ORG = `actor-probe-org-${stamp}`;
const memberId = `actor-probe-member-${stamp}`;
const outsiderId = `actor-probe-outsider-${stamp}`;
const memberEmail = `${memberId}@example.test`;
const outsiderEmail = `${outsiderId}@example.test`;
const memberName = "Actor Probe Member";
const matureOrganizations = ["profile-fastdrop-logistics", "profile-maesa-tech", "profile-pramana-legal"];
const NOW = new Date().toISOString();

async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

async function login(email) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  assert.equal(response.status, 200, `fixture login must succeed for ${email}`);
  return response.headers.get("set-cookie").split(";", 1)[0];
}

function knowledgeItem() {
  return {
    id: "actor-probe-knowledge",
    organizationId: ORG,
    title: "Actor Probe Problem",
    problem: "Actor probe problem statement.",
    approvedAnswer: "Actor probe answer.",
    category: "Probe",
    tags: ["probe"],
    sourceTicketId: "TW-ACTOR-0001",
    timesReused: 0,
    createdAt: NOW,
    approvedAt: NOW,
    trustScore: 30,
    lessons: [],
    knowledgeVersions: [{ versionId: "actor-probe-knowledge-v1", createdAt: NOW, changeReason: "probe", sourceTicketId: "TW-ACTOR-0001" }]
  };
}

function spoofedCommitPayload() {
  const candidateId = "actor-probe-candidate";
  const validationId = "actor-probe-validation";
  const item = knowledgeItem();
  return {
    candidate: {
      id: candidateId,
      organizationId: ORG,
      sourceTicketIds: ["TW-ACTOR-0001"],
      proposedAction: "create_new",
      proposedContent: { solution: "Probe", customerResponseTemplate: "Probe", internalGuidance: "Probe" },
      rationale: "Actor probe rationale",
      status: "proposed",
      createdAt: NOW
    },
    validation: {
      id: validationId,
      organizationId: ORG,
      candidateId,
      knowledgeId: item.id,
      decision: "approved",
      // Both spoof attempts must be ignored by the server.
      actor: "Spoofed Client Actor",
      actorId: "spoofed-actor-id",
      roleExercised: "knowledge_validator",
      rationale: "Actor probe validation",
      timestamp: NOW
    },
    memoryChange: {
      id: "actor-probe-memory-change",
      organizationId: ORG,
      knowledgeId: item.id,
      candidateId,
      validationRecordId: validationId,
      actorId: "spoofed-actor-id",
      changeType: "create_new",
      beforeState: null,
      afterState: item,
      timestamp: NOW
    },
    knowledgeItem: item,
    expectedKnowledgeRevision: null
  };
}

async function postCommit(cookie) {
  return fetch(`${baseUrl}/api/organizations/${ORG}/commits/validation`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(spoofedCommitPayload())
  });
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const matureBefore = await db.query('SELECT id, "updatedAt" FROM organizations WHERE id = ANY($1::text[]) ORDER BY id', [matureOrganizations]);
  const nullActorBefore = await db.query("SELECT count(*)::int AS n FROM validation_records WHERE \"actorId\" IS NULL");

  try {
    await db.query(
      'INSERT INTO organizations (id, name, industry, description, settings, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [ORG, "Actor Probe Org", "Probe", "Disposable TODO-007 actor probe organization.", "{}"]
    );
    const hash = await passwordHash(password);
    await db.query('INSERT INTO users (id, name, email, "passwordHash", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP), ($5, $6, $7, $4, CURRENT_TIMESTAMP)', [
      memberId, memberName, memberEmail, hash,
      outsiderId, "Actor Probe Outsider", outsiderEmail
    ]);
    await db.query('INSERT INTO organization_memberships ("userId", "organizationId", role) VALUES ($1, $2, $3)', [memberId, ORG, "member"]);

    // Historical NULL-actor record inside the disposable org (pre-auth era shape).
    await db.query(
      'INSERT INTO validation_records (id, "organizationId", "candidateId", decision, actor, "actorId", "roleExercised", timestamp) VALUES ($1, $2, $3, $4, $5, NULL, $6, CURRENT_TIMESTAMP)',
      ["actor-probe-historical-validation", ORG, "actor-probe-historical-candidate", "approved", "Legacy Import", "knowledge_validator"]
    );

    assert.equal((await postCommit(null)).status, 401, "unauthenticated commit must be rejected with 401");
    const outsiderCookie = await login(outsiderEmail);
    assert.equal((await postCommit(outsiderCookie)).status, 403, "non-member commit must be rejected with 403");

    const memberCookie = await login(memberEmail);
    const committed = await postCommit(memberCookie);
    assert.equal(committed.status, 200, `member commit must succeed: ${await committed.text().catch(() => "")}`);

    const validation = await db.query('SELECT actor, "actorId" FROM validation_records WHERE id = $1', ["actor-probe-validation"]);
    assert.equal(validation.rows.length, 1, "validation record must exist");
    assert.equal(validation.rows[0].actorId, memberId, "ValidationRecord.actorId must be the authenticated user id");
    assert.equal(validation.rows[0].actor, memberName, "ValidationRecord.actor must be the trusted server-side display name");
    assert.notEqual(validation.rows[0].actorId, "spoofed-actor-id", "client payload actorId must never control attribution");

    const memoryChange = await db.query('SELECT "actorId" FROM memory_change_records WHERE id = $1', ["actor-probe-memory-change"]);
    assert.equal(memoryChange.rows.length, 1, "memory change record must exist");
    assert.equal(memoryChange.rows[0].actorId, memberId, "MemoryChangeRecord.actorId must be the authenticated user id");

    const historical = await db.query('SELECT actor, "actorId" FROM validation_records WHERE id = $1', ["actor-probe-historical-validation"]);
    assert.equal(historical.rows[0].actorId, null, "historical actorId = NULL records must remain unchanged");
    assert.equal(historical.rows[0].actor, "Legacy Import", "historical actor strings must remain unchanged");

    const nullActorAfter = await db.query("SELECT count(*)::int AS n FROM validation_records WHERE \"actorId\" IS NULL");
    assert.equal(nullActorAfter.rows[0].n, nullActorBefore.rows[0].n + 1, "only the probe's own historical fixture may add a NULL-actor record");

    const matureAfter = await db.query('SELECT id, "updatedAt" FROM organizations WHERE id = ANY($1::text[]) ORDER BY id', [matureOrganizations]);
    assert.deepEqual(matureAfter.rows, matureBefore.rows, "actor propagation must not alter mature organization data");
    console.log("Actor propagation probe passed.");
  } finally {
    // Organization delete cascades validation/memory-change/knowledge/candidate rows.
    await db.query("DELETE FROM organizations WHERE id = $1", [ORG]);
    await db.query('DELETE FROM organization_memberships WHERE "userId" IN ($1, $2)', [memberId, outsiderId]);
    await db.query('DELETE FROM auth_sessions WHERE "userId" IN ($1, $2)', [memberId, outsiderId]);
    await db.query("DELETE FROM users WHERE id IN ($1, $2)", [memberId, outsiderId]);
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
