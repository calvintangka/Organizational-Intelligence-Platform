import "server-only";

import { createHmac, randomUUID } from "node:crypto";

import { rateLimitHashSecret } from "./policies";

/**
 * RSS-1.2S2 — privacy-preserving limiter keys and client-address extraction.
 *
 * No raw email address, raw network address, or raw identifier is ever stored
 * in a rate-limit record. Every dimension is digested with a keyed HMAC-SHA256
 * using the server-only `RATE_LIMIT_HASH_SECRET`, so the stored key is stable
 * within a policy lifetime and resistant to offline reversal. Rotating the
 * secret invalidates old digests (counters effectively reset), which is the
 * documented rotation behavior.
 */

/** A protected dimension: what is being limited (user, organization, account, ip, source). */
export interface RateLimitDimension {
  type: string;
  value: string;
}

export function hashDimensionValue(value: string): string {
  return createHmac("sha256", rateLimitHashSecret()).update(value).digest("hex");
}

/** Stable stored key for a dimension type + value. */
export function dimensionKey(type: string, value: string): string {
  return `${type}:${hashDimensionValue(value)}`;
}

/**
 * Client-address extraction.
 *
 * The application never blindly trusts a client-supplied `X-Forwarded-For`.
 * Only when `RATE_LIMIT_TRUST_PROXY=true` (the operator has confirmed every
 * hop in front of the application is a trusted reverse proxy) is the first
 * (original-client) entry of `X-Forwarded-For` used. Otherwise `x-real-ip`
 * (set by the immediate trusted proxy) is preferred. When no trustworthy
 * address exists, `null` is returned; callers then rely on account/user/
 * organization limits and treat the network dimension as reduced-confidence.
 */
export function getClientAddress(request: Request): string | null {
  const trustProxy = process.env.RATE_LIMIT_TRUST_PROXY === "true";
  if (trustProxy) {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
      const first = forwardedFor.split(",")[0]?.trim();
      if (first) return first;
    }
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return null;
}

/** Stable non-identifying address dimension; randomizes when unknown so IP
 *  limiting degrades safely instead of collapsing every client into one bucket. */
export function addressDimension(request: Request): RateLimitDimension {
  const address = getClientAddress(request);
  return { type: "ip", value: address ?? `unknown:${randomUUID()}` };
}
