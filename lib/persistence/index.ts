import { LocalStorageAdapter } from "@/lib/persistence/localStorageAdapter";
import type { PersistenceAdapter } from "@/lib/persistence/adapter";
import { ServerPersistenceAdapter } from "@/lib/persistence/serverPersistenceAdapter";

export type PersistenceMode = "local" | "server";

export function createPersistenceAdapter(mode?: string): PersistenceAdapter {
  const configured = (mode ?? process.env.NEXT_PUBLIC_OIP_PERSISTENCE_MODE ?? "local").trim().toLowerCase();
  if (configured === "local") return new LocalStorageAdapter();
  if (configured === "server") return new ServerPersistenceAdapter();
  throw new Error(`Unsupported OIP persistence mode: ${configured}. Use "local" or "server".`);
}

// Local remains the explicit default. Server mode is opt-in via the
// non-secret NEXT_PUBLIC_OIP_PERSISTENCE_MODE environment variable.
export const persistence: PersistenceAdapter = createPersistenceAdapter();
export const persistenceMode: PersistenceMode = persistence instanceof ServerPersistenceAdapter ? "server" : "local";

export function getPersistenceAdapter(): PersistenceAdapter {
  return persistence;
}

export { LocalStorageAdapter } from "@/lib/persistence/localStorageAdapter";
export { ServerPersistenceAdapter } from "@/lib/persistence/serverPersistenceAdapter";
export type { PersistenceAdapter, PersistencePreparationResult } from "@/lib/persistence/adapter";
