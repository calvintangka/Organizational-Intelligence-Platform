/*
 * Deterministic server-adapter probe. It transpiles the server adapter without
 * opening a database connection and supplies a mocked API surface, verifying
 * the Batch 4 read+write transport: correct routes, correct methods, no
 * localStorage access, and no fallback of any kind on failure.
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

delete process.env.NEXT_PUBLIC_OIP_PERSISTENCE_MODE;
const persistenceModule = require(path.join(root, "lib", "persistence", "index.ts"));
const { ServerPersistenceAdapter } = persistenceModule;
const adapter = persistenceModule.createPersistenceAdapter("server");
const MAESA = "profile-maesa-tech";
const requests = [];

// Any localStorage access from the server adapter is a hard failure.
global.window = {
  get localStorage() {
    throw new Error("Server adapter must never touch localStorage.");
  }
};

let failNextRequest = false;
global.fetch = async (url, init) => {
  requests.push({ url: String(url), method: init.method, body: init.body });
  if (failNextRequest) {
    failNextRequest = false;
    return new Response(JSON.stringify({ error: { code: "CONFLICT", message: "probe conflict" } }), {
      status: 409,
      headers: { "Content-Type": "application/json" }
    });
  }
  const data = String(url).endsWith("/knowledge") && init.method === "GET"
    ? [{ id: "knowledge-1", organizationId: MAESA, title: "Login Issue", revision: 3 }]
    : String(url).endsWith(`/organizations/${MAESA}`) && init.method === "GET"
    ? { id: MAESA, name: "Maesa Tech" }
    : String(url).endsWith("/tickets/allocate")
    ? { ticketIds: ["MT-20260715-0001", "MT-20260715-0002"] }
    : String(url).endsWith("/commits/validation")
    ? { replayed: false, knowledgeRevision: 1 }
    : {};
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

function lastRequest() {
  return requests[requests.length - 1];
}

async function main() {
  assert.equal(persistenceModule.persistenceMode, "local", "committed default mode must remain local");
  assert.ok(adapter instanceof ServerPersistenceAdapter);
  assert.ok(persistenceModule.createPersistenceAdapter("local") instanceof persistenceModule.LocalStorageAdapter);

  /* ------------------------------- Reads ------------------------------- */
  const knowledge = await adapter.loadKnowledge(MAESA);
  assert.equal(knowledge[0].organizationId, MAESA);
  assert.equal(knowledge[0].revision, 3, "database revision must survive the read path");
  assert.match(requests[0].url, new RegExp(`/api/organizations/${MAESA}/knowledge$`));
  assert.equal(requests[0].method, "GET");
  await adapter.prepareOrganization(MAESA);
  assert.match(requests[1].url, new RegExp(`/api/organizations/${MAESA}$`));

  const requestCount = requests.length;
  await assert.rejects(() => adapter.loadKnowledge("   "), /non-empty organizationId/);
  assert.equal(requests.length, requestCount, "invalid ids must fail before fetch");

  /* ------------------------------- Writes ------------------------------ */
  await adapter.saveKnowledge(MAESA, [{ id: "knowledge-1", revision: 3 }]);
  assert.match(lastRequest().url, new RegExp(`/api/organizations/${MAESA}/knowledge$`));
  assert.equal(lastRequest().method, "PUT");

  await adapter.saveOrgMetrics(MAESA, { organizationId: MAESA, lifetimeTickets: 1 });
  assert.match(lastRequest().url, /\/metrics$/);
  assert.equal(lastRequest().method, "PUT");

  await adapter.saveOrganizationProfile({ id: MAESA, name: "Maesa Tech" });
  assert.match(lastRequest().url, new RegExp(`/api/organizations/${MAESA}$`));
  assert.equal(lastRequest().method, "PUT");

  await adapter.saveOrganizationList([{ id: MAESA, name: "Maesa Tech" }]);
  assert.match(lastRequest().url, /\/api\/organizations$/);
  assert.equal(lastRequest().method, "PUT");

  const ids = await adapter.generateTicketIds(MAESA, { id: MAESA, name: "Maesa Tech" }, 2);
  assert.deepEqual(ids, ["MT-20260715-0001", "MT-20260715-0002"]);
  assert.match(lastRequest().url, /\/tickets\/allocate$/);
  assert.equal(lastRequest().method, "POST");
  assert.deepEqual(JSON.parse(lastRequest().body), { count: 2 });

  await adapter.commitValidatedMemoryChange(MAESA, {
    candidate: { id: "candidate-1" },
    validation: { id: "validation-1", candidateId: "candidate-1" },
    memoryChange: { id: "memory-change-1", validationRecordId: "validation-1", candidateId: "candidate-1" },
    knowledgeItem: { id: "knowledge-1" },
    expectedKnowledgeRevision: 3
  });
  assert.match(lastRequest().url, /\/commits\/validation$/);
  assert.equal(lastRequest().method, "POST");
  assert.equal(JSON.parse(lastRequest().body).expectedKnowledgeRevision, 3);

  await adapter.resetOrganization(MAESA);
  assert.match(lastRequest().url, /\/reset$/);
  assert.equal(lastRequest().method, "POST");

  await adapter.deleteOrganization(MAESA);
  assert.match(lastRequest().url, new RegExp(`/api/organizations/${MAESA}$`));
  assert.equal(lastRequest().method, "DELETE");

  // Audit records never persist through snapshot saves.
  await assert.rejects(() => adapter.saveValidationRecords(MAESA, []), /append-only/);
  await assert.rejects(() => adapter.saveMemoryChangeRecords(MAESA, []), /append-only/);

  // A failed server write surfaces the API error and never claims success.
  failNextRequest = true;
  await assert.rejects(() => adapter.saveKnowledge(MAESA, []), /probe conflict/);

  /* --------------------------- Source boundaries ------------------------ */
  const serviceSource = fs.readFileSync(path.join(root, "lib", "server", "persistenceService.ts"), "utf8");
  for (const model of [
    "knowledgeItem",
    "knowledgeCandidate",
    "validationRecord",
    "memoryChangeRecord",
    "orgMetrics",
    "intelligenceLog",
    "emergingPattern",
    "ticketRecord",
    "ticketSequence"
  ]) {
    assert.match(serviceSource, new RegExp(`prisma\\.${model}\\.(findMany|findUnique)\\(\\{ where: \\{ organizationId:`));
  }
  // Every bulk delete must carry an organization scope in its condition.
  const scopedDeleteMany = serviceSource.match(/deleteMany\(\{\s*\n?\s*where: \{ organizationId/g) ?? [];
  const allDeleteMany = serviceSource.match(/deleteMany\(/g) ?? [];
  assert.equal(scopedDeleteMany.length, allDeleteMany.length, "every deleteMany must be organization-scoped");

  const serverAdapterSource = fs.readFileSync(path.join(root, "lib", "persistence", "serverPersistenceAdapter.ts"), "utf8");
  assert.equal(serverAdapterSource.includes("@/lib/orgMemory"), false);
  assert.equal(serverAdapterSource.includes("@/lib/ticketRecords"), false);
  assert.equal(serverAdapterSource.includes("@/lib/organizationProfile"), false);
  assert.equal(
    /window\.localStorage|localStorage\.(getItem|setItem|removeItem)/.test(serverAdapterSource),
    false,
    "server adapter must not use the localStorage API"
  );
  assert.equal(fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8").includes("lib/server/prisma"), false);

  console.log("Server persistence read+write probe passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
