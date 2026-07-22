/* TODO-043 — disposable provenance-origin regression. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness({ loadEnv: false });

const { createCanonicalProblem, mergeIntoCanonicalProblem, mergeLessonIntoExisting } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { withStableValidationProvenance, ticketReferenceId } = require(path.join(root, "lib", "knowledgeProvenance.ts"));
const { recordResolution } = require(path.join(root, "lib", "trustEngine.ts"));
const { defaultOrganizationProfile } = require(path.join(root, "data", "seedOrganizationProfiles.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));

function ticket(id, ticketId, text) {
  return {
    id,
    ticketId,
    customerName: "TODO-043 disposable",
    subject: text,
    description: text,
    category: "General",
    status: "new",
    createdAt: "2026-07-22T00:00:00.000Z"
  };
}

function validate(item, sourceTicketIds, suffix) {
  return withStableValidationProvenance(item, sourceTicketIds, {
    actor: "TODO-043 validator",
    timestamp: `2026-07-22T00:00:0${suffix}.000Z`,
    rationale: "Disposable provenance regression"
  });
}

function main() {
  const a = ticket("ticket-custom-A", "OIP-TEST-0001", "A canonical issue is created from Ticket A.");
  const b = ticket("ticket-custom-B", "OIP-TEST-0002", "Ticket B repeats the canonical issue and adds evidence.");
  const c = ticket("ticket-custom-C", "OIP-TEST-0003", "Ticket C contributes a validated lesson and reuse evidence.");
  const d = ticket("ticket-custom-D", "OIP-TEST-0004", "Ticket D contributes another validated lesson and trust update.");
  assert.equal(ticketReferenceId(a), "OIP-TEST-0001");

  let item = createCanonicalProblem(a, understandForProfile(a, defaultOrganizationProfile), "Initial response", defaultOrganizationProfile, "2026-07-22T00:00:01.000Z");
  assert.equal(item.sourceTicketId, "OIP-TEST-0001");
  item = validate(item, [ticketReferenceId(a)], 1);
  assert.equal(item.provenance.sourceTicketId, "OIP-TEST-0001");

  // Simulate the stale client payload that caused TODO-043: the durable
  // top-level origin is still A, while the incoming content provenance claims
  // a later UI-only identifier. The server-side guard must prefer stored A.
  const staleClientPayload = {
    ...item,
    provenance: { ...item.provenance, sourceTicketId: "ticket-custom-B", contributingTicketIds: ["ticket-custom-B"] }
  };
  const guarded = withStableValidationProvenance(
    staleClientPayload,
    ["ticket-custom-B"],
    { actor: "TODO-043 validator", timestamp: "2026-07-22T00:00:01.500Z", rationale: "Stale client simulation" },
    item
  );
  assert.equal(guarded.sourceTicketId, "OIP-TEST-0001");
  assert.equal(guarded.provenance.sourceTicketId, "OIP-TEST-0001");

  item = mergeIntoCanonicalProblem(item, b, understandForProfile(b, defaultOrganizationProfile), undefined, "human", "2026-07-22T00:00:02.000Z");
  item = validate(item, [ticketReferenceId(b)], 2);
  assert.equal(item.sourceTicketId, "OIP-TEST-0001");
  assert.equal(item.provenance.sourceTicketId, "OIP-TEST-0001");
  assert.ok(item.provenance.contributingTicketIds.includes("OIP-TEST-0002"));
  assert.ok(item.exampleTickets.some((example) => example.ticketId === "OIP-TEST-0002"));

  const lesson = {
    id: "todo043-lesson-c",
    rootCause: "Ticket C adds a validated supporting lesson.",
    solution: "Use the scoped diagnostic steps.",
    customerResponse: "Hello {{customerName}}, we will verify the issue.",
    signals: ["canonical issue", "supporting lesson"],
    createdAt: "2026-07-22T00:00:03.000Z",
    sourceTicketId: ticketReferenceId(c)
  };
  item = { ...item, lessons: mergeLessonIntoExisting(item.lessons ?? [], lesson, item.canonicalProblemId ?? item.id).lessons };
  item = validate(item, [ticketReferenceId(c)], 3);
  item = recordResolution(item, { mode: "human", success: true, at: "2026-07-22T00:00:04.000Z" }, defaultOrganizationProfile, []).item;
  item = validate(item, [ticketReferenceId(d)], 4);

  assert.equal(item.sourceTicketId, "OIP-TEST-0001");
  assert.equal(item.provenance.sourceTicketId, "OIP-TEST-0001");
  for (const id of ["OIP-TEST-0001", "OIP-TEST-0002", "OIP-TEST-0003", "OIP-TEST-0004"]) {
    assert.ok(item.provenance.contributingTicketIds.includes(id), `Missing supporting provenance ${id}`);
  }
  assert.ok(item.lessons.some((candidate) => candidate.sourceTicketId === "OIP-TEST-0003"));
  console.log("PASS canonical origin remains Ticket A through merge, lesson, reuse, and trust updates");
  console.log(JSON.stringify({
    sourceTicketId: item.sourceTicketId,
    provenanceSourceTicketId: item.provenance.sourceTicketId,
    contributingTicketIds: item.provenance.contributingTicketIds,
    supportingExamples: item.exampleTickets.map((example) => example.ticketId),
    lessonSources: item.lessons.map((candidate) => candidate.sourceTicketId)
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
