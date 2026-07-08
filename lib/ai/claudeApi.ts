import {
  buildAnalyzeTicketPrompt,
  buildCanonicalProblemPrompt,
  buildDraftCustomerResponsePrompt,
  buildKnowledgeEnrichmentPrompt,
  buildMatchDiscriminationPrompt,
  buildPatternNamePrompt
} from "@/lib/ai/prompts";
import type {
  AIProvider,
  AIProviderResult,
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
  MatchDiscriminationResult
} from "@/types";

const CLAUDE_PROXY_PATH = "/api/ai/claude";
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_TIMEOUT_MS = 120000;
const SESSION_CALL_CAP = 200;

interface ClaudeCallOptions {
  maxTokens?: number;
  timeoutMs?: number;
}

let sessionCallCount = 0;

export function getClaudeSessionCallCount(): number {
  return sessionCallCount;
}

export function resetClaudeSessionCallCount(): void {
  sessionCallCount = 0;
}

function readDiagnostics(
  endpoint: string,
  proxySucceeded?: boolean,
  fallbackReason?: string,
  headers?: Headers
): AIDiagnostics {
  return {
    mode: (headers?.get("x-ai-mode") as AIDiagnostics["mode"] | null) ?? "claude",
    provider: headers?.get("x-ai-provider") ?? "Claude API",
    model: headers?.get("x-ai-model") ?? "claude-haiku-4-5-20251001",
    proxyPath: headers?.get("x-ai-proxy-path") ?? CLAUDE_PROXY_PATH,
    serverBaseUrl: headers?.get("x-ai-server-base-url") ?? "https://api.anthropic.com",
    endpointUsed: headers?.get("x-ai-endpoint-used") ?? endpoint,
    proxySucceeded:
      headers?.get("x-ai-proxy-succeeded") != null
        ? headers.get("x-ai-proxy-succeeded") === "true"
        : proxySucceeded,
    fallbackReason: headers?.get("x-ai-fallback-reason") ?? fallbackReason
  };
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function parseJsonObject(text: string): unknown | null {
  const broad = extractJsonObject(text);
  if (broad) {
    try {
      return JSON.parse(broad);
    } catch {
      // Fall through
    }
  }

  const starts = [...text.matchAll(/\{/g)].map((match) => match.index ?? -1).filter((index) => index >= 0);
  const ends = [...text.matchAll(/\}/g)].map((match) => match.index ?? -1).filter((index) => index >= 0);
  for (const start of starts) {
    for (const end of ends.filter((candidate) => candidate > start).reverse()) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        // Try next
      }
    }
  }
  return null;
}

async function callClaudeCompletion<T>(
  prompt: { system: string; user: string },
  options: ClaudeCallOptions = {}
): Promise<AIProviderResult<T>> {
  const startedAt = Date.now();

  if (sessionCallCount >= SESSION_CALL_CAP) {
    console.warn(`[claude-api] Session call cap reached (${SESSION_CALL_CAP}). Skipping Claude API call.`);
    return {
      ok: false,
      providerMode: "claude",
      providerLabel: "Claude API",
      latencyMs: 0,
      error: `Claude API session cap reached (${SESSION_CALL_CAP} calls)`,
      diagnostics: readDiagnostics(CLAUDE_PROXY_PATH, false, "Session call cap reached")
    };
  }

  const controller = new AbortController();
  const requestedTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutMs = Math.max(5000, Math.min(requestedTimeout, MAX_TIMEOUT_MS));
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    sessionCallCount += 1;
    console.info(`[claude-api] Call #${sessionCallCount} — sending request`);

    const response = await fetch(CLAUDE_PROXY_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        temperature: 0.2,
        max_tokens: options.maxTokens ?? 180,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const error = errorText ? `HTTP ${response.status}: ${errorText}` : `HTTP ${response.status}`;
      return {
        ok: false,
        providerMode: "claude",
        providerLabel: "Claude API",
        latencyMs: Date.now() - startedAt,
        error,
        diagnostics: readDiagnostics(CLAUDE_PROXY_PATH, false, error, response.headers)
      };
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        finish_reason?: string;
        message?: { content?: string };
      }>;
    };

    const firstChoice = payload.choices?.[0];
    const finishReason = firstChoice?.finish_reason;
    const content = firstChoice?.message?.content?.trim();

    if (finishReason === "length") {
      return {
        ok: false,
        providerMode: "claude",
        providerLabel: "Claude API",
        latencyMs: Date.now() - startedAt,
        error: "Claude API output truncated before valid JSON",
        diagnostics: readDiagnostics(CLAUDE_PROXY_PATH, false, "Output truncated", response.headers)
      };
    }

    if (!content) {
      return {
        ok: false,
        providerMode: "claude",
        providerLabel: "Claude API",
        latencyMs: Date.now() - startedAt,
        error: "Malformed Claude API response",
        diagnostics: readDiagnostics(CLAUDE_PROXY_PATH, false, "Malformed response", response.headers)
      };
    }

    const parsed = parseJsonObject(content);
    if (!parsed || typeof parsed !== "object") {
      return {
        ok: false,
        providerMode: "claude",
        providerLabel: "Claude API",
        latencyMs: Date.now() - startedAt,
        error: "Claude API response did not contain valid JSON",
        diagnostics: readDiagnostics(CLAUDE_PROXY_PATH, false, "Invalid JSON in response", response.headers)
      };
    }

    return {
      ok: true,
      providerMode: "claude",
      providerLabel: "Claude API",
      latencyMs: Date.now() - startedAt,
      data: parsed as T,
      diagnostics: readDiagnostics(CLAUDE_PROXY_PATH, true, undefined, response.headers)
    };
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? `Claude API request timed out after ${timeoutMs}ms`
        : error instanceof Error
        ? error.message
        : "Unknown network error";
    return {
      ok: false,
      providerMode: "claude",
      providerLabel: "Claude API",
      latencyMs: Date.now() - startedAt,
      error: message,
      diagnostics: readDiagnostics(CLAUDE_PROXY_PATH, false, message)
    };
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

export function createClaudeAPIProvider(): AIProvider {
  return {
    mode: "claude",
    label: "Claude API",
    async analyzeTicket(input: AnalyzeTicketInput) {
      const result = await callClaudeCompletion<Record<string, unknown>>(buildAnalyzeTicketPrompt(input));
      if (!result.ok || !result.data) return mapFailure<AIAnalysisSuggestion>(result);
      return {
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
      };
    },
    async suggestCanonicalProblem(input: CanonicalProblemInput) {
      const result = await callClaudeCompletion<Record<string, unknown>>(
        buildCanonicalProblemPrompt(input),
        { maxTokens: 400, timeoutMs: 30000 }
      );
      if (!result.ok || !result.data) return mapFailure<AICanonicalProblemSuggestion>(result);
      return {
        ...result,
        data: {
          title: String(result.data.title ?? input.deterministicCanonicalProblem.title),
          confidence: clampConfidence(result.data.confidence),
          rationale: typeof result.data.rationale === "string" ? result.data.rationale : undefined
        }
      };
    },
    async suggestPatternName(input: PatternNameInput) {
      const result = await callClaudeCompletion<Record<string, unknown>>(buildPatternNamePrompt(input));
      if (!result.ok || !result.data) return mapFailure<AIPatternSuggestion>(result);
      return {
        ...result,
        data: {
          title: String(result.data.title ?? input.deterministicPatternTitle),
          confidence: clampConfidence(result.data.confidence),
          rationale: typeof result.data.rationale === "string" ? result.data.rationale : undefined
        }
      };
    },
    async enrichKnowledge(input: KnowledgeEnrichmentInput) {
      const result = await callClaudeCompletion<Record<string, unknown>>(buildKnowledgeEnrichmentPrompt(input));
      if (!result.ok || !result.data) return mapFailure<AIKnowledgeEnrichment>(result);
      return {
        ...result,
        data: {
          internalGuidance: normalizeList(result.data.internalGuidance),
          troubleshootingChecklist: normalizeList(result.data.troubleshootingChecklist),
          rootCauseHypotheses: normalizeList(result.data.rootCauseHypotheses),
          preventiveActions: normalizeList(result.data.preventiveActions),
          confidence: clampConfidence(result.data.confidence)
        }
      };
    },
    async draftCustomerResponse(input: DraftCustomerResponseInput) {
      const result = await callClaudeCompletion<Record<string, unknown>>(
        buildDraftCustomerResponsePrompt(input),
        { maxTokens: 650 }
      );
      if (!result.ok || !result.data) return mapFailure<AICustomerResponseSuggestion>(result);
      return {
        ...result,
        data: {
          draftResponse: String(result.data.customerResponse ?? result.data.draftResponse ?? input.deterministicDraft),
          confidence: clampConfidence(result.data.confidence),
          rationale: typeof result.data.rationale === "string" ? result.data.rationale : undefined,
          groundingMode: input.groundingMode,
          groundingLabel: input.groundingLabel
        }
      };
    },
    async discriminateMatch(input: MatchDiscriminationInput) {
      const result = await callClaudeCompletion<Record<string, unknown>>(
        buildMatchDiscriminationPrompt(input),
        { maxTokens: 400, timeoutMs: 30000 }
      );
      if (!result.ok || !result.data) return mapFailure<MatchDiscriminationResult>(result);
      const confidence = result.data.confidence === "high" || result.data.confidence === "low"
        ? result.data.confidence
        : "medium";
      return {
        ...result,
        data: {
          isDistinctFromMatch: result.data.isDistinctFromMatch === true,
          confidence,
          reasoning: typeof result.data.reasoning === "string"
            ? result.data.reasoning
            : "No reasoning provided."
        } satisfies MatchDiscriminationResult
      };
    }
  };
}
