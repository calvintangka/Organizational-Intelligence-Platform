/*
 * TODO-048 — Unverified Root-Cause Assertion Safety probe.
 *
 * Read-only. Verifies that OIP never presents a matched lesson's HISTORICAL root
 * cause as a CONFIRMED current-case fact unless the current ticket independently
 * establishes it, while still reusing the lesson's validated investigation and
 * resolution guidance.
 *
 * Coverage:
 *   E — five manual Developer Demo cases (symptom-only) end-to-end.
 *   F — cross-domain safety matrix over all seven mature domains, scenarios
 *       A (symptom-only), B (evidence-consistent but not proving), C (customer
 *       states the causal EVENT but not the historical cause), D (root cause
 *       explicitly verified in current-case evidence).
 *   D — confirmed-fact preservation (assertive language allowed only for D).
 *   G — lesson guidance preservation (verification clause always retained).
 *   H — deterministic and AI-draft paths respect the same boundary (mocks).
 *   I — adversarial: specific historical cause vs generic symptom stays possible.
 *   J — explainability separates historical cause from current-case status.
 *   K — TODO-041 authorization intact (hero authorizes; controls do not).
 *   L — mature data + TODO-043 hero provenance unchanged.
 *
 * Uses the same pure production boundaries as app/page.tsx; writes nothing.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is required."); process.exit(1); }

const { prisma } = require(path.join(root, "lib", "server", "prisma.ts"));
const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { renderCustomerTemplateForTicket } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const { draftResponse, findMatchingLesson, isCompatibleForDrafting } = require(path.join(root, "lib", "drafting.ts"));
const { selectPreferredMatch, withPreDiscriminationLessonMatches } = require(path.join(root, "lib", "lessonSelection.ts"));
const {
  assessRootCauseEvidenceState,
  applyRootCauseSafeLanguage,
  rootCauseEvidenceNote
} = require(path.join(root, "lib", "rootCauseSafety.ts"));

const DEMO = "profile-oip-developer-demo";
const HERO = "demo-ki-sso-certificate-redirect-loop";
const PROTECTED = [DEMO, "profile-maesa-tech", "profile-fastdrop-logistics", "profile-pramana-consulting", "test-oip-regression"];

/* An assertive claim states a cause as an established current-case fact. */
const ASSERTIVE = /\b(?:we(?:'ve| have)?\s+(?:found|identified|determined|discovered|confirmed)\s+that|the root cause (?:is|was)|(?:issue|problem) (?:is|was) caused by|was caused by)\b/i;
function hasAssertiveClaim(text) { return ASSERTIVE.test(text); }

function ticket(def, prefix = "TODO048") {
  return {
    id: `${prefix}-${def.id}`,
    ticketId: `${prefix}-${def.id}`,
    customerName: "TODO-048 Probe",
    subject: def.subject,
    description: def.description,
    category: "General",
    status: "new",
    createdAt: "2026-07-23T00:00:00.000Z"
  };
}

/** Production orchestration glue mirroring app/page.tsx. */
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
  return { understanding, topMatch, lessonMatch, draft, authorized: draft.basedOnKnowledgeIds.includes(HERO) };
}

/** Direct (ticket, lesson) safety evaluation — robust to retrieval quirks. */
function safeDraftFor(input, lesson, profile) {
  const rendered = renderCustomerTemplateForTicket(lesson.customerResponse, input, profile);
  const assessment = assessRootCauseEvidenceState(input, lesson);
  return { assessment, rendered, safe: applyRootCauseSafeLanguage(rendered, assessment) };
}

async function snapshot(id) {
  const where = { organizationId: id };
  const [org, knowledge, tickets, evidence] = await Promise.all([
    prisma.organization.findUnique({ where: { id } }),
    prisma.knowledgeItem.findMany({ where, orderBy: { id: "asc" } }),
    prisma.ticketRecord.count({ where }),
    prisma.trustEvidence.count({ where })
  ]);
  return crypto.createHash("sha256").update(JSON.stringify({ org, knowledge, tickets, evidence })).digest("hex");
}
async function snapshots() { return Object.fromEntries(await Promise.all(PROTECTED.map(async (id) => [id, await snapshot(id)]))); }

/* ---------------- E: five manual cases (symptom-only, end-to-end) ---------------- */
const MANUAL = [
  { id: "M1", subject: "Charged twice for one upgrade", description: "I made one payment for my subscription yesterday, but I can see two separate charges on my bank statement. I only upgraded once. Can you check why I was billed more than once?" },
  { id: "M2", subject: "Duplicate events created", description: "We noticed that one customer action created two identical events in our internal system. From our side, it looks like the same update was sent to us more than once. This is causing duplicate records." },
  { id: "M3", subject: "New teammate cannot open the shared project", description: "We added a teammate to the workspace and gave them the same role as everyone else, but they still cannot open the shared project. Everyone else can." },
  { id: "M4", subject: "Report totals do not match the dashboard", description: "Our scheduled report shows a different daily total than the dashboard on screen. The numbers are off by what looks like a day." },
  { id: "M5", subject: "Sign-in loop after certificate change", description: "After we rotated our signing certificate for our identity provider, our users started looping back to the sign-in page and cannot get in." }
];

/* ---------------- F: cross-domain matrix (per-domain hero lesson-001) ---------------- */
// itemId -> the four scenarios. A/B/C must stay non-CONFIRMED; D must CONFIRM.
const DOMAINS = [
  {
    domain: "Authentication", itemId: HERO,
    A: { subject: "Users keep landing on the login page", description: "Our staff keep getting bounced back to the sign-in screen and cannot reach the workspace." },
    B: { subject: "Sign-in loop and we touched SSO recently", description: "People loop at sign-in. We did some identity provider work last week but are not sure what changed." },
    C: { subject: "Loop started after a certificate rotation", description: "After we rotated the identity provider certificate, users started looping at sign-in." },
    D: { subject: "Confirmed stale metadata", description: "Our engineer verified the identity provider metadata is stale after the configuration change, and that is producing the sign-in loop." }
  },
  {
    domain: "Billing", itemId: "demo-ki-duplicate-invoice-seat-change",
    A: { subject: "Charged twice", description: "We see two charges for what should be one subscription this month." },
    B: { subject: "Extra charge near renewal", description: "There is an unexpected extra charge around our renewal date. We changed our plan recently." },
    C: { subject: "Duplicate charge after adding seats", description: "We added seats and then saw a duplicate charge appear on the account." },
    D: { subject: "Confirmed boundary crossing", description: "Finance confirmed a seat change crossed the invoice calculation boundary, producing the duplicate invoice." }
  },
  {
    domain: "API & Integrations", itemId: "demo-ki-webhook-signature-secret-rotation",
    A: { subject: "Webhooks rejected", description: "Our endpoint suddenly started rejecting the webhook deliveries it used to accept." },
    B: { subject: "Delivery failures after some maintenance", description: "Webhook verification is failing since our team did maintenance overnight; unsure what was touched." },
    C: { subject: "Failures began after we rotated a secret", description: "We rotated a signing secret and afterwards webhook signature verification started failing." },
    D: { subject: "Confirmed rotation race", description: "We verified the signing secret was rotated before the sender refreshed it, which broke signature verification." }
  },
  {
    domain: "Permissions & Access", itemId: "demo-ki-permission-inheritance-delay",
    A: { subject: "Access denied to shared resource", description: "A team member cannot open the shared resource even though they should be able to." },
    B: { subject: "New role but still blocked", description: "We assigned the correct role but the action is still denied for now." },
    C: { subject: "Denied right after assigning the role", description: "We assigned the role and the user was still denied access to the target workspace immediately after." },
    D: { subject: "Confirmed inheritance delay", description: "Directory audit confirmed the role inheritance propagated late to the target workspace, so access lagged." }
  },
  {
    domain: "Reporting & Exports", itemId: "demo-ki-scheduled-report-timezone",
    A: { subject: "Report total looks wrong", description: "Our report total does not match what we expected to see." },
    B: { subject: "Totals off around midnight", description: "The scheduled report totals look shifted; our teams work across a couple of regions." },
    C: { subject: "Report shows adjacent day records", description: "The scheduled report includes records from the next calendar day compared to the dashboard." },
    D: { subject: "Confirmed timezone difference", description: "We confirmed the report timezone differs from the viewer workspace timezone, shifting the daily boundary." }
  },
  {
    domain: "Mobile Application", itemId: "demo-ki-mobile-offline-sync-conflict",
    A: { subject: "Mobile changes not saving", description: "Edits made in the mobile app do not seem to save back to the workspace." },
    B: { subject: "Sync stuck after being offline", description: "A technician was offline in the field and now their app will not finish syncing." },
    C: { subject: "Offline edit will not merge", description: "An offline change made on the phone cannot merge after the device reconnected." },
    D: { subject: "Confirmed revision conflict", description: "Diagnostics confirmed an offline mutation conflicts with a newer server revision, blocking the merge." }
  },
  {
    domain: "Notifications & Email", itemId: "demo-ki-email-notification-suppression",
    A: { subject: "Emails not arriving", description: "One of our users stopped receiving the email notifications they expect." },
    B: { subject: "No email despite settings on", description: "Notification settings are enabled but this recipient still gets no email; they had a bounce a while ago." },
    C: { subject: "Silent since an earlier bounce", description: "This recipient has received no notifications since an earlier delivery failure on their address." },
    D: { subject: "Confirmed suppression", description: "We verified recipient suppression remains from an earlier delivery failure, so mail is withheld." }
  }
];

/* ---------------- I: adversarial specific-cause vs generic-symptom ---------------- */
const ADVERSARIAL = [
  { itemId: "demo-ki-duplicate-invoice-seat-change", id: "ADV-billing", subject: "Two charges", description: "We were charged twice this month." },
  { itemId: HERO, id: "ADV-auth", subject: "Login loop", description: "Users keep bouncing back to the sign-in page." },
  { itemId: "demo-ki-webhook-signature-secret-rotation", id: "ADV-integration", subject: "Duplicate webhooks", description: "The same event reached our system twice." },
  { itemId: "demo-ki-permission-inheritance-delay", id: "ADV-permission", subject: "Access delayed", description: "A user could not access the resource for a while after we set them up." },
  { itemId: "demo-ki-scheduled-report-timezone", id: "ADV-reporting", subject: "Numbers mismatch", description: "The report and the dashboard show different totals." },
  { itemId: "demo-ki-mobile-offline-sync-conflict", id: "ADV-mobile", subject: "Stale mobile state", description: "The mobile app shows old data after coming back online." },
  { itemId: "demo-ki-email-notification-suppression", id: "ADV-notification", subject: "Missing alert", description: "A user did not get the notification we sent." }
];

function main() {
  return (async () => {
    const before = await snapshots();
    const [profile, items] = await Promise.all([persistence.getOrganizationProfile(DEMO), persistence.loadKnowledge(DEMO)]);
    if (profile.id !== DEMO || items.length !== 45) throw new Error(`Expected mature demo; got ${profile.id}/${items.length}.`);
    const itemById = new Map(items.map((it) => [it.id, it]));
    const cases = {};

    /* ---------------- E: manual cases ---------------- */
    const manual = MANUAL.map((def) => {
      const input = ticket(def);
      const r = runPipeline(input, profile, items);
      const lesson = r.lessonMatch?.lesson ?? null;
      const state = lesson ? assessRootCauseEvidenceState(input, lesson).state : "n/a";
      const assertive = hasAssertiveClaim(r.draft.draftResponse);
      // Symptom-only manual cases must never assert a cause as found.
      const safe = !assertive;
      console.log(`MANUAL ${safe ? "PASS" : "FAIL"} ${def.id} state=${state} source=${r.draft.source} lesson=${lesson?.id ?? "none"} assertive=${assertive}`);
      return { ...def, state, assertive, safe, lesson: lesson?.id ?? null };
    });
    assert.equal(manual.filter((m) => m.assertive).length, 0, "No manual symptom-only case may assert a historical cause as found.");
    cases.E_manualCases = `PASS (${manual.length}/${manual.length} symptom-only cases produce no unverified assertion)`;

    /* ---------------- F: cross-domain matrix ---------------- */
    const matrixRows = [];
    for (const dom of DOMAINS) {
      const item = itemById.get(dom.itemId);
      assert(item, `Missing ${dom.itemId}.`);
      const lesson = item.lessons[0];
      for (const key of ["A", "B", "C", "D"]) {
        const input = ticket({ id: `${dom.domain}-${key}`, ...dom[key] });
        const { assessment, safe } = safeDraftFor(input, lesson, profile);
        const assertive = hasAssertiveClaim(safe);
        const confirmed = assessment.state === "CONFIRMED_CURRENT_CASE";
        const guidancePreserved = safe.includes("confirm the result before closing");
        let ok;
        if (key === "D") ok = confirmed && guidancePreserved; // verified cause -> assertive allowed
        else ok = !confirmed && !assertive && guidancePreserved; // A/B/C -> possible, no assertion
        console.log(`MATRIX ${ok ? "PASS" : "FAIL"} ${dom.domain}/${key} state=${assessment.state} assertive=${assertive} guidance=${guidancePreserved} confirmed=[${assessment.confirmedTokens.join(",")}]`);
        matrixRows.push({ domain: dom.domain, scenario: key, state: assessment.state, ok });
        assert(ok, `Matrix ${dom.domain}/${key} failed safety expectation.`);
      }
    }
    cases.F_crossDomainMatrix = `PASS (${matrixRows.length}/${matrixRows.length} scenarios across ${DOMAINS.length} domains)`;

    /* ---------------- D: confirmed-fact preservation ---------------- */
    // Every D scenario must still be allowed to state the verified cause.
    const dRows = matrixRows.filter((r) => r.scenario === "D");
    assert.equal(dRows.filter((r) => r.state === "CONFIRMED_CURRENT_CASE").length, dRows.length, "Every verified-cause case must confirm.");
    cases.D_confirmedPreservation = `PASS (${dRows.length}/${dRows.length} verified-cause cases retain confirmed language)`;

    /* ---------------- G: lesson-guidance preservation ---------------- */
    // Across A/B/C (hedged) the validated verification/investigation clause survives.
    const hedged = [];
    for (const dom of DOMAINS) {
      const lesson = itemById.get(dom.itemId).lessons[0];
      for (const key of ["A", "B", "C"]) {
        const { safe } = safeDraftFor(ticket({ id: `${dom.domain}-${key}`, ...dom[key] }), lesson, profile);
        hedged.push(safe.includes("confirm the result before closing") && !hasAssertiveClaim(safe));
      }
    }
    assert.equal(hedged.filter(Boolean).length, hedged.length, "Hedged drafts must retain validated guidance and drop assertion.");
    cases.G_guidancePreservation = `PASS (${hedged.length}/${hedged.length} hedged drafts keep investigation guidance)`;

    /* ---------------- H: deterministic + AI-draft paths ---------------- */
    // The safety boundary is a property of the rendered draft, so it applies to
    // ANY producer. Simulate an AI draft that asserts a historical cause and a
    // POSSIBLE assessment -> it must be softened; a CONFIRMED assessment leaves
    // it intact. (In app/page.tsx, lesson_grounded discards the AI draft and
    // serves this deterministic-safe draft, so this boundary is authoritative.)
    const billingLesson = itemById.get("demo-ki-duplicate-invoice-seat-change").lessons[0];
    const aiStyleDraft = "Hello, We found that a seat change crossed the invoice calculation boundary. We will look into it.";
    const possibleAssessment = assessRootCauseEvidenceState(ticket({ id: "H-possible", subject: "Two charges", description: "We were charged twice." }), billingLesson);
    const confirmedAssessment = assessRootCauseEvidenceState(ticket({ id: "H-confirmed", subject: "Confirmed", description: "Finance confirmed a seat change crossed the invoice calculation boundary." }), billingLesson);
    const aiPossible = applyRootCauseSafeLanguage(aiStyleDraft, possibleAssessment);
    const aiConfirmed = applyRootCauseSafeLanguage(aiStyleDraft, confirmedAssessment);
    assert.equal(possibleAssessment.state, "POSSIBLE_FROM_ORGANIZATIONAL_MEMORY");
    assert.equal(confirmedAssessment.state, "CONFIRMED_CURRENT_CASE");
    assert.ok(!hasAssertiveClaim(aiPossible), "AI-style draft must be softened when cause is unconfirmed.");
    assert.ok(hasAssertiveClaim(aiConfirmed), "Confirmed cause may retain assertive AI-style language.");
    console.log(`AIPATH PASS possible-softened="${aiPossible.slice(7, 70)}..." confirmed-intact=${hasAssertiveClaim(aiConfirmed)}`);
    cases.H_deterministicAndAIPaths = "PASS (softens unconfirmed on any draft producer; confirmed retained)";

    /* ---------------- I: adversarial specific-cause vs generic-symptom ---------------- */
    const adversarial = ADVERSARIAL.map((def) => {
      const lesson = itemById.get(def.itemId).lessons[0];
      const { assessment, safe } = safeDraftFor(ticket(def), lesson, profile);
      const ok = assessment.state !== "CONFIRMED_CURRENT_CASE" && !hasAssertiveClaim(safe);
      console.log(`ADVERSARIAL ${ok ? "PASS" : "FAIL"} ${def.id} state=${assessment.state} assertive=${hasAssertiveClaim(safe)}`);
      return { ...def, ok };
    });
    assert.equal(adversarial.filter((r) => !r.ok).length, 0, "A generic symptom must never confirm a specific historical cause.");
    cases.I_adversarial = `PASS (${adversarial.length}/${adversarial.length} generic symptoms stay possible)`;

    /* ---------------- J: explainability ---------------- */
    const jInput = ticket({ id: "J1", subject: "Charged twice for one upgrade", description: "I made one payment for my subscription yesterday, but I can see two separate charges on my bank statement. I only upgraded once." });
    const jLesson = itemById.get("demo-ki-duplicate-invoice-seat-change").lessons[0];
    const jNote = rootCauseEvidenceNote(assessRootCauseEvidenceState(jInput, jLesson));
    assert.ok(/Historical root cause:/.test(jNote), "Note must name the historical root cause.");
    assert.ok(/Current-case status:/.test(jNote), "Note must state current-case status.");
    assert.ok(/possible \(from Organizational Memory; not confirmed/.test(jNote), "Unconfirmed note must mark status as possible/not confirmed.");
    // The end-to-end confidenceNote surfaces the same structured explainability.
    const jPipeline = runPipeline(jInput, profile, items);
    assert.ok(/Current-case status:/.test(jPipeline.draft.confidenceNote), "Draft confidenceNote must carry current-case status.");
    console.log(`EXPLAIN PASS note="${jNote.slice(0, 120)}..."`);
    cases.J_explainability = "PASS (historical cause vs current-case status separated in note and draft)";

    /* ---------------- K: TODO-041 authorization intact ---------------- */
    const heroAuth = runPipeline(ticket({ id: "K-hero", subject: "SSO redirect loop after certificate rotation", description: "After the identity provider certificate rotation, our federated users loop between the workspace and the provider and never sign in." }), profile, items);
    assert.ok(heroAuth.authorized, "Hero SSO ticket must still authorize the hero lesson (TODO-041).");
    const controlAuth = runPipeline(ticket({ id: "K-control", subject: "Forgot my password", description: "I forgot my password and the reset email never arrives." }), profile, items);
    assert.ok(!controlAuth.authorized, "Password-reset control must not authorize the hero (TODO-041).");
    console.log(`TODO041 PASS hero-authorized=${heroAuth.authorized} control-authorized=${controlAuth.authorized}`);
    cases.K_todo041Preservation = "PASS (hero authorizes; control does not)";

    /* ---------------- L: mature data + provenance unchanged ---------------- */
    const hero = itemById.get(HERO);
    assert.equal(hero.sourceTicketId, "OIP-20230104-0001", "TODO-043 hero provenance must be intact.");
    assert.equal(hero.provenance?.sourceTicketId, "OIP-20230104-0001", "TODO-043 hero provenance sourceTicketId must be intact.");
    const after = await snapshots();
    for (const id of PROTECTED) {
      assert.equal(after[id], before[id], `Mature data for ${id} must be unchanged.`);
    }
    cases.L_matureDataSafety = `PASS (${PROTECTED.length}/${PROTECTED.length} orgs unchanged; TODO-043 provenance OIP-20230104-0001)`;

    console.log("\n=== TODO-048 SUMMARY ===");
    for (const [k, v] of Object.entries(cases)) console.log(`${k}: ${v}`);
    console.log("\nTODO-048 ROOT-CAUSE ASSERTION SAFETY: PASS");
    await prisma.$disconnect();
  })();
}

main().catch(async (err) => { console.error(err); try { await prisma.$disconnect(); } catch {} process.exit(1); });
