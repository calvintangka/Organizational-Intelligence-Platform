import { createClaudeAPIProvider } from "@/lib/ai/claudeApi";
import { createLMStudioProvider } from "@/lib/ai/lmStudio";
import type { AIAdapter, AIConfig, AIProvider, AIProviderResult } from "@/lib/ai/types";
import type { AIDiagnostics } from "@/types";
import type { AIChainAttempt } from "@/types";

const DEFAULT_AI_BASE_URL = "http://127.0.0.1:1234/v1";
const DEFAULT_AI_MODEL = "google/gemma-4-e4b";
const DEFAULT_AI_TIMEOUT_MS = 30000;
const AI_PROXY_PATH = "/api/ai/chat";

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
  const lmStudio = createLMStudioProvider(config);
  const claude = createClaudeAPIProvider();

  type Tier<T> = { label: string; call: () => Promise<AIProviderResult<T>> };

  function readableProviderLabel(label: string): string {
    return label.replace(/^Tier \d+\s*\((.+)\)$/, "$1");
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
      attempts
    });
    for (let i = 0; i < tiers.length; i++) {
      const tier = tiers[i];
      last = await tier.call();
      attempts.push({
        label: tier.label,
        provider: last.providerLabel,
        status: last.ok ? "succeeded" : "failed",
        reason: last.ok ? undefined : summarizeProviderFailure(tier.label, last.error ?? last.diagnostics?.fallbackReason)
      });
      if (last.ok) {
        for (const skippedTier of tiers.slice(i + 1)) {
          attempts.push({
            label: skippedTier.label,
            provider: skippedTier.label,
            status: "skipped",
            reason: `Not attempted because ${tier.label} succeeded.`
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
    return {
      ...last,
      diagnostics: mergeDiagnostics(last)
    };
  }

  return {
    mode: "lmstudio",
    label: "AI Chain (LM Studio → Claude API)",
    analyzeTicket: (input) => withFallback("analyzeTicket", [
      { label: "Tier 1 (LM Studio)",  call: () => lmStudio.analyzeTicket(input) },
      { label: "Tier 2 (Claude API)", call: () => claude.analyzeTicket(input) }
    ]),
    suggestCanonicalProblem: (input) => withFallback("suggestCanonicalProblem", [
      { label: "Tier 1 (LM Studio)",  call: () => lmStudio.suggestCanonicalProblem(input) },
      { label: "Tier 2 (Claude API)", call: () => claude.suggestCanonicalProblem(input) }
    ]),
    suggestPatternName: (input) => withFallback("suggestPatternName", [
      { label: "Tier 1 (LM Studio)",  call: () => lmStudio.suggestPatternName(input) },
      { label: "Tier 2 (Claude API)", call: () => claude.suggestPatternName(input) }
    ]),
    enrichKnowledge: (input) => withFallback("enrichKnowledge", [
      { label: "Tier 1 (LM Studio)",  call: () => lmStudio.enrichKnowledge(input) },
      { label: "Tier 2 (Claude API)", call: () => claude.enrichKnowledge(input) }
    ]),
    draftCustomerResponse: (input) => withFallback("draftCustomerResponse", [
      { label: "Tier 1 (LM Studio)",  call: () => lmStudio.draftCustomerResponse(input) },
      { label: "Tier 2 (Claude API)", call: () => claude.draftCustomerResponse(input) }
    ]),
    discriminateMatch: (input) => withFallback("discriminateMatch", [
      { label: "Tier 1 (LM Studio)",  call: () => lmStudio.discriminateMatch(input) },
      { label: "Tier 2 (Claude API)", call: () => claude.discriminateMatch(input) }
    ])
  };
}

export function readAIConfig(): AIConfig {
  const isBrowser = typeof window !== "undefined";
  const modeValue = (process.env.NEXT_PUBLIC_AI_MODE ?? process.env.AI_MODE ?? "disabled").toLowerCase();
  const mode = modeValue === "lmstudio" ? "lmstudio" : "disabled";
  return {
    mode,
    baseUrl: isBrowser ? DEFAULT_AI_BASE_URL : process.env.AI_BASE_URL ?? process.env.NEXT_PUBLIC_AI_BASE_URL ?? DEFAULT_AI_BASE_URL,
    model: process.env.NEXT_PUBLIC_AI_MODEL ?? process.env.AI_MODEL ?? DEFAULT_AI_MODEL,
    timeoutMs: Number(process.env.NEXT_PUBLIC_AI_TIMEOUT_MS ?? process.env.AI_TIMEOUT_MS ?? `${DEFAULT_AI_TIMEOUT_MS}`),
    proxyPath: AI_PROXY_PATH
  };
}

export function createAIAdapter(config: AIConfig = readAIConfig()): AIAdapter {
  const provider =
    config.mode === "lmstudio"
      ? createChainProvider(config)
      : createDisabledProvider();

  return { config, provider };
}
