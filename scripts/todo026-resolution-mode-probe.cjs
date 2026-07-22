/*
 * TODO-026 durable resolution-mode probe.
 *
 * Verifies that TicketRecord.resolutionMode is persisted, round-trips through
 * server persistence and the migration import/export pipeline, that legacy
 * packages import as null, that null is never counted as human, and that the
 * auto-vs-human split is independently reconstructable for known-mode rows.
 *
 * Uses disposable organizations that are always deleted, and asserts protected
 * organizations are unchanged.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

const { refresh, deleteIfPresent, profile, persistence, getPrismaClient } = require("./migration-intake-probe.cjs");
const { packageFor } = require("./migration-intake-probe.cjs");
const migration = require(path.join(root, "lib", "server", "migrationImportService.ts"));
const execution = require(path.join(root, "lib", "server", "migrationImportExecutionService.ts"));
const verification = require(path.join(root, "lib", "server", "migrationVerificationService.ts"));
const { deriveResolutionModeCounts } = require(path.join(root, "lib", "metrics.ts"));

const PROTECTED = ["profile-maesa-tech", "profile-fastdrop-logistics", "profile-pramana-legal", "test-oip-regression", "profile-oip-developer-demo"];
const A = "todo026-fixture-server";
const B = "todo026-fixture-migrate";
const C = "todo026-fixture-legacy";
const cases = {};

function mkTicket(orgId, ticketId, opts) {
  const { status, mode, humanEdited = false, resolvedAt = null, legacy = false } = opts;
  const ticket = {
    ticketId,
    orgId,
    createdAt: "2023-05-01T00:00:00.000Z",
    rawMessage: `raw ${ticketId}`,
    subject: `subject ${ticketId}`,
    classification: null,
    memoryMatch: null,
    draftSource: null,
    resolution: { finalResponse: resolvedAt ? "done" : null, humanEdited, editDistanceNote: null, resolvedAt },
    reflection: { decision: null, lessonCreatedId: null, lessonReinforcedId: null, knowledgeChanged: null },
    validationRecordIds: [],
    status
  };
  // legacy = omit the field entirely, mirroring a pre-TODO-026 package/row.
  if (!legacy) ticket.resolutionMode = mode;
  return ticket;
}

async function protectedSnapshot(prisma) {
  const out = {};
  for (const id of PROTECTED) {
    const where = { organizationId: id };
    out[id] = crypto.createHash("sha256").update(JSON.stringify({
      tickets: await prisma.ticketRecord.count({ where }),
      resolvedModeRows: await prisma.ticketRecord.count({ where: { organizationId: id, resolutionMode: { not: null } } }),
      knowledge: await prisma.knowledgeItem.count({ where }),
      evidence: await prisma.trustEvidence.count({ where })
    })).digest("hex");
  }
  return out;
}

async function serverRoundTrip(prisma) {
  await deleteIfPresent(A);
  await persistence.upsertOrganizationProfile(profile(A));
  const tickets = [
    mkTicket(A, "TP-20230501-0001", { status: "resolved", mode: "human", resolvedAt: "2023-05-01T01:00:00.000Z" }),         // A
    mkTicket(A, "TP-20230501-0002", { status: "resolved", mode: "automatic", resolvedAt: "2023-05-01T01:00:00.000Z" }),     // B
    mkTicket(A, "TP-20230501-0003", { status: "resolved", mode: "human", humanEdited: true, resolvedAt: "2023-05-01T01:00:00.000Z" }), // C
    mkTicket(A, "TP-20230501-0004", { status: "open", mode: null }),                                                        // D unresolved
    mkTicket(A, "TP-20230501-0005", { status: "resolved", mode: null, resolvedAt: "2023-05-01T01:00:00.000Z" })             // E historical null completed
  ];
  await persistence.saveTicketRecords(A, tickets);
  const loaded = await persistence.loadTicketRecords(A);
  const byId = new Map(loaded.map((t) => [t.ticketId, t]));

  assert.equal(byId.get("TP-20230501-0001").resolutionMode, "human", "CASE A human preserved");
  cases.A_humanCompleted = "PASS";
  assert.equal(byId.get("TP-20230501-0002").resolutionMode, "automatic", "CASE B automatic preserved");
  cases.B_automaticCompleted = "PASS";
  assert.equal(byId.get("TP-20230501-0003").resolutionMode, "human", "CASE C human-edited stays human");
  assert.equal(byId.get("TP-20230501-0003").resolution.humanEdited, true);
  cases.C_humanEditedStaysHuman = "PASS";
  assert.equal(byId.get("TP-20230501-0004").resolutionMode, null, "CASE D unresolved is null");
  cases.D_unresolvedNull = "PASS";
  assert.equal(byId.get("TP-20230501-0005").resolutionMode, null, "CASE E historical completed null");
  cases.E_historicalNullCompleted = "PASS";

  // CASE H — independent reconstruction from rows.
  const counts = deriveResolutionModeCounts(loaded);
  assert.equal(counts.completed, 4, "4 completed (resolved w/ resolvedAt)");
  assert.equal(counts.human, 2, "2 human");
  assert.equal(counts.automatic, 1, "1 automatic");
  assert.equal(counts.unknownMode, 1, "1 completed null -> unknownMode, NOT human");
  cases.H_metricsReconstruction = "PASS";
  // E reinforced: the null completed row is unknownMode, never human/auto.
  assert(counts.unknownMode === 1 && counts.human === 2, "null completed must not be classified as human or automatic");

  // CASE I — trust behavior unchanged: persisting tickets creates no trust data.
  const trustRows = await prisma.trustEvidence.count({ where: { organizationId: A } });
  const knowledgeRows = await prisma.knowledgeItem.count({ where: { organizationId: A } });
  assert.equal(trustRows, 0, "no trust evidence from ticket writes");
  assert.equal(knowledgeRows, 0, "no knowledge from ticket writes");
  cases.I_trustUnchanged = "PASS";

  // CASE J — actor/provenance unchanged: ticket actorId remains null-defaulted,
  // validationRecordIds preserved (resolutionMode is purely additive).
  const rawRows = await prisma.ticketRecord.findMany({ where: { organizationId: A }, select: { actorId: true, resolutionMode: true } });
  assert(rawRows.every((r) => r.actorId === null), "ticket actorId behavior unchanged (null)");
  cases.J_actorProvenanceUnchanged = "PASS";

  await deleteIfPresent(A);
}

// Create a disposable org whose stored settings match the migration package's
// profile projection exactly (avoids the unrelated _profileRevision reconcile
// quirk that upsertOrganizationProfile would introduce).
async function createMatchingOrg(prisma, id) {
  const p = profile(id);
  await prisma.organization.create({
    data: {
      id,
      name: p.name,
      industry: p.industry,
      description: p.description,
      settings: {
        products: [], services: [], supportedDomains: [], businessVocabulary: [], supportedIssueTypes: [],
        outOfScopeTopics: [], customerTone: "professional", supportBoundaries: [], autoResolutionThreshold: 80,
        escalationRules: [], logoInitials: "IP"
      },
      createdAt: new Date(p.createdAt),
      updatedAt: new Date(p.updatedAt)
    }
  });
}

async function migrationRoundTrip(prisma) {
  // CASE F — export/import round trip preserves the mode.
  await deleteIfPresent(B);
  await createMatchingOrg(prisma, B);
  const resourcesF = {
    knowledge: [], knowledgeCandidates: [], validationRecords: [], memoryChangeRecords: [], orgMetrics: null,
    intelligenceLog: [], emergingPatterns: [],
    ticketRecords: [
      mkTicket(B, "TP-20230601-0001", { status: "resolved", mode: "human", resolvedAt: "2023-06-01T01:00:00.000Z" }),
      mkTicket(B, "TP-20230601-0002", { status: "resolved", mode: "automatic", resolvedAt: "2023-06-01T01:00:00.000Z" }),
      mkTicket(B, "TP-20230601-0003", { status: "open", mode: null })
    ],
    ticketSequence: { organizationId: B, counter: 3, updatedAt: "2023-06-01T00:00:00.000Z" }
  };
  const pkgF = await refresh(await packageFor(B, { resources: resourcesF }));
  const intakeF = await migration.intakeMigrationExportPackage(pkgF, B);
  const importedF = await execution.executeMigrationImport(B, intakeF.batchId);
  assert.equal(importedF.status, "imported", "CASE F import must complete");
  const verifiedF = await verification.verifyMigrationImport(B, intakeF.batchId);
  assert.equal(verifiedF.status, "passed", "CASE F verification must pass with resolutionMode round-tripped");
  const loadedF = await persistence.loadTicketRecords(B);
  const fById = new Map(loadedF.map((t) => [t.ticketId, t]));
  assert.equal(fById.get("TP-20230601-0001").resolutionMode, "human");
  assert.equal(fById.get("TP-20230601-0002").resolutionMode, "automatic");
  assert.equal(fById.get("TP-20230601-0003").resolutionMode, null);
  cases.F_exportImportRoundTrip = "PASS";
  await deleteIfPresent(B);

  // CASE G — legacy package without the field imports safely as null.
  await deleteIfPresent(C);
  await createMatchingOrg(prisma, C);
  const resourcesG = {
    knowledge: [], knowledgeCandidates: [], validationRecords: [], memoryChangeRecords: [], orgMetrics: null,
    intelligenceLog: [], emergingPatterns: [],
    ticketRecords: [
      mkTicket(C, "TP-20230701-0001", { status: "resolved", mode: undefined, resolvedAt: "2023-07-01T01:00:00.000Z", legacy: true })
    ],
    ticketSequence: { organizationId: C, counter: 1, updatedAt: "2023-07-01T00:00:00.000Z" }
  };
  assert.equal("resolutionMode" in resourcesG.ticketRecords[0], false, "legacy ticket must omit the field");
  const pkgG = await refresh(await packageFor(C, { resources: resourcesG }));
  const intakeG = await migration.intakeMigrationExportPackage(pkgG, C);
  const importedG = await execution.executeMigrationImport(C, intakeG.batchId);
  assert.equal(importedG.status, "imported", "CASE G legacy import must complete");
  const loadedG = await persistence.loadTicketRecords(C);
  assert.equal(loadedG[0].resolutionMode, null, "CASE G legacy row imports as null");
  cases.G_legacyPackageNull = "PASS";
  await deleteIfPresent(C);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const prisma = getPrismaClient();
  const protectedBefore = await protectedSnapshot(prisma);
  try {
    await serverRoundTrip(prisma);
    await migrationRoundTrip(prisma);
  } finally {
    await deleteIfPresent(A);
    await deleteIfPresent(B);
    await deleteIfPresent(C);
  }
  const protectedAfter = await protectedSnapshot(prisma);
  assert.deepEqual(protectedAfter, protectedBefore, "Protected organizations must be unchanged.");
  cases.K_protectedUnchanged = "PASS";

  console.log(JSON.stringify({ cases, disposableOrgsCleanedUp: true, protectedOrganizationsUnchanged: true }, null, 2));
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.stack : String(error)); process.exitCode = 1; })
  .finally(async () => { try { await getPrismaClient().$disconnect(); } catch { /* ignore */ } });
