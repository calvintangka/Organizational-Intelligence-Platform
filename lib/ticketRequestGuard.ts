/**
 * Monotonic guard for async ticket work. A newer ticket, reset, or organization
 * switch invalidates older work without introducing module-level mutable state.
 */
export class TicketRequestGuard {
  private generation = 0;

  begin(): number {
    this.generation += 1;
    return this.generation;
  }

  cancel(): void {
    this.generation += 1;
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation;
  }
}
