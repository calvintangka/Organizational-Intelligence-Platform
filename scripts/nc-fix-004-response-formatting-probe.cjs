/*
 * NC-FIX-004 formatting-boundary probe.
 *
 * This probe uses a fictional multiline response only. It exercises the real
 * structured-output parser, the OIP ticket application service, authenticated
 * ticket APIs, durable draft/message storage, resume, and multi-turn history.
 * It never prints credentials or authorization headers.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { promisify } = require("node:util");
const { Client } = require("pg");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: true });
const { createLMStudioProvider } = require(path.join(root, "lib", "ai", "lmStudio.ts"));
const { processTicket } = require(path.join(root, "lib", "application", "tickets", "processTicket.ts"));
const { createPersistenceContext } = require(path.join(root, "lib", "persistence", "context.ts"));

const baseUrl = process.env.NC_FIX_004_BASE_URL || "http://127.0.0.1:3405";
const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
const orgId = `nc-fix-004-org-${suffix}`;
const userId = `nc-fix-004-user-${suffix}`;
const email = `${userId}@example.test`;
const ticketId = `NC-FIX-004-${suffix}`;
const password = `NC-FIX-004-${suffix}-safe-password!`;
const scrypt = promisify(crypto.scrypt);

const formatted = "Hi Rina,\n\nThanks for reaching out.\n\nPlease check location permissions.\n\nBest regards,\nNusaCloud Support";
const humanEdit = "Hi Rina,\n\nThanks for reaching out.\n\nPlease check location permissions.\n\n- Enable location services.\n- Allow the NusaCloud app to use location.\n\nBest regards,\nNusaCloud Support";
const followUp = "Hi Rina,\n\nThanks for the update.\n\nPlease send the phone model and operating system version.\n\nBest regards,\nNusaCloud Support";

function tokenHash(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}
function sessionCookie(token) { return `oip_session=${token}`; }
function jsonHeaders(cookie) { return { cookie, "content-type": "application/json" }; }
function fingerprint(value) {
  return { length: value.length, newlines: (value.match(/\n/g) || []).length, paragraphs: value.split(/\n\s*\n/).length };
}
function check(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}`);
  assert.ok(condition, label);
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
  return { status: response.status, headers: response.headers, body };
}

async function startServer() {
  const port = new URL(baseUrl).port || "3405";
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", port], {
    cwd: root,
    windowsHide: true,
    env: { ...process.env, RATE_LIMIT_MODE: "off", AI_MODE: "disabled", NEXT_PUBLIC_AI_MODE: "disabled", ANTHROPIC_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  server.stdout.on("data", (chunk) => { output = `${output}${chunk}`.slice(-12000); });
  server.stderr.on("data", (chunk) => { output = `${output}${chunk}`.slice(-12000); });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next server exited before readiness.\n${output}`);
    try { await fetch(`${baseUrl}/api/auth/me`); return server; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  server.kill();
  throw new Error(`Next server did not become ready.\n${output}`);
}

async function seed(db) {
  const hash = await passwordHash(password);
  await db.query(
    'insert into organizations (id,name,industry,description,settings,"createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,current_timestamp,current_timestamp)',
    [orgId, "NusaCloud HR NC-FIX-004 Disposable", "Human Resources", "Formatting pipeline probe", JSON.stringify({})]
  );
  await db.query(
    'insert into users (id,name,email,"passwordHash","activeOrganizationId","updatedAt") values ($1,$2,$3,$4,$5,current_timestamp)',
    [userId, "NC-FIX-004 Probe Reviewer", email, hash, orgId]
  );
  await db.query('insert into organization_memberships ("userId","organizationId",role) values ($1,$2,$3)', [userId, orgId, "owner"]);
  await db.query(
    'insert into organization_role_assignments (id,"organizationId","userId","roleId","assignedByUserId","updatedAt") select $1,$2,$3,id,$3,current_timestamp from rbac_roles where key=$4',
    [`nc-fix-004-assignment-${suffix}`, orgId, userId, "owner"]
  );
  const token = `nc-fix-004-session-${suffix}`;
  await db.query(
    'insert into auth_sessions (id,"tokenHash","userId","expiresAt") values ($1,$2,$3,$4)',
    [`nc-fix-004-auth-${suffix}`, tokenHash(token), userId, "2099-01-01T00:00:00.000Z"]
  );
  const classification = JSON.stringify({ category: "Mobile", intent: "support", canonicalProblem: "Location permissions", classifiedBy: "deterministic", confidence: "high" });
  const resolution = JSON.stringify({ finalResponse: formatted, humanEdited: false, editDistanceNote: null, resolvedAt: null, draftRevision: 1 });
  await db.query(
    'insert into ticket_records (id,"organizationId","ticketId","rawMessage",subject,status,"draftSource",classification,resolution,reflection,"validationRecordIds",labels,"createdAt") values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,current_timestamp)',
    [`nc-fix-004-row-${suffix}`, orgId, ticketId, "Location permissions are not working on Andi's device.", "Location permissions", "in_review", "ai_advisory", classification, resolution, JSON.stringify({ decision: null, lessonCreatedId: null, lessonReinforcedId: null, knowledgeChanged: null }), "[]", "[]"]
  );
  return token;
}

async function cleanup(db) {
  await db.query('delete from ticket_transition_audits where "organizationId" = $1', [orgId]);
  await db.query('delete from users where id = $1', [userId]);
  await db.query('delete from organizations where id = $1', [orgId]);
}

function syntheticProfile() {
  return {
    id: "nc-fix-004-pipeline-org", name: "NusaCloud HR", industry: "Human Resources",
    description: "Synthetic NusaCloud support profile.", products: ["NusaCloud"], services: ["Support"],
    supportedDomains: ["mobile", "location"], businessVocabulary: ["location permissions"],
    supportedIssueTypes: ["mobile application issue"], outOfScopeTopics: [], customerTone: "friendly",
    supportBoundaries: [], autoResolutionThreshold: 80, escalationRules: []
  };
}

function fakeProvider() {
  const ok = (data) => ({ ok: true, providerMode: "openai-compatible", providerLabel: "Synthetic formatting provider", model: "probe", latencyMs: 0, data });
  return {
    mode: "openai-compatible", label: "Synthetic formatting provider",
    analyzeTicket: async () => ok({ summary: "Location permissions issue", category: "Mobile", urgency: "medium", entities: [], tags: ["location"], confidence: 95, rationale: "Synthetic probe", extractedFields: { senderName: "Rina", senderRole: null, companyName: null, deadline: null, subIssues: [], urgencyIndicators: [] } }),
    suggestCanonicalProblem: async () => ok({ title: "Location permissions", confidence: 95, rationale: "Synthetic probe" }),
    suggestPatternName: async () => ok({ title: "Location permissions", confidence: 95, rationale: "Synthetic probe" }),
    enrichKnowledge: async () => ok({ internalGuidance: ["Check permissions"], troubleshootingChecklist: ["Check permissions"], rootCauseHypotheses: [], preventiveActions: [], confidence: 95 }),
    draftCustomerResponse: async () => ok({ draftResponse: formatted, confidence: 95 }),
    discriminateMatch: async () => ok({ isDistinctFromMatch: false, confidence: "high", reasoning: "Synthetic probe" })
  };
}

async function deterministicPipelineCheck() {
  const profile = syntheticProfile();
  const records = [];
  const context = createPersistenceContext({ organizationId: profile.id, actorContext: { id: "nc-fix-004-actor", name: "Probe" }, authority: "server", requestId: "nc-fix-004-pipeline" });
  const persistence = {
    context,
    async generateTicketId() { return "NC-FIX-004-PIPELINE-TICKET"; },
    async loadTicketRecords() { return records; },
    async saveTicketRecord(record) { const index = records.findIndex((item) => item.id === record.id); if (index >= 0) records[index] = record; else records.push(record); },
    async loadKnowledgeHistory() { return { lessons: [], changes: [] }; }
  };
  const result = await processTicket({
    organizationId: profile.id, actorContext: context.actorContext, authority: "server", requestId: "nc-fix-004-pipeline",
    ticketInput: { subject: "Mobile application location permissions", description: "Rina cannot use location services on Andi's device.", customerName: "Rina" },
    organizationProfile: profile, processingOptions: { knowledgeItems: [] }
  }, { persistence, ai: { config: { mode: "openai-compatible", baseUrl: "", model: "probe", timeoutMs: 1, proxyPath: "/probe" }, provider: fakeProvider() } });
  check("explicit blank lines survive OIP drafting", result.persistedTicket.resolution.finalResponse.startsWith(formatted));
  check("drafting layer retains multiple paragraphs", fingerprint(result.persistedTicket.resolution.finalResponse).paragraphs >= 4);
  return result.persistedTicket.resolution.finalResponse;
}

async function parserCheck() {
  const rawProviderText = JSON.stringify({ customerResponse: formatted, confidence: 95 });
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: rawProviderText } }] }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const provider = createLMStudioProvider({ mode: "lmstudio", baseUrl: "http://127.0.0.1:1/v1", model: "probe", timeoutMs: 5000, proxyPath: "/probe" });
    const result = await provider.draftCustomerResponse({
      ticket: { id: "NC-FIX-004-PARSER", ticketId: "NC-FIX-004-PARSER", customerName: "Rina", subject: "Location permissions", description: "Location permissions are unavailable.", status: "new", createdAt: new Date().toISOString() },
      organizationProfile: syntheticProfile(),
      deterministicUnderstanding: { ticketId: "NC-FIX-004-PARSER", summary: "Location permissions", coreProblem: "Location permissions", category: "Mobile", urgency: "medium", tags: [], detectedSignals: [], extractedFields: { senderName: "Rina", senderRole: null, companyName: null, deadline: null, subIssues: [], urgencyIndicators: [] } },
      canonicalProblemTitle: "Location permissions", groundingMode: "cold_start", groundingLabel: "synthetic", groundingContent: "", deterministicDraft: formatted, matchedKnowledge: null
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.draftResponse, formatted);
    console.log(`RAW_PROVIDER_SAFE ${JSON.stringify({ ...fingerprint(formatted), encoded: JSON.stringify(formatted) })}`);
    check("raw provider and adapter preserve newlines", result.data.draftResponse === formatted);
  } finally {
    global.fetch = originalFetch;
  }
}

async function main() {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
  await deterministicPipelineCheck();
  await parserCheck();
  for (const file of ["app/page.tsx", "components/HumanReviewEditor.tsx", "components/views/TicketWorkspace.tsx", "components/views/CaseLookupView.tsx"]) {
    assert.equal(fs.readFileSync(path.join(root, file), "utf8").includes("dangerouslySetInnerHTML"), false, `unsafe HTML path absent from ${file}`);
  }
  let server;
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  let cleaned = false;
  try {
    server = await startServer();
    await db.connect();
    const token = await seed(db);
    const cookie = sessionCookie(token);
    const initial = await request(`/api/organizations/${orgId}/tickets?full=true`, { headers: { cookie } });
    assert.equal(initial.status, 200);
    assert.equal(initial.body.data.find((row) => row.ticketId === ticketId).resolution.finalResponse, formatted);
    check("API round-trip preserves generated formatting", initial.body.data.find((row) => row.ticketId === ticketId).resolution.finalResponse === formatted);

    const transition = (command) => request(`/api/organizations/${orgId}/tickets/${encodeURIComponent(ticketId)}/transition`, { method: "POST", headers: jsonHeaders(cookie), body: JSON.stringify(command) });
    const saved = await transition({ kind: "save_draft", finalResponse: humanEdit, humanEdited: true, expectedDraftRevision: 1 });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.data.resolution.finalResponse, humanEdit);
    check("human multiline edit persists exactly", saved.body.data.resolution.finalResponse === humanEdit);

    const resumed = await request(`/api/organizations/${orgId}/tickets?full=true`, { headers: { cookie } });
    assert.equal(resumed.body.data.find((row) => row.ticketId === ticketId).resolution.finalResponse, humanEdit);
    check("resume read preserves human formatting", resumed.body.data.find((row) => row.ticketId === ticketId).resolution.finalResponse === humanEdit);

    const sent1 = await transition({ kind: "send_agent_message", finalResponse: humanEdit, humanEdited: true, expectedDraftRevision: 2, idempotencyKey: `send-1-${suffix}` });
    assert.equal(sent1.status, 200);
    const customer = await transition({ kind: "append_customer_message", content: "The issue continues after checking permissions.", idempotencyKey: `customer-2-${suffix}` });
    assert.equal(customer.status, 200);
    const saved2 = await transition({ kind: "save_draft", finalResponse: followUp, humanEdited: true, expectedDraftRevision: 0 });
    assert.equal(saved2.status, 200);
    const sent2 = await transition({ kind: "send_agent_message", finalResponse: followUp, humanEdited: true, expectedDraftRevision: 1, idempotencyKey: `send-2-${suffix}` });
    assert.equal(sent2.status, 200);
    const messages = await request(`/api/organizations/${orgId}/tickets/${encodeURIComponent(ticketId)}/messages`, { headers: { cookie } });
    assert.equal(messages.status, 200);
    const agentMessages = messages.body.data.filter((message) => message.direction === "agent");
    assert.deepEqual(agentMessages.map((message) => message.content), [humanEdit, followUp]);
    check("historical multi-turn agent messages preserve paragraphs", agentMessages.every((message) => message.content.includes("\n\n")));

    // Restarting the server models a refresh/resume boundary without retaining
    // in-process application state.
    server.kill();
    await new Promise((resolve) => setTimeout(resolve, 500));
    server = await startServer();
    const afterRestart = await request(`/api/organizations/${orgId}/tickets/${encodeURIComponent(ticketId)}/messages`, { headers: { cookie } });
    assert.deepEqual(afterRestart.body.data.filter((message) => message.direction === "agent").map((message) => message.content), [humanEdit, followUp]);
    check("refresh/server restart preserves historical formatting", true);
    console.log(`FORMAT_FINGERPRINT ${JSON.stringify(fingerprint(humanEdit))}`);
    console.log("NC-FIX-004 response formatting probe passed.");
  } finally {
    if (db._connected) { await cleanup(db); cleaned = true; }
    await db.end().catch(() => undefined);
    server?.kill();
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  check("disposable cleanup succeeds", cleaned);
}

main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
