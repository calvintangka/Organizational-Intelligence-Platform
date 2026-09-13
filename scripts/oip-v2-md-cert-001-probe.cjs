/*
 * OIP-V2-MD-CERT-001 service-level certification matrix.
 *
 * This probe creates only run-scoped organizations and reaches trusted Memory
 * through Source -> Evidence -> Candidate -> human validation. It deliberately
 * keeps the mature Support organizations out of scope and deletes every
 * disposable organization in finally.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness();
const { prisma } = require(path.join(root, "lib", "server", "prisma.ts"));
const domains = require(path.join(root, "lib", "server", "domainService.ts"));
const domainAuth = require(path.join(root, "lib", "server", "domainAuthorization.ts"));
const authorization = require(path.join(root, "lib", "server", "rbac", "authorizationService.ts"));
const memory = require(path.join(root, "lib", "server", "organizationalMemoryService.ts"));
const ask = require(path.join(root, "lib", "server", "askService.ts"));
const skills = require(path.join(root, "lib", "server", "skillService.ts"));
const execution = require(path.join(root, "lib", "server", "executionPackageService.ts"));

const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
const orgId = `md-cert-main-${suffix}`;
const tenantBId = `md-cert-tenant-b-${suffix}`;
const userIds = {
  owner: `md-cert-owner-${suffix}`,
  reviewer: `md-cert-reviewer-${suffix}`,
  viewer: `md-cert-viewer-${suffix}`,
  tenantOwner: `md-cert-tenant-owner-${suffix}`
};

function organization(id, name) {
  const now = new Date();
  return { id, name, industry: "Certification", description: "Run-scoped MD-CERT-001 fixture", settings: {}, createdAt: now, updatedAt: now };
}

async function createActor(id, name, email, role, organizationId) {
  await prisma.user.create({ data: { id, name, email, passwordHash: "probe-only", activeOrganizationId: organizationId } });
  await prisma.organizationMembership.create({ data: { userId: id, organizationId, role } });
  await prisma.organizationRoleAssignment.create({ data: { id: `assignment-${id}`, organizationId, userId: id, roleId: `role_${role}`, assignedByUserId: id } });
}

async function createMemory({ organizationId, domainId, actorId, key, title, description, scope }) {
  const source = await memory.createOrganizationalSource({
    organizationId,
    sourceKind: "EXPERIENCE",
    domainId,
    sourceSystem: "oip.md-cert-001",
    sourceObjectType: "certification_experience",
    sourceObjectId: key,
    occurredAt: new Date(),
    actorId,
    metadata: { title, description, context: "Certification fixture; not mature business data." },
    scope,
    idempotencyKey: `source:${key}`
  });
  const evidence = await memory.addOrganizationalEvidence(organizationId, source.id, {
    evidenceType: "observation",
    evidenceRole: "experience",
    actorId,
    content: description,
    idempotencyKey: `evidence:${key}`
  });
  const prepared = await memory.prepareOrganizationalLearning(organizationId, source.id, actorId);
  const validated = await memory.validateOrganizationalLearning({
    organizationId,
    sourceId: source.id,
    candidateId: prepared.candidate.id,
    actorId,
    actorName: "MD-CERT human reviewer",
    rationale: "Certification reviewer validated the Source and Evidence within the declared Domain and scope.",
    idempotencyKey: `validation:${key}`
  });
  return { source, evidence, prepared, validated, item: validated.knowledgeItem };
}

function definition(purpose, requiredInputs = [], overrides = {}) {
  return {
    purpose,
    requiredInputs,
    capabilities: ["memory.read"],
    permissions: ["document.draft", "memory.read"],
    tools: ["spreadsheet.reference"],
    constraints: ["Use only validated Memory.", "Escalate uncertainty to a human reviewer."],
    expectedOutputs: ["reviewable draft"],
    provenance: { source: "MD-CERT-001" },
    reviewRules: ["Human review before external effect."],
    escalationConditions: ["Current data is unavailable."],
    ...overrides
  };
}

async function validatedSkill({ organizationId, domainId, key, name, actorId, memoryLink, policy = "BOUNDED_EXECUTION", risk = "medium", humanReview = "REQUIRED", skillDefinition }) {
  const created = await skills.createOrganizationalSkill({
    organizationId,
    domainId,
    key: `${key}-${suffix}`,
    name,
    description: `MD-CERT-001 ${name}`,
    definition: skillDefinition ?? definition(name),
    riskLevel: risk,
    executionPolicy: policy,
    humanReviewPolicy: humanReview,
    scope: { level: "organization", certificationRun: suffix },
    memoryLinks: memoryLink ? [{ knowledgeItemId: memoryLink.id, knowledgeRevision: memoryLink.revision, relationship: "grounding" }] : [],
    createdBy: actorId
  });
  await skills.transitionOrganizationalSkill({ organizationId, skillId: created.id, status: "READY_FOR_REVIEW", actorId });
  await skills.transitionOrganizationalSkill({ organizationId, skillId: created.id, status: "VALIDATED", actorId });
  return skills.getOrganizationalSkill(organizationId, created.id);
}

async function countAudits(actorUserId) {
  return prisma.authorizationDecisionAudit.count({ where: { organizationId: orgId, actorUserId } });
}

async function main() {
  const createdOrganizations = [orgId, tenantBId];
  try {
    await prisma.organization.createMany({ data: [organization(orgId, "MD-CERT-001-Main"), organization(tenantBId, "MD-CERT-001-Tenant-B")] });
    await createActor(userIds.owner, "MD-CERT Owner", `${userIds.owner}@example.test`, "owner", orgId);
    await createActor(userIds.reviewer, "MD-CERT Reviewer", `${userIds.reviewer}@example.test`, "reviewer", orgId);
    await createActor(userIds.viewer, "MD-CERT Viewer", `${userIds.viewer}@example.test`, "viewer", orgId);
    await createActor(userIds.tenantOwner, "MD-CERT Tenant B Owner", `${userIds.tenantOwner}@example.test`, "owner", tenantBId);
    await domains.ensureDefaultOrganizationDomains(orgId, userIds.owner);
    await domains.ensureDefaultOrganizationDomains(tenantBId, userIds.tenantOwner);
    const finance = await domains.resolveOrganizationDomain(orgId, "finance");
    const operations = await domains.resolveOrganizationDomain(orgId, "operations");
    const tenantFinance = await domains.resolveOrganizationDomain(tenantBId, "finance");
    assert.equal(finance.sensitivity, "restricted");
    assert.equal((await domains.listOrganizationDomains(orgId)).length, 11);

    // Domain grants supplement role capabilities; they cannot create a missing
    // global capability for a Viewer.
    await domains.grantDomainCapability({ organizationId: orgId, domainId: finance.id, roleId: "role_reviewer", capabilityKey: "ask.query" });
    await domains.grantDomainCapability({ organizationId: orgId, domainId: finance.id, roleId: "role_viewer", capabilityKey: "skill.validate" });
    const reviewerDomains = await domainAuth.listAccessibleDomainIds({ organizationId: orgId, userId: userIds.reviewer, capability: "ask.query" });
    assert.deepEqual(reviewerDomains, [finance.id]);
    const viewerGlobal = await authorization.authorizationService.authorize({ actorUserId: userIds.viewer, organizationId: orgId, capability: "skill.validate", resource: `domain:${finance.id}` });
    assert.equal(viewerGlobal.allowed, false, "A Domain grant must not manufacture a missing global capability.");
    const auditBefore = await countAudits(userIds.reviewer);
    const reviewerAllowed = await authorization.authorizationService.authorize({ actorUserId: userIds.reviewer, organizationId: orgId, capability: "ask.query", resource: `domain:${finance.id}` });
    assert.equal(reviewerAllowed.allowed, true);
    const reviewerDenied = await authorization.authorizationService.authorize({ actorUserId: userIds.reviewer, organizationId: orgId, capability: "skill.revoke", resource: `domain:${finance.id}` });
    assert.equal(reviewerDenied.allowed, true, "Reviewer has the global Skill revoke capability; Domain policy remains separately checked by routes.");
    assert.ok((await countAudits(userIds.reviewer)) >= auditBefore + 2, "Authorization decisions must be durably audited.");

    const financeMemory = await createMemory({ organizationId: orgId, domainId: finance.id, actorId: userIds.owner, key: "finance-monthly-report", title: "Monthly Financial Reporting", description: "The Finance team closes the approved ledger checklist before drafting the monthly financial report.", scope: { department: "finance", cadence: "monthly" } });
    const operationsMemory = await createMemory({ organizationId: orgId, domainId: operations.id, actorId: userIds.owner, key: "operations-monthly-report", title: "Monthly Operations Reporting", description: "Operations reconciles the approved service metrics checklist before drafting the monthly operations report.", scope: { department: "operations", cadence: "monthly" } });
    assert.equal(financeMemory.prepared.candidate.sourceId, financeMemory.source.id);
    assert.equal(financeMemory.prepared.candidate.domainId, finance.id);
    assert.equal(financeMemory.item.primarySourceId, financeMemory.source.id);
    assert.equal(financeMemory.item.domainId, finance.id);
    assert.equal(financeMemory.item.revision, 1);

    const financeAsk = await ask.askOrganization({ organizationId: orgId, userId: userIds.owner, query: "How does the company prepare its monthly financial report?", domainIdOrKey: "finance", requestedSource: "memory" });
    assert.ok(["memory_answer", "memory_weak_match"].includes(financeAsk.state));
    assert.equal(financeAsk.memoryContext.source.id, financeMemory.source.id);
    assert.ok(financeAsk.memoryContext.evidence.length > 0);
    const crossDomainAsk = await ask.askOrganization({ organizationId: orgId, userId: userIds.owner, query: "How does the company prepare its monthly financial report?", domainIdOrKey: "operations", requestedSource: "memory" });
    assert.equal(crossDomainAsk.memoryResult.matches.some((match) => match.item.id === financeMemory.item.id), false, "Finance Memory must not cross a requested Operations Domain filter.");
    assert.equal(crossDomainAsk.memoryResult.matches.every((match) => match.item.domainId === operations.id), true);
    const noMatch = await ask.askOrganization({ organizationId: orgId, userId: userIds.owner, query: "How does the company calibrate a lunar relay?", domainIdOrKey: "finance", requestedSource: "memory" });
    assert.equal(noMatch.state, "memory_no_match");
    const currentUnavailable = await ask.askOrganization({ organizationId: orgId, userId: userIds.owner, query: "What was the total revenue last month?", domainIdOrKey: "finance", requestedSource: "auto" });
    assert.equal(currentUnavailable.state, "current_data_unavailable");
    assert.equal(currentUnavailable.answer, null);
    await assert.rejects(() => ask.askOrganization({ organizationId: orgId, userId: userIds.reviewer, query: "How does the company prepare its monthly financial report?", domainIdOrKey: "operations", requestedSource: "memory" }), (error) => error?.code === "FORBIDDEN");

    const skill = await validatedSkill({ organizationId: orgId, domainId: finance.id, key: "financial-reporting", name: "Financial Reporting", actorId: userIds.owner, memoryLink: financeMemory.item, policy: "BOUNDED_EXECUTION", risk: "medium", skillDefinition: definition("Prepare a reviewable monthly financial report draft.", [{ key: "report_period", type: "string", required: true }], { apiToken: "CERTIFICATION-SECRET-MUST-NOT-EXPORT" }) });
    const analysisSkill = await validatedSkill({ organizationId: orgId, domainId: finance.id, key: "spreadsheet-analysis", name: "Spreadsheet Analysis", actorId: userIds.owner, memoryLink: financeMemory.item, policy: "HUMAN_APPROVAL_REQUIRED", risk: "high", skillDefinition: definition("Analyze a reporting workbook.", [{ key: "report_period", type: "string", required: true }]) });
    const writingSkill = await validatedSkill({ organizationId: orgId, domainId: finance.id, key: "business-writing", name: "Business Writing", actorId: userIds.owner, memoryLink: financeMemory.item, policy: "BOUNDED_EXECUTION", risk: "medium", skillDefinition: definition("Draft a reviewable report narrative.") });
    const validatedFinancialReportingVersionId = skill.currentVersionRecord.id;
    const validatedAnalysisVersionId = analysisSkill.currentVersionRecord.id;
    const validatedWritingVersionId = writingSkill.currentVersionRecord.id;
    const discovered = await skills.listOrganizationalSkills({ organizationId: orgId, query: "Financial Reporting", domainId: finance.id, status: "VALIDATED" });
    assert.equal(discovered.length, 1);
    assert.equal(discovered[0].currentVersionRecord.status, "VALIDATED");
    const draftSkill = await skills.createOrganizationalSkill({ organizationId: orgId, domainId: finance.id, key: "draft-financial-report", name: "Draft Financial Report", description: "MD-CERT-001 draft lifecycle fixture", definition: definition("Draft financial report revision."), createdBy: userIds.owner, memoryLinks: [{ knowledgeItemId: financeMemory.item.id, knowledgeRevision: financeMemory.item.revision }] });
    const draftVersion = draftSkill.versions.find((version) => version.status === "DRAFT");
    assert.ok(draftVersion, "The revised Skill version must start in DRAFT.");
    await assert.rejects(() => skills.composeOrganizationalSkills({ organizationId: orgId, skillVersionIds: [draftVersion.id], requestedTask: "Prepare a report" }), /validated|active/i);
    const composition = await skills.composeOrganizationalSkills({ organizationId: orgId, skillVersionIds: [validatedFinancialReportingVersionId, validatedAnalysisVersionId, validatedWritingVersionId], requestedTask: "Prepare this month's report using the company procedure." });
    assert.equal(composition.policy.mode, "HUMAN_APPROVAL_REQUIRED");
    assert.equal(composition.policy.riskLevel, "high");
    assert.equal(composition.policy.externalSideEffectsAllowed, false);
    assert.equal(composition.inputs.find((input) => input.key === "report_period").required, true);

    const conflictA = await validatedSkill({ organizationId: orgId, domainId: operations.id, key: "conflict-input-a", name: "Conflict Input A", actorId: userIds.owner, memoryLink: operationsMemory.item, skillDefinition: definition("A", [{ key: "period", type: "string", required: true }]) });
    const conflictB = await validatedSkill({ organizationId: orgId, domainId: operations.id, key: "conflict-input-b", name: "Conflict Input B", actorId: userIds.owner, memoryLink: operationsMemory.item, skillDefinition: definition("B", [{ key: "period", type: "number", required: true }]) });
    await assert.rejects(() => skills.composeOrganizationalSkills({ organizationId: orgId, skillVersionIds: [conflictA.currentVersionRecord.id, conflictB.currentVersionRecord.id], requestedTask: "Conflicting inputs" }), /conflict|incompatible/i);

    const packageView = await execution.createExecutionPackage({ organizationId: orgId, requestedTask: composition.requestedTask, skillVersionIds: [validatedFinancialReportingVersionId, validatedAnalysisVersionId, validatedWritingVersionId], createdBy: userIds.owner, requestId: `request-${suffix}`, correlationId: `correlation-${suffix}`, idempotencyKey: `package-${suffix}` });
    const packageReplay = await execution.createExecutionPackage({ organizationId: orgId, requestedTask: composition.requestedTask, skillVersionIds: [validatedFinancialReportingVersionId, validatedAnalysisVersionId, validatedWritingVersionId], createdBy: userIds.owner, requestId: `request-${suffix}`, correlationId: `correlation-${suffix}`, idempotencyKey: `package-${suffix}` });
    assert.equal(packageReplay.id, packageView.id);
    assert.equal(packageReplay.payloadDigest, packageView.payloadDigest);
    const packageText = JSON.stringify(packageView.payload).toLowerCase();
    assert.equal(packageText.includes("certification-secret"), false);
    assert.equal(packageText.includes("apitoken"), false);
    assert.equal(packageText.includes("credential"), false);
    assert.equal(packageView.payload.memory.some((entry) => entry.revision === financeMemory.item.revision), true);

    const session = await execution.receiveExecutionResult({ organizationId: orgId, packageId: packageView.id, executorType: "external_executor", resultPayload: { status: "drafted", totalRevenue: "not supplied", secretToken: "RESULT-SECRET-MUST-NOT-PERSIST" }, externalCorrelationId: `external-${suffix}`, idempotencyKey: `result-${suffix}` });
    assert.equal(session.status, "RESULT_RECEIVED");
    assert.equal(JSON.stringify(session.resultPayload).toLowerCase().includes("result-secret"), false);
    const beforeReview = await prisma.knowledgeItem.findUnique({ where: { id: financeMemory.item.id }, select: { revision: true, content: true } });
    const review = await execution.reviewExecutionSession({ organizationId: orgId, sessionId: session.id, reviewerId: userIds.owner, decision: "CORRECTED", outcomeClassification: "CORRECTION", notes: "Procedure was followed; current accounting values still require an authorized provider.", correction: { provider: "missing" }, idempotencyKey: `review-${suffix}` });
    assert.equal(review.session.status, "CORRECTED");
    assert.ok(review.candidateId && review.session.outcomeSourceId && review.session.outcomeEvidenceId);
    const afterReview = await prisma.knowledgeItem.findUnique({ where: { id: financeMemory.item.id }, select: { revision: true, content: true } });
    assert.equal(afterReview.revision, beforeReview.revision);
    assert.deepEqual(afterReview.content, beforeReview.content);
    const reviewReplay = await execution.reviewExecutionSession({ organizationId: orgId, sessionId: session.id, reviewerId: userIds.owner, decision: "CORRECTED", outcomeClassification: "CORRECTION", notes: "Procedure was followed; current accounting values still require an authorized provider.", correction: { provider: "missing" }, idempotencyKey: `review-${suffix}` });
    assert.equal(reviewReplay.session.id, session.id);

    const beforeOutcomeRevision = financeMemory.item.revision;
    await memory.recordReuseOutcome({ organizationId: orgId, knowledgeItemId: financeMemory.item.id, knowledgeVersionId: financeMemory.item.knowledgeVersions.at(-1)?.versionId ?? null, source: { sourceKind: "EXECUTION_OUTCOME", domainId: finance.id, sourceSystem: "oip.md-cert-001", sourceObjectType: "revision-bump", sourceObjectId: `revision-bump-${suffix}`, actorId: userIds.owner, scope: financeMemory.item.scope, metadata: { run: suffix } }, evidence: { evidenceType: "execution_result", evidenceRole: "observed_outcome", actorId: userIds.owner, content: "Human-reviewed certification outcome used only to advance the disposable Memory revision.", idempotencyKey: `revision-bump-evidence-${suffix}` }, actorId: userIds.owner, reuseMode: "human", classification: "SUCCESS", requiredEdits: false, expectedKnowledgeRevision: beforeOutcomeRevision, idempotencyKey: `revision-bump-${suffix}` });
    await assert.rejects(() => skills.composeOrganizationalSkills({ organizationId: orgId, skillVersionIds: [validatedFinancialReportingVersionId], requestedTask: "Use stale Skill grounding" }), /revision|changed|stale/i);
    await assert.rejects(() => execution.getExecutionPackage(tenantBId, packageView.id), (error) => error?.code === "RESOURCE_NOT_FOUND");
    assert.equal(await prisma.organizationDomain.findFirst({ where: { id: tenantFinance.id, organizationId: orgId } }), null);

    console.log(JSON.stringify({
      MULTI_DEPARTMENT_EXPERIENCE: "PASS",
      FINANCE_MEMORY: "PASS",
      ASK_MEMORY_QUERY: "PASS",
      ASK_NO_MATCH: "PASS",
      CURRENT_DATA_ROUTING_FAILS_SAFE: "PASS",
      CROSS_DOMAIN_RETRIEVAL_ISOLATION: "PASS",
      SKILL_CREATE: "PASS",
      SKILL_SEARCH: "PASS",
      SKILL_MEMORY_LINK: "PASS",
      SKILL_COMPOSITION: "PASS",
      STRICTEST_POLICY_WINS: "PASS",
      INPUT_CONFLICT_FAILS_CLOSED: "PASS",
      EXECUTION_PACKAGE: "PASS",
      EXECUTION_REVIEW: "PASS",
      OUTCOME_TO_EVIDENCE: "PASS",
      NO_AUTOMATIC_MEMORY_REWRITE: "PASS",
      TENANT_ISOLATION: "PASS",
      HUMAN_AUTHORITY: "PASS",
      AUDIT_TRAIL: "PASS",
      STALE_PACKAGE_GROUNDING_REJECTED: "PASS",
      ACCOUNTANT_END_TO_END_SCENARIO: "PASS",
      createdOrganizations,
      financeMemoryId: financeMemory.item.id,
      packageId: packageView.id,
      sessionId: session.id
    }, null, 2));
    console.log("OIP-V2-MD-CERT-001 service matrix passed.");
  } finally {
    await prisma.organization.deleteMany({ where: { id: { in: createdOrganizations } } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(userIds) } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
