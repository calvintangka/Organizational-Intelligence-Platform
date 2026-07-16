/* Focused TODO-005 verification for the persistent regression organization. */
const assert = require("node:assert/strict");

const { TEST_ORGANIZATION_ID, seedTestOrganization } = require("./seed-test-organization.cjs");
const { getPrismaClient } = require("./migration-intake-probe.cjs");

const MATURE_ORGANIZATION_IDS = [
  "profile-maesa-tech",
  "profile-fastdrop-logistics"
];

function normalize(value) {
  if (value instanceof Date) return "<date>";
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !["organizationId", "createdAt", "updatedAt", "approvedAt", "firstSeenAt", "lastSeenAt", "lastUpdatedAt", "timestamp"].includes(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, normalize(nested)]));
  }
  return value;
}

async function resourceSnapshot(prisma) {
  const where = { organizationId: TEST_ORGANIZATION_ID };
  return normalize({
    knowledge: await prisma.knowledgeItem.findMany({ where, orderBy: { id: "asc" } }),
    candidates: await prisma.knowledgeCandidate.findMany({ where, orderBy: { id: "asc" } }),
    validations: await prisma.validationRecord.findMany({ where, orderBy: { id: "asc" } }),
    memory: await prisma.memoryChangeRecord.findMany({ where, orderBy: { id: "asc" } }),
    // TicketRecord.id is an internal cuid; ticketId is the deterministic public fixture key.
    tickets: (await prisma.ticketRecord.findMany({ where, orderBy: { ticketId: "asc" } })).map(({ id, ...ticket }) => ticket),
    patterns: await prisma.emergingPattern.findMany({ where, orderBy: { id: "asc" } }),
    logs: await prisma.intelligenceLog.findMany({ where, orderBy: { id: "asc" } }),
    metrics: await prisma.orgMetrics.findUnique({ where: { organizationId: TEST_ORGANIZATION_ID } }),
    sequence: await prisma.ticketSequence.findUnique({ where: { organizationId: TEST_ORGANIZATION_ID } })
  });
}

async function matureSnapshot(prisma) {
  const rows = [];
  for (const organizationId of MATURE_ORGANIZATION_IDS) {
    const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, updatedAt: true } });
    rows.push({
      organizationId,
      organization: organization && { id: organization.id, updatedAt: organization.updatedAt.toISOString() },
      counts: {
        knowledge: await prisma.knowledgeItem.count({ where: { organizationId } }),
        candidates: await prisma.knowledgeCandidate.count({ where: { organizationId } }),
        validations: await prisma.validationRecord.count({ where: { organizationId } }),
        memory: await prisma.memoryChangeRecord.count({ where: { organizationId } }),
        tickets: await prisma.ticketRecord.count({ where: { organizationId } }),
        patterns: await prisma.emergingPattern.count({ where: { organizationId } }),
        logs: await prisma.intelligenceLog.count({ where: { organizationId } }),
        metrics: await prisma.orgMetrics.count({ where: { organizationId } }),
        sequences: await prisma.ticketSequence.count({ where: { organizationId } })
      }
    });
  }
  return rows;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const prisma = getPrismaClient();
  const matureBefore = await matureSnapshot(prisma);
  const first = await seedTestOrganization();
  const firstSnapshot = await resourceSnapshot(prisma);
  const second = await seedTestOrganization();
  const secondSnapshot = await resourceSnapshot(prisma);

  assert.equal(first.organizationId, TEST_ORGANIZATION_ID);
  assert.equal(second.organizationId, TEST_ORGANIZATION_ID);
  assert.equal(first.authority, "server");
  assert.equal(second.authority, "server");
  assert.deepEqual(first.counts, {
    knowledgeItem: 1,
    knowledgeCandidate: 1,
    validationRecord: 1,
    memoryChangeRecord: 1,
    ticketRecord: 1,
    emergingPattern: 1,
    intelligenceLog: 1,
    orgMetrics: 1,
    ticketSequence: 1
  });
  assert.deepEqual(second.counts, first.counts);
  // The imported fixture contains ticket suffix 0015, so sequence reconciliation
  // safely advances the deterministic starting counter to 15.
  assert.equal(first.ticketSequence, 15);
  assert.equal(second.ticketSequence, 15);
  assert.deepEqual(secondSnapshot, firstSnapshot, "re-seeding must restore the same deterministic business state");
  assert.deepEqual(await matureSnapshot(prisma), matureBefore, "mature organizations must remain unchanged");

  const organization = await prisma.organization.findUnique({ where: { id: TEST_ORGANIZATION_ID } });
  assert.equal(organization?.name, "OIP Regression Test");
  const membershipCount = await prisma.organizationMembership.count({ where: { organizationId: TEST_ORGANIZATION_ID } });
  if (process.env.AUTH_DEVELOPMENT_USER_EMAIL?.trim()) {
    assert.equal(second.membership.assigned, true, "configured development user must receive membership");
    assert.equal(membershipCount >= 1, true);
  }

  console.log("Test organization probe passed: deterministic PostgreSQL fixture, server authority, representative resources, idempotent reset, persistent state, optional development membership, and mature-data safety.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
