import type { OrganizationProfile } from "@/types";

/**
 * Pure ticket ID formatting shared by the localStorage counter and the
 * server-side TicketSequence allocator. No storage access lives here so both
 * persistence modes produce byte-identical ticket IDs (e.g. MT-20260715-0075).
 */

export function organizationTicketPrefix(
  profile: Pick<OrganizationProfile, "name" | "logoInitials">
): string {
  if (profile.logoInitials?.trim()) return profile.logoInitials.trim().toUpperCase().slice(0, 3);
  return profile.name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function ticketDateStamp(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function formatTicketId(prefix: string, dateStamp: string, sequenceNumber: number): string {
  return `${prefix}-${dateStamp}-${String(sequenceNumber).padStart(4, "0")}`;
}

/** Format `count` consecutive IDs ending at `lastSequenceNumber` (inclusive). */
export function formatTicketIdRange(
  prefix: string,
  dateStamp: string,
  lastSequenceNumber: number,
  count: number
): string[] {
  const first = lastSequenceNumber - count + 1;
  return Array.from({ length: count }, (_, index) => formatTicketId(prefix, dateStamp, first + index));
}

export interface ParsedTicketId {
  prefix: string;
  dateStamp: string;
  sequenceNumber: number;
}

/**
 * Parse only the ticket format emitted by formatTicketId. A malformed ID
 * returns null rather than silently contributing sequence zero to migration.
 */
export function parseTicketId(value: unknown): ParsedTicketId | null {
  if (typeof value !== "string") return null;
  const match = /^([A-Za-z0-9]+)-(\d{8})-(\d{1,9})$/.exec(value);
  if (!match) return null;
  const [, prefix, dateStamp, sequenceText] = match;
  const year = Number(dateStamp.slice(0, 4));
  const month = Number(dateStamp.slice(4, 6));
  const day = Number(dateStamp.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const sequenceNumber = Number(sequenceText);
  if (!Number.isSafeInteger(sequenceNumber) || sequenceNumber < 0) return null;
  return { prefix, dateStamp, sequenceNumber };
}
