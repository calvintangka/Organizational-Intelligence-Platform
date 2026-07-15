import { LocalStorageAdapter } from "@/lib/persistence/localStorageAdapter";
import type { PersistenceAdapter } from "@/lib/persistence/adapter";

// Batch 2 intentionally has exactly one active runtime adapter.
export const persistence: PersistenceAdapter = new LocalStorageAdapter();

export function getPersistenceAdapter(): PersistenceAdapter {
  return persistence;
}

export { LocalStorageAdapter } from "@/lib/persistence/localStorageAdapter";
export type { PersistenceAdapter, PersistencePreparationResult } from "@/lib/persistence/adapter";
