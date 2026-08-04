import "server-only";

import type { CapabilityKey } from "@/lib/server/rbac/definitions";

export const GOVERNED_ACTION_TYPES = ["ticket.label.apply", "ticket.label.remove"] as const;
export type GovernedActionType = (typeof GOVERNED_ACTION_TYPES)[number];

export type ActionDefinition = {
  type: GovernedActionType;
  version: number;
  riskLevel: "low";
  reversibility: "reversible";
  targetType: "ticket";
  requiredCapabilities: [CapabilityKey, CapabilityKey, CapabilityKey];
  retryable: boolean;
  timeoutMs: number;
};

export const ACTION_REGISTRY: Record<GovernedActionType, ActionDefinition> = {
  "ticket.label.apply": {
    type: "ticket.label.apply", version: 1, riskLevel: "low", reversibility: "reversible", targetType: "ticket",
    requiredCapabilities: ["action.prepare", "action.approve", "action.execute"], retryable: true, timeoutMs: 30_000
  },
  "ticket.label.remove": {
    type: "ticket.label.remove", version: 1, riskLevel: "low", reversibility: "reversible", targetType: "ticket",
    requiredCapabilities: ["action.prepare", "action.approve", "action.execute"], retryable: true, timeoutMs: 30_000
  }
};

export function isGovernedActionType(value: unknown): value is GovernedActionType {
  return typeof value === "string" && (GOVERNED_ACTION_TYPES as readonly string[]).includes(value);
}
