/* TODO-036 read-only pre/post verification for the approved Developer Demo reseed. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required; TODO-036 verifies persisted PostgreSQL state.");
  process.exit(1);
}

const phase = process.argv.includes("--expect-before")
  ? "before"
  : process.argv.includes("--expect-after")
    ? "after"
    : null;
if (!phase || process.argv.filter((argument) => argument.startsWith("--expect-")).length !== 1) {
  console.error("Usage: npm run probe:todo036-resolution-mode-reseed -- --expect-before|--expect-after");
  process.exit(2);
}

const { prisma } = require(path.join(root, "lib", "server", "prisma.ts"));
const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { simulateDeveloperDemo } = require(path.join(root, "lib", "developerDemo", "simulator.ts"));
const resetService = require(path.join(root, "lib", "server", "developerDemoResetService.ts"));

const TARGET = "profile-oip-developer-demo";
const PROTECTED = [
  "profile-maesa-tech",
  "profile-fastdrop-logistics",
  "profile-pramana-consulting",
  "test-oip-regression"
];
const EXPECTED_DIGEST = "569930520f5ee6804664ddc766c959ce1709b32da38bd4c55dd0fdc5a741a463";

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function organizationSnapshot(organizationId) {
  const where = { organizationId };
  return digest(await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId } }),
    prisma.organizationMembership.findMany({ where, orderBy: { userId: "asc" } }),
    prisma.organizationPersistenceAuthority.findUnique({ where: { organizationId } }),
    prisma.knowledgeItem.findMany({ where, orderBy: { id: "asc" } }),
    prisma.knowledgeCandidate.findMany({ where, orderBy: { id: "asc" } }),
    prisma.validationRecord.findMany({ where, orderBy: { id: "asc" } }),
    prisma.memoryChangeRecord.findMany({ where, orderBy: { id: "asc" } }),
    prisma.ticketRecord.findMany({ where, orderBy: { id: "asc" } }),
    prisma.trustEvidence.findMany({ where, orderBy: { id: "asc" } }),
    prisma.emergingPattern.findMany({ where, orderBy: { id: "asc" } }),
    prisma.intelligenceLog.findMany({ where, orderBy: { id: "asc" } }),
    prisma.orgMetrics.findUnique({ where: { organizationId } }),
    prisma.ticketSequence.findUnique({ where: { organizationId } })
  ]));
}

async function protectedSnapshots() {
  return Object.fromEntries(await Promise.all(PROTECTED.map(async (id) => [id, await organizationSnapshot(id)])));
}

function apiSources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return apiSources(absolute);
    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [fs.readFileSync(absolute, "utf8")] : [];
  });
}

function check(label, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  assert.ok(condition, `${label}${detail ? `: ${detail}` : ""}`);
}

function resolutionSplit(tickets) {
  const completed = tickets.filter((ticket) => ticket.status === "resolved" || ticket.status === "rejected");
  const unresolved = tickets.filter((ticket) => ticket.status !== "resolved" && ticket.status !== "rejected");
  return {
    total: tickets.length,
    completed: completed.length,
    human: completed.filter((ticket) => ticket.resolutionMode === "human").length,
    automatic: completed.filter((ticket) => ticket.resolutionMode === "automatic").length,
    unknownCompleted: completed.filter((ticket) => ticket.resolutionMode === null || ticket.resolutionMode === undefined).length,
    unresolved: unresolved.length,
    unresolvedWithMode: unresolved.filter((ticket) => ticket.resolutionMode !== null && ticket.resolutionMode !== undefined).length
  };
}

async function persistedState() {
  const where = { organizationId: TARGET };
  const [knowledge, tickets, candidates, validations, memoryChanges, trustEvidence, patterns, metrics, sequence] = await Promise.all([
    persistence.loadKnowledge(TARGET),
    prisma.ticketRecord.findMany({ where, orderBy: [{ createdAt: "asc" }, { ticketId: "asc" }], select: { ticketId: true, status: true, resolutionMode: true, createdAt: true } }),
    prisma.knowledgeCandidate.count({ where }),
    prisma.validationRecord.count({ where }),
    prisma.memoryChangeRecord.count({ where }),
    prisma.trustEvidence.count({ where }),
    prisma.emergingPattern.count({ where }),
    prisma.orgMetrics.findUnique({ where: { organizationId: TARGET } }),
    prisma.ticketSequence.findUnique({ where: { organizationId: TARGET } })
  ]);
  return {
    counts: {
      knowledgeItems: knowledge.length,
      lessons: knowledge.reduce((total, item) => total + item.lessons.length, 0),
      knowledgeVersions: knowledge.reduce((total, item) => total + (item.knowledgeVersions?.length ?? 0), 0),
      tickets: tickets.length,
      candidates,
      validations,
      memoryChanges,
      trustEvidence,
      emergingPatterns: patterns,
      ticketSequence: sequence?.counter ?? null
    },
    split: resolutionSplit(tickets),
    metrics,
    dateRange: {
      first: tickets[0]?.createdAt.toISOString() ?? null,
      last: tickets.at(-1)?.createdAt.toISOString() ?? null
    }
  };
}

async function main() {
  const protectedBefore = await protectedSnapshots();
  const resetScript = fs.readFileSync(path.join(root, "scripts", "reset-developer-demo.cjs"), "utf8");
  const testing = resetService.__TESTING__;
  check("reset target is exact", testing.EXACT_TARGET === TARGET);
  check("reset allowlist contains only the Developer Demo", testing.RESET_ALLOWLIST.size === 1 && testing.RESET_ALLOWLIST.has(TARGET));
  check("protected organizations are denied", ["profile-maesa-tech", "profile-fastdrop-logistics", "profile-pramana-consulting", "test-oip-regression"].every((id) => testing.RESET_DENYLIST.has(id)));
  check("explicit confirmation is mandatory", resetScript.includes('argv.includes("--confirm-reset")'));
  check("CLI accepts no organization-id parameter or force override", resetScript.includes("accepts no organization id and no --force override"));
  check("reset service has no API exposure", apiSources(path.join(root, "app", "api")).every((source) => !source.includes("developerDemoResetService")));

  const simulation = simulateDeveloperDemo();
  const simulatedSplit = resolutionSplit(simulation.resources.tickets);
  check("approved deterministic simulator digest matches", simulation.digest === EXPECTED_DIGEST, simulation.digest);
  check("simulator contains the approved resolution split", simulatedSplit.total === 5000
    && simulatedSplit.completed === 4958
    && simulatedSplit.human === 4899
    && simulatedSplit.automatic === 59
    && simulatedSplit.unknownCompleted === 0);
  check("simulator unresolved tickets retain null mode", simulatedSplit.unresolved === 42 && simulatedSplit.unresolvedWithMode === 0);

  const persisted = await persistedState();
  const expectedCounts = {
    knowledgeItems: 45,
    lessons: 180,
    knowledgeVersions: 130,
    tickets: 5000,
    candidates: 1800,
    validations: 1800,
    memoryChanges: 1800,
    trustEvidence: 4500,
    emergingPatterns: 45,
    ticketSequence: 5000
  };
  check("persisted mature counts match", JSON.stringify(persisted.counts) === JSON.stringify(expectedCounts));
  check("persisted completed count is 4,958", persisted.split.completed === 4958);
  check("persisted unresolved modes remain null", persisted.split.unresolved === 42 && persisted.split.unresolvedWithMode === 0);
  if (phase === "before") {
    check("pre-reseed completed modes are historical unknown", persisted.split.human === 0
      && persisted.split.automatic === 0
      && persisted.split.unknownCompleted === 4958);
  } else {
    check("post-reseed completed modes are fully durable", persisted.split.human === 4899
      && persisted.split.automatic === 59
      && persisted.split.unknownCompleted === 0);
    check("human plus automatic reconstructs completed", persisted.split.human + persisted.split.automatic === persisted.split.completed);
    check("persisted OrgMetrics reconstruct from TicketRecord rows", persisted.metrics?.humanResolutions === persisted.split.human
      && persisted.metrics?.autoResolutions === persisted.split.automatic
      && persisted.metrics?.resolutionsCount === persisted.split.completed);
  }

  const protectedAfter = await protectedSnapshots();
  assert.deepEqual(protectedAfter, protectedBefore, "The focused TODO-036 probe must be read-only for protected organizations.");
  console.log(JSON.stringify({
    phase,
    target: TARGET,
    simulator: { digest: simulation.digest, split: simulatedSplit },
    persisted,
    protectedOrganizations: protectedAfter,
    dataSafety: "focused probe performed no writes"
  }, null, 2));
  console.log(`TODO-036 ${phase}-reseed resolution-mode verification passed.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await prisma.$disconnect(); } catch { /* ignore */ }
  });
