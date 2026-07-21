/*
 * TODO-025D: create-only persistence of the deterministic TODO-025C developer
 * demo dataset into PostgreSQL for profile-oip-developer-demo.
 *
 * This command never resets, deletes, or upserts over existing mature data and
 * only ever writes to the developer-demo organization. It is a thin wrapper over
 * the server-only seed service, which owns the exact-organization guard, the
 * create-only gate, the single-transaction persistence, and verification.
 */
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

const { seedDeveloperDemoMatureDataset } = require(path.join(root, "lib", "server", "developerDemoSeedService.ts"));
const { getPrismaClient } = require(path.join(root, "lib", "server", "prisma.ts"));

function requestedSeed(argv) {
  const seedArguments = argv.filter((argument) => argument.startsWith("--seed="));
  const unknown = argv.filter((argument) => !argument.startsWith("--seed=") && argument !== "--verify-existing");
  if (unknown.length > 0 || seedArguments.length > 1) {
    throw new Error("Usage: npm run seed:developer-demo-mature -- [--seed=<deterministic-seed>] [--verify-existing]");
  }
  return seedArguments.length === 1 ? seedArguments[0].slice("--seed=".length) : undefined;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const argv = process.argv.slice(2);
  const result = await seedDeveloperDemoMatureDataset({
    seed: requestedSeed(argv),
    verifyExisting: argv.includes("--verify-existing")
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.outcome === "CREATE_ONLY_ABORT") process.exitCode = 2;
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(async () => {
      try {
        await getPrismaClient().$disconnect();
      } catch {
        /* ignore disconnect errors on shutdown */
      }
    });
}

module.exports = { seedDeveloperDemoMatureDataset };
