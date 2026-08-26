/* OIP-V2-FIX-005 deterministic near-duplicate selection probe. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });
const { retrieveMemory, compareKnowledgeMatches, explainKnowledgeMatchComparison } = require(path.join(root, "lib", "memory.ts"));
const { selectPreferredMatch } = require(path.join(root, "lib", "lessonSelection.ts"));

const EVENT_B = "At another warehouse, handheld inventory scanners periodically stop synchronizing while employees move between scanning zones. Inventory backend services remain healthy.";

function understanding(text = EVENT_B) {
  return {
    ticketId: "OIP-V2-FIX-005-EVENT-B",
    originalText: text,
    summary: text,
    coreProblem: text,
    category: "Uncategorized",
    intent: "operational_support",
    urgency: "medium",
    tags: [],
    detectedSignals: [],
    retrievalText: text,
    intentIsolation: {
      version: 1,
      retrievalText: text,
      activeProblemText: text,
      currentRequestText: text,
      requestedOutcome: "restore scanner synchronization",
      ignoredTopics: [],
      negatedTopics: [],
      temporalState: "current",
      contradictions: [],
      contradictionDetected: false,
      securityIntent: { detected: false, severity: "none", reasons: [], escalationRequired: false },
      sentences: [],
      intentHierarchy: []
    }
  };
}

const lesson = {
  id: "fix-005-wifi-lesson",
  title: "Wi-Fi roaming scanner synchronization",
  rootCause: "Handheld scanners stop synchronizing during Wi-Fi roaming transitions while the inventory backend remains healthy.",
  solution: "Configure the affected scanner network profile to prevent problematic roaming.",
  customerResponse: "The scanner network profile was corrected and synchronization succeeded.",
  signals: ["handheld scanners", "inventory synchronization", "Wi-Fi roaming", "network bands", "backend healthy"],
  createdAt: "2026-08-24T16:15:00.000Z",
  sourceTicketId: "fix-005-event-a"
};

function item(id, overrides = {}) {
  return {
    id,
    title: "Unrelated memory",
    problem: "Unrelated problem",
    approvedAnswer: "Human review required.",
    category: "OPERATIONAL_EVENT",
    tags: ["warehouse", "scanner", "inventory", "synchronization"],
    sourceTicketId: id,
    timesReused: 0,
    timesSeen: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    approvedAt: "2026-08-01T00:00:00.000Z",
    lifecycleState: "active",
    governanceState: "trusted",
    trustScore: 20,
    autoResponseEligible: false,
    ...overrides
  };
}

function fixture() {
  const specific = {
    title: "Warehouse handheld scanner roaming synchronization",
    canonicalProblemTitle: "Warehouse handheld scanner roaming synchronization",
    problem: "Handheld barcode scanners intermittently fail to synchronize inventory after devices transition between Wi-Fi network bands during active scanning sessions.",
    problemSummary: "Specific scanner synchronization failures during Wi-Fi roaming transitions with a healthy inventory backend.",
    lessons: [lesson],
    resolutionWorkflow: ["Confirm scanner hardware is functioning.", "Confirm inventory backend is operational.", "Isolate Wi-Fi roaming transition.", "Configure the affected network profile.", "Confirm subsequent synchronization succeeds."],
    validation: { status: "validated", validatedAt: "2026-08-26T11:00:00.000Z", validatedBy: "FIX-005", validationBasis: "fixture", validationScope: "domain-neutral" },
    provenance: { sourceTicketId: "fix-005-event-a", createdBy: "FIX-005", createdAt: "2026-08-26T11:00:00.000Z", validatedBy: "FIX-005", validatedAt: "2026-08-26T11:00:00.000Z", validationBasis: "fixture", validationScope: "domain-neutral" }
  };
  return [
    item("fix-005-memory-a", { ...specific, canonicalProblemId: "fix-005-canonical-a", title: "Fresh specific Wi-Fi roaming scanner lesson", canonicalProblemTitle: "Fresh specific Wi-Fi roaming scanner lesson", createdAt: "2026-08-26T11:30:00.000Z", approvedAt: "2026-08-26T11:30:00.000Z", validation: { ...specific.validation, validatedAt: "2026-08-26T11:30:00.000Z" }, provenance: { ...specific.provenance, sourceTicketId: "fix-005-event-a", validatedAt: "2026-08-26T11:30:00.000Z" }, trustScore: 20 }),
    item("fix-005-memory-b", { ...specific, canonicalProblemId: "fix-005-canonical-b", title: "Historical near-duplicate Wi-Fi roaming scanner lesson", canonicalProblemTitle: "Historical near-duplicate Wi-Fi roaming scanner lesson", createdAt: "2026-08-20T11:30:00.000Z", approvedAt: "2026-08-20T11:30:00.000Z", validation: { ...specific.validation, validatedAt: "2026-08-20T11:30:00.000Z" }, provenance: { ...specific.provenance, sourceTicketId: "fix-005-event-b", validatedAt: "2026-08-20T11:30:00.000Z" }, trustScore: 95 }),
    item("fix-005-memory-c", { title: "Broad scanner synchronization", canonicalProblemTitle: "Broad scanner synchronization", problem: "Warehouse scanners sometimes stop synchronizing inventory.", problemSummary: "Broad scanner synchronization symptoms.", lessons: [{ ...lesson, id: "fix-005-broad-lesson", rootCause: "Warehouse scanners stopped synchronizing inventory.", solution: "Reconnect the scanner.", signals: ["scanner", "inventory synchronization"] }], resolutionWorkflow: ["Reconnect the scanner."], trustScore: 80 }),
    item("fix-005-memory-d", { title: "Inventory backend outage", canonicalProblemTitle: "Inventory backend outage", problem: "An inventory backend outage caused every scanner to stop synchronizing.", problemSummary: "Scanner synchronization stops when backend services are down.", lessons: [{ ...lesson, id: "fix-005-outage-lesson", rootCause: "Inventory backend outage.", solution: "Restore backend service.", signals: ["backend outage", "scanner synchronization"] }], resolutionWorkflow: ["Restore backend service."], trustScore: 100 }),
    item("fix-005-memory-e", { title: "Expired scanner certificate", canonicalProblemTitle: "Expired scanner certificate", problem: "Expired device authentication certificates prevent scanner synchronization.", problemSummary: "Authentication certificate failures prevent device synchronization.", tags: ["scanner", "synchronization", "certificate"], lessons: [{ ...lesson, id: "fix-005-cert-lesson", title: "Expired device certificate", rootCause: "Expired device certificate.", solution: "Renew the device certificate.", signals: ["certificate", "authentication"] }], resolutionWorkflow: ["Renew the certificate."], trustScore: 100 }),
    item("fix-005-memory-f", { title: "High-trust broad scanner memory", canonicalProblemTitle: "High-trust broad scanner memory", problem: "Warehouse scanners intermittently stop synchronizing inventory.", problemSummary: "Scanner synchronization symptoms without a confirmed roaming condition.", lessons: [{ ...lesson, id: "fix-005-high-trust-lesson", rootCause: "Warehouse scanners stopped synchronizing inventory.", solution: "Reconnect the scanner.", signals: ["scanner", "inventory synchronization"] }], resolutionWorkflow: ["Reconnect the scanner."], trustScore: 100, createdAt: "2026-08-26T12:00:00.000Z" })
  ];
}

function rank(items) {
  return retrieveMemory(understanding(), items);
}

function rankText(items, text) {
  return retrieveMemory(understanding(text), items);
}

function printTable(matches) {
  console.log("| Rank | Memory | Compatibility | Scope | Grounding | Reliability | Tie-break reason |");
  console.log("| --- | --- | --- | --- | --- | --- | --- |");
  matches.forEach((match, index) => console.log(`| ${index + 1} | ${match.item.id} | ${match.compatibilityScore} | ${match.selectionEvidence?.scopeApplicability} | ${match.selectionEvidence?.groundingReadiness} | ${match.item.trustScore} | ${match.selectionEvidence?.semanticTieKey ? "semantic fields recorded" : "stable ID fallback"} |`));
}

function main() {
  const candidates = fixture();
  const baseline = rank(candidates);
  assert.equal(baseline[0].item.id, "fix-005-canonical-a", "fresh specific candidate must win the controlled near-duplicate fixture");
  assert.ok(baseline.some((match) => match.item.id === "fix-005-canonical-b"), "historical near-duplicate remains a candidate");
  assert.ok(!baseline.some((match) => match.item.id === "fix-005-memory-d"), "backend outage is hard-incompatible with a healthy backend event");
  assert.ok(!baseline.some((match) => match.item.id === "fix-005-memory-e"), "certificate cause is hard-incompatible with the roaming event");
  const broad = baseline.find((match) => /Broad scanner synchronization$/i.test(match.item.canonicalProblemTitle ?? ""));
  const highTrust = baseline.find((match) => /High-trust broad scanner memory$/i.test(match.item.canonicalProblemTitle ?? ""));
  assert.ok(broad && broad.matchScore < baseline[0].matchScore, "specific condition beats broad similarity");
  assert.ok(highTrust && highTrust.matchScore < baseline[0].matchScore, "high trust does not beat compatibility");

  const permutations = [
    candidates,
    [...candidates].reverse(),
    [candidates[3], candidates[1], candidates[5], candidates[0], candidates[4], candidates[2]],
    [candidates[2], candidates[4], candidates[0], candidates[5], candidates[1], candidates[3]]
  ];
  const winners = permutations.map((ordered) => rank(ordered)[0].item.id);
  assert.deepEqual(winners, winners.map(() => "fix-005-canonical-a"), "candidate ordering must not affect the winner");
  const repeated = Array.from({ length: 5 }, () => rank(candidates)[0].item.id);
  assert.deepEqual(repeated, repeated.map(() => "fix-005-canonical-a"), "repeated retrieval must be stable");

  const a = baseline.find((match) => match.item.id === "fix-005-canonical-a");
  const b = baseline.find((match) => match.item.id === "fix-005-canonical-b");
  assert.equal(explainKnowledgeMatchComparison(a, b), "DETERMINISTIC_EQUIVALENT_TIE_BREAK", "equivalent near-duplicate uses the documented late tie-break");
  assert.ok(compareKnowledgeMatches(a, b) < 0);
  const selected = selectPreferredMatch({ id: "fix-005-event-b", ticketId: "fix-005-event-b", subject: "scanner sync", description: EVENT_B, category: "General", status: "new", createdAt: "2026-08-26T12:00:00.000Z" }, baseline);
  assert.equal(selected.match.item.id, baseline[0].item.id, "selected candidate must equal rank one");
  assert.equal(selected.match.item.id, a.item.id, "grounding selection receives the selected identity");
  assert.equal(selected.lessonMatch?.lesson.id, "fix-005-wifi-lesson", "grounding uses the selected candidate lesson");

  const olderSpecific = rank([
    candidates[0],
    item("fix-005-new-vague", { title: "New vague scanner memory", canonicalProblemTitle: "New vague scanner memory", problem: "Warehouse scanners sometimes stop synchronizing inventory.", problemSummary: "Broad scanner synchronization symptoms.", createdAt: "2026-08-26T13:00:00.000Z", trustScore: 100 })
  ]);
  assert.equal(olderSpecific[0].item.id, "fix-005-canonical-a", "a newer vague candidate cannot win by recency");

  const scoped = { ...candidates[0], id: "fix-005-scoped-memory", canonicalProblemId: "fix-005-scoped-canonical", scopeNote: "Applies to Wi-Fi roaming transitions; does not apply to firmware-specific synchronization defects." };
  const scopeCompatible = rank([scoped]);
  assert.equal(scopeCompatible.length, 1, "scope-compatible Event B remains retrievable");
  const eventD = "Another warehouse reports scanner synchronization failures on the same firmware generation associated with the previously identified firmware-specific synchronization defect. Backend services remain healthy.";
  assert.equal(rankText([scoped], eventD).length, 0, "firmware-specific Event D remains fail-closed after scope narrowing");

  printTable(baseline);
  console.log(JSON.stringify({ probe: "probe:oip-v2-fix-005", eventB: EVENT_B, winner: baseline[0].item.id, candidateCount: baseline.length, orderingIndependent: true, repeatedRetrievalStable: true, equivalentTie: explainKnowledgeMatchComparison(a, b), selectedIdentity: selected.match.item.id, groundingIdentity: selected.match.item.id, stableFallback: "validation chronology within semantic equivalence, then canonical ID" }, null, 2));
  console.log("OIP_V2_FIX_005_FOCUSED_PROBE: PASS");
}

main();
