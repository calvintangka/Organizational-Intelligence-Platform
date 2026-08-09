/* RSS-1.2E.2 — deterministic, OrgMetrics-only reconciliation. */
const crypto = require("node:crypto");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();
const { Prisma } = require(path.join(root, "generated", "prisma", "client.ts"));
const { getPrismaClient } = require(path.join(root, "lib", "server", "prisma.ts"));
const {
  deriveAuthoritativeOrgMetricValuesTx
} = require(path.join(root, "lib", "server", "persistenceService.ts"));

const ORGANIZATION_ID = "profile-oip-developer-demo";
const ACTOR = process.env.RSS_1_2E_2_ACTOR || "system:rss-1.2e.2";
const CORRELATION_ID = process.env.RSS_1_2E_2_CORRELATION_ID || `rss-1.2e.2:${Date.now()}`;
const EXPECTED_BEFORE = {
  lifetimeTickets: 5003,
  knowledgeReused: 4707,
  knowledgeVersions: 130,
  emergingPatternsDetected: 54
};

function stable(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

const FOUR_FIELDS = ["lifetimeTickets", "knowledgeReused", "knowledgeVersions", "emergingPatternsDetected"];

function fourValues(row) {
  return Object.fromEntries(FOUR_FIELDS.map((field) => [field, row?.[field] ?? null]));
}

async function scopedSnapshot(prisma) {
  const where = { organizationId: ORGANIZATION_ID };
  const [knowledge, candidates, validations, memory, evidence, tickets, patterns, logs, metrics, sequence] = await Promise.all([
    prisma.knowledgeItem.findMany({ where, orderBy: { id: "asc" } }),
    prisma.knowledgeCandidate.findMany({ where, orderBy: { id: "asc" } }),
    prisma.validationRecord.findMany({ where, orderBy: { id: "asc" } }),
    prisma.memoryChangeRecord.findMany({ where, orderBy: { id: "asc" } }),
    prisma.trustEvidence.findMany({ where, orderBy: { id: "asc" } }),
    prisma.ticketRecord.findMany({ where, orderBy: { ticketId: "asc" } }),
    prisma.emergingPattern.findMany({ where, orderBy: { id: "asc" } }),
    prisma.intelligenceLog.findMany({ where, orderBy: { id: "asc" } }),
    prisma.orgMetrics.findUnique({ where: { organizationId: ORGANIZATION_ID } }),
    prisma.ticketSequence.findUnique({ where: { organizationId: ORGANIZATION_ID } })
  ]);
  const nonMetrics = { knowledge, candidates, validations, memory, evidence, tickets, patterns, logs, sequence };
  return {
    counts: Object.fromEntries(Object.entries(nonMetrics).map(([key, rows]) => [key, Array.isArray(rows) ? rows.length : rows ? 1 : 0])),
    nonMetricsDigest: digest(nonMetrics),
    metrics: fourValues(metrics),
    metricsDigest: digest(fourValues(metrics))
  };
}

async function deriveReadOnly(prisma) {
  return prisma.$transaction((tx) => deriveAuthoritativeOrgMetricValuesTx(tx, ORGANIZATION_ID), {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead
  });
}

async function dryRun(prisma) {
  const beforeSnapshot = await scopedSnapshot(prisma);
  const derived = await deriveReadOnly(prisma);
  const afterSnapshot = await scopedSnapshot(prisma);
  if (beforeSnapshot.nonMetricsDigest !== afterSnapshot.nonMetricsDigest) {
    throw new Error("Read-only dry run observed a non-OrgMetrics dataset change.");
  }
  return {
    mode: "dry-run",
    organizationId: ORGANIZATION_ID,
    actor: ACTOR,
    correlationId: CORRELATION_ID,
    timestamp: new Date().toISOString(),
    current: beforeSnapshot.metrics,
    derived,
    differences: Object.fromEntries(FOUR_FIELDS.map((field) => [field, derived[field] - beforeSnapshot.metrics[field]])),
    expectedSql: `UPDATE org_metrics SET ${FOUR_FIELDS.map((field) => `"${field}" = <derived>`).join(", ")} WHERE "organizationId" = '${ORGANIZATION_ID}';`,
    nonMetricsDigest: beforeSnapshot.nonMetricsDigest,
    metricsDigestBefore: beforeSnapshot.metricsDigest,
    metricsDigestAfterReadOnly: afterSnapshot.metricsDigest
  };
}

async function apply(prisma) {
  const timestamp = new Date().toISOString();
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "organizationId" FROM "org_metrics" WHERE "organizationId" = ${ORGANIZATION_ID} FOR UPDATE`;
    const row = await tx.orgMetrics.findUnique({ where: { organizationId: ORGANIZATION_ID } });
    const before = fourValues(row);
    if (JSON.stringify(before) !== JSON.stringify(EXPECTED_BEFORE)) {
      throw new Error(`Precondition failed: expected ${JSON.stringify(EXPECTED_BEFORE)}, found ${JSON.stringify(before)}.`);
    }
    const after = await deriveAuthoritativeOrgMetricValuesTx(tx, ORGANIZATION_ID);
    const rollbackValues = { ...before };
    const integrityDigest = digest({ organizationId: ORGANIZATION_ID, before, after, rollbackValues, actor: ACTOR, correlationId: CORRELATION_ID, timestamp });
    await tx.orgMetrics.update({ where: { organizationId: ORGANIZATION_ID }, data: after });
    return { before, after, rollbackValues, integrityDigest };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  const snapshot = await scopedSnapshot(prisma);
  return {
    mode: "applied",
    organizationId: ORGANIZATION_ID,
    actor: ACTOR,
    correlationId: CORRELATION_ID,
    timestamp,
    ...result,
    nonMetricsDigestAfter: snapshot.nonMetricsDigest,
    metricsDigestAfter: snapshot.metricsDigest
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--apply") && !args.has("--confirm")) {
    throw new Error("Controlled reconciliation requires both --apply and --confirm.");
  }
  const prisma = getPrismaClient();
  try {
    const output = args.has("--apply") ? await apply(prisma) : await dryRun(prisma);
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
