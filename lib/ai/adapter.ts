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
  // Remote Gemma 31B via ngrok. The proxy route reads REMOTE_GEMMA_BASE_URL
  // server-side; if unset it returns 503 and the chain falls through to Claude.
  const remoteGemma = createLMStudioProvider(
    {
      ...config,
      proxyPath: "/api/ai/remote-gemma",
      // Remote Gemma 31B (thinking model) can take 15–27s+ under concurrent load and
      // emits reasoning tokens before the JSON answer, so we need a larger timeout and
      // token budget. The client timeout must exceed the proxy->ngrok timeout (90s in
      // app/api/ai/remote-gemma/route.ts) so the client receives the proxy's structured
      // error instead of aborting the request itself first.
      timeoutMs: Math.max(config.timeoutMs, 95000),
      // Floor applied to every Remote Gemma call. draftCustomerResponse (~650-token
      // answer) hit finish_reason=length even at 2048 because Gemma 4's thinking phase
      // consumed the whole budget in ~78s — and raising the cap further would cross the
      // 90s timeout wall instead of helping. So we disable reasoning below and keep 2048
      // as generous headroom for the answer alone.
      minMaxTokens: 2048,
      // Disable llama-server's chain-of-thought for this tier. reasoning_budget: 0 is the
      // llama.cpp control; enable_thinking:false covers chat templates that read that kwarg.
      // Both are ignored by builds that don't support them, so this is safe to always send.
      extraBody: {
        reasoning_budget: 0,
        chat_template_kwargs: { enable_thinking: false }
      }
    },
    "Remote Gemma"
  );
  const claude = createClaudeAPIProvider();

  type Tier<T> = { label: string; call: () => Promise<AIProviderResult<T>> };

  async function withFallback<T>(
    methodName: string,
    tiers: Tier<T>[]
  ): Promise<AIProviderResult<T>> {
    let last = {} as AIProviderResult<T>;
    for (let i = 0; i < tiers.length; i++) {
      last = await tiers[i].call();
      if (last.ok) return last;
      const next = i < tiers.length - 1
        ? `Trying ${tiers[i + 1].label}.`
        : "Falling through to deterministic.";
      console.warn(`[ai-chain] ${tiers[i].label} failed for ${methodName}: ${last.error ?? "unknown"}. ${next}`);
    }
    return last;
  }

  return {
    mode: "lmstudio",
    label: "AI Chain (LM Studio → Remote Gemma → Claude API)",
    analyzeTicket: (input) => withFallback("analyzeTicket", [
      { label: "Tier 1 (LM Studio)",    call: () => lmStudio.analyzeTicket(input) },
      { label: "Tier 2 (Remote Gemma)", call: () => remoteGemma.analyzeTicket(input) },
      { label: "Tier 3 (Claude API)",   call: () => claude.analyzeTicket(input) }
    ]),
    suggestCanonicalProblem: (input) => withFallback("suggestCanonicalProblem", [
      { label: "Tier 1 (LM Studio)",    call: () => lmStudio.suggestCanonicalProblem(input) },
      { label: "Tier 2 (Remote Gemma)", call: () => remoteGemma.suggestCanonicalProblem(input) },
      { label: "Tier 3 (Claude API)",   call: () => claude.suggestCanonicalProblem(input) }
    ]),
    suggestPatternName: (input) => withFallback("suggestPatternName", [
      { label: "Tier 1 (LM Studio)",    call: () => lmStudio.suggestPatternName(input) },
      { label: "Tier 2 (Remote Gemma)", call: () => remoteGemma.suggestPatternName(input) },
      { label: "Tier 3 (Claude API)",   call: () => claude.suggestPatternName(input) }
    ]),
    enrichKnowledge: (input) => withFallback("enrichKnowledge", [
      { label: "Tier 1 (LM Studio)",    call: () => lmStudio.enrichKnowledge(input) },
      { label: "Tier 2 (Remote Gemma)", call: () => remoteGemma.enrichKnowledge(input) },
      { label: "Tier 3 (Claude API)",   call: () => claude.enrichKnowledge(input) }
    ]),
    draftCustomerResponse: (input) => withFallback("draftCustomerResponse", [
      { label: "Tier 1 (LM Studio)",    call: () => lmStudio.draftCustomerResponse(input) },
      { label: "Tier 2 (Remote Gemma)", call: () => remoteGemma.draftCustomerResponse(input) },
      { label: "Tier 3 (Claude API)",   call: () => claude.draftCustomerResponse(input) }
    ]),
    discriminateMatch: (input) => withFallback("discriminateMatch", [
      { label: "Tier 1 (LM Studio)",    call: () => lmStudio.discriminateMatch(input) },
      { label: "Tier 2 (Remote Gemma)", call: () => remoteGemma.discriminateMatch(input) },
      { label: "Tier 3 (Claude API)",   call: () => claude.discriminateMatch(input) }
    ])
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
