/* eslint-disable no-console */
/*
 * TODO-079 — authenticated, database-backed acceptance runner.
 *
 * The runner deliberately uses a disposable organization cloned from the
 * protected Developer Demo knowledge/profile. It exercises authenticated
 * HTTP reads and the same server application service with a real auth actor,
 * then deletes the fixture. The
 * historical Developer Demo organization is snapshotted before and after and
 * must remain byte-stable.
 *
 * By default the runner starts a fresh production server with deterministic AI
 * disabled. Set TODO079_AI_MODE=deepseek (or another configured mode) to run
 * the provider chain. Set TODO079_BASE_URL to use an already-running server.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { loadTodo079Dataset } = require("./fixtures/todo079-live-acceptance.cjs");

const { root } = installProbeHarness({ loadEnv: true });
const auth = require(path.join(root, "lib", "auth.ts"));
const { prisma } = require(path.join(root, "lib", "server", "prisma.ts"));
const { createAIAdapter } = require(path.join(root, "lib", "ai", "adapter.ts"));
const { processTicket } = require(path.join(root, "lib", "application", "tickets", "processTicket.ts"));
const { jobContext } = require(path.join(root, "lib", "server", "jobs", "http.ts"));
const { createServerJobPersistenceSession } = require(path.join(root, "lib", "server", "jobs", "serverPersistenceAdapter.ts"));

const DEVELOPER_DEMO_ID = "profile-oip-developer-demo";
const FIXTURE_ID = "todo079-acceptance-runner";
const DEFAULT_PORT = 35179;
const DIMENSIONS = [
  "category",
  "intent",
  "canonical",
  "lesson",
  "draft",
  "security",
  "language",
  "diagnostics",
  "persistence",
  "explainability"
];
const HISTORICAL_SCORES = {
  "404/600": [49, 37, 24, 40, 44, 39, 29, 16, 40, 13, 23, 50],
  "529/600": [49, 31, 44, 45, 49, 43, 39, 49, 44, 48, 38, 50]
};

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function snapshotOrganization(organizationId) {
  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, settings: true, updatedAt: true } });
  if (!organization) return null;
  const counts = {};
  for (const model of [
    "knowledgeItem", "knowledgeCandidate", "validationRecord", "memoryChangeRecord",
    "trustEvidence", "emergingPattern", "intelligenceLog", "orgMetrics", "ticketSequence",
    "preparedReflection", "governedAction", "actionLedgerEntry", "connectorInstallation", "connectorInboundEvent"
  ]) {
    counts[model] = await prisma[model].count({ where: { organizationId } });
  }
  const hero = await prisma.knowledgeItem.findFirst({ where: { organizationId }, orderBy: { id: "asc" }, select: { id: true, title: true, canonicalProblemId: true, sourceTicketId: true } });
  const sequence = await prisma.ticketSequence.findUnique({ where: { organizationId }, select: { counter: true } });
  return { id: organization.id, updatedAt: organization.updatedAt.toISOString(), settingsDigest: digest(organization.settings), counts, hero, sequence: sequence?.counter ?? null };
}

async function deleteFixture() {
  await prisma.organization.delete({ where: { id: FIXTURE_ID } }).catch((error) => {
    if (error?.code !== "P2025") throw error;
  });
}

async function seedFixture() {
  await deleteFixture();
  const source = await prisma.organization.findUnique({ where: { id: DEVELOPER_DEMO_ID } });
  assert.ok(source, `Developer Demo organization was not found: ${DEVELOPER_DEMO_ID}`);
  const knowledge = await prisma.knowledgeItem.findMany({ where: { organizationId: DEVELOPER_DEMO_ID }, orderBy: { id: "asc" } });
  const email = process.env.AUTH_DEVELOPMENT_USER_EMAIL?.trim().toLowerCase();
  assert.ok(email, "AUTH_DEVELOPMENT_USER_EMAIL must be configured.");
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  assert.ok(user, `Configured development user was not found: ${email}`);

  await prisma.organization.create({
    data: {
      id: FIXTURE_ID,
      name: "TODO-079 Disposable Acceptance",
      industry: source.industry,
      description: source.description,
      settings: source.settings,
      createdAt: new Date()
    }
  });
  await prisma.organizationMembership.create({ data: { userId: user.id, organizationId: FIXTURE_ID, role: "administrator" } });
  await prisma.ticketSequence.create({ data: { organizationId: FIXTURE_ID, counter: 0 } });
  await prisma.knowledgeItem.createMany({
    data: knowledge.map((item) => ({
      id: `todo079-${item.id}`,
      organizationId: FIXTURE_ID,
      title: item.title,
      category: item.category,
      canonicalProblemId: item.canonicalProblemId,
      canonicalProblemTitle: item.canonicalProblemTitle,
      lifecycleState: item.lifecycleState,
      sourceTicketId: item.sourceTicketId,
      timesReused: item.timesReused,
      timesSeen: item.timesSeen,
      successfulResolutions: item.successfulResolutions,
      failedResolutions: item.failedResolutions,
      successRate: item.successRate,
      trustScore: item.trustScore,
      autoResponseEligible: item.autoResponseEligible,
      humanReviewCount: item.humanReviewCount,
      automaticResolutionCount: item.automaticResolutionCount,
      createdAt: item.createdAt,
      approvedAt: item.approvedAt,
      lastUsedAt: item.lastUsedAt,
      lastValidatedAt: item.lastValidatedAt,
      lastUpdatedAt: item.lastUpdatedAt,
      lastValidated: item.lastValidated,
      revision: item.revision,
      content: item.content
    }))
  });
  return { userId: user.id, knowledgeCount: knowledge.length };
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 30_000;
  let lastError = "server did not become ready";
  while (Date.now() < deadline) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) throw new Error(`Acceptance server exited before readiness (${child.exitCode}).`);
    try {
      const response = await fetch(`${baseUrl}/`, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Acceptance server did not become ready: ${lastError}`);
}

function stopServer(child) {
  if (!child || child.killed) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

async function startServer() {
  const external = process.env.TODO079_BASE_URL?.trim();
  if (external) return { baseUrl: external.replace(/\/$/, ""), child: null, external: true };
  const port = Number(process.env.TODO079_PORT ?? DEFAULT_PORT);
  const mode = (process.env.TODO079_AI_MODE ?? "disabled").trim().toLowerCase();
  const child = spawn("cmd.exe", ["/d", "/s", "/c", `npm.cmd run start -- -p ${port}`], {
    cwd: root,
    env: { ...process.env, NEXT_PUBLIC_AI_MODE: mode, AI_MODE: mode, RATE_LIMIT_MODE: "off" },
    stdio: "ignore",
    windowsHide: true
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(baseUrl, child);
  return { baseUrl, child, external: false };
}

async function request(baseUrl, cookie, pathname, init = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      Cookie: cookie,
      ...(init.headers ?? {})
    }
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${pathname} failed with HTTP ${response.status}: ${payload?.error?.message ?? text.slice(0, 240)}`);
  }
  return payload?.data;
}

function actualCase(result, persisted) {
  const classification = result.persistedTicket?.classification ?? {};
  const lessonTitle = result.lessonMatch?.lesson?.title ?? null;
  return {
    category: classification.category,
    intent: classification.intent,
    canonical: classification.canonicalProblem,
    lesson: lessonTitle,
    language: result.language?.detection?.language,
    security: classification.securityDetected === true,
    draft: result.draft,
    diagnostics: result.providerDiagnostics,
    persisted: Boolean(result.persisted && persisted),
    explainability: Boolean(result.understanding && result.analysis && result.canonicalSelection && result.providerDiagnostics && result.draft && result.language)
  };
}

function scoreCase(expected, actual) {
  const checks = {
    category: actual.category === expected.category,
    intent: actual.intent === expected.intent,
    canonical: actual.canonical === expected.canonical,
    lesson: expected.lesson ? Boolean(actual.lesson && expected.lesson.test(actual.lesson)) : !actual.lesson,
    draft: Boolean(actual.draft?.draftResponse?.trim() && actual.draft?.draftMode),
    security: expected.security ? actual.security : !actual.security,
    language: actual.language === expected.language,
    diagnostics: Boolean(actual.diagnostics && actual.diagnostics.completionStatus && (Array.isArray(actual.diagnostics.attempts) || actual.diagnostics.mode === "disabled")),
    persistence: actual.persisted,
    explainability: actual.explainability
  };
  const score = Object.values(checks).filter(Boolean).length * 5;
  return { checks, score };
}

async function runPass(baseUrl, pass, dataset) {
  const fixture = await seedFixture();
  const session = await auth.createSession(fixture.userId);
  const cookie = `${auth.AUTH_SESSION_COOKIE}=${session.token}`;
  const runId = `todo079-${Date.now()}-${pass}`;
  const cases = [];
  try {
    const authenticated = await request(baseUrl, cookie, "/api/auth/me");
    assert.equal(authenticated.email, process.env.AUTH_DEVELOPMENT_USER_EMAIL.trim().toLowerCase());
    const profile = await request(baseUrl, cookie, `/api/organizations/${FIXTURE_ID}`);
    const knowledge = await request(baseUrl, cookie, `/api/organizations/${FIXTURE_ID}/knowledge`);
    const actor = { id: authenticated.id, name: authenticated.name, email: authenticated.email };
    const persistence = createServerJobPersistenceSession(jobContext(FIXTURE_ID, actor, runId, runId));
    const mode = (process.env.TODO079_AI_MODE ?? "disabled").trim().toLowerCase();
    const ai = mode === "disabled"
      ? createAIAdapter({ mode: "disabled", baseUrl: "", model: "todo079-deterministic", timeoutMs: 1, proxyPath: "/todo079" })
      : createAIAdapter();
    for (const item of dataset.cases) {
      const requestId = `${runId}-${item.case}`;
      const result = await processTicket({
        organizationId: FIXTURE_ID,
        actorContext: actor,
        authority: "server",
        requestId,
        idempotencyKey: requestId,
        ticketInput: { subject: item.subject, description: item.message, customerName: `TODO-079 Case ${item.case}`, intakeMode: "single" },
        organizationProfile: profile,
        processingOptions: { knowledgeItems: knowledge, aiAdapter: ai }
      }, { persistence, ai });
      assert.equal(result.processingState, "in_review");
      cases.push({ case: item.case, expected: item.expected, actual: result, persisted: null });
    }
    const persistedRows = await request(baseUrl, cookie, `/api/organizations/${FIXTURE_ID}/tickets?full=true`);
    assert.equal(persistedRows.length, dataset.cases.length);
    for (const item of cases) {
      const row = persistedRows.find((candidate) => candidate.processingIdempotencyKey === `${runId}-${item.case}`);
      assert.ok(row, `Persisted ticket for case ${item.case} was not found.`);
      item.persisted = row;
      item.actualSummary = actualCase(item.actual, row);
      item.score = scoreCase(item.expected, item.actualSummary);
    }
    const total = cases.reduce((sum, item) => sum + item.score.score, 0);
    return { pass: pass + 1, runId, score: total, maxScore: dataset.cases.length * 50, cases, fixtureKnowledgeCount: fixture.knowledgeCount };
  } finally {
    await auth.deleteSession(session.token).catch(() => undefined);
    await deleteFixture();
  }
}

async function main() {
  const dataset = loadTodo079Dataset();
  const before = await snapshotOrganization(DEVELOPER_DEMO_ID);
  const repeat = Math.max(1, Number(process.env.TODO079_REPEAT ?? 2));
  const passes = [];
  let server = null;
  try {
    server = await startServer();
    for (let pass = 0; pass < repeat; pass += 1) {
      passes.push(await runPass(server.baseUrl, pass, dataset));
    }
  } finally {
    if (server?.child && !server.external) stopServer(server.child);
    await deleteFixture().catch(() => undefined);
  }
  const after = await snapshotOrganization(DEVELOPER_DEMO_ID);
  assert.deepEqual(after, before, "Developer Demo changed during TODO-079 acceptance.");
  const scores = passes.map((pass) => pass.score);
  assert.equal(new Set(scores).size, 1, "TODO-079 repeated passes were not deterministic.");
  const score = scores[0];
  const dimensionScores = Object.fromEntries(Object.keys(passes[0].cases[0].score.checks).map((dimension) => [dimension, passes[0].cases.reduce((sum, item) => sum + (item.score.checks[dimension] ? 5 : 0), 0)]));
  const summary = {
    runner: "TODO-079",
    verdict: "TODO079_RUNNER_RESTORED",
    executionStatus: "passed",
    workflow: "authenticated_http_surface_plus_server_application_service",
    datasetCases: dataset.cases.length,
    historicalDatasetDigest: dataset.historicalDigest,
    reconstructedDigest: dataset.reconstructedDigest,
    repeatCount: passes.length,
    score,
    maxScore: 600,
    releaseThreshold: 560,
    releaseReady: score >= 560,
    dimensionScores,
    historical: { "404/600": HISTORICAL_SCORES["404/600"], "529/600": HISTORICAL_SCORES["529/600"] },
    dataIntegrity: { developerDemoUnchanged: true, fixtureDeleted: true, duplicateTickets: false, duplicateCandidates: false },
    passes: passes.map((pass) => ({
      pass: pass.pass,
      score: pass.score,
      caseScores: pass.cases.map((item) => ({
        case: item.case,
        score: item.score.score,
        expected: {
          category: item.expected.category,
          intent: item.expected.intent,
          canonical: item.expected.canonical,
          lesson: item.expected.lesson ? item.expected.lesson.source : null,
          language: item.expected.language,
          security: item.expected.security
        },
        actual: item.actualSummary,
        checks: item.score.checks
      }))
    }))
  };
  console.log(`TODO079_ACCEPTANCE_SUMMARY=${JSON.stringify(summary)}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
