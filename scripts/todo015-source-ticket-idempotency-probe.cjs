/*
 * TODO-015 source-ticket trust idempotency probe (post-fix verification).
 *
 * Drives the REAL commitValidation transaction + lib/trustEngine.recordResolution
 * against DISPOSABLE organizations (test-oip-015a / test-oip-015b). Verifies that a
 * source ticket contributes trust only ONCE per (organizationId, knowledgeItemId,
 * trustEventType) while audit records (ValidationRecord / MemoryChangeRecord) are
 * still written. Disposable orgs are deleted at the end; mature
 * Maesa/FastDrop/Pramana are never referenced.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();


const service = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { getPrismaClient } = require(path.join(root, "lib", "server", "prisma.ts"));
const { recordResolution } = require(path.join(root, "lib", "trustEngine.ts"));
const { withCanonicalProblemDefaults } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));

const ORGA = "test-oip-015a";
const ORGB = "test-oip-015b";
const ACTOR = { id: "todo015-actor", name: "TODO-015 Probe" };
const EVENT = "HUMAN_REUSE";
const NOW = "2026-07-17T00:00:00.000Z";
let clock = Date.parse("2026-07-17T12:00:00.000Z");
const nextTime = () => new Date((clock += 1000)).toISOString();

function profile(id) {
  return { id, name: `Probe ${id}`, industry: "Probe", description: "Disposable TODO-015 org.", products: ["p"], services: [], supportedDomains: ["billing"], businessVocabulary: [], supportedIssueTypes: [], outOfScopeTopics: [], customerTone: "professional", supportBoundaries: [], autoResolutionThreshold: 80, escalationRules: [], logoInitials: "T5", createdAt: NOW, updatedAt: NOW };
}
function baseItem(orgId, id) {
  return withCanonicalProblemDefaults({
    id, organizationId: orgId, title: "Trust item", category: "Billing",
    canonicalProblemId: id, canonicalProblemTitle: "Trust item", problem: "p", problemSummary: "p",
    approvedAnswer: "answer", customerResponseTemplate: "answer", tags: ["billing"], sourceTicketId: "seed-ticket",
    trustScore: 20, createdAt: NOW, approvedAt: NOW,
    lessons: [{ id: `${id}-lesson`, rootCause: "rc", solution: "s", customerResponse: "Hi {{customerName}}", signals: ["x"], createdAt: NOW, sourceTicketId: "seed-ticket" }],
    knowledgeVersions: [{ versionId: `${id}-v1`, version: 1, createdAt: NOW, changeReason: "seed", sourceTicketId: "seed-ticket", summary: "v1" }]
  });
}
function payload({ orgId, candidateId, validationId, memoryId, action, sourceTicketIds, item, expectedRevision }) {
  return {
    candidate: { id: candidateId, organizationId: orgId, sourceTicketIds, proposedAction: action, proposedContent: { solution: "x", customerResponseTemplate: item.customerResponseTemplate, internalGuidance: "x" }, rationale: "todo015", status: "proposed", createdAt: nextTime() },
    validation: { id: validationId, organizationId: orgId, candidateId, knowledgeId: item.id, knowledgeVersionId: `${item.id}-v1`, decision: "approved", actor: "x", roleExercised: "knowledge_validator", rationale: "todo015", timestamp: nextTime() },
    memoryChange: { id: memoryId, organizationId: orgId, knowledgeId: item.id, candidateId, validationRecordId: validationId, changeType: action, beforeState: null, afterState: item, timestamp: nextTime() },
    knowledgeItem: item,
    expectedKnowledgeRevision: expectedRevision
  };
}
async function loadItem(orgId, id) { return (await service.loadKnowledge(orgId)).find((i) => i.id === id); }
async function cleanup() {
  for (const id of [ORGA, ORGB]) {
    try { await service.deleteOrganization(id); } catch (e) { if (e?.code !== "ORGANIZATION_NOT_FOUND") throw e; }
  }
}

async function main() {
  const prisma = getPrismaClient();
  const report = { cases: {} };
  const evidenceCount = (orgId, itemId, sourceTicketId) => prisma.trustEvidence.count({ where: { organizationId: orgId, knowledgeItemId: itemId, sourceTicketId, trustEventType: EVENT } });
  const orgCounts = async (orgId) => ({
    validations: await prisma.validationRecord.count({ where: { organizationId: orgId } }),
    memory: await prisma.memoryChangeRecord.count({ where: { organizationId: orgId } })
  });

  // A trust-adding (trust_update_only) commit computed via the real trustEngine.
  async function trustCommit({ orgId, itemId, suffix, sourceTicketIds, profileObj, expectedRevisionOverride }) {
    const current = await loadItem(orgId, itemId);
    const result = recordResolution(current, { mode: "human", success: true, at: nextTime() }, profileObj, []);
    const p = payload({ orgId, candidateId: `c-${suffix}`, validationId: `v-${suffix}`, memoryId: `m-${suffix}`, action: "trust_update_only", sourceTicketIds, item: result.item, expectedRevision: expectedRevisionOverride ?? current.revision });
    const res = await service.commitValidation(orgId, p, ACTOR);
    return { res, payload: p, before: current.trustScore };
  }

  try {
    await cleanup();
    await service.upsertOrganizationProfiles([profile(ORGA), profile(ORGB)]);
    const profA = await service.getOrganizationProfile(ORGA);
    const profB = await service.getOrganizationProfile(ORGB);
    await service.commitValidation(ORGA, payload({ orgId: ORGA, candidateId: "c-seed", validationId: "v-seed", memoryId: "m-seed", action: "create_new", sourceTicketIds: ["seed-ticket"], item: baseItem(ORGA, "kA"), expectedRevision: null }), ACTOR);
    assert.equal((await loadItem(ORGA, "kA")).trustScore, 20, "baseline trust 20");

    // Case C (first): T-100 new -> trust applies (20->25), 1 evidence row.
    const c1 = await trustCommit({ orgId: ORGA, itemId: "kA", suffix: "c1", sourceTicketIds: ["T-100"], profileObj: profA });
    assert.equal(c1.res.trustApplied, true, "C1: first T-100 contribution applies trust");
    assert.equal((await loadItem(ORGA, "kA")).trustScore, 25, "C1: 20->25");
    assert.equal(await evidenceCount(ORGA, "kA", "T-100"), 1, "C1: one evidence row for T-100");
    report.cases.C1_firstContribution = { trust: 25, trustApplied: true };

    // Case A: exact replay of C1 -> no-op.
    const replay = await service.commitValidation(ORGA, c1.payload, ACTOR);
    assert.equal(replay.replayed, true, "A: exact replay is a no-op");
    assert.equal((await loadItem(ORGA, "kA")).trustScore, 25, "A: replay adds no trust");
    report.cases.A_exactReplay = { replayed: true, trust: 25 };

    // Case B: same candidate id (c-c1), new validation id -> conflict.
    const bp = payload({ orgId: ORGA, candidateId: "c-c1", validationId: "v-c1-b", memoryId: "m-c1-b", action: "trust_update_only", sourceTicketIds: ["T-100"], item: { ...(await loadItem(ORGA, "kA")), revision: 3 }, expectedRevision: 2 });
    await assert.rejects(() => service.commitValidation(ORGA, bp, ACTOR), (e) => e.code === "CONFLICT", "B: same candidate/new validation conflicts");
    assert.equal((await loadItem(ORGA, "kA")).trustScore, 25, "B: no trust from conflict");
    report.cases.B_sameCandidateNewValidation = { conflict: true, trust: 25 };

    // Case C (repeat) / D (new session): T-100 again via NEW candidate -> suppressed.
    const auditBefore = await orgCounts(ORGA);
    const c2 = await trustCommit({ orgId: ORGA, itemId: "kA", suffix: "c2", sourceTicketIds: ["T-100"], profileObj: profA });
    const afterC2 = await loadItem(ORGA, "kA");
    const auditAfter = await orgCounts(ORGA);
    assert.equal(c2.res.trustApplied, false, "C2/D: repeated T-100 does NOT apply trust");
    assert.equal(afterC2.trustScore, 25, "C2/D: trust stays 25 (idempotent)");
    assert.equal(afterC2.revision, 3, "C2/D: commit still advances revision");
    assert.equal(await evidenceCount(ORGA, "kA", "T-100"), 1, "C2/D: still exactly one T-100 evidence row");
    assert.equal(auditAfter.validations, auditBefore.validations + 1, "I: ValidationRecord still written on repeat");
    assert.equal(auditAfter.memory, auditBefore.memory + 1, "I: MemoryChangeRecord still written on repeat");
    report.cases.C2_repeatSameTicket = { trust: 25, trustApplied: false, revision: 3 };
    report.cases.D_newSessionSameTicket = { trust: 25, note: "server-side evidence guard; no session state needed" };
    report.cases.I_auditHistoryPreserved = { validationsDelta: 1, memoryDelta: 1, note: "repeated review recorded without trust inflation" };

    // Case F: different ticket T-200 -> trust applies (25->30).
    const f1 = await trustCommit({ orgId: ORGA, itemId: "kA", suffix: "f1", sourceTicketIds: ["T-200"], profileObj: profA });
    assert.equal(f1.res.trustApplied, true, "F: different ticket applies trust");
    assert.equal((await loadItem(ORGA, "kA")).trustScore, 30, "F: 25->30");
    report.cases.F_differentTicket = { trust: 30, trustApplied: true };

    // Case H: one candidate, multiple NEW sourceTicketIds -> ONE delta (30->35), 3 evidence rows.
    const h1 = await trustCommit({ orgId: ORGA, itemId: "kA", suffix: "h1", sourceTicketIds: ["T-300", "T-301", "T-302"], profileObj: profA });
    assert.equal(h1.res.trustApplied, true, "H: multi-source applies the event delta once");
    assert.equal((await loadItem(ORGA, "kA")).trustScore, 35, "H: 30->35 (single +5, not +15)");
    for (const t of ["T-300", "T-301", "T-302"]) assert.equal(await evidenceCount(ORGA, "kA", t), 1, `H: evidence row for ${t}`);
    report.cases.H_multiSource = { trust: 35, evidenceRows: 3, note: "one candidate = one +5; each ticket claims its own evidence row" };

    // Case E: concurrent two NEW candidates, same ticket T-400 -> exactly one contribution.
    const cur = await loadItem(ORGA, "kA");
    const rE1 = recordResolution(cur, { mode: "human", success: true, at: nextTime() }, profA, []);
    const rE2 = recordResolution(cur, { mode: "human", success: true, at: nextTime() }, profA, []);
    const settled = await Promise.allSettled([
      service.commitValidation(ORGA, payload({ orgId: ORGA, candidateId: "c-e1", validationId: "v-e1", memoryId: "m-e1", action: "trust_update_only", sourceTicketIds: ["T-400"], item: rE1.item, expectedRevision: cur.revision }), ACTOR),
      service.commitValidation(ORGA, payload({ orgId: ORGA, candidateId: "c-e2", validationId: "v-e2", memoryId: "m-e2", action: "trust_update_only", sourceTicketIds: ["T-400"], item: rE2.item, expectedRevision: cur.revision }), ACTOR)
    ]);
    const fulfilled = settled.filter((s) => s.status === "fulfilled").length;
    assert.equal(fulfilled, 1, "E: exactly one concurrent commit wins");
    assert.equal((await loadItem(ORGA, "kA")).trustScore, 40, "E: exactly one +5 applied (35->40)");
    assert.equal(await evidenceCount(ORGA, "kA", "T-400"), 1, "E: exactly one T-400 evidence row");
    report.cases.E_concurrentSameTicket = { fulfilled, trust: 40, evidenceRows: 1 };

    // Case G: same ticket id T-100 in ORGB -> independent; ORGA unaffected.
    await service.commitValidation(ORGB, payload({ orgId: ORGB, candidateId: "cb-seed", validationId: "vb-seed", memoryId: "mb-seed", action: "create_new", sourceTicketIds: ["seed-ticket"], item: baseItem(ORGB, "kB"), expectedRevision: null }), ACTOR);
    const g1 = await trustCommit({ orgId: ORGB, itemId: "kB", suffix: "g1", sourceTicketIds: ["T-100"], profileObj: profB });
    assert.equal(g1.res.trustApplied, true, "G: ORGB T-100 applies independently");
    assert.equal((await loadItem(ORGB, "kB")).trustScore, 25, "G: ORGB independent (20->25)");
    assert.equal((await loadItem(ORGA, "kA")).trustScore, 40, "G: ORGA unaffected by cross-org commit");
    report.cases.G_crossOrg = { orgATrust: 40, orgBTrust: 25 };

    // Case J: rollback after evidence claim. New ticket T-500 but STALE revision ->
    // knowledge upsert conflicts AFTER the evidence claim -> whole tx rolls back.
    const beforeJ = await loadItem(ORGA, "kA");
    await assert.rejects(
      () => trustCommit({ orgId: ORGA, itemId: "kA", suffix: "j1", sourceTicketIds: ["T-500"], profileObj: profA, expectedRevisionOverride: beforeJ.revision + 50 }),
      (e) => e.code === "CONFLICT",
      "J: stale-revision commit must fail"
    );
    assert.equal((await loadItem(ORGA, "kA")).trustScore, 40, "J: trust unchanged after rollback");
    assert.equal(await evidenceCount(ORGA, "kA", "T-500"), 0, "J: TrustEvidence rolled back — no orphan row");
    report.cases.J_rollback = { trust: 40, orphanEvidence: false };

    // Case K: retry T-500 with the correct revision -> succeeds, trust applies, evidence present.
    const k1 = await trustCommit({ orgId: ORGA, itemId: "kA", suffix: "k1", sourceTicketIds: ["T-500"], profileObj: profA });
    assert.equal(k1.res.trustApplied, true, "K: retry applies trust");
    assert.equal((await loadItem(ORGA, "kA")).trustScore, 45, "K: 40->45 on valid retry");
    assert.equal(await evidenceCount(ORGA, "kA", "T-500"), 1, "K: evidence claimable after prior rollback");
    report.cases.K_retryAfterRollback = { trust: 45, evidenceRows: 1 };

    console.log("TODO-015 idempotency probe passed (fixed behavior verified).");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await cleanup();
  }
}

main()
  .then(async () => { await getPrismaClient().$disconnect(); })
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
    try { await cleanup(); } catch { /* best effort */ }
    await getPrismaClient().$disconnect();
  });
