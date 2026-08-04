import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/server/prisma";
import { CAPABILITY_KEYS, ROLE_CAPABILITIES, type CapabilityKey, type RoleKey, normalizeRoleKey } from "./definitions";

export type AuthorizationRequest = {
  actorUserId: string;
  organizationId: string;
  capability: string;
  resource?: string;
  requestId?: string;
  correlationId?: string;
};

export type AuthorizationResult = {
  allowed: boolean;
  actorUserId: string;
  organizationId: string;
  roleKey: RoleKey | null;
  capability: string;
  resource: string;
  reason?: string;
};

function safeResource(resource: string | undefined): string {
  const value = (resource ?? "organization").trim();
  return value.length > 240 ? value.slice(0, 240) : value;
}

function safeCorrelation(value: string | undefined): string | null {
  const candidate = value?.trim() ?? "";
  return /^[A-Za-z0-9._:-]{1,128}$/.test(candidate) ? candidate : null;
}

async function writeAudit(request: AuthorizationRequest, result: AuthorizationResult): Promise<void> {
  try {
    await prisma.authorizationDecisionAudit.create({
      data: {
        organizationId: request.organizationId,
        actorUserId: request.actorUserId,
        roleKey: result.roleKey,
        capabilityKey: request.capability,
        resource: result.resource,
        decision: result.allowed ? "allow" : "deny",
        reason: result.reason,
        requestId: safeCorrelation(request.requestId) ?? randomUUID(),
        correlationId: safeCorrelation(request.correlationId ?? request.requestId)
      }
    });
  } catch {
    // An audit sink outage must never turn into an authorization bypass. The
    // decision remains authoritative; operational monitoring can surface the
    // missing audit write separately.
  }
}

async function resolveRole(actorUserId: string, organizationId: string): Promise<{ roleKey: RoleKey | null; capabilities: Set<string> }> {
  const membership = await prisma.organizationMembership.findUnique({
    where: { userId_organizationId: { userId: actorUserId, organizationId } },
    select: {
      role: true,
      roleAssignment: {
        select: {
          role: {
            select: {
              key: true,
              capabilities: { select: { capability: { select: { key: true } } } }
            }
          }
        }
      }
    }
  });
  if (!membership) return { roleKey: null, capabilities: new Set() };
  const roleKey = normalizeRoleKey(membership.roleAssignment?.role.key ?? membership.role);
  const durableCapabilities = membership.roleAssignment?.role.capabilities.map(({ capability }) => capability.key) ?? [];
  return { roleKey, capabilities: new Set(durableCapabilities.length ? durableCapabilities : ROLE_CAPABILITIES[roleKey]) };
}

export class AuthorizationService {
  async authorize(request: AuthorizationRequest): Promise<AuthorizationResult> {
    const resource = safeResource(request.resource);
    const resolved = await resolveRole(request.actorUserId, request.organizationId);
    const allowed = resolved.roleKey !== null && resolved.capabilities.has(request.capability);
    const result: AuthorizationResult = {
      allowed,
      actorUserId: request.actorUserId,
      organizationId: request.organizationId,
      roleKey: resolved.roleKey,
      capability: request.capability,
      resource,
      ...(allowed ? {} : { reason: resolved.roleKey ? "capability_not_granted" : "organization_membership_required" })
    };
    await writeAudit(request, result);
    return result;
  }

  async requireCapability(request: AuthorizationRequest): Promise<AuthorizationResult> {
    const result = await this.authorize(request);
    if (!result.allowed) throw new AuthorizationServiceError(result.reason === "organization_membership_required" ? "You do not have access to this organization." : `The ${request.capability} capability is required.`);
    return result;
  }

  async hasCapability(request: AuthorizationRequest): Promise<boolean> {
    return (await this.authorize(request)).allowed;
  }

  async listCapabilities(actorUserId: string, organizationId: string): Promise<{ role: RoleKey | null; capabilities: CapabilityKey[] }> {
    const resolved = await resolveRole(actorUserId, organizationId);
    return {
      role: resolved.roleKey,
      capabilities: CAPABILITY_KEYS.filter((key) => resolved.capabilities.has(key))
    };
  }
}

export class AuthorizationServiceError extends Error {
  readonly status = 403 as const;
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationServiceError";
  }
}

export const authorizationService = new AuthorizationService();
