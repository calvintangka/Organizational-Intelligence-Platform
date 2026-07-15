/**
 * Runtime boundary for organization-scoped persistence. TypeScript callers must
 * provide a string, while this guard also rejects invalid values from JavaScript,
 * stale browser state, and future transport boundaries.
 */
export function requireOrganizationId(organizationId: string, operation: string): string {
  if (typeof organizationId !== "string" || organizationId.trim().length === 0) {
    throw new Error(`${operation} requires a non-empty organizationId.`);
  }
  return organizationId;
}
