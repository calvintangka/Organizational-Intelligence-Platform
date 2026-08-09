import "server-only";

import { prisma } from "@/lib/server/prisma";

/**
 * RSS-1.2S2 — rate-limit counter stores.
 *
 * Production enforcement uses `PostgresRateLimitStore`, which is shared across
 * application instances and survives restarts. The atomic primitive is an
 * `INSERT ... ON CONFLICT DO UPDATE` against the composite primary key
 * `(policyKey, dimensionKey, windowStart)`: concurrent increments cannot lose
 * updates, so a window limit can never be exceeded by racing requests.
 *
 * `MemoryRateLimitStore` exists for deterministic tests and as a fault-injection
 * seam; it is never the production enforcement store.
 */

export interface RateLimitIncrement {
  policyKey: string;
  dimensionKey: string;
  windowStart: Date;
  cost: number;
}

export interface RateLimitStore {
  increment(input: RateLimitIncrement): Promise<number>;
  reset(policyKey: string, dimensionKey: string, windowStart?: Date): Promise<void>;
  cleanup(before: Date): Promise<{ counters: number; events: number }>;
  health(): Promise<boolean>;
}

export class PostgresRateLimitStore implements RateLimitStore {
  async increment({ policyKey, dimensionKey, windowStart, cost }: RateLimitIncrement): Promise<number> {
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO rate_limit_counters ("policyKey", "dimensionKey", "windowStart", count, "updatedAt")
      VALUES (${policyKey}, ${dimensionKey}, ${windowStart}, ${cost}, NOW())
      ON CONFLICT ("policyKey", "dimensionKey", "windowStart")
      DO UPDATE SET count = rate_limit_counters.count + ${cost}, "updatedAt" = NOW()
      RETURNING count
    `;
    return rows[0]?.count ?? 0;
  }

  async reset(policyKey: string, dimensionKey: string, windowStart?: Date): Promise<void> {
    if (windowStart) {
      await prisma.$executeRaw`
        DELETE FROM rate_limit_counters
        WHERE "policyKey" = ${policyKey} AND "dimensionKey" = ${dimensionKey} AND "windowStart" = ${windowStart}
      `;
    } else {
      await prisma.$executeRaw`
        DELETE FROM rate_limit_counters
        WHERE "policyKey" = ${policyKey} AND "dimensionKey" = ${dimensionKey}
      `;
    }
  }

  async cleanup(before: Date): Promise<{ counters: number; events: number }> {
    const countersResult = await prisma.$executeRaw`
      DELETE FROM rate_limit_counters WHERE "windowStart" < ${before}
    `;
    const eventsBefore = new Date(before.getTime());
    const eventsResult = await prisma.$executeRaw`
      DELETE FROM rate_limit_events WHERE "createdAt" < ${eventsBefore}
    `;
    return {
      counters: Number(countersResult ?? 0),
      events: Number(eventsResult ?? 0)
    };
  }

  async health(): Promise<boolean> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

export class MemoryRateLimitStore implements RateLimitStore {
  private counters = new Map<string, { windowStart: number; count: number }>();

  private static key(policyKey: string, dimensionKey: string, windowStart: Date): string {
    return `${policyKey}:${dimensionKey}:${windowStart.getTime()}`;
  }

  async increment({ policyKey, dimensionKey, windowStart, cost }: RateLimitIncrement): Promise<number> {
    const key = MemoryRateLimitStore.key(policyKey, dimensionKey, windowStart);
    const existing = this.counters.get(key);
    const count = (existing?.count ?? 0) + cost;
    this.counters.set(key, { windowStart: windowStart.getTime(), count });
    return count;
  }

  async reset(policyKey: string, dimensionKey: string, windowStart?: Date): Promise<void> {
    if (windowStart) {
      this.counters.delete(MemoryRateLimitStore.key(policyKey, dimensionKey, windowStart));
      return;
    }
    for (const [key] of this.counters) {
      if (key.startsWith(`${policyKey}:${dimensionKey}:`)) this.counters.delete(key);
    }
  }

  async cleanup(before: Date): Promise<{ counters: number; events: number }> {
    const beforeMs = before.getTime();
    let counters = 0;
    for (const [key, entry] of this.counters) {
      if (entry.windowStart < beforeMs) {
        this.counters.delete(key);
        counters += 1;
      }
    }
    return { counters, events: 0 };
  }

  async health(): Promise<boolean> {
    return true;
  }
}
