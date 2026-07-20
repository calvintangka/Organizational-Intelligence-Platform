/*
 * TODO-016 focused lesson identity/alias probe.
 * Pure fixtures only: no mature organization or database state is touched.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness({ loadEnv: false });

const {
  dedupeLessonCollection,
  dedupeNewLessonProposals,
  lessonContentFingerprint,
  mergeCanonicalProblemItems,
  mergeLessonIntoExisting,
  resolveLessonId,
  resolveLessonIdForItem
} = require(path.join(root, "lib", "canonicalProblemEngine.ts"));

const NOW = "2026-07-17T00:00:00.000Z";
const LATER = "2026-07-18T00:00:00.000Z";

function lesson(id, overrides = {}) {
  return {
    id,
    rootCause: "Verify purchase email before replacing activation key.",
    solution: "Confirm the purchase email, then replace the activation key.",
    customerResponse: "Please verify your purchase email before we replace the activation key.",
    signals: ["activation key"],
    createdAt: NOW,
    sourceTicketId: "ticket-a",
    ...overrides
  };
}

function item(id, lessons, overrides = {}) {
  return {
    id,
    organizationId: "org-a",
    title: "Activation",
    problem: "Activation issue",
    approvedAnswer: "Activation answer",
    category: "Activation",
    tags: ["activation"],
    sourceTicketId: "ticket-a",
    timesReused: 0,
    createdAt: NOW,
    approvedAt: NOW,
    trustScore: 20,
    lessons,
    ...overrides
  };
}

const report = {};

// A/B: transient and conservatively normalized duplicates do not create aliases.
{
  const base = lesson("lesson-a");
  const exact = mergeLessonIntoExisting([base], lesson("transient-b"));
  assert.equal(exact.lessons.length, 1);
  assert.equal(exact.lessons[0].id, "lesson-a");
  assert.deepEqual(exact.lessons[0].aliasLessonIds, undefined);

  const normalized = mergeLessonIntoExisting([base], lesson("transient-c", {
    rootCause: "  verify   PURCHASE email before replacing activation key!\r\n",
    solution: " confirm the purchase email, then replace the activation key ",
    customerResponse: "PLEASE verify your purchase email before we replace the activation key."
  }));
  assert.equal(normalized.lessons.length, 1);
  report.transient = { exact: exact.lessons.length, normalized: normalized.lessons.length, aliasCreated: !!normalized.lessons[0].aliasLessonIds?.length };
}

// C/D: similar and contradictory content remain separate.
{
  const similar = dedupeLessonCollection([
    lesson("similar-a"),
    lesson("similar-b", { solution: "Confirm the account email, then reset the password." })
  ]);
  const contradictory = dedupeLessonCollection([
    lesson("different-a"),
    lesson("different-b", { solution: "Never replace an activation key after verifying the email." })
  ]);
  assert.equal(similar.length, 2);
  assert.equal(contradictory.length, 2);
  report.distinct = { similar: similar.length, contradictory: contradictory.length };
}

// E/L: already durable duplicates consolidate deterministically and merge evidence.
{
  const older = lesson("lesson-a", {
    sourceTicketId: "ticket-a",
    sourceTicketIds: ["ticket-a"],
    signals: ["activation key"],
    whenToEscalate: "Escalate after verification.",
    doNotPromise: ["Do not promise instant replacement."],
    createdAt: NOW
  });
  const newer = lesson("lesson-b", {
    sourceTicketId: "ticket-b",
    sourceTicketIds: ["ticket-b"],
    signals: ["purchase email"],
    whenToEscalate: "Escalate after verification.",
    doNotPromise: ["Do not promise instant replacement.", "Do not promise a refund."],
    createdAt: LATER,
    aliasLessonIds: ["lesson-old"]
  });
  const merged = mergeCanonicalProblemItems(item("knowledge-a", [older]), item("knowledge-a", [newer]));
  assert.equal(merged.lessons.length, 1);
  assert.equal(merged.lessons[0].id, "lesson-a");
  assert.deepEqual(merged.lessons[0].aliasLessonIds, ["lesson-b", "lesson-old"]);
  assert.deepEqual(merged.lessons[0].sourceTicketIds, ["ticket-a", "ticket-b"]);
  assert.deepEqual(merged.lessons[0].signals, ["activation key", "purchase email"]);
  assert.equal(merged.lessons[0].doNotPromise.length, 2);
  report.existingDuplicate = { canonicalId: merged.lessons[0].id, aliases: merged.lessons[0].aliasLessonIds, sourceTickets: merged.lessons[0].sourceTicketIds };
}

// F/G: C-DUP-001 same-ID behavior is unchanged.
{
  const same = dedupeLessonCollection([lesson("shared"), lesson("shared")]);
  assert.equal(same.length, 1);
  const conflict = dedupeLessonCollection([
    lesson("shared-conflict"),
    lesson("shared-conflict", { solution: "Use a completely different activation workflow." })
  ]);
  assert.equal(conflict.length, 2);
  assert.ok(conflict.some((entry) => entry.conflictOfLessonId === "shared-conflict"));
  report.cdup = { equivalent: same.length, conflicting: conflict.length };
}

// H/I/J/K: canonical, alias, unknown, item, and organization resolution.
{
  const scopedItem = item("knowledge-a", [lesson("lesson-a", { aliasLessonIds: ["lesson-b"] })]);
  assert.equal(resolveLessonIdForItem(scopedItem, "lesson-a"), "lesson-a");
  assert.equal(resolveLessonIdForItem(scopedItem, "lesson-b"), "lesson-a");
  assert.equal(resolveLessonIdForItem(scopedItem, "missing"), null);
  assert.equal(resolveLessonId("org-a", "knowledge-a", "lesson-b", [scopedItem]), "lesson-a");
  assert.equal(resolveLessonId("org-a", "other-item", "lesson-b", [scopedItem]), null);
  assert.equal(resolveLessonId("org-b", "knowledge-a", "lesson-b", [scopedItem]), null);
  report.resolution = { canonical: "lesson-a", alias: "lesson-a", unknown: null, crossItem: null, crossOrg: null };
}

// M: unsafe alias collision preserves both lessons.
{
  const collision = dedupeLessonCollection([
    lesson("collision-a", { aliasLessonIds: ["unrelated-canonical"] }),
    lesson("collision-b", { createdAt: LATER }),
    lesson("unrelated-canonical", { solution: "A materially different workflow." })
  ]);
  assert.equal(collision.length, 3);
  report.collision = { preservedLessonIds: collision.map((entry) => entry.id) };
}

// N: two equivalent proposals against the same persisted state converge without aliases.
{
  const persisted = [lesson("lesson-a")];
  const proposalA = [...persisted, lesson("proposal-a", { sourceTicketId: "ticket-a2" })];
  const proposalB = [...persisted, lesson("proposal-b", { sourceTicketId: "ticket-b2" })];
  const afterA = dedupeNewLessonProposals(persisted, proposalA);
  const afterB = dedupeNewLessonProposals(persisted, proposalB);
  assert.equal(afterA.length, 1);
  assert.equal(afterB.length, 1);
  assert.equal(afterA[0].id, "lesson-a");
  assert.equal(afterB[0].id, "lesson-a");
  report.concurrentProposals = { afterA: afterA.map((entry) => entry.id), afterB: afterB.map((entry) => entry.id) };
}

// O: historical payloads remain byte-for-byte unchanged while current lookup resolves aliases.
{
  const historicalTicket = { memoryMatch: { knowledgeId: "knowledge-a", lessonId: "lesson-b" } };
  const historicalMemory = { afterState: { lessons: [lesson("lesson-b")] } };
  const historicalCandidate = { proposedContent: { lessons: [lesson("lesson-b")] } };
  const ticketBefore = JSON.stringify(historicalTicket);
  const memoryBefore = JSON.stringify(historicalMemory);
  const candidateBefore = JSON.stringify(historicalCandidate);
  const current = item("knowledge-a", [lesson("lesson-a", { aliasLessonIds: ["lesson-b"] })]);
  assert.equal(resolveLessonIdForItem(current, historicalTicket.memoryMatch.lessonId), "lesson-a");
  assert.equal(JSON.stringify(historicalTicket), ticketBefore);
  assert.equal(JSON.stringify(historicalMemory), memoryBefore);
  assert.equal(JSON.stringify(historicalCandidate), candidateBefore);
  report.immutability = { ticketUnchanged: true, memoryUnchanged: true, candidateUnchanged: true };
}

assert.equal(lessonContentFingerprint(lesson("x")), lessonContentFingerprint(lesson("y")));
console.log("TODO-016 content deduplication probe passed.");
console.log(JSON.stringify(report, null, 2));
