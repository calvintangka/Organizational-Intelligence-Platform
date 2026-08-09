import { NextResponse } from "next/server";

import { withAuthorizedAIRequest } from "@/lib/server/aiAuthorization";
import { enforceAIProxyLimitsOrRespond } from "@/lib/server/aiRateLimit";

export const runtime = "nodejs";

const DEFAULT_BASE_URL = "http://127.0.0.1:1234/v1";
const DEFAULT_MODEL = "reasoning-model";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const PROXY_PATH = "/api/ai/openai-compatible";

interface ChatMessage { role: "system" | "user"; content: string; }
interface ChatRequestBody {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  timeout_ms?: number;
  response_format?: { type?: string };
  messages?: ChatMessage[];
}

function read(key: string, fallback = ""): string {
  return process.env[key]?.trim() || fallback;
}

function readTimeoutMs(requested?: number): number {
  const configured = Number(read("AI_TIER1_TIMEOUT_MS", `${DEFAULT_TIMEOUT_MS}`));
  const base = Number.isFinite(configured) ? configured : DEFAULT_TIMEOUT_MS;
  const effective = typeof requested === "number" && Number.isFinite(requested) ? Math.max(base, requested) : base;
  return Math.max(5_000, Math.min(effective, MAX_TIMEOUT_MS));
}

function diagnostics(model: string, proxySucceeded: boolean, reason?: string) {
  return {
    mode: "openai-compatible",
    provider: read("AI_TIER1_LABEL", "OpenAI-compatible API"),
    model,
    proxyPath: PROXY_PATH,
    serverBaseUrl: read("AI_TIER1_BASE_URL", DEFAULT_BASE_URL),
    endpointUsed: `${read("AI_TIER1_BASE_URL", DEFAULT_BASE_URL).replace(/\/$/, "")}/chat/completions`,
    proxySucceeded,
    ...(reason ? { fallbackReason: reason } : {})
  };
}

function errorResponse(status: number, model: string, reason: string) {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  headers.set("x-ai-mode", "openai-compatible");
  headers.set("x-ai-provider", read("AI_TIER1_LABEL", "OpenAI-compatible API"));
  headers.set("x-ai-model", model);
  headers.set("x-ai-proxy-path", PROXY_PATH);
  headers.set("x-ai-proxy-succeeded", "false");
  return NextResponse.json({ error: reason, diagnostics: diagnostics(model, false, reason) }, { status, headers });
}

function isValidMessages(messages: unknown): messages is ChatMessage[] {
  return Array.isArray(messages) && messages.length > 0 && messages.every((message) => {
    if (!message || typeof message !== "object") return false;
    const candidate = message as Partial<ChatMessage>;
    return (candidate.role === "system" || candidate.role === "user") && typeof candidate.content === "string";
  });
}

export async function POST(request: Request) {
  return withAuthorizedAIRequest(request, { endpoint: PROXY_PATH, provider: "openai-compatible" }, async (access) => {
    const { response: limitResponse } = await enforceAIProxyLimitsOrRespond(request, access);
    if (limitResponse) return limitResponse;

    const model = read("AI_TIER1_MODEL", DEFAULT_MODEL);
    const apiKey = read("AI_TIER1_API_KEY");
    if (!apiKey) return errorResponse(503, model, "AI_TIER1_API_KEY not configured");

    let body: ChatRequestBody;
    try { body = await request.json() as ChatRequestBody; }
    catch { return errorResponse(400, model, "Invalid JSON body"); }
    if (!isValidMessages(body.messages)) return errorResponse(400, model, "Invalid chat messages");

    const baseUrl = read("AI_TIER1_BASE_URL", DEFAULT_BASE_URL);
    const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
    const timeoutMs = readTimeoutMs(body.timeout_ms);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: typeof body.temperature === "number" ? body.temperature : 0.2,
          max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : 700,
          ...(body.response_format ? { response_format: body.response_format } : {}),
          messages: body.messages
        }),
        signal: controller.signal
      });
      const text = await response.text();
      if (!response.ok) {
        const status = response.status === 401 || response.status === 403 ? 502 : response.status === 429 ? 429 : 502;
        const reason = response.status === 401 || response.status === 403
          ? `${read("AI_TIER1_LABEL", "OpenAI-compatible API")} authentication failed`
          : response.status === 429
            ? `${read("AI_TIER1_LABEL", "OpenAI-compatible API")} rate limited`
            : `${read("AI_TIER1_LABEL", "OpenAI-compatible API")} returned HTTP ${response.status}`;
        return errorResponse(status, model, reason);
      }
      let payload: { choices?: Array<{ finish_reason?: string; message?: { content?: string; reasoning_content?: string } }>; model?: string };
      try { payload = JSON.parse(text) as typeof payload; }
      catch { return errorResponse(502, model, "Malformed OpenAI-compatible response"); }
      const choice = payload.choices?.[0];
      const content = choice?.message?.content ?? "";
      const reasoningContent = choice?.message?.reasoning_content;
      if (!content.trim() && !reasoningContent?.trim()) return errorResponse(502, payload.model?.trim() || model, "OpenAI-compatible response contained no content");
      const resolvedModel = payload.model?.trim() || model;
      const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
      headers.set("x-ai-mode", "openai-compatible");
      headers.set("x-ai-provider", read("AI_TIER1_LABEL", "OpenAI-compatible API"));
      headers.set("x-ai-model", resolvedModel);
      headers.set("x-ai-proxy-path", PROXY_PATH);
      headers.set("x-ai-endpoint-used", endpoint);
      headers.set("x-ai-proxy-succeeded", "true");
      return NextResponse.json({ choices: [{ finish_reason: choice?.finish_reason, message: { role: "assistant", content, ...(reasoningContent ? { reasoning_content: reasoningContent } : {}) } }], model: resolvedModel }, { status: 200, headers });
    } catch (error) {
      const message = error instanceof DOMException && error.name === "AbortError"
        ? `OpenAI-compatible request timed out after ${timeoutMs}ms`
        : error instanceof Error ? error.message : "Unknown OpenAI-compatible proxy error";
      return errorResponse(message.includes("timed out") ? 504 : 502, model, message);
    } finally { clearTimeout(timeout); }
  });
}
