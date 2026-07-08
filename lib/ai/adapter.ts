import { createClaudeAPIProvider } from "@/lib/ai/claudeApi";
import { createLMStudioProvider } from "@/lib/ai/lmStudio";
import type { AIAdapter, AIConfig, AIProvider, AIProviderResult } from "@/lib/ai/types";

const DEFAULT_AI_BASE_URL = "http://127.0.0.1:1234/v1";
const DEFAULT_AI_MODEL = "google/gemma-4-e4b";
const DEFAULT_AI_TIMEOUT_MS = 30000;
const AI_PROXY_PATH = "/api/ai/chat";

function createDisabledProvider(mode: "disabled" | "amd"): AIProvider {
  const message =
    mode === "amd"
      ? "AMD Cloud placeholder is not implemented yet. Using deterministic Organizational Intelligence."
      : "AI advisory is disabled. Using deterministic Organizational Intelligence.";

  async function unavailable<T>() {
    return {
      ok: false,
      providerMode: mode,
      providerLabel: mode === "amd" ? "AMD Cloud" : "Disabled",
      latencyMs: 0,
      error: message
    };
  }

  return {
    mode,
    label: mode === "amd" ? "AMD Cloud" : "Disabled",
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

  async function withFallback<T>(
    methodName: string,
    lmStudioCall: () => Promise<AIProviderResult<T>>,
    claudeCall: () => Promise<AIProviderResult<T>>
  ): Promise<AIProviderResult<T>> {
    const tier1 = await lmStudioCall();
    if (tier1.ok) return tier1;

    console.warn(`[ai-chain] Tier 1 (LM Studio) failed for ${methodName}: ${tier1.error ?? "unknown"}. Trying Tier 2 (Claude API).`);

    const tier2 = await claudeCall();
    if (tier2.ok) return tier2;

    console.warn(`[ai-chain] Tier 2 (Claude API) failed for ${methodName}: ${tier2.error ?? "unknown"}. Falling through to deterministic.`);
    return tier2;
  }

  return {
    mode: "lmstudio",
    label: "AI Chain (LM Studio → Claude API)",
    analyzeTicket: (input) => withFallback(
      "analyzeTicket",
      () => lmStudio.analyzeTicket(input),
      () => claude.analyzeTicket(input)
    ),
    suggestCanonicalProblem: (input) => withFallback(
      "suggestCanonicalProblem",
      () => lmStudio.suggestCanonicalProblem(input),
      () => claude.suggestCanonicalProblem(input)
    ),
    suggestPatternName: (input) => withFallback(
      "suggestPatternName",
      () => lmStudio.suggestPatternName(input),
      () => claude.suggestPatternName(input)
    ),
    enrichKnowledge: (input) => withFallback(
      "enrichKnowledge",
      () => lmStudio.enrichKnowledge(input),
      () => claude.enrichKnowledge(input)
    ),
    draftCustomerResponse: (input) => withFallback(
      "draftCustomerResponse",
      () => lmStudio.draftCustomerResponse(input),
      () => claude.draftCustomerResponse(input)
    ),
    discriminateMatch: (input) => withFallback(
      "discriminateMatch",
      () => lmStudio.discriminateMatch(input),
      () => claude.discriminateMatch(input)
    )
  };
}

export function readAIConfig(): AIConfig {
  const isBrowser = typeof window !== "undefined";
  const modeValue = (process.env.NEXT_PUBLIC_AI_MODE ?? process.env.AI_MODE ?? "disabled").toLowerCase();
  const mode = modeValue === "lmstudio" || modeValue === "amd" ? modeValue : "disabled";
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
      : createDisabledProvider(config.mode as "disabled" | "amd");

  return { config, provider };
}
