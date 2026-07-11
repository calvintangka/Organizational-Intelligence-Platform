import type { OrganizationProfile, TicketRecord, TicketRecordStatus } from "@/types";

const STORAGE_VERSION = "v2";
const ISOLATED_STORAGE_VERSION = "v1";
const TICKET_RECORDS_KEY = `oip.ticketRecords.${STORAGE_VERSION}`;
const TICKET_COUNTER_KEY = `oip.ticketCounter.${STORAGE_VERSION}`;
const MIGRATION_KEY = "oip.organizationIsolationMigration.v1";

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function read<T>(key: string): T | null {
  if (!hasStorage()) return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

function hasLegacyTicketFallback(organizationId?: string): boolean {
  if (!organizationId || !hasStorage()) return false;
  try {
    const raw = window.localStorage.getItem(MIGRATION_KEY);
    if (!raw) return false;
    const state = JSON.parse(raw) as {
      organizations?: Record<string, { resources?: { tickets?: { status?: string } } }>;
    };
    return state.organizations?.[organizationId]?.resources?.tickets?.status === "fallback";
  } catch {
    return false;
  }
}

function write(key: string, value: unknown): void {
  if (!hasStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function resolveStorageKey(baseKey: string, organizationId?: string): string {
  if (!organizationId) return baseKey;
  const resource = baseKey.replace(/^oip\./, "").replace(`.${STORAGE_VERSION}`, "");
  return `oip.organization.${encodeURIComponent(organizationId)}.${resource}.${ISOLATED_STORAGE_VERSION}`;
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

function loadCounters(organizationId?: string): Record<string, number> {
  const scoped = read<number>(resolveStorageKey(TICKET_COUNTER_KEY, organizationId));
  if (organizationId && typeof scoped === "number") return { [organizationId]: scoped };
  return read<Record<string, number>>(resolveStorageKey(TICKET_COUNTER_KEY, organizationId)) ?? {};
}

function saveCounters(counters: Record<string, number>, organizationId?: string): void {
  if (organizationId) write(resolveStorageKey(TICKET_COUNTER_KEY, organizationId), counters[organizationId] ?? 0);
  else write(TICKET_COUNTER_KEY, counters);
}

export function generateTicketId(profile: OrganizationProfile): string {
  const prefix = orgPrefix(profile);
  const date = todayStamp();
  const counters = loadCounters(profile.id);
  const counterKey = `${profile.id}`;
  const next = (counters[counterKey] ?? 0) + 1;
  counters[counterKey] = next;
  saveCounters(counters, profile.id);
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

export async function loadTicketRecords(organizationId?: string): Promise<TicketRecord[]> {
  const scoped = read<TicketRecord[]>(resolveStorageKey(TICKET_RECORDS_KEY, organizationId));
  const stored = scoped ?? (hasLegacyTicketFallback(organizationId) ? read<TicketRecord[]>(TICKET_RECORDS_KEY) : null);
  const records = stored && Array.isArray(stored) ? stored : [];
  return organizationId && scoped === null && hasLegacyTicketFallback(organizationId)
    ? records.map((record) => ({ ...record, orgId: organizationId }))
    : records;
}

export async function saveTicketRecords(
  organizationId: string | undefined,
  records: TicketRecord[]
): Promise<void> {
  write(resolveStorageKey(TICKET_RECORDS_KEY, organizationId), records);
}

export function clearTicketRecords(organizationId?: string): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(resolveStorageKey(TICKET_RECORDS_KEY, organizationId));
    window.localStorage.removeItem(resolveStorageKey(TICKET_COUNTER_KEY, organizationId));
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

export type CaseFilterChip = "all" | "heavily_edited" | "cold_start" | "uncategorized" | "rejected" | "discarded";

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
    case "discarded":
      return records.filter((r) => r.status === "discarded");
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
