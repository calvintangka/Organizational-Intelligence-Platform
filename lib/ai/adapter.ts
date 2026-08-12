import { createLMStudioProvider, createOpenAICompatibleProvider } from "@/lib/ai/lmStudio";
import type { AIAdapter, AIConfig, AIProvider, AIProviderResult } from "@/lib/ai/types";
import type { AIDiagnostics } from "@/types";
import type { AIChainAttempt } from "@/types";
import { recordTelemetryEvent } from "@/lib/telemetry";

const DEFAULT_AI_BASE_URL = "http://127.0.0.1:1234/v1";
const DEFAULT_AI_MODEL = "google/gemma-4-e4b";
const DEFAULT_AI_TIMEOUT_MS = 30000;
const AI_PROXY_PATH = "/api/ai/chat";
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
const DEFAULT_DEEPSEEK_TIMEOUT_MS = 30000;
const DEEPSEEK_PROXY_PATH = "/api/ai/deepseek";
const DEFAULT_OPENAI_COMPATIBLE_PROXY_PATH = "/api/ai/openai-compatible";

function createDisabledProvider(): AIProvider {
  const message = "AI advisory is disabled. Using deterministic Organizational Intelligence.";

  async function unavailable<T>(): Promise<AIProviderResult<T>> {
    return {
      ok: false,
      providerMode: "disabled" as const,
      providerLabel: "Disabled",
      latencyMs: 0,
      error: message
    };
  }

  return {
    mode: "disabled",
    label: "Disabled",
    analyzeTicket: unavailable,
    suggestCanonicalProblem: unavailable,
    suggestPatternName: unavailable,
    enrichKnowledge: unavailable,
    draftCustomerResponse: unavailable,
    discriminateMatch: unavailable
  };
}

function createChainProvider(config: AIConfig): AIProvider {
  const lmStudio = createLMStudioProvider(
    config.mode === "deepseek" || config.mode === "openai-compatible"
      ? {
          ...config,
          mode: "lmstudio",
          baseUrl: config.lmStudioBaseUrl ?? DEFAULT_AI_BASE_URL,
          model: config.lmStudioModel ?? DEFAULT_AI_MODEL,
          timeoutMs: config.lmStudioTimeoutMs ?? DEFAULT_AI_TIMEOUT_MS,
          proxyPath: AI_PROXY_PATH,
          extraBody: undefined,
          providerLabel: undefined,
          apiKey: undefined
        }
      : config
  );
  const tier1 = config.mode === "deepseek" || config.mode === "openai-compatible"
    ? createOpenAICompatibleProvider(
        config,
        config.providerLabel ?? (config.mode === "deepseek" ? "DeepSeek API" : "OpenAI-compatible API")
      )
    : null;
  type Tier<T> = { label: string; call: () => Promise<AIProviderResult<T>> };

  function readableProviderLabel(label: string): string {
    return label.replace(/^Tier \d+\s*\((.+)\)$/, "$1");
  }

  function orderedTiers<T>(input: {
    tier1: () => Promise<AIProviderResult<T>>;
    lmStudio?: () => Promise<AIProviderResult<T>>;
  }): Tier<T>[] {
    const fallbackTiers: Tier<T>[] = input.lmStudio && config.lmStudioEnabled !== false
      ? [{ label: "Tier 2 (LM Studio)", call: input.lmStudio }]
      : [];
    return tier1
      ? [{ label: `Tier 1 (${tier1.label})`, call: input.tier1 }, ...fallbackTiers]
      : fallbackTiers.map((tier) => ({ ...tier, label: "Tier 1 (LM Studio)" }));
  }

  function stripHtml(value: string): string {
    return value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  function summarizeProviderFailure(label: string, error?: string): string {
    const provider = readableProviderLabel(label);
    const raw = error?.trim() || "Unknown AI failure";
    const lower = raw.toLowerCase();
    const status = raw.match(/\bHTTP\s+(\d{3})\b/i)?.[1];

    if (lower.includes("<html") || lower.includes("<!doctype")) {
      return `${provider} failed: ${status ? `HTTP ${status} returned` : "received"} an HTML error page.`;
    }

    const jsonError = raw.match(/"error"\s*:\s*"([^"]+)"/i)?.[1];
    const plain = stripHtml(jsonError ?? raw);
    const withoutHttpBody = status && plain.length > 180 ? `HTTP ${status}` : plain;
    const truncated = withoutHttpBody.length > 180 ? `${withoutHttpBody.slice(0, 177)}...` : withoutHttpBody;
    return `${provider} failed: ${truncated}`;
  }

  async function withFallback<T>(
    methodName: string,
    tiers: Tier<T>[]
  ): Promise<AIProviderResult<T>> {
    if (tiers.length === 0) {
      const message = "No remote AI provider is enabled; using deterministic fallback.";
      return {
        ok: false,
        providerMode: config.mode,
        providerLabel: "Deterministic fallback",
        model: config.model,
        latencyMs: 0,
        error: message,
        diagnostics: {
          mode: config.mode,
          provider: "Deterministic fallback",
          model: config.model,
          proxyPath: config.proxyPath,
          serverBaseUrl: config.baseUrl,
          fallbackReason: message,
          completionStatus: "failed",
          fallbackPath: ["Deterministic fallback"],
          attempts: []
        }
      };
    }
    let last = {} as AIProviderResult<T>;
    const attempts: AIChainAttempt[] = [];
    const mergeDiagnostics = (result: AIProviderResult<T>): AIDiagnostics => ({
      mode: result.diagnostics?.mode ?? result.providerMode,
      provider: result.diagnostics?.provider ?? result.providerLabel,
      model: result.diagnostics?.model ?? result.model,
      proxyPath: result.diagnostics?.proxyPath ?? config.proxyPath,
      serverBaseUrl: result.diagnostics?.serverBaseUrl ?? config.baseUrl,
      endpointUsed: result.diagnostics?.endpointUsed,
      proxySucceeded: result.diagnostics?.proxySucceeded,
      fallbackReason: result.diagnostics?.fallbackReason || result.error
        ? summarizeProviderFailure(result.providerLabel, result.diagnostics?.fallbackReason ?? result.error)
        : undefined,
      latencyMs: result.latencyMs,
      retries: Math.max(0, attempts.filter((attempt) => attempt.status !== "skipped").length - 1) + (result.diagnostics?.retries ?? 0),
      fallbackPath: attempts.map((attempt) => attempt.provider),
      completionStatus: result.ok ? "succeeded" : "failed",
      attempts,
      failureClass: result.diagnostics?.failureClass,
      timedOut: result.diagnostics?.timedOut,
      httpStatus: result.diagnostics?.httpStatus,
      completionLength: result.diagnostics?.completionLength,
      jsonParseStatus: result.diagnostics?.jsonParseStatus,
      structuredOutputValid: result.diagnostics?.structuredOutputValid,
      timing: result.diagnostics?.timing
    });
    const chainStartedAt = Date.now();
    for (let i = 0; i < tiers.length; i++) {
      const tier = tiers[i];
      const provider = readableProviderLabel(tier.label);
      const startedAt = Date.now();
      let thrown: unknown = null;
      try {
        last = await tier.call();
      } catch (error) {
        thrown = error;
        const message = error instanceof Error ? error.message : "Provider call failed unexpectedly";
        last = {
          ok: false,
          providerMode: config.mode,
          providerLabel: provider,
          model: config.model,
          latencyMs: Date.now() - startedAt,
          error: message,
          diagnostics: {
            mode: config.mode,
            provider,
            model: config.model,
            proxyPath: config.proxyPath,
            serverBaseUrl: config.baseUrl,
            fallbackReason: message,
            failureClass: /timeout|abort|timed out/i.test(message) ? "timeout" : "unexpected_error",
            timedOut: /timeout|abort|timed out/i.test(message),
            jsonParseStatus: "not_attempted"
          }
        };
      } finally {
        const succeeded = thrown === null && last.ok;
        recordTelemetryEvent({
          name: "request_latency",
          category: "provider",
          durationMs: Date.now() - startedAt,
          startedAt,
          endedAt: Date.now(),
          success: succeeded,
          unit: "requests",
          tags: {
            provider,
            operation: methodName,
            attempt: i + 1,
            fallback: i > 0,
            timeout: (thrown instanceof Error && /timeout|timed out|watchdog/i.test(thrown.message))
              || /timeout|timed out|watchdog/i.test(last.error ?? "")
          }
        });
      }
      attempts.push({
        label: tier.label,
        provider: last.providerLabel,
        status: last.ok ? "succeeded" : "failed",
        reason: last.ok ? undefined : summarizeProviderFailure(tier.label, last.error ?? last.diagnostics?.fallbackReason),
        failureClass: last.diagnostics?.failureClass,
        httpStatus: last.diagnostics?.httpStatus,
        timedOut: last.diagnostics?.timedOut,
        retries: last.diagnostics?.retries ?? 0,
        completionLength: last.diagnostics?.completionLength,
        jsonParseStatus: last.diagnostics?.jsonParseStatus,
        structuredOutputValid: last.diagnostics?.structuredOutputValid,
        latencyMs: Math.max(0, Date.now() - startedAt)
      });
      if (last.ok) {
        for (const skippedTier of tiers.slice(i + 1)) {
          attempts.push({
            label: skippedTier.label,
            provider: readableProviderLabel(skippedTier.label),
            status: "skipped",
            reason: `Not attempted because ${tier.label} succeeded.`,
            retries: 0
          });
        }
        return {
          ...last,
          diagnostics: mergeDiagnostics(last)
        };
      }
      const next = i < tiers.length - 1
        ? `Trying ${tiers[i + 1].label}.`
        : "Falling through to deterministic.";
      console.warn(`[ai-chain] ${tiers[i].label} failed for ${methodName}: ${last.error ?? "unknown"}. ${next}`);
    }
    recordTelemetryEvent({
      name: "fallback_duration",
      category: "provider",
      durationMs: Date.now() - chainStartedAt,
      startedAt: chainStartedAt,
      endedAt: Date.now(),
      success: true,
      unit: "requests",
      tags: { operation: methodName, provider: "deterministic fallback", fallback: true }
    });
    return {
      ...last,
      diagnostics: mergeDiagnostics(last)
    };
  }

  return {
    mode: config.mode,
    label: tier1
      ? config.lmStudioEnabled === false ? `AI Chain (${tier1.label})` : `AI Chain (${tier1.label} -> LM Studio)`
      : config.lmStudioEnabled === false ? "AI Chain (Deterministic fallback)" : "AI Chain (LM Studio)",
    analyzeTicket: (input) => withFallback("analyzeTicket", orderedTiers({
    tier1: () => tier1!.analyzeTicket(input),
      lmStudio: () => lmStudio.analyzeTicket(input)
    })),
    suggestCanonicalProblem: (input) => withFallback("suggestCanonicalProblem", orderedTiers({
    tier1: () => tier1!.suggestCanonicalProblem(input),
      lmStudio: () => lmStudio.suggestCanonicalProblem(input)
    })),
    suggestPatternName: (input) => withFallback("suggestPatternName", orderedTiers({
    tier1: () => tier1!.suggestPatternName(input),
      lmStudio: () => lmStudio.suggestPatternName(input)
    })),
    enrichKnowledge: (input) => withFallback("enrichKnowledge", orderedTiers({
    tier1: () => tier1!.enrichKnowledge(input),
      lmStudio: () => lmStudio.enrichKnowledge(input)
    })),
    draftCustomerResponse: (input) => withFallback("draftCustomerResponse", orderedTiers({
    tier1: () => tier1!.draftCustomerResponse(input),
      lmStudio: () => lmStudio.draftCustomerResponse(input)
    })),
    discriminateMatch: (input) => withFallback("discriminateMatch", orderedTiers({
    tier1: () => tier1!.discriminateMatch(input),
      lmStudio: () => lmStudio.discriminateMatch(input)
    }))
  };
}

export function readAIConfig(): AIConfig {
  const isBrowser = typeof window !== "undefined";
  const modeValue = (process.env.NEXT_PUBLIC_AI_MODE ?? process.env.AI_MODE ?? "disabled").toLowerCase();
  const mode = modeValue === "deepseek"
    ? "deepseek"
    : modeValue === "openai-compatible" || modeValue === "openai"
      ? "openai-compatible"
      : modeValue === "lmstudio" ? "lmstudio" : "disabled";
  const lmStudioBaseUrl = isBrowser
    ? DEFAULT_AI_BASE_URL
    : process.env.AI_BASE_URL ?? process.env.NEXT_PUBLIC_AI_BASE_URL ?? DEFAULT_AI_BASE_URL;
  const lmStudioModel = process.env.NEXT_PUBLIC_AI_MODEL ?? process.env.AI_MODEL ?? DEFAULT_AI_MODEL;
  const lmStudioTimeoutMs = Number(process.env.NEXT_PUBLIC_AI_TIMEOUT_MS ?? process.env.AI_TIMEOUT_MS ?? `${DEFAULT_AI_TIMEOUT_MS}`);
  const deepseekBaseUrl = isBrowser
    ? DEFAULT_DEEPSEEK_BASE_URL
    : process.env.DEEPSEEK_BASE_URL ?? DEFAULT_DEEPSEEK_BASE_URL;
  const deepseekModel = process.env.NEXT_PUBLIC_DEEPSEEK_MODEL ?? DEFAULT_DEEPSEEK_MODEL;
  const deepseekTimeoutMs = Number(process.env.NEXT_PUBLIC_DEEPSEEK_TIMEOUT_MS ?? process.env.DEEPSEEK_TIMEOUT_MS ?? `${DEFAULT_DEEPSEEK_TIMEOUT_MS}`);
  const deepseekApiKey = isBrowser ? undefined : process.env.DEEPSEEK_API_KEY;
  const genericBaseUrl = isBrowser
    ? process.env.NEXT_PUBLIC_AI_TIER1_BASE_URL ?? ""
    : process.env.AI_TIER1_BASE_URL ?? process.env.NEXT_PUBLIC_AI_TIER1_BASE_URL ?? "";
  const genericModel = process.env.NEXT_PUBLIC_AI_TIER1_MODEL ?? process.env.AI_TIER1_MODEL ?? "reasoning-model";
  const genericTimeoutMs = Number(process.env.NEXT_PUBLIC_AI_TIER1_TIMEOUT_MS ?? process.env.AI_TIER1_TIMEOUT_MS ?? `${DEFAULT_DEEPSEEK_TIMEOUT_MS}`);
  const genericApiKey = isBrowser ? undefined : process.env.AI_TIER1_API_KEY;
  const genericLabel = process.env.NEXT_PUBLIC_AI_TIER1_LABEL ?? process.env.AI_TIER1_LABEL ?? "OpenAI-compatible API";
  const genericProxyPath = process.env.NEXT_PUBLIC_AI_TIER1_PROXY_PATH ?? DEFAULT_OPENAI_COMPATIBLE_PROXY_PATH;
  const isGeneric = mode === "openai-compatible";
  const lmStudioEnabledValue = process.env.NEXT_PUBLIC_AI_LMSTUDIO_ENABLED ?? process.env.AI_LMSTUDIO_ENABLED ?? "true";
  const lmStudioEnabled = !["0", "false", "off", "disabled", "no"].includes(lmStudioEnabledValue.trim().toLowerCase());
  return {
    mode,
    baseUrl: mode === "deepseek" ? deepseekBaseUrl : isGeneric ? genericBaseUrl : lmStudioBaseUrl,
    model: mode === "deepseek" ? deepseekModel : isGeneric ? genericModel : lmStudioModel,
    timeoutMs: mode === "deepseek" ? deepseekTimeoutMs : isGeneric ? genericTimeoutMs : lmStudioTimeoutMs,
    proxyPath: mode === "deepseek" ? DEEPSEEK_PROXY_PATH : isGeneric ? genericProxyPath : AI_PROXY_PATH,
    apiKey: mode === "deepseek" ? deepseekApiKey : isGeneric ? genericApiKey : undefined,
    providerLabel: mode === "deepseek" ? "DeepSeek API" : isGeneric ? genericLabel : undefined,
    // DeepSeek reasoning-capable models can spend the entire bounded
    // completion budget in `reasoning_content`, leaving no structured answer
    // for OIP to validate. Disable that private channel for advisory calls;
    // the adapter still accepts only strict JSON from `message.content`.
    extraBody: mode === "deepseek"
      ? { thinking: { type: "disabled" }, response_format: { type: "json_object" } }
      : undefined,
    maxRetries: Number(process.env.AI_PROVIDER_MAX_RETRIES ?? "1"),
    lmStudioBaseUrl,
    lmStudioModel,
    lmStudioTimeoutMs,
    lmStudioEnabled
  };
}

export function createAIAdapter(config: AIConfig = readAIConfig()): AIAdapter {
  const provider =
    config.mode === "deepseek" || config.mode === "openai-compatible" || config.mode === "lmstudio"
      ? createChainProvider(config)
      : createDisabledProvider();

  return { config, provider };
}
