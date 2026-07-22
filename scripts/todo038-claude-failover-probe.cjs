/* TODO-038 focused LM Studio -> Claude API -> deterministic fail-safe probe. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness({ loadEnv: false });
const { createAIAdapter } = require(path.join(root, "lib", "ai", "adapter.ts"));
const claudeRoute = require(path.join(root, "app", "api", "ai", "claude", "route.ts"));

const CLAUDE_PATH = "/api/ai/claude";
const LM_STUDIO_PATH = "/api/ai/chat";
const FAKE_KEY = "todo038-probe-key-never-log";
const MODEL = "claude-haiku-4-5-20251001";

function check(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}`);
  assert.ok(condition, label);
}

function response(payload, status = 200, headers = {}) {
  return new Response(typeof payload === "string" ? payload : JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers }
  });
}

function completion(content, headers = {}) {
  return response(
    { choices: [{ finish_reason: "stop", message: { content } }] },
    200,
    headers
  );
}

const config = {
  mode: "lmstudio",
  baseUrl: "http://todo038.invalid/v1",
  model: "todo038-lm-model",
  timeoutMs: 5000,
  proxyPath: LM_STUDIO_PATH
};
const patternInput = {
  ticket: {
    id: "TODO038-001",
    customerName: "Probe Customer",
    subject: "Webhook signature failure",
    description: "The signature fails after secret rotation.",
    status: "new",
    createdAt: new Date("2026-07-22T00:00:00.000Z")
  },
  organizationProfile: {
    id: "todo038-org",
    name: "TODO-038 Probe",
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

async function adapterScenario(outcomes) {
  const calls = [];
  global.fetch = async (endpoint) => {
    calls.push(String(endpoint));
    const outcome = outcomes[calls.length - 1];
    if (outcome === "success") {
      const isClaude = endpoint === CLAUDE_PATH;
      return completion(
        '{"title":"Webhook signature rotation","confidence":92}',
        isClaude
          ? {
              "x-ai-mode": "claude",
              "x-ai-provider": "Claude API",
              "x-ai-model": MODEL,
              "x-ai-proxy-path": CLAUDE_PATH,
              "x-ai-server-base-url": "https://api.anthropic.com",
              "x-ai-endpoint-used": "https://api.anthropic.com/v1/messages",
              "x-ai-proxy-succeeded": "true"
            }
          : {}
      );
    }
    if (outcome === "malformed") return completion("not-json");
    return response({ error: "provider unavailable" }, 503);
  };
  const result = await createAIAdapter(config).provider.suggestPatternName(patternInput);
  return { calls, result };
}

async function main() {
  const originalFetch = global.fetch;
  const originalWindow = global.window;
  const originalKey = process.env.ANTHROPIC_API_KEY;
  const originalModel = process.env.CLAUDE_MODEL;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const capturedLogs = [];

  global.window = {};
  console.info = (...values) => capturedLogs.push(values);
  console.warn = (...values) => capturedLogs.push(values);

  try {
    const lmSuccess = await adapterScenario(["success"]);
    check("CASE A LM Studio success skips Claude", lmSuccess.result.ok
      && lmSuccess.result.providerLabel === "LM Studio"
      && lmSuccess.calls.join("|") === LM_STUDIO_PATH);
    check("CASE A diagnostics mark Claude skipped", lmSuccess.result.diagnostics?.attempts?.[1]?.status === "skipped");

    const claudeSuccess = await adapterScenario(["fail", "success"]);
    check("CASE B LM Studio failure invokes Claude only", claudeSuccess.calls.join("|") === `${LM_STUDIO_PATH}|${CLAUDE_PATH}`);
    check("CASE B Claude result identity is accurate", claudeSuccess.result.ok
      && claudeSuccess.result.providerMode === "claude"
      && claudeSuccess.result.providerLabel === "Claude API"
      && claudeSuccess.result.model === MODEL
      && claudeSuccess.result.diagnostics?.provider === "Claude API");

    const totalFailure = await adapterScenario(["fail", "fail"]);
    check("CASE C both provider failures return safe failure", !totalFailure.result.ok
      && totalFailure.result.data === undefined
      && totalFailure.calls.join("|") === `${LM_STUDIO_PATH}|${CLAUDE_PATH}`);
    check("CASE C diagnostics preserve both failed attempts", totalFailure.result.diagnostics?.attempts?.length === 2
      && totalFailure.result.diagnostics.attempts.every((attempt) => attempt.status === "failed"));

    const malformed = await adapterScenario(["fail", "malformed"]);
    check("CASE D malformed Claude output fails safely", !malformed.result.ok
      && malformed.result.data === undefined
      && malformed.result.error?.includes("valid JSON"));

    delete process.env.ANTHROPIC_API_KEY;
    global.fetch = async () => { throw new Error("Missing-key route must not call Anthropic."); };
    const missingKey = await claudeRoute.POST(new Request("http://localhost/api/ai/claude", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "probe" }] })
    }));
    check("Claude proxy fails closed before network access when key is absent", missingKey.status === 503);

    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    process.env.CLAUDE_MODEL = MODEL;
    let upstreamRequest;
    global.fetch = async (endpoint, init) => {
      upstreamRequest = { endpoint: String(endpoint), init };
      return response({
        content: [{ type: "text", text: '{"title":"Claude proxy success","confidence":91}' }],
        stop_reason: "end_turn",
        model: MODEL,
        usage: { input_tokens: 12, output_tokens: 8 }
      });
    };
    const proxySuccess = await claudeRoute.POST(new Request("http://localhost/api/ai/claude", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        temperature: 0.2,
        max_tokens: 180,
        messages: [
          { role: "system", content: "Return JSON." },
          { role: "user", content: "Probe Claude." }
        ]
      })
    }));
    const proxyPayload = await proxySuccess.json();
    const upstreamHeaders = new Headers(upstreamRequest.init.headers);
    const upstreamBody = JSON.parse(upstreamRequest.init.body);
    check("Claude proxy calls the Anthropic Messages endpoint", upstreamRequest.endpoint === "https://api.anthropic.com/v1/messages");
    check("Claude key is injected server-side with required API version", upstreamHeaders.get("x-api-key") === FAKE_KEY
      && upstreamHeaders.get("anthropic-version") === "2023-06-01");
    check("Claude proxy controls model and separates system prompt", upstreamBody.model === MODEL
      && upstreamBody.system === "Return JSON."
      && upstreamBody.messages.length === 1
      && upstreamBody.messages[0].role === "user");
    check("Claude proxy returns OpenAI-compatible content and diagnostics", proxySuccess.status === 200
      && proxySuccess.headers.get("x-ai-provider") === "Claude API"
      && proxySuccess.headers.get("x-ai-mode") === "claude"
      && proxyPayload.choices?.[0]?.message?.content?.includes("Claude proxy success"));

    global.fetch = async () => response("not-json");
    const malformedProxy = await claudeRoute.POST(new Request("http://localhost/api/ai/claude", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Probe malformed response." }] })
    }));
    check("Malformed Anthropic response fails closed", malformedProxy.status === 502);

    const clientSources = [
      path.join(root, "lib", "ai", "adapter.ts"),
      path.join(root, "lib", "ai", "claudeApi.ts"),
      path.join(root, "app", "page.tsx"),
      path.join(root, "components", "views", "BulkUploadWorkspace.tsx")
    ].map((file) => fs.readFileSync(file, "utf8")).join("\n");
    const environmentExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");
    const activeSources = `${clientSources}\n${environmentExample}`;
    const routeSource = fs.readFileSync(path.join(root, "app", "api", "ai", "claude", "route.ts"), "utf8");
    check("NVIDIA and Nemotron are absent from the active provider surface", !/nvidia|nemotron/i.test(activeSources)
      && !fs.existsSync(path.join(root, "app", "api", "ai", "nvidia", "route.ts")));
    check("Anthropic key is server-only", routeSource.includes("process.env.ANTHROPIC_API_KEY")
      && environmentExample.includes("ANTHROPIC_API_KEY=")
      && !clientSources.includes("ANTHROPIC_API_KEY")
      && !routeSource.includes("NEXT_PUBLIC_ANTHROPIC"));
    check("Claude proxy logs never include the API key", !capturedLogs.flat(Infinity).map(String).join(" ").includes(FAKE_KEY));
    check("Local secret files are not tracked", !childProcess.execFileSync("git", ["ls-files", ".env", ".env.local"], { cwd: root, encoding: "utf8" }).trim());

    originalInfo("TODO-038 Claude failover probe passed.");
  } finally {
    global.fetch = originalFetch;
    if (originalWindow === undefined) delete global.window;
    else global.window = originalWindow;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.CLAUDE_MODEL;
    else process.env.CLAUDE_MODEL = originalModel;
    console.info = originalInfo;
    console.warn = originalWarn;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
