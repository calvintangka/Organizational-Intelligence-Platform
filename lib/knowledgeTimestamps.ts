/**
 * TODO-020 — shared, read-only timestamp validation and display fallback for
 * KnowledgeItem lifecycle dates.
 *
 * Some legacy/mature KnowledgeItems carry a sentinel `lastUpdatedAt` equal to
 * the Unix epoch (1970-01-01T00:00:00.000Z) even though newer, legitimate
 * validation/approval timestamps exist. A plain `??` chain does NOT rescue this
 * because the epoch value is present and (technically) a valid Date — it is just
 * meaningless. These helpers treat epoch/sentinel/invalid/missing values as
 * "not a real timestamp" and fall back to the best legitimate lifecycle date.
 *
 * This module is purely a READ/DISPLAY concern: it never mutates, backfills, or
 * rewrites any persisted timestamp or historical audit record.
 */

const DISPLAY_DATE_OPTIONS: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

/**
 * A timestamp is legitimate only when it parses to a real calendar time strictly
 * after the Unix epoch. This rejects:
 *  - null / undefined / empty,
 *  - unparseable strings (Invalid Date),
 *  - the epoch sentinel 1970-01-01T00:00:00.000Z and any pre-epoch value.
 * It deliberately does NOT reject merely-old but valid dates (any real date > epoch passes).
 */
export function isLegitimateTimestamp(value: string | number | Date | null | undefined): boolean {
  if (value === null || value === undefined || value === "") return false;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return !Number.isNaN(time) && time > 0;
}

/**
 * Returns the first legitimate timestamp from the ordered candidates, or null
 * when none is trustworthy. Order should express lifecycle authority, e.g.
 * [lastUpdated, lastValidated, approvedAt, createdAt].
 */
export function resolveLegitimateTimestamp(
  candidates: Array<string | number | Date | null | undefined>
): string | null {
  for (const candidate of candidates) {
    if (isLegitimateTimestamp(candidate)) {
      return candidate instanceof Date ? candidate.toISOString() : String(candidate);
    }
  }
  return null;
}

/**
 * Formats the best legitimate lifecycle timestamp for display. When no candidate
 * is trustworthy it returns a neutral label ("Unknown" by default) — it never
 * emits "Invalid Date" and never fabricates the current time.
 */
export function formatLastUpdatedDisplay(
  candidates: Array<string | number | Date | null | undefined>,
  fallbackLabel = "Unknown",
  locale = "en-GB"
): string {
  const resolved = resolveLegitimateTimestamp(candidates);
  return resolved ? new Date(resolved).toLocaleDateString(locale, DISPLAY_DATE_OPTIONS) : fallbackLabel;
}
