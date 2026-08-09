/* TODO-082A provider-order and telemetry probe. No external network calls. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });
const { createAIAdapter } = require(path.join(root, "lib", "ai", "adapter.ts"));
const deepseekRoute = require(path.join(root, "app", "api", "ai", "deepseek", "route.ts"));
const { installAIRouteAuthStub } = require("./lib/ai-route-auth.cjs");

const DEEPSEEK_PATH = "/api/ai/deepseek";
const LM_STUDIO_PATH = "/api/ai/chat";

function response(payload, status = 200, headers = {}) {
  return new Response(typeof payload === "string" ? payload : JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers }
  });
}

function completion(content, headers = {}) {
  return response({ choices: [{ finish_reason: "stop", message: { content } }] }, 200, headers);
}

const input = {
  ticket: {
    id: "TODO082A-001",
    customerName: "Probe Customer",
    subject: "Webhook signature failure",
    description: "The webhook signature fails after a secret rotation.",
    status: "new",
    createdAt: new Date("2026-08-05T00:00:00.000Z")
  },
  organizationProfile: {
    id: "todo082a-org",
    name: "TODO-082A Probe",
    industry: "Testing",
    description: "Disposable in-memory provider probe.",
    products: ["Probe"],
    services: ["Support"],
    supportedDomains: ["integrations"],
    businessVocabulary: ["webhook"],
    supportedIssueTypes: ["signature failure"],
    outOfScopeTopics: [],
    customerTone: "professional",
    supportBoundaries: [],
    autoResolutionThreshold: 80,
    escalationRules: []
  },
  deterministicUnderstanding: {
    summary: "Webhook signature failure after secret rotation",
    category: "Integrations",
    urgency: "medium",
    intent: "restore webhook verification",
    entities: [],
    tags: ["webhook"],
    signals: ["signature", "secret rotation"]
  },
  deterministicPatternTitle: "Webhook signature rotation",
  patternSummary: "Webhook signatures fail after secret rotation."
};

function check(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}`);
  assert.ok(condition, label);
}

async function runScenario(outcomes) {
  const calls = [];
  global.fetch = async (endpoint) => {
    const url = String(endpoint);
    calls.push(url);
    const outcome = outcomes[calls.length - 1];
    if (outcome === "success") {
      const provider = url === DEEPSEEK_PATH ? "DeepSeek API" : "LM Studio";
      const mode = provider === "DeepSeek API" ? "deepseek" : "lmstudio";
      return completion(
        '{"title":"Webhook signature rotation","confidence":92,"rationale":"Matches the deterministic pattern."}',
        {
          "x-ai-mode": mode,
          "x-ai-provider": provider,
          "x-ai-model": provider === "DeepSeek API" ? "deepseek-v4-flash" : "probe-model",
          "x-ai-proxy-path": url,
          "x-ai-proxy-succeeded": "true"
        }
      );
    }
    return response({ error: "provider unavailable" }, 503);
  };
  const config = {
    mode: "deepseek",
    baseUrl: "https://deepseek.invalid",
    model: "deepseek-v4-flash",
    timeoutMs: 5000,
    proxyPath: DEEPSEEK_PATH,
    lmStudioBaseUrl: "http://lmstudio.invalid/v1",
    lmStudioModel: "probe-lm-model",
    lmStudioTimeoutMs: 5000
  };
  const result = await createAIAdapter(config).provider.suggestPatternName(input);
  return { calls, result };
}

async function main() {
  const originalWindow = global.window;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const originalBaseUrl = process.env.DEEPSEEK_BASE_URL;
  const originalModel = process.env.DEEPSEEK_MODEL;
  let restoreAIRouteAuthStub;
  try {
    global.window = {};
    const primary = await runScenario(["success"]);
    check("DeepSeek is attempted first", primary.calls.join("|") === DEEPSEEK_PATH);
    check("DeepSeek success is identified", primary.result.ok && primary.result.providerLabel === "DeepSeek API");
    check("Successful DeepSeek diagnostics identify the provider", primary.result.diagnostics?.provider === "DeepSeek API");
    check("LM Studio is recorded as skipped and Claude is absent", primary.result.diagnostics?.attempts?.[1]?.provider === "LM Studio"
      && primary.result.diagnostics?.attempts?.[1]?.status === "skipped"
      && primary.result.diagnostics?.attempts?.every((attempt) => attempt.provider !== "Claude API"));

    const fallback = await runScenario(["fail", "success"]);
    check("DeepSeek failure falls back to LM Studio", fallback.calls.join("|") === `${DEEPSEEK_PATH}|${LM_STUDIO_PATH}`);
    check("LM Studio fallback result is identified", fallback.result.ok && fallback.result.providerLabel === "LM Studio");
    check("Fallback path and retry telemetry are accurate", fallback.result.diagnostics?.fallbackPath?.join("|") === "DeepSeek API|LM Studio"
      && fallback.result.diagnostics?.retries === 1
      && fallback.result.diagnostics?.completionStatus === "succeeded");

    const exhausted = await runScenario(["fail", "fail"]);
    check("Exhausted chain fails safely without Claude", !exhausted.result.ok && exhausted.calls.join("|") === `${DEEPSEEK_PATH}|${LM_STUDIO_PATH}`);
    check("Exhausted diagnostics preserve all failure attempts", exhausted.result.diagnostics?.attempts?.length === 2
      && exhausted.result.diagnostics.attempts.every((attempt) => attempt.status === "failed")
      && exhausted.result.diagnostics.attempts.every((attempt) => attempt.provider !== "Claude API")
      && exhausted.result.diagnostics.completionStatus === "failed");

    delete process.env.DEEPSEEK_API_KEY;
    global.fetch = async () => { throw new Error("Missing-key route must not call DeepSeek."); };
    restoreAIRouteAuthStub = installAIRouteAuthStub({ role: "support_agent" });
    const missingKey = await deepseekRoute.POST(new Request("http://localhost/api/ai/deepseek", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "probe" }] })
    }));
    check("DeepSeek proxy fails closed before network access when key is absent", missingKey.status === 503);

    process.env.DEEPSEEK_API_KEY = "todo082a-probe-key-never-log";
    process.env.DEEPSEEK_BASE_URL = "https://deepseek-probe.invalid";
    process.env.DEEPSEEK_MODEL = "probe-deepseek-model";
    let upstreamRequest;
    global.fetch = async (endpoint, init) => {
      upstreamRequest = { endpoint: String(endpoint), init };
      return response({
        model: "probe-deepseek-model",
        choices: [{ finish_reason: "stop", message: { content: "{\"title\":\"Probe\",\"confidence\":90,\"rationale\":\"Probe response.\"}" } }]
      });
    };
    const proxySuccess = await deepseekRoute.POST(new Request("http://localhost/api/ai/deepseek", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "client-supplied-model-must-not-win",
        messages: [{ role: "user", content: "probe" }],
        response_format: { type: "json_object" }
      })
    }));
    const upstreamHeaders = new Headers(upstreamRequest.init.headers);
    const upstreamBody = JSON.parse(upstreamRequest.init.body);
    check("DeepSeek proxy uses the official chat-completions path", upstreamRequest.endpoint === "https://deepseek-probe.invalid/chat/completions");
    check("DeepSeek model is controlled by server configuration", upstreamBody.model === "probe-deepseek-model");
    check("DeepSeek authorization is injected server-side", upstreamHeaders.get("authorization") === "Bearer todo082a-probe-key-never-log");
    check("DeepSeek proxy returns OpenAI-compatible JSON and safe diagnostics", proxySuccess.status === 200
      && proxySuccess.headers.get("x-ai-provider") === "DeepSeek API"
      && proxySuccess.headers.get("x-ai-mode") === "deepseek"
      && (await proxySuccess.json()).choices?.[0]?.message?.content?.includes("Probe"));

    console.info("TODO-082A DeepSeek provider probe passed.");
  } finally {
    if (typeof restoreAIRouteAuthStub === "function") restoreAIRouteAuthStub();
    if (originalWindow === undefined) delete global.window;
    else global.window = originalWindow;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
    if (originalBaseUrl === undefined) delete process.env.DEEPSEEK_BASE_URL;
    else process.env.DEEPSEEK_BASE_URL = originalBaseUrl;
    if (originalModel === undefined) delete process.env.DEEPSEEK_MODEL;
    else process.env.DEEPSEEK_MODEL = originalModel;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
