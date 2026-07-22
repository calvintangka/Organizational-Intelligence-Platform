/*
 * TODO-025I: hardened developer-only reset/reseed for profile-oip-developer-demo.
 *
 * DESTRUCTIVE. Requires explicit --confirm-reset. Targets exactly the developer
 * demo organization (hardcoded allowlist + denylist inside the server service);
 * it accepts no organization-id argument and no --force override. Reset is
 * transactional; reseed reuses the deterministic TODO-025C simulator + TODO-025D
 * create-only mature seed. Protected organizations are snapshotted and must be
 * unchanged.
 *
 *   npm run reset:developer-demo -- --confirm-reset              (reset + reseed)
 *   npm run reset:developer-demo -- --confirm-reset --no-reseed  (reset only)
 *   npm run reset:developer-demo                                 (refuses; zero writes)
 */
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

const { resetAndReseedDeveloperDemo } = require(path.join(root, "lib", "server", "developerDemoResetService.ts"));
const { getPrismaClient } = require(path.join(root, "lib", "server", "prisma.ts"));

const KNOWN_FLAGS = new Set(["--confirm-reset", "--no-reseed"]);

function parseArgs(argv) {
  const seedArg = argv.find((a) => a.startsWith("--seed="));
  const unknown = argv.filter((a) => !KNOWN_FLAGS.has(a) && !a.startsWith("--seed="));
  if (unknown.length > 0) {
    throw new Error(`Unsupported argument(s): ${unknown.join(", ")}. This command accepts no organization id and no --force override.`);
  }
  return {
    confirm: argv.includes("--confirm-reset"),
    reseed: !argv.includes("--no-reseed"),
    seed: seedArg ? seedArg.slice("--seed=".length) : undefined
  };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const options = parseArgs(process.argv.slice(2));
  const result = await resetAndReseedDeveloperDemo(options);

  console.log(`TARGET: ${result.organizationId}`);
  console.log(`DESTRUCTIVE RESET: ${result.destructive ? "YES" : "NO"}`);
  console.log(`PROTECTED ORGS: ${result.protectedOrganizationsUnchanged ? "UNTOUCHED" : "CHANGED"}`);
  if (result.outcome === "ABORTED_NO_CONFIRMATION") {
    console.log("RESET RESULT: ABORTED (no --confirm-reset; zero writes)");
    console.log("RESEED RESULT: SKIPPED");
    console.log("VERIFICATION RESULT: N/A");
    console.log(`\n${result.message}`);
    process.exitCode = 2;
    return;
  }
  console.log(`RESET RESULT: ${result.countsAfterReset ? "EMPTY FOUNDATION" : "?"} (before: ${JSON.stringify(result.countsBefore)})`);
  if (result.outcome === "RESET_ONLY") {
    console.log("RESEED RESULT: SKIPPED (--no-reseed)");
    console.log("VERIFICATION RESULT: FOUNDATION EMPTY STATE");
  } else {
    const failures = Object.values(result.verification ?? {}).filter((v) => v !== "PASS").length;
    console.log(`RESEED RESULT: SEEDED (seed=${result.seed}, sequence=${result.ticketSequence})`);
    console.log(`VERIFICATION RESULT: ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} · simulationDigest=${result.simulationDigest}`);
  }
  console.log(`\n${result.message}`);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`\nRESET/RESEED FAILED: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      try { await getPrismaClient().$disconnect(); } catch { /* ignore */ }
    });
}

module.exports = { resetAndReseedDeveloperDemo };
