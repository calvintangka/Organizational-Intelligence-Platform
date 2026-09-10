export interface ReflectionValidationAttemptContext {
  ticketId: string;
  attempt: number;
  requestId: string;
  idempotencyKey: string;
}

export interface ReflectionValidationLifecycle {
  inFlight: boolean;
  attempt: number;
  ticketId: string | null;
  context: ReflectionValidationAttemptContext | null;
  retryable: boolean;
}

export function createReflectionValidationLifecycle(): ReflectionValidationLifecycle {
  return {
    inFlight: false,
    attempt: 0,
    ticketId: null,
    context: null,
    retryable: false
  };
}

function attemptNonce(): string {
  const runtimeCrypto = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (runtimeCrypto && typeof runtimeCrypto.randomUUID === "function") return runtimeCrypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Start one explicit human Reflection validation attempt.
 *
 * A second click while the attempt is active is ignored by returning null.
 * A retryable post-dispatch failure reuses its context so a lost response can
 * safely replay the same server idempotency key. Client-side rejection clears
 * that context through markReflectionValidationRejected, so correction always
 * receives a new validation identity.
 */
export function beginReflectionValidationAttempt(
  lifecycle: ReflectionValidationLifecycle,
  ticketId: string
): ReflectionValidationAttemptContext | null {
  if (lifecycle.inFlight) return null;
  if (lifecycle.retryable && lifecycle.ticketId === ticketId && lifecycle.context) {
    lifecycle.inFlight = true;
    return lifecycle.context;
  }

  const attempt = lifecycle.attempt + 1;
  const nonce = attemptNonce();
  const context: ReflectionValidationAttemptContext = {
    ticketId,
    attempt,
    requestId: `reflection-${ticketId}-${attempt}-${nonce}`,
    idempotencyKey: `reflection:${ticketId}:${attempt}:${nonce}`
  };
  lifecycle.attempt = attempt;
  lifecycle.ticketId = ticketId;
  lifecycle.context = context;
  lifecycle.retryable = false;
  lifecycle.inFlight = true;
  return context;
}

export function markReflectionValidationRejected(lifecycle: ReflectionValidationLifecycle): void {
  lifecycle.inFlight = false;
  lifecycle.ticketId = null;
  lifecycle.context = null;
  lifecycle.retryable = false;
}

export function markReflectionValidationSucceeded(lifecycle: ReflectionValidationLifecycle): void {
  lifecycle.inFlight = false;
  lifecycle.ticketId = null;
  lifecycle.context = null;
  lifecycle.retryable = false;
}

export function markReflectionValidationRetryable(lifecycle: ReflectionValidationLifecycle): void {
  lifecycle.inFlight = false;
  lifecycle.retryable = lifecycle.context !== null;
}

export function releaseReflectionValidationAttempt(lifecycle: ReflectionValidationLifecycle): void {
  lifecycle.inFlight = false;
}

export function resetReflectionValidationLifecycle(lifecycle: ReflectionValidationLifecycle): void {
  lifecycle.inFlight = false;
  lifecycle.ticketId = null;
  lifecycle.context = null;
  lifecycle.retryable = false;
}
