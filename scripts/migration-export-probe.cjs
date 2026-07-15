/*
 * Deterministic TODO-004 Batch 5.0–5.1 export probe.
 *
 * This uses an in-memory localStorage implementation only. It never calls the
 * migration preparer, any save function, Prisma, an API route, or a browser's
 * real localStorage.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveProjectAlias(request, parent, isMain, options) {
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
    module._compile(output.outputText, filename);
  };
}

class MemoryStorage {
  constructor() {
    this.values = new Map();
    this.setCalls = 0;
    this.removeCalls = 0;
  }

  getItem(key) {
    return this.values.has(String(key)) ? this.values.get(String(key)) : null;
  }

  setItem(key, value) {
    this.setCalls += 1;
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.removeCalls += 1;
    this.values.delete(String(key));
  }
}

let storage;
function resetStorage() {
  storage = new MemoryStorage();
  global.window = { localStorage: storage };
}

function snapshotStorage() {
  return Object.fromEntries([...storage.values.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function setJson(key, value) {
  storage.setItem(key, JSON.stringify(value));
}

function scopedKey(organizationId, resource) {
  return `oip.organization.${encodeURIComponent(organizationId)}.${resource}.v1`;
}

function profile(id, name) {
  return {
    id,
    name,
    industry: "Probe",
    description: `${name} probe organization`,
    products: ["Probe product"],
    services: ["Probe service"],
    supportedDomains: ["probe"],
    businessVocabulary: ["probe"],
    supportedIssueTypes: ["probe issue"],
    outOfScopeTopics: [],
    customerTone: "professional",
    supportBoundaries: [],
    autoResolutionThreshold: 80,
    escalationRules: [],
    accentColor: "#2563EB",
    logoInitials: "PRB",
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z"
  };
}

function knowledge(id, organizationId, response = "Hi {{customerName}}, use the recovery flow.") {
  return {
    id,
    organizationId,
    title: `Probe knowledge ${id}`,
    problem: "A probe customer cannot complete the workflow.",
    approvedAnswer: "Use the documented recovery flow.",
    category: "Probe",
    tags: ["probe"],
    sourceTicketId: "PRB-20260715-0001",
    timesReused: 1,
    createdAt: "2026-07-15T00:00:00.000Z",
    approvedAt: "2026-07-15T00:00:00.000Z",
    customerResponseTemplate: response,
    lessons: [{
      id: `${id}-lesson-1`,
      rootCause: "The customer used an expired flow.",
      solution: "Use the current recovery flow.",
      customerResponse: response,
      signals: ["probe"],
      createdAt: "2026-07-15T00:00:00.000Z",
      sourceTicketId: "PRB-20260715-0001"
    }]
  };
}

function ticket(ticketId, orgId) {
  return {
    ticketId,
    orgId,
    createdAt: "2026-07-15T00:00:00.000Z",
    rawMessage: "Probe ticket",
    subject: "Probe",
    classification: null,
    memoryMatch: null,
    draftSource: null,
    resolution: { finalResponse: null, humanEdited: false, editDistanceNote: null, resolvedAt: null },
    reflection: { decision: null, lessonCreatedId: null, lessonReinforcedId: null, knowledgeChanged: null },
    validationRecordIds: [],
    status: "open"
  };
}

function memoryChange(id, organizationId) {
  const item = knowledge(`${id}-knowledge`, organizationId);
  return {
    id,
    organizationId,
    knowledgeId: item.id,
    candidateId: `${id}-candidate`,
    validationRecordId: `${id}-validation`,
    changeType: "create_new",
    beforeState: null,
    afterState: item,
    timestamp: "2026-07-15T00:00:00.000Z"
  };
}

function migrationState(owner, suppressed = false, ambiguous = false) {
  const resources = {
    knowledge: { status: "fallback", updatedAt: "2026-07-15T00:00:00.000Z" },
    candidates: { status: "fallback", updatedAt: "2026-07-15T00:00:00.000Z" },
    validationRecords: { status: "fallback", updatedAt: "2026-07-15T00:00:00.000Z" },
    memoryChanges: { status: "fallback", updatedAt: "2026-07-15T00:00:00.000Z" },
    metrics: { status: "fallback", updatedAt: "2026-07-15T00:00:00.000Z" },
    patterns: { status: "fallback", updatedAt: "2026-07-15T00:00:00.000Z" },
    intelligenceLog: { status: "fallback", updatedAt: "2026-07-15T00:00:00.000Z" },
    tickets: { status: "fallback", updatedAt: "2026-07-15T00:00:00.000Z" },
    ticketCounter: { status: "fallback", updatedAt: "2026-07-15T00:00:00.000Z" }
  };
  return {
    version: "v1",
    sourceVersion: "v2",
    legacyOwnerOrganizationId: owner,
    legacyOwnershipStatus: ambiguous ? "ambiguous" : "owned",
    legacyOwnershipReason: ambiguous ? "legacy ownership is ambiguous" : "explicit probe owner",
    organizations: {
      [owner]: {
        resources,
        legacyImportSuppressed: suppressed
      }
    }
  };
}

function seedLegacyMaesa() {
  const maesa = "profile-maesa-tech";
  const clobbered = "Hi Samuel, use the old ticket-specific response.";
  setJson("oip.organizationProfile.v1", profile(maesa, "Maesa Tech"));
  setJson("oip.organizationList.v1", [
    profile(maesa, "Maesa Tech"),
    profile("profile-fastdrop-logistics", "FastDrop Logistics"),
    profile("profile-pramana-legal", "Pramana Legal")
  ]);
  const repairableKnowledge = knowledge("legacy-knowledge", maesa, clobbered);
  repairableKnowledge.title = "Login Issue";
  repairableKnowledge.problem = "Customer cannot sign in.";
  repairableKnowledge.category = "Login Issue";
  repairableKnowledge.lessons.push({
    id: "legacy-knowledge-lesson-2",
    rootCause: "Autofill was unavailable",
    solution: "Use the recovery flow",
    customerResponse: "Hi {{customerName}}, use the recovery flow.",
    signals: [],
    createdAt: "2026-07-15T00:00:00.000Z",
    sourceTicketId: "MT-LEGACY-0002"
  });
  setJson("oip.knowledge.v2", [repairableKnowledge]);
  setJson("oip.knowledgeCandidates.v2", [{
    id: "legacy-candidate",
    sourceTicketIds: ["MT-LEGACY-0001"],
    proposedAction: "create_new",
    proposedContent: { solution: "Probe", customerResponseTemplate: "Probe", internalGuidance: "Probe" },
    rationale: "Probe",
    status: "proposed",
    createdAt: "2026-07-15T00:00:00.000Z"
  }]);
  setJson("oip.validationRecords.v2", [{
    id: "legacy-validation",
    candidateId: "legacy-candidate",
    knowledgeId: "legacy-knowledge",
    decision: "approved",
    actor: "Probe",
    roleExercised: "knowledge_validator",
    timestamp: "2026-07-15T00:00:00.000Z"
  }]);
  setJson("oip.memoryChanges.v2", [memoryChange("legacy-change-1", maesa), memoryChange("legacy-change-2", maesa)]);
  setJson(scopedKey(maesa, "memoryChanges"), [memoryChange("legacy-change-2", maesa), memoryChange("scoped-change", maesa)]);
  setJson("oip.orgMetrics.v2", { lifetimeTickets: 2, knowledgeReused: 1, organizationId: maesa, lastUpdatedAt: "2026-07-15T00:00:00.000Z" });
  setJson("oip.intelligenceLog.v2", [{ id: "legacy-log", timestamp: "2026-07-15T00:00:00.000Z", event: "Probe" }]);
  setJson("oip.emergingPatterns.v2", []);
  setJson("oip.ticketRecords.v2", [ticket("MT-LEGACY-0001", maesa)]);
  setJson("oip.ticketCounter.v2", { [maesa]: 7 });
  setJson("oip.organizationIsolationMigration.v1", migrationState(maesa));
}

async function main() {
  const { exportOrganizationSnapshot } = require(path.join(root, "lib", "persistence", "migrationExport.ts"));
  const maesa = "profile-maesa-tech";
  const fastdrop = "profile-fastdrop-logistics";
  const pramana = "profile-pramana-legal";

  resetStorage();
  seedLegacyMaesa();
  const before = snapshotStorage();
  const first = await exportOrganizationSnapshot(maesa);
  assert.equal(first.ready, true);
  assert.equal(storage.setCalls, Object.keys(before).length, "fixture setup only should have written storage");
  assert.deepEqual(snapshotStorage(), before, "export must leave every localStorage key/value unchanged");
  assert.equal(storage.removeCalls, 0);
  assert.equal(first.package.sourceResourceStatuses.memoryChangeRecords.source, "scoped+legacy-fallback");
  assert.equal(first.package.resources.memoryChangeRecords.length, 3, "legacy full history plus scoped tail must deduplicate by id");
  assert.equal(new Set(first.package.resources.memoryChangeRecords.map((record) => record.id)).size, 3);
  assert.equal(first.package.resources.ticketRecords[0].ticketId, "MT-LEGACY-0001");
  assert.equal(first.package.resources.ticketSequence.counter, 7);
  assert.equal(
    first.package.counts.lessons,
    first.package.resources.knowledge.reduce((total, item) => total + (item.lessons?.length ?? 0), 0)
  );
  assert.equal(
    first.package.counts.knowledgeVersions,
    first.package.resources.knowledge.reduce((total, item) => total + (item.knowledgeVersions?.length ?? 0), 0)
  );
  assert.notEqual(
    first.package.resources.knowledge[0].customerResponseTemplate,
    "Hi Samuel, use the old ticket-specific response.",
    "export may normalize the resolved in-memory view"
  );
  assert.equal(JSON.parse(storage.getItem("oip.knowledge.v2"))[0].customerResponseTemplate, "Hi Samuel, use the old ticket-specific response.");
  assert.deepEqual(JSON.parse(storage.getItem("oip.organizationIsolationMigration.v1")), migrationState(maesa));

  const second = await exportOrganizationSnapshot(maesa);
  assert.equal(second.ready, true);
  assert.deepEqual(second.package.digests.resourceDigests, first.package.digests.resourceDigests);
  assert.equal(second.package.digests.resourcePayloadDigest, first.package.digests.resourcePayloadDigest);
  assert.equal(second.package.digests.metadataDigest, first.package.digests.metadataDigest);
  assert.deepEqual(second.package.counts, first.package.counts);

  resetStorage();
  seedLegacyMaesa();
  const suppressed = migrationState(maesa, true);
  setJson("oip.organizationIsolationMigration.v1", suppressed);
  const suppressedBefore = snapshotStorage();
  const suppressedResult = await exportOrganizationSnapshot(maesa);
  assert.equal(suppressedResult.ready, true);
  assert.equal(suppressedResult.package.resources.knowledge.length, 0, "reset suppression must not reintroduce legacy knowledge");
  assert.equal(suppressedResult.package.sourceResourceStatuses.knowledge.source, "suppressed");
  assert.deepEqual(snapshotStorage(), suppressedBefore);

  resetStorage();
  setJson("oip.knowledge.v2", [knowledge("ambiguous", maesa)]);
  setJson("oip.organizationIsolationMigration.v1", migrationState(maesa, false, true));
  const ambiguousBefore = snapshotStorage();
  const ambiguous = await exportOrganizationSnapshot(maesa);
  assert.equal(ambiguous.ready, false);
  assert.match(ambiguous.reason, /ambiguous/i);
  assert.deepEqual(snapshotStorage(), ambiguousBefore);

  resetStorage();
  seedLegacyMaesa();
  setJson(scopedKey(fastdrop, "knowledge"), [knowledge("fastdrop-knowledge", fastdrop)]);
  setJson(scopedKey(fastdrop, "ticketRecords"), [ticket("FL-0001", fastdrop)]);
  setJson(scopedKey(pramana, "knowledge"), [knowledge("pramana-knowledge", pramana)]);
  setJson(scopedKey(pramana, "ticketRecords"), [ticket("PL-0001", pramana)]);
  const fastdropExport = await exportOrganizationSnapshot(fastdrop);
  const pramanaExport = await exportOrganizationSnapshot(pramana);
  assert.equal(fastdropExport.ready, true);
  assert.equal(pramanaExport.ready, true);
  assert.equal(fastdropExport.package.resources.knowledge.length, 1);
  assert.equal(fastdropExport.package.resources.knowledge[0].organizationId, fastdrop);
  assert.deepEqual(fastdropExport.package.resources.ticketRecords.map((item) => item.ticketId), ["FL-0001"]);
  assert.equal(pramanaExport.package.resources.knowledge.length, 1);
  assert.equal(pramanaExport.package.resources.knowledge[0].organizationId, pramana);
  assert.equal(fastdropExport.package.ownershipEvidence.legacyFallbackResources.length, 0);
  assert.equal(pramanaExport.package.ownershipEvidence.legacyFallbackResources.length, 0);

  console.log("Migration export probe passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
