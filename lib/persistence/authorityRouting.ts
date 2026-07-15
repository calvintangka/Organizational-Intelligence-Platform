import type {
  PersistenceAuthorityMode,
  PersistenceAuthorityState
} from "@/types/persistenceAuthority";

export type PersistenceAuthority = PersistenceAuthorityMode;

/**
 * Client-side durable evidence of previously-observed authorities, keyed by
 * organization id. This is ONLY consulted when the server authority endpoint is
 * unreachable, and only a cached `local` value is trusted (see policy below).
 */
const AUTHORITY_CACHE_KEY = "oip.persistenceAuthority.v1";

export class AuthorityDiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorityDiscoveryError";
  }
}

/**
 * Global env flag precedence:
 *   NEXT_PUBLIC_OIP_PERSISTENCE_MODE unset/"local" (default) -> local-first
 *   deployment. Every organization is local and NO authority round-trips are
 *   made. This preserves the byte-identical local default.
 *   NEXT_PUBLIC_OIP_PERSISTENCE_MODE="server" -> server-capable deployment.
 *   Per-organization authority is resolved from the durable server record; an
 *   organization is server-authoritative ONLY after an explicit verified cutover.
 */
export function globalPersistenceMode(): PersistenceAuthority {
  const configured = (process.env.NEXT_PUBLIC_OIP_PERSISTENCE_MODE ?? "local").trim().toLowerCase();
  return configured === "server" ? "server" : "local";
}

function readCache(): Record<string, PersistenceAuthority> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(AUTHORITY_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, PersistenceAuthority> : {};
  } catch {
    return {};
  }
}

function rememberAuthority(organizationId: string, authority: PersistenceAuthority): void {
  if (typeof window === "undefined") return;
  try {
    const map = readCache();
    map[organizationId] = authority;
    window.localStorage.setItem(AUTHORITY_CACHE_KEY, JSON.stringify(map));
  } catch {
    // A cache write failure must never break routing; the server record remains
    // the source of truth on the next reachable lookup.
  }
}

export function cachedAuthority(organizationId: string): PersistenceAuthority | undefined {
  return readCache()[organizationId];
}

/**
 * Resolve the durable authority for one organization before hydration.
 *
 * Authority-discovery failure policy (Batch 5.8): if the server authority
 * endpoint is unavailable we do NOT guess. We treat the organization as local
 * ONLY when durable client evidence proves it was local; otherwise hydration is
 * blocked with an explicit error so a server-authoritative organization can
 * never silently fork into localStorage.
 */
export async function resolveOrganizationAuthority(organizationId: string): Promise<PersistenceAuthority> {
  if (globalPersistenceMode() === "local") {
    rememberAuthority(organizationId, "local");
    return "local";
  }

  try {
    const response = await fetch(
      `/api/organizations/${encodeURIComponent(organizationId)}/persistence-authority`,
      { method: "GET", cache: "no-store", headers: { Accept: "application/json" } }
    );
    const payload = await response.json().catch(() => null) as { data?: PersistenceAuthorityState } | null;
    if (response.ok && payload && payload.data) {
      const authority: PersistenceAuthority = payload.data.authority === "server" ? "server" : "local";
      rememberAuthority(organizationId, authority);
      return authority;
    }
    // A not-yet-registered organization is not server-authoritative; it is a
    // safe local default (and durable client evidence going forward).
    if (response.status === 404) {
      rememberAuthority(organizationId, "local");
      return "local";
    }
    // Any other non-OK status is a discovery failure; fall through.
  } catch {
    // Network failure is a discovery failure; fall through.
  }

  const cached = cachedAuthority(organizationId);
  if (cached === "local") return "local";
  throw new AuthorityDiscoveryError(
    `Persistence authority for ${organizationId} could not be determined and no durable local evidence exists; hydration is blocked to avoid forking state.`
  );
}
