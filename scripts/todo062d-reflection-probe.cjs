const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();
const { assessReflectionSafety } = require(path.join(root, "lib", "reflectionSafety.ts"));
const { createOpaqueProvenanceId } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));

const context = {
  customerName: "Ada Lovelace",
  organizationName: "Example Organization",
  sourceTicketId: "OD-20260801-1234",
  sourceTicketText: "Ada Lovelace cannot sign in after replacing the device."
};

const safe = assessReflectionSafety({
  rootCause: "An authenticator enrollment can remain bound to an old device after replacement.",
  solution: "Reset enrollment and require the user to register the authenticator on the new device.",
  customerResponse: "We reset the enrollment so you can register the authenticator on the new device.",
  signals: ["device replacement", "authenticator enrollment"]
}, context);
assert.equal(safe.safe, true, safe.issues.join(", "));

for (const unsafeDraft of [
  { rootCause: "The issue affects Ada Lovelace.", solution: "Use the workaround for now.", customerResponse: "Contact ada@example.com on 2026-08-01.", signals: ["OD-20260801-1234"] },
  { rootCause: "Ada Lovelace cannot sign in after replacing the device.", solution: "Reset the enrollment.", customerResponse: "Reset the enrollment.", signals: ["device replacement"] }
]) {
  const result = assessReflectionSafety(unsafeDraft, context);
  assert.equal(result.safe, false, "unsafe reflection must be rejected");
  assert.ok(result.issues.length > 0, "unsafe reflection must explain the rejection");
}

const opaque = createOpaqueProvenanceId(context.sourceTicketId);
assert.match(opaque, /^evidence-[0-9a-f]{8}$/i);
assert.ok(!opaque.includes(context.sourceTicketId));

console.log("TODO-062D reflection safety probe passed: safe lessons are accepted, unsafe reflections are rejected, and lesson provenance is opaque.");
