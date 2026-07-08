import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_API_VERSION = "2023-06-01";
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_TIMEOUT_MS = 120000;
const PROXY_PATH = "/api/ai/claude";

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface ChatRequestBody {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  messages?: ChatMessage[];
}

function readApiKey(): string {
  return process.env.ANTHROPIC_API_KEY ?? "";
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
  headers.set("x-ai-server-base-url", ANTHROPIC_API_URL);
  headers.set("x-ai-endpoint-used", ANTHROPIC_API_URL);
  headers.set("x-ai-proxy-succeeded", String(proxySucceeded));
  if (fallbackReason) {
    headers.set("x-ai-fallback-reason", fallbackReason);
  }
  return headers;
}

function isValidMessages(messages: unknown): messages is ChatMessage[] {
  return Array.isArray(messages) && messages.every((message) => {
    if (!message || typeof message !== "object") return false;
    const candidate = message as Partial<ChatMessage>;
    return (candidate.role === "system" || candidate.role === "user") && typeof candidate.content === "string";
  });
}

export async function POST(request: Request) {
  const apiKey = readApiKey();
  if (!apiKey) {
    const headers = buildDiagnosticHeaders(ANTHROPIC_MODEL, false, "ANTHROPIC_API_KEY not configured");
    headers.set("Content-Type", "application/json");
    return NextResponse.json(
      { error: "Claude API key not configured", diagnostics: { mode: "claude", provider: "Claude API", proxySucceeded: false, fallbackReason: "ANTHROPIC_API_KEY not configured" } },
      { status: 503, headers }
    );
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidMessages(body.messages)) {
    return NextResponse.json({ error: "Invalid chat messages" }, { status: 400 });
  }

  const model = ANTHROPIC_MODEL;
  const systemMessage = body.messages.find((m) => m.role === "system")?.content ?? "";
  const userMessages = body.messages.filter((m) => m.role === "user").map((m) => ({ role: "user" as const, content: m.content }));

  if (userMessages.length === 0) {
    return NextResponse.json({ error: "At least one user message is required" }, { status: 400 });
  }

  const timeoutMs = readTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const anthropicBody: Record<string, unknown> = {
      model,
      max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : 180,
      temperature: typeof body.temperature === "number" ? body.temperature : 0.2,
      messages: userMessages
    };
    if (systemMessage) {
      anthropicBody.system = systemMessage;
    }

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION
      },
      body: JSON.stringify(anthropicBody),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const isRateLimit = response.status === 429;
      const isQuotaError = response.status === 402 || (response.status === 400 && errorText.includes("billing"));
      const reason = isRateLimit
        ? "Claude API rate limited"
        : isQuotaError
        ? "Claude API quota/billing error"
        : `Claude API returned HTTP ${response.status}`;
      const headers = buildDiagnosticHeaders(model, false, reason);
      headers.set("Content-Type", "application/json");
      console.warn("[claude-proxy] Claude API returned non-OK", { status: response.status, reason });
      return NextResponse.json(
        { error: reason, diagnostics: { mode: "claude", provider: "Claude API", proxySucceeded: false, fallbackReason: reason } },
        { status: response.status === 429 ? 429 : 502, headers }
      );
    }

    const payload = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
      stop_reason?: string;
      model?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const textBlock = payload.content?.find((block) => block.type === "text");
    const content = textBlock?.text?.trim() ?? "";
    const finishReason = payload.stop_reason === "max_tokens" ? "length" : "stop";

    const openAiCompatible = {
      choices: [
        {
          finish_reason: finishReason,
          message: { content, role: "assistant" }
        }
      ],
      model: payload.model ?? model,
      usage: payload.usage
    };

    const headers = buildDiagnosticHeaders(model, true);
    headers.set("Content-Type", "application/json");
    console.info("[claude-proxy] Claude API proxy succeeded", { model, timeoutMs, inputTokens: payload.usage?.input_tokens, outputTokens: payload.usage?.output_tokens });
    return NextResponse.json(openAiCompatible, { status: 200, headers });
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? `Claude API request timed out after ${timeoutMs}ms`
        : error instanceof Error
        ? error.message
        : "Unknown Claude API proxy error";
    console.warn("[claude-proxy] Claude API proxy failed", { model, timeoutMs, message });
    const headers = buildDiagnosticHeaders(model, false, message);
    return NextResponse.json(
      { error: message, diagnostics: { mode: "claude", provider: "Claude API", proxySucceeded: false, fallbackReason: message } },
      { status: message.includes("timed out") ? 504 : 502, headers }
    );
  } finally {
    clearTimeout(timeout);
  }
}
