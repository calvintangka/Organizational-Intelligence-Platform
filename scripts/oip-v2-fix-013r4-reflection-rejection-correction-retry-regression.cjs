/* FIX-013R4 permanent regression: rejected Reflection draft correction and retry. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });
const safety = require(path.join(root, "lib", "reflectionSafety.ts"));
const draft = require(path.join(root, "lib", "reflectionDraft.ts"));
const lifecycleModule = require(path.join(root, "lib", "reflectionValidationLifecycle.ts"));
const learning = require(path.join(root, "lib", "application", "learning", "reflectionCommands.ts"));

const organizationId = "fix-013r4-org";
const ticketId = "FIX013R4-RETRY";
const customerName = "Copper Vale Freight";
const sourceText = `${customerName} reported that a monthly export showed a stale snapshot after the final record was committed.`;
const profile = {
  id: organizationId,
  name: "FIX-013R4 Probe Workspace",
  industry: "Operations",
  description: "Disposable regression workspace.",
  products: [], services: [], supportedDomains: [], businessVocabulary: [], supportedIssueTypes: [],
  outOfScopeTopics: [], customerTone: "professional", supportBoundaries: [], autoResolutionThreshold: 80,
  escalationRules: [], language: "en"
};
const ticket = {
  id: ticketId, ticketId, customerName, subject: "Export snapshot recovery", description: sourceText,
  category: "General", status: "drafted", createdAt: "2026-09-10T00:00:00.000Z"
};
const understanding = {
  ticketId, summary: sourceText, coreProblem: "Export snapshot recovery", category: "General", intent: "support",
  urgency: "medium", tags: ["export"], detectedSignals: ["snapshot"],
  extractedFields: { senderName: null, senderRole: null, companyName: null, deadline: null, subIssues: [], urgencyIndicators: [] }
};
const existingItem = {
  id: "fix-013r4-canonical", organizationId, revision: 1, title: "Export snapshot recovery",
  problem: "Export snapshot recovery", approvedAnswer: "Rebuild the export from the current revision.", category: "General",
  tags: ["export"], sourceTicketId: "FIX013R4-SOURCE", timesReused: 1,
  createdAt: "2026-09-01T00:00:00.000Z", approvedAt: "2026-09-01T00:00:00.000Z",
  canonicalProblemId: "fix-013r4-canonical", canonicalProblemTitle: "Export snapshot recovery",
  problemSummary: "Export snapshot recovery", lessons: [], knowledgeVersions: []
};
const reflection = {
  isLearningEvent: true, action: "create_version", existingItemId: existingItem.id,
  existingItemTitle: existingItem.title, existingItemSimilarity: 94,
  rationale: "The reviewed resolution improves the existing export recovery knowledge.",
  problemNameRequired: false,
  // This is a display suggestion from the ticket, not a reviewer-authored
  // reusable field. Before FIX-013R4 it leaked into the submitted draft.
  suggestedProblemName: `${customerName} export snapshot recovery`,
  trustImpact: "increase", estimatedTrustDelta: 3
};
const lesson = {
  mode: "new",
  rootCause: "The export process retained a stale snapshot after the final record was committed.",
  solution: "Compare the manifest export with the signed ledger and rebuild from the current template before release.",
  customerResponse: "The customer organization confirmed that the corrected export contained the completed inspection row.",
  signals: ["inspection-export"]
};

function context(reusableProblemName, fallbackCustomerName = customerName) {
  return safety.buildReflectionSafetyContext({
    customerName: fallbackCustomerName,
    organizationName: profile.name,
    sourceTicketId: ticketId,
    sourceTicketText: sourceText,
    extractedCustomerName: null,
    extractedCompanyName: null,
    reusableProblemName
  });
}

function command(overrides = {}) {
  return {
    organizationId,
    actor: { id: "fix-013r4-reviewer", name: "FIX-013R4 reviewer" },
    authority: "server",
    requestId: "fix-013r4-request",
    idempotencyKey: "fix-013r4-correction-retry",
    organizationProfile: profile,
    ticket,
    understanding,
    reviewedResponse: "Confirm the corrected export contains the completed inspection row.",
    suggestedResponse: null,
    reflection,
    lessonDraft: lesson,
    knowledgeItems: [existingItem],
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
        requestId: "fix-013r4-persistence",
        actorContext: { id: "fix-013r4-reviewer", name: "FIX-013R4 reviewer" }
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
            actorId: "fix-013r4-reviewer",
            actor: "FIX-013R4 reviewer",
            sourceTicketIds: input.candidate.sourceTicketIds,
            decision: input.validation.decision,
            changeType: input.memoryChange.changeType
          }
        };
      }
    }
  };
}

async function main() {
  const unsafeSuggestedName = draft.initialReflectionProblemName(reflection, undefined);
  assert.equal(unsafeSuggestedName, "", "non-required Reflection must not seed the hidden suggested title");
  assert.equal(
    draft.submittedReflectionProblemName(reflection, reflection.suggestedProblemName),
    undefined,
    "non-required Reflection must never submit a suggested title as reusable content"
  );

  const leaked = safety.assessReflectionSafety(lesson, context(reflection.suggestedProblemName));
  assert.equal(leaked.safe, false, "the pre-repair hidden ticket-specific title is rejected fail-closed");
  assert.ok(leaked.issues.includes("customer-specific source identity"), "the rejection identifies the leaked source identity");

  const correctedProblemName = draft.submittedReflectionProblemName(reflection, "");
  const corrected = safety.assessReflectionSafety(lesson, context(correctedProblemName));
  assert.equal(corrected.safe, true, "the corrected reusable lesson is safe without the hidden title");

  const resumedFallback = safety.buildReflectionSafetyContext({
    customerName: "Customer",
    organizationName: profile.name,
    sourceTicketId: ticketId,
    sourceTicketText: sourceText,
    extractedCustomerName: null,
    extractedCompanyName: null
  });
  assert.equal(resumedFallback.customerName, undefined, "Resume fallback label is not treated as a real identity");
  assert.equal(safety.assessReflectionSafety(lesson, resumedFallback).safe, true, "generic customer wording remains valid after Resume");

  const firstValidation = learning.validateReflectionCommand({
    organizationId, actor: command().actor, authority: "server", requestId: "fix-013r4-request",
    reflection, lessonDraft: lesson, safetyContext: context(reflection.suggestedProblemName)
  });
  assert.equal(firstValidation.accepted, false, "first validation rejects the leaked unsafe draft");

  const fake = fakePersistence();
  const lifecycle = lifecycleModule.createReflectionValidationLifecycle();
  const validationDispatches = [];

  async function dispatchValidation(lessonDraft, reusableProblemName) {
    const attempt = lifecycleModule.beginReflectionValidationAttempt(lifecycle, ticketId);
    assert.ok(attempt, "one human click starts one validation attempt");
    assert.equal(
      lifecycleModule.beginReflectionValidationAttempt(lifecycle, ticketId),
      null,
      "a duplicate activation while the attempt is in flight is ignored"
    );
    validationDispatches.push(attempt);

    const validation = learning.validateReflectionCommand({
      organizationId,
      actor: command().actor,
      authority: "server",
      requestId: attempt.requestId,
      reflection,
      lessonDraft,
      safetyContext: context(reusableProblemName)
    });
    if (!validation.accepted) {
      lifecycleModule.markReflectionValidationRejected(lifecycle);
      lifecycleModule.releaseReflectionValidationAttempt(lifecycle);
      return { validation, promoted: null };
    }

    const promoted = await learning.promoteKnowledgeCommand(command({
      requestId: attempt.requestId,
      idempotencyKey: attempt.idempotencyKey,
      problemName: reusableProblemName,
      lessonDraft: validation.normalizedLessonDraft
    }), fake);
    lifecycleModule.markReflectionValidationSucceeded(lifecycle);
    lifecycleModule.releaseReflectionValidationAttempt(lifecycle);
    return { validation, promoted };
  }

  const firstAttempt = await dispatchValidation(lesson, reflection.suggestedProblemName);
  assert.equal(firstAttempt.validation.accepted, false, "first validation rejects the unsafe draft");
  assert.equal(lifecycle.inFlight, false, "rejection releases the submitting state");
  assert.equal(lifecycle.context, null, "rejection clears the idempotency context");

  const retryAttempt = await dispatchValidation(lesson, "");
  assert.equal(retryAttempt.validation.accepted, true, "retry accepts the corrected draft");
  assert.ok(retryAttempt.promoted, "corrected retry reaches the governed promotion");
  assert.equal(validationDispatches.length, 2, "the rejected attempt and corrected retry each dispatch once");
  assert.notEqual(validationDispatches[0].requestId, validationDispatches[1].requestId, "retry creates a new request identity");
  assert.notEqual(validationDispatches[0].idempotencyKey, validationDispatches[1].idempotencyKey, "retry creates a new idempotency key");
  assert.equal(retryAttempt.promoted.replayed, false, "corrected retry creates the one governed promotion");
  assert.equal(fake.state.commitCount, 1, "rejected draft did not consume the retry promotion identity");
  assert.equal(retryAttempt.promoted.knowledgeItem.lessons.some((item) => item.rootCause.includes(customerName)), false, "promoted lesson contains no customer identity");

  console.log(JSON.stringify({
    hiddenSuggestedTitleSuppressed: true,
    firstValidationRejected: true,
    correctedRetryAccepted: true,
    validationDispatchCount: validationDispatches.length,
    retryRequestIdentityRotated: true,
    promotionCount: fake.state.commitCount,
    unsafeCustomerIdentityAbsentFromPromotedLesson: true
  }, null, 2));
  console.log("OIP-V2-FIX-013R4 Reflection rejection/correction/retry regression probe passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
