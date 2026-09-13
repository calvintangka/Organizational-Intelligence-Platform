import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/server/prisma";
import { MemoryFoundationError, memoryString } from "@/lib/server/organizationalMemoryPrimitives";
import type { OrganizationDomain } from "@/types";

export const DEFAULT_ORGANIZATION_DOMAINS = [
  { key: "customer-support", label: "Customer Support", sensitivity: "internal" },
  { key: "it-service-management", label: "IT Service Management", sensitivity: "internal" },
  { key: "finance", label: "Finance", sensitivity: "restricted" },
  { key: "accounting", label: "Accounting", sensitivity: "restricted" },
  { key: "operations", label: "Operations", sensitivity: "internal" },
  { key: "hr", label: "Human Resources", sensitivity: "restricted" },
  { key: "legal", label: "Legal", sensitivity: "restricted" },
  { key: "sales", label: "Sales", sensitivity: "internal" },
  { key: "engineering", label: "Engineering", sensitivity: "internal" },
  { key: "management", label: "Management", sensitivity: "restricted" },
  { key: "general", label: "General", sensitivity: "internal" }
] as const;

function mapDomain(row: any): OrganizationDomain {
  return {
    id: row.id,
    organizationId: row.organizationId,
    key: row.key,
    label: row.label,
    description: row.description ?? null,
    status: row.status,
    sensitivity: row.sensitivity,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function ensureDefaultOrganizationDomains(organizationId: string, createdBy?: string): Promise<void> {
  const rows = DEFAULT_ORGANIZATION_DOMAINS.map((domain) => ({
    organizationId,
    key: domain.key,
    label: domain.label,
    description: `Shared OIP ${domain.label} organizational learning domain.`,
    sensitivity: domain.sensitivity,
    createdBy: createdBy ?? null
  }));
  await prisma.organizationDomain.createMany({ data: rows, skipDuplicates: true });
}

export async function listOrganizationDomains(organizationId: string): Promise<OrganizationDomain[]> {
  await ensureDefaultOrganizationDomains(organizationId);
  const rows = await prisma.organizationDomain.findMany({ where: { organizationId }, orderBy: { label: "asc" } });
  return rows.map(mapDomain);
}

export async function loadOrganizationDomain(organizationId: string, domainId: string): Promise<OrganizationDomain> {
  const row = await prisma.organizationDomain.findUnique({ where: { id: memoryString(domainId, "domainId", 160) } });
  if (!row || row.organizationId !== organizationId) {
    throw new MemoryFoundationError("RESOURCE_NOT_FOUND", "The requested organizational domain was not found in this organization.", 404);
  }
  return mapDomain(row);
}

export async function resolveOrganizationDomain(organizationId: string, domainIdOrKey: string): Promise<OrganizationDomain> {
  await ensureDefaultOrganizationDomains(organizationId);
  const value = memoryString(domainIdOrKey, "domainId", 160);
  const row = await prisma.organizationDomain.findFirst({
    where: { organizationId, OR: [{ id: value }, { key: value }] }
  });
  if (!row) throw new MemoryFoundationError("RESOURCE_NOT_FOUND", "The requested organizational domain was not found in this organization.", 404);
  return mapDomain(row);
}

export async function createOrganizationDomain(input: {
  organizationId: string;
  key: string;
  label: string;
  description?: string | null;
  sensitivity?: string;
  createdBy: string;
}): Promise<OrganizationDomain> {
  const key = memoryString(input.key, "key", 120).toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const label = memoryString(input.label, "label", 180);
  const sensitivity = input.sensitivity === "restricted" ? "restricted" : "internal";
  try {
    const row = await prisma.organizationDomain.create({
      data: {
        organizationId: input.organizationId,
        key,
        label,
        description: input.description?.trim().slice(0, 1000) || null,
        sensitivity,
        createdBy: input.createdBy
      }
    });
    return mapDomain(row);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      throw new MemoryFoundationError("CONFLICT", `The organizational domain key ${key} already exists.`);
    }
    throw error;
  }
}

export type DomainGrantInput = {
  organizationId: string;
  domainId: string;
  roleId: string;
  capabilityKey: string;
};

export async function grantDomainCapability(input: DomainGrantInput): Promise<void> {
  await prisma.organizationDomainCapabilityGrant.upsert({
    where: {
      organizationId_domainId_roleId_capabilityKey: {
        organizationId: input.organizationId,
        domainId: input.domainId,
        roleId: input.roleId,
        capabilityKey: input.capabilityKey
      }
    },
    create: input,
    update: {}
  });
}

export function domainJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
