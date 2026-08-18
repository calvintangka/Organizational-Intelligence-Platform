/*
 * NC-FIX-012 permanent regression probe.
 *
 * RECONSTRUCTED_FROM_CONTRACT (2026-08-18, NC-FIX-012R2).
 *
 * The original script referenced by the stash's package.json
 * (`probe:nc-fix-012-reflection-provenance-boundary`) was never recovered from
 * the worktree, the stash, or git history. This probe was reconstructed from
 * the NC-FIX-012 changelog contract, the NC-FIX-011 probe conventions, and the
 * audited effective-reusable-payload boundary. It is deterministic and
 * isolated: it exercises the real TypeScript application commands with a
 * transactional fake persistence port and never touches the database or the
 * protected real-world cases (NC-20260812-0001, NC-20260818-0003).
 *
 * Contract under test:
 *   1. customer identity may remain in source/provenance context;
 *   2. customer identity in reusable content is rejected (problem name, root
 *      cause, solution, customer response, signals);
 *   3. generalized reusable content is accepted;
 *   4. create_new with no authored lesson validates the fallback effective
 *      payload (understanding.coreProblem / understanding.summary /
 *      reviewedResponse / understanding.tags) before any write;
 *   5. create_new with a blank authored response template validates the
 *      reviewedResponse fallback it would write;
 *   6. create_version with no authored lesson validates the reviewedResponse
 *      generic-template update;
 *   7. merge_existing / trust_update_only validate persisted understanding
 *      tags even when a lesson is authored;
 *   8. rejected promotion is atomic (zero commits, zero persisted reusable
 *      memory);
 *   9. corrected retry succeeds;
 *  10. duplicate promotion replays idempotently;
 *  11. tenant isolation is preserved.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness({ loadEnv: false });
const learning = require(path.join(root, "lib", "application", "learning", "reflectionCommands.ts"));
const safety = require(path.join(root, "lib", "reflectionSafety.ts"));
const canonical = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const profiles = require(path.join(root, "data", "seedOrganizationProfiles.ts"));

const organizationId = "nc-fix-012-org-a";
const foreignOrganizationId = "nc-fix-012-org-b";
const ticketId = "NS-20260812-0001";
const customerName = "Rina Prasetyo";
const employeeName = "Andi Wibowo";
const companyName = "PT Sinar Karya Abadi";
const sourceText = `Customer ${customerName} reports that affected employee ${employeeName} cannot complete mobile clock-in because location permission is disabled on the device for ${companyName}.`;
const profile = { ...profiles.defaultOrganizationProfile, id: organizationId, name: "NC-FIX-012 Support Workspace" };
const foreignProfile = { ...profile, id: foreignOrganizationId, name: "NC-FIX-012 Foreign Workspace" };
const ticket = {
  id: ticketId,
  ticketId,
  customerName: "Demo User",
  subject: "Mobile clock-in permission issue",
  description: sourceText,
  category: "Permissions & Access",
  status: "drafted",
  createdAt: "2026-08-12T00:00:00.000Z"
};
const understanding = {
  ticketId,
  summary: "A mobile clock-in cannot complete because device location permission is disabled.",
  coreProblem: "A required role or permission is missing or denied.",
  category: "Permissions & Access",
  urgency: "medium",
  tags: ["clock-in failure", "permission prompt"],
  detectedSignals: ["location permission"],
  extractedFields: {
    senderName: customerName,
    senderRole: null,
    companyName,
    deadline: null,
    subIssues: ["Mobile clock-in failure"],
    urgencyIndicators: []
  }
};
const identityFallbackUnderstanding = {
  ...understanding,
  coreProblem: `Employee ${employeeName} cannot complete mobile clock-in because location permission is disabled on the device.`
};
const identityTagUnderstanding = {
  ...understanding,
  tags: [employeeName.toLowerCase(), "clock-in"]
};
const reflection = {
  isLearningEvent: true,
  action: "create_new",
  rationale: "Customer-confirmed permission repair.",
  estimatedTrustDelta: 10,
  trustImpact: "increase",
  problemNameRequired: true,
  suggestedProblemName: "Mobile Clock-In - Location Permission Disabled"
};
const safeProblemName = "Mobile Clock-In - Location Permission Disabled";
const safeLesson = {
  mode: "new",
  rootCause: "The mobile app lacked location permission on the affected employee device.",
  solution: "Enable device location services and grant the mobile app location access, then retry mobile clock-in.",
  customerResponse: "Please enable location access for the mobile app, then retry clock-in. Reference {{ticketId}}.",
  signals: ["mobile clock-in failure", "location permission disabled"]
};
const identityReviewedResponse = `Hello ${customerName}, please check ${employeeName}'s device location permission.`;
const safeReviewedResponse = "Hello {{customerName}}, please check the device location permission for the mobile app, then retry clock-in.";

function fakePersistence(orgId = organizationId) {
  const state = { commitCount: 0, knowledgeItems: [], validationRecords: [], memoryChanges: [] };
  return {
    state,
    persistence: {
      context: { organizationId: orgId, authority: "server", requestId: "nc-fix-012-probe", actorContext: { id: "nc-fix-012-user", name: "NC-FIX-012 reviewer" } },
      async commitValidatedMemoryChange(input) {
        state.commitCount += 1;
        state.knowledgeItems.push(input.knowledgeItem);
        state.validationRecords.push(input.validation);
        state.memoryChanges.push(input.memoryChange);
        return {
          replayed: false,
          knowledgeRevision: 1,
          trustApplied: true,
          candidate: { ...input.candidate, status: "validated" },
          validation: input.validation,
          memoryChange: input.memoryChange,
          knowledgeItem: { ...input.knowledgeItem, revision: 1 },
          auditSummary: {
            organizationId,
            actorId: "nc-fix-012-user",
            actor: "NC-FIX-012 reviewer",
            sourceTicketIds: input.candidate.sourceTicketIds,
            decision: input.validation.decision,
            changeType: input.memoryChange.changeType
          }
        };
      }
    }
  };
}

function baseCommand(overrides = {}) {
  return {
    organizationId,
    actor: { id: "nc-fix-012-user", name: "NC-FIX-012 reviewer" },
    authority: "server",
    requestId: "nc-fix-012-request",
    idempotencyKey: "nc-fix-012-promotion",
    organizationProfile: profile,
    ticket,
    understanding,
    reviewedResponse: safeReviewedResponse,
    reflection,
    lessonDraft: safeLesson,
    problemName: safeProblemName,
    knowledgeItems: [],
    validationRecords: [],
    ...overrides
  };
}

function expectLearningError(run, expectedClass) {
  return run().then(
    () => { throw new Error(`Expected ${expectedClass} LearningApplicationError`); },
    (error) => {
      assert.equal(error.name, "LearningApplicationError");
      assert.equal(error.failure.errorClass, expectedClass);
      return error;
    }
  );
}

function safetyContext(overrides = {}) {
  return safety.buildReflectionSafetyContext({
    customerName: ticket.customerName,
    organizationName: profile.name,
    sourceTicketId: ticketId,
    sourceTicketText: `${ticket.subject} ${ticket.description}`,
    extractedCustomerName: understanding.extractedFields.senderName,
    extractedCompanyName: understanding.extractedFields.companyName,
    reusableProblemName: safeProblemName,
    ...overrides
  });
}

function baseKnowledgeItem() {
  return canonical.withCanonicalProblemDefaults({
    id: "canonical-nc-fix-012-clock-in",
    canonicalProblemId: "canonical-nc-fix-012-clock-in",
    title: safeProblemName,
    category: "Permissions & Access",
    problemSummary: "The mobile app lacked location permission on the affected employee device.",
    customerResponseTemplate: safeReviewedResponse,
    approvedAnswer: safeReviewedResponse,
    internalGuidance: "Ask for enough device context before resolving.",
    tags: ["mobile", "clock-in", "location"],
    sourceTicketId: ticketId,
    timesReused: 0,
    timesSeen: 1,
    createdAt: "2026-08-12T00:00:00.000Z",
    lifecycleState: "active",
    revision: 2
  });
}

async function main() {
  // 1. Provenance identity is allowed.
  const context = safetyContext();
  assert.equal(safety.assessReflectionSafety(safeLesson, context).safe, true, "generalized lesson with identity-bearing source/provenance must be safe");
  assert.ok(context.sourceSpecificValues.includes(employeeName), "source identity must remain available as provenance context");

  // 2. Identity in reusable content is rejected in every reusable field.
  const problemNameContext = { ...context, reusableProblemName: `${employeeName} clock-in` };
  assert.equal(safety.assessReflectionSafety(safeLesson, problemNameContext).safe, false, "employee name in reusable problem name must reject");
  assert.equal(safety.assessReflectionSafety({ ...safeLesson, rootCause: `${employeeName} cannot clock in because location permission is disabled.` }, context).safe, false, "employee name in root cause must reject");
  assert.equal(safety.assessReflectionSafety({ ...safeLesson, solution: `Ask ${employeeName} to enable location access.` }, context).safe, false, "employee name in solution must reject");
  assert.equal(safety.assessReflectionSafety({ ...safeLesson, customerResponse: `Hello ${employeeName}, please enable location access.` }, context).safe, false, "employee name in customer response must reject");
  assert.equal(safety.assessReflectionSafety({ ...safeLesson, signals: [employeeName.toLowerCase(), "clock-in"] }, context).safe, false, "employee name in signals must reject");

  // 3. Generalized reusable content is accepted and persisted.
  const accepted = fakePersistence();
  const result = await learning.promoteKnowledgeCommand(baseCommand(), accepted);
  assert.equal(accepted.state.commitCount, 1);
  assert.equal(result.replayed, false);
  assert.equal(result.validation.decision, "approved");
  assert.equal(result.knowledgeItem.lessons.length, 1);
  assert.equal(result.knowledgeItem.lessons[0].sourceTicketId.startsWith("evidence-"), true, "lesson provenance must be opaque");
  assert.deepEqual(result.candidate.sourceTicketIds, [ticketId], "candidate must keep canonical source provenance");
  const persistedLessonText = [
    result.knowledgeItem.lessons[0].rootCause,
    result.knowledgeItem.lessons[0].solution,
    result.knowledgeItem.lessons[0].customerResponse,
    ...result.knowledgeItem.lessons[0].signals
  ].join(" ");
  assert.equal(/andi wibowo|rina prasetyo|ns-20260812-0001/i.test(persistedLessonText), false, "persisted reusable lesson must not contain source identity");

  // 4. create_new with NO authored lesson must validate the fallback payload.
  const fallbackRejected = fakePersistence();
  const fallbackError = await expectLearningError(
    () => learning.promoteKnowledgeCommand(baseCommand({
      idempotencyKey: "nc-fix-012-fallback-identity",
      lessonDraft: undefined,
      understanding: identityFallbackUnderstanding,
      reviewedResponse: identityReviewedResponse
    }), fallbackRejected),
    "validation_rejected"
  );
  assert.ok(fallbackError.failure.safeMessage.includes("customer-specific source identity"), "no-authored-lesson identity fallback must be rejected with the identity label");
  assert.equal(fallbackRejected.state.commitCount, 0, "no-authored-lesson identity fallback must not commit");
  assert.equal(fallbackRejected.state.knowledgeItems.length, 0, "no-authored-lesson identity fallback must not create a KnowledgeItem");
  assert.equal(fallbackRejected.state.validationRecords.length, 0, "no-authored-lesson identity fallback must not create a validation record");
  assert.equal(fallbackRejected.state.memoryChanges.length, 0, "no-authored-lesson identity fallback must not create a memory change");

  // 5. create_new with a BLANK authored response template must validate the
  //    reviewedResponse fallback that would be persisted.
  const blankTemplateRejected = fakePersistence();
  await expectLearningError(
    () => learning.promoteKnowledgeCommand(baseCommand({
      idempotencyKey: "nc-fix-012-blank-template",
      lessonDraft: { ...safeLesson, customerResponse: "" },
      reviewedResponse: identityReviewedResponse
    }), blankTemplateRejected),
    "validation_rejected"
  );
  assert.equal(blankTemplateRejected.state.commitCount, 0, "blank authored template with identity-bearing reviewedResponse must not commit");

  // 6. create_version with no authored lesson must validate the generic
  //    template update.
  const versionBase = baseKnowledgeItem();
  const versionRejected = fakePersistence();
  await expectLearningError(
    () => learning.promoteKnowledgeCommand(baseCommand({
      idempotencyKey: "nc-fix-012-version-identity",
      lessonDraft: undefined,
      reviewedResponse: identityReviewedResponse,
      reflection: { ...reflection, action: "create_version", existingItemId: versionBase.id, existingItemTitle: versionBase.title },
      knowledgeItems: [versionBase]
    }), versionRejected),
    "validation_rejected"
  );
  assert.equal(versionRejected.state.commitCount, 0, "create_version identity template must not commit");
  const versionAccepted = fakePersistence();
  const versionResult = await learning.promoteKnowledgeCommand(baseCommand({
    idempotencyKey: "nc-fix-012-version-safe",
    lessonDraft: undefined,
    reviewedResponse: safeReviewedResponse,
    reflection: { ...reflection, action: "create_version", existingItemId: versionBase.id, existingItemTitle: versionBase.title },
    knowledgeItems: [versionBase]
  }), versionAccepted);
  assert.equal(versionResult.knowledgeItem.customerResponseTemplate, safeReviewedResponse, "sanitized create_version template must be persisted");

  // 7. merge_existing / trust_update_only must validate persisted
  //    understanding tags even when a lesson is authored / no lesson exists.
  const mergeTagRejected = fakePersistence();
  await expectLearningError(
    () => learning.promoteKnowledgeCommand(baseCommand({
      idempotencyKey: "nc-fix-012-merge-identity-tag",
      understanding: identityTagUnderstanding,
      lessonDraft: safeLesson,
      reflection: { ...reflection, action: "merge_existing", existingItemId: versionBase.id, existingItemTitle: versionBase.title },
      knowledgeItems: [versionBase]
    }), mergeTagRejected),
    "validation_rejected"
  );
  assert.equal(mergeTagRejected.state.commitCount, 0, "identity-bearing understanding tag with authored merge lesson must not commit");
  const trustTagRejected = fakePersistence();
  await expectLearningError(
    () => learning.promoteKnowledgeCommand(baseCommand({
      idempotencyKey: "nc-fix-012-trust-identity-tag",
      understanding: identityTagUnderstanding,
      lessonDraft: undefined,
      reflection: { ...reflection, action: "trust_update_only", existingItemId: versionBase.id, existingItemTitle: versionBase.title },
      knowledgeItems: [versionBase]
    }), trustTagRejected),
    "validation_rejected"
  );
  assert.equal(trustTagRejected.state.commitCount, 0, "identity-bearing understanding tag on trust_update_only must not commit");
  const trustTagAccepted = fakePersistence();
  const trustResult = await learning.promoteKnowledgeCommand(baseCommand({
    idempotencyKey: "nc-fix-012-trust-safe-tag",
    lessonDraft: undefined,
    reflection: { ...reflection, action: "trust_update_only", existingItemId: versionBase.id, existingItemTitle: versionBase.title },
    knowledgeItems: [versionBase]
  }), trustTagAccepted);
  assert.equal(trustResult.replayed, false, "sanitized trust_update_only must succeed");

  // 8. Validation/write equivalence for the no-authored-lesson fallback.
  const equivalence = fakePersistence();
  const fallbackAccepted = await learning.promoteKnowledgeCommand(baseCommand({
    idempotencyKey: "nc-fix-012-fallback-safe",
    lessonDraft: undefined,
    reviewedResponse: safeReviewedResponse
  }), equivalence);
  assert.equal(fallbackAccepted.knowledgeItem.customerResponseTemplate, safeReviewedResponse, "validated fallback template must equal the persisted template");
  assert.equal(fallbackAccepted.knowledgeItem.problemSummary, understanding.coreProblem, "validated fallback root cause must equal the persisted problem summary");
  assert.deepEqual(fallbackAccepted.knowledgeItem.tags, understanding.tags, "validated fallback signals must equal the persisted canonical tags");

  // 9. Corrected retry after an atomic rejection.
  const retry = fakePersistence();
  await expectLearningError(
    () => learning.promoteKnowledgeCommand(baseCommand({
      idempotencyKey: "nc-fix-012-corrected-retry",
      lessonDraft: { ...safeLesson, rootCause: `${employeeName} cannot clock in because location permission is disabled.` }
    }), retry),
    "validation_rejected"
  );
  const corrected = await learning.promoteKnowledgeCommand(baseCommand({
    idempotencyKey: "nc-fix-012-corrected-retry",
    lessonDraft: safeLesson
  }), retry);
  assert.equal(corrected.replayed, false, "corrected retry must succeed after rejection");
  assert.equal(retry.state.commitCount, 1, "only the corrected retry may commit");

  // 10. Idempotency.
  const idempotent = fakePersistence();
  await learning.promoteKnowledgeCommand(baseCommand({ idempotencyKey: "nc-fix-012-idempotent" }), idempotent);
  const replay = await learning.promoteKnowledgeCommand(baseCommand({ idempotencyKey: "nc-fix-012-idempotent" }), idempotent);
  assert.equal(replay.replayed, true, "duplicate successful promotion must replay idempotently");
  assert.equal(idempotent.state.commitCount, 1, "duplicate promotion must not commit twice");

  // 11. Tenant isolation.
  await expectLearningError(
    () => learning.promoteKnowledgeCommand(baseCommand({ organizationProfile: foreignProfile }), fakePersistence()),
    "tenant_mismatch"
  );
  const foreignSource = "Customer Dewi Lestari reports that employee Surya Pratama cannot receive password reset emails.";
  const foreignContext = safetyContext({
    organizationName: foreignProfile.name,
    sourceTicketId: "NS-20260812-0002",
    sourceTicketText: foreignSource,
    extractedCustomerName: "Dewi Lestari",
    extractedCompanyName: null
  });
  assert.equal(foreignContext.sourceSpecificValues.includes(employeeName), false, "tenant A source identity must not enter tenant B validation context");
  assert.equal(safety.assessReflectionSafety(safeLesson, foreignContext).safe, true, "tenant A identity must not cause a false rejection in tenant B");

  console.log(JSON.stringify({
    provenanceIdentityAllowed: true,
    reusableIdentityRejectedPerField: true,
    generalizedReusableAccepted: true,
    noAuthoredLessonFallbackValidated: true,
    blankTemplateFallbackValidated: true,
    createVersionGenericTemplateValidated: true,
    persistedUnderstandingTagsValidated: true,
    validationWriteEquivalence: true,
    atomicRejection: true,
    correctedRetry: true,
    idempotency: true,
    tenantIsolation: true
  }, null, 2));
  console.log("NC-FIX-012 reflection provenance boundary probe passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
