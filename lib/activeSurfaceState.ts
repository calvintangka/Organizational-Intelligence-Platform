export const ACTIVE_SURFACES = [
  "home",
  "tickets",
  "cases",
  "knowledge",
  "dashboard",
  "operations"
] as const;

export type PersistedActiveSurface = (typeof ACTIVE_SURFACES)[number];

export const ACTIVE_SURFACE_STORAGE_PREFIX = "oip.active-surface.v1:";

export function activeSurfaceStorageKey(organizationId: string): string {
  return `${ACTIVE_SURFACE_STORAGE_PREFIX}${encodeURIComponent(organizationId)}`;
}

export function isPersistedActiveSurface(value: unknown): value is PersistedActiveSurface {
  return typeof value === "string" && (ACTIVE_SURFACES as readonly string[]).includes(value);
}

export function restoreActiveSurface(value: unknown): PersistedActiveSurface {
  return isPersistedActiveSurface(value) ? value : "home";
}
