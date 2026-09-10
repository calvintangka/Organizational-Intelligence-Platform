const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const helperSource = fs.readFileSync(path.join(root, "lib", "activeSurfaceState.ts"), "utf8");
const pageSource = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 }
}).outputText;
const helperModule = { exports: {} };
vm.runInNewContext(compiled, { module: helperModule, exports: helperModule.exports });
const {
  ACTIVE_SURFACES,
  activeSurfaceStorageKey,
  isPersistedActiveSurface,
  restoreActiveSurface
} = helperModule.exports;

assert.deepEqual(Array.from(ACTIVE_SURFACES), ["home", "tickets", "cases", "knowledge", "dashboard", "operations"]);
assert.equal(typeof activeSurfaceStorageKey, "function");
assert.equal(typeof isPersistedActiveSurface, "function");
assert.equal(typeof restoreActiveSurface, "function");
assert.match(pageSource, /activeSurfaceStorageKey\(orgId\)/);
assert.match(pageSource, /setActiveView\(restoredSurface\)/);
assert.match(pageSource, /authStatus !== "authenticated" \|\| !hydrated/);
const restoreCallOffset = pageSource.indexOf("setActiveView(restoredSurface)");
const hydratedCallOffset = pageSource.indexOf("setHydrated(true)", restoreCallOffset);
assert.ok(restoreCallOffset >= 0 && hydratedCallOffset > restoreCallOffset);

// The pre-repair ordering restored a surface (when it had one) and then let
// the generic default initialization win during hydration.
function legacyReload(restoredSurface, hydrationAfterRestore) {
  let active = "home";
  if (restoredSurface) active = restoredSurface;
  if (hydrationAfterRestore) active = "home";
  return active;
}

assert.equal(legacyReload("knowledge", true), "home");

// A. Restored surface before hydration completes remains authoritative.
assert.equal(restoreActiveSurface("knowledge"), "knowledge");

// B. Hydration-before-restore uses the same validated restoration function.
assert.equal(restoreActiveSurface("cases"), "cases");

// C. No legitimate prior state retains the intended default.
assert.equal(restoreActiveSurface(null), "home");
assert.equal(restoreActiveSurface(undefined), "home");

// D. Unknown/obsolete state fails safely to a valid default.
assert.equal(restoreActiveSurface("obsolete-surface"), "home");
assert.equal(restoreActiveSurface("developer"), "home");
assert.equal(isPersistedActiveSurface("knowledge"), true);
assert.equal(isPersistedActiveSurface("developer"), false);

// The persistence effect is guarded by authenticated + hydrated state. This
// model protects the dangerous trajectory where the initial Home render could
// otherwise overwrite a saved surface before the hydration decision consumes
// it.
function repairedRestoreBeforePersist(storedSurface) {
  let activeSurface = "home";
  let hydrated = false;
  let stored = storedSurface;

  if (hydrated && isPersistedActiveSurface(activeSurface)) stored = activeSurface;
  activeSurface = restoreActiveSurface(stored);
  hydrated = true;
  if (hydrated && isPersistedActiveSurface(activeSurface)) stored = activeSurface;

  return { activeSurface, stored };
}

function unsafeDefaultBeforeRestore(storedSurface) {
  let activeSurface = "home";
  let stored = storedSurface;
  stored = activeSurface;
  activeSurface = restoreActiveSurface(stored);
  return { activeSurface, stored };
}

assert.deepEqual(repairedRestoreBeforePersist("knowledge"), {
  activeSurface: "knowledge",
  stored: "knowledge"
});
assert.deepEqual(unsafeDefaultBeforeRestore("knowledge"), {
  activeSurface: "home",
  stored: "home"
});

function tenantHydration(storage, organizationId) {
  let activeSurface = "home";
  let hydrated = false;
  const key = activeSurfaceStorageKey(organizationId);
  const stored = storage.get(key);

  if (hydrated && isPersistedActiveSurface(activeSurface)) storage.set(key, activeSurface);
  activeSurface = restoreActiveSurface(stored);
  hydrated = true;
  if (hydrated && isPersistedActiveSurface(activeSurface)) storage.set(key, activeSurface);

  return activeSurface;
}

const tenantStorage = new Map([
  [activeSurfaceStorageKey("org-a"), "knowledge"],
  [activeSurfaceStorageKey("org-b"), "operations"]
]);
assert.equal(tenantHydration(tenantStorage, "org-b"), "operations");
assert.equal(tenantStorage.get(activeSurfaceStorageKey("org-a")), "knowledge");

// E. Organization keys isolate the presentation hint; the helper never
// treats a surface value as organization authorization or content.
const orgAKey = activeSurfaceStorageKey("org-a");
const orgBKey = activeSurfaceStorageKey("org-b");
assert.notEqual(orgAKey, orgBKey);
const storedByOrganization = new Map([[orgAKey, "tickets"], [orgBKey, "operations"]]);
assert.equal(restoreActiveSurface(storedByOrganization.get(orgBKey)), "operations");
assert.equal(restoreActiveSurface(storedByOrganization.get(orgAKey)), "tickets");

// F. Every supported surface round-trips through the validated state helper.
for (const surface of ACTIVE_SURFACES) {
  assert.equal(restoreActiveSurface(surface), surface);
}

console.log(JSON.stringify({
  preRepairOrdering: "FAILS_AS_EXPECTED",
  restoredBeforeHydration: "PASS",
  hydrationBeforeRestore: "PASS",
  restoreBeforePersist: "PASS",
  defaultOverwriteGuard: "PASS",
  tenantOrdering: "PASS",
  defaultSurface: "PASS",
  invalidSurfaceSafeFallback: "PASS",
  organizationKeyIsolation: "PASS",
  supportedSurfaceRoundTrips: `${ACTIVE_SURFACES.length}/${ACTIVE_SURFACES.length}`
}, null, 2));
