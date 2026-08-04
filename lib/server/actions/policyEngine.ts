import "server-only";

import { prisma } from "@/lib/server/prisma";
import { type GovernedActionType } from "./registry";

export const DEFAULT_ALLOWED_LABELS = ["password-reset", "billing", "activation", "delivery-delay", "business-inquiry", "requires-review"] as const;

export type ActionPolicy = {
  id: string;
  organizationId: string;
  version: number;
  allowedLabels: string[];
  disabledLabels: string[];
  maximumLabelsPerTicket: number;
  duplicateBehavior: string;
};

export type PolicyDecision = {
  allowed: boolean;
  riskLevel: "low";
  approvalRequired: true;
  reasons: string[];
  failedRules: string[];
  policyVersion: number;
  evidenceSummary: string[];
};

function jsonStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim().toLowerCase()).filter(Boolean) : [];
}

export async function getActionPolicy(organizationId: string): Promise<ActionPolicy> {
  const existing = await prisma.organizationActionPolicy.findUnique({ where: { organizationId } });
  if (existing) return { id: existing.id, organizationId, version: existing.version, allowedLabels: jsonStrings(existing.allowedLabels), disabledLabels: jsonStrings(existing.disabledLabels), maximumLabelsPerTicket: existing.maximumLabelsPerTicket, duplicateBehavior: existing.duplicateBehavior };
  const created = await prisma.organizationActionPolicy.create({ data: { organizationId, allowedLabels: [...DEFAULT_ALLOWED_LABELS], disabledLabels: [], maximumLabelsPerTicket: 10, duplicateBehavior: "idempotent_success" } });
  return { id: created.id, organizationId, version: created.version, allowedLabels: [...DEFAULT_ALLOWED_LABELS], disabledLabels: [], maximumLabelsPerTicket: 10, duplicateBehavior: created.duplicateBehavior };
}

export function evaluateLabelPolicy(input: { actionType: GovernedActionType; label: string; ticketStatus: string; currentLabels: string[]; policy: ActionPolicy; conflictingAction?: boolean; evidencePresent?: boolean }): PolicyDecision {
  const label = input.label.trim().toLowerCase();
  const failedRules: string[] = [];
  const reasons: string[] = [];
  const evidenceSummary: string[] = ["deterministic action registry", `policy version ${input.policy.version}`, `target status ${input.ticketStatus}`];
  if (!input.policy.allowedLabels.includes(label) || input.policy.disabledLabels.includes(label)) failedRules.push("label_not_allowlisted");
  if (input.currentLabels.length >= input.policy.maximumLabelsPerTicket && input.actionType === "ticket.label.apply" && !input.currentLabels.includes(label)) failedRules.push("maximum_labels_reached");
  if (["resolved", "rejected", "discarded"].includes(input.ticketStatus) && input.actionType === "ticket.label.apply") failedRules.push("ticket_state_forbids_action");
  if (input.conflictingAction) failedRules.push("conflicting_pending_action");
  if (input.evidencePresent === false) failedRules.push("required_evidence_missing");
  if (input.actionType === "ticket.label.apply" && input.currentLabels.includes(label)) reasons.push("label_already_applied_idempotent");
  if (input.actionType === "ticket.label.remove" && !input.currentLabels.includes(label)) failedRules.push("label_effect_not_present");
  if (!failedRules.length) reasons.push("action type is registered, reversible, low risk, and policy allowlisted");
  return { allowed: failedRules.length === 0, riskLevel: "low", approvalRequired: true, reasons, failedRules, policyVersion: input.policy.version, evidenceSummary };
}

export function validatePolicyUpdate(input: { allowedLabels: unknown; disabledLabels: unknown; maximumLabelsPerTicket: unknown }): { allowedLabels: string[]; disabledLabels: string[]; maximumLabelsPerTicket: number } {
  const allowedLabels = jsonStrings(input.allowedLabels);
  const disabledLabels = jsonStrings(input.disabledLabels);
  if (!allowedLabels.length || allowedLabels.length > 100 || allowedLabels.some((label) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(label))) throw new Error("Labels must be lowercase hyphenated values and the allowlist must contain 1-100 labels.");
  if (disabledLabels.some((label) => !allowedLabels.includes(label))) throw new Error("Disabled labels must belong to the allowlist.");
  const maximumLabelsPerTicket = Number(input.maximumLabelsPerTicket);
  if (!Number.isInteger(maximumLabelsPerTicket) || maximumLabelsPerTicket < 1 || maximumLabelsPerTicket > 50) throw new Error("maximumLabelsPerTicket must be an integer from 1 to 50.");
  return { allowedLabels, disabledLabels, maximumLabelsPerTicket };
}
