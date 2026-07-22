/*
 * TODO-052 — Developer Demo Canonical-Lesson Data Coherence probe.
 *
 * Read-only. Verifies that the reseeded Developer Demo is internally coherent:
 * every persisted lesson's root cause and guidance belong to the canonical it is
 * attached to (structured set-membership model, not fragile string matching),
 * with explicit cross-canonical contamination checks (e.g. no timezone lesson
 * under CSV Encoding) and a cross-domain QA pass over all seven domains.
 *
 * Coherence model: the deterministic generator authors each canonical's own
 * `content.rootCauses` / `content.solutionSteps`. A persisted lesson is coherent
 * iff its root-cause core is one of ITS canonical's authored causes and its
 * solution core is one of ITS canonical's authored solutions. A cause authored
 * for a DIFFERENT canonical appearing here is cross-canonical contamination.
 */
const assert = require("node:assert/strict");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is required."); process.exit(1); }

const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { developerDemoNarrativeArcs } = require(path.join(root, "data", "developer-demo", "narrativeArcs.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const { draftResponse, findMatchingLesson, isCompatibleForDrafting } = require(path.join(root, "lib", "drafting.ts"));
const { assessRootCauseEvidenceState } = require(path.join(root, "lib", "rootCauseSafety.ts"));
const { selectPreferredMatch, withPreDiscriminationLessonMatches } = require(path.join(root, "lib", "lessonSelection.ts"));

const DEMO = "profile-oip-developer-demo";
const lessonRootCore = (rc) => (rc || "").split("; this explains")[0].trim();
const lessonSolutionCore = (s) => (s || "").split(", then verify the result")[0].trim();

function ticket(def) {
  return { id: def.id, ticketId: def.id, customerName: "TODO-052 Probe", subject: def.subject, description: def.description, category: "General", status: "new", createdAt: "2026-07-23T00:00:00.000Z" };
}
function runPipeline(input, profile, items) {
  const understanding = understandForProfile(input, profile);
  const canonical = identifyCanonicalProblem(understanding, profile);
  const rawMatches = retrieveMemory(understanding, items, new Set());
  const matches = withPreDiscriminationLessonMatches(input, understanding, rawMatches, items, canonical.title);
  const compatibleMatches = matches.filter((m) => isCompatibleForDrafting(understanding, m.item, input));
  const selected = compatibleMatches.length ? selectPreferredMatch(input, compatibleMatches) : null;
  const topMatch = selected?.match ?? null;
  const lessonMatch = topMatch ? findMatchingLesson(input, topMatch.item) : null;
  const draft = draftResponse(input, understanding, topMatch, profile, false);
  return { category: understanding.category, canonical: topMatch?.item.id ?? null, lesson: lessonMatch, draft, authorized: draft.basedOnKnowledgeIds.length > 0 };
}

// Part L — cross-domain QA: >=3 representative cases per domain that carry
// problem-specific evidence (the root-cause ordinal) so a coherent lesson is
// selected. Each asserts the selected lesson's cause is coherent with the item.
const QA = [
  // Authentication
  { id: "AU1", item: "demo-ki-sso-certificate-redirect-loop", subject: "SSO loop after cert rotation", description: "Federated users loop after the identity provider certificate rotation. authentication certificate redirect timeline root cause 01 sso-certificate-redirect-loop" },
  { id: "AU2", item: "demo-ki-mfa-device-clock-drift", subject: "MFA codes rejected", description: "Authenticator codes are rejected on one device. authentication clock timeline root cause 01 mfa-device-clock-drift" },
  { id: "AU3", item: "demo-ki-scim-delayed-provisioning", subject: "New user cannot sign in", description: "A newly assigned user is unavailable. authentication provisioning timeline root cause 01 scim-delayed-provisioning" },
  // Billing
  { id: "BI1", item: "demo-ki-duplicate-invoice-seat-change", subject: "Duplicate invoice after seats", description: "Two invoice lines for the same seat period. billing duplicate invoice timeline root cause 01 duplicate-invoice-seat-change" },
  { id: "BI2", item: "demo-ki-invoice-tax-rounding", subject: "Tax rounding difference", description: "Line-item tax totals differ slightly. billing rounding timeline root cause 01 invoice-tax-rounding" },
  { id: "BI3", item: "demo-ki-proration-credit-mismatch", subject: "Charge before credit", description: "The replacement charge appears before its credit. billing proration timeline root cause 01 proration-credit-mismatch" },
  // Integrations
  { id: "IN1", item: "demo-ki-webhook-signature-secret-rotation", subject: "Webhook signature failure", description: "Signature verification fails after secret rotation. integrations webhook signature timeline root cause 01 webhook-signature-secret-rotation" },
  { id: "IN2", item: "demo-ki-api-rate-limit-burst", subject: "Rate limit during sync", description: "A scheduled sync receives repeated rate-limit responses. integrations rate timeline root cause 01 api-rate-limit-burst" },
  { id: "IN3", item: "demo-ki-oauth-refresh-token-revoked", subject: "Connector needs reauth", description: "The connector requests authorization again after an admin change. integrations oauth timeline root cause 01 oauth-refresh-token-revoked" },
  // Permissions
  { id: "PE1", item: "demo-ki-permission-inheritance-delay", subject: "Denied after role", description: "A user stays denied shortly after receiving the role. permissions inheritance timeline root cause 01 permission-inheritance-delay" },
  { id: "PE2", item: "demo-ki-custom-role-cache", subject: "Custom role not effective", description: "A custom role looks correct but the session retains old claims. permissions cache timeline root cause 01 custom-role-cache" },
  { id: "PE3", item: "demo-ki-guest-workspace-access", subject: "Guest cannot reach resource", description: "A guest sees the workspace but not the linked resource. permissions guest timeline root cause 01 guest-workspace-access" },
  // Reporting
  { id: "RE1", item: "demo-ki-scheduled-report-timezone", subject: "Report day boundary off", description: "A daily report includes the adjacent calendar day. reporting report timezone timeline root cause 01 scheduled-report-timezone" },
  { id: "RE2", item: "demo-ki-csv-export-encoding", subject: "CSV garbled characters", description: "Accented text appears corrupted after opening the export. reporting export encoding timeline root cause 01 csv-export-encoding" },
  { id: "RE3", item: "demo-ki-large-export-timeout", subject: "Large export stalls", description: "A large export stops before a file is ready. reporting export large timeline root cause 01 large-export-timeout" },
  // Mobile
  { id: "MO1", item: "demo-ki-mobile-offline-sync-conflict", subject: "Offline edit will not merge", description: "An offline change cannot merge after connectivity returns. mobile offline timeline root cause 01 mobile-offline-sync-conflict" },
  { id: "MO2", item: "demo-ki-mobile-push-token-stale", subject: "New phone silent", description: "Web notifications arrive while the replacement phone stays silent. mobile push timeline root cause 01 mobile-push-token-stale" },
  { id: "MO3", item: "demo-ki-biometric-unlock-reset", subject: "Biometric unlock stopped", description: "Biometric unlock stops after a device security update. mobile biometric timeline root cause 01 biometric-unlock-reset" },
  // Notifications
  { id: "NO1", item: "demo-ki-email-notification-suppression", subject: "Emails suppressed", description: "Notification settings are enabled but email remains suppressed. notifications email timeline root cause 01 email-notification-suppression" },
  { id: "NO2", item: "demo-ki-digest-email-timezone", subject: "Digest wrong day", description: "The daily digest arrives on the wrong local-day boundary. notifications digest timeline root cause 01 digest-email-timezone" },
  { id: "NO3", item: "demo-ki-notification-digest-duplication", subject: "Duplicate digest", description: "Some users receive the same digest twice. notifications digest timeline root cause 01 notification-digest-duplication" }
];

async function main() {
  const items = await persistence.loadKnowledge(DEMO);
  const profile = await persistence.getOrganizationProfile(DEMO);
  assert.equal(items.length, 45, `Expected 45 canonicals, got ${items.length}.`);
  const arcById = new Map(developerDemoNarrativeArcs.map((a) => [a.canonical.id, a]));
  const cases = {};

  // Global cause -> owning canonical (authored). Detects cross-canonical reuse.
  const causeOwner = new Map();
  for (const arc of developerDemoNarrativeArcs) {
    for (const rc of arc.content.rootCauses) {
      if (!causeOwner.has(rc)) causeOwner.set(rc, new Set());
      causeOwner.get(rc).add(arc.canonical.id);
    }
  }

  /* B/D — every lesson coherent with its canonical (set-membership). */
  let totalLessons = 0, incoherentCause = 0, incoherentGuidance = 0, contaminated = 0;
  for (const item of items) {
    const arc = arcById.get(item.id);
    assert(arc, `No arc for ${item.id}.`);
    const allowedCauses = new Set(arc.content.rootCauses);
    const allowedSolutions = new Set(arc.content.solutionSteps);
    for (const lesson of item.lessons) {
      totalLessons += 1;
      const rc = lessonRootCore(lesson.rootCause);
      const sol = lessonSolutionCore(lesson.solution);
      if (!allowedCauses.has(rc)) { incoherentCause += 1; if (incoherentCause <= 5) console.log(`  CAUSE INCOHERENT ${item.id}: "${rc}"`); }
      if (!allowedSolutions.has(sol)) { incoherentGuidance += 1; if (incoherentGuidance <= 5) console.log(`  GUIDANCE INCOHERENT ${item.id}: "${sol}"`); }
      const owners = causeOwner.get(rc);
      if (owners && !(owners.size === 1 && owners.has(item.id))) { contaminated += 1; if (contaminated <= 5) console.log(`  CONTAMINATED ${item.id} uses cause owned by ${[...owners].join(",")}`); }
    }
  }
  assert.equal(totalLessons, 180, `Expected 180 lessons, got ${totalLessons}.`);
  assert.equal(incoherentCause, 0, `${incoherentCause} lessons have a root cause not authored for their canonical.`);
  assert.equal(incoherentGuidance, 0, `${incoherentGuidance} lessons have guidance not authored for their canonical.`);
  assert.equal(contaminated, 0, `${contaminated} lessons use a cause owned by a different canonical (cross-canonical contamination).`);
  cases.B_D_lessonCoherence = `PASS (${totalLessons}/180 lessons; every cause & guidance belongs to its canonical; 0 cross-canonical contamination)`;

  /* Specific TODO-049 contamination checks. */
  const csv = items.find((i) => i.id === "demo-ki-csv-export-encoding");
  const tz = items.find((i) => i.id === "demo-ki-scheduled-report-timezone");
  assert.ok(csv.lessons.every((l) => !/timezone/i.test(l.rootCause)), "No CSV-encoding lesson may have a timezone root cause.");
  assert.ok(csv.lessons.some((l) => /encoding|character|delimiter|byte-order|locale/i.test(l.rootCause)), "CSV-encoding lessons must describe encoding causes.");
  assert.ok(tz.lessons.every((l) => !/\bencoding\b|\bcsv\b|byte-order/i.test(l.rootCause)), "No timezone-report lesson may have a CSV-encoding root cause.");
  assert.ok(tz.lessons.some((l) => /timezone/i.test(l.rootCause)), "Timezone-report lessons must describe timezone causes.");
  cases.TODO049_contamination = "PASS (CSV-Encoding has only encoding causes; Timezone-Report has only timezone causes)";

  /* L — cross-domain QA over all seven domains: for a ticket carrying a
   * canonical's own root-cause evidence, findMatchingLesson selects a lesson
   * from THAT canonical whose cause and guidance are coherent, and the drafted
   * language stays TODO-048-safe. Uses the item as the candidate directly, so
   * this tests DATA coherence independent of cross-canonical ranking (covered by
   * TODO-041/045/047). */
  const itemById = new Map(items.map((i) => [i.id, i]));
  const ASSERTIVE = /\b(?:we(?:'ve| have)?\s+(?:found|identified|determined|discovered|confirmed)\s+that|the root cause (?:is|was)|was caused by)\b/i;
  const qaRows = QA.map((def) => {
    const input = ticket(def);
    const item = itemById.get(def.item);
    assert(item, `Missing QA item ${def.item}.`);
    const arc = arcById.get(def.item);
    const allowedCauses = new Set(arc.content.rootCauses);
    const allowedSolutions = new Set(arc.content.solutionSteps);
    const lesson = findMatchingLesson(input, item);
    const coherentCause = lesson && allowedCauses.has(lessonRootCore(lesson.lesson.rootCause));
    const coherentGuidance = lesson && allowedSolutions.has(lessonSolutionCore(lesson.lesson.solution));
    const und = understandForProfile(input, profile);
    const draft = draftResponse(input, und, { item, matchScore: 90, matchReason: "qa", matchedTags: [], matchedKeywords: [], matchedCategory: item.category }, profile, false);
    // TODO-048-consistent: assertive language is allowed ONLY when the current
    // ticket confirms the cause; otherwise the draft must be hedged.
    const confirmed = lesson && assessRootCauseEvidenceState(input, lesson.lesson).state === "CONFIRMED_CURRENT_CASE";
    const safe = confirmed || !ASSERTIVE.test(draft.draftResponse);
    const ok = coherentCause && coherentGuidance && safe;
    console.log(`QA ${ok ? "PASS" : "FAIL"} ${def.id} lesson=${lesson?.lesson.id ?? "none"} cause=${coherentCause} guidance=${coherentGuidance} safe=${safe}`);
    assert.ok(ok, `QA ${def.id}: coherentCause=${coherentCause} coherentGuidance=${coherentGuidance} safe=${safe}.`);
    return { ...def, lesson: lesson?.lesson.id ?? null };
  });
  const domainsCovered = new Set(developerDemoNarrativeArcs.filter((a) => QA.some((q) => q.item === a.canonical.id)).map((a) => a.domain));
  assert.equal(domainsCovered.size, 7, `Cross-domain QA must cover all 7 domains, covered ${domainsCovered.size}.`);
  cases.L_crossDomainQA = `PASS (${qaRows.length}/21 cases across all 7 domains: coherent cause + guidance + TODO-048-safe language)`;

  console.log("\n=== TODO-052 SUMMARY ===");
  for (const [k, v] of Object.entries(cases)) console.log(`${k}: ${v}`);
  console.log("\nTODO-052 CANONICAL-LESSON COHERENCE: PASS");
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
