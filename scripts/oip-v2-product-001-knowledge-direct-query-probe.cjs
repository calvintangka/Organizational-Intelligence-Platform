/*
 * PRODUCT-001 read-only Knowledge direct-query regression.
 *
 * The probe loads the existing organization-scoped corpus and exercises the
 * pure raw-situation adapter. It never submits a Ticket or writes persistence.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness();
const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { queryOrganizationalMemory } = require(path.join(root, "lib", "knowledgeQuery.ts"));

const MERIDIAN = "org-2114cd96-cb5f-4905-b445-6e22f24fc361";
const COMPARISON_TENANT = "profile-maesa-tech";

function topTitle(result) {
  return result.matches[0]?.item.title ?? null;
}

async function main() {
  const profile = await persistence.getOrganizationProfile(MERIDIAN);
  const beforeItems = await persistence.loadKnowledge(MERIDIAN);
  assert.ok(beforeItems.length > 0, "The Meridian corpus must contain validated Memory.");

  const known = queryOrganizationalMemory(
    "An employee can sign in but lost access to the regional dispatch roster after being reassigned.",
    profile,
    beforeItems
  );
  assert.equal(known.state, "relevant", "A known operational situation should produce a relevant terminal state.");
  assert.ok(known.matches.some((match) => match.item.title === "Dispatch roster access restored after regional group assignment"), "Known situation did not return the expected Memory.");

  const natural = queryOrganizationalMemory(
    "Someone moved to another team and can still log in, but they cannot see the dispatch roster anymore.",
    profile,
    beforeItems
  );
  assert.ok(natural.matches.some((match) => match.item.title === "Dispatch roster access restored after regional group assignment"), "Natural paraphrase missed the expected Memory.");

  const question = queryOrganizationalMemory(
    "Have we dealt with employees losing roster access after changing teams?",
    profile,
    beforeItems
  );
  assert.ok(question.matches.some((match) => match.item.title === "Dispatch roster access restored after regional group assignment"), "Question phrasing missed the expected Memory.");

  const ambiguous = queryOrganizationalMemory(
    "A dispatch worker can authenticate after a team change, but a regional roster or queue is missing.",
    profile,
    beforeItems
  );
  assert.ok(ambiguous.matches.length >= 2 || ambiguous.state === "weak", "Ambiguous situation should retain competing candidates or be cautious.");

  const unrelated = queryOrganizationalMemory(
    "The office coffee machine is leaking and facilities needs a replacement part.",
    profile,
    beforeItems
  );
  assert.equal(unrelated.state, "no_match", "Unrelated situation produced a false positive.");
  assert.equal(unrelated.matches.length, 0, "Unrelated situation returned a Memory candidate.");

  const weak = queryOrganizationalMemory(
    "A dispatch tablet shows an old roster after a firmware update on one device.",
    profile,
    beforeItems
  );
  assert.ok(weak.state === "weak" || weak.state === "no_match", "Weak similarity must remain cautious.");

  const currentOriginal = beforeItems.find((item) => item.title === "Dispatch roster access restored after regional group assignment");
  assert.ok(currentOriginal, "Current Memory projection fixture is required.");
  const projectedOriginal = known.matches.find((match) => match.item.title === currentOriginal.title);
  assert.ok(projectedOriginal, "Query result did not return the current Memory projection.");
  assert.equal(projectedOriginal.item.revision, currentOriginal.revision, "Query result did not use current Memory revision.");
  assert.equal(projectedOriginal.item.trustScore, currentOriginal.trustScore, "Query result did not use current Memory trust.");
  assert.equal(projectedOriginal.item.scopeNote, currentOriginal.scopeNote, "Query result did not use current Memory scope.");
  assert.equal(projectedOriginal.item.provenance?.validatedBy, currentOriginal.provenance?.validatedBy, "Query result lost validator provenance.");

  const afterItems = await persistence.loadKnowledge(MERIDIAN);
  assert.deepEqual(afterItems, beforeItems, "Knowledge query changed the Memory projection.");
  assert.equal(profile.id, MERIDIAN, "Query profile must remain bound to the active organization.");

  const comparisonItems = await persistence.loadKnowledge(COMPARISON_TENANT);
  assert.ok(comparisonItems.every((item) => item.organizationId === COMPARISON_TENANT), "Comparison tenant contains an out-of-scope Memory.");
  assert.ok(comparisonItems.every((item) => !item.title.includes("Dispatch roster access restored after regional group assignment")), "Comparison tenant exposed Meridian Memory.");

  console.log(JSON.stringify({
    contract: "Natural-language situation -> Organizational Memory retrieval",
    known: { state: known.state, title: topTitle(known), candidates: known.matches.length },
    natural: { state: natural.state, title: topTitle(natural), candidates: natural.matches.length },
    question: { state: question.state, title: topTitle(question), candidates: question.matches.length },
    ambiguous: { state: ambiguous.state, candidates: ambiguous.matches.length },
    unrelated: { state: unrelated.state, candidates: unrelated.matches.length },
    weak: { state: weak.state, candidates: weak.matches.length },
    currentProjection: "PASS",
    queryMutationAudit: "PASS",
    tenantIsolation: "PASS"
  }, null, 2));
  console.log("OIP-V2-PRODUCT-001 Knowledge direct-query regression passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
