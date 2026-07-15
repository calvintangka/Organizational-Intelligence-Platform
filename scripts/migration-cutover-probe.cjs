/* TODO-004 Batch 5.8 disposable per-organization persistence cutover probe. */
const assert = require("node:assert/strict");

// A server-capable deployment is simulated so the client authority resolver and
// routing adapter exercise their per-organization paths. This is set BEFORE any
// project module is required so module-time construction sees it.
process.env.NEXT_PUBLIC_OIP_PERSISTENCE_MODE = "server";

// Reuse only the intake probe's TypeScript/alias/bootstrap. Disposable data only.
const {
  persistence: persistenceService,
  profile,
  getPrismaClient,
  deleteIfPresent
} = require("./migration-intake-probe.cjs");
const { populatedPackage } = require("./migration-import-probe.cjs");
const intake = require("../lib/server/migrationImportService.ts");
const execution = require("../lib/server/migrationImportExecutionService.ts");
const verification = require("../lib/server/migrationVerificationService.ts");
const authority = require("../lib/server/persistenceAuthorityService.ts");

const MATURE_ORGANIZATION_IDS = new Set([
  "profile-maesa-tech",
  "profile-fastdrop-logistics",
  "profile-pramana-legal"
]);

const ORG_UNVERIFIED = "test-oip-cutover-unverified";
const ORG_IMPORTED = "test-oip-cutover-imported";
const ORG_VERIFIED = "test-oip-cutover-verified";
const ORG_LOCAL = "test-oip-cutover-local";
const ORG_CONFLICT = "test-oip-cutover-conflict";
const ORG_CONFLICT_TARGET = "test-oip-cutover-conflict-target";
const ORG_CROSS_A = "test-oip-cutover-cross-a";
const ORG_CROSS_B = "test-oip-cutover-cross-b";
const NOW = "2026-07-15T00:00:00.000Z";

const ALL_ORGS = [
  ORG_UNVERIFIED, ORG_IMPORTED, ORG_VERIFIED, ORG_LOCAL,
  ORG_CONFLICT, ORG_CONFLICT_TARGET, ORG_CROSS_A, ORG_CROSS_B
];

// ---- localStorage shim so LocalStorageAdapter and the client cache work ----
class MemoryStorage {
  constructor() { this.values = new Map(); this.setCalls = 0; this.removeCalls = 0; }
  get length() { return this.values.size; }
  key(i) { return [...this.values.keys()][i] ?? null; }
  getItem(k) { return this.values.has(String(k)) ? this.values.get(String(k)) : null; }
  setItem(k, v) { this.setCalls += 1; this.values.set(String(k), String(v)); }
  removeItem(k) { this.removeCalls += 1; this.values.delete(String(k)); }
  clear() { this.values.clear(); }
}
let storage = new MemoryStorage();
global.window = { localStorage: storage };
function storageSnapshot() {
  return Object.fromEntries([...storage.values.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

// The client persistence barrel + resolver are required AFTER window exists.
const persistenceBarrel = require("../lib/persistence/index.ts");
const authorityRouting = require("../lib/persistence/authorityRouting.ts");
const { ServerPersistenceAdapter } = require("../lib/persistence/serverPersistenceAdapter.ts");
const { LocalStorageAdapter } = require("../lib/persistence/localStorageAdapter.ts");

function assertDisposable(id) {
  if (MATURE_ORGANIZATION_IDS.has(id)) throw new Error(`Safety guard: mature organization ${id} is outside probe scope.`);
}

// ---- fetch shim: routes the authority GET to the real service ----
const realFetch = global.fetch;
let fetchMode = "live"; // "live" | "down"
global.fetch = async (path, init) => {
  if (fetchMode === "down") throw new Error("simulated network failure");
  const url = String(path);
  const match = url.match(/\/api\/organizations\/([^/]+)\/persistence-authority$/);
  if (match && (!init || (init.method ?? "GET") === "GET")) {
    const id = decodeURIComponent(match[1]);
    try {
      const data = await authority.getPersistenceAuthorityState(id);
      return { ok: true, status: 200, json: async () => ({ data }) };
    } catch (error) {
      const safe = authority.toSafePersistenceAuthorityError(error);
      return { ok: false, status: safe.status, json: async () => ({ error: { code: safe.code, message: safe.message } }) };
    }
  }
  throw new Error(`Unexpected fetch in probe: ${url}`);
};

async function intakeVerify(organizationId) {
  const pkg = await populatedPackage(organizationId);
  const intaken = await intake.intakeMigrationExportPackage(pkg, organizationId);
  const imported = await execution.executeMigrationImport(organizationId, intaken.batchId);
  assert.equal(imported.status, "imported");
  const verified = await verification.verifyMigrationImport(organizationId, intaken.batchId);
  assert.equal(verified.status, "passed");
  assert.equal(verified.summary.status, "verified");
  return { batchId: intaken.batchId, pkg };
}

async function expectCutoverCode(action, code) {
  await assert.rejects(action, (error) => error?.code === code, `expected ${code}`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the migration cutover probe.");
  ALL_ORGS.forEach(assertDisposable);
  const prisma = getPrismaClient();
  try {
    await Promise.all(ALL_ORGS.map(deleteIfPresent));
    await persistenceService.upsertOrganizationProfiles(ALL_ORGS.map((id) => profile(id)));

    /* ---- S: no mature organization ids are used ---- */
    ALL_ORGS.forEach((id) => assert.equal(MATURE_ORGANIZATION_IDS.has(id), false));

    /* ---- default authority resolves to local (no record) ---- */
    const defaultState = await authority.getPersistenceAuthorityState(ORG_VERIFIED);
    assert.equal(defaultState.authority, "local");
    assert.equal(defaultState.hasRecord, false);
    assert.equal(defaultState.cutoverAt, null);
    assert.equal(defaultState.migrationBatchId, null);

    /* ---- A: unverified (ready/intake-only) batch cannot cut over ---- */
    const unverifiedPkg = await populatedPackage(ORG_UNVERIFIED);
    const unverifiedIntake = await intake.intakeMigrationExportPackage(unverifiedPkg, ORG_UNVERIFIED);
    await expectCutoverCode(() => authority.cutOverToServerAuthority(ORG_UNVERIFIED, unverifiedIntake.batchId), "CUTOVER_NOT_ELIGIBLE");
    assert.equal((await authority.getPersistenceAuthorityState(ORG_UNVERIFIED)).authority, "local");

    /* ---- B: imported-but-not-verified batch cannot cut over ---- */
    const importedPkg = await populatedPackage(ORG_IMPORTED);
    const importedIntake = await intake.intakeMigrationExportPackage(importedPkg, ORG_IMPORTED);
    const importedResult = await execution.executeMigrationImport(ORG_IMPORTED, importedIntake.batchId);
    assert.equal(importedResult.status, "imported");
    await expectCutoverCode(() => authority.cutOverToServerAuthority(ORG_IMPORTED, importedIntake.batchId), "CUTOVER_NOT_ELIGIBLE");
    assert.equal((await authority.getPersistenceAuthorityState(ORG_IMPORTED)).authority, "local");
    // The fixture reuses globally-unique record ids; free them before the next import.
    await deleteIfPresent(ORG_IMPORTED);

    /* ---- C/D/E/R: verified batch can cut over; authority becomes server;
            localStorage preserved byte-for-byte ---- */
    const scopedKey = `oip.organization.${encodeURIComponent(ORG_VERIFIED)}.knowledge.v1`;
    storage.setItem(scopedKey, JSON.stringify([{ id: "local-evidence", title: "preserved" }]));
    const beforeCutoverStorage = storageSnapshot();
    const { batchId: verifiedBatch } = await intakeVerify(ORG_VERIFIED);
    const cutover = await authority.cutOverToServerAuthority(ORG_VERIFIED, verifiedBatch, "probe cutover");
    assert.equal(cutover.authority, "server");                 // D
    assert.equal(cutover.idempotent, false);                   // C
    assert.equal(cutover.migrationBatchId, verifiedBatch);     // batch binding
    assert.ok(cutover.cutoverAt);                               // audit metadata
    const afterCutoverState = await authority.getPersistenceAuthorityState(ORG_VERIFIED);
    assert.equal(afterCutoverState.authority, "server");
    assert.equal(afterCutoverState.previousAuthority, "local");
    assert.equal(afterCutoverState.migrationBatchId, verifiedBatch);
    assert.ok(afterCutoverState.updatedAt);
    assert.equal(afterCutoverState.verification.overallStatus, "passed");
    assert.deepEqual(storageSnapshot(), beforeCutoverStorage); // E + R: local source untouched

    /* ---- M: cutover is idempotent for the same batch ---- */
    const idempotent = await authority.cutOverToServerAuthority(ORG_VERIFIED, verifiedBatch);
    assert.equal(idempotent.idempotent, true);
    assert.equal(idempotent.authority, "server");
    assert.equal(idempotent.migrationBatchId, verifiedBatch);
    assert.equal(await prisma.organizationPersistenceAuthority.count({ where: { organizationId: ORG_VERIFIED } }), 1);

    /* ---- one-way: re-pointing a server organization at a different batch is rejected ---- */
    await expectCutoverCode(() => authority.cutOverToServerAuthority(ORG_VERIFIED, "a-different-batch-id"), "AUTHORITY_CONFLICT");

    /* ---- F/G/H/I/J/P/Q: adapter + backend routing ---- */
    // F/G: authority selects the concrete adapter.
    assert.ok(persistenceBarrel.persistenceAdapterForAuthority("server") instanceof ServerPersistenceAdapter);
    assert.ok(persistenceBarrel.persistenceAdapterForAuthority("local") instanceof LocalStorageAdapter);
    const serverAdapterForVerified = await persistenceBarrel.getPersistenceAdapterForOrganization(ORG_VERIFIED);
    assert.ok(serverAdapterForVerified instanceof ServerPersistenceAdapter); // reads route to server
    const localAdapterForLocal = await persistenceBarrel.getPersistenceAdapterForOrganization(ORG_LOCAL);
    assert.ok(localAdapterForLocal instanceof LocalStorageAdapter);          // J: local org uses localStorage

    // H: server-authoritative ticket IDs come from the PostgreSQL TicketSequence.
    const serverTicketIds = await persistenceService.allocateTicketIds(ORG_VERIFIED, 2);
    assert.equal(serverTicketIds.length, 2);
    assert.ok((await prisma.ticketSequence.findUnique({ where: { organizationId: ORG_VERIFIED } })).counter >= 2);

    // I: server writes leave localStorage untouched (no LocalStorageAdapter writes).
    const setCallsBefore = storage.setCalls;
    await persistenceService.saveKnowledge(ORG_VERIFIED, [{
      id: "server-write-1", organizationId: ORG_VERIFIED, title: "Server write", problem: "p", approvedAnswer: "a",
      category: "access", tags: [], sourceTicketId: "MT-20260715-0001", timesReused: 0, createdAt: NOW, approvedAt: NOW, revision: 0,
      lessons: [], knowledgeVersions: [], learningHistory: [], exampleTickets: []
    }]);
    assert.equal((await persistenceService.loadKnowledge(ORG_VERIFIED)).some((k) => k.id === "server-write-1"), true);
    assert.equal(storage.setCalls, setCallsBefore, "server writes must not write localStorage");

    // P/Q: reset and delete route to the correct backend.
    await persistenceService.resetOrganizationData(ORG_VERIFIED); // server reset clears DB
    assert.equal((await persistenceService.loadKnowledge(ORG_VERIFIED)).length, 0);
    const localScoped = `oip.organization.${encodeURIComponent(ORG_LOCAL)}.knowledge.v1`;
    storage.setItem(localScoped, JSON.stringify([{ id: "x" }]));
    await localAdapterForLocal.resetOrganization(ORG_LOCAL); // local reset clears localStorage scope
    assert.equal(storage.getItem(localScoped), null);

    /* ---- K: Local -> Server -> Local -> Server switching selects correctly ---- */
    fetchMode = "live";
    assert.equal(await authorityRouting.resolveOrganizationAuthority(ORG_LOCAL), "local");
    assert.equal(await authorityRouting.resolveOrganizationAuthority(ORG_VERIFIED), "server");
    await persistenceBarrel.activatePersistenceOrganization(ORG_LOCAL);
    assert.equal(persistenceBarrel.activePersistenceMode(), "local");
    await persistenceBarrel.activatePersistenceOrganization(ORG_VERIFIED);
    assert.equal(persistenceBarrel.activePersistenceMode(), "server");
    await persistenceBarrel.activatePersistenceOrganization(ORG_LOCAL);
    assert.equal(persistenceBarrel.activePersistenceMode(), "local");
    await persistenceBarrel.activatePersistenceOrganization(ORG_VERIFIED);
    assert.equal(persistenceBarrel.activePersistenceMode(), "server");

    /* ---- L: server unavailable does not fall back to localStorage ---- */
    fetchMode = "down";
    // A server-known organization with no durable local evidence blocks (no fallback).
    await assert.rejects(
      () => authorityRouting.resolveOrganizationAuthority(ORG_VERIFIED),
      (error) => error instanceof authorityRouting.AuthorityDiscoveryError
    );
    // A durably-local organization still resolves local from client evidence.
    assert.equal(authorityRouting.cachedAuthority(ORG_LOCAL), "local");
    assert.equal(await authorityRouting.resolveOrganizationAuthority(ORG_LOCAL), "local");
    fetchMode = "live";

    /* ---- N: cross-organization batch cutover is rejected ---- */
    const { batchId: crossBatch } = await intakeVerify(ORG_CROSS_A);
    await expectCutoverCode(() => authority.cutOverToServerAuthority(ORG_CROSS_B, crossBatch), "CROSS_ORGANIZATION_BATCH");
    assert.equal((await authority.getPersistenceAuthorityState(ORG_CROSS_B)).authority, "local");
    // Free the fixture ids so the conflict case can establish its own collision.
    await deleteIfPresent(ORG_CROSS_A);

    /* ---- O: organization with unresolved conflict cannot cut over ---- */
    const conflictPkg = await populatedPackage(ORG_CONFLICT);
    await prisma.knowledgeItem.create({ data: {
      id: "import-knowledge-1", organizationId: ORG_CONFLICT_TARGET, title: "Owned by another organization",
      category: "access", lifecycleState: "active", sourceTicketId: "foreign", createdAt: new Date(NOW), approvedAt: new Date(NOW),
      revision: 1, timesReused: 0,
      content: { problem: "foreign", approvedAnswer: "foreign", tags: [], lessons: [], knowledgeVersions: [], learningHistory: [], exampleTickets: [] }
    } });
    const conflictIntake = await intake.intakeMigrationExportPackage(conflictPkg, ORG_CONFLICT);
    const conflictImport = await execution.executeMigrationImport(ORG_CONFLICT, conflictIntake.batchId);
    assert.equal(conflictImport.status, "conflict");
    await expectCutoverCode(() => authority.cutOverToServerAuthority(ORG_CONFLICT, conflictIntake.batchId), "CUTOVER_NOT_ELIGIBLE");
    assert.equal((await authority.getPersistenceAuthorityState(ORG_CONFLICT)).authority, "local");

    /* ---- Q: deleting a server-authoritative organization cascades in PostgreSQL,
            including its authority row; localStorage is not touched by the server delete ---- */
    const beforeDeleteStorage = storageSnapshot();
    await persistenceService.deleteOrganization(ORG_VERIFIED);
    assert.equal(await prisma.organization.count({ where: { id: ORG_VERIFIED } }), 0);
    assert.equal(await prisma.organizationPersistenceAuthority.count({ where: { organizationId: ORG_VERIFIED } }), 0);
    assert.deepEqual(storageSnapshot(), beforeDeleteStorage);

    console.log("migration cutover probe passed: unverified/imported/conflict rejection, verified cutover, server authority, byte-identical localStorage preservation, adapter/ticket/reset/delete routing, idempotency, one-way, cross-org rejection, local switching, and no-fallback discovery failure");
  } finally {
    global.fetch = realFetch;
    await Promise.all(ALL_ORGS.map(deleteIfPresent));
  }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { intakeVerify };
