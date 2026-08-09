/* RSS-1.2S6 Claude provider readiness probe. All provider calls are mocked. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });
// Route contract matrix is intentionally isolated from RSS-1.2S2's limiter;
// authorization/rate-limit behavior is covered by its dedicated probes.
process.env.RATE_LIMIT_MODE = "off";
const { createAIAdapter } = require(path.join(root, "lib", "ai", "adapter.ts"));
const { createClaudeAPIProvider, resetClaudeSessionCallCount } = require(path.join(root, "lib", "ai", "claudeApi.ts"));
const claudeRoute = require(path.join(root, "app", "api", "ai", "claude", "route.ts"));
const { installAIRouteAuthStub } = require("./lib/ai-route-auth.cjs");

const CLAUDE_PATH = "/api/ai/claude";
const DEEPSEEK_PATH = "/api/ai/deepseek";
const LM_PATH = "/api/ai/chat";
const MODEL = "claude-haiku-4-5-20251001";
const API_KEY = "rss12s6-probe-key-never-log";

const ticket = { id: "RSS-1.2S6-001", customerName: "Probe Customer", subject: "Webhook signature failure", description: "The webhook signature fails after secret rotation.", status: "new", createdAt: new Date("2026-08-06T00:00:00.000Z") };
const profile = { id: "rss12s6-org", name: "RSS-1.2S6 Probe", industry: "Testing", description: "Disposable provider fixture", products: ["Probe"], services: ["Support"], supportedDomains: ["integrations"], businessVocabulary: ["webhook"], supportedIssueTypes: ["signature failure"], outOfScopeTopics: [], customerTone: "professional", supportBoundaries: [], autoResolutionThreshold: 80, escalationRules: [] };
const understanding = { summary: "Webhook signature failure after secret rotation", category: "Integrations", urgency: "medium", intent: "restore webhook verification", entities: [], tags: ["webhook"], signals: ["signature", "secret rotation"], extractedFields: { senderName: null, senderRole: null, companyName: null, deadline: null, subIssues: [], urgencyIndicators: [] } };
const patternInput = { ticket, organizationProfile: profile, deterministicUnderstanding: understanding, deterministicPatternTitle: "Webhook signature rotation", patternSummary: "Webhook signatures fail after secret rotation." };

function check(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}`);
  assert.ok(condition, label);
}

function response(payload, status = 200, headers = {}) {
  return new Response(typeof payload === "string" ? payload : JSON.stringify(payload), { status, headers: { "content-type": "application/json", ...headers } });
}

function completion(content, model = MODEL) {
  return response({ choices: [{ finish_reason: "stop", message: { content } }], model });
}

const outputs = {
  analyze: '{"summary":"Webhook signature failure","category":"Integrations","urgency":"medium","entities":[],"tags":["webhook"],"confidence":92,"rationale":"Matches the ticket.","extractedFields":{"senderName":null,"senderRole":null,"companyName":null,"deadline":null,"subIssues":[],"urgencyIndicators":[]}}',
  titled: '{"title":"Webhook signature rotation","confidence":92,"rationale":"Matches the deterministic pattern."}',
  enrichment: '{"internalGuidance":["Verify the rotated secret."],"troubleshootingChecklist":["Compare signatures."],"rootCauseHypotheses":["Secret mismatch."],"preventiveActions":["Document rotation."],"confidence":90}',
  draft: '{"customerResponse":"Hello, we will review the webhook signature failure.","confidence":90}',
  discrimination: '{"isDistinctFromMatch":false,"confidence":"high","reasoning":"The ticket describes the same signature rotation issue."}'
};

async function directOperations() {
  resetClaudeSessionCallCount();
  global.window = {};
  const calls = [];
  const provider = createClaudeAPIProvider();
  global.fetch = async (endpoint) => {
    calls.push(String(endpoint));
    const content = calls.length === 1 ? outputs.analyze
      : calls.length === 2 ? outputs.titled
        : calls.length === 3 ? outputs.titled
          : calls.length === 4 ? outputs.enrichment
            : calls.length === 5 ? outputs.draft
              : outputs.discrimination;
    return completion(content);
  };
  const results = await Promise.all([
    provider.analyzeTicket({ ticket, organizationProfile: profile, deterministicUnderstanding: understanding }),
    provider.suggestCanonicalProblem({ ticket, organizationProfile: profile, deterministicUnderstanding: understanding, deterministicCanonicalProblem: { title: "Webhook signature rotation", summary: understanding.summary, category: "Integrations" } }),
    provider.suggestPatternName(patternInput),
    provider.enrichKnowledge({ ticket, organizationProfile: profile, deterministicUnderstanding: understanding, canonicalProblemTitle: "Webhook signature rotation", matchedKnowledge: null }),
    provider.draftCustomerResponse({ ticket, organizationProfile: profile, deterministicUnderstanding: understanding, canonicalProblemTitle: "Webhook signature rotation", groundingMode: "cold_start", groundingLabel: "none", groundingContent: "", deterministicDraft: "Hello, we will review this.", matchedKnowledge: null }),
    provider.discriminateMatch({ ticket, deterministicUnderstanding: understanding, matchedCanonicalTitle: "Webhook signature rotation", matchedProblemSummary: understanding.summary })
  ]);
  check("Claude direct provider supports all six OIP operations", results.every((result) => result.ok) && calls.length === 6);
  check("Claude direct diagnostics identify provider/model and safe metadata", results.every((result) => result.diagnostics?.provider === "Claude API" && result.diagnostics?.model === MODEL && result.diagnostics?.diagnosticId && result.diagnostics?.timestamp && !JSON.stringify(result.diagnostics).includes(API_KEY)));
}

async function retryAndTimeout() {
  resetClaudeSessionCallCount();
  const provider = createClaudeAPIProvider();
  let calls = 0;
  global.fetch = async () => completion(calls++ === 0 ? '{"title":"bad","confidence":90,"rationale":"x","unexpected":true}' : outputs.titled);
  const retried = await provider.suggestPatternName(patternInput);
  check("Claude schema mismatch retries exactly once", retried.ok && calls === 2 && retried.diagnostics?.retries === 1);

  calls = 0;
  global.fetch = async () => { calls += 1; throw new DOMException("upstream timeout", "AbortError"); };
  const timedOut = await provider.suggestPatternName(patternInput);
  check("Claude timeout is bounded and classified", !timedOut.ok && calls === 2 && timedOut.diagnostics?.failureClass === "timeout" && timedOut.diagnostics?.timedOut === true);
}

async function fallbackScenarios() {
  const config = { mode: "deepseek", baseUrl: "https://deepseek.invalid", model: "deepseek-probe", timeoutMs: 5000, proxyPath: DEEPSEEK_PATH, lmStudioBaseUrl: "http://lm.invalid/v1", lmStudioModel: "lm-probe", lmStudioTimeoutMs: 5000, maxRetries: 0 };
  async function run(states) {
    const calls = [];
    global.window = {};
    global.fetch = async (endpoint) => {
      const path = String(endpoint);
      calls.push(path);
      const state = states[calls.length - 1] ?? "fail";
      if (state === "success") return completion(outputs.titled, path === CLAUDE_PATH ? MODEL : "probe-model");
      return response({ error: "provider unavailable" }, 503);
    };
    return { calls, result: await createAIAdapter(config).provider.suggestPatternName(patternInput) };
  }
  const lm = await run(["fail", "success"]);
  check("DeepSeek failure falls back to LM Studio", lm.result.ok && lm.result.providerLabel === "LM Studio" && lm.calls.join("|") === `${DEEPSEEK_PATH}|${LM_PATH}`);
  const deterministic = await run(["fail", "fail"]);
  check("DeepSeek then LM Studio failure excludes inactive Claude", !deterministic.result.ok && deterministic.calls.join("|") === `${DEEPSEEK_PATH}|${LM_PATH}` && deterministic.result.diagnostics?.attempts?.length === 2 && deterministic.result.diagnostics.attempts.every((attempt) => attempt.status === "failed" && attempt.provider !== "Claude API"));
}

async function routeVerification() {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  const originalModel = process.env.CLAUDE_MODEL;
  const originalTimeout = process.env.CLAUDE_TIMEOUT_MS;
  const originalWarn = console.warn;
  const logs = [];
  let restoreAuth;
  try {
    console.warn = (...values) => logs.push(values);
    restoreAuth = installAIRouteAuthStub({ role: "support_agent" });
    delete process.env.ANTHROPIC_API_KEY;
    global.fetch = async () => { throw new Error("network must not be touched without key"); };
    const missing = await claudeRoute.POST(new Request("http://localhost/api/ai/claude", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "probe" }] }) }));
    check("Missing Claude key fails closed before network access", missing.status === 503);

    process.env.ANTHROPIC_API_KEY = API_KEY;
    process.env.CLAUDE_MODEL = MODEL;
    let upstream;
    global.fetch = async (endpoint, init) => { upstream = { endpoint: String(endpoint), init }; return response({ content: [{ type: "text", text: outputs.titled }], stop_reason: "end_turn", model: MODEL, usage: { input_tokens: 10, output_tokens: 8 } }); };
    const success = await claudeRoute.POST(new Request("http://localhost/api/ai/claude", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ temperature: 0.2, max_tokens: 180, messages: [{ role: "system", content: "SYSTEM" }, { role: "user", content: "USER" }] }) }));
    const body = JSON.parse(upstream.init.body);
    const headers = new Headers(upstream.init.headers);
    check("Claude uses Anthropic Messages endpoint and required headers", success.status === 200 && upstream.endpoint === "https://api.anthropic.com/v1/messages" && upstream.init.method === "POST" && headers.get("x-api-key") === API_KEY && headers.get("anthropic-version") === "2023-06-01");
    check("Claude request separates system from user messages", body.system === "SYSTEM" && body.messages.length === 1 && body.messages[0].role === "user" && !JSON.stringify(body).includes(API_KEY));
    check("Claude response is normalized with safe diagnostics", success.headers.get("x-ai-provider") === "Claude API" && success.headers.get("x-ai-mode") === "claude" && !(await success.clone().text()).includes(API_KEY));

    const statuses = [401, 403, 404, 408, 409, 425, 429, 500, 502, 503, 504];
    for (const status of statuses) {
      global.fetch = async () => response({ error: "synthetic upstream error" }, status);
      const result = await claudeRoute.POST(new Request("http://localhost/api/ai/claude", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "probe" }] }) }));
      check(`Claude upstream HTTP ${status} is handled safely`, result.status === (status === 429 ? 429 : 502));
    }
    global.fetch = async () => { throw new DOMException("synthetic timeout", "AbortError"); };
    const timeout = await claudeRoute.POST(new Request("http://localhost/api/ai/claude", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "probe" }] }) }));
    check("Claude route maps abort timeout to 504", timeout.status === 504);

    check("Claude logs and route diagnostics never contain the API key", !logs.flat(Infinity).map(String).join(" ").includes(API_KEY));
  } finally {
    if (restoreAuth) restoreAuth();
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.CLAUDE_MODEL; else process.env.CLAUDE_MODEL = originalModel;
    if (originalTimeout === undefined) delete process.env.CLAUDE_TIMEOUT_MS; else process.env.CLAUDE_TIMEOUT_MS = originalTimeout;
    console.warn = originalWarn;
  }
}

async function main() {
  const originalFetch = global.fetch;
  const originalWindow = global.window;
  try {
    await directOperations();
    await retryAndTimeout();
    await fallbackScenarios();
    await routeVerification();
    console.info("RSS-1.2S6 Claude provider probe passed.");
  } finally {
    global.fetch = originalFetch;
    if (originalWindow === undefined) delete global.window; else global.window = originalWindow;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
