/* TODO-004 Batch 5.3 deterministic package-intake probe. */
const assert = require("node:assert/strict");
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
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: filename
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
const digest = require(path.join(root, "lib", "persistence", "migrationExportDigest.ts"));
const { getPrismaClient } = require(path.join(root, "lib", "server", "prisma.ts"));

const ORG_A = "test-oip-migration-intake-a";
const ORG_B = "test-oip-migration-intake-b";
const NOW = "2026-07-15T00:00:00.000Z";
const RESOURCE_NAMES = [...digest.MIGRATION_EXPORT_RESOURCE_NAMES];

function profile(id) {
  return {
    id, name: `Intake Probe ${id}`, industry: "Probe", description: "Disposable intake probe organization.",
    products: [], services: [], supportedDomains: [], businessVocabulary: [], supportedIssueTypes: [],
    outOfScopeTopics: [], customerTone: "professional", supportBoundaries: [], autoResolutionThreshold: 80,
    escalationRules: [], logoInitials: "IP", createdAt: NOW, updatedAt: NOW
  };
}

function emptyResources() {
  return {
    knowledge: [], knowledgeCandidates: [], validationRecords: [], memoryChangeRecords: [], orgMetrics: null,
    intelligenceLog: [], emergingPatterns: [], ticketRecords: [], ticketSequence: null
  };
}

async function packageFor(organizationId, changes = {}) {
  const resources = changes.resources || emptyResources();
  const sourceResourceStatuses = Object.fromEntries(RESOURCE_NAMES.map((name) => [name, {
    source: "absent", scopedPresent: false, legacyPresent: false, fallbackUsed: false,
    resetSuppressed: false, scopedRecordCount: 0, legacyRecordCount: 0,
    resolvedRecordCount: Array.isArray(resources[name]) ? resources[name].length : resources[name] === null ? 0 : 0
  }]));
  const migrationState = {
    version: "v2", sourceVersion: "v2", organizations: {
      [organizationId]: { resources: Object.fromEntries(RESOURCE_NAMES.map((name) => [name, { status: "absent", updatedAt: NOW }])) }
    }
  };
  const pkg = {
    format: "oip-localstorage-export-v1", formatVersion: 1, organizationId,
    organizationProfile: profile(organizationId), organizationProfileSource: "seed", exportedAt: NOW,
    sourceSchemaVersion: "v2", sourcePersistenceMode: "local",
    ownershipEvidence: {
      organizationId, ownershipStatus: "not-applicable", ownershipReason: "No legacy v2 storage keys are present.",
      legacyStoragePresent: false, legacyFallbackResources: [], resetSuppressed: false, safeForMigration: true
    },
    migrationState, sourceResourceStatuses, resources,
    counts: digest.countMigrationExportResources(resources),
    digests: null
  };
  pkg.digests = await digest.computeMigrationExportDigests(resources, digest.migrationExportDigestMetadata(pkg));
  return pkg;
}

async function refresh(pkg) {
  pkg.counts = digest.countMigrationExportResources(pkg.resources);
  pkg.digests = await digest.computeMigrationExportDigests(pkg.resources, digest.migrationExportDigestMetadata(pkg));
  return pkg;
}

async function deleteIfPresent(id) {
  try { await persistence.deleteOrganization(id); } catch (error) {
    if (error?.code !== "ORGANIZATION_NOT_FOUND") throw error;
  }
}

async function businessCounts(prisma, organizationId) {
  const models = ["knowledgeItem", "knowledgeCandidate", "validationRecord", "memoryChangeRecord", "ticketRecord", "emergingPattern", "intelligenceLog", "orgMetrics", "ticketSequence"];
  return Object.fromEntries(await Promise.all(models.map(async (model) => [model, await prisma[model].count({ where: { organizationId } })])));
}

async function expectCode(action, code) {
  await assert.rejects(action, (error) => error?.code === code, `expected ${code}`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the intake probe.");
  const prisma = getPrismaClient();
  try {
    await Promise.all([ORG_A, ORG_B].map(deleteIfPresent));
    await persistence.upsertOrganizationProfiles([profile(ORG_A), profile(ORG_B)]);
    const before = await businessCounts(prisma, ORG_A);
    const valid = await packageFor(ORG_A);
    const first = await migration.intakeMigrationExportPackage(valid, ORG_A);
    assert.equal(first.created, true);
    assert.equal(first.status, "ready");
    assert.equal(first.checkpoints.length, 9);
    assert(first.checkpoints.every((checkpoint) => checkpoint.status === "pending"));

    const replay = await migration.intakeMigrationExportPackage(valid, ORG_A);
    assert.equal(replay.reused, true);
    assert.equal(replay.batchId, first.batchId);
    assert.equal(await prisma.migrationImportBatch.count({ where: { organizationId: ORG_A } }), 1);
    assert.equal(await prisma.migrationImportResource.count({ where: { batchId: first.batchId } }), 9);

    const otherOrgPackage = await packageFor(ORG_B);
    otherOrgPackage.digests.resourcePayloadDigest = valid.digests.resourcePayloadDigest;
    const other = await migration.intakeMigrationExportPackage(otherOrgPackage, ORG_B);
    assert.notEqual(other.batchId, first.batchId, "identity must be organization scoped");
    await expectCode(() => migration.intakeMigrationExportPackage(valid, ORG_B), "ORGANIZATION_MISMATCH");
    await expectCode(() => migration.intakeMigrationExportPackage(valid, "test-oip-migration-intake-missing"), "ORGANIZATION_MISMATCH");

    const missing = await packageFor("test-oip-migration-intake-missing");
    await expectCode(() => migration.intakeMigrationExportPackage(missing, missing.organizationId), "ORGANIZATION_NOT_FOUND");
    await expectCode(() => migration.intakeMigrationExportPackage({ ...valid, format: "wrong" }, ORG_A), "UNSUPPORTED_EXPORT_FORMAT");
    await expectCode(() => migration.intakeMigrationExportPackage({ ...valid, formatVersion: 999 }, ORG_A), "UNSUPPORTED_EXPORT_VERSION");
    await expectCode(() => migration.intakeMigrationExportPackage({ ...valid, digests: { ...valid.digests, resourcePayloadDigest: "0".repeat(64) } }, ORG_A), "EXPORT_DIGEST_MISMATCH");
    await expectCode(() => migration.intakeMigrationExportPackage({ ...valid, counts: { ...valid.counts, knowledgeItems: 1 } }, ORG_A), "COUNT_MISMATCH");

    const ambiguous = await packageFor(ORG_A);
    ambiguous.ownershipEvidence = { ...ambiguous.ownershipEvidence, ownershipStatus: "ambiguous", safeForMigration: false };
    await refresh(ambiguous);
    await expectCode(() => migration.intakeMigrationExportPackage(ambiguous, ORG_A), "OWNERSHIP_INVALID");
    const resetSuppressed = await packageFor(ORG_A);
    resetSuppressed.ownershipEvidence = { ...resetSuppressed.ownershipEvidence, resetSuppressed: true, legacyFallbackResources: ["knowledge"], legacyStoragePresent: true, safeForMigration: false, legacyOwnerOrganizationId: ORG_A };
    await refresh(resetSuppressed);
    await expectCode(() => migration.intakeMigrationExportPackage(resetSuppressed, ORG_A), "OWNERSHIP_INVALID");

    const duplicate = await packageFor(ORG_A, { resources: { ...emptyResources(), knowledge: [{ id: "duplicate" }, { id: "duplicate" }] } });
    await refresh(duplicate);
    await expectCode(() => migration.intakeMigrationExportPackage(duplicate, ORG_A), "INVALID_EXPORT_PACKAGE");
    const brokenReference = await packageFor(ORG_A, { resources: { ...emptyResources(), validationRecords: [{ id: "validation-1", candidateId: "missing-candidate" }] } });
    await refresh(brokenReference);
    await expectCode(() => migration.intakeMigrationExportPackage(brokenReference, ORG_A), "INVALID_EXPORT_PACKAGE");

    const incompatible = await packageFor(ORG_A);
    incompatible.organizationProfile = { ...incompatible.organizationProfile, name: "Changed Metadata" };
    await refresh(incompatible);
    assert.equal(incompatible.digests.resourcePayloadDigest, valid.digests.resourcePayloadDigest);
    await expectCode(() => migration.intakeMigrationExportPackage(incompatible, ORG_A), "CONFLICT");

    const after = await businessCounts(prisma, ORG_A);
    assert.deepEqual(after, before, "package intake must not mutate business resource rows");
    assert.equal(await prisma.migrationImportBatch.count({ where: { organizationId: ORG_A } }), 1);
    console.log("migration intake probe passed: valid, idempotent, isolated, validated, and business-data read-only");
  } finally {
    await Promise.all([ORG_A, ORG_B].map(deleteIfPresent));
  }
}

if (require.main === module) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}

module.exports = { packageFor, refresh, deleteIfPresent, profile, persistence, getPrismaClient, ORG_A, ORG_B };
