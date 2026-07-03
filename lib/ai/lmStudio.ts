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
  AnalyzeTicketInput,
  CanonicalProblemInput,
  DraftCustomerResponseInput,
  KnowledgeEnrichmentInput,
  MatchDiscriminationInput,
  PatternNameInput
} from "@/lib/ai/types";
import type {
  AIAnalysisSuggestion,
  AICanonicalProblemSuggestion,
  AICustomerResponseSuggestion,
  AIKnowledgeEnrichment,
  AIPatternSuggestion,
  MatchDiscriminationResult
} from "@/types";

interface ChatCompletionPayload {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  temperature: number;
  max_tokens: number;
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
      // Fall through to narrower candidates when the model emits extra braces.
    }
  }

  const starts = [...text.matchAll(/\{/g)].map((match) => match.index ?? -1).filter((index) => index >= 0);
  const ends = [...text.matchAll(/\}/g)].map((match) => match.index ?? -1).filter((index) => index >= 0);
  for (const start of starts) {
    for (const end of ends.filter((candidate) => candidate > start).reverse()) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        // Try the next candidate.
      }
    }
  }

  return null;
}

async function callChatCompletion<T>(
  config: AIConfig,
  prompt: { system: string; user: string }
): Promise<AIProviderResult<T>> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutMs = Math.max(5000, Math.min(config.timeoutMs, 8000));
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const endpoint =
    typeof window === "undefined"
      ? `${config.baseUrl.replace(/\/$/, "")}/chat/completions`
      : "/api/ai/chat";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: 180,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user }
        ]
      } satisfies ChatCompletionPayload),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        ok: false,
        providerMode: "lmstudio",
        providerLabel: "LM Studio",
        model: config.model,
        latencyMs: Date.now() - startedAt,
        error: errorText ? `HTTP ${response.status}: ${errorText}` : `HTTP ${response.status}`
      };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      return {
        ok: false,
        providerMode: "lmstudio",
        providerLabel: "LM Studio",
        model: config.model,
        latencyMs: Date.now() - startedAt,
        error: "Malformed AI response"
      };
    }

    const parsed = parseJsonObject(content);
    if (!parsed || typeof parsed !== "object") {
      return {
        ok: false,
        providerMode: "lmstudio",
        providerLabel: "LM Studio",
        model: config.model,
        latencyMs: Date.now() - startedAt,
        error: "AI response did not contain valid JSON"
      };
    }

    return {
      ok: true,
      providerMode: "lmstudio",
      providerLabel: "LM Studio",
      model: config.model,
      latencyMs: Date.now() - startedAt,
      data: parsed as T
    };
  } catch (error) {
    return {
      ok: false,
      providerMode: "lmstudio",
      providerLabel: "LM Studio",
      model: config.model,
      latencyMs: Date.now() - startedAt,
      error:
        error instanceof DOMException && error.name === "AbortError"
          ? `AI request timed out after ${timeoutMs}ms`
          : error instanceof Error
          ? error.message
          : "Unknown network error"
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
    error: result.error
  };
}

export function createLMStudioProvider(config: AIConfig): AIProvider {
  return {
    mode: "lmstudio",
    label: "LM Studio",
    async analyzeTicket(input: AnalyzeTicketInput) {
      const result = await callChatCompletion<Record<string, unknown>>(config, buildAnalyzeTicketPrompt(input));
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
          rationale: typeof result.data.rationale === "string" ? result.data.rationale : undefined
        }
      };
    },
    async suggestCanonicalProblem(input: CanonicalProblemInput) {
      const result = await callChatCompletion<Record<string, unknown>>(config, buildCanonicalProblemPrompt(input));
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
      const result = await callChatCompletion<Record<string, unknown>>(config, buildPatternNamePrompt(input));
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
      const result = await callChatCompletion<Record<string, unknown>>(config, buildKnowledgeEnrichmentPrompt(input));
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
      const result = await callChatCompletion<Record<string, unknown>>(config, buildDraftCustomerResponsePrompt(input));
      if (!result.ok || !result.data) return mapFailure<AICustomerResponseSuggestion>(result);
      return {
        ...result,
        data: {
          draftResponse: String(result.data.draftResponse ?? input.deterministicDraft),
          confidence: clampConfidence(result.data.confidence),
          rationale: typeof result.data.rationale === "string" ? result.data.rationale : undefined,
          groundingMode: input.groundingMode,
          groundingLabel: input.groundingLabel
        }
      };
    },
    async discriminateMatch(input: MatchDiscriminationInput) {
      const result = await callChatCompletion<Record<string, unknown>>(config, buildMatchDiscriminationPrompt(input));
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
