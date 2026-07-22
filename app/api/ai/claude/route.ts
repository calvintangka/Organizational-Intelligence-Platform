import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
const DEFAULT_CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;
const PROXY_PATH = "/api/ai/claude";

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface ChatRequestBody {
  temperature?: number;
  max_tokens?: number;
  messages?: ChatMessage[];
}

function readApiKey(): string {
  return process.env.ANTHROPIC_API_KEY ?? "";
}

function readModel(): string {
  return process.env.CLAUDE_MODEL?.trim() || DEFAULT_CLAUDE_MODEL;
}

function readTimeoutMs(): number {
  const configured = Number(process.env.CLAUDE_TIMEOUT_MS ?? `${DEFAULT_TIMEOUT_MS}`);
  return Math.max(5000, Math.min(Number.isFinite(configured) ? configured : DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS));
}

function buildDiagnosticHeaders(model: string, proxySucceeded: boolean, fallbackReason?: string): Headers {
  const headers = new Headers();
  headers.set("x-ai-mode", "claude");
  headers.set("x-ai-provider", "Claude API");
  headers.set("x-ai-model", model);
  headers.set("x-ai-proxy-path", PROXY_PATH);
  headers.set("x-ai-server-base-url", "https://api.anthropic.com");
  headers.set("x-ai-endpoint-used", ANTHROPIC_API_URL);
  headers.set("x-ai-proxy-succeeded", String(proxySucceeded));
  if (fallbackReason) headers.set("x-ai-fallback-reason", fallbackReason);
  return headers;
}

function isValidMessages(messages: unknown): messages is ChatMessage[] {
  return Array.isArray(messages) && messages.every((message) => {
    if (!message || typeof message !== "object") return false;
    const candidate = message as Partial<ChatMessage>;
    return (candidate.role === "system" || candidate.role === "user") && typeof candidate.content === "string";
  });
}

function errorResponse(status: number, model: string, message: string) {
  const headers = buildDiagnosticHeaders(model, false, message);
  headers.set("Content-Type", "application/json");
  return NextResponse.json(
    {
      error: message,
      diagnostics: {
        mode: "claude",
        provider: "Claude API",
        proxySucceeded: false,
        fallbackReason: message
      }
    },
    { status, headers }
  );
}

export async function POST(request: Request) {
  const model = readModel();
  const apiKey = readApiKey();
  if (!apiKey) return errorResponse(503, model, "ANTHROPIC_API_KEY not configured");

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return errorResponse(400, model, "Invalid JSON body");
  }

  if (!isValidMessages(body.messages)) return errorResponse(400, model, "Invalid chat messages");

  const system = body.messages.find((message) => message.role === "system")?.content.trim();
  const messages = body.messages
    .filter((message) => message.role === "user")
    .map((message) => ({ role: "user" as const, content: message.content }));
  if (messages.length === 0) return errorResponse(400, model, "At least one user message is required");

  const timeoutMs = readTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.max(1, Math.min(body.max_tokens ?? 180, 4096)),
        temperature: typeof body.temperature === "number" ? body.temperature : 0.2,
        ...(system ? { system } : {}),
        messages
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const upstreamBody = await response.text().catch(() => "");
      const lower = upstreamBody.toLowerCase();
      const message = response.status === 429
        ? "Claude API rate limited"
        : response.status === 402 || (response.status === 400 && lower.includes("billing"))
          ? "Claude API quota/billing error"
          : `Claude API returned HTTP ${response.status}`;
      console.warn("[claude-proxy] Claude API returned non-OK", { model, timeoutMs, status: response.status });
      return errorResponse(response.status === 429 ? 429 : 502, model, message);
    }

    let payload: {
      content?: Array<{ type?: string; text?: string }>;
      stop_reason?: string;
      model?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    try {
      payload = await response.json();
    } catch {
      console.warn("[claude-proxy] Claude API returned malformed JSON", { model, timeoutMs, status: response.status });
      return errorResponse(502, model, "Malformed Claude API response");
    }

    const content = payload.content
      ?.filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n") ?? "";
    if (!content) {
      console.warn("[claude-proxy] Claude API response contained no text", { model, timeoutMs, status: response.status });
      return errorResponse(502, model, "Malformed Claude API response");
    }

    const resolvedModel = payload.model?.trim() || model;
    const headers = buildDiagnosticHeaders(resolvedModel, true);
    headers.set("Content-Type", "application/json");
    console.info("[claude-proxy] Claude API proxy succeeded", {
      model: resolvedModel,
      timeoutMs,
      inputTokens: payload.usage?.input_tokens,
      outputTokens: payload.usage?.output_tokens
    });
    return NextResponse.json(
      {
        choices: [{
          finish_reason: payload.stop_reason === "max_tokens" ? "length" : "stop",
          message: { content, role: "assistant" }
        }],
        model: resolvedModel,
        usage: payload.usage
      },
      { status: 200, headers }
    );
  } catch (error) {
    const message = error instanceof DOMException && error.name === "AbortError"
      ? `Claude API request timed out after ${timeoutMs}ms`
      : error instanceof Error
        ? error.message
        : "Unknown Claude API proxy error";
    console.warn("[claude-proxy] Claude API proxy failed", { model, timeoutMs, message });
    return errorResponse(message.includes("timed out") ? 504 : 502, model, message);
  } finally {
    clearTimeout(timeout);
  }
}
