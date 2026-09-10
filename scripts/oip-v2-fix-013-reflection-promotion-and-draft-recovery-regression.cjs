/* FIX-013 permanent regression: Reflection promotion identity and prepared draft recovery. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { Client } = require("pg");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: true });
const safety = require(path.join(root, "lib", "reflectionSafety.ts"));
const learning = require(path.join(root, "lib", "application", "learning", "reflectionCommands.ts"));
const workflow = require(path.join(root, "lib", "server", "tickets", "ticketWorkflow.ts"));
assert(process.env.DATABASE_URL, "DATABASE_URL is required");

const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
const orgA = `fix-013-org-a-${suffix}`;
const orgB = `fix-013-org-b-${suffix}`;
const actorId = `fix-013-actor-${suffix}`;
const ticketA = `FIX013-REG-${suffix}`;
const ticketB = `FIX013-FOREIGN-${suffix}`;
const evidenceA = `${ticketA}-evidence`;

const profile = { id: orgA, name: "FIX-013 Probe Workspace", industry: "Operations", description: "Disposable regression workspace.", products: [], services: [], supportedDomains: [], businessVocabulary: [], supportedIssueTypes: [], outOfScopeTopics: [], customerTone: "professional", supportBoundaries: [], autoResolutionThreshold: 80, escalationRules: [], language: "en" };
const ticket = { id: ticketA, ticketId: ticketA, customerName: "Customer", subject: "Queue assignment recovery", description: "An approved queue was missing after a crew change and returned after refreshing assignment mapping.", category: "General", status: "drafted", createdAt: "2026-09-10T00:00:00.000Z" };
const understanding = { ticketId: ticketA, summary: ticket.description, coreProblem: "Queue assignment mapping", category: "General", intent: "support", urgency: "medium", tags: ["operational"], detectedSignals: ["queue"], extractedFields: { senderName: null, senderRole: null, companyName: null, deadline: null, subIssues: [], urgencyIndicators: [] } };
const rawKnowledge = { id: "fix-013-knowledge-row", organizationId: orgA, revision: 2, title: "Queue assignment recovery", problem: "Queue assignment mapping", approvedAnswer: "Refresh the approved assignment mapping.", category: "General", tags: ["queue"], sourceTicketId: "FIX013-SOURCE", timesReused: 0, createdAt: "2026-09-01T00:00:00.000Z", approvedAt: "2026-09-01T00:00:00.000Z", canonicalProblemId: "fix-013-canonical", canonicalProblemTitle: "Queue assignment recovery", problemSummary: "Queue assignment mapping", lessons: [], knowledgeVersions: [{ versionId: "fix-013-v1", version: 1, createdAt: "2026-09-01T00:00:00.000Z", changeReason: "Initial", sourceTicketId: "FIX013-SOURCE" }] };
const reflection = { isLearningEvent: false, action: "trust_update_only", rationale: "The established operational recovery remains correct.", existingItemId: rawKnowledge.canonicalProblemId, existingItemTitle: rawKnowledge.title, existingItemSimilarity: 92, trustImpact: "increase", estimatedTrustDelta: 5 };
const lesson = { mode: "new", rootCause: "The approved queue mapping was stale after a crew change.", solution: "Refresh the approved assignment mapping before changing credentials.", customerResponse: "Confirm the assignment and refresh the approved mapping.", signals: ["queue missing after crew change"] };

function command(overrides = {}) { return { organizationId: orgA, actor: { id: actorId, name: "FIX-013 reviewer" }, authority: "server", requestId: `fix-013-request-${suffix}`, idempotencyKey: `fix-013-promotion-${suffix}`, organizationProfile: profile, ticket, understanding, reviewedResponse: "Confirm the assignment and refresh the approved mapping.", reflection, lessonDraft: lesson, knowledgeItems: [rawKnowledge], validationRecords: [], ...overrides }; }
function fakePersistence() { const state = { commitCount: 0 }; return { state, persistence: { context: { organizationId: orgA, authority: "server", requestId: `fix-013-persistence-${suffix}`, actorContext: { id: actorId, name: "FIX-013 reviewer" } }, async commitValidatedMemoryChange(input) { state.commitCount += 1; return { replayed: false, knowledgeRevision: input.knowledgeItem.revision, trustApplied: true, candidate: input.candidate, validation: input.validation, memoryChange: input.memoryChange, knowledgeItem: input.knowledgeItem, auditSummary: { organizationId: orgA, actorId, actor: "FIX-013 reviewer", sourceTicketIds: input.candidate.sourceTicketIds, decision: input.validation.decision, changeType: input.memoryChange.changeType } }; } } }; }
async function expectLearningError(run, expected) { await assert.rejects(run, (error) => { assert.equal(error.name, "LearningApplicationError"); assert.equal(error.failure.errorClass, expected); return true; }); }
async function seed(db) {
  for (const id of [orgA, orgB]) await db.query('insert into organizations (id,name,industry,description,settings,"createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,current_timestamp,current_timestamp)', [id, id, "QA", "FIX-013 disposable", JSON.stringify({})]);
  await db.query('insert into ticket_records (id,"organizationId","ticketId","rawMessage",subject,status,"draftSource",classification,"memoryMatch",resolution,reflection,"validationRecordIds",labels,"createdAt") values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,current_timestamp)', [`${ticketA}-row`, orgA, ticketA, ticket.description, ticket.subject, "resolved", "deterministic", JSON.stringify({ category: "General", intent: "support", canonicalProblem: "Queue assignment mapping", classifiedBy: "deterministic", confidence: "high" }), JSON.stringify({ knowledgeId: null, matchType: "none", lessonId: null }), JSON.stringify({ finalResponse: "Verified.", humanEdited: true, resolvedAt: new Date().toISOString(), evidenceIds: [evidenceA] }), JSON.stringify({ decision: null, lessonCreatedId: null, lessonReinforcedId: null, knowledgeChanged: null, validationEligible: true, validationEligibilityReason: null, evidenceIds: [evidenceA], preparedDecision: { action: "create_new", rationale: "A bounded learning event is ready for review.", estimatedTrustDelta: 10, trustImpact: "increase", isLearningEvent: true, problemNameRequired: true, suggestedProblemName: "Queue assignment recovery" }, draftRevision: 0 }), JSON.stringify([]), JSON.stringify([])]);
  await db.query('insert into ticket_resolution_evidence (id,"organizationId","ticketId",type,"sourceMessageId","actorId",note,"createdAt","idempotencyKey") values ($1,$2,$3,$4,$5,$6,$7,current_timestamp,$8)', [evidenceA, orgA, ticketA, "agent_verification", null, actorId, "Verified queue restored.", `${evidenceA}-key`]);
  await db.query('insert into ticket_records (id,"organizationId","ticketId","rawMessage",subject,status,"draftSource",classification,"memoryMatch",resolution,reflection,"validationRecordIds",labels,"createdAt") values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,current_timestamp)', [`${ticketB}-row`, orgB, ticketB, "Foreign disposable ticket.", "Foreign ticket", "resolved", "deterministic", JSON.stringify({ category: "General", intent: "support", canonicalProblem: "Foreign", classifiedBy: "deterministic", confidence: "high" }), JSON.stringify({ knowledgeId: null, matchType: "none", lessonId: null }), JSON.stringify({ finalResponse: "Verified.", humanEdited: true, resolvedAt: new Date().toISOString(), evidenceIds: [] }), JSON.stringify({ decision: null, lessonCreatedId: null, lessonReinforcedId: null, knowledgeChanged: null, validationEligible: true, preparedDecision: null }), JSON.stringify([]), JSON.stringify([])]);
}
async function cleanup(db) { await db.query("delete from organizations where id in ($1,$2)", [orgA, orgB]); }
function input(command) { return { organizationId: orgA, actorId, ticketId: ticketA, command, requestId: `fix-013-workflow-${suffix}`, correlationId: `fix-013-correlation-${suffix}`, source: "probe" }; }
// Pre-repair projection contract: the old Resume path reconstructed the
// prepared decision but had no persisted authored lesson fields to hydrate.
// Keep this as a pure model assertion so the permanent probe records the
// deterministic defect without mutating product data.
function reconstructPreRepairReflection(record) {
  return { reflection: { preparedDecision: record.reflection?.preparedDecision ?? null } };
}
async function main() {
  const preRepairRecord = {
    reflection: {
      preparedDecision: { action: "create_new", validationEligible: true },
      preparedLessonDraft: lesson,
      preparedProblemName: "Queue assignment recovery"
    }
  };
  const preRepairResumed = reconstructPreRepairReflection(preRepairRecord);
  assert.ok(preRepairResumed.reflection.preparedDecision, "pre-repair Resume retained prepared decision");
  assert.equal(preRepairResumed.reflection.preparedLessonDraft, undefined, "pre-repair Resume lost authored lesson draft");

  const context = safety.buildReflectionSafetyContext({ customerName: "Avery Morgan", organizationName: profile.name, sourceTicketId: ticketA, sourceTicketText: `${ticket.subject} ${ticket.description}`, extractedCustomerName: null, extractedCompanyName: null, reusableProblemName: "Queue assignment recovery" });
  assert.equal(safety.assessReflectionSafety(lesson, context).safe, true, "generalized lesson remains safe");
  assert.equal(safety.assessReflectionSafety({ ...lesson, solution: "Ask Avery Morgan to refresh the mapping." }, context).safe, false, "customer identity remains rejected");
  const exact = fakePersistence();
  await learning.promoteKnowledgeCommand(command({ reflection: { ...reflection, existingItemId: rawKnowledge.id }, idempotencyKey: `fix-013-exact-${suffix}` }), exact);
  assert.equal(exact.state.commitCount, 1, "exact durable identity is accepted");
  const alias = fakePersistence();
  await learning.promoteKnowledgeCommand(command({ idempotencyKey: `fix-013-alias-${suffix}` }), alias);
  assert.equal(alias.state.commitCount, 1, "unique canonical alias is reconciled");
  const replay = await learning.promoteKnowledgeCommand(command({ idempotencyKey: `fix-013-alias-${suffix}` }), alias);
  assert.equal(replay.replayed, true, "valid promotion remains idempotent");
  await expectLearningError(() => learning.promoteKnowledgeCommand(command({ idempotencyKey: `fix-013-missing-${suffix}`, knowledgeItems: [] }), fakePersistence()), "promotion_conflict");
  await expectLearningError(() => learning.promoteKnowledgeCommand(command({ idempotencyKey: `fix-013-foreign-${suffix}`, knowledgeItems: [{ ...rawKnowledge, organizationId: orgB }] }), fakePersistence()), "promotion_conflict");
  await expectLearningError(() => learning.promoteKnowledgeCommand(command({ idempotencyKey: `fix-013-ambiguous-${suffix}`, knowledgeItems: [rawKnowledge, { ...rawKnowledge, id: "fix-013-ambiguous-row" }] }), fakePersistence()), "promotion_conflict");

  const db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
  try {
    await seed(db);
    const prepared = await workflow.applyTicketWorkflowCommand(input({ kind: "save_reflection_draft", lessonDraft: lesson, problemName: "Queue assignment recovery", expectedDraftRevision: 0 }));
    assert.equal(prepared.reflection.draftRevision, 1, "authored Reflection draft revision increments");
    assert.deepEqual(prepared.reflection.preparedLessonDraft, lesson, "authored Reflection draft persists");
    assert.equal(prepared.reflection.decision, null, "draft save does not validate or promote");
    await assert.rejects(() => workflow.applyTicketWorkflowCommand(input({ kind: "save_reflection_draft", lessonDraft: lesson, problemName: "Queue assignment recovery", expectedDraftRevision: 0 })), (error) => { assert.equal(error.code, "REVISION_CONFLICT"); return true; });
    await assert.rejects(() => workflow.applyTicketWorkflowCommand({ ...input({ kind: "save_reflection_draft", lessonDraft: lesson, problemName: "Queue assignment recovery", expectedDraftRevision: 1 }), organizationId: orgB, ticketId: ticketA }), (error) => { assert.equal(error.code, "TICKET_NOT_FOUND"); return true; });
  } finally { await cleanup(db); await db.end(); }
  console.log(JSON.stringify({ preRepairDraftLoss: "FAILS_AS_EXPECTED", generalizedLessonSafe: true, exactDurableIdentityAccepted: true, canonicalAliasAccepted: true, customerIdentityRejected: true, missingAmbiguousCrossTenantFailClosed: true, idempotencyPreserved: true, authoredDraftPersisted: true, staleDraftRejected: true, noAutoPromotion: true }, null, 2));
  console.log("OIP-V2-FIX-013 Reflection promotion and draft recovery regression probe passed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
