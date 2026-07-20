/*
 * TODO-020 invalid/epoch "Last Updated" timestamp probe.
 *
 * Verifies the shared read-only timestamp validation + display fallback in
 * lib/knowledgeTimestamps.ts:
 *   - epoch/sentinel, missing, and invalid timestamps never display as a date;
 *   - the best legitimate lifecycle timestamp is used instead;
 *   - a valid (even old) timestamp is used unchanged;
 *   - with no valid timestamp a neutral label is shown (never a fabricated date).
 *
 * CASE G/H load Maesa + FastDrop READ-ONLY and assert nothing is mutated.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not configured; the read-only TODO-020 probe cannot run.");
  process.exit(1);
}


const { isLegitimateTimestamp, resolveLegitimateTimestamp, formatLastUpdatedDisplay } = require(path.join(root, "lib", "knowledgeTimestamps.ts"));
const service = require(path.join(root, "lib", "server", "persistenceService.ts"));

const EPOCH = "1970-01-01T00:00:00.000Z";
const failures = [];
function check(name, condition, detail) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!condition) failures.push(name + (detail ? ": " + detail : ""));
}

async function main() {
  // A composite "item" ordering used by the UI: [lastUpdated, lastValidated, approvedAt, createdAt]
  const order = (lastUpdated, lastValidated, approvedAt, createdAt) => [lastUpdated, lastValidated, approvedAt, createdAt];

  /* CASE A — epoch sentinel */
  console.log("=== CASE A — epoch sentinel ===");
  check("A isLegitimateTimestamp(epoch) === false", isLegitimateTimestamp(EPOCH) === false);
  const a = formatLastUpdatedDisplay(order(EPOCH, "2026-07-15T00:48:16.726Z", "2026-07-02T01:00:25.847Z", "2026-07-02T01:00:25.847Z"));
  check("A does not display 1 Jan 1970", !/1970/.test(a) && a !== "1 Jan 1970", a);
  check("A falls back to lastValidated (15 Jul 2026)", a === "15 Jul 2026", a);

  /* CASE B — missing */
  console.log("\n=== CASE B — missing (null/undefined) ===");
  const b = formatLastUpdatedDisplay(order(undefined, null, "2026-07-02T01:00:25.847Z", "2026-07-02T01:00:25.847Z"));
  check("B uses next legitimate fallback (approvedAt)", b === "2 Jul 2026", b);

  /* CASE C — invalid string */
  console.log("\n=== CASE C — invalid date string ===");
  const c = formatLastUpdatedDisplay(order("not-a-real-date", "also bad", "2026-07-02T01:00:25.847Z", "2026-07-02T01:00:25.847Z"));
  check("C no crash / no 'Invalid Date'", c !== "Invalid Date" && !/Invalid/.test(c), c);
  check("C uses legitimate fallback (approvedAt)", c === "2 Jul 2026", c);

  /* CASE D — valid current timestamp used unchanged */
  console.log("\n=== CASE D — valid current timestamp ===");
  const d = formatLastUpdatedDisplay(order("2026-07-18T12:00:00.000Z", "2026-07-15T00:00:00.000Z", "2026-07-02T00:00:00.000Z", "2026-07-01T00:00:00.000Z"));
  check("D uses lastUpdated unchanged (18 Jul 2026)", d === "18 Jul 2026", d);
  check("D resolveLegitimateTimestamp returns lastUpdated iso", resolveLegitimateTimestamp(order("2026-07-18T12:00:00.000Z", "x", "y", "z")) === "2026-07-18T12:00:00.000Z");

  /* CASE E — valid but OLD timestamp must not be rejected */
  console.log("\n=== CASE E — valid historical timestamp ===");
  check("E isLegitimateTimestamp(1999) === true", isLegitimateTimestamp("1999-03-04T08:00:00.000Z") === true);
  const e = formatLastUpdatedDisplay(order("1999-03-04T08:00:00.000Z", undefined, undefined, undefined));
  check("E old-but-valid date is used (4 Mar 1999)", e === "4 Mar 1999", e);

  /* CASE F — no valid timestamps → neutral label, never fabricated */
  console.log("\n=== CASE F — no valid timestamps ===");
  const f = formatLastUpdatedDisplay(order(EPOCH, null, "garbage", undefined));
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  check("F returns neutral 'Unknown'", f === "Unknown", f);
  check("F did NOT fabricate today's date", f !== today, `today=${today}`);
  check("F resolveLegitimateTimestamp returns null", resolveLegitimateTimestamp(order(EPOCH, null, "garbage", undefined)) === null);

  /* CASE G — Maesa canonical-login-issue (read-only) */
  console.log("\n=== CASE G — Maesa canonical-login-issue (read-only) ===");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const before = await client.query(
    `SELECT "lastUpdatedAt","lastValidated","approvedAt","createdAt" FROM knowledge_items WHERE "organizationId"=$1 AND id=$2`,
    ["profile-maesa-tech", "canonical-login-issue"]
  );
  const row = before.rows[0];
  console.log(`   persisted lastUpdatedAt = ${row.lastUpdatedAt.toISOString()} (unchanged by this probe)`);
  const maesa = (await service.loadKnowledge("profile-maesa-tech")).find((i) => i.id === "canonical-login-issue");
  const gDisplay = formatLastUpdatedDisplay([maesa.lastUpdated, maesa.lastValidated, maesa.approvedAt, maesa.createdAt]);
  console.log(`   item.lastUpdated=${maesa.lastUpdated} lastValidated=${maesa.lastValidated} approvedAt=${maesa.approvedAt}`);
  console.log(`   resolved display = ${gDisplay}`);
  // The stored timestamptz is an epoch/pre-epoch sentinel. The raw pg driver
  // surfaces it as 1969-12-31T17:00:00Z (naive local epoch, getTime < 0) while
  // Prisma normalizes to 1970-01-01T00:00:00Z (getTime === 0); both are sentinels.
  check("G persisted epoch/sentinel value still present (not corrected)", row.lastUpdatedAt.getTime() <= 0 && isLegitimateTimestamp(row.lastUpdatedAt) === false);
  check("G display is NOT 1 Jan 1970", !/1970/.test(gDisplay), gDisplay);
  check("G display resolves to lastValidated (15 Jul 2026)", gDisplay === "15 Jul 2026", gDisplay);

  /* CASE H — FastDrop (and Pramana if present) valid timestamps still display */
  console.log("\n=== CASE H — FastDrop / Pramana read-only ===");
  const orgs = (await client.query(`SELECT DISTINCT "organizationId" FROM knowledge_items WHERE "organizationId" <> 'profile-maesa-tech' ORDER BY "organizationId"`)).rows.map((r) => r.organizationId);
  console.log(`   other orgs with knowledge: ${orgs.join(", ") || "(none)"}`);
  let hOk = true;
  for (const orgId of orgs) {
    const items = await service.loadKnowledge(orgId);
    for (const it of items) {
      const disp = formatLastUpdatedDisplay([it.lastUpdated, it.lastValidated, it.approvedAt, it.createdAt]);
      const legit = isLegitimateTimestamp(it.lastUpdated);
      // Every non-Maesa item here has a legit lastUpdatedAt (audit confirmed); display must equal it and never be 1970/Unknown/Invalid.
      if (/1970|Unknown|Invalid/.test(disp)) { hOk = false; console.log(`     UNEXPECTED ${orgId}/${it.id}: ${disp}`); }
      else console.log(`     ${orgId}/${it.id} legitLastUpdated=${legit} display=${disp}`);
    }
  }
  check("H FastDrop/other valid timestamps still display correctly", hOk);

  // Immutability re-check: re-read Maesa row, confirm identical
  const after = await client.query(
    `SELECT "lastUpdatedAt","lastValidated","approvedAt","createdAt" FROM knowledge_items WHERE "organizationId"=$1 AND id=$2`,
    ["profile-maesa-tech", "canonical-login-issue"]
  );
  check("Maesa row unchanged after probe", JSON.stringify(after.rows[0]) === JSON.stringify(before.rows[0]));
  await client.end();

  console.log("\n=== SUMMARY ===");
  if (failures.length > 0) {
    console.error(`FAILURES (${failures.length}):\n- ${failures.join("\n- ")}`);
    process.exitCode = 1;
  } else {
    console.log("All TODO-020 cases passed. Read-only probe complete; no data was written.");
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
