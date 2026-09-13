import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/server/prisma";
import { MemoryFoundationError, memoryString } from "@/lib/server/organizationalMemoryPrimitives";
import { loadOrganizationDomain } from "@/lib/server/domainService";
import type {
  EffectiveSkillPolicy,
  OrganizationalSkill,
  OrganizationalSkillDefinition,
  OrganizationalSkillVersion,
  RiskLevel,
  SkillCompositionResult,
  SkillInputDefinition,
  SkillMemoryLink,
  SkillPolicy
} from "@/types";

const SKILL_STATUSES = new Set(["DRAFT", "READY_FOR_REVIEW", "VALIDATED", "SUSPENDED", "REVOKED"]);
const VERSION_STATUSES = new Set(["DRAFT", "READY_FOR_REVIEW", "VALIDATED", "SUSPENDED", "REVOKED"]);
const POLICY_MODES = new Set<SkillPolicy>(["ADVISORY", "DRAFT_ONLY", "HUMAN_APPROVAL_REQUIRED", "BOUNDED_EXECUTION"]);
const RISK_LEVELS = new Set<RiskLevel>(["low", "medium", "high", "critical"]);
const RISK_ORDER: RiskLevel[] = ["low", "medium", "high", "critical"];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function normalizeInputs(value: unknown): SkillInputDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const item = asRecord(entry);
    return {
      key: memoryString(item.key, "required input key", 100),
      label: memoryString(item.label ?? item.key, "required input label", 180),
      type: memoryString(item.type ?? "string", "required input type", 80),
      required: item.required !== false,
      ...(typeof item.description === "string" && item.description.trim() ? { description: item.description.trim().slice(0, 500) } : {})
    };
  });
}

function normalizeDefinition(value: unknown): OrganizationalSkillDefinition {
  const input = asRecord(value);
  return {
    purpose: memoryString(input.purpose, "skill purpose", 2000),
    requiredInputs: normalizeInputs(input.requiredInputs),
    capabilities: stringArray(input.capabilities),
    permissions: stringArray(input.permissions),
    tools: stringArray(input.tools),
    constraints: stringArray(input.constraints),
    expectedOutput: memoryString(input.expectedOutput ?? "A bounded, reviewable result.", "expectedOutput", 2000),
    escalationConditions: stringArray(input.escalationConditions),
    ...(input.provenance && typeof input.provenance === "object" && !Array.isArray(input.provenance) ? { provenance: input.provenance as Record<string, unknown> } : {})
  };
}

function normalizeRisk(value: unknown): RiskLevel {
  return RISK_LEVELS.has(value as RiskLevel) ? value as RiskLevel : "medium";
}

function normalizePolicy(value: unknown): SkillPolicy {
  return POLICY_MODES.has(value as SkillPolicy) ? value as SkillPolicy : "HUMAN_APPROVAL_REQUIRED";
}

function normalizeScope(value: unknown): Record<string, unknown> {
  const scope = asRecord(value);
  return Object.keys(scope).length > 0 ? scope : { level: "organization" };
}

function mapMemoryLink(row: any): SkillMemoryLink {
  return {
    id: row.id,
    organizationId: row.organizationId,
    skillVersionId: row.skillVersionId,
    knowledgeItemId: row.knowledgeItemId,
    knowledgeVersionId: row.knowledgeVersionId ?? null,
    knowledgeRevision: row.knowledgeRevision,
    relationship: row.relationship,
    createdAt: row.createdAt.toISOString()
  };
}

function mapVersion(row: any): OrganizationalSkillVersion {
  return {
    id: row.id,
    organizationId: row.organizationId,
    skillId: row.skillId,
    version: row.version,
    status: row.status,
    definition: normalizeDefinition(row.definition),
    riskLevel: row.riskLevel,
    executionPolicy: row.executionPolicy,
    humanReviewPolicy: row.humanReviewPolicy,
    scope: normalizeScope(row.scope),
    fingerprint: row.fingerprint,
    createdBy: row.createdBy,
    validatedBy: row.validatedBy ?? null,
    validatedAt: iso(row.validatedAt),
    createdAt: row.createdAt.toISOString(),
    ...(Array.isArray(row.memoryLinks) ? { memoryLinks: row.memoryLinks.map(mapMemoryLink) } : {})
  };
}

function mapSkill(row: any): OrganizationalSkill {
  const versions = Array.isArray(row.versions) ? row.versions.map(mapVersion) : [];
  return {
    id: row.id,
    organizationId: row.organizationId,
    domainId: row.domainId,
    key: row.key,
    name: row.name,
    description: row.description,
    status: row.status,
    currentVersion: row.currentVersion ?? null,
    createdBy: row.createdBy,
    validatedBy: row.validatedBy ?? null,
    validatedAt: iso(row.validatedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.domain ? { domain: row.domain } : {}),
    ...(versions.length > 0 ? { currentVersionRecord: versions.find((version: OrganizationalSkillVersion) => version.version === row.currentVersion) ?? versions[0] } : {})
  };
}

function isRestrictedDomain(domain: { sensitivity: string; key: string }): boolean {
  return domain.sensitivity === "restricted" || ["finance", "accounting", "hr", "legal"].includes(domain.key);
}

async function assertMemoryLinks(
  organizationId: string,
  domainId: string,
  links: Array<{ knowledgeItemId: string; knowledgeRevision?: number; knowledgeVersionId?: string | null; relationship?: string }>
): Promise<Array<{ knowledgeItemId: string; knowledgeRevision: number; knowledgeVersionId?: string | null; relationship?: string }>> {
  if (links.length === 0) return [];
  const ids = [...new Set(links.map((link) => memoryString(link.knowledgeItemId, "knowledgeItemId", 160)))];
  const rows = await prisma.knowledgeItem.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, organizationId: true, domainId: true, revision: true, lifecycleState: true, governanceState: true } });
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const link of links) {
    const row = byId.get(link.knowledgeItemId);
    if (!row || row.organizationId !== organizationId) throw new MemoryFoundationError("RESOURCE_NOT_FOUND", "A linked Memory item was not found in this organization.", 404);
    if (row.domainId !== domainId) throw new MemoryFoundationError("CONFLICT", "A Skill cannot link Memory from another Domain without an explicit cross-Domain policy.");
    if (row.lifecycleState !== "active" || row.governanceState === "challenged") throw new MemoryFoundationError("CONFLICT", "Only active, unchallenged Memory can ground a Skill.");
    if (link.knowledgeRevision !== undefined && link.knowledgeRevision !== row.revision) throw new MemoryFoundationError("REVISION_CONFLICT", "A linked Memory item changed; reload it before linking the Skill.");
  }
  return links.map((link) => ({ ...link, knowledgeRevision: link.knowledgeRevision ?? byId.get(link.knowledgeItemId)!.revision }));
}

export async function listOrganizationalSkills(input: { organizationId: string; query?: string; domainId?: string; domainIds?: string[]; status?: string }): Promise<OrganizationalSkill[]> {
  const query = input.query?.trim();
  const rows = await prisma.organizationalSkill.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.domainId ? { domainId: input.domainId } : input.domainIds ? { domainId: { in: input.domainIds } } : {}),
      ...(input.status && SKILL_STATUSES.has(input.status) ? { status: input.status } : {}),
      ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { key: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }] } : {})
    },
    include: {
      domain: true,
      versions: { where: { status: { in: ["VALIDATED", "READY_FOR_REVIEW", "DRAFT"] } }, orderBy: { version: "desc" }, take: 1, include: { memoryLinks: true } }
    },
    orderBy: { name: "asc" },
    take: 200
  });
  return rows.map(mapSkill);
}

export async function getOrganizationalSkill(organizationId: string, skillId: string): Promise<OrganizationalSkill & { versions: OrganizationalSkillVersion[] }> {
  const row = await prisma.organizationalSkill.findUnique({
    where: { id: skillId },
    include: { domain: true, versions: { orderBy: { version: "desc" }, include: { memoryLinks: true } } }
  });
  if (!row || row.organizationId !== organizationId) throw new MemoryFoundationError("RESOURCE_NOT_FOUND", "The requested organizational Skill was not found in this organization.", 404);
  return { ...mapSkill(row), versions: row.versions.map(mapVersion) };
}

export async function createOrganizationalSkill(input: {
  organizationId: string;
  domainId: string;
  key: string;
  name: string;
  description: string;
  definition: unknown;
  riskLevel?: unknown;
  executionPolicy?: unknown;
  humanReviewPolicy?: unknown;
  scope?: unknown;
  memoryLinks?: Array<{ knowledgeItemId: string; knowledgeRevision?: number; knowledgeVersionId?: string | null; relationship?: string }>;
  createdBy: string;
}): Promise<OrganizationalSkill & { versions: OrganizationalSkillVersion[] }> {
  const domain = await loadOrganizationDomain(input.organizationId, input.domainId);
  const definition = normalizeDefinition(input.definition);
  const riskLevel = normalizeRisk(input.riskLevel);
  const executionPolicy = normalizePolicy(input.executionPolicy);
  const humanReviewPolicy = isRestrictedDomain(domain) ? "REQUIRED" : memoryString(input.humanReviewPolicy ?? "REQUIRED", "humanReviewPolicy", 80);
  const scope = normalizeScope(input.scope);
  const memoryLinks = input.memoryLinks ?? [];
  await assertMemoryLinks(input.organizationId, domain.id, memoryLinks);
  const key = memoryString(input.key, "key", 120).toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const name = memoryString(input.name, "name", 180);
  const description = memoryString(input.description, "description", 4000);
  const id = `skill-${randomUUID()}`;
  const versionId = `${id}-v1`;
  const fingerprint = digest({ key, name, description, domainId: domain.id, definition, riskLevel, executionPolicy, humanReviewPolicy, scope, memoryLinks });
  try {
    await prisma.$transaction(async (tx) => {
      await tx.organizationalSkill.create({ data: { id, organizationId: input.organizationId, domainId: domain.id, key, name, description, status: "DRAFT", currentVersion: null, createdBy: input.createdBy } });
      const version = await tx.organizationalSkillVersion.create({ data: { id: versionId, organizationId: input.organizationId, skillId: id, version: 1, status: "DRAFT", definition: json(definition), riskLevel, executionPolicy, humanReviewPolicy, scope: json(scope), fingerprint, createdBy: input.createdBy } });
      if (memoryLinks.length > 0) {
        await tx.skillMemoryLink.createMany({ data: memoryLinks.map((link) => ({ organizationId: input.organizationId, skillVersionId: version.id, knowledgeItemId: link.knowledgeItemId, knowledgeVersionId: link.knowledgeVersionId ?? null, knowledgeRevision: link.knowledgeRevision ?? 0, relationship: link.relationship ?? "grounding" })), skipDuplicates: true });
      }
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new MemoryFoundationError("CONFLICT", `The Skill key ${key} already exists.`);
    throw error;
  }
  return getOrganizationalSkill(input.organizationId, id);
}

export async function createSkillVersion(input: {
  organizationId: string;
  skillId: string;
  definition: unknown;
  riskLevel?: unknown;
  executionPolicy?: unknown;
  humanReviewPolicy?: unknown;
  scope?: unknown;
  memoryLinks?: Array<{ knowledgeItemId: string; knowledgeRevision?: number; knowledgeVersionId?: string | null; relationship?: string }>;
  createdBy: string;
}): Promise<OrganizationalSkill & { versions: OrganizationalSkillVersion[] }> {
  const skill = await getOrganizationalSkill(input.organizationId, input.skillId);
  const domain = await loadOrganizationDomain(input.organizationId, skill.domainId);
  const definition = normalizeDefinition(input.definition);
  const riskLevel = normalizeRisk(input.riskLevel);
  const executionPolicy = normalizePolicy(input.executionPolicy);
  const humanReviewPolicy = isRestrictedDomain(domain) ? "REQUIRED" : memoryString(input.humanReviewPolicy ?? "REQUIRED", "humanReviewPolicy", 80);
  const scope = normalizeScope(input.scope);
  const memoryLinks = input.memoryLinks ?? [];
  const normalizedMemoryLinks = await assertMemoryLinks(input.organizationId, domain.id, memoryLinks);
  const version = Math.max(0, ...skill.versions.map((item) => item.version)) + 1;
  const id = `${skill.id}-v${version}`;
  const fingerprint = digest({ skillId: skill.id, version, definition, riskLevel, executionPolicy, humanReviewPolicy, scope, memoryLinks: normalizedMemoryLinks });
  await prisma.$transaction(async (tx) => {
    await tx.organizationalSkillVersion.create({ data: { id, organizationId: input.organizationId, skillId: skill.id, version, status: "DRAFT", definition: json(definition), riskLevel, executionPolicy, humanReviewPolicy, scope: json(scope), fingerprint, createdBy: input.createdBy } });
    if (normalizedMemoryLinks.length > 0) await tx.skillMemoryLink.createMany({ data: normalizedMemoryLinks.map((link) => ({ organizationId: input.organizationId, skillVersionId: id, knowledgeItemId: link.knowledgeItemId, knowledgeVersionId: link.knowledgeVersionId ?? null, knowledgeRevision: link.knowledgeRevision, relationship: link.relationship ?? "grounding" })), skipDuplicates: true });
    await tx.organizationalSkill.update({ where: { id: skill.id }, data: { status: "DRAFT", currentVersion: null, validatedBy: null, validatedAt: null } });
  });
  return getOrganizationalSkill(input.organizationId, skill.id);
}

export async function transitionOrganizationalSkill(input: { organizationId: string; skillId: string; status: string; actorId: string }): Promise<OrganizationalSkill & { versions: OrganizationalSkillVersion[] }> {
  if (!SKILL_STATUSES.has(input.status)) throw new MemoryFoundationError("INVALID_REQUEST", "Invalid Skill lifecycle status.");
  const skill = await getOrganizationalSkill(input.organizationId, input.skillId);
  const candidate = skill.versions.find((version) => version.version === skill.currentVersion) ?? skill.versions[0];
  if (!candidate) throw new MemoryFoundationError("CONFLICT", "The Skill has no version to transition.");
  if (input.status === "VALIDATED") {
    if (skill.status !== "READY_FOR_REVIEW" || candidate.status !== "READY_FOR_REVIEW") throw new MemoryFoundationError("CONFLICT", "Only a Skill submitted for review can be validated.");
    await prisma.$transaction(async (tx) => {
      await tx.organizationalSkillVersion.update({ where: { id: candidate.id }, data: { status: "VALIDATED", validatedBy: input.actorId, validatedAt: new Date() } });
      await tx.organizationalSkill.update({ where: { id: skill.id }, data: { status: "VALIDATED", currentVersion: candidate.version, validatedBy: input.actorId, validatedAt: new Date() } });
    });
  } else if (input.status === "READY_FOR_REVIEW") {
    if (candidate.status !== "DRAFT" || !["DRAFT", "READY_FOR_REVIEW"].includes(skill.status)) throw new MemoryFoundationError("CONFLICT", "Only a draft Skill version can be submitted for review.");
    await prisma.$transaction(async (tx) => {
      await tx.organizationalSkillVersion.update({ where: { id: candidate.id }, data: { status: "READY_FOR_REVIEW" } });
      await tx.organizationalSkill.update({ where: { id: skill.id }, data: { status: "READY_FOR_REVIEW" } });
    });
  } else if (input.status === "SUSPENDED" || input.status === "REVOKED") {
    if (input.status === "SUSPENDED" && skill.status !== "VALIDATED") throw new MemoryFoundationError("CONFLICT", "Only a validated Skill can be suspended.");
    if (input.status === "REVOKED" && !["VALIDATED", "SUSPENDED"].includes(skill.status)) throw new MemoryFoundationError("CONFLICT", "Only a validated or suspended Skill can be revoked.");
    await prisma.$transaction(async (tx) => {
      await tx.organizationalSkill.update({ where: { id: skill.id }, data: { status: input.status } });
      if (candidate.status === "VALIDATED" || candidate.status === "SUSPENDED") await tx.organizationalSkillVersion.update({ where: { id: candidate.id }, data: { status: input.status } });
    });
  } else if (input.status === "DRAFT") {
    throw new MemoryFoundationError("CONFLICT", "Create a new Skill version to return a validated Skill to draft state.");
  }
  return getOrganizationalSkill(input.organizationId, input.skillId);
}

function mergeInputs(versions: OrganizationalSkillVersion[]): SkillInputDefinition[] {
  const merged = new Map<string, SkillInputDefinition>();
  for (const version of versions) {
    for (const input of version.definition.requiredInputs) {
      const previous = merged.get(input.key);
      if (previous && (previous.type !== input.type || previous.required !== input.required || previous.label !== input.label)) {
        throw new MemoryFoundationError("CONFLICT", `Skill input ${input.key} has incompatible definitions.`);
      }
      merged.set(input.key, input);
    }
  }
  return [...merged.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function intersect(values: string[][]): string[] {
  if (values.length === 0) return [];
  return values[0].filter((value) => values.every((items) => items.includes(value)));
}

function union(values: string[][]): string[] {
  return [...new Set(values.flat())].sort();
}

function intersectScopes(scopes: Record<string, unknown>[]): Record<string, unknown> {
  const normalized = scopes.map(normalizeScope);
  const first = stableStringify(normalized[0]);
  if (normalized.every((scope) => stableStringify(scope) === first)) return normalized[0];
  const empty = { level: "organization" };
  if (normalized.every((scope) => stableStringify(scope) === stableStringify(empty) || stableStringify(scope) === first)) return normalized[0];
  throw new MemoryFoundationError("CONFLICT", "Selected Skills have incompatible scopes.");
}

function effectiveMode(versions: OrganizationalSkillVersion[], restricted: boolean): SkillPolicy {
  const policies = versions.map((version) => normalizePolicy(version.executionPolicy));
  if (policies.includes("ADVISORY")) return "ADVISORY";
  if (restricted || policies.includes("HUMAN_APPROVAL_REQUIRED")) return "HUMAN_APPROVAL_REQUIRED";
  if (policies.includes("DRAFT_ONLY")) return "DRAFT_ONLY";
  return "BOUNDED_EXECUTION";
}

export async function composeOrganizationalSkills(input: { organizationId: string; skillVersionIds: string[]; requestedTask: string }): Promise<SkillCompositionResult> {
  const ids = [...new Set(input.skillVersionIds.map((id) => memoryString(id, "skillVersionId", 160)))];
  if (ids.length < 1 || ids.length > 12) throw new MemoryFoundationError("INVALID_REQUEST", "Select between one and twelve Skill versions.");
  const rows = await prisma.organizationalSkillVersion.findMany({ where: { organizationId: input.organizationId, id: { in: ids } }, include: { skill: { include: { domain: true } }, memoryLinks: true } });
  if (rows.length !== ids.length) throw new MemoryFoundationError("RESOURCE_NOT_FOUND", "One or more Skill versions were not found in this organization.", 404);
  const versions = rows.map(mapVersion);
  for (const row of rows) {
    if (row.status !== "VALIDATED" || row.skill.status !== "VALIDATED") throw new MemoryFoundationError("CONFLICT", "Only validated active Skill versions may be composed.");
    if (row.memoryLinks.length > 0) await assertMemoryLinks(input.organizationId, row.skill.domainId, row.memoryLinks.map((link) => ({ knowledgeItemId: link.knowledgeItemId, knowledgeRevision: link.knowledgeRevision, knowledgeVersionId: link.knowledgeVersionId, relationship: link.relationship })));
  }
  const domains = rows.map((row) => row.skill.domain);
  const restricted = domains.some(isRestrictedDomain);
  const policyMode = effectiveMode(versions, restricted);
  const riskLevel = versions.reduce<RiskLevel>((max, version) => RISK_ORDER.indexOf(normalizeRisk(version.riskLevel)) > RISK_ORDER.indexOf(max) ? normalizeRisk(version.riskLevel) : max, "low");
  const permissions = intersect(versions.map((version) => version.definition.permissions));
  if (permissions.length === 0) throw new MemoryFoundationError("FORBIDDEN", "The selected Skills have no shared permission boundary.", 403);
  const scope = intersectScopes(versions.map((version) => version.scope));
  const memoryLinks = rows.flatMap((row) => row.memoryLinks.map(mapMemoryLink));
  const warnings = [
    ...(policyMode === "HUMAN_APPROVAL_REQUIRED" ? ["Human approval is required before any external effect."] : []),
    ...(restricted ? ["A restricted Domain is included; external side effects are disabled."] : []),
    ...(riskLevel === "high" || riskLevel === "critical" ? ["High-consequence Skill policy requires human review."] : [])
  ];
  const policy: EffectiveSkillPolicy = {
    mode: policyMode,
    riskLevel,
    humanReviewRequired: policyMode === "HUMAN_APPROVAL_REQUIRED" || policyMode === "ADVISORY" || riskLevel === "high" || riskLevel === "critical" || restricted,
    externalSideEffectsAllowed: policyMode === "BOUNDED_EXECUTION" && !restricted && riskLevel !== "high" && riskLevel !== "critical",
    requiredCapabilities: union(versions.map((version) => version.definition.capabilities)),
    permissions,
    tools: union(versions.map((version) => version.definition.tools)),
    scope,
    warnings
  };
  return {
    requestedTask: memoryString(input.requestedTask, "requestedTask", 4000),
    skillVersionIds: ids,
    inputs: mergeInputs(versions),
    policy,
    memoryLinks,
    constraints: union(versions.map((version) => version.definition.constraints))
  };
}
