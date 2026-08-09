/* RSS-1.2A provider-agnostic stability probe. No external calls or database writes. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });
const { createAIAdapter } = require(path.join(root, "lib", "ai", "adapter.ts"));
const genericRoute = require(path.join(root, "app", "api", "ai", "openai-compatible", "route.ts"));
const diagnostics = require(path.join(root, "lib", "server", "developerAiDiagnostics.ts"));
const { installAIRouteAuthStub } = require("./lib/ai-route-auth.cjs");
const genericPath = "/api/ai/openai-compatible";
const lmPath = "/api/ai/chat";
const claudePath = "/api/ai/claude";

const input = {
  ticket: { id: "RSS12A-001", customerName: "Probe", subject: "Webhook failure", description: "The webhook fails after secret rotation.", status: "new", createdAt: new Date("2026-08-05T00:00:00.000Z") },
  organizationProfile: { id: "rss12a-org", name: "Provider Probe", industry: "Testing", description: "Probe", products: ["Probe"], services: ["Support"], supportedDomains: ["integrations"], businessVocabulary: ["webhook"], supportedIssueTypes: ["failure"], outOfScopeTopics: [], customerTone: "professional", supportBoundaries: [], autoResolutionThreshold: 80, escalationRules: [] },
  deterministicUnderstanding: { summary: "Webhook failure", category: "Integrations", urgency: "medium", intent: "restore webhook", entities: [], tags: ["webhook"], signals: ["webhook"] },
  deterministicPatternTitle: "Webhook failure",
  patternSummary: "Webhook fails after secret rotation."
};

function json(content, status = 200, finish_reason = "stop") {
  return new Response(JSON.stringify({ choices: [{ finish_reason, message: { content } }] }), { status, headers: { "content-type": "application/json" } });
}
function check(label, condition) { console.log(`${condition ? "PASS" : "FAIL"} ${label}`); assert.ok(condition, label); }

async function main() {
  const originalWindow = global.window;
  const originalFetch = global.fetch;
  const envKeys = ["NEXT_PUBLIC_AI_MODE", "AI_TIER1_API_KEY", "AI_TIER1_BASE_URL", "AI_TIER1_MODEL", "AI_TIER1_LABEL"];
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  let restoreAIRouteAuthStub;
  try {
    global.window = {};
    const config = { mode: "openai-compatible", providerLabel: "Probe Reasoning Provider", baseUrl: "https://provider.invalid/v1", model: "probe-reasoning-model", timeoutMs: 5000, proxyPath: genericPath, apiKey: "probe-key-never-logged", maxRetries: 1, lmStudioBaseUrl: "http://lm.invalid/v1", lmStudioModel: "probe-lm", lmStudioTimeoutMs: 5000 };
    const retryCalls = [];
    global.fetch = async (url) => {
      retryCalls.push(String(url));
      // The shared structured-output contract requires the exact titled
      // shape, including a non-empty rationale. The first response remains a
      // deliberate truncation; the retry is a valid provider response.
      return retryCalls.length === 1
        ? json('{"title":"incomplete"}', 200, "length")
        : json('{"title":"Webhook failure","confidence":92,"rationale":"The provider recovered after a bounded retry."}');
    };
    const retried = await createAIAdapter(config).provider.suggestPatternName(input);
    check("arbitrary OpenAI-compatible model is Tier 1", retried.ok && retried.providerLabel === "Probe Reasoning Provider" && retried.model === "probe-reasoning-model");
    check("truncation is retried exactly once and succeeds", retryCalls.join("|") === `${genericPath}|${genericPath}` && retried.ok && retried.diagnostics?.retries === 1);
    check("successful generic Tier 1 skips optional LM Studio", retried.diagnostics?.attempts?.[1]?.provider === "LM Studio" && retried.diagnostics?.attempts?.[1]?.status === "skipped");

    const fallbackCalls = [];
    global.fetch = async (url) => {
      fallbackCalls.push(String(url));
      return String(url) === genericPath
        ? json({ error: "unavailable" }, 503)
        : json('{"title":"Fallback","confidence":80,"rationale":"The fallback provider supplied a valid bounded suggestion."}');
    };
    const fallbackConfig = { ...config, maxRetries: 0 };
    const fallback = await createAIAdapter(fallbackConfig).provider.suggestPatternName(input);
    check("provider failure falls through to LM Studio", fallback.ok && fallback.providerLabel === "LM Studio" && fallbackCalls.join("|") === `${genericPath}|${lmPath}`);
    check("fallback diagnostics preserve failure classification", fallback.diagnostics?.attempts?.[0]?.failureClass === "provider_unavailable" && fallback.diagnostics?.attempts?.[0]?.httpStatus === 503);

    global.fetch = async () => json('prefix {"title":"unsafe salvage"} suffix');
    const malformed = await createAIAdapter({ ...fallbackConfig, maxRetries: 0 }).provider.suggestPatternName(input);
    check("non-strict JSON is rejected instead of salvaged", !malformed.ok && malformed.diagnostics?.attempts?.[0]?.failureClass === "malformed_response");

    global.fetch = async () => { throw new Error("simulated provider exception"); };
    const exhausted = await createAIAdapter({ ...fallbackConfig, maxRetries: 0 }).provider.suggestPatternName(input);
    check("provider exceptions are contained and fail closed without Claude", !exhausted.ok && exhausted.diagnostics?.completionStatus === "failed" && exhausted.diagnostics.attempts?.length === 2 && exhausted.diagnostics.attempts.every((attempt) => attempt.provider !== "Claude API"));
    check("diagnostics do not contain credentials or prompt data", !JSON.stringify(exhausted.diagnostics).includes("probe-key-never-logged") && !JSON.stringify(exhausted.diagnostics).includes("Webhook fails after secret rotation"));

    global.fetch = async () => { throw new DOMException("provider deadline", "AbortError"); };
    const timedOut = await createAIAdapter({ ...fallbackConfig, maxRetries: 0 }).provider.suggestPatternName(input);
    check("timeouts are classified and fail over without hanging", !timedOut.ok && timedOut.diagnostics?.attempts?.[0]?.failureClass === "timeout" && timedOut.diagnostics.attempts[0].timedOut === true);

    process.env.NEXT_PUBLIC_AI_MODE = "openai-compatible";
    process.env.AI_TIER1_API_KEY = "route-key-never-logged";
    process.env.AI_TIER1_BASE_URL = "https://generic-provider.invalid/v1";
    process.env.AI_TIER1_MODEL = "future-reasoning-model";
    process.env.AI_TIER1_LABEL = "Future Reasoning API";
    let upstream;
    global.fetch = async (url, init) => {
      upstream = { url: String(url), init };
      return json('{"title":"route probe","confidence":90}');
    };
    restoreAIRouteAuthStub = installAIRouteAuthStub({ role: "support_agent" });
    const proxied = await genericRoute.POST(new Request("http://localhost/api/ai/openai-compatible", { method: "POST", body: JSON.stringify({ model: "client-model-must-not-win", messages: [{ role: "user", content: "probe" }] }) }));
    const upstreamHeaders = new Headers(upstream.init.headers);
    const upstreamBody = JSON.parse(upstream.init.body);
    check("generic proxy uses configured endpoint and server model", proxied.status === 200 && upstream.url === "https://generic-provider.invalid/v1/chat/completions" && upstreamBody.model === "future-reasoning-model");
    check("generic proxy keeps authorization server-side", upstreamHeaders.get("authorization") === "Bearer route-key-never-logged" && !(await proxied.text()).includes("route-key-never-logged"));

    delete global.window;
    global.fetch = async () => json("OK");
    const health = await diagnostics.runProviderHealthCheck("chain");
    check("generic provider health is model-agnostic and stops at Tier 1", health.result === "success" && health.provider === "Future Reasoning API" && health.attempts[0].providerId === "openai-compatible" && health.attempts[0].startTime && health.attempts[0].finishTime && health.attempts[0].diagnosticId === health.id);

    console.info("RSS-1.2A provider stability probe passed.");
  } finally {
    if (typeof restoreAIRouteAuthStub === "function") restoreAIRouteAuthStub();
    if (originalWindow === undefined) delete global.window; else global.window = originalWindow;
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
