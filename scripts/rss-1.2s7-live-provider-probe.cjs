/* RSS-1.2S7 live Tier-1 provider verification. Uses synthetic data only. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness();
const { readAIConfig, createAIAdapter } = require(path.join(root, "lib", "ai", "adapter.ts"));
const { buildAIAdvisory } = require(path.join(root, "lib", "ai", "deterministic.ts"));
const { processTicket } = require(path.join(root, "lib", "application", "tickets", "processTicket.ts"));
const { createPersistenceContext } = require(path.join(root, "lib", "persistence", "context.ts"));

const syntheticInput = {
  ticket: {
    id: "RSS12S7-LIVE-001",
    customerName: "Synthetic Verification Customer",
    subject: "Webhook signature verification fails after a secret rotation",
    description: "Synthetic verification ticket only. Webhook signatures fail after rotating the signing secret. No customer data.",
    category: "Integrations",
    status: "new",
    createdAt: "2026-08-09T00:00:00.000Z"
  },
  organizationProfile: {
    id: "rss12s7-synthetic-org",
    name: "RSS-1.2S7 Synthetic Verification",
    industry: "Software",
    description: "Synthetic provider verification profile.",
    products: ["Webhook Gateway"],
    services: ["Support"],
    supportedDomains: ["integrations"],
    businessVocabulary: ["webhook", "signature", "secret rotation"],
    supportedIssueTypes: ["signature failure"],
    outOfScopeTopics: [],
    customerTone: "professional",
    supportBoundaries: [],
    autoResolutionThreshold: 80,
    escalationRules: [],
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z"
  },
  deterministicUnderstanding: {
    ticketId: "RSS12S7-LIVE-001",
    summary: "Webhook signature verification fails after a secret rotation",
    coreProblem: "Webhook signature verification fails",
    category: "Integrations",
    urgency: "medium",
    tags: ["webhook", "signature"],
    detectedSignals: ["secret rotation"],
    extractedFields: {
      senderName: null,
      senderRole: null,
      companyName: null,
      deadline: null,
      subIssues: [],
      urgencyIndicators: []
    }
  },
  deterministicPatternTitle: "Webhook signature verification after secret rotation",
  patternSummary: "Webhook signatures fail after a signing secret rotation."
};

function safeBaseUrl(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password) {
      url.username = "<redacted>";
      url.password = "<redacted>";
    }
    if (url.search) url.search = "?<redacted>";
    if (url.hash) url.hash = "#<redacted>";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "<invalid-url>";
  }
}

function publicAttempt(attempt) {
  return {
    provider: attempt.provider,
    status: attempt.status,
    failureClass: attempt.failureClass,
    httpStatus: attempt.httpStatus,
    timedOut: attempt.timedOut,
    retries: attempt.retries,
    completionLength: attempt.completionLength,
    jsonParseStatus: attempt.jsonParseStatus,
    structuredOutputValid: attempt.structuredOutputValid
  };
}

function check(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}`);
  assert.ok(condition, label);
}

async function main() {
  const config = readAIConfig();
  const configSummary = {
    mode: config.mode,
    providerLabel: config.providerLabel,
    baseUrl: safeBaseUrl(config.baseUrl),
    model: config.model,
    timeoutMs: config.timeoutMs,
    proxyPath: config.proxyPath,
    maxRetries: config.maxRetries,
    apiKeyConfigured: Boolean(config.apiKey),
    lmStudioBaseUrl: safeBaseUrl(config.lmStudioBaseUrl),
    lmStudioModel: config.lmStudioModel,
    lmStudioTimeoutMs: config.lmStudioTimeoutMs
  };
  console.log(`CONFIG ${JSON.stringify(configSummary)}`);
  check("effective mode is DeepSeek", config.mode === "deepseek");
  check("Tier 1 credential is configured without exposing it", Boolean(config.apiKey));
  check("Tier 1 endpoint and model are configured", config.baseUrl.length > 0 && config.model.length > 0);

  const adapter = createAIAdapter(config);
  const liveResults = [];
  for (let i = 1; i <= 5; i += 1) {
    const startedAt = Date.now();
    const result = await adapter.provider.suggestPatternName({
      ...syntheticInput,
      ticket: { ...syntheticInput.ticket, id: `RSS12S7-LIVE-${String(i).padStart(3, "0")}` },
      deterministicUnderstanding: { ...syntheticInput.deterministicUnderstanding, ticketId: `RSS12S7-LIVE-${String(i).padStart(3, "0")}` }
    });
    const row = {
      request: i,
      elapsedMs: Date.now() - startedAt,
      ok: result.ok,
      provider: result.providerLabel,
      model: result.model,
      latencyMs: result.latencyMs,
      error: result.error,
      endpointUsed: result.diagnostics?.endpointUsed,
      proxySucceeded: result.diagnostics?.proxySucceeded,
      attempts: result.diagnostics?.attempts?.map(publicAttempt),
      fallbackPath: result.diagnostics?.fallbackPath,
      completionStatus: result.diagnostics?.completionStatus,
      structuredOutputValid: result.diagnostics?.attempts?.[0]?.structuredOutputValid
    };
    console.log(`LIVE_CALL ${JSON.stringify(row)}`);
    liveResults.push(result);
  }
  check("all five live adapter requests succeeded", liveResults.every((result) => result.ok));
  check("all five live requests are attributed to DeepSeek", liveResults.every((result) => result.providerLabel === "DeepSeek API"));
  check("all five live requests used the configured DeepSeek model", liveResults.every((result) => result.model === config.model));
  check("all five live requests report successful structured output", liveResults.every((result) => result.diagnostics?.attempts?.[0]?.structuredOutputValid === true));
  check("healthy Tier 1 never invokes Claude and skips optional LM Studio", liveResults.every((result) => result.diagnostics?.attempts?.every((attempt) => attempt.provider !== "Claude API") && result.diagnostics?.attempts?.[1]?.provider === "LM Studio" && result.diagnostics?.attempts?.[1]?.status === "skipped"));

  // Run one complete OIP application-service operation against an in-memory
  // disposable persistence session. This exercises ticket intake, deterministic
  // understanding, advisory calls, drafting, and the normal in-review result
  // without touching PostgreSQL or any protected fixture.
  const pipelineOrg = "rss12s7-pipeline-org";
  const pipelineRequestId = "rss12s7-pipeline-request";
  const pipelineContext = createPersistenceContext({
    organizationId: pipelineOrg,
    actorContext: { id: "rss12s7-synthetic-actor", name: "Synthetic Probe", email: "rss12s7@example.test" },
    authority: "server",
    requestId: pipelineRequestId
  });
  const pipelineRecords = [];
  const pipelinePersistence = {
    context: pipelineContext,
    loadTicketRecords: async () => pipelineRecords,
    generateTicketId: async () => "RSS12S7-PIPELINE-TICKET",
    saveTicketRecord: async (record) => {
      const index = pipelineRecords.findIndex((candidate) => candidate.id === record.id);
      if (index >= 0) pipelineRecords[index] = record;
      else pipelineRecords.push(record);
    },
    loadKnowledgeHistory: async () => ({ lessons: [], changes: [] })
  };
  const pipeline = await processTicket({
    organizationId: pipelineOrg,
    actorContext: pipelineContext.actorContext,
    authority: "server",
    requestId: pipelineRequestId,
    ticketInput: {
      subject: syntheticInput.ticket.subject,
      description: syntheticInput.ticket.description,
      customerName: syntheticInput.ticket.customerName,
      source: "rss-1.2s7-synthetic"
    },
    organizationProfile: { ...syntheticInput.organizationProfile, id: pipelineOrg },
    processingOptions: { knowledgeItems: [] }
  }, { persistence: pipelinePersistence, ai: adapter });
  console.log(`OIP_PIPELINE ${JSON.stringify({
    processingState: pipeline.processingState,
    persisted: pipeline.persisted,
    stages: pipeline.telemetrySummary.stages,
    ticketId: pipeline.ticket.id,
    provider: pipeline.providerDiagnostics.provider,
    model: pipeline.providerDiagnostics.model,
    completionStatus: pipeline.providerDiagnostics.completionStatus,
    attempts: pipeline.providerDiagnostics.attempts?.map(publicAttempt),
    persistedRecordCount: pipelineRecords.length
  })}`);
  check("real OIP application pipeline reached in-review", pipeline.processingState === "in_review" && pipeline.persisted === true);
  check("real OIP pipeline recorded a successful DeepSeek Tier-1 attempt without Claude", pipeline.providerDiagnostics.attempts?.[0]?.provider === "DeepSeek API" && pipeline.providerDiagnostics.attempts?.[0]?.status === "succeeded" && pipeline.providerDiagnostics.attempts?.[1]?.provider === "LM Studio" && pipeline.providerDiagnostics.attempts?.[1]?.status === "skipped" && pipeline.providerDiagnostics.attempts?.every((attempt) => attempt.provider !== "Claude API"));
  check("real OIP pipeline used only disposable in-memory persistence", pipelineRecords.length === 1);

  // Exercise the same authorized proxy route used by browser callers. The
  // limiter is bypassed only in this in-process probe so no counter is written.
  const rateLimit = require(path.join(root, "lib", "server", "aiRateLimit.ts"));
  const originalLimit = rateLimit.enforceAIProxyLimitsOrRespond;
  const { installAIRouteAuthStub } = require("./lib/ai-route-auth.cjs");
  const restoreAuth = installAIRouteAuthStub({ role: "support_agent" });
  rateLimit.enforceAIProxyLimitsOrRespond = async () => ({ response: null, decision: { allowed: true, remaining: 99 } });
  try {
    const deepseekRoute = require(path.join(root, "app", "api", "ai", "deepseek", "route.ts"));
    const proxyResponse = await deepseekRoute.POST(new Request("http://localhost/api/ai/deepseek", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "rss12s7-proxy-probe" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "Return compact JSON only. No markdown." },
          { role: "user", content: "Return exactly {\"title\":\"Webhook signature verification\",\"confidence\":90,\"rationale\":\"Synthetic proxy probe.\"}." }
        ],
        response_format: { type: "json_object" },
        max_tokens: 700
      })
    }));
    const proxyPayload = await proxyResponse.json().catch(() => ({}));
    const proxyMessage = proxyPayload?.choices?.[0]?.message ?? {};
    console.log(`PROXY_CALL ${JSON.stringify({
      status: proxyResponse.status,
      ok: proxyResponse.ok,
      provider: proxyResponse.headers.get("x-ai-provider"),
      mode: proxyResponse.headers.get("x-ai-mode"),
      model: proxyResponse.headers.get("x-ai-model"),
      endpointUsed: proxyResponse.headers.get("x-ai-endpoint-used"),
      contentLength: typeof proxyMessage.content === "string" ? proxyMessage.content.trim().length : 0,
      reasoningLength: typeof proxyMessage.reasoning_content === "string" ? proxyMessage.reasoning_content.trim().length : 0,
      finishReason: proxyPayload?.choices?.[0]?.finish_reason
    })}`);
    check("authorized DeepSeek proxy returned success", proxyResponse.ok && proxyResponse.status === 200);
    check("proxy response is attributed to DeepSeek", proxyResponse.headers.get("x-ai-provider") === "DeepSeek API");
    check("proxy returned an answer content channel", typeof proxyMessage.content === "string" && proxyMessage.content.trim().length > 0);
  } finally {
    rateLimit.enforceAIProxyLimitsOrRespond = originalLimit;
    restoreAuth();
  }

  // A real, controlled Tier-1 outage: point only Tier 1 at a closed local
  // port while retaining the configured live LM Studio fallback.
  const failoverConfig = {
    ...config,
    baseUrl: "http://127.0.0.1:9/v1",
    timeoutMs: 5000,
    maxRetries: 0,
    lmStudioTimeoutMs: Math.max(config.lmStudioTimeoutMs ?? 30000, 90000)
  };
  const failoverStartedAt = Date.now();
  const failover = await createAIAdapter(failoverConfig).provider.suggestPatternName(syntheticInput);
  console.log(`LIVE_FAILOVER ${JSON.stringify({
    elapsedMs: Date.now() - failoverStartedAt,
    ok: failover.ok,
    provider: failover.providerLabel,
    model: failover.model,
    attempts: failover.diagnostics?.attempts?.map(publicAttempt),
    fallbackPath: failover.diagnostics?.fallbackPath,
    proxySucceeded: failover.diagnostics?.proxySucceeded
  })}`);
  check("real Tier-1 outage is safely contained with optional LM Studio", (!failover.ok || failover.providerLabel === "LM Studio") && failover.diagnostics?.attempts?.every((attempt) => attempt.provider !== "Claude API"));
  check("real failover diagnostics identify the network boundary", failover.diagnostics?.attempts?.[0]?.status === "failed" && failover.diagnostics?.attempts?.[0]?.failureClass === "network");
  check("real failover path contains at most DeepSeek and LM Studio", failover.diagnostics?.attempts?.length === 2);

  // Exhaustion is deterministic and must not depend on an external provider.
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ error: "controlled provider outage" }), { status: 503, headers: { "content-type": "application/json" } });
  try {
    const exhausted = await createAIAdapter({ ...config, baseUrl: "https://tier1.controlled.invalid/v1", maxRetries: 0, lmStudioBaseUrl: "http://lmstudio.controlled.invalid/v1", lmStudioTimeoutMs: 5000 }).provider.suggestPatternName(syntheticInput);
    const deterministic = buildAIAdvisory({
      ticketId: syntheticInput.ticket.id,
      providerMode: exhausted.providerMode,
      providerLabel: exhausted.providerLabel,
      model: exhausted.model,
      deterministicLabel: syntheticInput.deterministicPatternTitle,
      availabilityMessage: exhausted.error ?? "All configured AI providers failed.",
      diagnostics: exhausted.diagnostics
    });
    console.log(`ALL_PROVIDER_FALLBACK ${JSON.stringify({
      providerResultOk: exhausted.ok,
      attempts: exhausted.diagnostics?.attempts?.map(publicAttempt),
      completionStatus: exhausted.diagnostics?.completionStatus,
      deterministicStatus: deterministic.status,
      deterministicLabel: deterministic.deterministicLabel,
      fallbackUsed: deterministic.fallbackUsed
    })}`);
    check("all-provider exhaustion is contained without Claude", !exhausted.ok && exhausted.diagnostics?.attempts?.length === 2 && exhausted.diagnostics?.attempts?.every((attempt) => attempt.provider !== "Claude API") && exhausted.diagnostics?.completionStatus === "failed");
    check("deterministic advisory fallback preserves the canonical label", deterministic.fallbackUsed && deterministic.status === "unavailable" && deterministic.deterministicLabel === syntheticInput.deterministicPatternTitle);
  } finally {
    global.fetch = originalFetch;
  }

  console.log("RSS-1.2S7 live Tier-1 provider probe passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
