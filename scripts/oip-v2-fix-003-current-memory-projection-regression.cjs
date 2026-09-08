/*
 * OIP-V2-FIX-003 current Memory projection regression.
 *
 * This is a read-only, pure projection probe. It verifies that retrieval
 * evidence remains stable while the Memory metadata rendered by Tickets is
 * rebound to the latest organization-scoped Knowledge collection.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();
const { projectCurrentKnowledgeMatches } = require(path.join(root, "lib", "currentMemoryProjection.ts"));
const { projectCurrentMemoryProvenance } = require(path.join(root, "lib", "currentMemoryProvenance.ts"));

function item(id, values = {}) {
  return {
    id,
    title: values.title ?? "Dispatch access lesson",
    problem: values.problem ?? "Roster access was unavailable",
    approvedAnswer: values.approvedAnswer ?? "Reconcile the current access mapping.",
    category: "Access",
    tags: ["roster", "mapping"],
    sourceTicketId: "qa-source",
    timesReused: values.timesReused ?? 0,
    createdAt: "2026-09-07T00:00:00.000Z",
    approvedAt: "2026-09-07T00:00:00.000Z",
    revision: values.revision ?? 1,
    trustScore: values.trustScore ?? 20,
    humanReviewCount: values.humanReviewCount ?? 0,
    governanceState: values.governanceState ?? "trusted",
    lifecycleState: "active",
    ...(values.scopeNote ? { scopeNote: values.scopeNote } : {}),
    knowledgeVersions: values.knowledgeVersions ?? [{ versionId: "v1", changeReason: "Initial version" }]
  };
}

function main() {
  const stale = item("canonical-memory-projection-1", { revision: 1, trustScore: 20, humanReviewCount: 0 });
  stale.canonicalProblemId = "canonical-memory-projection-1";
  const current = item("memory-projection-1", {
    revision: 5,
    trustScore: 15,
    humanReviewCount: 2,
    scopeNote: "Current eligible assignments only",
    knowledgeVersions: [
      { versionId: "v1", changeReason: "Initial version" },
      { versionId: "v2", changeReason: "Scope narrowed after challenge" }
    ]
  });
  current.canonicalProblemId = "canonical-memory-projection-1";
  const secondStale = item("canonical-memory-projection-2", { revision: 1, trustScore: 20 });
  secondStale.canonicalProblemId = "canonical-memory-projection-2";
  const secondCurrent = item("memory-projection-2", { revision: 2, trustScore: 30 });
  secondCurrent.canonicalProblemId = "canonical-memory-projection-2";
  const match = {
    item: stale,
    matchScore: 73,
    matchReason: "retrieval evidence",
    matchedKeywords: ["roster", "mapping"],
    relevanceEvidence: { conceptMatches: ["access"], phrasePoints: 4 }
  };
  const projected = projectCurrentKnowledgeMatches(
    [match, { ...match, item: secondStale, matchScore: 41 }],
    [current, secondCurrent]
  );

  assert.equal(projected.length, 2, "all retrieval candidates must remain visible");
  assert.equal(projected[0].item.revision, 5, "the current Memory revision must replace the stale snapshot");
  assert.equal(projected[0].item.trustScore, 15, "current reliability must be rendered");
  assert.equal(projected[0].item.humanReviewCount, 2, "current approval metadata must be rendered");
  assert.equal(projected[0].item.scopeNote, "Current eligible assignments only", "current scope must be rendered");
  assert.equal(projected[0].matchScore, 73, "retrieval score must remain unchanged");
  assert.deepEqual(projected[0].matchedKeywords, ["roster", "mapping"], "retrieval evidence must remain unchanged");
  assert.equal(projected[1].item.revision, 2, "each candidate must be independently projected");
  assert.equal(projected[0].item.id, "memory-projection-1", "canonical retrieval ids must rebind to the durable current item");
  assert.equal(stale.revision, 1, "historical retrieval snapshot must remain unchanged");
  assert.equal(stale.sourceTicketId, "qa-source", "historical provenance must remain unchanged");

  const missing = projectCurrentKnowledgeMatches([match], []);
  assert.strictEqual(missing[0], match, "without a current collection the historical match must remain intact");

  const inspection = {
    knowledgeItem: {
      ...current,
      provenance: { validatedBy: "Avery Morgan QA" }
    },
    source: {
      sourceKind: "OPERATIONAL_EVENT",
      sourceObjectType: "ticket",
      sourceObjectId: "MF-FIX003-001",
      metadata: { title: "Dispatch roster access restored" }
    },
    evidence: [
      { evidence: { content: "Access was restored after the approved group assignment.", evidenceType: "confirmation" } },
      { evidence: { content: "A reviewer confirmed the eligible coordinator could sign in.", evidenceType: "system_result" } }
    ],
    history: { validationRecords: [], memoryChangeRecords: [] }
  };
  const provenance = projectCurrentMemoryProvenance(inspection);
  assert.equal(provenance.sourceLabel, "Dispatch roster access restored", "current Source title must be inspectable");
  assert.equal(provenance.evidenceCount, 2, "current linked Evidence count must be inspectable");
  assert.equal(provenance.validationLabel, "Avery Morgan QA", "human validation identity must remain visible");
  assert.equal(provenance.evidenceSummaries.length, 2, "current Evidence summaries must be presented");
  assert.equal(projected[0].matchScore, 73, "provenance projection must not alter retrieval relevance");
  console.log(JSON.stringify({
    projection: "PASS",
    currentRevision: projected[0].item.revision,
    currentTrust: projected[0].item.trustScore,
    currentApprovalCount: projected[0].item.humanReviewCount,
    retrievalScorePreserved: projected[0].matchScore === 73,
    missingCollectionSafe: missing[0] === match,
    provenance: "PASS",
    currentEvidenceCount: provenance.evidenceCount
  }));
}

main();
