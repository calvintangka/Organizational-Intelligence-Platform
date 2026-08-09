/* RSS-1.2E-FINAL-A provider policy probe. No external calls or database writes. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });
const { createAIAdapter, readAIConfig } = require(path.join(root, "lib", "ai", "adapter.ts"));
const { buildAIAdvisory } = require(path.join(root, "lib", "ai", "deterministic.ts"));
const diagnostics = require(path.join(root, "lib", "server", "developerAiDiagnostics.ts"));

const input = {
  ticket: { id: "RSS12EFA-001", customerName: "Probe", subject: "Webhook signature failure", description: "Synthetic provider policy probe.", status: "new", createdAt: new Date("2026-08-09T00:00:00.000Z") },
  organizationProfile: { id: "rss12efa-org", name: "RSS-1.2E-FINAL-A Probe", industry: "Testing", description: "Disposable provider policy fixture.", products: ["Probe"], services: ["Support"], supportedDomains: ["integrations"], businessVocabulary: ["webhook", "signature"], supportedIssueTypes: ["signature failure"], outOfScopeTopics: [], customerTone: "professional", supportBoundaries: [], autoResolutionThreshold: 80, escalationRules: [] },
  deterministicUnderstanding: { summary: "Webhook signature failure", category: "Integrations", urgency: "medium", intent: "signature failure", entities: [], tags: ["webhook"], signals: ["signature"] },
  deterministicPatternTitle: "Webhook signature rotation",
  patternSummary: "Webhook signatures fail after rotation."
};

function completion() {
  return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{"title":"Webhook signature rotation","confidence":92,"rationale":"Synthetic policy response."}' } }] }), { status: 200, headers: { "content-type": "application/json" } });
}

function check(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}`);
  assert.ok(condition, label);
}

async function main() {
  const originalWindow = global.window;
  const originalFetch = global.fetch;
  const envKeys = ["NEXT_PUBLIC_AI_MODE", "AI_MODE", "DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL", "DEEPSEEK_MODEL", "AI_BASE_URL", "AI_MODEL", "AI_LMSTUDIO_ENABLED", "AI_PROVIDER_MAX_RETRIES"];
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  try {
    global.window = {};
    process.env.NEXT_PUBLIC_AI_MODE = "deepseek";
    process.env.DEEPSEEK_API_KEY = "rss12efa-key-never-logged";
    process.env.DEEPSEEK_BASE_URL = "https://deepseek.policy.invalid/v1";
    process.env.DEEPSEEK_MODEL = "deepseek-policy-model";
    process.env.AI_BASE_URL = "http://lmstudio.policy.invalid/v1";
    process.env.AI_MODEL = "policy-lm-model";
    process.env.AI_LMSTUDIO_ENABLED = "true";
    process.env.AI_PROVIDER_MAX_RETRIES = "0";

    let calls = [];
    global.fetch = async (endpoint) => { calls.push(String(endpoint)); return completion(); };
    const healthy = await createAIAdapter(readAIConfig()).provider.suggestPatternName(input);
    check("DeepSeek is the required primary", healthy.ok && healthy.providerLabel === "DeepSeek API");
    check("Healthy primary makes no LM Studio or Claude call", calls.length === 1 && healthy.diagnostics?.attempts?.every((attempt) => attempt.provider !== "Claude API"));
    check("Active chain label excludes Claude", !healthy.providerLabel.includes("Claude"));

    calls = [];
    global.fetch = async (endpoint) => {
      calls.push(String(endpoint));
      return calls.length === 1 ? new Response(JSON.stringify({ error: "tier1 unavailable" }), { status: 503 }) : completion();
    };
    const lmFallback = await createAIAdapter(readAIConfig()).provider.suggestPatternName(input);
    check("DeepSeek failure reaches LM Studio when available", lmFallback.ok && lmFallback.providerLabel === "LM Studio" && calls.length === 2);
    check("Live fallback diagnostics exclude Claude", lmFallback.diagnostics?.attempts?.every((attempt) => attempt.provider !== "Claude API"));

    process.env.AI_LMSTUDIO_ENABLED = "false";
    calls = [];
    global.fetch = async (endpoint) => { calls.push(String(endpoint)); return new Response(JSON.stringify({ error: "tier1 unavailable" }), { status: 503 }); };
    const disabledConfig = readAIConfig();
    const exhausted = await createAIAdapter(disabledConfig).provider.suggestPatternName(input);
    const deterministic = buildAIAdvisory({
      ticketId: input.ticket.id,
      providerMode: exhausted.providerMode,
      providerLabel: exhausted.providerLabel,
      model: exhausted.model,
      deterministicLabel: input.deterministicPatternTitle,
      availabilityMessage: exhausted.error,
      diagnostics: exhausted.diagnostics
    });
    check("Disabled LM Studio is skipped safely", !exhausted.ok && calls.length === 1 && exhausted.diagnostics?.attempts?.every((attempt) => attempt.provider !== "Claude API"));
    check("Deterministic fallback is final and safe", deterministic.fallbackUsed && deterministic.status === "unavailable" && deterministic.deterministicLabel === input.deterministicPatternTitle);

    process.env.AI_LMSTUDIO_ENABLED = "true";
    const enabledSnapshot = diagnostics.providerDiagnosticsSnapshot();
    check("Diagnostics show DeepSeek → LM Studio → deterministic", enabledSnapshot.fallbackOrder.join("|") === "DeepSeek API|LM Studio|Deterministic fallback");
    check("Diagnostics never present Claude as an active provider", !enabledSnapshot.fallbackOrder.some((label) => /Claude/i.test(label)) && !enabledSnapshot.providers.some((provider) => /Claude/i.test(provider.label)));

    process.env.AI_LMSTUDIO_ENABLED = "false";
    const disabledSnapshot = diagnostics.providerDiagnosticsSnapshot();
    check("Diagnostics expose operator-disabled LM Studio state", disabledSnapshot.fallbackOrder.join("|") === "DeepSeek API|Deterministic fallback" && disabledSnapshot.providers.find((provider) => provider.id === "lmstudio")?.status === "disabled");
    console.info("RSS-1.2E-FINAL-A provider policy probe passed.");
  } finally {
    global.fetch = originalFetch;
    if (originalWindow === undefined) delete global.window; else global.window = originalWindow;
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key];
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
