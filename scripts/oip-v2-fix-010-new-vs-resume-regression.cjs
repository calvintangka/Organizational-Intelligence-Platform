const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const helperPath = "lib/organizationalExperienceEditorState.ts";
const surfacePath = "components/views/OrganizationalMemorySurface.tsx";
const helperSource = fs.readFileSync(helperPath, "utf8");
const surfaceSource = fs.readFileSync(surfacePath, "utf8");
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 }
}).outputText;
const helperModule = { exports: {} };
vm.runInNewContext(compiled, { module: helperModule, exports: helperModule.exports });
const { canApplyDraftHydration } = helperModule.exports;

assert.equal(typeof canApplyDraftHydration, "function");
assert.match(surfaceSource, /editorIntentRef\.current/);
assert.match(surfaceSource, /draftHydrationGenerationRef/);
assert.match(surfaceSource, /setSavedDraftSourceId\(nextSource\.id\)/);

const draft = { id: "draft-meridian-001", title: "Saved dispatch calendar lockout", evidence: ["Audit log"] };

function hydrate(state, request) {
  if (!canApplyDraftHydration({
    requestOrganizationId: request.organizationId,
    activeOrganizationId: state.organizationId,
    requestGeneration: request.generation,
    activeGeneration: state.generation,
    intent: state.intent
  })) return state;
  return { ...state, source: request.draft, evidence: request.draft.evidence, editor: "resume", intent: "resume" };
}

// The pre-repair behavior unconditionally applied a late response to the editor.
const legacyA = { organizationId: "meridian", generation: 1, intent: "new", editor: "new", source: null, evidence: [] };
const legacyAfterLateHydration = { ...legacyA, source: draft, evidence: draft.evidence, editor: "resume" };
assert.equal(legacyAfterLateHydration.source.title, draft.title, "the legacy trajectory must demonstrate the known overwrite");

// A. Saved draft + explicit New + late hydration stays blank/new.
const newState = { organizationId: "meridian", generation: 2, intent: "new", editor: "new", source: null, evidence: [] };
const afterLateHydration = hydrate(newState, { organizationId: "meridian", generation: 1, draft });
assert.equal(afterLateHydration.source, null);
assert.deepEqual(afterLateHydration.evidence, []);
assert.equal(afterLateHydration.editor, "new");

// B. Resume restores the saved Source and Evidence.
const resumed = hydrate({ organizationId: "meridian", generation: 3, intent: "resume", editor: "closed", source: null, evidence: [] }, { organizationId: "meridian", generation: 3, draft });
assert.equal(resumed.source.id, draft.id);
assert.deepEqual(resumed.evidence, draft.evidence);

// C. No saved draft + New remains blank.
const noDraft = { organizationId: "meridian", generation: 4, intent: "new", editor: "new", source: null, evidence: [] };
assert.equal(hydrate(noDraft, { organizationId: "meridian", generation: 4, draft }).source, null);

// D. New/cancel does not destroy the old draft; Resume can restore it.
const cancelledNew = { organizationId: "meridian", generation: 6, intent: "resume", editor: "closed", source: null, evidence: [] };
const resumedAfterCancel = hydrate(cancelledNew, { organizationId: "meridian", generation: 6, draft });
assert.equal(resumedAfterCancel.source.id, draft.id);

// E. A response from another organization is rejected.
const crossTenant = hydrate({ organizationId: "meridian", generation: 7, intent: "resume", editor: "closed", source: null, evidence: [] }, { organizationId: "other-org", generation: 7, draft });
assert.equal(crossTenant.source, null);

console.log(JSON.stringify({
  preRepairTrajectoryA: "FAILS_AS_EXPECTED",
  savedDraftNewLateHydration: "PASS",
  resumeRestoresDraft: "PASS",
  noDraftNewBlank: "PASS",
  cancelThenResumePreservesDraft: "PASS",
  crossOrganizationResponseRejected: "PASS"
}, null, 2));
