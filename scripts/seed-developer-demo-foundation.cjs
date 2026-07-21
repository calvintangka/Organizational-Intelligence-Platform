/*
 * TODO-025B: create or verify only the permanent developer-demo foundation.
 *
 * This command is deliberately create-only. It never deletes or resets an
 * organization and never seeds knowledge, tickets, candidates, validations,
 * memory changes, TrustEvidence, patterns, logs, lessons, or narrative history.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

const {
  DEVELOPER_DEMO_DISPLAY_NAME,
  DEVELOPER_DEMO_FOUNDATION_AT,
  DEVELOPER_DEMO_ORGANIZATION_ID,
  PROTECTED_ORGANIZATION_IDS,
  developerDemoActors,
  developerDemoProfile
} = require(path.join(root, "data", "developerDemoFoundation.ts"));
const migration = require(path.join(root, "lib", "server", "migrationImportService.ts"));
const execution = require(path.join(root, "lib", "server", "migrationImportExecutionService.ts"));
const verification = require(path.join(root, "lib", "server", "migrationVerificationService.ts"));
const authority = require(path.join(root, "lib", "server", "persistenceAuthorityService.ts"));
const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const digest = require(path.join(root, "lib", "persistence", "migrationExportDigest.ts"));
const { getPrismaClient } = require(path.join(root, "lib", "server", "prisma.ts"));

const FOUNDATION_FORMAT_VERSION = 1;
const FOUNDATION_SOURCE_LABEL = "todo-025b-developer-demo-foundation-v1";
const RESOURCE_NAMES = [...digest.MIGRATION_EXPORT_RESOURCE_NAMES];

// Valid production-format scrypt hash for an intentionally unavailable random
// password. Synthetic actors need no active sessions in TODO-025B. Developers
// access the organization through AUTH_DEVELOPMENT_USER_EMAIL; no plaintext
// synthetic password exists in source or command output.
const DISABLED_SYNTHETIC_PASSWORD_HASH =
  "scrypt-v1$Lu4RcCr9-57rHeHl6mIj7A$q3exO3hkEcME6TbFERRp5fV5gKVpM2KQR-b4MNVEJg1fjY28SbC8GA-JntJnRWk_bNSApsk13Ta1QvWObv098w";

const EMPTY_MODELS = [
  "knowledgeItem",
  "knowledgeCandidate",
  "validationRecord",
  "memoryChangeRecord",
  "ticketRecord",
  "trustEvidence",
  "emergingPattern",
  "intelligenceLog"
];

function assertExactTarget(organizationId) {
  if (organizationId !== DEVELOPER_DEMO_ORGANIZATION_ID || PROTECTED_ORGANIZATION_IDS.includes(organizationId)) {
    throw new Error(`Refusing developer-demo foundation operation for ${String(organizationId)}.`);
  }
}

function profileSettings(profile) {
  return {
    products: profile.products,
    services: profile.services,
    supportedDomains: profile.supportedDomains,
    businessVocabulary: profile.businessVocabulary,
    supportedIssueTypes: profile.supportedIssueTypes,
    outOfScopeTopics: profile.outOfScopeTopics,
    customerTone: profile.customerTone,
    supportBoundaries: profile.supportBoundaries,
    autoResolutionThreshold: profile.autoResolutionThreshold,
    escalationRules: profile.escalationRules,
    accentColor: profile.accentColor,
    logoInitials: profile.logoInitials
  };
}

function profileProjection(profile) {
  return {
    id: profile.id,
    name: profile.name,
    industry: profile.industry,
    description: profile.description,
    settings: profileSettings(profile),
    createdAt: new Date(profile.createdAt).toISOString()
  };
}

function organizationProjection(row) {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    description: row.description,
    settings: row.settings,
    createdAt: row.createdAt.toISOString()
  };
}

function zeroMetrics() {
  return {
    organizationId: DEVELOPER_DEMO_ORGANIZATION_ID,
    lifetimeTickets: 0,
    knowledgeReused: 0,
    autoResolutions: 0,
    humanResolutions: 0,
    totalResolutionTimeSec: 0,
    resolutionsCount: 0,
    memoryGrowthToday: 0,
    memoryGrowthDate: DEVELOPER_DEMO_FOUNDATION_AT.slice(0, 10),
    mergedTickets: 0,
    duplicatePreventions: 0,
    knowledgeVersions: 0,
    emergingPatternsDetected: 0,
    promotedPatterns: 0,
    aiCalls: 0,
    aiSuccesses: 0,
    aiFailures: 0,
    aiFallbacks: 0,
    aiAgreementSamples: 0,
    aiAgreementTotal: 0,
    humanAcceptedAISuggestions: 0,
    lastUpdatedAt: DEVELOPER_DEMO_FOUNDATION_AT
  };
}

function foundationResources() {
  return {
    knowledge: [],
    knowledgeCandidates: [],
    validationRecords: [],
    memoryChangeRecords: [],
    orgMetrics: zeroMetrics(),
    intelligenceLog: [],
    emergingPatterns: [],
    ticketRecords: [],
    ticketSequence: {
      organizationId: DEVELOPER_DEMO_ORGANIZATION_ID,
      counter: 0,
      updatedAt: DEVELOPER_DEMO_FOUNDATION_AT
    }
  };
}

function resourceCount(value) {
  if (Array.isArray(value)) return value.length;
  return value === null ? 0 : 1;
}

async function foundationPackage() {
  const resources = foundationResources();
  const sourceResourceStatuses = Object.fromEntries(RESOURCE_NAMES.map((name) => {
    const count = resourceCount(resources[name]);
    return [name, {
      source: count > 0 ? "scoped" : "absent",
      scopedPresent: count > 0,
      legacyPresent: false,
      fallbackUsed: false,
      resetSuppressed: false,
      scopedRecordCount: count,
      legacyRecordCount: 0,
      resolvedRecordCount: count
    }];
  }));
  const migrationState = {
    version: "v2",
    sourceVersion: FOUNDATION_SOURCE_LABEL,
    organizations: {
      [DEVELOPER_DEMO_ORGANIZATION_ID]: {
        resources: Object.fromEntries(RESOURCE_NAMES.map((name) => [name, {
          status: resourceCount(resources[name]) > 0 ? "copied" : "absent",
          updatedAt: DEVELOPER_DEMO_FOUNDATION_AT
        }])),
        completedAt: DEVELOPER_DEMO_FOUNDATION_AT
      }
    }
  };
  const pkg = {
    format: "oip-localstorage-export-v1",
    formatVersion: 1,
    organizationId: DEVELOPER_DEMO_ORGANIZATION_ID,
    organizationProfile: developerDemoProfile,
    organizationProfileSource: "seed",
    exportedAt: DEVELOPER_DEMO_FOUNDATION_AT,
    sourceSchemaVersion: "v2",
    sourcePersistenceMode: "local",
    ownershipEvidence: {
      organizationId: DEVELOPER_DEMO_ORGANIZATION_ID,
      ownershipStatus: "not-applicable",
      ownershipReason: "TODO-025B creates an isolated synthetic organization with no legacy browser resources.",
      legacyStoragePresent: false,
      legacyFallbackResources: [],
      resetSuppressed: false,
      safeForMigration: true
    },
    migrationState,
    sourceResourceStatuses,
    resources,
    counts: digest.countMigrationExportResources(resources),
    digests: null
  };
  pkg.digests = await digest.computeMigrationExportDigests(
    resources,
    digest.migrationExportDigestMetadata(pkg)
  );
  return pkg;
}

async function protectedSnapshot(prisma) {
  const result = {};
  for (const organizationId of PROTECTED_ORGANIZATION_IDS) {
    const where = { organizationId };
    const batches = await prisma.migrationImportBatch.findMany({
      where,
      orderBy: { id: "asc" },
      include: { resources: { orderBy: { id: "asc" } }, conflicts: { orderBy: { id: "asc" } } }
    });
    const value = {
      organization: await prisma.organization.findUnique({ where: { id: organizationId } }),
      memberships: await prisma.organizationMembership.findMany({ where, orderBy: { userId: "asc" } }),
      authority: await prisma.organizationPersistenceAuthority.findUnique({ where: { organizationId } }),
      knowledge: await prisma.knowledgeItem.findMany({ where, orderBy: { id: "asc" } }),
      candidates: await prisma.knowledgeCandidate.findMany({ where, orderBy: { id: "asc" } }),
      validations: await prisma.validationRecord.findMany({ where, orderBy: { id: "asc" } }),
      memory: await prisma.memoryChangeRecord.findMany({ where, orderBy: { id: "asc" } }),
      tickets: await prisma.ticketRecord.findMany({ where, orderBy: { id: "asc" } }),
      evidence: await prisma.trustEvidence.findMany({ where, orderBy: { id: "asc" } }),
      patterns: await prisma.emergingPattern.findMany({ where, orderBy: { id: "asc" } }),
      logs: await prisma.intelligenceLog.findMany({ where, orderBy: { id: "asc" } }),
      metrics: await prisma.orgMetrics.findUnique({ where: { organizationId } }),
      sequence: await prisma.ticketSequence.findUnique({ where: { organizationId } }),
      batches
    };
    result[organizationId] = crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }
  return result;
}

async function businessCounts(prisma) {
  const where = { organizationId: DEVELOPER_DEMO_ORGANIZATION_ID };
  const counts = {};
  for (const model of EMPTY_MODELS) counts[model] = await prisma[model].count({ where });
  counts.orgMetrics = await prisma.orgMetrics.count({ where });
  counts.ticketSequence = await prisma.ticketSequence.count({ where });
  const knowledgeRows = await prisma.knowledgeItem.findMany({ where, select: { content: true } });
  counts.knowledgeVersions = knowledgeRows.reduce((total, row) => {
    const content = row.content && typeof row.content === "object" && !Array.isArray(row.content) ? row.content : {};
    return total + (Array.isArray(content.knowledgeVersions) ? content.knowledgeVersions.length : 0);
  }, 0);
  return counts;
}

async function requireFoundationCompatible(prisma) {
  const row = await prisma.organization.findUnique({ where: { id: DEVELOPER_DEMO_ORGANIZATION_ID } });
  if (!row) return null;
  assert.deepEqual(
    organizationProjection(row),
    profileProjection(developerDemoProfile),
    "Existing developer-demo organization profile differs from the approved foundation; refusing to overwrite it."
  );
  return row;
}

async function ensureOrganization(prisma) {
  const existing = await requireFoundationCompatible(prisma);
  if (existing) return { created: false, row: existing };
  const at = new Date(DEVELOPER_DEMO_FOUNDATION_AT);
  const row = await prisma.organization.create({
    data: {
      id: DEVELOPER_DEMO_ORGANIZATION_ID,
      name: DEVELOPER_DEMO_DISPLAY_NAME,
      industry: developerDemoProfile.industry,
      description: developerDemoProfile.description,
      settings: profileSettings(developerDemoProfile),
      createdAt: at,
      updatedAt: at
    }
  });
  return { created: true, row };
}

async function ensureSyntheticActors(prisma) {
  const results = [];
  for (const actor of developerDemoActors) {
    const byId = await prisma.user.findUnique({ where: { id: actor.id } });
    const byEmail = await prisma.user.findUnique({ where: { email: actor.email } });
    if (byId || byEmail) {
      assert(byId && byEmail && byId.id === byEmail.id, `Synthetic actor identity collision for ${actor.id}.`);
      assert.equal(byId.name, actor.name, `Synthetic actor ${actor.id} has an unexpected name.`);
      assert.equal(byId.email, actor.email, `Synthetic actor ${actor.id} has an unexpected email.`);
      assert.equal(byId.passwordHash, DISABLED_SYNTHETIC_PASSWORD_HASH, `Synthetic actor ${actor.id} credential hash differs.`);
      results.push({ id: actor.id, created: false });
      continue;
    }
    const at = new Date(actor.createdAt);
    await prisma.user.create({
      data: {
        id: actor.id,
        name: actor.name,
        email: actor.email,
        passwordHash: DISABLED_SYNTHETIC_PASSWORD_HASH,
        createdAt: at,
        updatedAt: at
      }
    });
    results.push({ id: actor.id, created: true });
  }
  return results;
}

async function ensureMembership(prisma, userId, role, createdAt) {
  const key = { userId_organizationId: { userId, organizationId: DEVELOPER_DEMO_ORGANIZATION_ID } };
  const existing = await prisma.organizationMembership.findUnique({ where: key });
  if (existing) {
    assert.equal(existing.role, role, `Membership ${userId} has an unexpected authorization role.`);
    return false;
  }
  await prisma.organizationMembership.create({
    data: { userId, organizationId: DEVELOPER_DEMO_ORGANIZATION_ID, role, createdAt: new Date(createdAt) }
  });
  return true;
}

async function ensureMemberships(prisma) {
  let syntheticCreated = 0;
  for (const actor of developerDemoActors) {
    if (await ensureMembership(prisma, actor.id, actor.membershipRole, actor.createdAt)) syntheticCreated += 1;
  }

  const actorIds = developerDemoActors.map((actor) => actor.id);
  const unrelated = await prisma.organizationMembership.findMany({
    where: { userId: { in: actorIds }, organizationId: { not: DEVELOPER_DEMO_ORGANIZATION_ID } },
    select: { userId: true, organizationId: true }
  });
  assert.deepEqual(unrelated, [], "Synthetic actors must not belong to unrelated organizations.");

  const configuredEmail = process.env.AUTH_DEVELOPMENT_USER_EMAIL?.trim().toLowerCase();
  let development = { configured: Boolean(configuredEmail), assigned: false, created: false };
  if (configuredEmail) {
    const user = await prisma.user.findUnique({ where: { email: configuredEmail }, select: { id: true } });
    assert(user, "AUTH_DEVELOPMENT_USER_EMAIL does not identify an existing user.");
    const created = await ensureMembership(prisma, user.id, "member", DEVELOPER_DEMO_FOUNDATION_AT);
    development = { configured: true, assigned: true, created };
  }
  return { syntheticCreated, development };
}

function foundationOnlyCounts(counts) {
  return EMPTY_MODELS.every((model) => counts[model] === 0)
    && counts.knowledgeVersions === 0
    && counts.orgMetrics <= 1
    && counts.ticketSequence <= 1;
}

async function ensureServerAuthority(prisma) {
  const state = await authority.getPersistenceAuthorityState(DEVELOPER_DEMO_ORGANIZATION_ID);
  if (state.authority === "server") {
    return { created: false, batchId: state.migrationBatchId, authority: state.authority };
  }

  const counts = await businessCounts(prisma);
  assert(foundationOnlyCounts(counts), "Local developer-demo organization contains non-foundation data; refusing empty cutover import.");
  const pkg = await foundationPackage();
  const intake = await migration.intakeMigrationExportPackage(pkg, DEVELOPER_DEMO_ORGANIZATION_ID);
  const imported = await execution.executeMigrationImport(DEVELOPER_DEMO_ORGANIZATION_ID, intake.batchId);
  assert.equal(imported.status, "imported", "Foundation migration import must complete without conflicts.");
  const verified = await verification.verifyMigrationImport(DEVELOPER_DEMO_ORGANIZATION_ID, intake.batchId);
  assert.equal(verified.status, "passed", "Foundation migration verification must pass before cutover.");
  const cutover = await authority.cutOverToServerAuthority(
    DEVELOPER_DEMO_ORGANIZATION_ID,
    intake.batchId,
    "TODO-025B permanent empty developer-demo foundation"
  );
  assert.equal(cutover.authority, "server");
  return { created: !cutover.idempotent, batchId: intake.batchId, authority: cutover.authority };
}

async function verifyFoundation(prisma, options = {}) {
  assertExactTarget(DEVELOPER_DEMO_ORGANIZATION_ID);
  const organization = await requireFoundationCompatible(prisma);
  assert(organization, "Developer-demo organization is missing.");
  const profile = await persistence.getOrganizationProfile(DEVELOPER_DEMO_ORGANIZATION_ID);
  assert.equal(profile.id, DEVELOPER_DEMO_ORGANIZATION_ID);
  assert.equal(profile.name, DEVELOPER_DEMO_DISPLAY_NAME);

  const actors = await prisma.user.findMany({
    where: { id: { in: developerDemoActors.map((actor) => actor.id) } },
    orderBy: { id: "asc" }
  });
  assert.equal(actors.length, developerDemoActors.length, "All eight synthetic actors must exist.");
  const memberships = await prisma.organizationMembership.findMany({
    where: { organizationId: DEVELOPER_DEMO_ORGANIZATION_ID },
    orderBy: { userId: "asc" }
  });
  for (const actor of developerDemoActors) {
    assert(memberships.some((membership) => membership.userId === actor.id && membership.role === "member"));
  }
  const unrelated = await prisma.organizationMembership.count({
    where: {
      userId: { in: developerDemoActors.map((actor) => actor.id) },
      organizationId: { not: DEVELOPER_DEMO_ORGANIZATION_ID }
    }
  });
  assert.equal(unrelated, 0);

  const state = await authority.getPersistenceAuthorityState(DEVELOPER_DEMO_ORGANIZATION_ID);
  assert.equal(state.authority, "server");
  assert.equal(state.verification?.overallStatus, "passed");

  const counts = await businessCounts(prisma);
  if (options.requireEmpty !== false) {
    assert(foundationOnlyCounts(counts));
    assert.equal(counts.orgMetrics, 1);
    assert.equal(counts.ticketSequence, 1);
  }
  if (options.requireEmpty !== false) {
    const metrics = await prisma.orgMetrics.findUnique({ where: { organizationId: DEVELOPER_DEMO_ORGANIZATION_ID } });
    assert(metrics, "Foundation OrgMetrics row is missing.");
    assert.equal(metrics.lifetimeTickets, 0);
    assert.equal(metrics.knowledgeReused, 0);
    assert.equal(metrics.autoResolutions, 0);
    assert.equal(metrics.humanResolutions, 0);
    const sequence = await prisma.ticketSequence.findUnique({ where: { organizationId: DEVELOPER_DEMO_ORGANIZATION_ID } });
    assert(sequence, "Foundation TicketSequence row is missing.");
    assert.equal(sequence.counter, 0);
  }

  const [demoKnowledge, maesaKnowledge, fastDropKnowledge] = await Promise.all([
    persistence.loadKnowledge(DEVELOPER_DEMO_ORGANIZATION_ID),
    persistence.loadKnowledge("profile-maesa-tech"),
    persistence.loadKnowledge("profile-fastdrop-logistics")
  ]);
  if (options.requireEmpty !== false) {
    assert.deepEqual(demoKnowledge, [], "Demo server read must not inherit mature knowledge.");
  } else {
    assert(
      demoKnowledge.every((item) => item.organizationId === DEVELOPER_DEMO_ORGANIZATION_ID),
      "Developer demo knowledge reads must remain organization-scoped."
    );
  }
  assert(maesaKnowledge.every((item) => item.organizationId === "profile-maesa-tech"));
  assert(fastDropKnowledge.every((item) => item.organizationId === "profile-fastdrop-logistics"));
  assert(maesaKnowledge.every((item) => !String(item.id).startsWith("demo-")));
  assert(fastDropKnowledge.every((item) => !String(item.id).startsWith("demo-")));

  return { organization, profile, actors, memberships, state, counts };
}

async function seedDeveloperDemoFoundation() {
  assertExactTarget(DEVELOPER_DEMO_ORGANIZATION_ID);
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const prisma = getPrismaClient();
  const protectedBefore = await protectedSnapshot(prisma);

  const organization = await ensureOrganization(prisma);
  const actors = await ensureSyntheticActors(prisma);
  const memberships = await ensureMemberships(prisma);
  const serverAuthority = await ensureServerAuthority(prisma);
  const verified = await verifyFoundation(prisma, { requireEmpty: serverAuthority.created });

  assert.deepEqual(await protectedSnapshot(prisma), protectedBefore, "Protected organizations changed during foundation creation.");
  return {
    formatVersion: FOUNDATION_FORMAT_VERSION,
    organizationId: DEVELOPER_DEMO_ORGANIZATION_ID,
    displayName: DEVELOPER_DEMO_DISPLAY_NAME,
    organizationCreated: organization.created,
    syntheticUsersCreated: actors.filter((actor) => actor.created).length,
    syntheticMembershipsCreated: memberships.syntheticCreated,
    developmentMembership: memberships.development,
    authorityCreated: serverAuthority.created,
    authority: verified.state.authority,
    migrationBatchId: verified.state.migrationBatchId,
    counts: verified.counts,
    protectedOrganizationsUnchanged: true
  };
}

async function main() {
  const result = await seedDeveloperDemoFoundation();
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  DEVELOPER_DEMO_ORGANIZATION_ID,
  assertExactTarget,
  businessCounts,
  foundationPackage,
  protectedSnapshot,
  seedDeveloperDemoFoundation,
  verifyFoundation
};
