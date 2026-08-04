import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import type { AuthenticatedUser } from "@/lib/auth";
import { ConnectorError, type ConnectorStatus, type ConnectorType, type ExternalWorkSignal, isConnectorType } from "@/lib/application/connectors/types";
import { digestJobInput, initialJobProgress } from "@/lib/application/jobs/types";
import { processTicket, ProcessTicketError } from "@/lib/application/tickets/processTicket";
import type { AIAdapter } from "@/lib/ai/types";
import type { OrganizationPersistenceSession } from "@/lib/persistence/session";
import { createPersistenceContext } from "@/lib/persistence/context";
import { durableJobRepository } from "@/lib/server/jobs/jobRepository";
import { decryptCredential, encryptCredential } from "@/lib/server/connectors/credentialVault";
import { connectorAdapter } from "@/lib/server/connectors/registry";
import { prisma } from "@/lib/server/prisma";
import { startTelemetrySpan } from "@/lib/telemetry";

const MAX_WEBHOOK_BYTES = 256 * 1024;

function json(value: unknown): Prisma.InputJsonValue { return value as Prisma.InputJsonValue; }
function iso(value: Date | null | undefined) { return value?.toISOString(); }

function safeInstallation(row: { id: string; organizationId: string; connectorType: string; adapterVersion: number; name: string; status: string; configuration: Prisma.JsonValue; capabilities: Prisma.JsonValue; externalAccountId: string | null; externalWorkspaceId: string | null; cursor: Prisma.JsonValue | null; lastSyncAt: Date | null; lastSuccessAt: Date | null; lastFailureAt: Date | null; lastFailureSafe: string | null; createdAt: Date; updatedAt: Date; activeCredentialId: string | null }) {
  return { id: row.id, organizationId: row.organizationId, connectorType: row.connectorType, adapterVersion: row.adapterVersion, name: row.name, status: row.status, configuration: row.configuration, capabilities: row.capabilities, externalAccountId: row.externalAccountId, externalWorkspaceId: row.externalWorkspaceId, cursor: row.cursor, lastSyncAt: iso(row.lastSyncAt), lastSuccessAt: iso(row.lastSuccessAt), lastFailureAt: iso(row.lastFailureAt), lastFailureSafe: row.lastFailureSafe, credentialConfigured: Boolean(row.activeCredentialId), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function safeEvent(row: { id: string; organizationId: string; connectorInstallationId: string; connectorType: string; externalEventId: string; eventType: string; eventVersion: string | null; payloadDigest: string; receivedAt: Date; sourceTimestamp: Date | null; normalizedAt: Date | null; status: string; jobId: string | null; replayCount: number; safeMetadata: Prisma.JsonValue; errorClass: string | null; errorMessage: string | null; completedAt: Date | null; createdAt: Date; updatedAt: Date }) {
  return { id: row.id, organizationId: row.organizationId, connectorInstallationId: row.connectorInstallationId, connectorType: row.connectorType, externalEventId: row.externalEventId, eventType: row.eventType, eventVersion: row.eventVersion, payloadDigest: row.payloadDigest, receivedAt: row.receivedAt.toISOString(), sourceTimestamp: iso(row.sourceTimestamp), normalizedAt: iso(row.normalizedAt), status: row.status, jobId: row.jobId, replayCount: row.replayCount, safeMetadata: row.safeMetadata, errorClass: row.errorClass, errorMessage: row.errorMessage, completedAt: iso(row.completedAt), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function safeMetadata(signal: ExternalWorkSignal) {
  return { externalObjectType: signal.externalObjectType, externalObjectId: signal.externalObjectId, externalEventId: signal.externalEventId, eventType: signal.eventType, externalVersion: signal.externalVersion, tagCount: signal.tags.length, hasRequester: Boolean(signal.requester?.name || signal.requester?.email), hasAttachments: Boolean(signal.attachmentsMetadata?.length), sourceUrlPresent: Boolean(signal.sourceUrl) };
}

export async function createConnectorInstallation(input: { organizationId: string; user: AuthenticatedUser; connectorType: string; name: string; configuration?: unknown; signingSecret: string }) {
  if (!isConnectorType(input.connectorType)) throw new ConnectorError("UNKNOWN_CONNECTOR", "The requested connector type is not supported.", 400);
  if (!input.name.trim() || input.name.trim().length > 200) throw new ConnectorError("INVALID_CONFIGURATION", "A connector name is required.", 400);
  if (!input.signingSecret || input.signingSecret.length < 16 || input.signingSecret.length > 1024) throw new ConnectorError("INVALID_CONFIGURATION", "A signing secret between 16 and 1024 characters is required.", 400);
  const adapter = connectorAdapter(input.connectorType);
  const configuration = adapter.verifyConfiguration(input.configuration ?? {});
  const encryptedMaterial = encryptCredential({ signingSecret: input.signingSecret });
  const installation = await prisma.$transaction(async (tx) => {
    const created = await tx.connectorInstallation.create({ data: { organizationId: input.organizationId, connectorType: adapter.type, adapterVersion: adapter.version, name: input.name.trim(), status: "draft", configuration: json(configuration), capabilities: json(adapter.capabilities), createdBy: input.user.id } });
    const credential = await tx.connectorCredential.create({ data: { installationId: created.id, encryptedMaterial, createdBy: input.user.id } });
    return tx.connectorInstallation.update({ where: { id: created.id }, data: { activeCredentialId: credential.id } });
  });
  return safeInstallation(installation);
}

export async function listConnectorInstallations(organizationId: string) {
  const rows = await prisma.connectorInstallation.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
  return rows.map(safeInstallation);
}

export async function getConnectorInstallation(organizationId: string, installationId: string) {
  const row = await prisma.connectorInstallation.findFirst({ where: { id: installationId, organizationId } });
  if (!row) throw new ConnectorError("NOT_FOUND", "Connector installation was not found.", 404);
  return safeInstallation(row);
}

export async function setConnectorStatus(organizationId: string, installationId: string, status: Extract<ConnectorStatus, "active" | "paused" | "disabled" | "revoked">) {
  const current = await prisma.connectorInstallation.findFirst({ where: { id: installationId, organizationId }, include: { activeCredential: true } });
  if (!current) throw new ConnectorError("NOT_FOUND", "Connector installation was not found.", 404);
  if (status === "active" && (!current.activeCredentialId || current.activeCredential?.status !== "active")) throw new ConnectorError("INVALID_CONFIGURATION", "An active connector credential is required before activation.", 409);
  if (status === "revoked" && current.activeCredentialId) await prisma.connectorCredential.update({ where: { id: current.activeCredentialId }, data: { status: "revoked", revokedAt: new Date() } });
  return safeInstallation(await prisma.connectorInstallation.update({ where: { id: installationId }, data: { status, ...(status === "revoked" ? { lastFailureSafe: "Connector credential revoked." } : {}) } }));
}

export async function rotateConnectorSecret(organizationId: string, installationId: string, user: AuthenticatedUser, signingSecret: string) {
  if (!signingSecret || signingSecret.length < 16 || signingSecret.length > 1024) throw new ConnectorError("INVALID_CONFIGURATION", "A signing secret between 16 and 1024 characters is required.", 400);
  const current = await prisma.connectorInstallation.findFirst({ where: { id: installationId, organizationId } });
  if (!current) throw new ConnectorError("NOT_FOUND", "Connector installation was not found.", 404);
  const encryptedMaterial = encryptCredential({ signingSecret });
  const updated = await prisma.$transaction(async (tx) => {
    const credential = await tx.connectorCredential.create({ data: { installationId, encryptedMaterial, createdBy: user.id } });
    if (current.activeCredentialId) await tx.connectorCredential.update({ where: { id: current.activeCredentialId }, data: { status: "rotated", rotatedAt: new Date() } });
    return tx.connectorInstallation.update({ where: { id: installationId }, data: { activeCredentialId: credential.id, status: current.status === "revoked" ? "draft" : current.status, lastFailureSafe: null } });
  });
  return safeInstallation(updated);
}

export async function testConnectorInstallation(organizationId: string, installationId: string) {
  const installation = await prisma.connectorInstallation.findFirst({ where: { id: installationId, organizationId }, include: { activeCredential: true } });
  if (!installation) throw new ConnectorError("NOT_FOUND", "Connector installation was not found.", 404);
  if (!installation.activeCredential || installation.activeCredential.status !== "active") throw new ConnectorError("INVALID_CONFIGURATION", "No active connector credential is available.", 409);
  const result = await connectorAdapter(installation.connectorType).testConnection({ credential: decryptCredential(installation.activeCredential.encryptedMaterial) });
  return { ...result, installation: safeInstallation(installation) };
}

export async function listConnectorEvents(organizationId: string, installationId?: string) {
  const rows = await prisma.connectorInboundEvent.findMany({ where: { organizationId, ...(installationId ? { connectorInstallationId: installationId } : {}) }, orderBy: { receivedAt: "desc" }, take: 200 });
  return rows.map(safeEvent);
}

export async function receiveWebhook(installationId: string, request: { rawBody: string; headers: Headers }) {
  const latency = startTelemetrySpan("webhook_acknowledgement", "pipeline", { unit: "requests", tags: { connector: "generic.signed_webhook" } });
  try {
    if (Buffer.byteLength(request.rawBody, "utf8") > MAX_WEBHOOK_BYTES) throw new ConnectorError("MALFORMED_EVENT", "Webhook payload exceeds the 256 KB limit.", 413);
    const installation = await prisma.connectorInstallation.findUnique({ where: { id: installationId }, include: { activeCredential: true } });
    if (!installation) throw new ConnectorError("NOT_FOUND", "Webhook installation was not found.", 404);
    if (installation.status !== "active") throw new ConnectorError("INACTIVE_CONNECTOR", "Webhook installation is not active.", 409);
    if (!installation.activeCredential || installation.activeCredential.status !== "active") throw new ConnectorError("INVALID_SIGNATURE", "Webhook credentials are unavailable.", 401);
    const adapter = connectorAdapter(installation.connectorType);
    const configuration = adapter.verifyConfiguration(installation.configuration);
    const verificationSpan = startTelemetrySpan("webhook_verification", "pipeline", { unit: "requests", tags: { connector: installation.connectorType } });
    let verification: Awaited<ReturnType<typeof adapter.verifyInboundRequest>>;
    try {
      verification = await adapter.verifyInboundRequest({ rawBody: request.rawBody, headers: request.headers, credential: decryptCredential(installation.activeCredential.encryptedMaterial), configuration, now: new Date() });
      verificationSpan.end(true);
    } catch (error) { verificationSpan.end(false); throw error; }
    if (!configuration.acceptedEventTypes?.includes(verification.eventType)) throw new ConnectorError("UNSUPPORTED_EVENT", "Webhook event type is not enabled for this connector.", 422);
    const normalizationSpan = startTelemetrySpan("webhook_normalization", "pipeline", { unit: "requests", tags: { connector: installation.connectorType } });
    let signal: ExternalWorkSignal;
    try { signal = adapter.normalizeInboundEvent({ rawBody: request.rawBody, installationId }); normalizationSpan.end(true); }
    catch (error) { normalizationSpan.end(false); throw error; }
    if (signal.eventType !== verification.eventType || signal.externalEventId !== verification.eventId) throw new ConnectorError("MALFORMED_EVENT", "Webhook identity does not match the signed payload.", 400);
    const payloadDigest = createHash("sha256").update(request.rawBody).digest("hex");
    const existing = await prisma.connectorInboundEvent.findUnique({ where: { connectorInstallationId_externalEventId_eventType: { connectorInstallationId: installationId, externalEventId: signal.externalEventId, eventType: signal.eventType } } });
    if (existing) {
      if (existing.payloadDigest !== payloadDigest) throw new ConnectorError("PAYLOAD_CONFLICT", "This external event id was already received with a different payload.", 409);
      const updated = await prisma.connectorInboundEvent.update({ where: { id: existing.id }, data: { replayCount: { increment: 1 }, status: "duplicate" } });
      latency.end(true, { duplicate: true });
      return { accepted: true, duplicate: true, event: safeEvent(updated), jobId: updated.jobId };
    }
    let accepted: { event: Awaited<ReturnType<typeof prisma.connectorInboundEvent.create>>; job: Awaited<ReturnType<typeof prisma.durableJob.create>> };
    const enqueueSpan = startTelemetrySpan("webhook_enqueue", "database", { unit: "operations", tags: { connector: installation.connectorType } });
    try {
      accepted = await prisma.$transaction(async (tx) => {
        const event = await tx.connectorInboundEvent.create({ data: { organizationId: installation.organizationId, connectorInstallationId: installation.id, connectorType: installation.connectorType, externalEventId: signal.externalEventId, eventType: signal.eventType, eventVersion: signal.externalVersion, payloadDigest, sourceTimestamp: verification.sourceTimestamp, normalizedAt: new Date(), status: "normalized", safeMetadata: json(safeMetadata(signal)), normalizedSignal: json(signal) } });
        const input = { connectorInstallationId: installation.id, inboundEventId: event.id };
        const requestId = `connector:${installation.id}:${event.id}`;
        const job = await tx.durableJob.create({ data: { organizationId: installation.organizationId, type: "connector.intake", version: 1, status: "queued", priority: 100, authority: "server", input: json(input), inputDigest: digestJobInput(input), idempotencyKey: `connector-event:${installation.id}:${signal.externalEventId}:${signal.eventType}`, correlationId: `connector:${installation.id}:${signal.externalEventId}`, requestId, progress: json(initialJobProgress()), retryable: false, attemptCount: 0, maxAttempts: 3 } });
        const linked = await tx.connectorInboundEvent.update({ where: { id: event.id }, data: { status: "enqueued", jobId: job.id } });
        return { event: linked, job };
      });
      enqueueSpan.end(true);
    } catch (error) {
      if ((error as { code?: string } | undefined)?.code !== "P2002") { enqueueSpan.end(false); throw error; }
      const concurrent = await prisma.connectorInboundEvent.findUnique({ where: { connectorInstallationId_externalEventId_eventType: { connectorInstallationId: installationId, externalEventId: signal.externalEventId, eventType: signal.eventType } } });
      if (!concurrent || concurrent.payloadDigest !== payloadDigest) { enqueueSpan.end(false); throw new ConnectorError("PAYLOAD_CONFLICT", "This external event id was already received with a different payload.", 409); }
      const updated = await prisma.connectorInboundEvent.update({ where: { id: concurrent.id }, data: { replayCount: { increment: 1 }, status: "duplicate" } });
      enqueueSpan.end(true, { duplicate: true });
      latency.end(true, { duplicate: true, concurrent: true });
      return { accepted: true, duplicate: true, event: safeEvent(updated), jobId: updated.jobId };
    }
    latency.end(true, { duplicate: false });
    return { accepted: true, duplicate: false, event: safeEvent(accepted.event), jobId: accepted.job.id };
  } catch (error) {
    latency.end(false, { error: error instanceof ConnectorError ? error.code : "unknown" });
    throw error;
  }
}

export async function processConnectorInboundEvent(input: { organizationId: string; jobId: string; eventId: string; requestId: string; persistence: OrganizationPersistenceSession; ai: AIAdapter; signal: AbortSignal }) {
  const event = await prisma.connectorInboundEvent.findFirst({ where: { id: input.eventId, organizationId: input.organizationId }, include: { installation: true } });
  if (!event || event.jobId !== input.jobId) throw new ConnectorError("NOT_FOUND", "Connector inbound event was not found for this job.", 404);
  const signal = event.normalizedSignal as unknown as ExternalWorkSignal | null;
  if (!signal || signal.connectorInstallationId !== event.connectorInstallationId || signal.externalEventId !== event.externalEventId) throw new ConnectorError("MALFORMED_EVENT", "Connector inbound event has no valid normalized work signal.", 400);
  let mapping = await prisma.externalObjectMapping.findUnique({ where: { connectorInstallationId_externalObjectType_externalObjectId: { connectorInstallationId: event.connectorInstallationId, externalObjectType: signal.externalObjectType, externalObjectId: signal.externalObjectId } } });
  const sourceUpdatedAt = signal.updatedAt ? new Date(signal.updatedAt) : undefined;
  if (mapping && mapping.oipResourceId !== `pending:${event.id}` && sourceUpdatedAt && mapping.lastExternalUpdatedAt && sourceUpdatedAt.getTime() <= mapping.lastExternalUpdatedAt.getTime()) {
    await prisma.connectorInboundEvent.update({ where: { id: event.id }, data: { status: "processed", completedAt: new Date(), safeMetadata: json({ ...safeMetadata(signal), stale: true }) } });
    return { eventId: event.id, action: "stale_ignored", mappingId: mapping.id };
  }
  if (mapping && mapping.oipResourceId !== `pending:${event.id}`) {
    if (mapping.syncState === "processing") {
      await prisma.connectorInboundEvent.update({ where: { id: event.id }, data: { status: "processed", completedAt: new Date(), safeMetadata: json({ ...safeMetadata(signal), concurrentUpdateDeferred: true }) } });
      return { eventId: event.id, action: "concurrent_update_deferred", mappingId: mapping.id };
    }
    const updated = await prisma.externalObjectMapping.update({ where: { id: mapping.id }, data: { externalVersion: signal.externalVersion ?? mapping.externalVersion, lastExternalUpdatedAt: sourceUpdatedAt ?? new Date(), syncState: signal.status === "deleted" ? "external_deleted" : signal.status === "reopened" ? "reopened" : "active" } });
    await prisma.connectorInboundEvent.update({ where: { id: event.id }, data: { status: "processed", completedAt: new Date(), safeMetadata: json({ ...safeMetadata(signal), updateRecorded: true }) } });
    await prisma.connectorInstallation.update({ where: { id: event.connectorInstallationId }, data: { lastSuccessAt: new Date(), lastFailureSafe: null } });
    return { eventId: event.id, action: "update_recorded", mappingId: updated.id, oipResourceId: updated.oipResourceId };
  }
  if (!mapping) {
    try {
      mapping = await prisma.externalObjectMapping.create({ data: { organizationId: input.organizationId, connectorInstallationId: event.connectorInstallationId, externalObjectType: signal.externalObjectType, externalObjectId: signal.externalObjectId, oipResourceType: "ticket", oipResourceId: `pending:${event.id}`, externalVersion: signal.externalVersion, lastExternalUpdatedAt: sourceUpdatedAt ?? new Date(signal.createdAt), syncState: "processing" } });
    } catch (error) {
      if ((error as { code?: string } | undefined)?.code !== "P2002") throw error;
      const concurrent = await prisma.externalObjectMapping.findUnique({ where: { connectorInstallationId_externalObjectType_externalObjectId: { connectorInstallationId: event.connectorInstallationId, externalObjectType: signal.externalObjectType, externalObjectId: signal.externalObjectId } } });
      if (!concurrent) throw error;
      await prisma.connectorInboundEvent.update({ where: { id: event.id }, data: { status: "processed", completedAt: new Date(), safeMetadata: json({ ...safeMetadata(signal), concurrentUpdateDeferred: true }) } });
      return { eventId: event.id, action: "concurrent_update_deferred", mappingId: concurrent.id };
    }
  }
  try {
    const profile = await input.persistence.loadOrganizationProfile();
    const knowledgeItems = await input.persistence.loadKnowledge();
    const ticket = await processTicket({ organizationId: input.organizationId, actorContext: { name: `Connector: ${event.installation.name}` }, authority: "server", requestId: input.requestId, idempotencyKey: `connector-ticket:${event.id}`, ticketInput: { subject: signal.subject, description: signal.message, customerName: signal.requester?.name, sender: signal.requester, source: signal.source, externalReference: `${event.connectorInstallationId}:${signal.externalObjectId}`, createdAt: signal.createdAt }, organizationProfile: profile, processingOptions: { knowledgeItems, aiAdapter: input.ai }, signal: input.signal }, { persistence: input.persistence, ai: input.ai });
    const completedMapping = await prisma.externalObjectMapping.update({ where: { id: mapping.id }, data: { oipResourceId: ticket.ticket.id, externalVersion: signal.externalVersion, lastExternalUpdatedAt: sourceUpdatedAt ?? new Date(signal.createdAt), lastOipUpdatedAt: new Date(), syncState: "active" } });
    await prisma.connectorInboundEvent.update({ where: { id: event.id }, data: { status: "processed", completedAt: new Date(), safeMetadata: json({ ...safeMetadata(signal), oipResourceType: "ticket", replayedTicketProcessing: ticket.replayed }) } });
    await prisma.connectorInstallation.update({ where: { id: event.connectorInstallationId }, data: { lastSuccessAt: new Date(), lastFailureAt: null, lastFailureSafe: null } });
    return { eventId: event.id, action: "ticket_created", mappingId: completedMapping.id, oipResourceId: ticket.ticket.id, ticketReplayed: ticket.replayed };
  } catch (error) {
    const permanent = error instanceof ProcessTicketError && !error.failure.retryable;
    await prisma.connectorInboundEvent.update({ where: { id: event.id }, data: { status: permanent ? "rejected" : "failed", errorClass: error instanceof ProcessTicketError ? error.failure.errorClass : "unknown", errorMessage: error instanceof ProcessTicketError ? error.failure.safeMessage : "Connector intake could not process the normalized work signal." } });
    await prisma.connectorInstallation.update({ where: { id: event.connectorInstallationId }, data: { status: permanent ? "degraded" : event.installation.status, lastFailureAt: new Date(), lastFailureSafe: permanent ? "The normalized connector event was rejected." : "Connector event processing failed and can be retried." } });
    throw error;
  }
}

export async function retryConnectorInboundEvent(organizationId: string, installationId: string, eventId: string, user: AuthenticatedUser) {
  const event = await prisma.connectorInboundEvent.findFirst({ where: { id: eventId, organizationId, connectorInstallationId: installationId } });
  if (!event?.jobId) throw new ConnectorError("NOT_FOUND", "Connector inbound event was not found.", 404);
  const context = createPersistenceContext({ organizationId, actorContext: user, authority: "server", requestId: `connector-retry:${eventId}` });
  const job = await durableJobRepository.retry(context, event.jobId);
  await prisma.connectorInboundEvent.update({ where: { id: eventId }, data: { status: "enqueued", errorClass: null, errorMessage: null, completedAt: null } });
  return { event: safeEvent(await prisma.connectorInboundEvent.findUniqueOrThrow({ where: { id: eventId } })), jobId: job.id, jobStatus: job.status };
}
