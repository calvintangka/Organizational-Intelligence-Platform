/*
 * TODO-015 source-ticket trust idempotency reproduction probe (AUDIT ONLY).
 *
 * Drives the REAL commitValidation transaction + lib/trustEngine.recordResolution
 * against DISPOSABLE organizations (test-oip-015a / test-oip-015b) to reproduce
 * cases A-H. It asserts CURRENT behavior (including the reproduced gap) so the
 * audit is deterministic. No fix is applied. Disposable orgs are deleted at the
 * end; mature Maesa/FastDrop/Pramana are never referenced.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(root, ".env.local") });
require("dotenv").config({ path: path.join(root, ".env") });

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveProjectAlias(request, parent, isMain, options) {
  if (request === "server-only") return path.join(__dirname, "stubs", "server-only.cjs");
  if (request.startsWith("@/")) {
    const mapped = path.join(root, request.slice(2));
    if (fs.existsSync(`${mapped}.ts`)) return `${mapped}.ts`;
    if (fs.existsSync(`${mapped}.tsx`)) return `${mapped}.tsx`;
    if (fs.existsSync(path.join(mapped, "index.ts"))) return path.join(mapped, "index.ts");
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
for (const extension of [".ts", ".tsx"]) {
  require.extensions[extension] = function transpileTypeScript(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: filename
    });
    module._compile(output.outputText.replace(/import\.meta\.url/g, "require('node:url').pathToFileURL(__filename).href"), filename);
  };
}

const service = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { getPrismaClient } = require(path.join(root, "lib", "server", "prisma.ts"));
const { recordResolution } = require(path.join(root, "lib", "trustEngine.ts"));
const { withCanonicalProblemDefaults } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));

const ORGA = "test-oip-015a";
const ORGB = "test-oip-015b";
const ACTOR = { id: "todo015-actor", name: "TODO-015 Probe" };
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

async function loadItem(orgId, id) {
  return (await service.loadKnowledge(orgId)).find((i) => i.id === id);
}
async function orgCounts(prisma, orgId) {
  return {
    validations: await prisma.validationRecord.count({ where: { organizationId: orgId } }),
    memory: await prisma.memoryChangeRecord.count({ where: { organizationId: orgId } }),
    candidates: await prisma.knowledgeCandidate.count({ where: { organizationId: orgId } })
  };
}
async function cleanup() {
  for (const id of [ORGA, ORGB]) {
    try { await service.deleteOrganization(id); } catch (e) { if (e?.code !== "ORGANIZATION_NOT_FOUND") throw e; }
  }
}

/** A trust-adding (trust_update_only) commit computed via the real trustEngine. */
async function trustCommit({ orgId, itemId, suffix, sourceTicketIds, profileObj }) {
  const current = await loadItem(orgId, itemId);
  const result = recordResolution(current, { mode: "human", success: true, at: nextTime() }, profileObj, []);
  const p = payload({ orgId, candidateId: `c-${suffix}`, validationId: `v-${suffix}`, memoryId: `m-${suffix}`, action: "trust_update_only", sourceTicketIds, item: result.item, expectedRevision: current.revision });
  const res = await service.commitValidation(orgId, p, ACTOR);
  return { res, payload: p, trustFrom: current.trustScore, trustTo: result.trustTo };
}

async function main() {
  const prisma = getPrismaClient();
  const report = { cases: {} };
  try {
    await cleanup();
    await service.upsertOrganizationProfiles([profile(ORGA), profile(ORGB)]);
    const profA = await service.getOrganizationProfile(ORGA);
    const profB = await service.getOrganizationProfile(ORGB);

    // Baseline item in ORGA (trust 20, revision 1).
    const created = await service.commitValidation(ORGA, payload({ orgId: ORGA, candidateId: "c-seed", validationId: "v-seed", memoryId: "m-seed", action: "create_new", sourceTicketIds: ["seed-ticket"], item: baseItem(ORGA, "kA"), expectedRevision: null }), ACTOR);
    assert.equal(created.knowledgeRevision, 1);
    let baseline = await loadItem(ORGA, "kA");
    assert.equal(baseline.trustScore, 20);

    // ---- Case C first (needs a clean committed trust-add to then replay in A/B) ----
    // Case C: SAME source ticket "T-100", NEW candidate -> trust increases again.
    const c1 = await trustCommit({ orgId: ORGA, itemId: "kA", suffix: "c1", sourceTicketIds: ["T-100"], profileObj: profA });
    const afterC = await loadItem(ORGA, "kA");
    assert.equal(afterC.trustScore, 25, "Case C: first T-100 contribution -> 20->25");
    report.cases.C_firstContribution = { trust: afterC.trustScore, revision: afterC.revision };

    // Case A: EXACT replay of the c1 commit (same ids, same payload) -> no-op.
    const replay = await service.commitValidation(ORGA, c1.payload, ACTOR);
    const afterA = await loadItem(ORGA, "kA");
    assert.equal(replay.replayed, true, "Case A: exact replay is a no-op");
    assert.equal(afterA.trustScore, 25, "Case A: replay adds no trust");
    assert.equal(afterA.revision, afterC.revision, "Case A: replay does not bump revision");
    report.cases.A_exactReplay = { replayed: replay.replayed, trust: afterA.trustScore, revision: afterA.revision };

    // Case B: SAME candidate id (c-c1), NEW validation id -> conflict.
    const bPayload = payload({ orgId: ORGA, candidateId: "c-c1", validationId: "v-c1-b", memoryId: "m-c1-b", action: "trust_update_only", sourceTicketIds: ["T-100"], item: { ...afterA, revision: afterA.revision + 1 }, expectedRevision: afterA.revision });
    await assert.rejects(() => service.commitValidation(ORGA, bPayload, ACTOR), (e) => e.code === "CONFLICT", "Case B: same candidate/new validation must conflict");
    const afterB = await loadItem(ORGA, "kA");
    assert.equal(afterB.trustScore, 25, "Case B: conflicting commit adds no trust");
    report.cases.B_sameCandidateNewValidation = { conflict: true, trust: afterB.trustScore };

    // Case C (continued / D): SAME source ticket "T-100" AGAIN via a brand-new candidate
    // (models a new session; server holds no session state) -> trust increases AGAIN.
    const c2 = await trustCommit({ orgId: ORGA, itemId: "kA", suffix: "c2", sourceTicketIds: ["T-100"], profileObj: profA });
    const afterC2 = await loadItem(ORGA, "kA");
    assert.equal(afterC2.trustScore, 30, "Case C/D: SAME ticket T-100 via a new candidate adds trust AGAIN (25->30) — REPRODUCED");
    report.cases.C_repeatSameTicket = { trust: afterC2.trustScore, revision: afterC2.revision, note: "same T-100, new candidate -> +5 again (gap reproduced)" };
    report.cases.D_newSessionSameTicket = { trust: afterC2.trustScore, note: "no server-side session/source-ticket guard; equivalent to Case C" };

    // Case F: DIFFERENT source ticket -> legitimate new trust increase.
    const f1 = await trustCommit({ orgId: ORGA, itemId: "kA", suffix: "f1", sourceTicketIds: ["T-200"], profileObj: profA });
    const afterF = await loadItem(ORGA, "kA");
    assert.equal(afterF.trustScore, 35, "Case F: different ticket T-200 legitimately adds trust (30->35)");
    report.cases.F_differentTicket = { trust: afterF.trustScore };

    // Case H: ONE candidate carrying MULTIPLE sourceTicketIds -> single contribution (+5 once).
    const h1 = await trustCommit({ orgId: ORGA, itemId: "kA", suffix: "h1", sourceTicketIds: ["T-300", "T-301", "T-302"], profileObj: profA });
    const afterH = await loadItem(ORGA, "kA");
    assert.equal(afterH.trustScore, 40, "Case H: multiple sourceTicketIds in one candidate = one contribution (+5)");
    report.cases.H_multiSourceTicket = { trust: afterH.trustScore, note: "one candidate = one trust contribution regardless of #sourceTicketIds" };

    // Case E: CONCURRENT two NEW candidates, SAME source ticket "T-400".
    const cur = await loadItem(ORGA, "kA");
    const rE1 = recordResolution(cur, { mode: "human", success: true, at: nextTime() }, profA, []);
    const rE2 = recordResolution(cur, { mode: "human", success: true, at: nextTime() }, profA, []);
    const settled = await Promise.allSettled([
      service.commitValidation(ORGA, payload({ orgId: ORGA, candidateId: "c-e1", validationId: "v-e1", memoryId: "m-e1", action: "trust_update_only", sourceTicketIds: ["T-400"], item: rE1.item, expectedRevision: cur.revision }), ACTOR),
      service.commitValidation(ORGA, payload({ orgId: ORGA, candidateId: "c-e2", validationId: "v-e2", memoryId: "m-e2", action: "trust_update_only", sourceTicketIds: ["T-400"], item: rE2.item, expectedRevision: cur.revision }), ACTOR)
    ]);
    const fulfilled = settled.filter((s) => s.status === "fulfilled").length;
    const rejected = settled.filter((s) => s.status === "rejected").length;
    const afterE = await loadItem(ORGA, "kA");
    assert.equal(fulfilled, 1, "Case E: optimistic revision lets only ONE concurrent commit win");
    assert.equal(rejected, 1, "Case E: the other concurrent commit conflicts");
    assert.equal(afterE.trustScore, 45, "Case E: only one +5 applied concurrently (40->45)");
    report.cases.E_concurrentSameTicket = { fulfilled, rejected, trust: afterE.trustScore, note: "concurrency bounded by optimistic revision, NOT by sourceTicket" };

    // Case G: SAME ticket id "T-100" in ORGB -> isolated; ORGA trust unchanged.
    await service.commitValidation(ORGB, payload({ orgId: ORGB, candidateId: "cb-seed", validationId: "vb-seed", memoryId: "mb-seed", action: "create_new", sourceTicketIds: ["seed-ticket"], item: baseItem(ORGB, "kB"), expectedRevision: null }), ACTOR);
    await trustCommit({ orgId: ORGB, itemId: "kB", suffix: "g1", sourceTicketIds: ["T-100"], profileObj: profB });
    const orgAAfterG = await loadItem(ORGA, "kA");
    const orgBAfterG = await loadItem(ORGB, "kB");
    assert.equal(orgAAfterG.trustScore, 45, "Case G: cross-org commit does not affect ORGA trust");
    assert.equal(orgBAfterG.trustScore, 25, "Case G: ORGB tracks its own trust independently");
    report.cases.G_crossOrg = { orgATrust: orgAAfterG.trustScore, orgBTrust: orgBAfterG.trustScore };

    // Durable-evidence check: is there any record proving "T-100 already counted for kA"?
    const candidatesForKA = await prisma.knowledgeCandidate.findMany({ where: { organizationId: ORGA }, select: { id: true, sourceTicketIds: true, relatedKnowledgeId: true, proposedAction: true } });
    const t100Contributions = candidatesForKA.filter((c) => JSON.stringify(c.sourceTicketIds).includes("T-100"));
    report.durableEvidence = {
      trustEventRecordExists: false,
      sourceTicketOnlyOnCandidateJson: true,
      t100CandidateContributions: t100Contributions.length,
      note: "No durable record marks a (org,knowledgeItem,sourceTicket) trust event as counted; sourceTicketIds live only as opaque candidate JSON."
    };
    assert.ok(t100Contributions.length >= 2, "T-100 produced multiple trust-adding candidates with no idempotency record");

    const finalCounts = await orgCounts(prisma, ORGA);
    report.finalOrgACounts = finalCounts;
    console.log("TODO-015 reproduction probe passed (current behavior asserted).");
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
