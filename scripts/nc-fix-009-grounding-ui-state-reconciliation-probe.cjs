/*
 * NC-FIX-009 permanent presentation-state regression probe.
 *
 * This intentionally exercises the UI grounding contract without touching
 * PostgreSQL: provider output is not grounding evidence, while an approved
 * KnowledgeItem id (or the explicit organization-profile path) is.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness({ loadEnv: false });
const { reconcileGroundingForPresentation } = require(path.join(root, "lib", "groundingPresentation.ts"));

function response(overrides = {}) {
  return {
    ticketId: "nc-fix-009-ticket",
    draftResponse: "A reviewed response.",
    basedOnKnowledgeIds: [],
    confidenceNote: "Human review required.",
    source: "ai_advisory",
    draftMode: "cold_start",
    groundingLabel: "no organizational knowledge",
    ...overrides
  };
}

const checks = [];
function check(name, fn) {
  try {
    fn();
    checks.push({ name, passed: true });
  } catch (error) {
    checks.push({ name, passed: false, message: error.message });
  }
}

check("cold-start follow-up cannot claim organizational memory", () => {
  const reconciled = reconcileGroundingForPresentation(response({
    draftMode: "memory_grounded",
    groundingLabel: "conversation context"
  }));
  assert.equal(reconciled.draftMode, "cold_start");
  assert.equal(reconciled.groundingLabel, "no organizational knowledge");
  assert.deepEqual(reconciled.basedOnKnowledgeIds, []);
});

check("missing grounding id cannot claim a validated lesson", () => {
  const reconciled = reconcileGroundingForPresentation(response({
    draftMode: "lesson_grounded",
    groundingLabel: "Mobile Clock-In lesson"
  }));
  assert.equal(reconciled.draftMode, "cold_start");
  assert.equal(reconciled.groundingLabel, "no organizational knowledge");
});

check("selected organizational memory remains grounded", () => {
  const reconciled = reconcileGroundingForPresentation(response({
    basedOnKnowledgeIds: ["knowledge-nc-fix-009"],
    draftMode: "memory_grounded",
    groundingLabel: "Mobile Clock-In"
  }));
  assert.equal(reconciled.draftMode, "memory_grounded");
  assert.equal(reconciled.groundingLabel, "Mobile Clock-In");
});

check("selected validated lesson remains grounded", () => {
  const reconciled = reconcileGroundingForPresentation(response({
    basedOnKnowledgeIds: ["knowledge-nc-fix-009"],
    draftMode: "lesson_grounded",
    groundingLabel: "Mobile Clock-In lesson"
  }));
  assert.equal(reconciled.draftMode, "lesson_grounded");
});

check("organization profile remains the explicit non-KnowledgeItem grounding path", () => {
  const reconciled = reconcileGroundingForPresentation(response({
    draftMode: "memory_grounded",
    groundingLabel: "organization profile"
  }));
  assert.equal(reconciled.draftMode, "memory_grounded");
  assert.equal(reconciled.groundingLabel, "organization profile");
});

check("cold-start state is stable when already truthful", () => {
  const original = response();
  assert.deepEqual(reconcileGroundingForPresentation(original), original);
});

const failed = checks.filter((check) => !check.passed);
const result = {
  probe: "NC-FIX-009",
  assertions: checks.length,
  passed: checks.filter((check) => check.passed).length,
  failed: failed.length,
  checks,
  cleanup: { performed: true, databaseWrites: 0, residualRows: 0 }
};
console.log(JSON.stringify(result, null, 2));
if (failed.length > 0) process.exitCode = 1;
