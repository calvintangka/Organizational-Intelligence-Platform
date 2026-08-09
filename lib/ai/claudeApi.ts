import { createLMStudioProvider } from "@/lib/ai/lmStudio";
import type { AIProvider, AIProviderResult } from "@/lib/ai/types";

const CLAUDE_PROXY_PATH = "/api/ai/claude";
const DEFAULT_CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_CLAUDE_CLIENT_TIMEOUT_MS = 35000;
const SESSION_CALL_CAP = 200;

let sessionCallCount = 0;

export function getClaudeSessionCallCount(): number {
  return sessionCallCount;
}

export function resetClaudeSessionCallCount(): void {
  sessionCallCount = 0;
}

function identifyClaude<T>(result: AIProviderResult<T>): AIProviderResult<T> {
  return {
    ...result,
    providerMode: "claude",
    providerLabel: "Claude API",
    model: result.diagnostics?.model ?? result.model ?? DEFAULT_CLAUDE_MODEL,
    diagnostics: result.diagnostics
      ? {
          ...result.diagnostics,
          mode: "claude",
          provider: "Claude API"
        }
      : undefined
  };
}

async function callClaude<T>(call: () => Promise<AIProviderResult<T>>): Promise<AIProviderResult<T>> {
  if (sessionCallCount >= SESSION_CALL_CAP) {
    console.warn(`[claude-api] Session call cap reached (${SESSION_CALL_CAP}). Skipping Claude API call.`);
    return {
      ok: false,
      providerMode: "claude",
      providerLabel: "Claude API",
      model: DEFAULT_CLAUDE_MODEL,
      latencyMs: 0,
      error: `Claude API session cap reached (${SESSION_CALL_CAP} calls)`,
      diagnostics: {
        mode: "claude",
        provider: "Claude API",
        model: DEFAULT_CLAUDE_MODEL,
        proxyPath: CLAUDE_PROXY_PATH,
        serverBaseUrl: "https://api.anthropic.com",
        endpointUsed: "https://api.anthropic.com/v1/messages",
        proxySucceeded: false,
        fallbackReason: "Session call cap reached"
      }
    };
  }
  sessionCallCount += 1;
  return identifyClaude(await call());
}

/**
 * Claude reuses the established prompt, JSON validation, and typed-result
 * mapping from the OpenAI-compatible provider. The same-origin proxy translates
 * that request to Anthropic's Messages API and keeps all credentials server-side.
 */
export function createClaudeAPIProvider(): AIProvider {
  const provider = createLMStudioProvider(
    {
      mode: "claude",
      baseUrl: "https://api.anthropic.com",
      model: DEFAULT_CLAUDE_MODEL,
      timeoutMs: DEFAULT_CLAUDE_CLIENT_TIMEOUT_MS,
      proxyPath: CLAUDE_PROXY_PATH,
      // Claude remains an isolated provider contract. It is not part of the
      // current release adapter chain.
      maxRetries: 1
    },
    "Claude API"
  );

  return {
    mode: "claude",
    label: "Claude API",
    analyzeTicket: (input) => callClaude(() => provider.analyzeTicket(input)),
    suggestCanonicalProblem: (input) => callClaude(() => provider.suggestCanonicalProblem(input)),
    suggestPatternName: (input) => callClaude(() => provider.suggestPatternName(input)),
    enrichKnowledge: (input) => callClaude(() => provider.enrichKnowledge(input)),
    draftCustomerResponse: (input) => callClaude(() => provider.draftCustomerResponse(input)),
    discriminateMatch: (input) => callClaude(() => provider.discriminateMatch(input))
  };
}
