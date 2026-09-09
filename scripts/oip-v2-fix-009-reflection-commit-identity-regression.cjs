/*
 * FIX-009 permanent regression probe.
 *
 * Retrieval normalisation may expose a canonicalProblemId as the selected
 * match identity while server persistence retains the database row id. The
 * commit command must reconcile that bounded alias before promoting an
 * existing-Memory Reflection. Missing, ambiguous, and cross-tenant targets
 * remain fail-closed; create_new and idempotency semantics remain unchanged.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });
const learning = require(path.join(root, "lib", "application", "learning", "reflectionCommands.ts"));

const organizationId = "oip-fix-009-org-a";
const foreignOrganizationId = "oip-fix-009-org-b";
const durableKnowledgeId = "knowledge-row-fix-009";
const canonicalProblemId = "canonical-fix-009";
const ticketId = "FIX009-REG-0001";
const profile = {
  id: organizationId,
  name: "FIX-009 Probe Workspace",
  industry: "Operations",
  description: "Disposable regression workspace.",
  products: [],
  services: [],
  supportedDomains: [],
  businessVocabulary: [],
  supportedIssueTypes: [],
  outOfScopeTopics: [],
  customerTone: "professional",
  supportBoundaries: [],
  autoResolutionThreshold: 80,
  escalationRules: [],
  language: "en"
};

const ticket = {
  id: ticketId,
  ticketId,
  customerName: "QA Customer",
  subject: "Existing operational memory confirmation",
  description: "A known operational issue recurred and the established recovery resolved it.",
  category: "General",
  status: "drafted",
  createdAt: "2026-09-09T00:00:00.000Z"
};

const understanding = {
  ticketId,
  summary: "A known operational issue recurred and the established recovery resolved it.",
  coreProblem: "A recurring operational issue",
  category: "General",
  intent: "support",
  urgency: "medium",
  tags: ["operational"],
  detectedSignals: ["recurring"],
  extractedFields: {
    senderName: null,
    senderRole: null,
    companyName: null,
    deadline: null,
    subIssues: [],
    urgencyIndicators: []
  }
};

const rawKnowledge = {
  id: durableKnowledgeId,
  organizationId,
  revision: 4,
  title: "Existing operational memory",
  problem: "A recurring operational issue",
  approvedAnswer: "Use the established recovery.",
  category: "General",
  tags: ["operational"],
  sourceTicketId: "FIX009-REG-SOURCE",
  timesReused: 0,
  createdAt: "2026-09-01T00:00:00.000Z",
  approvedAt: "2026-09-01T00:00:00.000Z",
  canonicalProblemId,
  canonicalProblemTitle: "Existing operational memory",
  problemSummary: "A recurring operational issue",
  lessons: [],
  knowledgeVersions: [{ versionId: `${canonicalProblemId}-v1`, version: 1, createdAt: "2026-09-01T00:00:00.000Z", changeReason: "Initial", sourceTicketId: "FIX009-REG-SOURCE" }]
};

const existingReflection = {
  isLearningEvent: false,
  action: "trust_update_only",
  rationale: "Confirmed the established recovery remains correct.",
  existingItemId: canonicalProblemId,
  existingItemTitle: rawKnowledge.title,
  existingItemSimilarity: 92,
  trustImpact: "increase",
  estimatedTrustDelta: 5
};

function command(overrides = {}) {
  return {
    organizationId,
    actor: { id: "fix-009-reviewer", name: "FIX-009 reviewer" },
    authority: "server",
    requestId: "fix-009-regression-request",
    idempotencyKey: "fix-009-regression-promotion",
    organizationProfile: profile,
    ticket,
    understanding,
    reviewedResponse: "Use the established recovery.",
    reflection: existingReflection,
    knowledgeItems: [rawKnowledge],
    validationRecords: [],
    ...overrides
  };
}

function fakePersistence() {
  const state = { commitCount: 0, input: null };
  return {
    state,
    persistence: {
      context: { organizationId, authority: "server", requestId: "fix-009-regression", actorContext: { id: "fix-009-reviewer", name: "FIX-009 reviewer" } },
      async commitValidatedMemoryChange(input) {
        state.commitCount += 1;
        state.input = input;
        return {
          replayed: false,
          knowledgeRevision: input.knowledgeItem.revision,
          trustApplied: true,
          candidate: input.candidate,
          validation: input.validation,
          memoryChange: input.memoryChange,
          knowledgeItem: input.knowledgeItem,
          auditSummary: { organizationId, actorId: "fix-009-reviewer", actor: "FIX-009 reviewer", sourceTicketIds: input.candidate.sourceTicketIds, decision: input.validation.decision, changeType: input.memoryChange.changeType }
        };
      }
    }
  };
}

async function expectLearningError(run, expectedClass) {
  await assert.rejects(run, (error) => {
    assert.equal(error.name, "LearningApplicationError");
    assert.equal(error.failure.errorClass, expectedClass);
    return true;
  });
}

async function main() {
  const first = fakePersistence();
  const promoted = await learning.promoteKnowledgeCommand(command(), first);
  assert.equal(promoted.action, "trust_update_only", "Reflection action must remain unchanged");
  assert.equal(first.state.commitCount, 1, "one valid promotion must commit once");
  assert.equal(first.state.input.expectedKnowledgeRevision, 4, "durable revision must be used after alias reconciliation");
  assert.equal(first.state.input.memoryChange.beforeState.id, durableKnowledgeId, "beforeState must use the durable row identity");
  assert.equal(promoted.validation.knowledgeId, durableKnowledgeId, "validation must target the durable row identity");
  assert.equal(promoted.knowledgeItem.id, durableKnowledgeId, "committed Memory must retain the durable row identity");
  const replay = await learning.promoteKnowledgeCommand(command(), first);
  assert.equal(replay.replayed, true, "same idempotency key must replay the original promotion");
  assert.equal(first.state.commitCount, 1, "replay must not create a duplicate promotion");

  const missing = fakePersistence();
  await expectLearningError(
    () => learning.promoteKnowledgeCommand(command({ idempotencyKey: "fix-009-missing", knowledgeItems: [] }), missing),
    "promotion_conflict"
  );
  assert.equal(missing.state.commitCount, 0, "missing target must fail before persistence");

  const foreign = fakePersistence();
  await expectLearningError(
    () => learning.promoteKnowledgeCommand(command({ idempotencyKey: "fix-009-foreign", knowledgeItems: [{ ...rawKnowledge, organizationId: foreignOrganizationId }] }), foreign),
    "promotion_conflict"
  );
  assert.equal(foreign.state.commitCount, 0, "cross-tenant target must fail before persistence");

  const ambiguous = fakePersistence();
  await expectLearningError(
    () => learning.promoteKnowledgeCommand(command({
      idempotencyKey: "fix-009-ambiguous",
      knowledgeItems: [rawKnowledge, { ...rawKnowledge, id: "knowledge-row-fix-009-duplicate" }]
    }), ambiguous),
    "promotion_conflict"
  );
  assert.equal(ambiguous.state.commitCount, 0, "ambiguous canonical target must fail before persistence");

  const createNew = fakePersistence();
  const createNewResult = await learning.promoteKnowledgeCommand(command({
    idempotencyKey: "fix-009-create-new",
    reflection: { ...existingReflection, action: "create_new", existingItemId: undefined, isLearningEvent: true, problemNameRequired: true },
    problemName: "New bounded operational problem",
    knowledgeItems: []
  }), createNew);
  assert.equal(createNewResult.action, "create_new", "create_new must remain independent of existing-item lookup");
  assert.equal(createNew.state.commitCount, 1);

  console.log(JSON.stringify({
    canonicalAliasReconciled: true,
    durableRevisionPreserved: true,
    actionSemanticsPreserved: true,
    durableIdentityCommitted: true,
    idempotentReplay: true,
    missingTargetFailClosed: true,
    crossTenantTargetFailClosed: true,
    ambiguousTargetFailClosed: true,
    createNewUnchanged: true
  }, null, 2));
  console.log("OIP-V2-FIX-009 Reflection commit identity regression probe passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
