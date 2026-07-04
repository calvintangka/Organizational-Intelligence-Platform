import type { OrganizationProfile, TicketRecord, TicketRecordStatus } from "@/types";

const STORAGE_VERSION = "v2";
const TICKET_RECORDS_KEY = `oip.ticketRecords.${STORAGE_VERSION}`;
const TICKET_COUNTER_KEY = `oip.ticketCounter.${STORAGE_VERSION}`;

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function read<T>(key: string): T | null {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota errors in prototype */
  }
}

function orgPrefix(profile: OrganizationProfile): string {
  if (profile.logoInitials?.trim()) return profile.logoInitials.trim().toUpperCase().slice(0, 3);
  return profile.name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function loadCounters(): Record<string, number> {
  return read<Record<string, number>>(TICKET_COUNTER_KEY) ?? {};
}

function saveCounters(counters: Record<string, number>): void {
  write(TICKET_COUNTER_KEY, counters);
}

export function generateTicketId(profile: OrganizationProfile): string {
  const prefix = orgPrefix(profile);
  const date = todayStamp();
  const counters = loadCounters();
  const counterKey = `${profile.id}`;
  const next = (counters[counterKey] ?? 0) + 1;
  counters[counterKey] = next;
  saveCounters(counters);
  return `${prefix}-${date}-${String(next).padStart(4, "0")}`;
}

export function createTicketRecord(
  ticketId: string,
  orgId: string,
  rawMessage: string,
  subject: string | null
): TicketRecord {
  return {
    ticketId,
    orgId,
    createdAt: new Date().toISOString(),
    rawMessage,
    subject,
    classification: null,
    memoryMatch: null,
    draftSource: null,
    resolution: {
      finalResponse: null,
      humanEdited: false,
      editDistanceNote: null,
      resolvedAt: null,
    },
    reflection: {
      decision: null,
      lessonCreatedId: null,
      lessonReinforcedId: null,
      knowledgeChanged: null,
    },
    validationRecordIds: [],
    status: "open",
  };
}

export function updateTicketRecordStatus(
  record: TicketRecord,
  status: TicketRecordStatus
): TicketRecord {
  return { ...record, status };
}

export function loadTicketRecords(): TicketRecord[] {
  const stored = read<TicketRecord[]>(TICKET_RECORDS_KEY);
  return stored && Array.isArray(stored) ? stored : [];
}

export function saveTicketRecords(records: TicketRecord[]): void {
  write(TICKET_RECORDS_KEY, records);
}

export function clearTicketRecords(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(TICKET_RECORDS_KEY);
    window.localStorage.removeItem(TICKET_COUNTER_KEY);
  } catch {
    /* ignore */
  }
}

export function findTicketRecord(records: TicketRecord[], ticketId: string): TicketRecord | null {
  return records.find((r) => r.ticketId === ticketId) ?? null;
}

export function upsertTicketRecord(records: TicketRecord[], record: TicketRecord): TicketRecord[] {
  const idx = records.findIndex((r) => r.ticketId === record.ticketId);
  if (idx >= 0) {
    const next = [...records];
    next[idx] = record;
    return next;
  }
  return [...records, record];
}

export function searchTicketRecords(
  records: TicketRecord[],
  query: string
): TicketRecord[] {
  const q = query.toLowerCase().trim();
  if (!q) return [...records].reverse();
  return records
    .filter((r) => {
      const haystack = [
        r.ticketId,
        r.rawMessage,
        r.subject ?? "",
        r.classification?.category ?? "",
        r.classification?.canonicalProblem ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    })
    .reverse();
}

export type CaseFilterChip = "all" | "heavily_edited" | "cold_start" | "uncategorized" | "rejected";

export function filterTicketRecords(
  records: TicketRecord[],
  chip: CaseFilterChip
): TicketRecord[] {
  switch (chip) {
    case "heavily_edited":
      return records.filter((r) => r.resolution.humanEdited);
    case "cold_start":
      return records.filter(
        (r) => r.memoryMatch?.matchType === "none" || r.draftSource === "no_template"
      );
    case "uncategorized":
      return records.filter(
        (r) =>
          r.classification?.classifiedBy === "llm_fallback" ||
          r.classification?.category === "Uncategorized" ||
          r.classification?.category === "General"
      );
    case "rejected":
      return records.filter((r) => r.status === "rejected");
    default:
      return records;
  }
}

export function computeEditDistance(original: string, edited: string): string | null {
  if (!original || !edited) return null;
  if (original === edited) return null;
  const origWords = original.split(/\s+/).length;
  const editedWords = edited.split(/\s+/).length;
  const diff = Math.abs(editedWords - origWords);
  const pct = origWords > 0 ? Math.round((diff / origWords) * 100) : 0;
  if (pct < 5) return null;
  return `~${pct}% word-level change (${origWords} -> ${editedWords} words)`;
}
