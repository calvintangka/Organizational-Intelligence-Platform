import type { IntelligenceLogEntry } from "@/types/oip";

let _counter = 1;

export function createLogEntry(event: string, detail?: string): IntelligenceLogEntry {
  return {
    id: `log-${_counter++}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    event,
    detail
  };
}

export function formatLogTime(isoString: string): string {
  const d = new Date(isoString);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}
