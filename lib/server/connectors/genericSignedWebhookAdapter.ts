import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { ConnectorError, type ConnectorAdapter, type ConnectorInstallationConfiguration, type ExternalWorkSignal } from "@/lib/application/connectors/types";

const MAX_TEXT_LENGTH = 10_000;
const DEFAULT_REPLAY_WINDOW_SECONDS = 300;

function text(value: unknown, maxLength = 500): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}

function stripHtml(value: string): string {
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseBody(rawBody: string): Record<string, unknown> {
  try {
    const value = JSON.parse(rawBody) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new ConnectorError("MALFORMED_EVENT", "The webhook payload is not valid JSON.", 400); }
}

export const genericSignedWebhookAdapter: ConnectorAdapter = {
  type: "generic.signed_webhook",
  version: 1,
  capabilities: ["webhook_inbound", "ticket_created", "ticket_updated", "polling_foundation"],
  verifyConfiguration(configuration: unknown): ConnectorInstallationConfiguration {
    if (configuration !== undefined && (!configuration || typeof configuration !== "object" || Array.isArray(configuration))) throw new ConnectorError("INVALID_CONFIGURATION", "Connector configuration must be an object.", 400);
    const record = (configuration ?? {}) as Record<string, unknown>;
    const accepted = Array.isArray(record.acceptedEventTypes) ? record.acceptedEventTypes.filter((item): item is string => item === "ticket.created" || item === "ticket.updated") : ["ticket.created", "ticket.updated"];
    const replayWindowSeconds = typeof record.replayWindowSeconds === "number" && Number.isInteger(record.replayWindowSeconds) && record.replayWindowSeconds >= 30 && record.replayWindowSeconds <= 3600 ? record.replayWindowSeconds : DEFAULT_REPLAY_WINDOW_SECONDS;
    return { acceptedEventTypes: accepted.length ? accepted : ["ticket.created", "ticket.updated"], replayWindowSeconds };
  },
  async verifyInboundRequest({ rawBody, headers, credential, configuration, now }) {
    const contentType = headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) throw new ConnectorError("MALFORMED_EVENT", "Webhook requests must use application/json.", 415);
    const timestamp = headers.get("x-oip-timestamp");
    const signature = headers.get("x-oip-signature");
    if (!timestamp || !signature) throw new ConnectorError("INVALID_SIGNATURE", "Webhook authentication headers are required.", 401);
    const seconds = Number(timestamp);
    if (!Number.isInteger(seconds)) throw new ConnectorError("EXPIRED_TIMESTAMP", "Webhook timestamp is invalid.", 401);
    const body = parseBody(rawBody);
    if (Math.abs(now.getTime() - seconds * 1000) > (configuration.replayWindowSeconds ?? DEFAULT_REPLAY_WINDOW_SECONDS) * 1000) throw new ConnectorError("EXPIRED_TIMESTAMP", "Webhook timestamp is outside the accepted replay window.", 401);
    const expected = createHmac("sha256", credential.signingSecret).update(`${timestamp}.${rawBody}`).digest("hex");
    const supplied = signature.replace(/^sha256=/i, "");
    const expectedBuffer = Buffer.from(expected, "hex");
    const suppliedBuffer = /^[a-f0-9]{64}$/i.test(supplied) ? Buffer.from(supplied, "hex") : Buffer.alloc(expectedBuffer.length);
    if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) throw new ConnectorError("INVALID_SIGNATURE", "Webhook signature verification failed.", 401);
    const eventId = text(body.id, 200);
    const eventType = text(body.eventType, 100);
    if (!eventId || !eventType) throw new ConnectorError("MALFORMED_EVENT", "Webhook event id and type are required.", 400);
    return { eventId, eventType, sourceTimestamp: new Date(seconds * 1000) };
  },
  normalizeInboundEvent({ rawBody, installationId }): ExternalWorkSignal {
    const body = parseBody(rawBody);
    const eventId = text(body.id, 200);
    const eventType = text(body.eventType, 100);
    const object = body.object && typeof body.object === "object" && !Array.isArray(body.object) ? body.object as Record<string, unknown> : null;
    const externalObjectId = object ? text(object.id, 200) : undefined;
    const message = object ? text(object.message, MAX_TEXT_LENGTH) : undefined;
    const sanitizedMessage = message ? stripHtml(message) : "";
    if (!object || !eventId || (eventType !== "ticket.created" && eventType !== "ticket.updated") || !externalObjectId || !sanitizedMessage) throw new ConnectorError(eventType ? "MALFORMED_EVENT" : "UNSUPPORTED_EVENT", "The webhook does not contain a supported ticket work signal.", 400);
    const requester = object.requester && typeof object.requester === "object" && !Array.isArray(object.requester) ? object.requester as Record<string, unknown> : {};
    const updatedAt = text(object.updatedAt, 64);
    const createdAt = text(object.createdAt, 64) ?? new Date().toISOString();
    const safeDate = (value: string) => Number.isNaN(new Date(value).getTime()) ? undefined : new Date(value).toISOString();
    const tags = Array.isArray(object.tags) ? object.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim().slice(0, 80)).filter(Boolean).slice(0, 30) : [];
    return { source: "generic.signed_webhook", connectorInstallationId: installationId, externalObjectType: "ticket", externalObjectId, externalEventId: eventId, eventType, externalVersion: text(object.version, 100), subject: text(object.subject, 500), message: sanitizedMessage, requester: { name: text(requester.name, 200), email: text(requester.email, 320) }, status: text(object.status, 80), priority: text(object.priority, 80), tags, createdAt: safeDate(createdAt) ?? new Date().toISOString(), updatedAt: updatedAt ? safeDate(updatedAt) : undefined, sourceUrl: text(object.url, 2000), metadata: { sourceObjectVersion: text(object.version, 100) ?? "unknown" } };
  },
  async testConnection({ credential }) { return { ok: Boolean(credential.signingSecret), safeMessage: "Signing credential is configured." }; },
  async fetchChanges({ limit }) { return { events: [], nextCursor: { supported: true, requestedLimit: Math.max(1, Math.min(100, limit)) } }; }
};
