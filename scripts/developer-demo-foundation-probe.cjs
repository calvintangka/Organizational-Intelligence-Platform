/* TODO-025B focused foundation, isolation, authorization, and switching probe. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();
const {
  DEVELOPER_DEMO_ORGANIZATION_ID,
  protectedSnapshot,
  seedDeveloperDemoFoundation,
  verifyFoundation
} = require("./seed-developer-demo-foundation.cjs");
const { getPrismaClient } = require(path.join(root, "lib", "server", "prisma.ts"));

const scrypt = promisify(crypto.scrypt);
const baseUrl = process.env.AUTH_PROBE_BASE_URL || "http://localhost:3000";
const MAESA = "profile-maesa-tech";
const FASTDROP = "profile-fastdrop-logistics";
const RESOURCE_NAMES = [
  "knowledge",
  "knowledge-candidates",
  "validation-records",
  "memory-change-records",
  "metrics",
  "intelligence-log",
  "emerging-patterns",
  "tickets",
  "ticket-sequence"
];

async function passwordHash(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64, { N: 16_384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(key).toString("base64url")}`;
}

async function request(pathname, init = {}) {
  return fetch(`${baseUrl}${pathname}`, init);
}

async function login(email, password) {
  const response = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  assert.equal(response.status, 200, "Foundation probe user must authenticate.");
  return response.headers.get("set-cookie").split(";", 1)[0];
}

async function setActive(cookie, organizationId) {
  const response = await request("/api/auth/active-organization", {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ organizationId })
  });
  assert.equal(response.status, 200, `Switch to ${organizationId} must succeed.`);
  const body = await response.json();
  assert.equal(body.data.activeOrganizationId, organizationId);
}

async function loadOrganization(cookie, organizationId) {
  const profileResponse = await request(`/api/organizations/${organizationId}`, { headers: { cookie } });
  assert.equal(profileResponse.status, 200);
  const profile = (await profileResponse.json()).data;
  assert.equal(profile.id, organizationId);

  const resources = {};
  for (const name of RESOURCE_NAMES) {
    const response = await request(`/api/organizations/${organizationId}/${name}`, { headers: { cookie } });
    assert.equal(response.status, 200, `${name} must load for ${organizationId}.`);
    resources[name] = (await response.json()).data;
  }
  const authorityResponse = await request(`/api/organizations/${organizationId}/persistence-authority`, { headers: { cookie } });
  assert.equal(authorityResponse.status, 200);
  const authority = (await authorityResponse.json()).data;
  assert.equal(authority.authority, "server");
  return { profile, resources, authority };
}

// TODO-025D may have create-only seeded the demo with its own mature dataset.
// The foundation guarantee is isolation, not emptiness: every resource the demo
// returns must be owned by the demo organization and never inherited from a
// protected organization.
function assertDemoScoped(snapshot) {
  for (const name of [
    "knowledge",
    "knowledge-candidates",
    "validation-records",
    "memory-change-records",
    "emerging-patterns",
    "tickets"
  ]) {
    for (const record of snapshot.resources[name]) {
      const owner = record.organizationId ?? record.orgId;
      assert.equal(owner, DEVELOPER_DEMO_ORGANIZATION_ID, `${name} record must be owned by the demo organization.`);
    }
  }
  assert.equal(snapshot.resources.metrics.organizationId, DEVELOPER_DEMO_ORGANIZATION_ID);
  assert.equal(snapshot.resources["ticket-sequence"].organizationId, DEVELOPER_DEMO_ORGANIZATION_ID);
}

async function createProbeUser(prisma, prefix) {
  const nonce = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const id = `${prefix}-${nonce}`;
  const email = `${id}@example.test`;
  const password = crypto.randomBytes(32).toString("base64url");
  await prisma.user.create({ data: { id, name: "Developer Demo Foundation Probe", email, passwordHash: await passwordHash(password) } });
  return { id, email, password };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const prisma = getPrismaClient();
  const protectedBefore = await protectedSnapshot(prisma);
  const first = await seedDeveloperDemoFoundation();
  const firstOrganization = await prisma.organization.findUnique({ where: { id: DEVELOPER_DEMO_ORGANIZATION_ID } });
  const firstUsers = await prisma.user.findMany({ where: { id: { startsWith: "user-oip-demo-" } }, orderBy: { id: "asc" } });
  const firstMemberships = await prisma.organizationMembership.findMany({
    where: { organizationId: DEVELOPER_DEMO_ORGANIZATION_ID },
    orderBy: { userId: "asc" }
  });
  const firstBatches = await prisma.migrationImportBatch.count({ where: { organizationId: DEVELOPER_DEMO_ORGANIZATION_ID } });

  const second = await seedDeveloperDemoFoundation();
  await verifyFoundation(prisma, { requireEmpty: false });
  const secondOrganization = await prisma.organization.findUnique({ where: { id: DEVELOPER_DEMO_ORGANIZATION_ID } });
  const secondUsers = await prisma.user.findMany({ where: { id: { startsWith: "user-oip-demo-" } }, orderBy: { id: "asc" } });
  const secondMemberships = await prisma.organizationMembership.findMany({
    where: { organizationId: DEVELOPER_DEMO_ORGANIZATION_ID },
    orderBy: { userId: "asc" }
  });
  assert.equal(second.organizationCreated, false);
  assert.equal(second.syntheticUsersCreated, 0);
  assert.equal(second.syntheticMembershipsCreated, 0);
  assert.equal(second.authorityCreated, false);
  assert.equal(secondOrganization.updatedAt.toISOString(), firstOrganization.updatedAt.toISOString(), "Rerun must not churn organization revision/timestamp.");
  assert.deepEqual(secondUsers.map((user) => user.updatedAt.toISOString()), firstUsers.map((user) => user.updatedAt.toISOString()));
  assert.deepEqual(secondMemberships.map((membership) => membership.createdAt.toISOString()), firstMemberships.map((membership) => membership.createdAt.toISOString()));
  assert.equal(await prisma.migrationImportBatch.count({ where: { organizationId: DEVELOPER_DEMO_ORGANIZATION_ID } }), firstBatches);

  const member = await createProbeUser(prisma, "developer-demo-switch-member");
  const nonMember = await createProbeUser(prisma, "developer-demo-switch-nonmember");
  try {
    await prisma.organizationMembership.createMany({
      data: [MAESA, DEVELOPER_DEMO_ORGANIZATION_ID, FASTDROP].map((organizationId) => ({
        userId: member.id,
        organizationId,
        role: "member"
      }))
    });
    const memberCookie = await login(member.email, member.password);
    const nonMemberCookie = await login(nonMember.email, nonMember.password);

    const denied = await request(`/api/organizations/${DEVELOPER_DEMO_ORGANIZATION_ID}`, { headers: { cookie: nonMemberCookie } });
    assert.equal(denied.status, 403, "Authenticated non-member must be blocked from demo organization.");

    await setActive(memberCookie, MAESA);
    const maesa = await loadOrganization(memberCookie, MAESA);
    await setActive(memberCookie, DEVELOPER_DEMO_ORGANIZATION_ID);
    const demoFirst = await loadOrganization(memberCookie, DEVELOPER_DEMO_ORGANIZATION_ID);
    assertDemoScoped(demoFirst);
    await setActive(memberCookie, FASTDROP);
    const fastDrop = await loadOrganization(memberCookie, FASTDROP);
    await setActive(memberCookie, DEVELOPER_DEMO_ORGANIZATION_ID);
    const demoSecond = await loadOrganization(memberCookie, DEVELOPER_DEMO_ORGANIZATION_ID);
    assertDemoScoped(demoSecond);

    assert.equal(maesa.profile.id, MAESA);
    assert.equal(fastDrop.profile.id, FASTDROP);
    assert.equal(demoFirst.profile.id, DEVELOPER_DEMO_ORGANIZATION_ID);
    assert.deepEqual(demoSecond, demoFirst, "Returning to demo must load the same server state without stale profile crossover.");
    const finalOrganization = await prisma.organization.findUnique({ where: { id: DEVELOPER_DEMO_ORGANIZATION_ID } });
    assert.equal(finalOrganization.updatedAt.toISOString(), firstOrganization.updatedAt.toISOString(), "Passive switching must not churn profile revisions.");
  } finally {
    await prisma.authSession.deleteMany({ where: { userId: { in: [member.id, nonMember.id] } } });
    await prisma.organizationMembership.deleteMany({ where: { userId: { in: [member.id, nonMember.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [member.id, nonMember.id] } } });
  }

  assert.deepEqual(await protectedSnapshot(prisma), protectedBefore, "Foundation probe must leave protected organizations unchanged.");
  console.log(JSON.stringify({
    organizationId: first.organizationId,
    authority: first.authority,
    firstRunCreated: first.organizationCreated,
    rerunNoOp: true,
    switching: ["Maesa -> Demo", "Demo -> FastDrop", "FastDrop -> Demo"],
    unauthorizedAccessBlocked: true,
    demoScopedAndIsolated: true,
    protectedOrganizationsUnchanged: true
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
