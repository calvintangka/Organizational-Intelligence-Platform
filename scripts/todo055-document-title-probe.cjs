/*
 * TODO-055 focused probe: the browser tab title follows the active organization.
 *
 * Deterministic and offline: pure title formatting plus a static check that the
 * root layout's build-time metadata carries no organization name (a hardcoded one
 * would flash on refresh before hydration resolves the real organization).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });

const { APP_TITLE, organizationDocumentTitle } = require(path.join(root, "lib", "documentTitle.ts"));
const { seedOrganizationProfiles } = require(path.join(root, "data", "seedOrganizationProfiles.ts"));
const { developerDemoProfile } = require(path.join(root, "data", "developerDemoFoundation.ts"));

const failures = [];

function check(label, fn) {
  try {
    fn();
    console.log(`  PASS  ${label}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    console.log(`  FAIL  ${label} -- ${error.message}`);
  }
}

console.log("TODO-055 dynamic browser tab title probe\n");

check('product fallback is exactly "OIP"', () => {
  assert.equal(APP_TITLE, "OIP");
});

check("each real organization renders <Name> | OIP", () => {
  const organizations = [developerDemoProfile, ...seedOrganizationProfiles];
  assert.ok(organizations.length >= 3, "expected the demo plus seeded organizations");
  for (const organization of organizations) {
    assert.equal(organizationDocumentTitle(organization.name), `${organization.name} | OIP`, organization.id);
  }
  assert.equal(organizationDocumentTitle("OIP Developer Demo"), "OIP Developer Demo | OIP");
  assert.equal(organizationDocumentTitle("Maesa Tech"), "Maesa Tech | OIP");
  assert.equal(organizationDocumentTitle("FastDrop Logistics"), "FastDrop Logistics | OIP");
});

check('no organization falls back to "OIP"', () => {
  // null is what the page passes while loading, signed out, unhydrated, or when
  // no authorized organization resolved.
  for (const absent of [null, undefined, "", "   ", 0, false, {}, []]) {
    assert.equal(organizationDocumentTitle(absent), "OIP", `input ${JSON.stringify(absent)}`);
  }
});

check("titles carry no environment name or internal id", () => {
  const organizations = [developerDemoProfile, ...seedOrganizationProfiles];
  for (const organization of organizations) {
    const title = organizationDocumentTitle(organization.name);
    assert.ok(!title.includes(organization.id), `${organization.id} must not appear in the title`);
    for (const leak of ["localhost", "development", "production", "staging", "profile-", "NODE_ENV"]) {
      assert.ok(!title.toLowerCase().includes(leak.toLowerCase()), `${title} must not mention ${leak}`);
    }
  }
});

check("a switch between organizations produces a different title", () => {
  const titles = [developerDemoProfile, ...seedOrganizationProfiles].map((organization) =>
    organizationDocumentTitle(organization.name)
  );
  assert.equal(new Set(titles).size, titles.length, "each organization must have a distinct tab title");
});

check("the same organization is title-stable (no redundant DOM write)", () => {
  const first = organizationDocumentTitle("Maesa Tech");
  const second = organizationDocumentTitle("Maesa Tech");
  assert.equal(first, second, "repeated calls must be referentially stable in value");
});

check("root layout metadata names no organization", () => {
  const layout = fs.readFileSync(path.join(root, "app", "layout.tsx"), "utf8");
  const names = [developerDemoProfile.name, ...seedOrganizationProfiles.map((organization) => organization.name)];
  for (const name of names) {
    assert.ok(!layout.includes(`"${name}"`), `app/layout.tsx must not hardcode the organization title "${name}"`);
  }
  assert.ok(layout.includes("APP_TITLE"), "app/layout.tsx must use the shared APP_TITLE fallback");
});

check("the page gates the title on an authenticated, hydrated organization", () => {
  const page = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
  assert.ok(page.includes("useOrganizationDocumentTitle("), "app/page.tsx must drive the tab title");
  const call = page.slice(page.indexOf("useOrganizationDocumentTitle("));
  const gate = call.slice(0, call.indexOf(");") + 2);
  assert.ok(gate.includes('authStatus === "authenticated"'), "the title must be gated on authentication");
  assert.ok(gate.includes("hydrated"), "the title must be gated on hydration");
  assert.ok(gate.includes("organizationProfile.name"), "the title must come from the active organization state");
  assert.ok(gate.includes("null"), "the ungated case must pass null so the title falls back to OIP");
});

console.log("");
if (failures.length > 0) {
  console.error(`TODO-055 probe FAILED (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log("TODO-055 probe passed: the tab title follows the active organization and falls back to OIP.");
}
