/*
 * FIX-015 permanent regression: source identity is a negative control.
 *
 * A source ticket may contain a customer's real name, but reusable Reflection
 * content must not copy that identity. Generic wording remains valid, while
 * an identity copied into reusable content fails closed before persistence.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });
const safety = require(path.join(root, "lib", "reflectionSafety.ts"));
const reflectionDraft = require(path.join(root, "lib", "reflectionDraft.ts"));
const learning = require(path.join(root, "lib", "application", "learning", "reflectionCommands.ts"));

const organizationId = "oip-fix-015-org";
const ticketId = "NC-20260911-0007";
const customerName = "Rishi Sunak";
const organizationName = "Nusa Cloud";
const sourceText = [
  "Hi My name is Rishi Sunak",
  "Several employees can open NusaCloud, but the payroll dashboard keeps showing Unable to load payroll data.",
  "The issue started after the HR administrator updated payroll access permissions this morning.",
  "Other NusaCloud modules are working normally. After Payroll Viewer access was restored and employees signed back in, the dashboard worked again.",
  "Thanks, Rishi Sunak.",
  "Warm regards"
].join("\n\n");

const profile = {
  id: organizationId,
  name: organizationName,
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
  customerName,
  subject: "Payroll dashboard inaccessible after permission update",
  description: sourceText,
  category: "Uncategorized",
  status: "resolved",
  createdAt: "2026-09-11T00:00:00.000Z"
};

const understanding = {
  ticketId,
  summary: "A payroll permission update removed the affected employees' Payroll Viewer access.",
  coreProblem: "Payroll dashboard inaccessible after permission update",
  category: "Uncategorized",
  intent: "support",
  urgency: "medium",
  tags: ["payroll dashboard", "permission update"],
  detectedSignals: ["payroll dashboard error"],
  extractedFields: {
    senderName: customerName,
    senderRole: null,
    companyName: null,
    deadline: null,
    subIssues: [],
    urgencyIndicators: []
  }
};

const reflection = {
  isLearningEvent: true,
  action: "create_new",
  rationale: "No existing category matched this ticket.",
  problemNameRequired: true,
  trustImpact: "increase",
  estimatedTrustDelta: 0
};

const generalizedLesson = {
  mode: "new",
  rootCause: "A payroll permission update removed the affected employees' Payroll Viewer access, preventing the payroll dashboard from loading data.",
  solution: "Restore the correct Payroll Viewer permissions for the affected employees, then have them sign out and sign back in before retrying the payroll dashboard.",
  customerResponse: "The customer confirmed that restoring Payroll Viewer access and signing back in resolved the issue for all affected employees.",
  signals: [
    "payroll dashboard error",
    "multiple employees affected",
    "other modules working normally",
    "issue began immediately after payroll access permissions were changed"
  ]
};

function buildContext(reusableProblemName = generalizedLesson.rootCause) {
  return safety.buildReflectionSafetyContext({
    customerName,
    organizationName,
    sourceTicketId: ticketId,
    sourceTicketText: sourceText,
    extractedCustomerName: customerName,
    extractedCompanyName: null,
    reusableProblemName
  });
}

function command(overrides = {}) {
  return {
    organizationId,
    actor: { id: "fix-015-reviewer", name: "FIX-015 reviewer" },
    authority: "server",
    requestId: "fix-015-request",
    idempotencyKey: "fix-015-generalized-promotion",
    organizationProfile: profile,
    ticket,
    understanding,
    reviewedResponse: generalizedLesson.customerResponse,
    suggestedResponse: null,
    reflection,
    problemName: "Payroll dashboard inaccessible after permission update",
    lessonDraft: generalizedLesson,
    knowledgeItems: [],
    validationRecords: [],
    ...overrides
  };
}

function fakePersistence() {
  const state = { commitCount: 0 };
  return {
    state,
    persistence: {
      context: {
        organizationId,
        authority: "server",
        requestId: "fix-015-persistence",
        actorContext: { id: "fix-015-reviewer", name: "FIX-015 reviewer" }
      },
      async commitValidatedMemoryChange(input) {
        state.commitCount += 1;
        return {
          replayed: false,
          knowledgeRevision: input.knowledgeItem.revision,
          trustApplied: true,
          candidate: input.candidate,
          validation: input.validation,
          memoryChange: input.memoryChange,
          knowledgeItem: input.knowledgeItem,
          auditSummary: {
            organizationId,
            actorId: "fix-015-reviewer",
            actor: "FIX-015 reviewer",
            sourceTicketIds: input.candidate.sourceTicketIds,
            decision: input.validation.decision,
            changeType: input.memoryChange.changeType
          }
        };
      }
    }
  };
}

function atomicPersistence({ existingKnowledgeItems = [], failNextCommit = false } = {}) {
  const state = {
    candidates: [],
    validations: [],
    memoryChanges: [],
    knowledgeItems: existingKnowledgeItems.map((item) => ({ ...item })),
    commitAttempts: 0,
    memoryMutations: 0,
    failNextCommit,
    lastInput: null
  };
  return {
    state,
    persistence: {
      context: {
        organizationId,
        authority: "server",
        requestId: "fix-015-atomic-persistence",
        actorContext: { id: "fix-015-reviewer", name: "FIX-015 reviewer" }
      },
      async commitValidatedMemoryChange(input) {
        state.commitAttempts += 1;
        state.lastInput = input;
        if (state.failNextCommit) {
          state.failNextCommit = false;
          throw new Error("simulated atomic transaction rollback");
        }

        const current = state.knowledgeItems.find((item) => item.id === input.knowledgeItem.id);
        if (input.expectedKnowledgeRevision === null && current) {
          throw new Error(`Knowledge item ${input.knowledgeItem.id} already exists; reload organizational memory before committing.`);
        }
        if (input.expectedKnowledgeRevision !== null && (!current || current.revision !== input.expectedKnowledgeRevision)) {
          throw new Error("knowledge revision changed");
        }

        // Commit the full auditable bundle only after every precondition passes.
        // This models the server transaction contract without touching the live DB.
        state.candidates.push(input.candidate);
        state.validations.push(input.validation);
        state.memoryChanges.push(input.memoryChange);
        const index = state.knowledgeItems.findIndex((item) => item.id === input.knowledgeItem.id);
        if (index === -1) state.knowledgeItems.push(input.knowledgeItem);
        else state.knowledgeItems[index] = input.knowledgeItem;
        state.memoryMutations += 1;
        return {
          replayed: false,
          knowledgeRevision: input.knowledgeItem.revision,
          trustApplied: true,
          candidate: input.candidate,
          validation: input.validation,
          memoryChange: input.memoryChange,
          knowledgeItem: input.knowledgeItem,
          auditSummary: {
            organizationId,
            actorId: "fix-015-reviewer",
            actor: "FIX-015 reviewer",
            sourceTicketIds: input.candidate.sourceTicketIds,
            decision: input.validation.decision,
            changeType: input.memoryChange.changeType
          }
        };
      }
    }
  };
}

const existingCanonicalMemory = {
  id: "durable-payroll-memory",
  organizationId,
  title: "Payroll dashboard inaccessible after permission update",
  problem: "A payroll permission update removed affected employees Payroll Viewer access.",
  approvedAnswer: generalizedLesson.customerResponse,
  category: "Uncategorized",
  tags: ["payroll", "dashboard"],
  sourceTicketId: "NC-20260911-0007",
  canonicalProblemId: "canonical-payroll-dashboard-inaccessible-after-permission-update",
  canonicalProblemTitle: "Payroll dashboard inaccessible after permission update",
  problemSummary: "A payroll permission update removed affected employees Payroll Viewer access.",
  customerResponseTemplate: generalizedLesson.customerResponse,
  internalGuidance: generalizedLesson.solution,
  revision: 3,
  lifecycleState: "active",
  governanceState: "trusted",
  timesSeen: 3,
  timesReused: 0,
  humanReviewCount: 1,
  createdAt: "2026-09-10T21:34:10.917Z",
  lastUpdated: "2026-09-10T21:53:22.659Z",
  lessons: []
};

async function expectValidationRejection(run) {
  await assert.rejects(run, (error) => {
    assert.equal(error.name, "LearningApplicationError");
    assert.equal(error.failure.errorClass, "validation_rejected");
    return true;
  });
}

async function main() {
  const context = buildContext();
  assert.ok(context.sourceSpecificValues.includes(customerName), "the source customer identity is retained as a negative control");
  assert.equal(context.sourceSpecificValues.includes("customer"), false, "generic customer wording is not treated as an identity");
  assert.equal(context.sourceSpecificValues.includes("Payroll Viewer"), false, "capitalized reusable product vocabulary is not treated as identity");

  const generalized = safety.assessReflectionSafety(generalizedLesson, context);
  assert.deepEqual(generalized, { safe: true, issues: [] }, "source identity in the ticket does not reject generalized reusable content");

  const copiedIdentity = safety.assessReflectionSafety({
    ...generalizedLesson,
    customerResponse: "Rishi Sunak confirmed that restoring Payroll Viewer access resolved the issue."
  }, context);
  assert.equal(copiedIdentity.safe, false, "copying the source identity into reusable content remains rejected");
  assert.ok(copiedIdentity.issues.includes("customer name"), "the rejection names the extracted customer identity");
  assert.ok(copiedIdentity.issues.includes("customer-specific source identity"), "the rejection names the source-specific identity control");

  const genericCustomerDraft = {
    ...generalizedLesson,
    customerResponse: "The customer confirmed that restoring Payroll Viewer access resolved the issue."
  };
  const genericCustomer = safety.assessReflectionSafety(genericCustomerDraft, context);
  assert.deepEqual(genericCustomer, { safe: true, issues: [] }, "generic customer wording remains valid");

  const partialAuthoredLesson = { ...generalizedLesson, customerResponse: "Dana Kline confirmed that the issue was resolved.", signals: [] };
  assert.equal(reflectionDraft.hasReflectionLessonContent(partialAuthoredLesson), true, "any authored lesson field is treated as intentional content");
  assert.equal(reflectionDraft.isCompleteReflectionLesson(partialAuthoredLesson), false, "a partial lesson is not eligible for the generic promotion fallback");

  const copiedTicket = safety.assessReflectionSafety({
    ...generalizedLesson,
    customerResponse: sourceText
  }, context);
  assert.equal(copiedTicket.safe, false, "copying the whole source ticket remains rejected");
  assert.ok(copiedTicket.issues.includes("copied ticket text"), "the copied-ticket guard remains active");

  const fake = fakePersistence();
  const promoted = await learning.promoteKnowledgeCommand(command(), fake);
  assert.equal(promoted.replayed, false, "the accepted generalized lesson creates the original promotion");
  assert.equal(fake.state.commitCount, 1, "the accepted generalized lesson commits once");

  const replay = await learning.promoteKnowledgeCommand(command(), fake);
  assert.equal(replay.replayed, true, "the same promotion identity replays idempotently");
  assert.equal(fake.state.commitCount, 1, "an idempotent replay does not duplicate the promotion");

  await expectValidationRejection(() => learning.promoteKnowledgeCommand(command({
    idempotencyKey: "fix-015-copied-identity",
    lessonDraft: {
      ...generalizedLesson,
      customerResponse: "Rishi Sunak confirmed that restoring Payroll Viewer access resolved the issue."
    }
  }), fake));
  assert.equal(fake.state.commitCount, 1, "the rejected identity copy does not reach persistence");

  const genericPromotion = await learning.promoteKnowledgeCommand(command({
    idempotencyKey: "fix-015-generic-customer",
    lessonDraft: genericCustomerDraft
  }), fake);
  assert.equal(genericPromotion.replayed, false, "generic wording remains promotable");
  assert.equal(fake.state.commitCount, 2, "each accepted promotion commits exactly once");

  const collision = atomicPersistence({ existingKnowledgeItems: [existingCanonicalMemory] });
  const collisionResult = await learning.promoteKnowledgeCommand(command({
    ticket: { ...ticket, id: "ticket-NC-20260911-0010", ticketId: "NC-20260911-0010" },
    understanding: { ...understanding, ticketId: "NC-20260911-0010" },
    idempotencyKey: "fix-015-canonical-collision",
    knowledgeItems: [existingCanonicalMemory]
  }), collision);
  assert.equal(collisionResult.action, "merge_existing", "a unique canonical create collision reconciles to supporting evidence");
  assert.equal(collision.state.lastInput.candidate.proposedAction, "merge_existing", "the candidate records the reconciled action");
  assert.equal(collision.state.lastInput.knowledgeItem.id, existingCanonicalMemory.id, "the durable Memory row identity is retained");
  assert.equal(collision.state.lastInput.expectedKnowledgeRevision, existingCanonicalMemory.revision, "the reconciled promotion uses optimistic concurrency");
  assert.equal(collision.state.lastInput.validation.decision, "approved", "human validation remains the authority boundary");
  assert.equal(collision.state.lastInput.validation.actor, "FIX-015 reviewer", "the validator is attributed in the commit bundle");
  assert.deepEqual(collision.state.lastInput.candidate.sourceTicketIds, ["NC-20260911-0010"], "the source ticket remains provenance");
  assert.equal(collision.state.candidates.length, 1, "one candidate is committed atomically");
  assert.equal(collision.state.validations.length, 1, "one validation record is committed atomically");
  assert.equal(collision.state.memoryChanges.length, 1, "one MemoryChange record is committed atomically");
  assert.equal(collision.state.memoryMutations, 1, "the canonical collision produces exactly one Memory mutation");

  const retryableFailure = atomicPersistence({ failNextCommit: true });
  const retryCommand = command({
    ticket: { ...ticket, id: "ticket-NC-20260911-0010-retry", ticketId: "NC-20260911-0010-retry" },
    understanding: { ...understanding, ticketId: "NC-20260911-0010-retry" },
    idempotencyKey: "fix-015-failed-promotion-retry",
    knowledgeItems: []
  });
  await assert.rejects(
    () => learning.promoteKnowledgeCommand(retryCommand, retryableFailure),
    (error) => {
      assert.equal(error.name, "LearningApplicationError");
      assert.equal(error.failure.errorClass, "rollback");
      assert.equal(error.failure.retryable, false);
      return true;
    },
    "a failed promotion remains retryable and reports no success"
  );
  assert.equal(retryableFailure.state.candidates.length, 0, "a failed attempt leaves no candidate mutation");
  assert.equal(retryableFailure.state.validations.length, 0, "a failed attempt leaves no validation mutation");
  assert.equal(retryableFailure.state.memoryChanges.length, 0, "a failed attempt leaves no MemoryChange mutation");
  assert.equal(retryableFailure.state.memoryMutations, 0, "a failed attempt leaves Memory unchanged");
  const retryResult = await learning.promoteKnowledgeCommand(retryCommand, retryableFailure);
  assert.equal(retryResult.replayed, false, "the retry performs the first successful commit");
  assert.equal(retryableFailure.state.memoryMutations, 1, "the retry commits exactly one Memory mutation");
  const retryReplay = await learning.promoteKnowledgeCommand(retryCommand, retryableFailure);
  assert.equal(retryReplay.replayed, true, "the successful retry replays idempotently");
  assert.equal(retryableFailure.state.memoryMutations, 1, "the replay does not duplicate the Memory mutation");

  console.log(JSON.stringify({
    sourceIdentityNegativeControl: true,
    generalizedCustomerWordingAccepted: true,
    copiedCustomerIdentityRejected: true,
    copiedTicketTextRejected: true,
    genericCustomerWordingAccepted: true,
    rejectedPromotionDidNotPersist: true,
    idempotentReplayDidNotDuplicate: true,
    acceptedPromotionCount: fake.state.commitCount,
    canonicalCollisionReconciled: true,
    atomicAuditBundleConsistent: true,
    failedPromotionRolledBack: true,
    retryExactlyOnce: true
  }, null, 2));
  console.log("OIP-V2-FIX-015 Reflection source-identity false-rejection regression probe passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
