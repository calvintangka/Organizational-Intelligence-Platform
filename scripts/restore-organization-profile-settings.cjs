/*
 * Targeted TODO-056 follow-up data repair.
 *
 * Before TODO-056 (commit 0e64347), app/page.tsx stored the four-field payload of
 * `/api/auth/active-organization` (id, name, industry, description) as the whole
 * OrganizationProfile. The profile autosave effect then PUT that partial object to
 * `/api/organizations/:id`, where `upsertOrganizationProfile` coerces missing
 * arrays to `[]` — so every profile save from the Organization page silently
 * erased the settings arrays of the ACTIVE organization. `restore-maesa-profile-
 * vocabulary.cjs` repaired four of those fields for Maesa/FastDrop; this script
 * repairs the remaining ones and the Developer Demo organization, which lost all
 * eight.
 *
 * Guarantees:
 * - Only `organizations.settings` array fields are patched, via a jsonb merge of
 *   the restored keys plus the profile concurrency revision.
 * - A field is restored only when it is currently EMPTY and the seed definition
 *   is non-empty. Non-empty stored values are never overwritten, so reruns are
 *   no-ops (idempotent) and no deliberate edit is clobbered.
 * - Scalar settings (autoResolutionThreshold, customerTone, accentColor,
 *   logoInitials) are NOT touched: they are user-editable, so a stored value
 *   cannot be distinguished from a deliberate choice. Divergences are reported.
 * - Identity columns, knowledge, tickets, lessons, trust, validations, memory
 *   history, metrics, patterns, and every other organization are untouched and
 *   snapshot-verified.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { Client } = require("pg");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not configured; the profile settings restore cannot run.");
  process.exit(1);
}

const { seedOrganizationProfiles } = require(path.join(root, "data", "seedOrganizationProfiles.ts"));
const { developerDemoProfile } = require(path.join(root, "data", "developerDemoFoundation.ts"));
const service = require(path.join(root, "lib", "server", "persistenceService.ts"));

const DEVELOPER_DEMO = "profile-oip-developer-demo";
const MAESA = "profile-maesa-tech";
const FASTDROP = "profile-fastdrop-logistics";

/** Every profile field the partial-profile save could flatten to []. */
const ARRAY_FIELDS = [
  "products",
  "services",
  "supportedDomains",
  "businessVocabulary",
  "supportedIssueTypes",
  "outOfScopeTopics",
  "supportBoundaries",
  "escalationRules"
];

/** Settings keys this script must never write. */
const PRESERVED_SCALARS = ["autoResolutionThreshold", "customerTone", "accentColor", "logoInitials"];

function seedFor(organizationId) {
  if (organizationId === DEVELOPER_DEMO) return developerDemoProfile;
  return seedOrganizationProfiles.find((profile) => profile.id === organizationId);
}

const TARGETS = [DEVELOPER_DEMO, MAESA, FASTDROP];

async function settingsOf(db, organizationId) {
  const row = await db.query("SELECT settings FROM organizations WHERE id = $1", [organizationId]);
  assert.equal(row.rows.length, 1, `${organizationId} organization row must exist`);
  return row.rows[0].settings ?? {};
}

async function identityOf(db, organizationId) {
  return (await db.query('SELECT id, name, industry, description, "createdAt" FROM organizations WHERE id = $1', [organizationId])).rows;
}

async function resourceCounts(db, organizationId) {
  const result = await db.query(
    `SELECT
       (SELECT count(*) FROM knowledge_items WHERE "organizationId" = $1) AS knowledge,
       (SELECT count(*) FROM knowledge_candidates WHERE "organizationId" = $1) AS candidates,
       (SELECT count(*) FROM ticket_records WHERE "organizationId" = $1) AS tickets,
       (SELECT count(*) FROM validation_records WHERE "organizationId" = $1) AS validations,
       (SELECT count(*) FROM memory_change_records WHERE "organizationId" = $1) AS memory_changes,
       (SELECT count(*) FROM trust_evidence WHERE "organizationId" = $1) AS trust_evidence,
       (SELECT count(*) FROM emerging_patterns WHERE "organizationId" = $1) AS patterns,
       (SELECT coalesce(sum("trustScore"), 0) FROM knowledge_items WHERE "organizationId" = $1) AS trust_total`,
    [organizationId]
  );
  return result.rows[0];
}

async function snapshotOthers(db) {
  const rows = await db.query(
    'SELECT id, name, industry, description, settings, "createdAt", "updatedAt" FROM organizations WHERE NOT (id = ANY($1::text[])) ORDER BY id',
    [TARGETS]
  );
  return JSON.stringify(rows.rows);
}

/** Restore only the empty array fields; returns the list of fields patched. */
async function applyRestore(db, organizationId, seedProfile) {
  const settings = await settingsOf(db, organizationId);
  const patch = {};
  for (const field of ARRAY_FIELDS) {
    const current = settings[field];
    const seedValue = seedProfile[field];
    if (!Array.isArray(seedValue) || seedValue.length === 0) continue;
    const isEmpty = !Array.isArray(current) || current.length === 0;
    if (isEmpty) patch[field] = seedValue;
  }
  const patchedFields = Object.keys(patch);
  if (patchedFields.length > 0) {
    // jsonb concatenation merges only the patched keys; every other settings key
    // and every other column stays byte-identical.
    await db.query(
      "UPDATE organizations SET settings = settings || $2::jsonb || jsonb_build_object('_profileRevision', COALESCE((settings->>'_profileRevision')::int, 0) + 1), \"updatedAt\" = CURRENT_TIMESTAMP WHERE id = $1",
      [organizationId, JSON.stringify(patch)]
    );
  }
  return patchedFields;
}

function reportScalarDrift(organizationId, settings, seedProfile) {
  const drift = [];
  for (const key of PRESERVED_SCALARS) {
    const stored = settings[key];
    const expected = seedProfile[key];
    if (expected === undefined) continue;
    if (stored !== expected) drift.push(`${key}: stored ${JSON.stringify(stored)} vs seed ${JSON.stringify(expected)}`);
  }
  if (drift.length > 0) {
    console.log(`  NOT RESTORED (user-editable, reported only) — ${organizationId}:`);
    for (const line of drift) console.log(`    - ${line}`);
  }
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const othersBefore = await snapshotOthers(db);
    const before = new Map();
    for (const organizationId of TARGETS) {
      before.set(organizationId, {
        identity: await identityOf(db, organizationId),
        settings: await settingsOf(db, organizationId),
        counts: await resourceCounts(db, organizationId)
      });
    }

    for (const organizationId of TARGETS) {
      const seedProfile = seedFor(organizationId);
      assert.ok(seedProfile, `${organizationId} must have a seed definition`);
      const storedBefore = before.get(organizationId).settings;
      const empties = ARRAY_FIELDS.filter((field) => {
        const seedValue = seedProfile[field];
        const current = storedBefore[field];
        return Array.isArray(seedValue) && seedValue.length > 0 && (!Array.isArray(current) || current.length === 0);
      });
      console.log(`\n${organizationId}`);
      console.log(`  BEFORE empty-but-seeded fields: [${empties.join(", ") || "none"}]`);

      const patched = await applyRestore(db, organizationId, seedProfile);
      console.log(`  restore pass 1 patched: [${patched.join(", ") || "none (already populated)"}]`);
      assert.deepEqual(patched, empties, "the restore must patch exactly the empty-but-seeded fields");

      const afterFirst = await settingsOf(db, organizationId);
      const patchedAgain = await applyRestore(db, organizationId, seedProfile);
      assert.equal(patchedAgain.length, 0, `${organizationId} second restore pass must be a no-op`);
      const afterSecond = await settingsOf(db, organizationId);
      assert.deepEqual(afterSecond, afterFirst, "rerun must not duplicate or alter values");
      console.log("  restore pass 2: no-op confirmed (idempotent)");

      // Read back through the real production load path, not raw SQL.
      const profile = await service.getOrganizationProfile(organizationId);
      for (const field of ARRAY_FIELDS) {
        const seedValue = seedProfile[field];
        if (!Array.isArray(seedValue) || seedValue.length === 0) continue;
        if (empties.includes(field)) {
          assert.deepEqual(profile[field], seedValue, `${organizationId} ${field} must match the seed definition`);
        } else {
          assert.deepEqual(profile[field], storedBefore[field], `${organizationId} ${field} was already populated and must be unchanged`);
        }
      }
      console.log(`  AFTER sizes: ${ARRAY_FIELDS.map((f) => `${f}=${profile[f].length}`).join(" ")}`);
      reportScalarDrift(organizationId, afterSecond, seedProfile);
    }

    /* Untouched-data guarantees. */
    for (const organizationId of TARGETS) {
      const baseline = before.get(organizationId);
      assert.deepEqual(await identityOf(db, organizationId), baseline.identity, `${organizationId} identity columns must be unchanged`);
      const after = await settingsOf(db, organizationId);
      for (const key of Object.keys(baseline.settings)) {
        if (ARRAY_FIELDS.includes(key) || key === "_profileRevision") continue;
        assert.deepEqual(after[key], baseline.settings[key], `${organizationId} unrelated settings key ${key} must be unchanged`);
      }
      for (const key of PRESERVED_SCALARS) {
        assert.deepEqual(after[key], baseline.settings[key], `${organizationId} ${key} must not be written by this restore`);
      }
      assert.deepEqual(await resourceCounts(db, organizationId), baseline.counts, `${organizationId} knowledge/tickets/memory/trust/patterns must be untouched`);
    }
    assert.equal(await snapshotOthers(db), othersBefore, "every other organization row must be byte-identical");

    console.log("\nOrganization profile settings restored and verified. Knowledge, tickets, trust, memory, metrics, patterns, and all other organizations untouched.");
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
