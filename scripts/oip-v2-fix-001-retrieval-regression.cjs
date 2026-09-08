/*
 * OIP-V2-FIX-001 read-only retrieval regression.
 *
 * Loads the existing Meridian Field Operations corpus and exercises the real
 * deterministic retrieval and ticket application pipeline in memory. The
 * persistence stub only records transient TicketRecords; no database write is
 * performed. The database reads are limited to the existing organization,
 * one comparison tenant, and their current knowledge projections.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { understandForProfile, routeBusinessInquiryUnderstanding } = require(path.join(root, "lib", "analyzer.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const { isRetrievalCandidateEligible } = require(path.join(root, "lib", "drafting.ts"));
const { selectPreferredMatch } = require(path.join(root, "lib", "lessonSelection.ts"));
const { processTicket } = require(path.join(root, "lib", "application", "tickets", "processTicket.ts"));
const { createAIAdapter } = require(path.join(root, "lib", "ai", "adapter.ts"));

const fixture = JSON.parse(fs.readFileSync(path.join(root, "scripts", "fixtures", "oip-v2-fix-001-retrieval-fixtures.json"), "utf8"));
const MERIDIAN = "org-2114cd96-cb5f-4905-b445-6e22f24fc361";
const COMPARISON_TENANT = "profile-maesa-tech";

function ticket(definition) {
  const description = definition.description || definition.subject || "";
  const subject = definition.subject?.trim() || (description.length > 80 ? `${description.slice(0, 80)}…` : description);
  return {
    id: `fix001-${definition.id}`,
    ticketId: `fix001-${definition.id}`,
    customerName: "FIX-001 Read-only Regression",
    subject,
    description,
    category: "General",
    status: "new",
    createdAt: "2026-09-07T00:00:00.000Z"
  };
}

function deterministicRetrieval(definition, profile, items) {
  const input = ticket(definition);
  const understanding = understandForProfile(input, profile);
  const rawMatches = retrieveMemory(understanding, items, new Set());
  const eligible = rawMatches.filter((match) => isRetrievalCandidateEligible(understanding, match.item, input));
  const selected = selectPreferredMatch(input, eligible);
  return { input, understanding, rawMatches, eligible, selected };
}

function memoryTitle(result) {
  return result.selected?.match?.item.title ?? null;
}

function transientPorts(organizationId, requestId) {
  const records = [];
  const context = { organizationId, actorContext: { id: "fix-001-qa", name: "FIX-001 QA" }, authority: "server", requestId };
  return {
    records,
    persistence: {
      context,
      generateTicketId: async () => requestId,
      saveTicketRecord: async (record) => { records.push(record); },
      loadTicketRecords: async () => records,
      loadKnowledgeHistory: async () => ({ validationRecords: [], memoryChangeRecords: [] })
    }
  };
}

async function applicationResult(definition, profile, items, ai) {
  const requestId = `fix001-${definition.id}`;
  const ports = transientPorts(profile.id, requestId);
  const result = await processTicket({
    organizationId: profile.id,
    organizationProfile: profile,
    actorContext: { id: "fix-001-qa", name: "FIX-001 QA" },
    authority: "server",
    requestId,
    ticketInput: {
      ...(definition.subject ? { subject: definition.subject } : {}),
      description: definition.description || definition.subject,
      customerName: "FIX-001 Read-only Regression"
    },
    processingOptions: { knowledgeItems: items, aiAdapter: ai }
  }, { persistence: ports.persistence, ai });
  return { result, records: ports.records };
}

async function main() {
  const profile = await persistence.getOrganizationProfile(MERIDIAN);
  const items = await persistence.loadKnowledge(MERIDIAN);
  assert.ok(items.length >= 7, `Expected the existing Meridian corpus, got ${items.length}.`);
  const titles = new Set(items.map((item) => item.title));
  for (const definition of fixture.exactTitle) assert.ok(titles.has(definition.expectedTitle), `Missing exact-title fixture Memory: ${definition.expectedTitle}`);

  const exactResults = fixture.exactTitle.map((definition) => {
    const result = deterministicRetrieval(definition, profile, items);
    assert.ok(result.rawMatches.some((match) => match.item.title === definition.expectedTitle), `Exact title did not enter candidate set: ${definition.id}`);
    assert.equal(memoryTitle(result), definition.expectedTitle, `Exact title was not selected: ${definition.id}`);
    return { id: definition.id, title: memoryTitle(result), category: result.understanding.category, candidateCount: result.rawMatches.length };
  });

  const naturalResults = fixture.naturalRelevant.map((definition) => {
    const result = deterministicRetrieval(definition, profile, items);
    assert.ok(result.rawMatches.some((match) => match.item.title === definition.expectedTitle), `Natural case missed candidate set: ${definition.id}`);
    assert.equal(memoryTitle(result), definition.expectedTitle, `Natural case selected the wrong Memory: ${definition.id}`);
    return { id: definition.id, title: memoryTitle(result), candidateCount: result.rawMatches.length };
  });

  const ai = createAIAdapter({ mode: "disabled", baseUrl: "", model: "disabled", timeoutMs: 1, proxyPath: "" });
  const routedExact = await applicationResult(fixture.exactTitle[0], profile, items, ai);
  assert.equal(routedExact.result.businessIntent?.inquiryType, "business_inquiry", "Profile-style exact query did not exercise the routing boundary.");
  assert.equal(routedExact.result.memoryMatch?.item.title, fixture.exactTitle[0].expectedTitle, "Profile-style exact query lost its operational Memory in the application pipeline.");
  assert.equal(routedExact.result.persistedTicket.memoryMatch?.knowledgeId, routedExact.result.memoryMatch.item.id, "Persisted ticket candidate identity diverged from the selected Memory.");

  const browserB1Definition = fixture.naturalRelevant.find((item) => item.id === "browser-b1-lockout");
  const browserB1 = await applicationResult(browserB1Definition, profile, items, ai);
  assert.equal(browserB1.result.memoryMatch?.item.title, browserB1Definition.expectedTitle, "Browser B1 lockout phrasing lost its Memory in the application pipeline.");
  const browserB3Definition = fixture.naturalRelevant.find((item) => item.id === "browser-b3-technician-region");
  const browserB3 = await applicationResult(browserB3Definition, profile, items, ai);
  assert.equal(browserB3.result.memoryMatch?.item.title, browserB3Definition.expectedTitle, "Browser B3 technician-region phrasing lost its Memory in the application pipeline.");

  const ambiguity = await applicationResult(fixture.ambiguous, profile, items, ai);
  assert.ok((ambiguity.result.similarKnowledge?.length ?? 0) >= 2, "Ambiguous access case did not retain competing candidates for review.");
  assert.equal(ambiguity.result.draft.source, "no_template", "Ambiguous access case authorized a grounded draft.");
  assert.equal(ambiguity.result.draft.basedOnKnowledgeIds.length, 0, "Ambiguous access case authorized Memory reuse.");

  const negativeResults = [];
  for (const definition of fixture.negativeControls) {
    const outcome = await applicationResult(definition, profile, items, ai);
    assert.equal(outcome.result.memoryMatch, null, `Negative control selected a Memory: ${definition.id}`);
    assert.equal(outcome.result.draft.basedOnKnowledgeIds.length, 0, `Negative control authorized reuse: ${definition.id}`);
    negativeResults.push({ id: definition.id, memoryMatch: null, draftSource: outcome.result.draft.source });
  }

  const original = items.find((item) => item.title === "Dispatch roster access restored after regional group assignment");
  assert.ok(original, "Original evolved Memory is required for revision regression.");
  assert.equal(original.revision, 5, "The existing evolved Memory no longer exposes its current revision.");
  assert.equal(original.governanceState, "trusted");
  assert.match(original.scopeNote ?? "", /Excludes expired temporary assignments and authentication failures/i);
  const originalResult = deterministicRetrieval(fixture.naturalRelevant.find((item) => item.id === "natural-original-roster"), profile, items);
  assert.equal(memoryTitle(originalResult), original.title);
  assert.equal(originalResult.selected.match.item.revision, 5);
  const lockoutResult = deterministicRetrieval(fixture.naturalRelevant.find((item) => item.id === "natural-lockout"), profile, items);
  assert.equal(memoryTitle(lockoutResult), "Account lockout blocks portal authentication");
  assert.ok(lockoutResult.rawMatches.findIndex((match) => match.item.title === "Account lockout blocks portal authentication") < lockoutResult.rawMatches.findIndex((match) => match.item.title === original.title));

  for (const match of [...exactResults, ...naturalResults].map((entry) => items.find((item) => item.title === entry.title))) {
    assert.ok(match?.sourceTicketId, "Selected Memory is missing its Source provenance.");
    assert.equal(match.provenance?.sourceTicketId, match.sourceTicketId, "Selected Memory provenance is not bound to its Source.");
    assert.equal(match.organizationId, MERIDIAN, "Selected Memory crossed organization scope.");
  }

  const otherTenantItems = await persistence.loadKnowledge(COMPARISON_TENANT);
  assert.ok(otherTenantItems.every((item) => item.organizationId === COMPARISON_TENANT), "Comparison tenant projection contains a cross-tenant Memory.");
  assert.ok(otherTenantItems.every((item) => !titles.has(item.title) || item.organizationId === MERIDIAN), "Comparison tenant exposed a Meridian Memory title.");

  console.log(JSON.stringify({
    corpus: { organizationId: MERIDIAN, memories: items.length, titles: [...titles] },
    exactTitle: { passed: exactResults.length, total: exactResults.length, rows: exactResults },
    naturalRelevant: { passed: naturalResults.length, total: naturalResults.length, rows: naturalResults },
    routing: {
      businessInquiryExactTitleSelected: routedExact.result.memoryMatch.item.title,
      persistedKnowledgeId: routedExact.result.persistedTicket.memoryMatch.knowledgeId,
      browserB1: browserB1.result.memoryMatch.item.title,
      browserB3: browserB3.result.memoryMatch.item.title
    },
    wrongCandidate: { lockoutTop: memoryTitle(lockoutResult), rosterRank: lockoutResult.rawMatches.findIndex((match) => match.item.title === original.title) + 1 },
    ambiguity: { candidateCount: ambiguity.result.similarKnowledge.length, groundedReuseAuthorized: ambiguity.result.draft.basedOnKnowledgeIds.length > 0 },
    negativeControls: { passed: negativeResults.length, total: negativeResults.length, rows: negativeResults },
    currentRevision: { title: original.title, revision: original.revision, scopeRetained: true, governance: original.governanceState },
    tenantIsolation: { passed: true, comparisonTenant: COMPARISON_TENANT },
    provenance: { passed: true, selectedMemories: exactResults.length + naturalResults.length }
  }, null, 2));
  console.log("OIP-V2-FIX-001 retrieval regression passed.");
}

main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
