import {
  buildAnalyzeTicketPrompt,
  buildCanonicalProblemPrompt,
  buildDraftCustomerResponsePrompt,
  buildKnowledgeEnrichmentPrompt,
  buildMatchDiscriminationPrompt,
  buildPatternNamePrompt
} from "@/lib/ai/prompts";
import type {
  AIConfig,
  AIProvider,
  AIProviderResult,
  AIProviderResultMetadata,
  AnalyzeTicketInput,
  CanonicalProblemInput,
  DraftCustomerResponseInput,
  KnowledgeEnrichmentInput,
  MatchDiscriminationInput,
  PatternNameInput
} from "@/lib/ai/types";
import type {
  AIDiagnostics,
  AIAnalysisSuggestion,
  AICanonicalProblemSuggestion,
  AICustomerResponseSuggestion,
  ExtractedTicketFields,
  AIKnowledgeEnrichment,
  AIPatternSuggestion,
  AITiming,
  MatchDiscriminationResult
} from "@/types";
import { recordTelemetryEvent } from "@/lib/telemetry";

interface ChatCompletionOptions {
  maxTokens?: number;
  /**
   * F-3: per-call timeout override for batched callers like the bulk analyzer.
   * Capped at MAX_AI_TIMEOUT_MS. Defaults to config.timeoutMs.
   */
  timeoutMs?: number;
  providerLabel?: string;
  /** Validates the complete, parsed JSON object for one prompt contract. */
  validateStructuredOutput?: (value: unknown) => boolean;
}

const MAX_AI_TIMEOUT_MS = 120000;

function monotonicNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function elapsedMs(startedAt: number): number {
  return Number(Math.max(0, monotonicNow() - startedAt).toFixed(3));
}

function diagnosticId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readDiagnostics(
  config: AIConfig,
  endpoint: string,
  proxySucceeded?: boolean,
  fallbackReason?: string,
  headers?: Headers,
  metadata: AIProviderResultMetadata = {}
): AIDiagnostics {
  return {
    mode: (headers?.get("x-ai-mode") as AIDiagnostics["mode"] | null) ?? config.mode,
    provider: headers?.get("x-ai-provider") ?? config.providerLabel ?? (config.mode === "deepseek" ? "DeepSeek API" : config.mode === "claude" ? "Claude API" : config.mode === "openai-compatible" ? "OpenAI-compatible API" : "LM Studio"),
    model: headers?.get("x-ai-model") ?? config.model,
    proxyPath: headers?.get("x-ai-proxy-path") ?? config.proxyPath,
    serverBaseUrl: headers?.get("x-ai-server-base-url") ?? config.baseUrl,
    endpointUsed: headers?.get("x-ai-endpoint-used") ?? endpoint,
    proxySucceeded:
      headers?.get("x-ai-proxy-succeeded") != null
        ? headers.get("x-ai-proxy-succeeded") === "true"
        : proxySucceeded,
    fallbackReason: headers?.get("x-ai-fallback-reason") ?? fallbackReason,
    diagnosticId: diagnosticId(),
    timestamp: new Date().toISOString(),
    ...metadata
  };
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function parseJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return isRecord(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isConfidence(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

const validates = {
  analysis(value: unknown): boolean {
    if (!hasExactKeys(value, ["summary", "category", "urgency", "entities", "tags", "confidence", "rationale", "extractedFields"])) return false;
    const fields = value.extractedFields;
    return typeof value.summary === "string"
      && value.summary.trim().length > 0
      && typeof value.category === "string"
      && value.category.trim().length > 0
      && (value.urgency === "low" || value.urgency === "medium" || value.urgency === "high")
      && isStringArray(value.entities)
      && isStringArray(value.tags)
      && isConfidence(value.confidence)
      && typeof value.rationale === "string"
      && hasExactKeys(fields, ["senderName", "senderRole", "companyName", "deadline", "subIssues", "urgencyIndicators"])
      && isNullableString(fields.senderName)
      && isNullableString(fields.senderRole)
      && isNullableString(fields.companyName)
      && isNullableString(fields.deadline)
      && isStringArray(fields.subIssues)
      && isStringArray(fields.urgencyIndicators);
  },
  titled(value: unknown): boolean {
    return hasExactKeys(value, ["title", "confidence", "rationale"])
      && typeof value.title === "string"
      && value.title.trim().length > 0
      && isConfidence(value.confidence)
      && typeof value.rationale === "string";
  },
  enrichment(value: unknown): boolean {
    return hasExactKeys(value, ["internalGuidance", "troubleshootingChecklist", "rootCauseHypotheses", "preventiveActions", "confidence"])
      && isStringArray(value.internalGuidance)
      && isStringArray(value.troubleshootingChecklist)
      && isStringArray(value.rootCauseHypotheses)
      && isStringArray(value.preventiveActions)
      && isConfidence(value.confidence);
  },
  draft(value: unknown): boolean {
    return hasExactKeys(value, ["customerResponse", "confidence"])
      && typeof value.customerResponse === "string"
      && value.customerResponse.trim().length > 0
      && isConfidence(value.confidence);
  },
  discrimination(value: unknown): boolean {
    return hasExactKeys(value, ["isDistinctFromMatch", "confidence", "reasoning"])
      && typeof value.isDistinctFromMatch === "boolean"
      && (value.confidence === "low" || value.confidence === "medium" || value.confidence === "high")
      && typeof value.reasoning === "string"
      && value.reasoning.trim().length > 0;
  }
};

async function callChatCompletion<T>(
  config: AIConfig,
  prompt: { system: string; user: string },
  options: ChatCompletionOptions = {},
  retryAttempt = 0
): Promise<AIProviderResult<T>> {
  const startedAt = Date.now();
  const monotonicStartedAt = monotonicNow();
  const timing: AITiming = {};
  const controller = new AbortController();
  const requestedTimeout = options.timeoutMs ?? config.timeoutMs;
  const timeoutMs = Math.max(5000, Math.min(requestedTimeout, MAX_AI_TIMEOUT_MS));
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const viaProxy = typeof window !== "undefined";
  const providerLabel = options.providerLabel ?? config.providerLabel ?? (config.mode === "deepseek" ? "DeepSeek API" : config.mode === "openai-compatible" ? "OpenAI-compatible API" : "LM Studio");
  const endpoint = viaProxy
    ? config.proxyPath
    : `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  timing.promptChars = prompt.system.length + prompt.user.length;

  const resolvedMaxTokens = Math.max(options.maxTokens ?? 700, config.minMaxTokens ?? 0);
  const maxRetries = Math.max(0, Math.min(2, Math.floor(config.maxRetries ?? 0)));
  const retry = async (result: AIProviderResult<T>, retryable: boolean, nextMaxTokens?: number, requireOneRetry = false): Promise<AIProviderResult<T>> => {
    const retryLimit = requireOneRetry ? Math.max(1, maxRetries) : maxRetries;
    if (!retryable || retryAttempt >= retryLimit) return result;
    const next = await callChatCompletion<T>(
      config,
      prompt,
      { ...options, maxTokens: nextMaxTokens ?? resolvedMaxTokens },
      retryAttempt + 1
    );
    return {
      ...next,
      diagnostics: next.diagnostics
        ? { ...next.diagnostics, retries: (next.diagnostics.retries ?? 0) + 1 }
        : next.diagnostics
    };
  };
  const diagnostics = (
    proxySucceeded?: boolean,
    fallbackReason?: string,
    headers?: Headers,
    metadata: AIProviderResultMetadata = {}
  ) => readDiagnostics(config, endpoint, proxySucceeded, fallbackReason, headers, {
    ...metadata,
    timing: { ...timing, totalMs: elapsedMs(monotonicStartedAt) }
  });
  try {
    const requestStartedAt = monotonicNow();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: resolvedMaxTokens,
        // TODO-062A: in the browser this request is a double hop, and the proxy
        // used to apply its own AI_TIMEOUT_MS (30s) while ignoring what the
        // caller actually asked for. Bulk advisory calls request 90s but were
        // silently cut at 30s — right on top of the measured ~28-38s LM Studio
        // latency, so they failed by a hair. Only sent proxy-side; upstream
        // OpenAI-compatible servers never see this field.
        ...(viaProxy ? { timeout_ms: timeoutMs } : {}),
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user }
        ],
        ...config.extraBody
      }),
      signal: controller.signal
    });
    timing.requestMs = elapsedMs(requestStartedAt);
    const responseReceivedAt = Date.now();
    recordTelemetryEvent({
      name: "request_latency",
      category: "provider",
      durationMs: responseReceivedAt - startedAt,
      startedAt,
      endedAt: responseReceivedAt,
      success: response.ok,
      unit: "requests",
        tags: { provider: providerLabel, operation: "http_request", timeout: false }
    });

    if (!response.ok) {
      await response.text().catch(() => "");
      const error = `HTTP ${response.status}`;
      const proxyReason = response.headers.get("x-ai-fallback-reason") ?? "";
      const authenticationFailure = response.status === 401 || response.status === 403 || /authentication failed/i.test(proxyReason);
      return retry({
        ok: false,
        providerMode: config.mode,
        providerLabel,
        model: config.model,
        latencyMs: Date.now() - startedAt,
        error,
        diagnostics: diagnostics(false, `HTTP ${response.status}`, response.headers, {
          httpStatus: response.status,
          failureClass: authenticationFailure ? "authentication" : response.status === 429 ? "rate_limit" : response.status >= 500 ? "provider_unavailable" : "unexpected_error",
          jsonParseStatus: "not_attempted"
        })
      }, response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500);
    }

    const bodyStartedAt = monotonicNow();
    const payload = (await response.json()) as {
      choices?: Array<{
        finish_reason?: string;
        message?: { content?: string; reasoning_content?: string };
      }>;
    };
    timing.responseBodyMs = elapsedMs(bodyStartedAt);
    recordTelemetryEvent({
      name: "response_latency",
      category: "provider",
      durationMs: Date.now() - bodyStartedAt,
      startedAt: bodyStartedAt,
      endedAt: Date.now(),
      success: true,
      unit: "requests",
      tags: { provider: providerLabel, operation: "response_body" }
    });
    const firstChoice = payload.choices?.[0];
    const finishReason = firstChoice?.finish_reason;
    const content = firstChoice?.message?.content?.trim();
    const reasoningContent = firstChoice?.message?.reasoning_content?.trim();
    const tier = config.proxyPath;
    if (finishReason === "length") {
      console.warn(`[callChatCompletion] ${tier}: 200 OK but finish_reason=length — increase max_tokens or reduce reasoning (current: ${resolvedMaxTokens})`);
      return retry({
        ok: false,
        providerMode: config.mode,
        providerLabel,
        model: config.model,
        latencyMs: Date.now() - startedAt,
        error: "AI output truncated before valid JSON",
        diagnostics: diagnostics(false, "AI output truncated before valid JSON", response.headers, {
          failureClass: "truncated_response",
          completionLength: (content?.length ?? 0) + (reasoningContent?.length ?? 0),
          jsonParseStatus: "not_attempted",
          structuredOutputValid: false
        })
      }, true, resolvedMaxTokens * 2);
    }
    // Some reasoning-capable OpenAI-compatible providers return a private
    // `reasoning_content` field alongside the actual answer in `content`.
    // The reasoning channel is never parsed, persisted, or exposed; only the
    // strict JSON answer in `content` can be accepted. Rejecting the whole
    // response merely because private metadata is present makes valid
    // structured DeepSeek completions fail over unnecessarily. A response
    // with reasoning but no answer still fails through the empty-content guard.
    if (!content) {
      console.warn(
        `[callChatCompletion] ${tier}: 200 OK — content and reasoning_content both empty.`,
        `choices[0]: ${JSON.stringify(payload.choices?.[0]).slice(0, 500)}`
      );
      return retry({
        ok: false,
        providerMode: config.mode,
        providerLabel,
        model: config.model,
        latencyMs: Date.now() - startedAt,
        error: "Malformed AI response",
        diagnostics: diagnostics(false, "Malformed AI response", response.headers, { failureClass: "malformed_response", jsonParseStatus: "not_attempted", structuredOutputValid: false })
      }, true, undefined, true);
    }

    const parseStartedAt = monotonicNow();
    const parsed = parseJsonObject(content);
    timing.parseMs = elapsedMs(parseStartedAt);
    recordTelemetryEvent({
      name: "json_parsing",
      category: "provider",
      durationMs: Date.now() - parseStartedAt,
      startedAt: parseStartedAt,
      endedAt: Date.now(),
      success: !!parsed,
      unit: "requests",
      tags: { provider: providerLabel }
    });
    if (!parsed || typeof parsed !== "object") {
      console.warn(
        `[callChatCompletion] ${tier}: 200 OK — parseJsonObject failed.`,
        `content[:400]: ${content.slice(0, 400)}`
      );
      return retry({
        ok: false,
        providerMode: config.mode,
        providerLabel,
        model: config.model,
        latencyMs: Date.now() - startedAt,
        error: "AI response did not contain valid JSON",
        diagnostics: diagnostics(false, "AI response did not contain valid JSON", response.headers, { failureClass: "malformed_response", completionLength: content.length, jsonParseStatus: "invalid", structuredOutputValid: false })
      }, true, undefined, true);
    }

    if (options.validateStructuredOutput && !options.validateStructuredOutput(parsed)) {
      console.warn(`[callChatCompletion] ${tier}: rejected JSON that does not exactly match the structured-output schema.`);
      return retry({
        ok: false,
        providerMode: config.mode,
        providerLabel,
        model: config.model,
        latencyMs: Date.now() - startedAt,
        error: "AI response failed structured schema validation",
        diagnostics: diagnostics(false, "AI response failed structured schema validation", response.headers, {
          failureClass: "invalid_structured_output",
          completionLength: content.length,
          jsonParseStatus: "valid",
          structuredOutputValid: false
        })
      }, true, undefined, true);
    }

    return {
      ok: true,
      providerMode: config.mode,
      providerLabel,
      model: config.model,
      latencyMs: Date.now() - startedAt,
      data: parsed as T,
      diagnostics: diagnostics(true, undefined, response.headers, { completionLength: content.length, jsonParseStatus: "valid", structuredOutputValid: true })
    };
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? `AI request timed out after ${timeoutMs}ms`
        : error instanceof Error
        ? error.message
        : "Unknown network error";
    const failure: AIProviderResult<T> = {
      ok: false,
      providerMode: config.mode,
      providerLabel,
      model: config.model,
      latencyMs: Date.now() - startedAt,
      error: message,
        diagnostics: diagnostics(false, message, undefined, { failureClass: message.includes("timed out") ? "timeout" : /fetch|network|connect|refused|socket/i.test(message) ? "network" : "unexpected_error", timedOut: message.includes("timed out"), jsonParseStatus: "not_attempted" })
    };
    return retry(failure, /timed out|network|fetch|connect|refused|socket/i.test(message));
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeList(values: unknown): string[] {
  return Array.isArray(values)
    ? values.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean)
    : [];
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeExtractedTicketFields(value: unknown): ExtractedTicketFields {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    senderName: normalizeNullableString(record.senderName),
    senderRole: normalizeNullableString(record.senderRole),
    companyName: normalizeNullableString(record.companyName),
    deadline: normalizeNullableString(record.deadline),
    subIssues: normalizeList(record.subIssues),
    urgencyIndicators: normalizeList(record.urgencyIndicators)
  };
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function mapFailure<T>(result: AIProviderResult<Record<string, unknown>>): AIProviderResult<T> {
  return {
    ok: false,
    providerMode: result.providerMode,
    providerLabel: result.providerLabel,
    model: result.model,
    latencyMs: result.latencyMs,
    error: result.error,
    diagnostics: result.diagnostics
  };
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function mapStructuredFailure<T>(result: AIProviderResult<Record<string, unknown>>): AIProviderResult<T> {
  return {
    ...mapFailure<T>(result),
    error: "AI response failed structured schema validation",
    diagnostics: result.diagnostics
      ? { ...result.diagnostics, failureClass: "invalid_structured_output", structuredOutputValid: false }
      : undefined
  };
}

export function createLMStudioProvider(config: AIConfig, labelOverride?: string): AIProvider {
  const lbl = labelOverride ?? "LM Studio";

  // Post-processes any result to stamp the correct providerLabel, since
  // callChatCompletion always hardcodes "LM Studio". No-op when label is default.
  function relabel<T>(r: AIProviderResult<T>): AIProviderResult<T> {
    return lbl === "LM Studio" ? r : { ...r, providerLabel: lbl };
  }

  return {
    mode: config.mode,
    label: lbl,
    async analyzeTicket(input: AnalyzeTicketInput) {
      const result = await callChatCompletion<Record<string, unknown>>(config, buildAnalyzeTicketPrompt(input), { providerLabel: lbl, validateStructuredOutput: validates.analysis });
      if (!result.ok || !result.data) return relabel(mapFailure<AIAnalysisSuggestion>(result));
      if (!hasNonEmptyString(result.data.summary) || !hasNonEmptyString(result.data.category)) return relabel(mapStructuredFailure<AIAnalysisSuggestion>(result));
      return relabel({
        ...result,
        data: {
          summary: String(result.data.summary ?? input.deterministicUnderstanding.summary),
          category: String(result.data.category ?? input.deterministicUnderstanding.category),
          urgency:
            result.data.urgency === "low" || result.data.urgency === "high"
              ? result.data.urgency
              : "medium",
          entities: normalizeList(result.data.entities),
          tags: normalizeList(result.data.tags),
          confidence: clampConfidence(result.data.confidence),
          rationale: typeof result.data.rationale === "string" ? result.data.rationale : undefined,
          extractedFields: normalizeExtractedTicketFields(result.data.extractedFields)
        }
      });
    },
    async suggestCanonicalProblem(input: CanonicalProblemInput) {
      // F-3: bulk clusters rely on this call. Bumped max_tokens from the 180
      // default so gemma-style verbose JSON does not truncate before the model
      // emits the closing brace (which previously flipped the analysis mode
      // to "deterministic_fallback" even when LM Studio was reachable).
      // Also uses a longer timeout because bulk analysis happens in batched
      // context where the user has already accepted waiting for the run.
      //
      // TODO-062A: 400 was still too tight and truncated 100% of the time
      // against gemma-4-e4b — measured 397 of 400 tokens consumed by reasoning
      // alone, so finish_reason=length fired before any JSON content existed.
      // Every bulk cluster therefore burned a full ~27s round-trip and returned
      // nothing. Measured completions at 700 land at 474-597 tokens and parse.
      const result = await callChatCompletion<Record<string, unknown>>(
        config,
        buildCanonicalProblemPrompt(input),
        { maxTokens: 700, timeoutMs: 90000, providerLabel: lbl, validateStructuredOutput: validates.titled }
      );
      if (!result.ok || !result.data) return relabel(mapFailure<AICanonicalProblemSuggestion>(result));
      if (!hasNonEmptyString(result.data.title)) return relabel(mapStructuredFailure<AICanonicalProblemSuggestion>(result));
      return relabel({
        ...result,
        data: {
          title: String(result.data.title ?? input.deterministicCanonicalProblem.title),
          confidence: clampConfidence(result.data.confidence),
          rationale: typeof result.data.rationale === "string" ? result.data.rationale : undefined
        }
      });
    },
    async suggestPatternName(input: PatternNameInput) {
      const result = await callChatCompletion<Record<string, unknown>>(config, buildPatternNamePrompt(input), { providerLabel: lbl, validateStructuredOutput: validates.titled });
      if (!result.ok || !result.data) return relabel(mapFailure<AIPatternSuggestion>(result));
      if (!hasNonEmptyString(result.data.title)) return relabel(mapStructuredFailure<AIPatternSuggestion>(result));
      return relabel({
        ...result,
        data: {
          title: String(result.data.title ?? input.deterministicPatternTitle),
          confidence: clampConfidence(result.data.confidence),
          rationale: typeof result.data.rationale === "string" ? result.data.rationale : undefined
        }
      });
    },
    async enrichKnowledge(input: KnowledgeEnrichmentInput) {
      const result = await callChatCompletion<Record<string, unknown>>(config, buildKnowledgeEnrichmentPrompt(input), { providerLabel: lbl, validateStructuredOutput: validates.enrichment });
      if (!result.ok || !result.data) return relabel(mapFailure<AIKnowledgeEnrichment>(result));
      return relabel({
        ...result,
        data: {
          internalGuidance: normalizeList(result.data.internalGuidance),
          troubleshootingChecklist: normalizeList(result.data.troubleshootingChecklist),
          rootCauseHypotheses: normalizeList(result.data.rootCauseHypotheses),
          preventiveActions: normalizeList(result.data.preventiveActions),
          confidence: clampConfidence(result.data.confidence)
        }
      });
    },
    async draftCustomerResponse(input: DraftCustomerResponseInput) {
      const promptBuildStartedAt = monotonicNow();
      const prompt = buildDraftCustomerResponsePrompt(input);
      const promptBuildMs = elapsedMs(promptBuildStartedAt);
      const result = await callChatCompletion<Record<string, unknown>>(
        config,
        prompt,
        { maxTokens: 650, providerLabel: lbl, validateStructuredOutput: validates.draft }
      );
      const withPromptTiming = <T>(value: AIProviderResult<T>): AIProviderResult<T> => value.diagnostics
        ? { ...value, diagnostics: { ...value.diagnostics, timing: { ...value.diagnostics.timing, promptBuildMs } } }
        : value;
      const timedResult = withPromptTiming(result);
      if (!timedResult.ok || !timedResult.data) return relabel(mapFailure<AICustomerResponseSuggestion>(timedResult));
      if (!hasNonEmptyString(timedResult.data.customerResponse) && !hasNonEmptyString(timedResult.data.draftResponse)) return relabel(mapStructuredFailure<AICustomerResponseSuggestion>(timedResult));
      return relabel({
        ...timedResult,
        data: {
          draftResponse: String(timedResult.data.customerResponse ?? timedResult.data.draftResponse ?? input.deterministicDraft),
          confidence: clampConfidence(timedResult.data.confidence),
          rationale: typeof timedResult.data.rationale === "string" ? timedResult.data.rationale : undefined,
          groundingMode: input.groundingMode,
          groundingLabel: input.groundingLabel
        }
      });
    },
    async discriminateMatch(input: MatchDiscriminationInput) {
      // F-3: bulk path uses this per-query; the previous default of 180 tokens
      // was too tight for gemma-4-e4b's verbose JSON. Bumped to 400 and
      // accept a longer timeout so a single batched call can complete even
      // when LM Studio is responding slowly.
      //
      // TODO-062A: 400 left only ~3-70 tokens of headroom after reasoning
      // (measured 337-394 reasoning+content against the cap), so truncation was
      // a coin flip per ticket. Raised in step with suggestCanonicalProblem.
      const result = await callChatCompletion<Record<string, unknown>>(
        config,
        buildMatchDiscriminationPrompt(input),
        { maxTokens: 700, timeoutMs: 90000, providerLabel: lbl, validateStructuredOutput: validates.discrimination }
      );
      if (!result.ok || !result.data) return relabel(mapFailure<MatchDiscriminationResult>(result));
      if (typeof result.data.isDistinctFromMatch !== "boolean") return relabel(mapStructuredFailure<MatchDiscriminationResult>(result));
      const confidence = result.data.confidence === "high" || result.data.confidence === "low"
        ? result.data.confidence
        : "medium";
      return relabel({
        ...result,
        data: {
          isDistinctFromMatch: result.data.isDistinctFromMatch === true,
          confidence,
          reasoning: typeof result.data.reasoning === "string"
            ? result.data.reasoning
            : "No reasoning provided."
        } satisfies MatchDiscriminationResult
      });
    }
  };
}

/** Shared OpenAI-compatible provider port. DeepSeek is one configuration of this factory. */
export const createOpenAICompatibleProvider = createLMStudioProvider;
