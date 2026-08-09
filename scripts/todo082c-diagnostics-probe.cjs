/* TODO-082C developer diagnostics probe. Uses mocked providers and no database writes. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });
const diagnostics = require(path.join(root, "lib", "server", "developerAiDiagnostics.ts"));

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

function completion() {
  return jsonResponse({ choices: [{ message: { content: "OK" } }] });
}

function check(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}`);
  assert.ok(condition, label);
}

async function main() {
  const env = {
    NEXT_PUBLIC_AI_MODE: process.env.NEXT_PUBLIC_AI_MODE,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL,
    DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
    NEXT_PUBLIC_DEEPSEEK_MODEL: process.env.NEXT_PUBLIC_DEEPSEEK_MODEL,
    AI_BASE_URL: process.env.AI_BASE_URL,
    AI_MODEL: process.env.AI_MODEL,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    CLAUDE_MODEL: process.env.CLAUDE_MODEL
  };
  const originalFetch = global.fetch;
  try {
    process.env.NEXT_PUBLIC_AI_MODE = "deepseek";
    process.env.DEEPSEEK_API_KEY = "probe-key-never-returned";
    process.env.DEEPSEEK_BASE_URL = "https://deepseek.example.test";
    process.env.DEEPSEEK_MODEL = "deepseek-probe-model";
    process.env.NEXT_PUBLIC_DEEPSEEK_MODEL = "deepseek-probe-model";
    process.env.AI_BASE_URL = "http://127.0.0.1:1234/v1";
    process.env.AI_MODEL = "lm-probe-model";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_MODEL;

    const requests = [];
    global.fetch = async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(init.body) });
      return completion();
    };
    const success = await diagnostics.runProviderHealthCheck("chain");
    check("health check uses explicit system/application/user boundaries", requests[0].body.messages[0].content.includes("SYSTEM")
      && requests[0].body.messages[1].content.includes("APPLICATION CONTEXT")
      && requests[0].body.messages[1].content.includes("<<<BEGIN OIP UNTRUSTED USER DATA>>>"));
    check("DeepSeek succeeds as the first chain provider", success.result === "success" && success.provider === "DeepSeek API");
    check("successful diagnostics identify the configured model", success.model === "deepseek-probe-model");
    check("successful chain stops before LM Studio", requests.length === 1 && success.fallbackPath.length === 1);

    requests.length = 0;
    global.fetch = async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(init.body) });
      return requests.length === 1 ? jsonResponse({ error: "unauthorized" }, 401) : completion();
    };
    const fallback = await diagnostics.runProviderHealthCheck("chain");
    check("DeepSeek failure falls back to LM Studio", fallback.result === "success" && fallback.provider === "LM Studio");
    check("fallback path is explicitly recorded", fallback.fallbackPath.join("|") === "DeepSeek API|LM Studio");
    check("fallback attempt records the authentication failure", fallback.attempts[0].httpStatus === 401 && /authentication failed/i.test(fallback.attempts[0].reason));
    check("provider credentials are absent from serialized diagnostics", !JSON.stringify(diagnostics.providerDiagnosticsSnapshot()).includes("probe-key-never-returned"));
    check("history is capped at 25 entries", diagnostics.providerDiagnosticsSnapshot().history.length <= 25);
    console.info("TODO-082C diagnostics probe passed.");
  } finally {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    global.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
