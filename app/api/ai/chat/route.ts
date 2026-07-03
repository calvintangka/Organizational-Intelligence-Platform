import { NextResponse } from "next/server";

export const runtime = "nodejs";

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
  return process.env.AI_BASE_URL ?? process.env.NEXT_PUBLIC_AI_BASE_URL ?? "http://127.0.0.1:1234/v1";
}

function readModel(requestedModel?: string): string {
  return requestedModel ?? process.env.AI_MODEL ?? process.env.NEXT_PUBLIC_AI_MODEL ?? "google/gemma-4-e4b";
}

function readTimeoutMs(): number {
  const configured = Number(process.env.AI_TIMEOUT_MS ?? process.env.NEXT_PUBLIC_AI_TIMEOUT_MS ?? "7000");
  return Math.max(5000, Math.min(Number.isFinite(configured) ? configured : 7000, 8000));
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

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidMessages(body.messages)) {
    return NextResponse.json({ error: "Invalid chat messages" }, { status: 400 });
  }

  const timeoutMs = readTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${readBaseUrl().replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: readModel(body.model),
        temperature: typeof body.temperature === "number" ? body.temperature : 0.2,
        max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : 180,
        messages: body.messages
      }),
      signal: controller.signal
    });

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") ?? "application/json"
      }
    });
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? `AI request timed out after ${timeoutMs}ms`
        : error instanceof Error
        ? error.message
        : "Unknown AI proxy error";
    return NextResponse.json({ error: message }, { status: 504 });
  } finally {
    clearTimeout(timeout);
  }
}
