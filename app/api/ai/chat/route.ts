import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_AI_BASE_URL = "http://127.0.0.1:1234/v1";
const DEFAULT_AI_MODEL = "google/gemma-4-e4b";
const DEFAULT_TIMEOUT_MS = 30000;
const PROXY_PATH = "/api/ai/chat";

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

function readBaseUrl(): string {
  return process.env.AI_BASE_URL ?? process.env.NEXT_PUBLIC_AI_BASE_URL ?? DEFAULT_AI_BASE_URL;
}

function readModel(requestedModel?: string): string {
  const trimmed = requestedModel?.trim();
  return trimmed || (process.env.AI_MODEL ?? process.env.NEXT_PUBLIC_AI_MODEL ?? DEFAULT_AI_MODEL);
}

function readTimeoutMs(): number {
  const configured = Number(process.env.AI_TIMEOUT_MS ?? process.env.NEXT_PUBLIC_AI_TIMEOUT_MS ?? `${DEFAULT_TIMEOUT_MS}`);
  return Math.max(5000, Math.min(Number.isFinite(configured) ? configured : DEFAULT_TIMEOUT_MS, 30000));
}

function readMode(): "disabled" | "lmstudio" | "amd" {
  const configured = (process.env.NEXT_PUBLIC_AI_MODE ?? process.env.AI_MODE ?? "disabled").toLowerCase();
  return configured === "lmstudio" || configured === "amd" ? configured : "disabled";
}

function buildDiagnostics(model: string, proxySucceeded: boolean, fallbackReason?: string) {
  return {
    mode: readMode(),
    provider: "LM Studio",
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
  if (diagnostics.fallbackReason) {
    headers.set("x-ai-fallback-reason", diagnostics.fallbackReason);
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
  let body: ChatRequestBody;
  let requestedModel: string | undefined;

  try {
    body = (await request.json()) as ChatRequestBody;
    requestedModel = body.model;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidMessages(body.messages)) {
    return NextResponse.json({ error: "Invalid chat messages" }, { status: 400 });
  }

  const timeoutMs = readTimeoutMs();
  const model = readModel(requestedModel);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const endpoint = `${readBaseUrl().replace(/\/$/, "")}/chat/completions`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: typeof body.temperature === "number" ? body.temperature : 0.2,
        max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : 180,
        messages: body.messages
      }),
      signal: controller.signal
    });

    const text = await response.text();
    const headers = buildDiagnosticHeaders(model, response.ok, response.ok ? undefined : `LM Studio returned HTTP ${response.status}`);
    headers.set("Content-Type", response.headers.get("Content-Type") ?? "application/json");
    if (response.ok) {
      console.info("[ai-proxy] LM Studio proxy succeeded", { endpoint, model, timeoutMs, status: response.status });
    } else {
      console.warn("[ai-proxy] LM Studio proxy returned a non-OK response", { endpoint, model, timeoutMs, status: response.status });
    }
    return new NextResponse(text, {
      status: response.status,
      headers
    });
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? `AI request timed out after ${timeoutMs}ms`
        : error instanceof Error
        ? error.message
        : "Unknown AI proxy error";
    console.warn("[ai-proxy] LM Studio proxy failed", {
      endpoint: `${readBaseUrl().replace(/\/$/, "")}/chat/completions`,
      model,
      timeoutMs,
      message
    });
    return NextResponse.json(
      {
        error: message,
        diagnostics: buildDiagnostics(model, false, message)
      },
      {
        status: message.includes("timed out") ? 504 : 502,
        headers: buildDiagnosticHeaders(model, false, message)
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}
