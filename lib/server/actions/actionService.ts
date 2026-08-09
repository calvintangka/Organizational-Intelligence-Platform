import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/server/prisma";
import { authorizationService, AuthorizationServiceError } from "@/lib/server/rbac/authorizationService";
import { digestJobInput, type DurableJobRecord } from "@/lib/application/jobs/types";
import { ACTION_REGISTRY, type GovernedActionType } from "./registry";
import { evaluateLabelPolicy, getActionPolicy, type PolicyDecision } from "./policyEngine";

export const ACTION_STATUSES = ["proposed", "awaiting_approval", "approved", "execution_queued", "executing", "succeeded", "failed", "rejected", "cancelled", "reversal_requested", "reversed", "dead_lettered"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

type ActionPayload = { label: string; originalActionId?: string };
type ActionContext = { organizationId: string; actorId: string; requestId: string; correlationId: string; idempotencyKey: string };

function json(value: unknown): Prisma.InputJsonValue { return value as Prisma.InputJsonValue; }
function safeText(value: unknown, fallback: string, max = 500): string { const text = typeof value === "string" ? value.trim() : fallback; return text.slice(0, max) || fallback; }
function actionResource(actionId: string): string { return `governed_action:${actionId}`; }

export class GovernedActionError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 409, public readonly retryable = false) { super(message); this.name = "GovernedActionError"; }
}

function mapAction(action: any, ledger: any[] = []): Record<string, unknown> {
  return {
    id: action.id, organizationId: action.organizationId, actionType: action.actionType, actionVersion: action.actionVersion,
    targetType: action.targetType, targetId: action.targetId, status: action.status, riskLevel: action.riskLevel,
    reversibility: action.reversibility, proposedPayload: action.proposedPayload, proposedPayloadDigest: action.proposedPayloadDigest,
    preparedByActorId: action.preparedByActorId, preparedBySystem: action.preparedBySystem, preparationReason: action.preparationReason,
    requiredCapabilities: action.requiredCapabilities, policyDecision: action.policyDecision, policyVersion: action.policyVersion,
    approvalRequired: action.approvalRequired, approvedByActorId: action.approvedByActorId, approvedAt: action.approvedAt,
    approvalDecision: action.approvalDecision, approvalComment: action.approvalComment, executionJobId: action.executionJobId,
    executionAttemptCount: action.executionAttemptCount, executedByActorId: action.executedByActorId, executedByWorkerId: action.executedByWorkerId,
    executedAt: action.executedAt, result: action.result, reversalActionId: action.reversalActionId, reversedAt: action.reversedAt,
    failureClass: action.failureClass, failureMessage: action.failureMessage, requestId: action.requestId, correlationId: action.correlationId,
    idempotencyKey: action.idempotencyKey, createdAt: action.createdAt, updatedAt: action.updatedAt, ledger
  };
}

async function loadAction(organizationId: string, actionId: string) {
  const action = await prisma.governedAction.findUnique({ where: { id: actionId }, include: { ledgerEntries: { orderBy: { createdAt: "asc" } } } });
  if (!action || action.organizationId !== organizationId) throw new GovernedActionError("ACTION_NOT_FOUND", "The governed action was not found.", 404);
  return action;
}

async function assertActionCapability(actorId: string, organizationId: string, capability: "action.prepare" | "action.approve" | "action.execute", resource: string): Promise<void> {
  try {
    await authorizationService.requireCapability({ actorUserId: actorId, organizationId, capability, resource });
  } catch (error) {
    if (!(error instanceof AuthorizationServiceError)) throw error;
    throw new GovernedActionError("AUTHORIZATION_DENIED", `The ${capability} capability is required.`, 403, false);
  }
}

async function findTicket(organizationId: string, ticketId: string, tx = prisma) {
  const ticket = await tx.ticketRecord.findUnique({ where: { organizationId_ticketId: { organizationId, ticketId } } });
  if (!ticket) throw new GovernedActionError("TARGET_NOT_FOUND", "The governed action target was not found in this organization.", 404);
  return ticket;
}

async function checkConflicts(organizationId: string, targetId: string, actionType: GovernedActionType, label: string, tx = prisma): Promise<boolean> {
  const opposite = actionType === "ticket.label.apply" ? "ticket.label.remove" : "ticket.label.apply";
  const pending = await tx.governedAction.findMany({ where: { organizationId, targetType: "ticket", targetId, actionType: { in: [actionType, opposite] }, status: { in: ["awaiting_approval", "approved", "execution_queued", "executing", "reversal_requested"] } }, select: { actionType: true, proposedPayload: true } });
  return pending.some((item) => (item.proposedPayload as { label?: unknown }).label === label);
}

export async function prepareGovernedAction(input: ActionContext & { actionType: GovernedActionType; ticketId: string; label: string; preparationReason: string; evidenceSummary?: string[]; originalActionId?: string }): Promise<Record<string, unknown>> {
  await assertActionCapability(input.actorId, input.organizationId, "action.prepare", `governed_action:prepare:${input.ticketId}`);
  const definition = ACTION_REGISTRY[input.actionType];
  const label = input.label.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(label)) throw new GovernedActionError("INVALID_LABEL", "The label format is not allowed.", 400);
  const payload: ActionPayload = { label, ...(input.originalActionId ? { originalActionId: input.originalActionId } : {}) };
  const payloadDigest = digestJobInput({ actionType: input.actionType, actionVersion: definition.version, targetType: "ticket", targetId: input.ticketId, payload });
  const existing = await prisma.governedAction.findUnique({ where: { organizationId_idempotencyKey: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey } }, include: { ledgerEntries: { orderBy: { createdAt: "asc" } } } });
  if (existing) {
    if (existing.proposedPayloadDigest !== payloadDigest) throw new GovernedActionError("IDEMPOTENCY_CONFLICT", "This action idempotency key is bound to a different action payload.");
    return mapAction(existing, existing.ledgerEntries);
  }
  const ticket = await findTicket(input.organizationId, input.ticketId);
  const rawLabels = Array.isArray(ticket.labels) ? ticket.labels as unknown[] : [];
  const labels: string[] = rawLabels.filter((value: unknown): value is string => typeof value === "string");
  const policy = await getActionPolicy(input.organizationId);
  const original = input.originalActionId ? await loadAction(input.organizationId, input.originalActionId) : null;
  if (input.actionType === "ticket.label.remove" && (!original || original.actionType !== "ticket.label.apply" || original.status !== "succeeded")) throw new GovernedActionError("INVALID_REVERSAL", "Only a succeeded label application can be reversed.");
  const decision = evaluateLabelPolicy({ actionType: input.actionType, label, ticketStatus: ticket.status, currentLabels: labels, policy, conflictingAction: await checkConflicts(input.organizationId, input.ticketId, input.actionType, label), evidencePresent: input.evidenceSummary !== undefined });
  if (!decision.allowed) throw new GovernedActionError("POLICY_DENIED", `The governed action was rejected by policy: ${decision.failedRules.join(", ")}.`, 409);
  const now = new Date();
  const created = await prisma.$transaction(async (tx) => {
    const action = await tx.governedAction.create({ data: {
      organizationId: input.organizationId, actionType: input.actionType, actionVersion: definition.version, targetType: "ticket", targetId: input.ticketId,
      status: "awaiting_approval", riskLevel: definition.riskLevel, reversibility: definition.reversibility, proposedPayload: json(payload), proposedPayloadDigest: payloadDigest,
      preparedByActorId: input.actorId, preparedBySystem: false, preparationReason: safeText(input.preparationReason, "Deterministic ticket label proposal."),
      requiredCapabilities: json(definition.requiredCapabilities), policyDecision: json({ ...decision, evidenceSummary: [...decision.evidenceSummary, ...(input.evidenceSummary ?? []).slice(0, 10)] }), policyVersion: policy.version,
      approvalRequired: true, requestId: safeText(input.requestId, randomUUID(), 128), correlationId: safeText(input.correlationId, input.requestId, 128), idempotencyKey: input.idempotencyKey
    }});
    await tx.actionLedgerEntry.create({ data: { actionId: action.id, organizationId: input.organizationId, actorId: input.actorId, eventType: "prepared", previousStatus: null, newStatus: "awaiting_approval", targetType: "ticket", targetId: input.ticketId, payloadDigest, requestId: action.requestId, correlationId: action.correlationId, safeReason: "Action prepared; no ticket mutation occurred." } });
    return action;
  });
  return mapAction(created);
}

async function revalidateAction(action: any): Promise<{ policy: Awaited<ReturnType<typeof getActionPolicy>>; ticket: any; payload: ActionPayload; decision: PolicyDecision }> {
  const payload = action.proposedPayload as ActionPayload;
  const ticket = await findTicket(action.organizationId, action.targetId);
  const policy = await getActionPolicy(action.organizationId);
  if (policy.version !== action.policyVersion) throw new GovernedActionError("STALE_POLICY", "The organization label policy changed; the action must be prepared again.");
  const labels = (Array.isArray(ticket.labels) ? ticket.labels as unknown[] : []).filter((value: unknown): value is string => typeof value === "string");
  const decision = evaluateLabelPolicy({ actionType: action.actionType as GovernedActionType, label: payload.label, ticketStatus: ticket.status, currentLabels: labels, policy, evidencePresent: true });
  if (!decision.allowed && !(decision.failedRules.length === 1 && decision.failedRules[0] === "label_effect_not_present" && action.actionType === "ticket.label.remove")) throw new GovernedActionError("POLICY_DENIED", `The governed action is no longer permitted: ${decision.failedRules.join(", ")}.`);
  return { policy, ticket, payload, decision };
}

export async function approveGovernedAction(input: ActionContext & { actionId: string; decision: "approved" | "rejected"; comment?: string }): Promise<Record<string, unknown>> {
  await assertActionCapability(input.actorId, input.organizationId, "action.approve", actionResource(input.actionId));
  const action = await loadAction(input.organizationId, input.actionId);
  if (action.status !== "awaiting_approval") throw new GovernedActionError("INVALID_STATE", "Only actions awaiting approval can be decided.");
  if (input.decision === "rejected") {
    const rejected = await prisma.$transaction(async (tx) => {
      const updated = await tx.governedAction.update({ where: { id: action.id }, data: { status: "rejected", approvedByActorId: input.actorId, approvedAt: new Date(), approvalDecision: "rejected", approvalComment: safeText(input.comment, "Rejected by authorized reviewer.") } });
      await tx.actionLedgerEntry.create({ data: { actionId: action.id, organizationId: input.organizationId, actorId: input.actorId, eventType: "rejected", previousStatus: action.status, newStatus: "rejected", targetType: action.targetType, targetId: action.targetId, payloadDigest: action.proposedPayloadDigest, requestId: action.requestId, correlationId: action.correlationId, safeReason: "Action rejected by authorized reviewer." } });
      return updated;
    });
    return mapAction(rejected);
  }
  await revalidateAction(action);
  const now = new Date();
  const jobInput = { governedActionId: action.id, organizationId: input.organizationId, actionDigest: action.proposedPayloadDigest, approvedPolicyVersion: action.policyVersion };
  const job = await prisma.$transaction(async (tx) => {
    const durableJob = await tx.durableJob.create({ data: { organizationId: input.organizationId, actorId: input.actorId, type: "action.execute", version: 1, status: "queued", priority: 50, authority: "server", input: json(jobInput), inputDigest: digestJobInput(jobInput), idempotencyKey: `action-execute:${action.id}`, correlationId: action.correlationId, requestId: action.requestId, progress: json({ stage: "queued", completed: 0, total: 1, percent: 0, updatedAt: now.toISOString() }), retryable: false, maxAttempts: 3, createdAt: now } });
    const updated = await tx.governedAction.update({ where: { id: action.id }, data: { status: "execution_queued", approvedByActorId: input.actorId, approvedAt: now, approvalDecision: "approved", approvalComment: input.comment ? safeText(input.comment, "Approved by authorized reviewer.") : null, executionJobId: durableJob.id } });
    await tx.actionLedgerEntry.create({ data: { actionId: action.id, organizationId: input.organizationId, actorId: input.actorId, eventType: "approved_and_queued", previousStatus: action.status, newStatus: "execution_queued", targetType: action.targetType, targetId: action.targetId, payloadDigest: action.proposedPayloadDigest, requestId: action.requestId, correlationId: action.correlationId, safeReason: "Explicit approval recorded and durable execution queued in one transaction." } });
    return { durableJob, updated };
  });
  return mapAction(job.updated, [{ eventType: "approved_and_queued", jobId: job.durableJob.id }]);
}

export async function cancelGovernedAction(input: ActionContext & { actionId: string }): Promise<Record<string, unknown>> {
  await assertActionCapability(input.actorId, input.organizationId, "action.approve", actionResource(input.actionId));
  const action = await loadAction(input.organizationId, input.actionId);
  if (!["awaiting_approval", "execution_queued"].includes(action.status)) throw new GovernedActionError("INVALID_STATE", "Only pending governed actions can be cancelled.");
  const cancelled = await prisma.$transaction(async (tx) => {
    if (action.executionJobId) await tx.durableJob.updateMany({ where: { id: action.executionJobId, organizationId: input.organizationId, status: { in: ["queued", "running", "retry_scheduled"] } }, data: { status: "cancelled", cancellationRequestedAt: new Date(), cancelledAt: new Date(), retryable: false } });
    const updated = await tx.governedAction.update({ where: { id: action.id }, data: { status: "cancelled" } });
    await tx.actionLedgerEntry.create({ data: { actionId: action.id, organizationId: input.organizationId, actorId: input.actorId, eventType: "cancelled", previousStatus: action.status, newStatus: "cancelled", targetType: action.targetType, targetId: action.targetId, payloadDigest: action.proposedPayloadDigest, requestId: action.requestId, correlationId: action.correlationId, safeReason: "Action cancelled before effect." } });
    return updated;
  });
  return mapAction(cancelled);
}

export async function reverseGovernedAction(input: ActionContext & { actionId: string; preparationReason: string }): Promise<Record<string, unknown>> {
  const original = await loadAction(input.organizationId, input.actionId);
  if (original.actionType !== "ticket.label.apply" || original.status !== "succeeded" || original.reversalActionId) throw new GovernedActionError("INVALID_REVERSAL", "Only an unreversed succeeded label action can be reversed.");
  const payload = original.proposedPayload as ActionPayload;
  return prepareGovernedAction({ ...input, actionType: "ticket.label.remove", ticketId: original.targetId, label: payload.label, originalActionId: original.id, preparationReason: input.preparationReason, evidenceSummary: ["original succeeded label action", `original action ${original.id}`] });
}

export async function executeGovernedAction(input: { organizationId: string; actionId: string; workerId: string; actorId?: string }): Promise<Record<string, unknown>> {
  const action = await loadAction(input.organizationId, input.actionId);
  if (["succeeded", "reversed"].includes(action.status)) return mapAction(action, action.ledgerEntries);
  if (!["execution_queued", "executing", "failed"].includes(action.status) || !action.approvedByActorId) throw new GovernedActionError("UNAPPROVED_EXECUTION", "The worker may execute only an approved governed action.", 409, false);
  const canExecute = await authorizationService.hasCapability({ actorUserId: action.approvedByActorId, organizationId: input.organizationId, capability: "action.execute", resource: actionResource(action.id) });
  if (!canExecute) {
    await failGovernedAction(action, "authorization_revoked", "The approved actor no longer has action.execute.", input.workerId);
    throw new GovernedActionError("AUTHORIZATION_REVOKED", "Execution authority was revoked after approval.", 403, false);
  }
  let validated: { policy: Awaited<ReturnType<typeof getActionPolicy>>; ticket: any; payload: ActionPayload; decision: PolicyDecision };
  try {
    validated = await revalidateAction(action);
  } catch (error) {
    if (error instanceof GovernedActionError && !error.retryable) await failGovernedAction(action, error.code.toLowerCase(), error.message, input.workerId);
    throw error;
  }
  const { policy, ticket, payload } = validated;
  const labels = (Array.isArray(ticket.labels) ? ticket.labels as unknown[] : []).filter((value: unknown): value is string => typeof value === "string");
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.governedAction.findUnique({ where: { id: action.id } });
    if (!current) throw new GovernedActionError("ACTION_NOT_FOUND", "The governed action was not found.", 404);
    if (["succeeded", "reversed"].includes(current.status)) return current;
    if (!["execution_queued", "executing", "failed"].includes(current.status)) throw new GovernedActionError("INVALID_STATE", "The governed action is not executable.");
    const claimed = await tx.governedAction.updateMany({ where: { id: action.id, status: { in: ["execution_queued", "failed"] } }, data: { status: "executing", executionAttemptCount: { increment: 1 }, executedByWorkerId: input.workerId } });
    if (claimed.count !== 1) throw new GovernedActionError("ACTION_IN_PROGRESS", "Another worker is already executing this governed action.", 409, true);
    await tx.actionLedgerEntry.create({ data: { actionId: action.id, organizationId: input.organizationId, actorId: action.approvedByActorId, workerId: input.workerId, eventType: "execution_started", previousStatus: current.status, newStatus: "executing", targetType: action.targetType, targetId: action.targetId, payloadDigest: action.proposedPayloadDigest, requestId: action.requestId, correlationId: action.correlationId, safeReason: "Approved action revalidated by durable worker." } });
    const nextLabels = action.actionType === "ticket.label.apply" ? [...new Set([...labels, payload.label])] : labels.filter((label: string) => label !== payload.label);
    const changed = nextLabels.length !== labels.length;
    if (changed && nextLabels.length > policy.maximumLabelsPerTicket) throw new GovernedActionError("POLICY_DENIED", "The current label policy maximum would be exceeded.");
    if (changed) await tx.ticketRecord.update({ where: { organizationId_ticketId: { organizationId: input.organizationId, ticketId: action.targetId } }, data: { labels: json(nextLabels) } });
    const effectId = `ticket-label:${input.organizationId}:${action.targetId}:${payload.label}`;
    const completed = await tx.governedAction.update({ where: { id: action.id }, data: { status: "succeeded", result: json({ action: action.actionType, label: payload.label, changed, effectId, policyVersion: policy.version }), externalEffectId: effectId, executedByActorId: action.approvedByActorId, executedAt: new Date() } });
    if (action.actionType === "ticket.label.remove" && payload.originalActionId) {
      const original = await tx.governedAction.findUnique({ where: { id: payload.originalActionId } });
      const linked = await tx.governedAction.updateMany({ where: { id: payload.originalActionId, organizationId: input.organizationId, status: "succeeded", reversalActionId: null }, data: { status: "reversed", reversalActionId: action.id, reversedAt: new Date() } });
      if (linked.count === 1 && original) await tx.actionLedgerEntry.create({ data: { actionId: original.id, organizationId: input.organizationId, actorId: action.approvedByActorId, workerId: input.workerId, eventType: "reversal_completed", previousStatus: "succeeded", newStatus: "reversed", targetType: original.targetType, targetId: original.targetId, payloadDigest: original.proposedPayloadDigest, requestId: original.requestId, correlationId: original.correlationId, safeReason: "Approved reversal removed the original label effect." } });
    }
    await tx.actionLedgerEntry.create({ data: { actionId: action.id, organizationId: input.organizationId, actorId: action.approvedByActorId, workerId: input.workerId, eventType: "execution_succeeded", previousStatus: "executing", newStatus: "succeeded", targetType: action.targetType, targetId: action.targetId, payloadDigest: action.proposedPayloadDigest, requestId: action.requestId, correlationId: action.correlationId, safeReason: changed ? "Ticket label effect committed atomically." : "Identical label state already held; execution replay was idempotent." } });
    return completed;
  });
  return mapAction(result);
}

async function failGovernedAction(action: any, failureClass: string, failureMessage: string, workerId?: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.governedAction.updateMany({ where: { id: action.id, organizationId: action.organizationId, status: { in: ["execution_queued", "executing", "failed"] } }, data: { status: "failed", failureClass, failureMessage, executedByWorkerId: workerId } });
    if (updated.count) await tx.actionLedgerEntry.create({ data: { actionId: action.id, organizationId: action.organizationId, actorId: action.approvedByActorId, workerId, eventType: "execution_failed", previousStatus: action.status, newStatus: "failed", targetType: action.targetType, targetId: action.targetId, payloadDigest: action.proposedPayloadDigest, requestId: action.requestId, correlationId: action.correlationId, safeReason: failureMessage } });
  });
}

export async function getGovernedAction(organizationId: string, actionId: string): Promise<Record<string, unknown>> { const action = await loadAction(organizationId, actionId); return mapAction(action, action.ledgerEntries); }
export async function listGovernedActions(organizationId: string, limit = 100): Promise<Record<string, unknown>[]> { const actions = await prisma.governedAction.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: Math.min(100, Math.max(1, limit)) }); return actions.map((action) => mapAction(action)); }
