/**
 * Serializes full intelligence-log snapshot writes per organization.
 *
 * The UI can receive several log state updates during one workflow. Each
 * update is a complete snapshot, so overlapping PUTs must be ordered per
 * organization to avoid competing upsert/delete transactions. Different
 * organizations retain independent queues.
 */
export type OrganizationLogSaveOperation = () => Promise<void>;

export class OrganizationLogSaveQueue {
  private readonly chains = new Map<string, Promise<void>>();

  enqueue(organizationId: string, operation: OrganizationLogSaveOperation): Promise<void> {
    const previous = this.chains.get(organizationId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    this.chains.set(organizationId, next);

    const cleanup = () => {
      if (this.chains.get(organizationId) === next) this.chains.delete(organizationId);
    };
    // Attach rejection handling to the cleanup observer so callers still
    // receive the original failure while the queue remains usable.
    void next.then(cleanup, cleanup);

    return next;
  }
}
