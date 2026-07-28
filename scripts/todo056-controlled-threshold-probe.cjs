/*
 * TODO-056 focused probe: the Organization auto-resolution threshold slider is a
 * CONTROLLED input, so it must render a defined numeric value for every profile
 * shape the page can hold — including the partial "active organization context"
 * that once reached React state and made the input uncontrolled on first render.
 *
 * Deterministic and offline: no database, no dev server, no mature data touched.
 */
const assert = require("node:assert/strict");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

installProbeHarness({ loadEnv: false });

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { OrganizationView } = require("@/components/views/OrganizationView");
const {
  AUTO_RESOLUTION_THRESHOLD_MAX,
  AUTO_RESOLUTION_THRESHOLD_MIN,
  DEFAULT_AUTO_RESOLUTION_THRESHOLD,
  resolveAutoResolutionThreshold
} = require("@/lib/organizationProfile");
const { seedOrganizationProfiles } = require("@/data/seedOrganizationProfiles");

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

/** The value React actually puts on the range input, or null when it renders uncontrolled. */
function renderedThreshold(profile) {
  const markup = renderToStaticMarkup(
    React.createElement(OrganizationView, {
      profile,
      organizations: [profile],
      onChange: () => {},
      onSelectOrg: () => {},
      onAddOrg: () => {},
      onDeleteOrg: () => {},
      darkMode: false
    })
  );
  const range = markup.match(/<input[^>]*type="range"[^>]*>/);
  assert.ok(range, "the auto-resolution range input must render");
  const value = range[0].match(/value="([^"]*)"/);
  return value ? value[1] : null;
}

function assertControlled(label, profile, expected) {
  const rendered = renderedThreshold(profile);
  assert.notEqual(rendered, null, `${label}: range input rendered with no value (uncontrolled)`);
  assert.notEqual(rendered, "", `${label}: range input rendered an empty value`);
  const numeric = Number(rendered);
  assert.ok(Number.isFinite(numeric), `${label}: rendered value ${rendered} is not a finite number`);
  assert.ok(
    numeric >= AUTO_RESOLUTION_THRESHOLD_MIN && numeric <= AUTO_RESOLUTION_THRESHOLD_MAX,
    `${label}: rendered value ${numeric} is outside ${AUTO_RESOLUTION_THRESHOLD_MIN}-${AUTO_RESOLUTION_THRESHOLD_MAX}`
  );
  if (expected !== undefined) assert.equal(numeric, expected, `${label}: expected ${expected}, rendered ${numeric}`);
  return numeric;
}

const complete = seedOrganizationProfiles[0];
/** Exactly what /api/auth/active-organization returns: identity only, no settings. */
const activeOrganizationContext = {
  id: complete.id,
  name: complete.name,
  industry: complete.industry,
  description: complete.description
};

console.log("TODO-056 controlled auto-resolution threshold probe\n");

check("value resolver: undefined falls back to the product default", () => {
  assert.equal(resolveAutoResolutionThreshold(undefined), DEFAULT_AUTO_RESOLUTION_THRESHOLD);
});
check("value resolver: null, NaN and non-numeric input fall back to the product default", () => {
  for (const bad of [null, Number.NaN, Infinity, "90", {}, []]) {
    assert.equal(resolveAutoResolutionThreshold(bad), DEFAULT_AUTO_RESOLUTION_THRESHOLD, `input ${String(bad)}`);
  }
});
check("value resolver: valid values pass through unchanged", () => {
  for (const value of [40, 55, 75, 80, 90, 100]) assert.equal(resolveAutoResolutionThreshold(value), value);
});
check("value resolver: out-of-range values clamp into the control range", () => {
  assert.equal(resolveAutoResolutionThreshold(0), AUTO_RESOLUTION_THRESHOLD_MIN);
  assert.equal(resolveAutoResolutionThreshold(140), AUTO_RESOLUTION_THRESHOLD_MAX);
  assert.equal(resolveAutoResolutionThreshold(77.4), 77);
});

check("initial render with a complete profile", () => {
  assertControlled("complete profile", complete, complete.autoResolutionThreshold);
});

check("initial render with a temporarily missing threshold stays controlled", () => {
  assertControlled("missing threshold", { ...complete, autoResolutionThreshold: undefined }, DEFAULT_AUTO_RESOLUTION_THRESHOLD);
});

check("initial render with the partial active-organization context stays controlled", () => {
  assertControlled("active-organization context", activeOrganizationContext, DEFAULT_AUTO_RESOLUTION_THRESHOLD);
});

check("profile update from missing to defined never renders undefined", () => {
  const before = assertControlled("before update", { ...complete, autoResolutionThreshold: undefined });
  const after = assertControlled("after update", { ...complete, autoResolutionThreshold: 95 }, 95);
  assert.ok(Number.isFinite(before) && Number.isFinite(after), "both renders must be numeric");
});

check("conflict reload replaces the profile with a controlled value", () => {
  // Stale local edit -> server 409 -> authoritative profile reloaded.
  assertControlled("stale local edit", { ...complete, autoResolutionThreshold: 100 }, 100);
  assertControlled("reloaded server profile", { ...complete, autoResolutionThreshold: 85, profileRevision: 18 }, 85);
});

check("organization switching renders each organization's own threshold", () => {
  const seen = [];
  for (const org of seedOrganizationProfiles) {
    seen.push([org.id, assertControlled(`switch to ${org.id}`, org, org.autoResolutionThreshold)]);
  }
  assert.ok(seen.length >= 2, "the switching case needs at least two seeded organizations");
  // The switch target must never inherit the previous organization's value.
  for (const [id, value] of seen) {
    const org = seedOrganizationProfiles.find((candidate) => candidate.id === id);
    assert.equal(value, org.autoResolutionThreshold, `${id} must render its own threshold`);
  }
});

check("boundary values 40 and 100 render exactly", () => {
  assertControlled("lower boundary", { ...complete, autoResolutionThreshold: AUTO_RESOLUTION_THRESHOLD_MIN }, 40);
  assertControlled("upper boundary", { ...complete, autoResolutionThreshold: AUTO_RESOLUTION_THRESHOLD_MAX }, 100);
});

check("the resolver never mutates the caller's profile", () => {
  const profile = { ...complete, autoResolutionThreshold: undefined };
  renderedThreshold(profile);
  assert.equal(profile.autoResolutionThreshold, undefined, "rendering must not write a default back into the profile");
});

console.log("");
if (failures.length > 0) {
  console.error(`TODO-056 probe FAILED (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log("TODO-056 probe passed: the auto-resolution slider is controlled for every profile shape.");
}
