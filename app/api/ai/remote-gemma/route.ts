import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_REMOTE_GEMMA_MODEL = "/workspace/models/gemma-4-31b-qat/gemma-4-31B-it-qat-UD-Q4_K_XL.gguf";
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;
const PROXY_PATH = "/api/ai/remote-gemma";

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
  return process.env.REMOTE_GEMMA_BASE_URL ?? "";
}

function readModel(): string {
  // Always use the server-side env var — the remote server has exactly one model loaded.
  return process.env.REMOTE_GEMMA_MODEL ?? DEFAULT_REMOTE_GEMMA_MODEL;
}

function readTimeoutMs(): number {
  const configured = Number(process.env.REMOTE_GEMMA_TIMEOUT_MS ?? `${DEFAULT_TIMEOUT_MS}`);
  return Math.max(5000, Math.min(Number.isFinite(configured) ? configured : DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS));
}

function buildDiagnosticHeaders(model: string, proxySucceeded: boolean, fallbackReason?: string): Headers {
  const baseUrl = readBaseUrl();
  const headers = new Headers();
  headers.set("x-ai-mode", "lmstudio");
  headers.set("x-ai-provider", "Remote Gemma");
  headers.set("x-ai-model", model);
  headers.set("x-ai-proxy-path", PROXY_PATH);
  headers.set("x-ai-server-base-url", baseUrl);
  headers.set("x-ai-endpoint-used", baseUrl ? `${baseUrl.replace(/\/$/, "")}/chat/completions` : "unconfigured");
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
  const baseUrl = readBaseUrl();
  if (!baseUrl) {
    const headers = buildDiagnosticHeaders(DEFAULT_REMOTE_GEMMA_MODEL, false, "REMOTE_GEMMA_BASE_URL not configured");
    headers.set("Content-Type", "application/json");
    return NextResponse.json(
      { error: "Remote Gemma endpoint not configured", diagnostics: { mode: "lmstudio", provider: "Remote Gemma", proxySucceeded: false, fallbackReason: "REMOTE_GEMMA_BASE_URL not configured" } },
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

  const model = readModel();
  const timeoutMs = readTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Required: without this header ngrok intercepts the request with a
        // browser-warning interstitial page instead of forwarding to llama-server.
        "ngrok-skip-browser-warning": "true"
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
    const headers = buildDiagnosticHeaders(model, response.ok, response.ok ? undefined : `Remote Gemma returned HTTP ${response.status}`);
    headers.set("Content-Type", response.headers.get("Content-Type") ?? "application/json");

    if (response.ok) {
      console.info("[remote-gemma-proxy] Remote Gemma proxy succeeded", { endpoint, model, timeoutMs, status: response.status });
    } else {
      console.warn("[remote-gemma-proxy] Remote Gemma returned non-OK", { endpoint, model, timeoutMs, status: response.status });
    }

    return new NextResponse(text, { status: response.status, headers });
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? `Remote Gemma request timed out after ${timeoutMs}ms`
        : error instanceof Error
        ? error.message
        : "Unknown remote Gemma proxy error";
    console.warn("[remote-gemma-proxy] Remote Gemma proxy failed", {
      endpoint: `${baseUrl.replace(/\/$/, "")}/chat/completions`,
      model,
      timeoutMs,
      message
    });
    return NextResponse.json(
      { error: message, diagnostics: { mode: "lmstudio", provider: "Remote Gemma", proxySucceeded: false, fallbackReason: message } },
      {
        status: message.includes("timed out") ? 504 : 502,
        headers: buildDiagnosticHeaders(model, false, message)
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}
