import { NextResponse } from "next/server";

export const runtime = "nodejs";

// FALLBACK tier — NVIDIA NIM (https://build.nvidia.com). The endpoint is
// OpenAI-compatible, so this proxy is a thin passthrough: it injects the
// server-side API key, forces thinking OFF (we need clean JSON, not a
// chain-of-thought), and forwards the OpenAI-shaped response verbatim.
const DEFAULT_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_NVIDIA_MODEL = "nvidia/nemotron-3-super-120b-a12b";
const DEFAULT_TIMEOUT_MS = 45000;
const MAX_TIMEOUT_MS = 120000;
const PROXY_PATH = "/api/ai/nvidia";

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface ChatRequestBody {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  messages?: ChatMessage[];
  // Thinking controls forwarded verbatim when the client sets them. Nemotron
  // reads chat_template_kwargs.enable_thinking; we default it to false so the
  // model returns the JSON answer directly instead of reasoning_content.
  chat_template_kwargs?: Record<string, unknown>;
}

function readApiKey(): string {
  return process.env.NVIDIA_API_KEY ?? "";
}

function readBaseUrl(): string {
  return process.env.NVIDIA_BASE_URL ?? DEFAULT_NVIDIA_BASE_URL;
}

function readModel(requestedModel?: string): string {
  const trimmed = requestedModel?.trim();
  return trimmed || (process.env.NVIDIA_MODEL ?? DEFAULT_NVIDIA_MODEL);
}

function readTimeoutMs(): number {
  const configured = Number(process.env.NVIDIA_TIMEOUT_MS ?? `${DEFAULT_TIMEOUT_MS}`);
  return Math.max(5000, Math.min(Number.isFinite(configured) ? configured : DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS));
}

function buildDiagnosticHeaders(model: string, proxySucceeded: boolean, fallbackReason?: string): Headers {
  const baseUrl = readBaseUrl();
  const headers = new Headers();
  headers.set("x-ai-mode", "nvidia");
  headers.set("x-ai-provider", "NVIDIA NIM");
  headers.set("x-ai-model", model);
  headers.set("x-ai-proxy-path", PROXY_PATH);
  headers.set("x-ai-server-base-url", baseUrl);
  headers.set("x-ai-endpoint-used", `${baseUrl.replace(/\/$/, "")}/chat/completions`);
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
    const headers = buildDiagnosticHeaders(readModel(), false, "NVIDIA_API_KEY not configured");
    headers.set("Content-Type", "application/json");
    return NextResponse.json(
      { error: "NVIDIA API key not configured", diagnostics: { mode: "nvidia", provider: "NVIDIA NIM", proxySucceeded: false, fallbackReason: "NVIDIA_API_KEY not configured" } },
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

  const model = readModel(body.model);
  const timeoutMs = readTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const endpoint = `${readBaseUrl().replace(/\/$/, "")}/chat/completions`;
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
        messages: body.messages,
        stream: false,
        // Force thinking OFF unless the client explicitly overrides it, so the
        // model returns JSON in `content` rather than in reasoning_content.
        chat_template_kwargs: body.chat_template_kwargs ?? { enable_thinking: false }
      }),
      signal: controller.signal
    });

    const text = await response.text();
    const headers = buildDiagnosticHeaders(model, response.ok, response.ok ? undefined : `NVIDIA NIM returned HTTP ${response.status}`);
    headers.set("Content-Type", response.headers.get("Content-Type") ?? "application/json");

    if (response.ok) {
      console.info("[nvidia-proxy] NVIDIA NIM proxy succeeded", { endpoint, model, timeoutMs, status: response.status });
    } else {
      console.warn("[nvidia-proxy] NVIDIA NIM returned non-OK", { endpoint, model, timeoutMs, status: response.status });
    }

    return new NextResponse(text, { status: response.status, headers });
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? `NVIDIA NIM request timed out after ${timeoutMs}ms`
        : error instanceof Error
        ? error.message
        : "Unknown NVIDIA NIM proxy error";
    console.warn("[nvidia-proxy] NVIDIA NIM proxy failed", {
      endpoint: `${readBaseUrl().replace(/\/$/, "")}/chat/completions`,
      model,
      timeoutMs,
      message
    });
    return NextResponse.json(
      { error: message, diagnostics: { mode: "nvidia", provider: "NVIDIA NIM", proxySucceeded: false, fallbackReason: message } },
      {
        status: message.includes("timed out") ? 504 : 502,
        headers: buildDiagnosticHeaders(model, false, message)
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}
