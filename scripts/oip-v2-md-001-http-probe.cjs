/*
 * OIP-V2-MD-001 route-level acceptance probe.
 * Exercises the authenticated HTTP boundary with disposable organizations;
 * the service probe covers the deeper deterministic composition assertions.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { createMigrationHttpAuth } = require("./lib/migration-http-auth.cjs");

const { root } = installProbeHarness();
const { prisma } = require(path.join(root, "lib", "server", "prisma.ts"));

const baseUrl = process.env.MD001_HTTP_BASE_URL || "http://127.0.0.1:3412";
const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
const organizationId = `md001-http-org-${suffix}`;
const otherOrganizationId = `md001-http-other-${suffix}`;

async function request(cookie, route, init = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...init,
    headers: { ...(init.body ? { "content-type": "application/json" } : {}), cookie, ...(init.headers || {}) }
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function main() {
  let auth;
  try {
    await prisma.organization.createMany({ data: [
      { id: organizationId, name: "MD-001 HTTP Finance Org", industry: "Accounting", description: "Disposable route probe", settings: {}, createdAt: new Date(), updatedAt: new Date() },
      { id: otherOrganizationId, name: "MD-001 HTTP Other Org", industry: "Operations", description: "Disposable isolation probe", settings: {}, createdAt: new Date(), updatedAt: new Date() }
    ] });
    auth = await createMigrationHttpAuth(baseUrl, [organizationId, otherOrganizationId], "md001-http");

    const domains = await request(auth.cookie, `/api/organizations/${organizationId}/domains`);
    assert.equal(domains.response.status, 200);
    assert.equal(domains.body.data.length, 11, "Domain registry must be visible to an authenticated owner.");
    const finance = domains.body.data.find((domain) => domain.key === "finance");
    assert.ok(finance && finance.sensitivity === "restricted");

    const customDomain = await request(auth.cookie, `/api/organizations/${organizationId}/domains`, {
      method: "POST",
      body: JSON.stringify({ key: `http-test-${suffix}`, label: "HTTP Test", description: "Route probe domain", sensitivity: "internal" })
    });
    assert.equal(customDomain.response.status, 201);

    const experiencePayload = {
      domainId: finance.id,
      sourceKind: "EXPERIENCE",
      title: "Monthly financial report preparation",
      description: "The finance team follows the approved close checklist before drafting the monthly report.",
      context: "Finance close, monthly reporting",
      occurredAt: new Date().toISOString(),
      scope: { department: "finance", cadence: "monthly" },
      idempotencyKey: `http-experience-${suffix}`
    };
    const experience = await request(auth.cookie, `/api/organizations/${organizationId}/memory/experiences`, { method: "POST", body: JSON.stringify(experiencePayload) });
    assert.equal(experience.response.status, 201);
    const experienceReplay = await request(auth.cookie, `/api/organizations/${organizationId}/memory/experiences`, { method: "POST", body: JSON.stringify(experiencePayload) });
    assert.equal(experienceReplay.response.status, 201);
    assert.equal(experienceReplay.body.data.id, experience.body.data.id, "Experience retry must replay the same Source.");

    const sourceId = experience.body.data.id;
    const evidence = await request(auth.cookie, `/api/organizations/${organizationId}/memory/experiences/${sourceId}/evidence`, {
      method: "POST",
      body: JSON.stringify({ evidenceType: "observation", content: "The approved close checklist is followed before the report is drafted.", idempotencyKey: `http-evidence-${suffix}` })
    });
    assert.equal(evidence.response.status, 201);
    const prepared = await request(auth.cookie, `/api/organizations/${organizationId}/memory/experiences/${sourceId}/prepare`, { method: "POST" });
    assert.equal(prepared.response.status, 201);
    assert.equal(prepared.body.data.candidate.domainId, finance.id);
    const validated = await request(auth.cookie, `/api/organizations/${organizationId}/memory/experiences/${sourceId}/validate`, {
      method: "POST",
      body: JSON.stringify({ candidateId: prepared.body.data.candidate.id, rationale: "HTTP route reviewer confirmed the Finance procedure and scope.", idempotencyKey: `http-validation-${suffix}` })
    });
    assert.equal(validated.response.status, 200);
    assert.equal(validated.body.data.knowledgeItem.domainId, finance.id);

    const ask = await request(auth.cookie, `/api/organizations/${organizationId}/ask`, {
      method: "POST",
      body: JSON.stringify({ query: "How does the company prepare its monthly financial report?", domainId: finance.id, requestedSource: "memory" })
    });
    assert.equal(ask.response.status, 200);
    assert.ok(["memory_answer", "memory_weak_match"].includes(ask.body.data.state));
    assert.ok(ask.body.data.memoryContext?.source && ask.body.data.memoryContext.evidence.length > 0);

    const skills = await request(auth.cookie, `/api/organizations/${organizationId}/skills?domainId=${encodeURIComponent(finance.id)}`);
    assert.equal(skills.response.status, 200);
    assert.equal(skills.body.data.length, 0);
    const skill = await request(auth.cookie, `/api/organizations/${organizationId}/skills`, {
      method: "POST",
      body: JSON.stringify({ domainId: finance.id, key: `http-skill-${suffix}`, name: "HTTP Finance Skill", description: "A route-probed governed skill.", definition: { purpose: "Prepare a reviewable report draft.", requiredInputs: [], capabilities: ["memory.read"], permissions: ["document.draft", "memory.read"], tools: [], constraints: ["Human review is required."], expectedOutput: "Reviewable draft", escalationConditions: ["Missing current data"] }, riskLevel: "medium", executionPolicy: "BOUNDED_EXECUTION", humanReviewPolicy: "REQUIRED", scope: { level: "organization", department: "finance" }, memoryLinks: [{ knowledgeItemId: validated.body.data.knowledgeItem.id, knowledgeRevision: validated.body.data.knowledgeItem.revision, relationship: "grounding" }] })
    });
    assert.equal(skill.response.status, 201);
    assert.equal(skill.body.data.status, "DRAFT");
    const submitted = await request(auth.cookie, `/api/organizations/${organizationId}/skills/${skill.body.data.id}/lifecycle`, { method: "POST", body: JSON.stringify({ status: "READY_FOR_REVIEW" }) });
    assert.equal(submitted.response.status, 200);
    const validatedSkill = await request(auth.cookie, `/api/organizations/${organizationId}/skills/${skill.body.data.id}/lifecycle`, { method: "POST", body: JSON.stringify({ status: "VALIDATED" }) });
    assert.equal(validatedSkill.response.status, 200);

    const currentData = await request(auth.cookie, `/api/organizations/${organizationId}/ask`, { method: "POST", body: JSON.stringify({ query: "What was the total revenue last month?", domainId: finance.id, requestedSource: "auto" }) });
    assert.equal(currentData.response.status, 200);
    assert.equal(currentData.body.data.state, "current_data_unavailable");
    assert.equal(currentData.body.data.answer, null);

    const crossTenantSourceRead = await request(auth.cookie, `/api/organizations/${otherOrganizationId}/memory/experiences/${sourceId}/evidence`);
    assert.ok([403, 404].includes(crossTenantSourceRead.response.status), "A Source must fail closed through another organization route.");

    console.log(JSON.stringify({
      DOMAIN_HTTP_AUTHORIZATION: "PASS",
      MULTI_DEPARTMENT_HTTP_EXPERIENCE: "PASS",
      HTTP_IDEMPOTENCY: "PASS",
      HTTP_ASK_PROVENANCE: "PASS",
      HTTP_SKILL_LIFECYCLE: "PASS",
      HTTP_CURRENT_DATA_FAILS_SAFE: "PASS",
      HTTP_TENANT_ISOLATION: "PASS"
    }, null, 2));
    console.log("OIP-V2-MD-001 HTTP probe passed.");
  } finally {
    if (auth) await auth.cleanup();
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
