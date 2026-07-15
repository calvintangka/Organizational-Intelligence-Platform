/*
 * Deterministic read-path probe. It transpiles the server adapter without
 * opening a database connection and supplies a mocked GET-only API surface.
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

global.fetch = async (url, init) => {
  requests.push({ url: String(url), init });
  assert.equal(init.method, "GET", "server adapter must use GET only");
  const data = String(url).endsWith("/knowledge")
    ? [{ id: "knowledge-1", organizationId: MAESA, title: "Login Issue" }]
    : String(url).endsWith(`/organizations/${MAESA}`)
    ? { id: MAESA, name: "Maesa Tech" }
    : [];
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

async function main() {
  assert.equal(persistenceModule.persistenceMode, "local");
  assert.ok(adapter instanceof ServerPersistenceAdapter);
  assert.ok(persistenceModule.createPersistenceAdapter("local") instanceof persistenceModule.LocalStorageAdapter);

  const knowledge = await adapter.loadKnowledge(MAESA);
  assert.equal(knowledge[0].organizationId, MAESA);
  assert.match(requests[0].url, new RegExp(`/api/organizations/${MAESA}/knowledge$`));
  await adapter.prepareOrganization(MAESA);
  assert.match(requests[1].url, new RegExp(`/api/organizations/${MAESA}$`));

  const requestCount = requests.length;
  await assert.rejects(() => adapter.loadKnowledge("   "), /non-empty organizationId/);
  assert.equal(requests.length, requestCount, "invalid ids must fail before fetch");
  await assert.rejects(() => adapter.saveKnowledge(MAESA, []), /read-only/);
  assert.equal(requests.length, requestCount, "write attempts must not call an API or localStorage");

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
  assert.equal(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/.test(serviceSource), false);
  const serverAdapterSource = fs.readFileSync(path.join(root, "lib", "persistence", "serverPersistenceAdapter.ts"), "utf8");
  assert.equal(serverAdapterSource.includes("@/lib/orgMemory"), false);
  assert.equal(serverAdapterSource.includes("@/lib/ticketRecords"), false);
  assert.equal(serverAdapterSource.includes("@/lib/organizationProfile"), false);
  assert.equal(fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8").includes("lib/server/prisma"), false);

  console.log("Server persistence read-path probe passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
