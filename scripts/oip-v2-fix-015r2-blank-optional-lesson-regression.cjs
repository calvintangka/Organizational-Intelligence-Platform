/*
 * FIX-015R2 permanent regression: optional lesson authoring is three-way.
 *
 * Complete lesson content is promoted through the normal human-validation
 * boundary, partial authored content is rejected before persistence, and a
 * completely blank optional lesson uses the generic no-lesson path. The
 * blank case is exercised through the real promotion command and the real
 * server transaction on a disposable organization.
 */
const assert = require("node:assert/strict");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

const service = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { getPrismaClient } = require(path.join(root, "lib", "server", "prisma.ts"));
const { createTicketRecord } = require(path.join(root, "lib", "ticketRecords.ts"));
const { promoteKnowledgeCommand } = require(path.join(root, "lib", "application", "learning", "reflectionCommands.ts"));
const { hasReflectionLessonContent, isCompleteReflectionLesson } = require(path.join(root, "lib", "reflectionDraft.ts"));
const safety = require(path.join(root, "lib", "reflectionSafety.ts"));

const suffix = Date.now();
// This stable organization key intentionally exercises a leading-zero FNV
// digest. The old tenant-scoped identity formatter emitted only seven hex
// characters for this value; the durable contract requires eight.
const ORG = "oip-fix-015r2-leading-8";
const FOREIGN_CANONICAL_ID = "canonical-security-incident";
const TICKET = `FIX-015R2-${suffix}`;
const ACTOR = { id: `fix-015r2-actor-${suffix}`, name: "FIX-015R2 Reviewer" };
const NOW = new Date().toISOString();

function profile() {
  return {
    id: ORG,
    name: "FIX-015R2 Disposable Organization",
    industry: "Support",
    description: "Disposable blank optional lesson regression organization.",
    products: ["Probe Product"],
    services: [],
    supportedDomains: ["security"],
    businessVocabulary: [],
    supportedIssueTypes: ["security"],
    outOfScopeTopics: [],
    customerTone: "professional",
    supportBoundaries: [],
    autoResolutionThreshold: 80,
    escalationRules: [],
    logoInitials: "15R2",
    createdAt: NOW,
    updatedAt: NOW
  };
}

function ticketRecord() {
  const record = createTicketRecord(TICKET, ORG, "Access request requires human review.", "Access request");
  record.status = "resolved";
  record.resolutionMode = "human";
  record.resolution = {
    finalResponse: "We cannot change access without authorized review.",
    humanEdited: true,
    editDistanceNote: null,
    resolvedAt: NOW,
    resolvedBy: ACTOR.id,
    draftRevision: 1,
    evidenceIds: [`evidence-${TICKET}`]
  };
  record.resolutionEvidence = [{
    id: `resolution-${TICKET}`,
    orgId: ORG,
    ticketId: TICKET,
    type: "manual_verified_resolution",
    sourceMessageId: null,
    actorId: ACTOR.id,
    note: "Disposable resolution verified by the reviewer.",
    createdAt: NOW,
    idempotencyKey: `resolution-${TICKET}`
  }];
  return record;
}

function ticket() {
  return {
    id: TICKET,
    ticketId: TICKET,
    customerName: "Probe Customer",
    subject: "Access request",
    description: "Access request requires human review.",
    category: "Security Incident",
    status: "resolved",
    createdAt: NOW
  };
}

function understanding() {
  return {
    ticketId: TICKET,
    summary: "Human review is required for this access request.",
    coreProblem: "Potential security incident requires human review",
    category: "Security Incident",
    intent: "security_incident",
    urgency: "medium",
    tags: ["security", "human-review"],
    detectedSignals: ["security request"],
    extractedFields: {
      senderName: null,
      senderRole: null,
      companyName: null,
      deadline: null,
      subIssues: [],
      urgencyIndicators: []
    }
  };
}

const reflection = {
  isLearningEvent: true,
  action: "create_new",
  rationale: "No existing Security Incident Memory covers this request.",
  trustImpact: "increase",
  estimatedTrustDelta: 3
};

const blankLesson = { rootCause: "", solution: "", customerResponse: "", signals: [] };
const completeLesson = {
  mode: "new",
  rootCause: "The access request lacked an approved authorization path.",
  solution: "Route the request through the approved access review process.",
  customerResponse: "We will review the access request through the approved process.",
  signals: ["access request"]
};

// This is the exact reviewed response captured from the failed blank-path
// browser acceptance on NC-20260911-0021. The current command used to wrap it
// in a synthetic LessonDraft even though the reviewer authored no lesson.
const blankUiTicketId = "NC-20260911-0021";
const blankUiIssue = "The analytics export timed out during a monthly report download.";
const blankUiReviewedResponse = `Hello,

Thank you for reaching out. We understand that your analytics export timed out while you were downloading a monthly report.

Regarding the analytics export timeout during your monthly report download: this can sometimes occur when a report is large or the export takes longer than expected. To help us look into this, please confirm the report name and the date range you selected, and let us know whether the timeout happens every time or only occasionally.

Once we have these details, we can review the issue further. If you have a ticket reference, please include it in your reply.

Ticket reference: ${blankUiTicketId}

Nusa Cloud Support Team`;

function capturePersistence() {
  const state = { commitAttempts: 0, lastInput: null };
  return {
    state,
    persistence: {
      context: { organizationId: ORG, authority: "server" },
      async commitValidatedMemoryChange(input) {
        state.commitAttempts += 1;
        state.lastInput = input;
        return {
          replayed: false,
          knowledgeRevision: input.knowledgeItem.revision,
          trustApplied: true,
          candidate: input.candidate,
          validation: input.validation,
          memoryChange: input.memoryChange,
          knowledgeItem: input.knowledgeItem,
          auditSummary: {
            organizationId: ORG,
            actorId: ACTOR.id,
            actor: ACTOR.name,
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
  const organizationProfile = profile();
  const sourceTicket = ticket();
  const und = understanding();
  return {
    organizationId: ORG,
    actor: ACTOR,
    authority: "server",
    requestId: `request-${TICKET}`,
    idempotencyKey: `idempotency-${TICKET}`,
    organizationProfile,
    ticket: sourceTicket,
    understanding: und,
    reviewedResponse: "We cannot change access without authorized review.",
    suggestedResponse: null,
    reflection,
    lessonDraft: undefined,
    knowledgeItems: [],
    validationRecords: [],
    ...overrides
  };
}

async function main() {
  const prisma = getPrismaClient();
  try {
    const foreignCanonical = await prisma.knowledgeItem.findUnique({ where: { id: FOREIGN_CANONICAL_ID }, select: { organizationId: true, canonicalProblemId: true } });
    assert.ok(foreignCanonical && foreignCanonical.organizationId !== ORG, "the shared canonical fixture must be owned by another tenant");
    assert.equal(foreignCanonical.canonicalProblemId, FOREIGN_CANONICAL_ID, "the foreign fixture must retain the semantic canonical identity");
    await service.upsertOrganizationProfile(profile());
    await service.saveTicketRecords(ORG, [ticketRecord()]);

    assert.equal(hasReflectionLessonContent(blankLesson), false, "blank optional authoring is not authored lesson content");
    assert.equal(isCompleteReflectionLesson(blankLesson), false, "blank optional authoring is not a complete lesson");
    assert.equal(hasReflectionLessonContent(completeLesson), true, "complete lesson content is recognized");
    assert.equal(isCompleteReflectionLesson(completeLesson), true, "complete lesson content is valid for submission");

    const partial = { ...completeLesson, signals: [] };
    assert.equal(hasReflectionLessonContent(partial), true, "partial authored content remains intentional");
    assert.equal(isCompleteReflectionLesson(partial), false, "partial authored content is not complete");
    const context = { organizationId: ORG, authority: "server" };
    const ports = {
      persistence: {
        context,
        // The browser adapter sends this bundle through JSON.stringify before
        // the server validates it. Keep the regression on that same boundary.
        commitValidatedMemoryChange: (request) => service.commitValidation(ORG, JSON.parse(JSON.stringify(request)), ACTOR)
      }
    };
    const first = await promoteKnowledgeCommand(command(), ports);
    assert.equal(first.replayed, false, "blank optional path commits once");
    assert.equal(first.action, "create_new", "blank optional path preserves generic create_new action");
    assert.match(first.knowledgeItem.id, /^canonical-security-incident--tenant-[0-9a-f]{8}$/i, "new tenant uses a scoped durable row id");
    assert.equal(first.knowledgeItem.canonicalProblemId, "canonical-security-incident", "semantic canonical identity remains stable");
    assert.notEqual(first.knowledgeItem.id, "canonical-security-incident", "foreign tenant row identity is never reused");
    assert.equal(first.ticketReflection.lessonCreatedId, null, "blank optional path does not create a lesson");
    assert.equal(first.knowledgeItem.lessons?.length ?? 0, 0, "blank optional path writes no reusable lesson");

    const replay = await promoteKnowledgeCommand(command(), ports);
    assert.equal(replay.replayed, true, "blank optional retry replays exactly once");

    const blankUiContext = safety.buildReflectionSafetyContext({
      customerName: "Customer",
      organizationName: "Nusa Cloud",
      sourceTicketId: blankUiTicketId,
      sourceTicketText: `${blankUiIssue} ${blankUiIssue}`,
      extractedCustomerName: null,
      extractedCompanyName: null
    });
    const syntheticBlankSafetyDraft = {
      mode: "new",
      rootCause: "",
      solution: "",
      customerResponse: blankUiReviewedResponse,
      signals: []
    };
    assert.deepEqual(
      safety.assessReflectionSafety(syntheticBlankSafetyDraft, blankUiContext).issues,
      ["phone number", "ticket or case identifier", "organization-specific name", "source ticket identifier", "copied ticket text"],
      "the preserved NC-20260911-0021 synthetic blank draft reproduces the five false rejection reasons"
    );

    const versionReflection = {
      ...reflection,
      action: "create_version",
      existingItemId: first.knowledgeItem.id,
      existingItemTitle: first.knowledgeItem.title,
      existingItemSimilarity: 25
    };
    const versionCommand = command({
      requestId: `request-${blankUiTicketId}`,
      idempotencyKey: `idempotency-${blankUiTicketId}`,
      ticket: {
        ...ticket(),
        id: `ticket-${blankUiTicketId}`,
        ticketId: blankUiTicketId,
        subject: blankUiIssue,
        description: blankUiIssue
      },
      understanding: {
        ...understanding(),
        ticketId: blankUiTicketId,
        category: "Security Incident",
        intent: "security_incident"
      },
      reviewedResponse: blankUiReviewedResponse,
      suggestedResponse: { draftMode: "ai_advisory" },
      reflection: versionReflection,
      lessonDraft: undefined,
      knowledgeItems: [first.knowledgeItem]
    });
    assert.equal(versionCommand.lessonDraft, undefined, "the blank UI path submits no lesson draft");
    const versionPorts = capturePersistence();
    const versionPromotion = await promoteKnowledgeCommand(versionCommand, versionPorts);
    assert.equal(versionPromotion.replayed, false, "the blank create-version path commits once");
    assert.equal(versionPromotion.action, "create_version", "the blank create-version action remains explicit");
    assert.equal(versionPorts.state.commitAttempts, 1, "the blank create-version path reaches persistence once");
    assert.equal(versionPromotion.ticketReflection.lessonCreatedId, null, "blank create-version path does not create a lesson");
    assert.equal(versionPromotion.knowledgeItem.lessons?.length ?? 0, 0, "blank create-version path writes no reusable lesson");
    assert.equal(versionPorts.state.lastInput.candidate.proposedContent.lessons, undefined, "source-derived material is not passed as authored reusable lesson content");
    assert.equal(versionPromotion.knowledgeItem.customerResponseTemplate, first.knowledgeItem.customerResponseTemplate, "blank create-version path preserves the existing reusable response template");
    assert.equal(versionPromotion.knowledgeItem.approvedAnswer, first.knowledgeItem.approvedAnswer, "blank create-version path preserves the existing reusable approved answer");
    const blankReusableContent = JSON.stringify({
      customerResponseTemplate: versionPromotion.knowledgeItem.customerResponseTemplate,
      approvedAnswer: versionPromotion.knowledgeItem.approvedAnswer,
      lessons: versionPromotion.knowledgeItem.lessons ?? []
    });
    assert.equal(blankReusableContent.includes(blankUiTicketId), false, "blank create-version reusable content must not contain the source ticket identifier");
    assert.equal(blankReusableContent.includes(blankUiIssue), false, "blank create-version reusable content must not contain copied ticket text");
    assert.deepEqual(versionPorts.state.lastInput.candidate.sourceTicketIds, [blankUiTicketId], "the source ticket remains provenance metadata");

    const versionReplay = await promoteKnowledgeCommand(versionCommand, versionPorts);
    assert.equal(versionReplay.replayed, true, "the blank create-version path replays idempotently");
    assert.equal(versionPorts.state.commitAttempts, 1, "the blank create-version replay does not duplicate persistence");

    const rows = await Promise.all([
      prisma.knowledgeCandidate.count({ where: { organizationId: ORG } }),
      prisma.validationRecord.count({ where: { organizationId: ORG } }),
      prisma.memoryChangeRecord.count({ where: { organizationId: ORG } }),
      prisma.knowledgeItem.count({ where: { organizationId: ORG } })
    ]);
    assert.deepEqual(rows, [1, 1, 1, 1], "blank optional path leaves one complete auditable promotion");

    console.log(JSON.stringify({
      blankOptionalLessonPath: "PASS",
      blankCreateVersionFalseRejectionRegression: "PASS",
      sourceDataProvenanceOnly: "PASS",
      partialAuthoredLessonBlocked: "PASS",
      completeLessonRecognized: "PASS",
      exactlyOnce: "PASS",
      counts: { candidates: rows[0], validations: rows[1], memoryChanges: rows[2], knowledgeItems: rows[3] }
    }));
  } finally {
    await service.deleteOrganization(ORG).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
