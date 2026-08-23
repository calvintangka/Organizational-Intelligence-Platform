/*
 * NC-FIX-014 permanent regression probe.
 *
 * Verifies the resolved-ticket Reflection recovery boundary:
 *   - a resolved, evidence-eligible ticket with no prepared Reflection exposes
 *     a recovery path (UI predicate) and can prepare Reflection through the
 *     existing `prepare_reflection` transition;
 *   - the resolution-evidence gate remains authoritative;
 *   - preparation does not automatically promote knowledge;
 *   - an already-prepared Reflection still guards duplicate preparation;
 *   - tenant isolation is preserved.
 *
 * This probe is database-isolated: it seeds disposable organizations/tickets,
 * exercises the real `applyTicketWorkflowCommand` service, and removes the
 * disposable rows before exit. It never touches the protected real-world cases.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { Client } = require("pg");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: true });
const recovery = require(path.join(root, "lib", "ticketReflectionRecovery.ts"));
const workflow = require(path.join(root, "lib", "server", "tickets", "ticketWorkflow.ts"));

assert(process.env.DATABASE_URL, "DATABASE_URL is required");

const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
const orgA = `nc-fix-014-org-a-${suffix}`;
const orgB = `nc-fix-014-org-b-${suffix}`;
const actorId = `nc-fix-014-actor-${suffix}`;
const ticketA = `nc-fix-014-a-${suffix}`;
const ticketB = `nc-fix-014-b-${suffix}`;
const ticketC = `nc-fix-014-c-${suffix}`;
const ticketD = `nc-fix-014-d-${suffix}`;

const preparedReflection = {
  action: "create_new",
  rationale: "Disposable NC-FIX-014 recovered reflection.",
  estimatedTrustDelta: 10,
  trustImpact: "increase",
  isLearningEvent: true,
  problemNameRequired: true,
  suggestedProblemName: "Disposable Recovery Problem"
};

function reflectionJson(preparedDecision) {
  return JSON.stringify({
    decision: null,
    lessonCreatedId: null,
    lessonReinforcedId: null,
    knowledgeChanged: null,
    validationEligible: true,
    validationEligibilityReason: null,
    evidenceIds: [],
    preparedDecision
  });
}

function resolutionJson(evidenceIds) {
  return JSON.stringify({
    finalResponse: "Disposable resolved response.",
    humanEdited: true,
    editDistanceNote: null,
    resolvedAt: new Date().toISOString(),
    resolvedBy: actorId,
    evidenceIds
  });
}

async function seed(db) {
  for (const orgId of [orgA, orgB]) {
    await db.query(
      'insert into organizations (id,name,industry,description,settings,"createdAt","updatedAt") values ($1,$2,$3,$4,$5::jsonb,current_timestamp,current_timestamp)',
      [orgId, orgId, "QA", "NC-FIX-014 disposable", JSON.stringify({})]
    );
  }

  const rows = [
    [ticketA, orgA, true, null],
    [ticketB, orgA, false, null],
    [ticketC, orgA, true, preparedReflection],
    [ticketD, orgB, true, null]
  ];

  for (const [ticketId, orgId, hasEvidence, preparedDecision] of rows) {
    const evidenceId = `${ticketId}-evidence`;
    await db.query(
      'insert into ticket_records (id,"organizationId","ticketId","rawMessage",subject,status,"draftSource",classification,"memoryMatch",resolution,reflection,"validationRecordIds",labels,"createdAt") values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,current_timestamp)',
      [
        `${ticketId}-row`,
        orgId,
        ticketId,
        "Disposable resolved ticket for NC-FIX-014 reflection recovery.",
        "Disposable recovery ticket",
        "resolved",
        "deterministic",
        JSON.stringify({ category: "Probe", intent: "support", canonicalProblem: "NC-FIX-014 recovery", classifiedBy: "deterministic", confidence: "high" }),
        JSON.stringify({ knowledgeId: null, matchType: "none", lessonId: null }),
        resolutionJson(hasEvidence ? [evidenceId] : []),
        reflectionJson(preparedDecision),
        JSON.stringify([]),
        JSON.stringify([])
      ]
    );
    if (hasEvidence) {
      await db.query(
        'insert into ticket_resolution_evidence (id,"organizationId","ticketId",type,"sourceMessageId","actorId",note,"createdAt","idempotencyKey") values ($1,$2,$3,$4,$5,$6,$7,current_timestamp,$8)',
        [evidenceId, orgId, ticketId, "agent_verification", null, actorId, "Disposable verified resolution.", `${evidenceId}-key`]
      );
    }
  }
}

async function cleanup(db) {
  await db.query("delete from organizations where id in ($1,$2)", [orgA, orgB]);
}

function workflowInput(orgId, ticketId) {
  return {
    organizationId: orgId,
    actorId,
    ticketId,
    command: { kind: "prepare_reflection", reflection: preparedReflection },
    requestId: `${ticketId}-request`,
    correlationId: `${ticketId}-correlation`,
    source: "probe"
  };
}

async function expectTicketWriteError(run, expectedCode) {
  try {
    await run();
  } catch (error) {
    assert.equal(error.name, "TicketWriteError");
    assert.equal(error.code, expectedCode);
    return error;
  }
  throw new Error(`Expected TicketWriteError ${expectedCode}`);
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    await seed(db);

    // 13.1 / 13.5 / 13.6 — UI availability predicate.
    const recoveryState = { status: "resolved", reflection: { validationEligible: true, preparedDecision: null, decision: null } };
    assert.equal(recovery.reflectionRecoveryNeeded(recoveryState), true, "resolved + eligible + no prepared reflection must need recovery");
    assert.equal(recovery.ticketWorkflowResumable(recoveryState), true, "resolved + eligible + no prepared reflection must be resumable");
    assert.equal(recovery.reflectionRecoveryNeeded({ status: "resolved", reflection: { validationEligible: true, preparedDecision: preparedReflection, decision: null } }), false, "prepared reflection must not need recovery");
    assert.equal(recovery.ticketWorkflowResumable({ status: "resolved", reflection: { validationEligible: true, preparedDecision: preparedReflection, decision: null } }), true, "prepared reflection must remain resumable");
    assert.equal(recovery.reflectionRecoveryNeeded({ status: "resolved", reflection: { validationEligible: true, preparedDecision: null, decision: "create_new" } }), false, "completed reflection must not need recovery");
    assert.equal(recovery.ticketWorkflowResumable({ status: "resolved", reflection: { validationEligible: true, preparedDecision: null, decision: "create_new" } }), true, "completed reflection must remain resumable");
    assert.equal(recovery.ticketWorkflowResumable({ status: "resolved", reflection: { validationEligible: false } }), false, "resolved + not eligible must not be resumable");
    assert.equal(recovery.ticketWorkflowResumable({ status: "in_review", reflection: {} }), true, "active conversation must remain resumable");
    assert.equal(recovery.ticketWorkflowResumable({ status: "discarded", reflection: {} }), false, "discarded ticket must not be resumable");

    // 13.3 / 13.4 — successful preparation, no automatic promotion.
    const prepared = await workflow.applyTicketWorkflowCommand(workflowInput(orgA, ticketA));
    assert.ok(prepared.reflection.preparedDecision, "prepare_reflection must persist preparedDecision");
    assert.equal(prepared.reflection.decision, null, "preparing a reflection must not set decision");
    assert.deepEqual(prepared.validationRecordIds, [], "preparing a reflection must not create validation records");

    const afterPrepare = await db.query(
      'select "reflection" from ticket_records where "organizationId"=$1 and "ticketId"=$2',
      [orgA, ticketA]
    );
    assert.equal(afterPrepare.rows[0].reflection.decision, null, "persisted decision must remain null after preparation");
    assert.ok(afterPrepare.rows[0].reflection.preparedDecision, "persisted preparedDecision must exist after preparation");
    const validationCount = await db.query('select count(*)::int n from validation_records where "organizationId"=$1', [orgA]);
    const knowledgeCount = await db.query('select count(*)::int n from knowledge_items where "organizationId"=$1', [orgA]);
    const memoryCount = await db.query('select count(*)::int n from memory_change_records where "organizationId"=$1', [orgA]);
    assert.equal(validationCount.rows[0].n, 0, "preparation must not create validation records");
    assert.equal(knowledgeCount.rows[0].n, 0, "preparation must not create knowledge items");
    assert.equal(memoryCount.rows[0].n, 0, "preparation must not create memory changes");

    // 13.7 — duplicate preparation remains guarded.
    await expectTicketWriteError(() => workflow.applyTicketWorkflowCommand(workflowInput(orgA, ticketA)), "INVALID_TRANSITION");

    // 13.2 — evidence gate: resolved + missing evidence cannot prepare.
    await expectTicketWriteError(() => workflow.applyTicketWorkflowCommand(workflowInput(orgA, ticketB)), "RESOLUTION_EVIDENCE_REQUIRED");

    // Already-prepared seed also guards duplicate preparation.
    await expectTicketWriteError(() => workflow.applyTicketWorkflowCommand(workflowInput(orgA, ticketC)), "INVALID_TRANSITION");

    // 13.8 — tenant isolation: org A cannot prepare org B's ticket.
    await expectTicketWriteError(() => workflow.applyTicketWorkflowCommand(workflowInput(orgA, ticketD)), "TICKET_NOT_FOUND");

    console.log(JSON.stringify({
      recoveryPredicate: true,
      successfulPreparation: true,
      evidenceGatePreserved: true,
      noAutomaticPromotion: true,
      duplicatePreparationGuarded: true,
      tenantIsolation: true
    }, null, 2));
    console.log("NC-FIX-014 resolved reflection recovery probe passed.");
  } finally {
    await cleanup(db);
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
