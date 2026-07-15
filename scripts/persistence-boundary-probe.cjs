/*
 * Deterministic localStorage probe for TODO-004. It transpiles the current
 * TypeScript modules in-process and exercises them against an in-memory browser
 * storage implementation; no real browser data is read or written.
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
  }

  getItem(key) {
    return this.values.has(String(key)) ? this.values.get(String(key)) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }
}

let storage;
function resetStorage() {
  storage = new MemoryStorage();
  global.window = { localStorage: storage };
}

const orgMemory = require(path.join(root, "lib", "orgMemory.ts"));
const ticketRecords = require(path.join(root, "lib", "ticketRecords.ts"));

const MAESA = "profile-maesa-tech";
const FASTDROP = "profile-fastdrop-logistics";
const PRAMANA = "profile-pramana-legal";
const now = "2026-07-15T00:00:00.000Z";
const migrationKey = "oip.organizationIsolationMigration.v1";

function scopedKey(organizationId, resource) {
  return `oip.organization.${encodeURIComponent(organizationId)}.${resource}.v1`;
}

function legacyKnowledge() {
  return [{
    id: "legacy-login-issue",
    title: "Login Issue",
    problem: "Customer cannot sign in.",
    approvedAnswer: "Use the standard recovery flow.",
    category: "Login Issue",
    tags: ["login"],
    sourceTicketId: "MT-LEGACY-0001",
    timesReused: 0,
    createdAt: now,
    approvedAt: now,
  }];
}

async function main() {
  resetStorage();

  for (const invalidId of [undefined, null, "", "   "]) {
    for (const operation of [
      () => orgMemory.loadKnowledge(invalidId),
      () => orgMemory.saveKnowledge(invalidId, []),
      () => orgMemory.loadKnowledgeCandidates(invalidId),
      () => orgMemory.saveKnowledgeCandidates(invalidId, []),
      () => orgMemory.loadValidationRecords(invalidId),
      () => orgMemory.saveValidationRecords(invalidId, []),
      () => orgMemory.loadMemoryChangeRecords(invalidId),
      () => orgMemory.saveMemoryChangeRecords(invalidId, []),
      () => orgMemory.loadOrgMetrics(invalidId),
      () => orgMemory.saveOrgMetrics(invalidId, {}),
      () => orgMemory.loadOrgLog(invalidId),
      () => orgMemory.saveOrgLog(invalidId, []),
      () => orgMemory.loadEmergingPatterns(invalidId),
      () => orgMemory.saveEmergingPatterns(invalidId, []),
      () => ticketRecords.loadTicketRecords(invalidId),
      () => ticketRecords.saveTicketRecords(invalidId, []),
    ]) {
      await assert.rejects(operation, /requires a non-empty organizationId/);
    }
    for (const operation of [
      () => orgMemory.hasRuntimeLegacyFallback(invalidId, "knowledge"),
      () => orgMemory.migrateLegacyOrganizationStorage(invalidId),
      () => orgMemory.seedOrgMetrics(invalidId),
      () => orgMemory.clearOrganization(invalidId),
      () => orgMemory.deleteOrganizationData(invalidId),
      () => ticketRecords.generateTicketId({ id: invalidId, name: "Invalid", logoInitials: "IV" }),
      () => ticketRecords.createTicketRecord("IV-001", invalidId, "Invalid", null),
      () => ticketRecords.clearTicketRecords(invalidId),
    ]) {
      assert.throws(operation, /requires a non-empty organizationId/);
    }
  }

  await orgMemory.saveKnowledge(MAESA, []);
  assert.equal(storage.getItem("oip.knowledge.v2"), null);
  assert.equal(storage.getItem(scopedKey(MAESA, "knowledge")), "[]");

  const maesaTicket = ticketRecords.createTicketRecord("MT-001", MAESA, "Maesa issue", "Login");
  const fastDropTicket = ticketRecords.createTicketRecord("FL-001", FASTDROP, "FastDrop issue", "Shipment");
  const pramanaTicket = ticketRecords.createTicketRecord("PL-001", PRAMANA, "Pramana issue", "Contract");
  await ticketRecords.saveTicketRecords(MAESA, [maesaTicket]);
  await ticketRecords.saveTicketRecords(FASTDROP, [fastDropTicket]);
  await ticketRecords.saveTicketRecords(PRAMANA, [pramanaTicket]);
  assert.deepEqual((await ticketRecords.loadTicketRecords(MAESA)).map((record) => record.ticketId), ["MT-001"]);
  assert.deepEqual((await ticketRecords.loadTicketRecords(FASTDROP)).map((record) => record.ticketId), ["FL-001"]);
  assert.deepEqual((await ticketRecords.loadTicketRecords(PRAMANA)).map((record) => record.ticketId), ["PL-001"]);

  resetStorage();
  storage.setItem("oip.organizationProfile.v1", JSON.stringify({ id: MAESA }));
  storage.setItem("oip.organizationList.v1", JSON.stringify([{ id: MAESA }]));
  storage.setItem("oip.knowledge.v2", JSON.stringify(legacyKnowledge()));
  storage.setItem("oip.memoryChanges.v2", JSON.stringify([{ id: "legacy-change" }]));
  storage.setItem("oip.ticketCounter.v2", JSON.stringify({ [MAESA]: 7 }));

  const migration = orgMemory.migrateLegacyOrganizationStorage(MAESA);
  assert.equal(migration.resources.knowledge, "copied");
  assert.equal(migration.resources.memoryChanges, "fallback");
  assert.deepEqual(JSON.parse(storage.getItem("oip.knowledge.v2")), legacyKnowledge());
  assert.equal(JSON.parse(storage.getItem(scopedKey(MAESA, "knowledge")))[0].organizationId, MAESA);
  assert.equal((await orgMemory.loadMemoryChangeRecords(MAESA))[0].organizationId, MAESA);

  orgMemory.clearOrganization(MAESA);
  assert.deepEqual(JSON.parse(storage.getItem("oip.knowledge.v2")), legacyKnowledge());
  assert.match(orgMemory.migrateLegacyOrganizationStorage(MAESA).warnings.join(" "), /explicitly reset/);

  await ticketRecords.saveTicketRecords(FASTDROP, [fastDropTicket]);
  orgMemory.deleteOrganizationData(FASTDROP);
  assert.equal(storage.getItem(scopedKey(FASTDROP, "ticketRecords")), null);
  assert.deepEqual(JSON.parse(storage.getItem("oip.knowledge.v2")), legacyKnowledge());

  resetStorage();
  storage.setItem("oip.ticketCounter.v2", JSON.stringify({ [MAESA]: 7 }));
  storage.setItem(migrationKey, JSON.stringify({
    version: "v1",
    sourceVersion: "v2",
    legacyOwnerOrganizationId: MAESA,
    legacyOwnershipStatus: "owned",
    organizations: {
      [MAESA]: {
        resources: {
          ticketCounter: { status: "fallback", updatedAt: now },
        },
      },
    },
  }));
  assert.match(
    ticketRecords.generateTicketId({ id: MAESA, name: "Maesa Tech", logoInitials: "MT" }),
    /^MT-\d{8}-0008$/
  );

  resetStorage();
  const clobberedTemplate = "Hi Samuel, please reset your password from the sign-in page.";
  storage.setItem(scopedKey(FASTDROP, "knowledge"), JSON.stringify([{
    ...legacyKnowledge()[0],
    customerResponseTemplate: clobberedTemplate,
    lessons: [
      { id: "lesson-1", rootCause: "Password was forgotten", solution: "Reset it", customerResponse: clobberedTemplate, signals: [], createdAt: now, sourceTicketId: "FL-001" },
      { id: "lesson-2", rootCause: "Autofill was unavailable", solution: "Reset it", customerResponse: "Hi {{customerName}}, use the reset flow.", signals: [], createdAt: now, sourceTicketId: "FL-002" },
    ],
  }]));
  await orgMemory.loadKnowledge(FASTDROP);
  const repaired = JSON.parse(storage.getItem(scopedKey(FASTDROP, "knowledge")))[0];
  assert.equal(repaired.organizationId, FASTDROP);
  assert.notEqual(repaired.customerResponseTemplate, clobberedTemplate);
  assert.equal(storage.getItem("oip.knowledge.v2"), null);

  console.log("Persistence boundary probe passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
