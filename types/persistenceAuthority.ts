/**
 * TODO-004 Batch 5.8 — per-organization persistence authority contract.
 *
 * The authority is durable and organization-scoped. A MISSING authority record
 * resolves to "local"; "server" is reached only through an explicit, verified
 * cutover. This contract is shared by the server authority service, the HTTP
 * routes, and the client adapter router.
 */
export type PersistenceAuthorityMode = "local" | "server";

/** Summary of the verified migration batch that a cutover is (or would be) bound to. */
export interface PersistenceAuthorityVerificationSummary {
  batchId: string;
  batchStatus: string;
  overallStatus: "passed" | "failed" | null;
  unresolvedConflictCount: number;
  verifiedCheckpointCount: number;
  totalCheckpointCount: number;
  verificationCompletedAt: string | null;
}

/** Durable authority state for one organization. */
export interface PersistenceAuthorityState {
  organizationId: string;
  authority: PersistenceAuthorityMode;
  previousAuthority: PersistenceAuthorityMode | null;
  migrationBatchId: string | null;
  reason: string | null;
  cutoverAt: string | null;
  updatedAt: string | null;
  /** False when no durable row exists yet (safe default local). */
  hasRecord: boolean;
  /** Verification summary of the bound migration batch, when present. */
  verification: PersistenceAuthorityVerificationSummary | null;
}

/** Result of an explicit cutover request. */
export interface PersistenceCutoverResult {
  organizationId: string;
  authority: PersistenceAuthorityMode;
  migrationBatchId: string | null;
  cutoverAt: string | null;
  /** True when the cutover already existed for this exact batch (safe no-op). */
  idempotent: boolean;
  state: PersistenceAuthorityState;
}
