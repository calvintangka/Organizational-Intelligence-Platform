/*
 * NC-FIX-005 AI draft latency probe.
 *
 * Default mode is deterministic and offline: it exercises the real process
 * pipeline, timing envelope, and structured-output parser with fictional data.
 * `--live` is an explicit operator action and performs controlled DeepSeek
 * calls; it prints safe metadata only and never prints prompts, completions,
 * credentials, or authorization headers.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: process.argv.includes("--live") });
const { createLMStudioProvider } = require(path.join(root, "lib", "ai", "lmStudio.ts"));
const { createAIAdapter, readAIConfig } = require(path.join(root, "lib", "ai", "adapter.ts"));
const { processTicket } = require(path.join(root, "lib", "application", "tickets", "processTicket.ts"));
const { createPersistenceContext } = require(path.join(root, "lib", "persistence", "context.ts"));

const LIVE = process.argv.includes("--live");
const check = (label, condition) => {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}`);
  assert.ok(condition, label);
};

function fingerprint(value) {
  return { length: value.length, newlines: (value.match(/\n/g) || []).length };
}

function syntheticProfile() {
  return {
    id: "nc-fix-005-probe-org", name: "NusaCloud HR", industry: "Human Resources",
    description: "Fictional latency probe profile.", products: ["NusaCloud"], services: ["Support"],
    supportedDomains: ["mobile", "access", "billing"], businessVocabulary: ["activation", "permissions"],
    supportedIssueTypes: ["application issue"], outOfScopeTopics: [], customerTone: "friendly",
    supportBoundaries: [], autoResolutionThreshold: 80, escalationRules: []
  };
}

function syntheticTicket(id = "NC-FIX-005-PROBE-TICKET") {
  return {
    id, ticketId: id, customerName: "Fictional Reviewer", subject: "Activation email delayed",
    description: "The fictional NusaCloud activation email has not arrived after two attempts.",
    status: "new", createdAt: "2026-08-11T00:00:00.000Z"
  };
}

function diagnostics(provider, totalMs = 3) {
  return {
    mode: "openai-compatible", provider, model: "probe", proxyPath: "/probe",
    completionStatus: "succeeded", timing: { promptBuildMs: 0.2, requestMs: totalMs - 1, responseBodyMs: 0.5, parseMs: 0.1, totalMs },
    attempts: [{ label: provider, provider, status: "succeeded", retries: 0, latencyMs: totalMs, jsonParseStatus: "valid", structuredOutputValid: true }]
  };
}

function fakeProvider() {
  const ok = (data, provider = "Synthetic latency provider") => ({
    ok: true, providerMode: "openai-compatible", providerLabel: provider, model: "probe", latencyMs: 3,
    data, diagnostics: diagnostics(provider)
  });
  return {
    mode: "openai-compatible", label: "Synthetic latency provider",
    analyzeTicket: async () => ok({ summary: "Activation email delayed", category: "Access", urgency: "medium", entities: [], tags: ["activation"], confidence: 95, rationale: "Synthetic probe", extractedFields: { senderName: "Fictional Reviewer", senderRole: null, companyName: null, deadline: null, subIssues: [], urgencyIndicators: [] } }),
    suggestCanonicalProblem: async () => ok({ title: "Activation email delay", confidence: 95, rationale: "Synthetic probe" }),
    suggestPatternName: async () => ok({ title: "Activation email delay", confidence: 95, rationale: "Synthetic probe" }),
    enrichKnowledge: async () => ok({ internalGuidance: ["Check activation delivery"], troubleshootingChecklist: ["Check spam folder"], rootCauseHypotheses: [], preventiveActions: [], confidence: 95 }),
    draftCustomerResponse: async () => ok({ draftResponse: "Hi there,\n\nPlease check your spam folder and request one fresh activation email.\n\nBest regards,\nNusaCloud Support", confidence: 95 }),
    discriminateMatch: async () => ok({ isDistinctFromMatch: false, confidence: "high", reasoning: "Synthetic probe" })
  };
}

async function deterministicPipelineCheck() {
  const profile = syntheticProfile();
  const records = [];
  const context = createPersistenceContext({ organizationId: profile.id, actorContext: { id: "nc-fix-005-actor", name: "Probe" }, authority: "server", requestId: "nc-fix-005-pipeline" });
  const persistence = {
    context,
    async generateTicketId() { return "NC-FIX-005-PIPELINE-TICKET"; },
    async loadTicketRecords() { return records; },
    async saveTicketRecord(record) { const index = records.findIndex((item) => item.id === record.id); if (index >= 0) records[index] = record; else records.push(record); },
    async loadKnowledgeHistory() { return { lessons: [], changes: [] }; }
  };
  const result = await processTicket({
    organizationId: profile.id, actorContext: context.actorContext, authority: "server", requestId: "nc-fix-005-pipeline",
    ticketInput: { subject: "Activation email delayed", description: "The fictional NusaCloud activation email has not arrived after two attempts.", customerName: "Fictional Reviewer" },
    organizationProfile: profile, processingOptions: { knowledgeItems: [] }
  }, { persistence, ai: { config: { mode: "openai-compatible", baseUrl: "", model: "probe", timeoutMs: 5000, proxyPath: "/probe" }, provider: fakeProvider() } });
  const timing = result.telemetrySummary.timing;
  check("deterministic process completes", result.persisted === true && result.reviewState === "in_review");
  check("process timing envelope is present", Number.isFinite(timing.totalMs) && timing.totalMs >= 0);
  check("retrieval, draft, and persistence timings are nonnegative", [timing.retrievalMs, timing.draftProcessingMs, timing.persistenceMs].every((value) => Number.isFinite(value) && value >= 0));
  check("provider timing is carried into the application result", timing.providerMs === 3 && timing.providerAttempts === 1);
  check("prompt and parser timings are carried into the application result", timing.promptBuildMs === 0.2 && timing.parseMs === 0.1);
  check("fictional multiline draft persists", result.persistedTicket.resolution.finalResponse.includes("\n\n"));
  check("timing metadata does not contain credentials", !JSON.stringify(result.telemetrySummary).match(/api[_-]?key|authorization|bearer/i));
  console.log(`DETERMINISTIC_TIMING ${JSON.stringify({ ...timing, draft: fingerprint(result.persistedTicket.resolution.finalResponse) })}`);
}

async function parserTimingCheck() {
  const rawProviderText = JSON.stringify({ customerResponse: "Hi there,\n\nThis is a fictional parser response.", confidence: 95 });
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: rawProviderText } }] }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const provider = createLMStudioProvider({ mode: "lmstudio", baseUrl: "http://127.0.0.1:1/v1", model: "probe", timeoutMs: 5000, proxyPath: "/probe" });
    const result = await provider.draftCustomerResponse({
      ticket: syntheticTicket("NC-FIX-005-PARSER"), organizationProfile: syntheticProfile(),
      deterministicUnderstanding: { ticketId: "NC-FIX-005-PARSER", summary: "Activation delay", coreProblem: "Activation email delay", category: "Access", urgency: "medium", tags: [], detectedSignals: [], extractedFields: { senderName: "Fictional Reviewer", senderRole: null, companyName: null, deadline: null, subIssues: [], urgencyIndicators: [] } },
      canonicalProblemTitle: "Activation email delay", groundingMode: "cold_start", groundingLabel: "synthetic", groundingContent: "", deterministicDraft: "Fictional deterministic draft", matchedKnowledge: null
    });
    check("structured parser timing is present", result.ok && result.diagnostics?.timing?.requestMs !== undefined && result.diagnostics?.timing?.parseMs !== undefined && result.diagnostics?.timing?.promptBuildMs !== undefined);
    check("parser preserves fictional content", result.ok && result.data.draftResponse.includes("fictional parser response"));
    console.log(`PARSER_TIMING ${JSON.stringify({ timing: result.diagnostics?.timing, completionLength: result.diagnostics?.completionLength })}`);
  } finally {
    global.fetch = originalFetch;
  }
}

function liveInput(index) {
  const scenarios = [
    ["Activation email delayed", "The fictional NusaCloud activation email has not arrived after two attempts."],
    ["Mobile permission prompt", "The fictional mobile app cannot access location after the user allowed permission."],
    ["Invoice recipient correction", "Please update the fictional invoice recipient for next month's renewal."],
    ["Report export timeout", "A fictional quarterly report export remains stuck after several minutes."],
    ["Role access request", "A fictional support teammate needs the standard analyst role to view a case."]
  ];
  const [subject, description] = scenarios[index % scenarios.length];
  return {
    ticket: { ...syntheticTicket(`NC-FIX-005-LIVE-${index + 1}`), subject, description },
    organizationProfile: syntheticProfile(),
    deterministicUnderstanding: { ticketId: `NC-FIX-005-LIVE-${index + 1}`, summary: subject, coreProblem: description, category: "Support", urgency: "medium", tags: ["fictional", "latency-probe"], detectedSignals: [], extractedFields: { senderName: "Fictional Reviewer", senderRole: null, companyName: null, deadline: null, subIssues: [], urgencyIndicators: [] } },
    canonicalProblemTitle: subject, groundingMode: "cold_start", groundingLabel: "fictional controlled sample", groundingContent: "No mature organizational memory is used in this probe.", deterministicDraft: "Hi there,\n\nThis is a fictional deterministic support draft.\n\nBest regards,\nNusaCloud Support", matchedKnowledge: null
  };
}

async function liveSample(provider, index, mode = "sequential") {
  const startedAt = performance.now();
  let result;
  try {
    result = await provider.draftCustomerResponse(liveInput(index));
  } catch (error) {
    result = { ok: false, error: error instanceof Error ? error.message : "unknown error" };
  }
  const totalMs = Number(Math.max(0, performance.now() - startedAt).toFixed(3));
  const diagnostics = result.diagnostics;
  return {
    index: index + 1, mode, ok: result.ok === true, totalMs,
    providerMs: diagnostics?.timing?.totalMs ?? result.latencyMs ?? null,
    promptBuildMs: diagnostics?.timing?.promptBuildMs ?? null,
    promptChars: diagnostics?.timing?.promptChars ?? null,
    requestMs: diagnostics?.timing?.requestMs ?? null,
    responseBodyMs: diagnostics?.timing?.responseBodyMs ?? null,
    parseMs: diagnostics?.timing?.parseMs ?? null,
    attempts: diagnostics?.attempts?.length ?? 0,
    retries: diagnostics?.retries ?? 0,
    fallback: (diagnostics?.attempts?.length ?? 0) > 1,
    httpStatus: diagnostics?.httpStatus ?? null,
    failureClass: diagnostics?.failureClass ?? null,
    completionLength: diagnostics?.completionLength ?? null
  };
}

async function liveCheck() {
  assert.ok(process.env.DEEPSEEK_API_KEY, "--live requires DEEPSEEK_API_KEY");
  const base = readAIConfig();
  const config = { ...base, mode: "deepseek", apiKey: process.env.DEEPSEEK_API_KEY, lmStudioEnabled: false, maxRetries: Math.max(0, Math.min(1, Number(process.env.AI_PROVIDER_MAX_RETRIES ?? "1"))) };
  const adapter = createAIAdapter(config);
  const sequential = [];
  for (let index = 0; index < 10; index += 1) sequential.push(await liveSample(adapter.provider, index));
  const concurrent = await Promise.all([liveSample(adapter.provider, 10, "concurrent"), liveSample(adapter.provider, 11, "concurrent")]);
  const samples = [...sequential, ...concurrent];
  const success = samples.filter((sample) => sample.ok);
  check("live probe returned controlled metadata", samples.length === 12 && success.length >= 5);
  console.log(`LIVE_CONFIG ${JSON.stringify({ mode: config.mode, model: config.model, provider: adapter.provider.label, timeoutMs: config.timeoutMs, retriesConfigured: config.maxRetries, apiKeyPresent: true })}`);
  for (const sample of samples) console.log(`LIVE_SAMPLE ${JSON.stringify(sample)}`);
  console.log(`LIVE_SUMMARY ${JSON.stringify({ samples: samples.length, successful: success.length, failed: samples.length - success.length, sequential: sequential.length, concurrent: concurrent.length, retriesObserved: samples.some((sample) => sample.retries > 0), fallbackObserved: samples.some((sample) => sample.fallback), rateLimitObserved: samples.some((sample) => sample.httpStatus === 429), coldMs: sequential[0]?.totalMs ?? null, warmMedianInputMs: sequential.slice(1).map((sample) => sample.totalMs) })}`);
}

async function main() {
  for (let iteration = 0; iteration < 10; iteration += 1) await deterministicPipelineCheck();
  await parserTimingCheck();
  if (LIVE) await liveCheck();
  console.log(`NC-FIX-005 ${LIVE ? "live" : "deterministic"} latency probe passed.`);
}

main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
