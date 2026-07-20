/* Focused BUG-010 probe: malformed profile safety and ticket cleanup semantics. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness({ loadEnv: false });

const { seedOrganizationProfiles } = require(path.join(root, "data", "seedOrganizationProfiles.ts"));
const {
  coerceProfileStringArray,
  normalizeOrganizationProfile
} = require(path.join(root, "lib", "organizationProfile.ts"));
const {
  assessBusinessRelevanceForProfile,
  understandForProfile
} = require(path.join(root, "lib", "analyzer.ts"));
const { classifyBusinessDomain } = require(path.join(root, "lib", "domainClassifier.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { buildAnalyzeTicketPrompt } = require(path.join(root, "lib", "ai", "prompts.ts"));
const { createAIAdapter } = require(path.join(root, "lib", "ai", "adapter.ts"));
const { TicketRequestGuard } = require(path.join(root, "lib", "ticketRequestGuard.ts"));

const matureProfile = seedOrganizationProfiles.find((profile) => profile.id === "profile-maesa-tech");
assert.ok(matureProfile, "checked-in Maesa profile must exist for read-only fixtures");

const probeTicket = {
  id: "BUG010-PROBE-001",
  ticketId: "BUG010-PROBE-001",
  customerName: "Probe Customer",
  subject: "Cannot log in",
  description: "I cannot log in after forgetting my password.",
  category: "",
  status: "new",
  createdAt: "2026-07-19T00:00:00.000Z"
};

function runAnalysis(profile) {
  const relevance = assessBusinessRelevanceForProfile(`${probeTicket.subject} ${probeTicket.description}`, profile);
  const understanding = understandForProfile(probeTicket, profile);
  const canonical = identifyCanonicalProblem(understanding, profile);
  const domain = classifyBusinessDomain(`${probeTicket.subject} ${probeTicket.description}`, probeTicket.id, profile);
  const prompt = buildAnalyzeTicketPrompt({
    ticket: probeTicket,
    organizationProfile: profile,
    deterministicUnderstanding: understanding
  });
  return { relevance, understanding, canonical, domain, prompt };
}

// A-B: every affected field tolerates absent and malformed values and becomes [].
const arrayFields = ["products", "services", "supportedDomains", "businessVocabulary", "supportedIssueTypes"];
for (const field of arrayFields) {
  for (const malformed of [undefined, null, "not-an-array", { invalid: true }, 42]) {
    const profile = { ...matureProfile, [field]: malformed };
    const normalized = normalizeOrganizationProfile(profile);
    assert.deepEqual(normalized[field], [], `${field} must normalize malformed values to []`);
    assert.doesNotThrow(() => runAnalysis(profile), `${field} must not crash analysis`);
  }
}

// C: all profile arrays malformed/absent still produce a safe deterministic result.
const allMalformed = {
  ...matureProfile,
  products: undefined,
  services: null,
  supportedDomains: "billing",
  businessVocabulary: { value: "login" },
  supportedIssueTypes: 99,
  outOfScopeTopics: undefined,
  supportBoundaries: null,
  escalationRules: "not-an-array"
};
const malformedResult = runAnalysis(allMalformed);
assert.ok(malformedResult.understanding.category, "malformed profile should still classify safely");
assert.ok(malformedResult.prompt.user.includes("Products: none"), "malformed prompt context should be safe");

// D: normal profile behavior is unchanged by normalization.
const validResult = runAnalysis(matureProfile);
const normalizedResult = runAnalysis(normalizeOrganizationProfile(matureProfile));
assert.deepEqual(normalizedResult.understanding, validResult.understanding);
assert.deepEqual(normalizedResult.canonical, validResult.canonical);
assert.deepEqual(normalizedResult.domain, validResult.domain);

async function main() {
// E-H: model the exact generation-aware try/catch/finally contract used by the page.
async function runCleanupScenario(kind) {
  const guard = new TicketRequestGuard();
  const generation = guard.begin();
  let isProcessing = true;
  let reported = false;
  try {
    if (kind === "sync") throw new Error("sync probe failure");
    if (kind === "async") await Promise.reject(new Error("async probe failure"));
  } catch (error) {
    if (guard.isCurrent(generation)) reported = error instanceof Error;
  } finally {
    if (guard.isCurrent(generation)) isProcessing = false;
  }
  return { isProcessing, reported };
}

assert.deepEqual(await runCleanupScenario("sync"), { isProcessing: false, reported: true });
assert.deepEqual(await runCleanupScenario("async"), { isProcessing: false, reported: true });
assert.deepEqual(await runCleanupScenario("success"), { isProcessing: false, reported: false });

async function staleFailureScenario() {
  const guard = new TicketRequestGuard();
  const ticketA = guard.begin();
  let isProcessing = true;
  const lateA = (async () => {
    try {
      await Promise.reject(new Error("Ticket A failed late"));
    } catch {
      // The stale request has no right to mutate current UI state.
    } finally {
      if (guard.isCurrent(ticketA)) isProcessing = false;
    }
  })();
  const ticketB = guard.begin();
  isProcessing = true;
  await lateA;
  assert.equal(guard.isCurrent(ticketB), true);
  return isProcessing;
}
assert.equal(await staleFailureScenario(), true, "stale Ticket A must not clear Ticket B processing state");

const pageSource = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
assert.match(pageSource, /finally\s*\{[\s\S]*ticketRequestIsCurrent\(requestGeneration\)[\s\S]*setIsProcessing\(false\)/);

// I: provider-chain regression using disposable fetch responses only.
const originalWindow = global.window;
const originalFetch = global.fetch;
global.window = {};
const aiConfig = {
  mode: "lmstudio",
  baseUrl: "http://probe.invalid/v1",
  model: "probe-model",
  timeoutMs: 5000,
  proxyPath: "/api/ai/chat"
};
const patternInput = {
  ticket: probeTicket,
  organizationProfile: matureProfile,
  deterministicUnderstanding: runAnalysis(matureProfile).understanding,
  deterministicPatternTitle: "Probe pattern",
  patternSummary: "Probe summary"
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

async function providerScenario(outcomes) {
  const calls = [];
  global.fetch = async (endpoint) => {
    calls.push(endpoint);
    const outcome = outcomes[calls.length - 1];
    return outcome
      ? jsonResponse({ choices: [{ message: { content: '{"title":"Probe pattern","confidence":90}' } }] })
      : jsonResponse({ error: "provider unavailable" }, 503);
  };
  const result = await createAIAdapter(aiConfig).provider.suggestPatternName(patternInput);
  return { result, calls };
}

const lmSuccess = await providerScenario([true]);
assert.equal(lmSuccess.result.ok, true);
assert.deepEqual(lmSuccess.calls, ["/api/ai/chat"]);

const nvidiaFallback = await providerScenario([false, true]);
assert.equal(nvidiaFallback.result.ok, true);
assert.deepEqual(nvidiaFallback.calls, ["/api/ai/chat", "/api/ai/nvidia"]);

const bothFail = await providerScenario([false, false]);
assert.equal(bothFail.result.ok, false);
assert.deepEqual(bothFail.calls, ["/api/ai/chat", "/api/ai/nvidia"]);

global.window = originalWindow;
global.fetch = originalFetch;
console.log("BUG-010 probe passed: profile normalization, safe sync/async cleanup, stale-request isolation, and AI failover regression.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
