/*
 * Targeted BUG-008 data-quality fix (TODO-009 follow-up).
 *
 * Maesa Tech's PostgreSQL organization settings lost the profile vocabulary
 * during migration (products/services/supportedDomains/businessVocabulary are
 * empty arrays), which disables every category rule in
 * `categoryAllowedByProfile()` and makes all Maesa tickets classify as
 * Uncategorized. This script restores ONLY those four fields from the trusted
 * seed profile (data/seedOrganizationProfiles.ts).
 *
 * Guarantees:
 * - Only `organizations.settings` for Maesa/FastDrop is patched, via a
 *   jsonb merge of the four vocabulary keys plus the profile concurrency
 *   revision; profile identity and organization-owned resources are untouched.
 * - A field is restored only when it is currently EMPTY; non-empty values are
 *   never overwritten, so reruns are no-ops (idempotent).
 * - Name/industry/description, knowledge, tickets, memory, validations,
 *   metrics, migration metadata, and persistence authority are untouched.
 * - Pramana rows are snapshot-verified unchanged.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not configured; the profile restore cannot run.");
  process.exit(1);
}


const { seedOrganizationProfiles } = require(path.join(root, "data", "seedOrganizationProfiles.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const service = require(path.join(root, "lib", "server", "persistenceService.ts"));

const MAESA = "profile-maesa-tech";
const FASTDROP = "profile-fastdrop-logistics";
const OTHER_MATURE = ["profile-pramana-legal"];
const VOCABULARY_FIELDS = ["products", "services", "supportedDomains", "businessVocabulary"];

function ticketOf(subject, description) {
  return {
    id: "restore-probe-ticket",
    customerName: "Probe Customer",
    subject,
    description,
    category: "General",
    status: "new",
    createdAt: new Date().toISOString()
  };
}

/** Restore only the empty vocabulary fields; returns the list of fields patched. */
async function applyRestore(db, organizationId, seedProfile) {
  const row = await db.query("SELECT settings FROM organizations WHERE id = $1", [organizationId]);
  assert.equal(row.rows.length, 1, `${organizationId} organization row must exist`);
  const settings = row.rows[0].settings ?? {};

  const patch = {};
  for (const field of VOCABULARY_FIELDS) {
    const current = settings[field];
    const isEmpty = !Array.isArray(current) || current.length === 0;
    if (isEmpty) patch[field] = seedProfile[field];
  }
  const patchedFields = Object.keys(patch);
  if (patchedFields.length > 0) {
    // jsonb concatenation merges only the patched keys; every other settings
    // key and every other column stays byte-identical.
    await db.query(
      "UPDATE organizations SET settings = settings || $2::jsonb || jsonb_build_object('_profileRevision', COALESCE((settings->>'_profileRevision')::int, 0) + 1), \"updatedAt\" = CURRENT_TIMESTAMP WHERE id = $1",
      [organizationId, JSON.stringify(patch)]
    );
  }
  return patchedFields;
}

async function snapshot(db, ids) {
  const rows = await db.query(
    'SELECT id, name, industry, description, settings, "createdAt", "updatedAt" FROM organizations WHERE id = ANY($1::text[]) ORDER BY id',
    [ids]
  );
  return JSON.stringify(rows.rows);
}

async function maesaDataCounts(db) {
  const result = await db.query(
    `SELECT
       (SELECT count(*) FROM knowledge_items WHERE "organizationId" = $1) AS knowledge,
       (SELECT count(*) FROM ticket_records WHERE "organizationId" = $1) AS tickets,
       (SELECT count(*) FROM validation_records WHERE "organizationId" = $1) AS validations,
       (SELECT count(*) FROM memory_change_records WHERE "organizationId" = $1) AS memory_changes,
       (SELECT count(*) FROM migration_import_batches WHERE "organizationId" = $1) AS migration_batches,
       (SELECT count(*) FROM organization_persistence_authority WHERE "organizationId" = $1) AS authority_rows`,
    [MAESA]
  );
  return result.rows[0];
}

async function main() {
  const seedProfile = seedOrganizationProfiles.find((profile) => profile.id === MAESA);
  assert.ok(seedProfile, "Seed Maesa profile must exist");
  for (const field of VOCABULARY_FIELDS) {
    assert.ok(Array.isArray(seedProfile[field]) && seedProfile[field].length > 0, `seed ${field} must be non-empty`);
  }

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const othersBefore = await snapshot(db, OTHER_MATURE);
    const countsBefore = await maesaDataCounts(db);
    const maesaIdentityBefore = await db.query("SELECT id, name, industry, description FROM organizations WHERE id = $1", [MAESA]);
    const settingsBefore = (await db.query("SELECT settings FROM organizations WHERE id = $1", [MAESA])).rows[0].settings;
    const fastDropSeed = seedOrganizationProfiles.find((profile) => profile.id === FASTDROP);
    assert.ok(fastDropSeed, "Seed FastDrop profile must exist");
    const fastDropIdentityBefore = await db.query("SELECT id, name, industry, description FROM organizations WHERE id = $1", [FASTDROP]);

    /* Before: demonstrate the classification defect with the CURRENT profile. */
    const profileBefore = await service.getOrganizationProfile(MAESA);
    const loginTicket = ticketOf(
      "Unable to access my workspace after device swap",
      "Hi team, my company issued me a different computer this week. Previously the browser filled in my Maesa credentials for me, so I never actually typed them. On the swapped device that stored sign-on is gone and I genuinely have no clue what it was. Could you walk me through regaining entry to my workspace?"
    );
    const billingTicket = ticketOf(
      "Question about my latest invoice",
      "Hello, my invoice for this billing cycle shows a charge I do not recognize. Can you explain the payment on this invoice?"
    );
    const beforeLogin = understandForProfile(loginTicket, profileBefore).category;
    const beforeBilling = understandForProfile(billingTicket, profileBefore).category;
    console.log(`BEFORE: vocabulary sizes ${VOCABULARY_FIELDS.map((f) => `${f}=${profileBefore[f].length}`).join(" ")}`);
    console.log(`BEFORE: login paraphrase -> "${beforeLogin}", billing ticket -> "${beforeBilling}"`);

    /* Apply the restore. */
    const patched = await applyRestore(db, MAESA, seedProfile);
    console.log(`Restore pass 1: patched fields = [${patched.join(", ") || "none (already populated)"}]`);
    const fastDropPatched = await applyRestore(db, FASTDROP, fastDropSeed);
    console.log(`FastDrop restore pass 1: patched fields = [${fastDropPatched.join(", ") || "none (already populated)"}]`);

    /* Idempotency: a second pass must patch nothing and change nothing. */
    const settingsAfterFirst = (await db.query("SELECT settings FROM organizations WHERE id = $1", [MAESA])).rows[0].settings;
    const patchedAgain = await applyRestore(db, MAESA, seedProfile);
    assert.equal(patchedAgain.length, 0, "second restore pass must be a no-op");
    const settingsAfterSecond = (await db.query("SELECT settings FROM organizations WHERE id = $1", [MAESA])).rows[0].settings;
    assert.deepEqual(settingsAfterSecond, settingsAfterFirst, "rerun must not duplicate or alter values");
    console.log("Restore pass 2: no-op confirmed (idempotent).");
    const fastDropPatchedAgain = await applyRestore(db, FASTDROP, fastDropSeed);
    assert.equal(fastDropPatchedAgain.length, 0, "FastDrop second restore pass must be a no-op");

    /* After: verify vocabulary and classification through the real load path. */
    const profileAfter = await service.getOrganizationProfile(MAESA);
    for (const field of VOCABULARY_FIELDS) {
      assert.deepEqual(profileAfter[field], seedProfile[field], `${field} must match the seed profile`);
    }
    const afterLogin = understandForProfile(loginTicket, profileAfter).category;
    const afterBilling = understandForProfile(billingTicket, profileAfter).category;
    console.log(`AFTER:  vocabulary sizes ${VOCABULARY_FIELDS.map((f) => `${f}=${profileAfter[f].length}`).join(" ")}`);
    console.log(`AFTER:  login paraphrase -> "${afterLogin}", billing ticket -> "${afterBilling}"`);
    assert.equal(afterLogin, "Login", "login paraphrase must classify as Login once vocabulary exists");
    assert.equal(afterBilling, "Billing", "billing ticket must classify as Billing once vocabulary exists");
    const fastDropAfter = await service.getOrganizationProfile(FASTDROP);
    for (const field of VOCABULARY_FIELDS) {
      assert.deepEqual(fastDropAfter[field], fastDropSeed[field], `FastDrop ${field} must match the seed profile`);
    }
    const fastDropIdentityAfter = await db.query("SELECT id, name, industry, description FROM organizations WHERE id = $1", [FASTDROP]);
    assert.deepEqual(fastDropIdentityAfter.rows, fastDropIdentityBefore.rows, "FastDrop identity fields must be unchanged");

    /* Untouched-data guarantees. */
    const maesaIdentityAfter = await db.query("SELECT id, name, industry, description FROM organizations WHERE id = $1", [MAESA]);
    assert.deepEqual(maesaIdentityAfter.rows, maesaIdentityBefore.rows, "Maesa identity fields must be unchanged");
    for (const key of Object.keys(settingsBefore)) {
      if (VOCABULARY_FIELDS.includes(key) || key === "_profileRevision") continue;
      assert.deepEqual(settingsAfterSecond[key], settingsBefore[key], `unrelated settings key ${key} must be unchanged`);
    }
    const countsAfter = await maesaDataCounts(db);
    assert.deepEqual(countsAfter, countsBefore, "Maesa knowledge/tickets/memory/validations/migration/authority must be untouched");
    const othersAfter = await snapshot(db, OTHER_MATURE);
    assert.equal(othersAfter, othersBefore, "FastDrop and Pramana rows must be byte-identical");

    console.log("Maesa/FastDrop profile vocabulary restored and verified. Pramana untouched.");
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
