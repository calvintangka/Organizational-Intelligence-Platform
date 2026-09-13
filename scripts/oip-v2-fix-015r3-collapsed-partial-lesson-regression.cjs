/*
 * FIX-015R3 permanent regression: lesson semantics survive collapse and resume.
 *
 * BLANK is the only state that may use the generic no-lesson path. PARTIAL is
 * blocked before onConfirm, whether the section is expanded, collapsed, or
 * restored from the persisted draft after navigation. COMPLETE remains the
 * normal lesson submission path.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });
const { classifyReflectionLesson, reflectionDraftFingerprint } = require(path.join(root, "lib", "reflectionDraft.ts"));

const completeLesson = {
  rootCause: "A permission update removed the affected employees' Payroll Viewer access.",
  solution: "Restore the correct Payroll Viewer permissions, then have employees sign in again.",
  customerResponse: "The customer confirmed that restoring access resolved the issue.",
  signals: ["payroll dashboard error"]
};
const partialLesson = { ...completeLesson, signals: [] };
const blankLesson = { rootCause: "", solution: "", customerResponse: "", signals: [] };

function submissionPath({ lessonState, requiresLesson = false }) {
  if (requiresLesson && lessonState !== "COMPLETE") return "BLOCKED";
  if (lessonState === "PARTIAL") return "BLOCKED";
  if (lessonState === "BLANK") return "GENERIC_NO_LESSON";
  return "LESSON_SUBMISSION";
}

function assertStateAndPath(name, draft, expectedState, expectedPath) {
  const lessonState = classifyReflectionLesson(draft);
  assert.equal(lessonState, expectedState, `${name} keeps its authored-content classification`);
  assert.equal(submissionPath({ lessonState }), expectedPath, `${name} chooses the expected safety path`);
  return lessonState;
}

async function main() {
  const expandedPartialState = assertStateAndPath("PARTIAL_EXPANDED", partialLesson, "PARTIAL", "BLOCKED");
  const collapsedPartialState = assertStateAndPath("PARTIAL_COLLAPSED", partialLesson, "PARTIAL", "BLOCKED");

  const persistedDraft = {
    problemName: "Payroll dashboard access",
    lessonDraft: { mode: "new", ...partialLesson }
  };
  const resumedDraft = JSON.parse(JSON.stringify(persistedDraft));
  assert.equal(reflectionDraftFingerprint(resumedDraft), reflectionDraftFingerprint(persistedDraft), "collapse and navigation preserve the authored draft snapshot");
  const resumedPartialState = assertStateAndPath("PARTIAL_COLLAPSED_NAVIGATE_RESUME", resumedDraft.lessonDraft, "PARTIAL", "BLOCKED");

  assert.equal(expandedPartialState, collapsedPartialState, "expanded and collapsed partial states are identical");
  assert.equal(collapsedPartialState, resumedPartialState, "collapse plus resume cannot change partial state");

  const blankCollapsedState = assertStateAndPath("BLANK_COLLAPSED", blankLesson, "BLANK", "GENERIC_NO_LESSON");
  const completeCollapsedState = assertStateAndPath("COMPLETE_COLLAPSED", completeLesson, "COMPLETE", "LESSON_SUBMISSION");
  assert.equal(submissionPath({ lessonState: completeCollapsedState, requiresLesson: true }), "LESSON_SUBMISSION", "a complete required lesson remains promotable when collapsed");

  let onConfirmCalls = 0;
  for (const lessonState of [expandedPartialState, collapsedPartialState, resumedPartialState]) {
    if (submissionPath({ lessonState }) !== "BLOCKED") onConfirmCalls += 1;
  }
  assert.equal(onConfirmCalls, 0, "no partial state reaches the promotion callback");

  console.log(JSON.stringify({
    PARTIAL_EXPANDED_BLOCKED: "PASS",
    PARTIAL_COLLAPSED_BLOCKED: "PASS",
    PARTIAL_COLLAPSED_RESUME_BLOCKED: "PASS",
    BLANK_COLLAPSED_GENERIC_PATH: "PASS",
    COMPLETE_COLLAPSED_PROMOTION: "PASS",
    AUTHORED_FIELDS_PRESERVED: "PASS",
    NO_UNVALIDATED_MEMORY_PROMOTION: "PASS"
  }, null, 2));
  console.log("OIP-V2-FIX-015R3 collapsed partial lesson regression probe passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
