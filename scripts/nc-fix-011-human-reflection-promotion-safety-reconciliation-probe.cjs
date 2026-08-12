/*
 * NC-FIX-011 permanent regression probe.
 *
 * The source ticket deliberately contains customer, employee, company, and
 * ticket-specific values. The reusable lesson must reject those values while
 * still allowing a generalized human-authored lesson with supported
 * placeholders. The application command is exercised with a transactional
 * fake so validation atomicity and command idempotency remain observable.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness({ loadEnv: false });
const learning = require(path.join(root, "lib", "application", "learning", "reflectionCommands.ts"));
const safety = require(path.join(root, "lib", "reflectionSafety.ts"));

const organizationId = "nc-fix-011-org-a";
const foreignOrganizationId = "nc-fix-011-org-b";
const ticketId = "NS-20260812-0001";
const sourceText = "Customer Rina Prasetyo reports that affected employee Andi Wibowo cannot complete mobile clock-in because location permission is disabled on the device for PT Sinar Karya Abadi.";
const profile = { id: organizationId, name: "NC-FIX-011 Support Workspace", customerTone: "professional", language: "en" };
const foreignProfile = { ...profile, id: foreignOrganizationId };
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
  tags: ["mobile", "clock-in", "location"],
  detectedSignals: ["location permission"],
  extractedFields: {
    senderName: "Rina Prasetyo",
    senderRole: null,
    companyName: "PT Sinar Karya Abadi",
    deadline: null,
    subIssues: ["Mobile clock-in failure"],
    urgencyIndicators: []
  }
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
const safeLesson = {
  mode: "new",
  rootCause: "The mobile app lacked location permission on the affected employee device.",
  solution: "Enable device location services and grant the mobile app location access, then retry mobile clock-in.",
  customerResponse: "Please enable location access for the mobile app, then retry clock-in. Reference {{ticketId}}.",
  signals: ["mobile clock-in failure", "location permission disabled"]
};

function fakePersistence() {
  const state = { commitCount: 0 };
  return {
    state,
    persistence: {
      context: { organizationId, authority: "server", requestId: "nc-fix-011-probe", actorContext: { id: "nc-fix-011-user", name: "NC-FIX-011 reviewer" } },
      async commitValidatedMemoryChange(input) {
        state.commitCount += 1;
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
            actorId: "nc-fix-011-user",
            actor: "NC-FIX-011 reviewer",
            sourceTicketIds: input.candidate.sourceTicketIds,
            decision: input.validation.decision,
            changeType: input.memoryChange.changeType
          }
        };
      }
    }
  };
}

function command(overrides = {}) {
  return {
    organizationId,
    actor: { id: "nc-fix-011-user", name: "NC-FIX-011 reviewer" },
    authority: "server",
    requestId: "nc-fix-011-request",
    idempotencyKey: "nc-fix-011-promotion",
    organizationProfile: profile,
    ticket,
    understanding,
    reviewedResponse: "Hello Rina Prasetyo, the customer-facing response for this case was reviewed.",
    reflection,
    lessonDraft: safeLesson,
    problemName: "Mobile Clock-In - Location Permission Disabled",
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

async function main() {
  const context = safety.buildReflectionSafetyContext({
    customerName: ticket.customerName,
    organizationName: profile.name,
    sourceTicketId: ticketId,
    sourceTicketText: `${ticket.subject} ${ticket.description}`,
    extractedCustomerName: understanding.extractedFields.senderName,
    extractedCompanyName: understanding.extractedFields.companyName,
    reusableProblemName: command().problemName
  });

  assert.equal(safety.assessReflectionSafety(safeLesson, context).safe, true, "generic lesson plus specific source evidence must be safe");
  assert.equal(safety.assessReflectionSafety({ ...safeLesson, customerResponse: "Hello {{customerName}}, {{organizationName}} reference {{ticketId}}." }, context).safe, true, "supported placeholders must remain allowed");
  assert.equal(safety.assessReflectionSafety(safeLesson, { ...context, reusableProblemName: "Rina Prasetyo clock-in" }).safe, false, "customer name in reusable problem title must reject");
  assert.equal(safety.assessReflectionSafety({ ...safeLesson, solution: "Ask Andi Wibowo to enable location access." }, context).safe, false, "affected employee name in reusable solution must reject");
  assert.equal(safety.assessReflectionSafety({ ...safeLesson, customerResponse: "Please contact PT Sinar Karya Abadi to retry." }, context).safe, false, "source company in reusable response must reject");
  assert.equal(safety.assessReflectionSafety({ ...safeLesson, customerResponse: "Reference NS-20260812-0001." }, context).safe, false, "source ticket identifier in reusable response must reject");

  const first = fakePersistence();
  const result = await learning.promoteKnowledgeCommand(command(), first);
  assert.equal(first.state.commitCount, 1);
  assert.equal(result.replayed, false);
  assert.ok(result.knowledgeItem.lessons?.length === 1);
  assert.equal(result.knowledgeItem.lessons[0].sourceTicketId.startsWith("evidence-"), true, "lesson provenance is opaque");
  assert.deepEqual(result.candidate.sourceTicketIds, [ticketId], "candidate keeps canonical source ticket provenance");
  assert.equal(result.validation.decision, "approved");

  const replay = await learning.promoteKnowledgeCommand(command(), first);
  assert.equal(replay.replayed, true, "duplicate successful promotion must replay idempotently");
  assert.equal(first.state.commitCount, 1, "duplicate promotion must not commit twice");

  const unsafePersistence = fakePersistence();
  await expectLearningError(
    () => learning.promoteKnowledgeCommand(command({ idempotencyKey: "nc-fix-011-unsafe-customer", problemName: "Rina Prasetyo clock-in" }), unsafePersistence),
    "validation_rejected"
  );
  assert.equal(unsafePersistence.state.commitCount, 0, "unsafe promotion must be atomic before persistence");
  const corrected = await learning.promoteKnowledgeCommand(command({ idempotencyKey: "nc-fix-011-unsafe-customer", problemName: "Mobile Clock-In - Location Permission Disabled" }), unsafePersistence);
  assert.equal(corrected.replayed, false, "corrected retry must succeed");

  await expectLearningError(
    () => learning.promoteKnowledgeCommand(command({ organizationProfile: foreignProfile }), fakePersistence()),
    "tenant_mismatch"
  );
  await expectLearningError(
    () => learning.promoteKnowledgeCommand(command({ authority: "client" }), fakePersistence()),
    "invalid_command"
  );

  console.log(JSON.stringify({
    safeGenericWithSpecificSource: true,
    literalCustomerNameRejected: true,
    literalAffectedEmployeeRejected: true,
    literalCompanyRejected: true,
    literalTicketIdentifierRejected: true,
    supportedPlaceholdersAllowed: true,
    sourceProvenancePreserved: true,
    unsafePromotionAtomic: true,
    correctedRetrySucceeded: true,
    duplicatePromotionIdempotent: true,
    crossTenantRejected: true,
    unauthorizedAuthorityRejected: true
  }, null, 2));
  console.log("NC-FIX-011 human reflection promotion safety probe passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
