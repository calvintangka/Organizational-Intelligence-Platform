/* Idempotently seed the fixed PostgreSQL-backed regression organization. */
const assert = require("node:assert/strict");

const { populatedPackage } = require("./migration-import-probe.cjs");
const { refresh, persistence, getPrismaClient } = require("./migration-intake-probe.cjs");
const migration = require("../lib/server/migrationImportService.ts");
const execution = require("../lib/server/migrationImportExecutionService.ts");
const verification = require("../lib/server/migrationVerificationService.ts");
const authority = require("../lib/server/persistenceAuthorityService.ts");

const TEST_ORGANIZATION_ID = "test-oip-regression";
const MATURE_ORGANIZATION_IDS = new Set([
  "profile-maesa-tech",
  "profile-fastdrop-logistics",
  "profile-pramana-legal"
]);
const NOW = "2026-07-15T00:00:00.000Z";

function assertRegressionOrganizationId(id) {
  if (MATURE_ORGANIZATION_IDS.has(id) || id !== TEST_ORGANIZATION_ID) {
    throw new Error(`Refusing to seed organization ${id}; only ${TEST_ORGANIZATION_ID} is allowed.`);
  }
}

function regressionProfile() {
  return {
    id: TEST_ORGANIZATION_ID,
    name: "OIP Regression Test",
    industry: "Software / SaaS",
    description: "Dedicated deterministic organization for OIP regression testing.",
    products: ["OIP regression fixture"],
    services: ["regression testing"],
    supportedDomains: ["access", "billing", "technical support"],
    businessVocabulary: ["regression fixture", "known test state"],
    supportedIssueTypes: ["access", "billing", "technical support"],
    outOfScopeTopics: [],
    customerTone: "professional",
    supportBoundaries: ["This organization is for testing only."],
    autoResolutionThreshold: 80,
    escalationRules: ["Escalate failed regression scenarios."],
    logoInitials: "OR",
    createdAt: NOW,
    updatedAt: NOW
  };
}

async function deleteIfPresent(id) {
  assertRegressionOrganizationId(id);
  try {
    await persistence.deleteOrganization(id);
  } catch (error) {
    if (error?.code !== "ORGANIZATION_NOT_FOUND") throw error;
  }
}

async function ensureDevelopmentMembership(prisma) {
  const email = process.env.AUTH_DEVELOPMENT_USER_EMAIL?.trim().toLowerCase();
  if (!email) return { email: null, assigned: false };

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return { email, assigned: false };

  await prisma.organizationMembership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: TEST_ORGANIZATION_ID } },
    create: { userId: user.id, organizationId: TEST_ORGANIZATION_ID, role: "member" },
    update: {}
  });
  return { email, assigned: true };
}

async function seedTestOrganization() {
  assertRegressionOrganizationId(TEST_ORGANIZATION_ID);
  const prisma = getPrismaClient();

  const existingMemberships = await prisma.organizationMembership.findMany({
    where: { organizationId: TEST_ORGANIZATION_ID },
    select: { userId: true, role: true }
  });
  await deleteIfPresent(TEST_ORGANIZATION_ID);
  await persistence.upsertOrganizationProfile(regressionProfile());

  const exportPackage = await populatedPackage(TEST_ORGANIZATION_ID);
  exportPackage.organizationProfile = regressionProfile();
  await refresh(exportPackage);

  const intake = await migration.intakeMigrationExportPackage(exportPackage, TEST_ORGANIZATION_ID);
  const imported = await execution.executeMigrationImport(TEST_ORGANIZATION_ID, intake.batchId);
  assert.equal(imported.status, "imported");

  const verified = await verification.verifyMigrationImport(TEST_ORGANIZATION_ID, intake.batchId);
  assert.equal(verified.status, "passed");

  const cutover = await authority.cutOverToServerAuthority(
    TEST_ORGANIZATION_ID,
    intake.batchId,
    "Persistent deterministic regression organization"
  );
  assert.equal(cutover.authority, "server");

  if (existingMemberships.length > 0) {
    await prisma.organizationMembership.createMany({
      data: existingMemberships.map((membership) => ({ ...membership, organizationId: TEST_ORGANIZATION_ID })),
      skipDuplicates: true
    });
  }
  const membership = await ensureDevelopmentMembership(prisma);
  const organization = await prisma.organization.findUnique({ where: { id: TEST_ORGANIZATION_ID } });
  const counts = {};
  for (const model of [
    "knowledgeItem", "knowledgeCandidate", "validationRecord", "memoryChangeRecord",
    "ticketRecord", "emergingPattern", "intelligenceLog", "orgMetrics", "ticketSequence"
  ]) {
    counts[model] = await prisma[model].count({ where: { organizationId: TEST_ORGANIZATION_ID } });
  }
  const sequence = await prisma.ticketSequence.findUnique({ where: { organizationId: TEST_ORGANIZATION_ID } });

  return {
    organizationId: organization.id,
    name: organization.name,
    authority: cutover.authority,
    migrationBatchId: intake.batchId,
    counts,
    ticketSequence: sequence?.counter ?? null,
    membership
  };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const result = await seedTestOrganization();
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { TEST_ORGANIZATION_ID, regressionProfile, seedTestOrganization };
