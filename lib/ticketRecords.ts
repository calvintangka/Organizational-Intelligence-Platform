import type { OrganizationProfile, TicketRecord, TicketRecordStatus } from "@/types";
import { hasRuntimeLegacyFallback } from "@/lib/orgMemory";
import { requireOrganizationId } from "@/lib/organizationId";

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

type TicketFallbackResource = "tickets" | "ticketCounter";

function hasPersistedLegacyTicketFallback(
  organizationId: string,
  resource: TicketFallbackResource
): boolean {
  try {
    const raw = window.localStorage.getItem(MIGRATION_KEY);
    if (!raw) return false;
    const state = JSON.parse(raw) as {
      legacyOwnerOrganizationId?: string;
      legacyOwnershipStatus?: string;
      organizationId?: string;
      organizations?: Record<string, {
        legacyImportSuppressed?: boolean;
        resources?: Record<string, { status?: string }>;
      }>;
    };
    if (state.legacyOwnershipStatus === "ambiguous") return false;
    const ownerId = state.legacyOwnerOrganizationId ?? state.organizationId;
    if (ownerId !== organizationId) return false;
    if (state.organizations?.[organizationId]?.legacyImportSuppressed === true) return false;
    return state.organizations?.[organizationId]?.resources?.[resource]?.status === "fallback";
  } catch {
    return false;
  }
}

function hasLegacyTicketFallback(
  organizationId: string,
  resource: TicketFallbackResource
): boolean {
  if (!hasStorage()) return false;
  return hasPersistedLegacyTicketFallback(organizationId, resource)
    || hasRuntimeLegacyFallback(organizationId, resource);
}

function hasLegacyTicketCounterFallback(organizationId: string): boolean {
  return hasLegacyTicketFallback(organizationId, "ticketCounter");
}

function write(key: string, value: unknown): void {
  if (!hasStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function writeTicketCounter(key: string, value: number): void {
  if (!hasStorage()) {
    throw new Error("Ticket counter could not be saved because browser storage is unavailable. No ticket ID was allocated.");
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    const candidate = error as { name?: string; code?: number; message?: string } | null;
    if (candidate?.name === "QuotaExceededError"
      || candidate?.code === 22
      || candidate?.code === 1014
      || candidate?.message?.toLowerCase().includes("quota") === true) {
      throw new Error("Ticket counter could not be saved because browser storage is full. No ticket ID was allocated; retry after storage recovers.");
    }
    throw error;
  }
}

function resolveScopedStorageKey(baseKey: string, organizationId: string): string {
  requireOrganizationId(organizationId, "Ticket storage key resolution");
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

function loadCounters(organizationId: string): Record<string, number> {
  requireOrganizationId(organizationId, "Ticket counter lookup");
  const scoped = read<number>(resolveScopedStorageKey(TICKET_COUNTER_KEY, organizationId));
  if (typeof scoped === "number") return { [organizationId]: scoped };
  // C-1/D-1: preserve the legacy counter while this organization remains on
  // persisted or runtime migration fallback.
  if (scoped === null && hasLegacyTicketCounterFallback(organizationId)) {
    const legacy = read<Record<string, number>>(TICKET_COUNTER_KEY);
    return legacy ? { [organizationId]: legacy[organizationId] ?? 0 } : {};
  }
  return {};
}

function saveCounters(counters: Record<string, number>, organizationId: string): void {
  requireOrganizationId(organizationId, "Ticket counter persistence");
  writeTicketCounter(resolveScopedStorageKey(TICKET_COUNTER_KEY, organizationId), counters[organizationId] ?? 0);
}

export function generateTicketIds(profile: OrganizationProfile, count: number): string[] {
  const organizationId = requireOrganizationId(profile.id, "Ticket ID generation");
  if (count <= 0) return [];
  const prefix = orgPrefix(profile);
  const date = todayStamp();
  const counters = loadCounters(organizationId);
  const counterKey = organizationId;
  const first = (counters[counterKey] ?? 0) + 1;
  counters[counterKey] = first + count - 1;
  saveCounters(counters, organizationId);
  return Array.from({ length: count }, (_, index) =>
    `${prefix}-${date}-${String(first + index).padStart(4, "0")}`
  );
}

export function generateTicketId(profile: OrganizationProfile): string {
  return generateTicketIds(profile, 1)[0];
}

export function createTicketRecord(
  ticketId: string,
  orgId: string,
  rawMessage: string,
  subject: string | null
): TicketRecord {
  requireOrganizationId(orgId, "Ticket record creation");
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

export async function loadTicketRecords(organizationId: string): Promise<TicketRecord[]> {
  requireOrganizationId(organizationId, "loadTicketRecords");
  const scoped = read<TicketRecord[]>(resolveScopedStorageKey(TICKET_RECORDS_KEY, organizationId));
  const legacyFallback = hasLegacyTicketFallback(organizationId, "tickets");
  const stored = scoped ?? (legacyFallback ? read<TicketRecord[]>(TICKET_RECORDS_KEY) : null);
  const records = stored && Array.isArray(stored) ? stored : [];
  return scoped === null && legacyFallback
    ? records.map((record) => ({ ...record, orgId: organizationId }))
    : records;
}

export async function saveTicketRecords(
  organizationId: string,
  records: TicketRecord[]
): Promise<void> {
  requireOrganizationId(organizationId, "saveTicketRecords");
  const scopedKey = resolveScopedStorageKey(TICKET_RECORDS_KEY, organizationId);
  if (records.length === 0 && read<TicketRecord[]>(scopedKey) === null
    && hasLegacyTicketFallback(organizationId, "tickets")) {
    const legacy = read<TicketRecord[]>(TICKET_RECORDS_KEY);
    if (legacy && legacy.length > 0) {
      // D-1: never replace readable runtime-fallback tickets with an empty
      // scoped array; reset suppression disables this guard for real resets.
      return;
    }
  }
  write(scopedKey, records);
}

export function clearTicketRecords(organizationId: string): void {
  requireOrganizationId(organizationId, "clearTicketRecords");
  if (!hasStorage()) return;
  window.localStorage.removeItem(resolveScopedStorageKey(TICKET_RECORDS_KEY, organizationId));
  window.localStorage.removeItem(resolveScopedStorageKey(TICKET_COUNTER_KEY, organizationId));
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
