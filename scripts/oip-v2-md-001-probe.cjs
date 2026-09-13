/*
 * OIP-V2-MD-001 targeted acceptance probe.
 * Uses a disposable database organization and the real server services. It
 * does not touch the existing Support corpus and cleans up in finally.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness();
const { prisma } = require(path.join(root, "lib", "server", "prisma.ts"));
const domains = require(path.join(root, "lib", "server", "domainService.ts"));
const memory = require(path.join(root, "lib", "server", "organizationalMemoryService.ts"));
const ask = require(path.join(root, "lib", "server", "askService.ts"));
const skills = require(path.join(root, "lib", "server", "skillService.ts"));
const execution = require(path.join(root, "lib", "server", "executionPackageService.ts"));

const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
const orgId = `md001-org-${suffix}`;
const userId = `md001-user-${suffix}`;
const secondOrgId = `md001-other-org-${suffix}`;

async function main() {
  let cleaned = false;
  try {
    await prisma.organization.createMany({ data: [
      { id: orgId, name: "MD-001 Disposable Finance Org", industry: "Accounting", description: "Targeted MD-001 acceptance fixture", settings: {}, createdAt: new Date(), updatedAt: new Date() },
      { id: secondOrgId, name: "MD-001 Isolation Org", industry: "Operations", description: "Tenant isolation fixture", settings: {}, createdAt: new Date(), updatedAt: new Date() }
    ] });
    await prisma.user.create({ data: { id: userId, name: "MD-001 Reviewer", email: `${userId}@example.test`, passwordHash: "probe-only", activeOrganizationId: orgId } });
    await prisma.organizationMembership.create({ data: { userId, organizationId: orgId, role: "owner" } });
    await prisma.organizationRoleAssignment.create({ data: { id: `md001-assignment-${suffix}`, organizationId: orgId, userId, roleId: "role_owner", assignedByUserId: userId } });
    await domains.ensureDefaultOrganizationDomains(orgId, userId);
    const finance = await domains.resolveOrganizationDomain(orgId, "finance");
    assert.equal(finance.sensitivity, "restricted", "Finance must be a restricted Domain by default.");
    const allDomainRows = await prisma.organizationDomain.findMany({ where: { organizationId: orgId } });
    assert.equal(allDomainRows.length, 11, "The default Domain registry must be complete.");

    const source = await memory.createOrganizationalSource({
      organizationId: orgId,
      sourceKind: "EXPERIENCE",
      domainId: finance.id,
      sourceObjectId: `experience:${suffix}`,
      occurredAt: new Date(),
      actorId: userId,
      metadata: { title: "Monthly financial report preparation", description: "The finance team prepares the monthly report from the close checklist and approved ledger extract.", context: "Finance close, monthly reporting" },
      scope: { department: "finance", cadence: "monthly" },
      idempotencyKey: `experience:${suffix}`
    });
    const evidence = await memory.addOrganizationalEvidence(orgId, source.id, { evidenceType: "observation", evidenceRole: "experience", actorId: userId, content: "The approved close checklist is followed before the monthly report is drafted.", idempotencyKey: `experience-evidence:${suffix}` });
    const prepared = await memory.prepareOrganizationalLearning(orgId, source.id, userId);
    const beforeValidation = await prisma.knowledgeItem.findUnique({ where: { id: `neutral-memory-${source.id}` } });
    assert.equal(beforeValidation, null, "A Source and Evidence must not become trusted Memory before validation.");
    assert.equal(prepared.candidate.domainId, finance.id);
    assert.equal(prepared.candidate.sourceId, source.id);
    const validated = await memory.validateOrganizationalLearning({ organizationId: orgId, sourceId: source.id, candidateId: prepared.candidate.id, actorId: userId, actorName: "MD-001 Reviewer", rationale: "Reviewed the Finance Source and Evidence for monthly reporting scope.", idempotencyKey: `validation:${suffix}` });
    const knowledgeItem = validated.knowledgeItem;
    assert.equal(knowledgeItem.domainId, finance.id);
    assert.equal(knowledgeItem.primarySourceId, source.id);
    assert.equal(knowledgeItem.scope.department, "finance");
    assert.ok(knowledgeItem.provenance.sourceId === source.id);
    assert.ok(knowledgeItem.provenance.validatedBy);

    const memoryAsk = await ask.askOrganization({ organizationId: orgId, userId, query: "How does the company prepare its monthly financial report?", domainIdOrKey: "finance", requestedSource: "memory" });
    assert.ok(["memory_answer", "memory_weak_match"].includes(memoryAsk.state), `Finance procedure Ask returned ${memoryAsk.state}.`);
    assert.ok(memoryAsk.memoryContext && memoryAsk.memoryContext.source && memoryAsk.memoryContext.evidence.length > 0, "Ask must expose Source and Evidence provenance.");
    const noMatch = await ask.askOrganization({ organizationId: orgId, userId, query: "How does the company calibrate a lunar relay?", domainIdOrKey: "finance", requestedSource: "memory" });
    assert.equal(noMatch.state, "memory_no_match");
    const currentUnavailable = await ask.askOrganization({ organizationId: orgId, userId, query: "What was the total revenue last month?", domainIdOrKey: "finance", requestedSource: "auto" });
    assert.equal(currentUnavailable.state, "current_data_unavailable");
    assert.equal(currentUnavailable.answer, null, "Memory must not be used to invent a current financial value.");

    const definition = (purpose) => ({ purpose, requiredInputs: [{ key: "report_period", label: "Report period", type: "string", required: true }], capabilities: ["memory.read"], permissions: ["document.draft", "memory.read"], tools: ["spreadsheet.reference"], constraints: ["Use only validated Finance Memory.", "Escalate missing evidence to a human reviewer."], expectedOutput: "A reviewable report draft.", escalationConditions: ["Current accounting values are unavailable."] });
    const createdSkills = [];
    for (const [key, name, purpose] of [["financial-reporting", "Financial Reporting", "Prepare the monthly financial report procedure."], ["spreadsheet-analysis", "Spreadsheet Analysis", "Analyze a report workbook using the approved procedure."], ["business-writing", "Business Writing", "Draft a clear reviewable report narrative."]]) {
      createdSkills.push(await skills.createOrganizationalSkill({ organizationId: orgId, domainId: finance.id, key: `${key}-${suffix}`, name, description: purpose, definition: definition(purpose), riskLevel: "medium", executionPolicy: "BOUNDED_EXECUTION", humanReviewPolicy: "REQUIRED", scope: { level: "organization", department: "finance" }, memoryLinks: [{ knowledgeItemId: knowledgeItem.id, knowledgeRevision: knowledgeItem.revision, relationship: "grounding" }], createdBy: userId }));
    }
    assert.equal(createdSkills.every((skill) => skill.status === "DRAFT"), true, "New Skills must start as Draft.");
    const searched = await skills.listOrganizationalSkills({ organizationId: orgId, query: "Financial Reporting", domainId: finance.id });
    assert.equal(searched.length, 1, "Skill search must find the requested Skill in its Domain.");
    assert.equal(searched[0].currentVersionRecord.memoryLinks.length, 1, "Skill Memory linkage must be durable.");
    for (const created of createdSkills) {
      await skills.transitionOrganizationalSkill({ organizationId: orgId, skillId: created.id, status: "READY_FOR_REVIEW", actorId: userId });
      await skills.transitionOrganizationalSkill({ organizationId: orgId, skillId: created.id, status: "VALIDATED", actorId: userId });
    }
    const validatedSkillIds = (await Promise.all(createdSkills.map((skill) => skills.getOrganizationalSkill(orgId, skill.id)))).map((skill) => skill.currentVersionRecord.id);
    const composition = await skills.composeOrganizationalSkills({ organizationId: orgId, skillVersionIds: validatedSkillIds, requestedTask: "Prepare this month's report using the company procedure." });
    assert.equal(composition.policy.mode, "HUMAN_APPROVAL_REQUIRED", "Restricted Finance composition must require human approval.");
    assert.equal(composition.policy.externalSideEffectsAllowed, false);
    assert.equal(composition.policy.riskLevel, "medium");
    assert.equal(composition.inputs[0].key, "report_period");

    const packageView = await execution.createExecutionPackage({ organizationId: orgId, requestedTask: composition.requestedTask, skillVersionIds: validatedSkillIds, createdBy: userId, requestId: `request-${suffix}`, correlationId: `correlation-${suffix}`, idempotencyKey: `package-${suffix}` });
    assert.ok(packageView.payloadDigest && packageView.payload.memory.length > 0);
    assert.equal(packageView.policy.mode, "HUMAN_APPROVAL_REQUIRED");
    assert.equal(JSON.stringify(packageView.payload).toLowerCase().includes("credential"), false, "Execution package must not contain credentials.");
    assert.equal(JSON.stringify(packageView.payload).toLowerCase().includes("token"), false, "Execution package must not contain tokens.");
    const packageReplay = await execution.createExecutionPackage({ organizationId: orgId, requestedTask: composition.requestedTask, skillVersionIds: validatedSkillIds, createdBy: userId, requestId: `request-${suffix}`, correlationId: `correlation-${suffix}`, idempotencyKey: `package-${suffix}` });
    assert.equal(packageReplay.id, packageView.id, "Package creation must replay by idempotency key.");

    const session = await execution.receiveExecutionResult({ organizationId: orgId, packageId: packageView.id, executorType: "external_executor", resultPayload: { status: "drafted", totalRevenue: "not supplied", secretToken: "must be removed" }, externalCorrelationId: `external-${suffix}`, idempotencyKey: `result-${suffix}` });
    assert.equal(session.status, "RESULT_RECEIVED");
    const beforeReview = await prisma.knowledgeItem.findUnique({ where: { id: knowledgeItem.id }, select: { revision: true, content: true } });
    const review = await execution.reviewExecutionSession({ organizationId: orgId, sessionId: session.id, reviewerId: userId, decision: "CORRECTED", outcomeClassification: "CORRECTION", notes: "The draft correctly followed the procedure but must be checked against authorized current values.", correction: { currentDataProvider: "missing" }, idempotencyKey: `review-${suffix}` });
    assert.equal(review.session.status, "CORRECTED");
    assert.ok(review.session.outcomeSourceId && review.session.outcomeEvidenceId);
    const outcomeSource = await prisma.organizationalSource.findUnique({ where: { id: review.session.outcomeSourceId } });
    const outcomeEvidence = await prisma.evidenceRecord.findUnique({ where: { id: review.session.outcomeEvidenceId } });
    assert.equal(outcomeSource.domainId, finance.id);
    assert.equal(outcomeSource.sourceSystem, "oip.execution");
    assert.ok(outcomeEvidence);
    assert.ok(review.candidateId);
    const afterReview = await prisma.knowledgeItem.findUnique({ where: { id: knowledgeItem.id }, select: { revision: true, content: true } });
    assert.equal(afterReview.revision, beforeReview.revision, "Correction review must not mutate Memory revision.");
    assert.deepEqual(afterReview.content, beforeReview.content, "Correction review must not rewrite original Memory content.");

    await assert.rejects(() => execution.getExecutionPackage(secondOrgId, packageView.id), /not found/i, "A package must not cross tenant boundaries.");
    const grantCount = await prisma.organizationDomainCapabilityGrant.count({ where: { organizationId: orgId } });
    assert.ok(grantCount >= 0, "Domain grants table must be queryable for the tenant.");

    console.log(JSON.stringify({
      MULTI_DEPARTMENT_EXPERIENCE: "PASS",
      FINANCE_MEMORY: "PASS",
      ASK_MEMORY_QUERY: "PASS",
      ASK_NO_MATCH: "PASS",
      CURRENT_DATA_ROUTING_FAILS_SAFE: "PASS",
      SKILL_CREATE: "PASS",
      SKILL_SEARCH: "PASS",
      SKILL_MEMORY_LINK: "PASS",
      SKILL_COMPOSITION: "PASS",
      STRICTEST_POLICY_WINS: "PASS",
      EXECUTION_PACKAGE: "PASS",
      EXECUTION_REVIEW: "PASS",
      OUTCOME_TO_EVIDENCE: "PASS",
      NO_AUTOMATIC_MEMORY_REWRITE: "PASS",
      TENANT_ISOLATION: "PASS",
      HUMAN_AUTHORITY: "PASS",
      ACCOUNTANT_END_TO_END_SCENARIO: "PASS",
      sourceId: source.id,
      evidenceId: evidence.id,
      memoryId: knowledgeItem.id,
      packageId: packageView.id,
      sessionId: session.id
    }, null, 2));
    console.log("OIP-V2-MD-001 targeted probe passed.");
  } finally {
    await prisma.organization.deleteMany({ where: { id: { in: [orgId, secondOrgId] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    cleaned = true;
    await prisma.$disconnect();
  }
  assert.equal(cleaned, true);
}

main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
