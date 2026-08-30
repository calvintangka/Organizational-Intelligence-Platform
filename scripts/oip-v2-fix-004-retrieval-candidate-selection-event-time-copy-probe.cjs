/* OIP-V2-FIX-004 candidate selection, event-time, and retrieval-copy probe. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Client } = require("pg");
const { promisify } = require("node:util");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness({ loadEnv: true });
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const { deriveRetrievalPresentationState, retrievalPresentationCopy } = require(path.join(root, "lib", "retrievalPresentation.ts"));
const { formatLocalDateTimeInput, serializeLocalDateTimeInput } = require(path.join(root, "lib", "eventTime.ts"));
require("dotenv").config({ path: path.join(root, ".env.local") });

const baseUrl = process.env.OIP_V2_FIX_004_BASE_URL || "http://127.0.0.1:3000";
const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
const orgId = `oip-v2-fix-004-org-${suffix}`;
const userId = `oip-v2-fix-004-user-${suffix}`;
const email = `${userId}@example.test`;
const password = `OIP-V2-FIX-004-${suffix}-safe-password!`;
const sessionToken = `oip-v2-fix-004-session-${suffix}`;
const scrypt = promisify(crypto.scrypt);

function tokenHash(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}
function headers() { return { cookie: `oip_session=${sessionToken}`, "content-type": "application/json" }; }
async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers: { ...headers(), ...(options.headers ?? {}) } });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 1000); }
  return { status: response.status, body };
}
function data(result) { return result.body?.data; }

const eventBText = "At another warehouse, handheld inventory scanners periodically stop synchronizing while employees move between scanning zones. Inventory backend services remain healthy.";

function eventBUnderstanding() {
  return {
    ticketId: "OIP-V2-FIX-004-EVENT-B",
    originalText: eventBText,
    summary: eventBText,
    coreProblem: eventBText,
    category: "Uncategorized",
    intent: "operational_support",
    urgency: "medium",
    tags: [],
    detectedSignals: [],
    retrievalText: eventBText,
    intentIsolation: {
      version: 1,
      retrievalText: eventBText,
      activeProblemText: eventBText,
      currentRequestText: eventBText,
      requestedOutcome: "restore scanner synchronization",
      ignoredTopics: [],
      negatedTopics: [],
      temporalState: "current",
      contradictions: [],
      contradictionDetected: false,
      securityIntent: { detected: false, severity: "none", reasons: [], escalationRequired: false },
      sentences: [],
      intentHierarchy: []
    }
  };
}

function item(id, overrides) {
  return {
    id,
    title: "Unrelated memory",
    problem: "Unrelated problem",
    approvedAnswer: "Human review required.",
    category: "Uncategorized",
    tags: [],
    sourceTicketId: id,
    timesReused: 0,
    timesSeen: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    approvedAt: "2026-08-01T00:00:00.000Z",
    lifecycleState: "active",
    governanceState: "trusted",
    trustScore: 20,
    autoResponseEligible: false,
    ...overrides
  };
}

function competingCandidates() {
  const lesson = {
    id: "fix-004-lesson-a",
    title: "Wi-Fi roaming profile caused scanner synchronization failures",
    rootCause: "Handheld scanners lost synchronization during Wi-Fi roaming transitions while the backend remained healthy.",
    solution: "Configure the affected scanner network profile to prevent problematic roaming.",
    customerResponse: "The scanner network profile was corrected and synchronization succeeded.",
    signals: ["handheld scanners", "inventory synchronization", "Wi-Fi roaming", "network bands", "backend healthy"],
    createdAt: "2026-08-24T16:15:00.000Z",
    sourceTicketId: "fix-004-event-a"
  };
  return [
    item("fix-004-specific-a", {
      title: "Warehouse handheld scanner roaming synchronization",
      problem: "Handheld barcode scanners intermittently fail to synchronize inventory after devices transition between Wi-Fi network bands during active scanning sessions.",
      canonicalProblemTitle: "Warehouse handheld scanner roaming synchronization",
      problemSummary: "Specific scanner synchronization failures during Wi-Fi roaming transitions with a healthy inventory backend.",
      tags: ["warehouse", "scanner", "inventory", "synchronization"],
      lessons: [lesson],
      resolutionWorkflow: ["Confirm scanner hardware is functioning.", "Confirm inventory backend is operational.", "Isolate Wi-Fi roaming transition.", "Configure the affected network profile.", "Confirm subsequent synchronization succeeds."],
      exampleTickets: [{ ticketId: "fix-004-event-a", customerName: "Warehouse A", originalIssue: "Scanner synchronization failed during network-band transition.", createdAt: "2026-08-24T16:15:00.000Z", resolutionMode: "human" }],
      trustScore: 40,
      lastUsedAt: "2026-08-01T00:00:00.000Z"
    }),
    item("fix-004-broad-b", {
      title: "Warehouse scanner synchronization",
      problem: "Warehouse scanners sometimes stop synchronizing inventory.",
      canonicalProblemTitle: "Warehouse scanner synchronization",
      problemSummary: "Broad warehouse scanner synchronization symptoms.",
      tags: ["warehouse", "scanner", "inventory", "synchronization"],
      lessons: [{ ...lesson, id: "fix-004-lesson-b", rootCause: "Warehouse scanners stopped synchronizing inventory.", solution: "Reconnect the scanner.", signals: ["scanner", "inventory synchronization"] }],
      resolutionWorkflow: ["Reconnect the scanner."],
      lifecycleState: "deprecated",
      trustScore: 100,
      timesSeen: 99,
      timesReused: 99,
      lastUsedAt: "2026-08-25T00:00:00.000Z"
    }),
    item("fix-004-outage-c", {
      title: "Inventory backend outage stops scanners",
      problem: "An inventory backend outage caused every scanner to stop synchronizing.",
      canonicalProblemTitle: "Inventory backend outage",
      problemSummary: "Scanner synchronization stops when backend services are down.",
      tags: ["warehouse", "scanner", "inventory", "synchronization"],
      lessons: [{ ...lesson, id: "fix-004-lesson-c", rootCause: "Inventory backend outage.", solution: "Restore backend service.", signals: ["backend outage", "scanner synchronization"] }],
      resolutionWorkflow: ["Restore backend service."],
      trustScore: 95
    }),
    item("fix-004-certificate-d", {
      title: "Scanner certificate rejection",
      problem: "Expired device authentication certificates prevent scanner synchronization.",
      canonicalProblemTitle: "Scanner certificate rejection",
      problemSummary: "Authentication certificate failures prevent device synchronization.",
      tags: ["scanner", "synchronization", "certificate"],
      lessons: [{ ...lesson, id: "fix-004-lesson-d", title: "Expired device certificate", rootCause: "Expired device certificate.", solution: "Renew the device certificate.", signals: ["certificate", "authentication"] }],
      resolutionWorkflow: ["Renew the certificate."],
      trustScore: 95
    })
  ];
}

function assertCandidateSelection() {
  const understanding = eventBUnderstanding();
  const candidates = competingCandidates();
  const runs = [candidates, [...candidates].reverse(), [candidates[2], candidates[0], candidates[3], candidates[1]]]
    .map((ordered) => retrieveMemory(understanding, ordered, new Set()));
  for (const matches of runs) {
    assert.match(matches[0]?.item.canonicalProblemTitle ?? "", /handheld scanner roaming/i, "specific Event A must rank first independent of input order");
    assert.ok(matches.find((match) => /Warehouse scanner synchronization$/i.test(match.item.canonicalProblemTitle ?? "")).relevanceEvidence.lifecyclePenalty >= 30, "deprecated broad memory must be visibly penalized");
    assert.ok(matches[0].relevanceEvidence.evidenceKeywordPoints > 0, "lesson/workflow evidence must contribute to ranking diagnostics");
  }

  const byTitle = (pattern) => runs[0].find((match) => pattern.test(match.item.canonicalProblemTitle ?? ""));
  assert.ok((byTitle(/handheld scanner roaming/i).matchScore ?? 0) > (byTitle(/Warehouse scanner synchronization$/i).matchScore ?? 0));
  assert.equal(retrieveMemory({ ...understanding, originalText: "An inventory backend outage caused every scanner to stop syncing across the warehouse.", retrievalText: "An inventory backend outage caused every scanner to stop syncing across the warehouse.", coreProblem: "An inventory backend outage caused every scanner to stop syncing across the warehouse.", summary: "An inventory backend outage caused every scanner to stop syncing across the warehouse.", intentIsolation: { ...understanding.intentIsolation, retrievalText: "An inventory backend outage caused every scanner to stop syncing across the warehouse.", activeProblemText: "An inventory backend outage caused every scanner to stop syncing across the warehouse." } }, [candidates[0]], new Set()).length, 0, "backend outage must not retrieve a healthy-transition lesson");
  assert.equal(retrieveMemory({ ...understanding, originalText: "A firmware-specific synchronization defect was confirmed.", retrievalText: "A firmware-specific synchronization defect was confirmed.", coreProblem: "A firmware-specific synchronization defect was confirmed.", summary: "A firmware-specific synchronization defect was confirmed.", intentIsolation: { ...understanding.intentIsolation, retrievalText: "A firmware-specific synchronization defect was confirmed.", activeProblemText: "A firmware-specific synchronization defect was confirmed." } }, [candidates[0]], new Set()).length, 0, "firmware case must remain outside the roaming scope");
  return { winner: runs[0][0].item.canonicalProblemTitle, ranks: runs[0].map((match) => ({ title: match.item.canonicalProblemTitle, score: match.matchScore, lifecyclePenalty: match.relevanceEvidence.lifecyclePenalty, compatibility: match.compatibilityScore, reason: match.compatibilityReason })) };
}

function assertCopyStates() {
  const base = { item: item("copy-item"), matchScore: 80, matchReason: "candidate", compatibilityScore: 20 };
  const response = { source: "deterministic", basedOnKnowledgeIds: ["copy-item"] };
  const cases = [
    [null, null, "NO_CANDIDATE"],
    [{ ...base, matchScore: 30 }, { source: "no_template", basedOnKnowledgeIds: [] }, "WEAK_CANDIDATE"],
    [base, { source: "no_template", basedOnKnowledgeIds: [] }, "UNGROUNDED_CANDIDATE"],
    [{ ...base, compatibilityReason: "validated scope excludes firmware-specific cases" }, { source: "no_template", basedOnKnowledgeIds: [] }, "SCOPE_INCOMPATIBLE"],
    [{ ...base, item: { ...base.item, trustScore: 20 } }, response, "HUMAN_REVIEW_REQUIRED"],
    [{ ...base, item: { ...base.item, trustScore: 95, autoResponseEligible: true } }, response, "GROUNDED_REUSABLE"]
  ];
  for (const [match, draft, expected] of cases) {
    const actual = deriveRetrievalPresentationState(match, draft);
    assert.equal(actual, expected);
    const copy = retrievalPresentationCopy(actual);
    assert.ok(copy.title && copy.body);
    if (actual !== "NO_CANDIDATE") assert.doesNotMatch(`${copy.title} ${copy.body}`, /no organizational knowledge exists/i, "candidate states must not claim the organization has no knowledge");
  }
  return { states: cases.map(([, , expected]) => expected), contradictionGuard: "PASS" };
}

function assertEventTime() {
  const input = "2026-08-24T16:15";
  const serialized = serializeLocalDateTimeInput(input);
  const expected = new Date(2026, 7, 24, 16, 15, 0, 0).toISOString();
  assert.equal(serialized, expected, "datetime-local must serialize the local wall-clock value without a UTC-slice shift");
  assert.match(formatLocalDateTimeInput(new Date(2026, 7, 24, 16, 15)), /^2026-08-24T16:15$/);
  assert.throws(() => serializeLocalDateTimeInput("2026-02-30T16:15"), /not valid/i);
  return { input, serialized, localExpectation: expected };
}

async function assertEventTimeApi(db) {
  const response = await request(`/api/organizations/${orgId}/memory/experiences`, {
    method: "POST",
    body: JSON.stringify({
      title: "FIX-004 event-time round trip",
      sourceKind: "OPERATIONAL_EVENT",
      occurredAt: "2026-08-24T16:15:00.000Z",
      description: "A disposable source used to verify durable occurrence time.",
      location: "Probe",
      context: "The API receives an explicit ISO instant from the local input helper.",
      idempotencyKey: `fix-004-event-time-${suffix}`
    })
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.equal(data(response).occurredAt, "2026-08-24T16:15:00.000Z");
  return { status: response.status, occurredAt: data(response).occurredAt, persistedBy: "organizational memory source API" };
}

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await db.connect();
    const hash = await passwordHash(password);
    await db.query("BEGIN");
    await db.query('insert into organizations (id,name,industry,description,settings,"createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,current_timestamp,current_timestamp)', [orgId, "OIP V2 Fix 004 Probe", "QA", "Disposable retrieval and event-time acceptance", "{}"]);
    await db.query('insert into users (id,name,email,"passwordHash","activeOrganizationId","updatedAt") values ($1,$2,$3,$4,$5,current_timestamp)', [userId, userId, email, hash, orgId]);
    await db.query('insert into organization_memberships ("userId","organizationId",role) values ($1,$2,$3)', [userId, orgId, "owner"]);
    await db.query('insert into organization_role_assignments (id,"organizationId","userId","roleId","assignedByUserId","updatedAt") select $1,$2,$3,id,$3,current_timestamp from rbac_roles where key=$4', [`oip-v2-fix-004-role-${suffix}`, orgId, userId, "owner"]);
    await db.query('insert into auth_sessions (id,"tokenHash","userId","expiresAt") values ($1,$2,$3,$4)', [`oip-v2-fix-004-session-row-${suffix}`, tokenHash(sessionToken), userId, "2099-01-01T00:00:00.000Z"]);
    await db.query("COMMIT");

    const retrieval = assertCandidateSelection();
    const copy = assertCopyStates();
    const eventTime = assertEventTime();
    const apiEventTime = await assertEventTimeApi(db);
    console.log(JSON.stringify({ probe: "probe:oip-v2-fix-004", retrieval, copy, eventTime, apiEventTime, verdict: "OIP_V2_FIX_004_RETRIEVAL_SELECTION_EVENT_TIME_AND_COPY_RECONCILED_AND_VERIFIED" }, null, 2));
  } finally {
    await db.query("delete from organizations where id=$1", [orgId]).catch(() => undefined);
    await db.end().catch(() => undefined);
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
