/*
 * TODO-004 Batch 5.2 metadata-only probe.
 *
 * Uses disposable organizations and writes only import metadata plus the
 * disposable organization rows needed to bind that metadata. It never writes
 * KnowledgeItems, candidates, audit records, tickets, metrics, patterns,
 * intelligence logs, or TicketSequence rows.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const root = path.resolve(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveProjectAlias(request, parent, isMain, options) {
  if (request === "server-only") return path.join(__dirname, "stubs", "server-only.cjs");
  if (request.startsWith("@/")) {
    const mapped = path.join(root, request.slice(2));
    if (fs.existsSync(`${mapped}.ts`)) return `${mapped}.ts`;
    if (fs.existsSync(`${mapped}.tsx`)) return `${mapped}.tsx`;
    if (fs.existsSync(path.join(mapped, "index.ts"))) return path.join(mapped, "index.ts");
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

for (const extension of [".ts", ".tsx"]) {
  require.extensions[extension] = function transpileTypeScript(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: filename,
    });
    const compiled = output.outputText.replace(
      /import\.meta\.url/g,
      "require('node:url').pathToFileURL(__filename).href"
    );
    module._compile(compiled, filename);
  };
}

const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const migration = require(path.join(root, "lib", "server", "migrationImportService.ts"));
const { getPrismaClient } = require(path.join(root, "lib", "server", "prisma.ts"));
const { MIGRATION_IMPORT_RESOURCE_TYPES } = require(path.join(root, "types", "migrationImport.ts"));

const ORG_A = "test-oip-migration-meta-a";
const ORG_B = "test-oip-migration-meta-b";
const ORG_C = "test-oip-migration-meta-c";
const NOW = "2026-07-15T00:00:00.000Z";

function profile(id, name) {
  return {
    id,
    name,
    industry: "Migration metadata probe",
    description: "Disposable metadata probe organization.",
    products: [],
    services: [],
    supportedDomains: [],
    businessVocabulary: [],
    supportedIssueTypes: [],
    outOfScopeTopics: [],
    customerTone: "professional",
    supportBoundaries: [],
    autoResolutionThreshold: 80,
    escalationRules: [],
    logoInitials: "MTP",
    createdAt: NOW,
    updatedAt: NOW
  };
}

function digest(seed) {
  return crypto.createHash("sha256").update(String(seed)).digest("hex");
}

function manifest(organizationId, suffix = "a", knowledgeCount = 1) {
  const resourceDigests = Object.fromEntries(
    MIGRATION_IMPORT_RESOURCE_TYPES.map((resourceType, index) => [resourceType, digest(`${suffix}${index + 1}`)])
  );
  return {
    organizationId,
    sourceOrganizationId: organizationId,
    format: "oip-localstorage-export-v1",
    formatVersion: 1,
    resourcePayloadDigest: digest(`package-${suffix}`),
    metadataDigest: digest(`metadata-${suffix}`),
    sourcePersistenceMode: "local",
    sourceSchemaVersion: "v2",
    exportedAt: NOW,
    counts: {
      knowledgeItems: knowledgeCount,
      lessons: 0,
      knowledgeVersions: 0,
      knowledgeCandidates: 0,
      validationRecords: 0,
      memoryChangeRecords: 0,
      ticketRecords: 0,
      emergingPatterns: 0,
      intelligenceLogEntries: 0,
      metricsPresent: false,
      ticketSequenceValue: null
    },
    resourceDigests
  };
}

async function deleteIfPresent(service, id) {
  try {
    await service.deleteOrganization(id);
  } catch (error) {
    if (error?.code !== "ORGANIZATION_NOT_FOUND") throw error;
  }
}

async function businessCounts(prisma, organizationId) {
  const models = [
    "knowledgeItem", "knowledgeCandidate", "validationRecord", "memoryChangeRecord",
    "ticketRecord", "emergingPattern", "intelligenceLog", "orgMetrics", "ticketSequence"
  ];
  return Object.fromEntries(await Promise.all(models.map(async (model) => [
    model,
    await prisma[model].count({ where: { organizationId } })
  ])));
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the metadata probe.");
  const prisma = getPrismaClient();
  const ids = [ORG_A, ORG_B, ORG_C];
  try {
    await Promise.all(ids.map((id) => deleteIfPresent(persistence, id)));
    await persistence.upsertOrganizationProfiles(ids.map((id) => profile(id, id)));

    const beforeBusiness = await businessCounts(prisma, ORG_A);
    assert.deepEqual(Object.values(beforeBusiness), new Array(Object.keys(beforeBusiness).length).fill(0));

    const first = await migration.initializeMigrationImport(manifest(ORG_A, "a", 1));
    assert.equal(first.resourceCheckpoints.length, 9, "initialization must create nine checkpoints");
    assert.equal(first.status, "pending");

    const replay = await migration.initializeMigrationImport(manifest(ORG_A, "a", 1));
    assert.equal(replay.id, first.id, "same organization and digest must be idempotent");
    assert.equal((await prisma.migrationImportBatch.count({ where: { organizationId: ORG_A } })), 1);
    assert.equal((await prisma.migrationImportResource.count({ where: { batchId: first.id } })), 9);

    const sameDigestOtherOrg = manifest(ORG_B, "a", 1);
    sameDigestOtherOrg.resourcePayloadDigest = manifest(ORG_A, "a", 1).resourcePayloadDigest;
    const secondOrg = await migration.initializeMigrationImport(sameDigestOtherOrg);
    assert.notEqual(secondOrg.id, first.id, "same digest must remain organization-scoped");

    const differentDigest = await migration.initializeMigrationImport(manifest(ORG_A, "b", 0));
    assert.notEqual(differentDigest.id, first.id, "a different digest creates a separate batch");

    await assert.rejects(
      () => prisma.migrationImportResource.create({
        data: {
          batchId: first.id,
          resourceType: "knowledge",
          expectedCount: 1,
          sourceDigest: digest("duplicate")
        }
      }),
      (error) => error?.code === "P2002",
      "duplicate batch/resource checkpoint must be rejected"
    );

    const conflict = await migration.recordMigrationImportConflict({
      batchId: first.id,
      organizationId: ORG_A,
      resourceType: "knowledge",
      fingerprint: "knowledge:probe-1:source-vs-target",
      sourceRecordId: "probe-knowledge-1",
      conflictType: "same_id_different_content",
      sourceDigest: digest("source"),
      targetDigest: digest("target"),
      sourceSnapshot: { id: "probe-knowledge-1", safe: true },
      targetSnapshot: { id: "probe-knowledge-1", safe: true },
      reason: "Probe conflict evidence"
    });
    assert.equal(conflict.status, "open");
    assert.equal((await migration.listUnresolvedMigrationConflicts(ORG_A, first.id)).length, 1);

    await assert.rejects(
      () => migration.markMigrationImportBatchVerified(ORG_A, first.id),
      /resource checkpoint|unresolved conflict/i,
      "incomplete/open-conflict batch must not verify"
    );
    await assert.rejects(
      () => migration.updateMigrationImportResource(ORG_A, first.id, {
        resourceType: "knowledge",
        status: "verified",
        importedCount: 0,
        skippedIdenticalCount: 0
      }),
      /incomplete/i,
      "incomplete resource must not verify"
    );

    await migration.resolveMigrationImportConflict(ORG_A, first.id, conflict.id, "resolved_manual");
    const checkpoints = await migration.getMigrationImportBatch(ORG_A, first.id);
    for (const checkpoint of checkpoints.resourceCheckpoints) {
      await migration.updateMigrationImportResource(ORG_A, first.id, {
        resourceType: checkpoint.resourceType,
        status: "verified",
        importedCount: checkpoint.expectedCount,
        skippedIdenticalCount: 0,
        conflictCount: checkpoint.resourceType === "knowledge" ? 1 : 0,
        targetDigest: checkpoint.sourceDigest
      });
    }
    const verified = await migration.markMigrationImportBatchVerified(ORG_A, first.id);
    assert.equal(verified.status, "verified");
    assert.equal(verified.unresolvedConflictCount, 0);

    const failedOrgManifest = manifest(ORG_C, "invalid", 0);
    failedOrgManifest.resourceDigests.knowledge = "not-a-digest";
    await assert.rejects(() => migration.initializeMigrationImport(failedOrgManifest), /SHA-256|digest/i);
    assert.equal(await prisma.migrationImportBatch.count({ where: { organizationId: ORG_C } }), 0, "invalid initialization leaves no batch");
    assert.equal(await prisma.migrationImportResource.count({ where: { batchId: "missing" } }), 0);

    for (const id of ids) {
      assert.deepEqual(await businessCounts(prisma, id), beforeBusiness, "metadata operations must not write business resources");
    }
  } finally {
    await Promise.all(ids.map((id) => deleteIfPresent(persistence, id)));
  }

  for (const id of ids) {
    assert.equal(await prisma.migrationImportBatch.count({ where: { organizationId: id } }), 0, "organization cascade must clean batches");
    assert.equal(await prisma.migrationImportResource.count({ where: { batch: { organizationId: id } } }), 0, "organization cascade must clean checkpoints");
    assert.equal(await prisma.migrationImportConflict.count({ where: { organizationId: id } }), 0, "organization cascade must clean conflicts");
  }

  await prisma.$disconnect();
  console.log("Migration metadata probe passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
