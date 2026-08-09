import { NextResponse } from "next/server";

import { withAuthorizedAIRequest } from "@/lib/server/aiAuthorization";
import { enforceAIProxyLimitsOrRespond } from "@/lib/server/aiRateLimit";

export const runtime = "nodejs";

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;
const PROXY_PATH = "/api/ai/deepseek";

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface ChatRequestBody {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  messages?: ChatMessage[];
  response_format?: { type?: string };
  thinking?: { type?: "enabled" | "disabled" };
  timeout_ms?: number;
}

function readApiKey(): string {
  return process.env.DEEPSEEK_API_KEY ?? "";
}

function readBaseUrl(): string {
  return process.env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_DEEPSEEK_BASE_URL;
}

function readModel(requestedModel?: string): string {
  return process.env.DEEPSEEK_MODEL?.trim() || requestedModel?.trim() || DEFAULT_DEEPSEEK_MODEL;
}

function readTimeoutMs(requested?: number): number {
  const configured = Number(process.env.DEEPSEEK_TIMEOUT_MS ?? `${DEFAULT_TIMEOUT_MS}`);
  const base = Number.isFinite(configured) ? configured : DEFAULT_TIMEOUT_MS;
  const effective = typeof requested === "number" && Number.isFinite(requested) ? Math.max(base, requested) : base;
  return Math.max(5000, Math.min(effective, MAX_TIMEOUT_MS));
}

function buildDiagnostics(model: string, proxySucceeded: boolean, fallbackReason?: string) {
  return {
    mode: "deepseek" as const,
    provider: "DeepSeek API",
    model,
    proxyPath: PROXY_PATH,
    serverBaseUrl: readBaseUrl(),
    endpointUsed: `${readBaseUrl().replace(/\/$/, "")}/chat/completions`,
    proxySucceeded,
    fallbackReason
  };
}

function buildDiagnosticHeaders(model: string, proxySucceeded: boolean, fallbackReason?: string): Headers {
  const diagnostics = buildDiagnostics(model, proxySucceeded, fallbackReason);
  const headers = new Headers();
  headers.set("x-ai-mode", diagnostics.mode);
  headers.set("x-ai-provider", diagnostics.provider);
  headers.set("x-ai-model", diagnostics.model);
  headers.set("x-ai-proxy-path", diagnostics.proxyPath);
  headers.set("x-ai-server-base-url", diagnostics.serverBaseUrl);
  headers.set("x-ai-endpoint-used", diagnostics.endpointUsed);
  headers.set("x-ai-proxy-succeeded", String(diagnostics.proxySucceeded));
  if (diagnostics.fallbackReason) headers.set("x-ai-fallback-reason", diagnostics.fallbackReason);
  return headers;
}

function errorResponse(status: number, model: string, message: string) {
  const headers = buildDiagnosticHeaders(model, false, message);
  headers.set("Content-Type", "application/json");
  return NextResponse.json(
    {
      error: message,
      diagnostics: buildDiagnostics(model, false, message)
    },
    { status, headers }
  );
}

function isValidMessages(messages: unknown): messages is ChatMessage[] {
  return Array.isArray(messages) && messages.length > 0 && messages.every((message) => {
    if (!message || typeof message !== "object") return false;
    const candidate = message as Partial<ChatMessage>;
    return (candidate.role === "system" || candidate.role === "user") && typeof candidate.content === "string";
  });
}

export async function POST(request: Request) {
  return withAuthorizedAIRequest(request, { endpoint: PROXY_PATH, provider: "deepseek" }, async (access) => {
    const { response: limitResponse } = await enforceAIProxyLimitsOrRespond(request, access);
    if (limitResponse) return limitResponse;

    const model = readModel();
    const apiKey = readApiKey();
    if (!apiKey) return errorResponse(503, model, "DEEPSEEK_API_KEY not configured");

    let body: ChatRequestBody;
    try {
      body = (await request.json()) as ChatRequestBody;
    } catch {
      return errorResponse(400, model, "Invalid JSON body");
    }

    if (!isValidMessages(body.messages)) return errorResponse(400, model, "Invalid chat messages");

    const timeoutMs = readTimeoutMs(body.timeout_ms);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const endpoint = `${readBaseUrl().replace(/\/$/, "")}/chat/completions`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          temperature: typeof body.temperature === "number" ? body.temperature : 0.2,
          max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : 180,
          ...(body.response_format ? { response_format: body.response_format } : {}),
          // Keep reasoning private and bounded for structured OIP advisories.
          // The adapter validates only message.content, never this channel.
          thinking: { type: body.thinking?.type === "enabled" ? "enabled" : "disabled" },
          messages: body.messages
        }),
        signal: controller.signal
      });

      const text = await response.text();
      if (!response.ok) {
        const reason = response.status === 401
          ? "DeepSeek API authentication failed"
          : response.status === 402
            ? "DeepSeek API quota/billing error"
            : response.status === 429
              ? "DeepSeek API rate limited"
              : `DeepSeek API returned HTTP ${response.status}`;
        console.warn("[deepseek-proxy] DeepSeek API returned non-OK", { model, timeoutMs, status: response.status });
        return errorResponse(response.status === 401 ? 502 : response.status === 429 ? 429 : 502, model, reason);
      }

      let payload: {
        choices?: Array<{
          finish_reason?: string;
          message?: { content?: string; reasoning_content?: string };
        }>;
        model?: string;
      };
      try {
        payload = JSON.parse(text) as typeof payload;
      } catch {
        console.warn("[deepseek-proxy] DeepSeek API returned malformed JSON", { model, timeoutMs, status: response.status });
        return errorResponse(502, model, "Malformed DeepSeek API response");
      }

      const resolvedModel = payload.model?.trim() || model;
      const firstChoice = payload.choices?.[0];
      const content = firstChoice?.message?.content ?? "";
      const reasoningContent = firstChoice?.message?.reasoning_content;
      const output = content || reasoningContent;
      if (!output?.trim()) {
        console.warn("[deepseek-proxy] DeepSeek API response contained no content", { model: resolvedModel, timeoutMs });
        return errorResponse(502, resolvedModel, "Malformed DeepSeek API response");
      }

      const headers = buildDiagnosticHeaders(resolvedModel, true);
      headers.set("Content-Type", "application/json");
      console.info("[deepseek-proxy] DeepSeek API proxy succeeded", { model: resolvedModel, timeoutMs, status: response.status });
      return NextResponse.json(
        {
          choices: [{
            finish_reason: firstChoice?.finish_reason,
            message: {
              content,
              ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
              role: "assistant"
            }
          }],
          model: resolvedModel
        },
        { status: 200, headers }
      );
    } catch (error) {
      const message = error instanceof DOMException && error.name === "AbortError"
        ? `DeepSeek API request timed out after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : "Unknown DeepSeek API proxy error";
      console.warn("[deepseek-proxy] DeepSeek API proxy failed", { model, timeoutMs, message });
      return errorResponse(message.includes("timed out") ? 504 : 502, model, message);
    } finally {
      clearTimeout(timeout);
    }
  });
}
