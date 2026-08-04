/**
 * TODO-064: removable performance instrumentation.
 *
 * Telemetry is deliberately process-local and metadata-only. It never writes
 * to Organizational Memory, trust, lessons, knowledge, versions, or metrics.
 * Consumers can replace this sink later without changing pipeline behavior.
 */

export type TelemetryCategory = "pipeline" | "provider" | "database" | "bulk" | "ui";
export type TelemetryUnit = "ms" | "tickets" | "rows" | "requests" | "operations";

export interface TelemetryEvent {
  id: string;
  name: string;
  category: TelemetryCategory;
  durationMs: number;
  startedAt: number;
  endedAt: number;
  success: boolean;
  unit: TelemetryUnit;
  quantity?: number;
  tags: Record<string, string | number | boolean | undefined>;
}

export interface TelemetrySummary {
  key: string;
  name: string;
  category: TelemetryCategory;
  unit: TelemetryUnit;
  tags: Record<string, string | number | boolean | undefined>;
  minimumMs: number;
  maximumMs: number;
  averageMs: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  standardDeviationMs: number;
  sampleCount: number;
  throughput: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  fallbackCount: number;
  successRate: number;
  failureRate: number;
  timeoutRate: number;
  fallbackRate: number;
}

export interface TelemetrySnapshot {
  generatedAt: string;
  events: TelemetryEvent[];
  summaries: TelemetrySummary[];
}

export interface TelemetrySpanOptions {
  unit?: TelemetryUnit;
  quantity?: number;
  tags?: Record<string, string | number | boolean | undefined>;
}

const MAX_EVENTS = 20000;
const EVENT_STORE_KEY = "__oip_todo064_telemetry_store__";
const listeners = new Set<() => void>();

function globalStore(): { events: TelemetryEvent[]; sequence: number } {
  const root = globalThis as typeof globalThis & {
    [EVENT_STORE_KEY]?: { events: TelemetryEvent[]; sequence: number };
  };
  root[EVENT_STORE_KEY] ??= { events: [], sequence: 0 };
  return root[EVENT_STORE_KEY]!;
}

function telemetryEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OIP_TELEMETRY !== "false" && process.env.OIP_TELEMETRY !== "false";
}

function diagnosticsLoggingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OIP_TELEMETRY_LOG === "true" || process.env.OIP_TELEMETRY_LOG === "true";
}

function now(): number {
  return typeof performance !== "undefined" ? performance.timeOrigin + performance.now() : Date.now();
}

function finiteDuration(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Number(value.toFixed(3)) : 0;
}

function quantile(sorted: number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function recordTelemetryEvent(input: Omit<TelemetryEvent, "id">): void {
  if (!telemetryEnabled()) return;
  const store = globalStore();
  const event: TelemetryEvent = {
    ...input,
    id: `telemetry-${++store.sequence}`,
    durationMs: finiteDuration(input.durationMs),
    tags: { ...input.tags }
  };
  store.events.push(event);
  if (store.events.length > MAX_EVENTS) store.events.splice(0, store.events.length - MAX_EVENTS);
  if (diagnosticsLoggingEnabled() && typeof console !== "undefined") {
    console.debug(`[TODO-064] ${event.category}.${event.name}`, event.durationMs, event.tags);
  }
  listeners.forEach((listener) => listener());
}

export function startTelemetrySpan(
  name: string,
  category: TelemetryCategory,
  options: TelemetrySpanOptions = {}
): { end: (success?: boolean, extraTags?: TelemetrySpanOptions["tags"]) => void } {
  const startedAt = now();
  let ended = false;
  return {
    end(success = true, extraTags = {}) {
      if (ended) return;
      ended = true;
      const endedAt = now();
      recordTelemetryEvent({
        name,
        category,
        durationMs: endedAt - startedAt,
        startedAt,
        endedAt,
        success,
        unit: options.unit ?? "ms",
        quantity: options.quantity,
        tags: { ...options.tags, ...extraTags }
      });
    }
  };
}

export async function measureTelemetry<T>(
  name: string,
  category: TelemetryCategory,
  operation: () => Promise<T>,
  options: TelemetrySpanOptions = {}
): Promise<T> {
  const span = startTelemetrySpan(name, category, options);
  try {
    const result = await operation();
    span.end(true);
    return result;
  } catch (error) {
    span.end(false, { error: error instanceof Error ? error.name : "unknown" });
    throw error;
  }
}

export function measureTelemetrySync<T>(
  name: string,
  category: TelemetryCategory,
  operation: () => T,
  options: TelemetrySpanOptions = {}
): T {
  const span = startTelemetrySpan(name, category, options);
  try {
    const result = operation();
    span.end(true);
    return result;
  } catch (error) {
    span.end(false, { error: error instanceof Error ? error.name : "unknown" });
    throw error;
  }
}

export function getTelemetryEvents(): TelemetryEvent[] {
  return globalStore().events.map((event) => ({ ...event, tags: { ...event.tags } }));
}

export function getTelemetrySnapshot(): TelemetrySnapshot {
  const events = getTelemetryEvents();
  const groups = new Map<string, TelemetryEvent[]>();
  for (const event of events) {
    const tags = Object.entries(event.tags)
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${String(value)}`)
      .join("|");
    const key = `${event.category}:${event.name}:${event.unit}:${tags}`;
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }

  const summaries = [...groups.entries()].map(([key, group]) => {
    const values = group.map((event) => event.durationMs).sort((a, b) => a - b);
    const averageMs = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
    const variance = values.reduce((sum, value) => sum + ((value - averageMs) ** 2), 0) / Math.max(values.length, 1);
    const firstStart = Math.min(...group.map((event) => event.startedAt));
    const lastEnd = Math.max(...group.map((event) => event.endedAt));
    const elapsedSeconds = Math.max((lastEnd - firstStart) / 1000, 0.001);
    const measuredQuantity = group.reduce((sum, event) => sum + (event.quantity ?? 1), 0);
    const successCount = group.filter((event) => event.success).length;
    const failureCount = group.length - successCount;
    const timeoutCount = group.filter((event) => event.tags.timeout === true).length;
    const fallbackCount = group.filter((event) => event.tags.fallback === true).length;
    return {
      key,
      name: group[0].name,
      category: group[0].category,
      unit: group[0].unit,
      tags: { ...group[0].tags },
      minimumMs: finiteDuration(values[0] ?? 0),
      maximumMs: finiteDuration(values[values.length - 1] ?? 0),
      averageMs: finiteDuration(averageMs),
      medianMs: finiteDuration(quantile(values, 0.5)),
      p95Ms: finiteDuration(quantile(values, 0.95)),
      p99Ms: finiteDuration(quantile(values, 0.99)),
      standardDeviationMs: finiteDuration(Math.sqrt(variance)),
      sampleCount: group.length,
      throughput: Number((measuredQuantity / elapsedSeconds).toFixed(3)),
      successCount,
      failureCount,
      timeoutCount,
      fallbackCount,
      successRate: Number((successCount / group.length).toFixed(4)),
      failureRate: Number((failureCount / group.length).toFixed(4)),
      timeoutRate: Number((timeoutCount / group.length).toFixed(4)),
      fallbackRate: Number((fallbackCount / group.length).toFixed(4))
    } satisfies TelemetrySummary;
  }).sort((left, right) => right.averageMs - left.averageMs);

  return { generatedAt: new Date().toISOString(), events, summaries };
}

export function subscribeTelemetry(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearTelemetry(): void {
  const store = globalStore();
  store.events.length = 0;
  listeners.forEach((listener) => listener());
}
