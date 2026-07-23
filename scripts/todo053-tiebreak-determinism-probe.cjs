/*
 * TODO-053 — equal-relevance tie-break determinism probe.
 *
 * Read-only. Locks in the contract that the recurring TODO-029 Case E failure
 * exposed: when two candidates carry genuinely EQUAL relevance evidence, the
 * winner is chosen by a stable business identifier (lexicographically smallest
 * knowledge id) and is invariant to input array order, trust, and repetition.
 *
 * Historical root cause (fixed): selectPreferredMatch used
 * `matches.slice(0, 1)`, so the equal-relevance cluster contained exactly ONE
 * candidate and the stable-id tie-break at the end of the reduce could never
 * run — the winner was simply whichever candidate came first in the array.
 * It now filters to all matches sharing the retrieval winner's canonical id, so
 * true ties reach the id tie-break.
 *
 * Coverage: F order-independence, G trust inversion, J true-equal determinism,
 * K stronger-low-trust beats weaker-high-trust, L authorization still fails
 * closed, M cross-domain top-1 ranking preserved.
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
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const { selectPreferredMatch, withPreDiscriminationLessonMatches } = require(path.join(root, "lib", "lessonSelection.ts"));
const { draftResponse, findMatchingLesson, isCompatibleForDrafting } = require(path.join(root, "lib", "drafting.ts"));

const DEMO = "profile-oip-developer-demo";
const PROTECTED = [DEMO, "profile-maesa-tech", "profile-fastdrop-logistics", "profile-pramana-consulting", "test-oip-regression"];
const HERO_BILLING = "demo-ki-duplicate-invoice-seat-change";

function digest(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
async function snapshot(id) {
  const where = { organizationId: id };
  return digest(await Promise.all([
    prisma.organization.findUnique({ where: { id } }),
    prisma.knowledgeItem.findMany({ where, orderBy: { id: "asc" } }),
    prisma.ticketRecord.count({ where }),
    prisma.trustEvidence.count({ where })
  ]));
}
async function snapshots() { return Object.fromEntries(await Promise.all(PROTECTED.map(async (id) => [id, await snapshot(id)]))); }

function ticket(id, subject, description) {
  return { id, ticketId: id, customerName: "TODO-053 QA", subject, description, category: "General", status: "new", createdAt: "2026-07-23T00:00:00.000Z" };
}
function pipeline(input, profile, items) {
  const understanding = understandForProfile(input, profile);
  const canonical = identifyCanonicalProblem(understanding, profile);
  const raw = retrieveMemory(understanding, items, new Set());
  const matches = withPreDiscriminationLessonMatches(input, understanding, raw, items, canonical.title);
  const compatible = matches.filter((m) => isCompatibleForDrafting(understanding, m.item, input));
  const selected = compatible.length ? selectPreferredMatch(input, compatible) : null;
  const topMatch = selected?.match ?? null;
  const draft = draftResponse(input, understanding, topMatch, profile, false);
  return { compatible, topMatch, draft, authorized: draft.basedOnKnowledgeIds.length > 0, lessonMatch: topMatch ? findMatchingLesson(input, topMatch.item) : null };
}
function selectedId(input, matches) { return selectPreferredMatch(input, matches)?.match.item.id ?? null; }
let checks = 0, fails = 0;
function check(label, cond, detail = "") {
  checks += 1;
  if (!cond) fails += 1;
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const before = await snapshots();
  const [profile, items] = await Promise.all([persistence.getOrganizationProfile(DEMO), persistence.loadKnowledge(DEMO)]);
  const billingTicket = ticket("TODO053-A", "Duplicate Invoice After Seat Changes",
    "billing duplicate invoice timeline root cause 01 duplicate-invoice-seat-change");
  const base = pipeline(billingTicket, profile, items);
  assert.ok(base.compatible.length > 0, "Expected at least one compatible billing candidate.");
  const source = items.find((i) => i.id === HERO_BILLING);
  assert.ok(source, `Missing ${HERO_BILLING}.`);

  /* ---------------- J / F / G: genuinely equal relevance ---------------- */
  // Two clones of the SAME canonical: identical relevance evidence, differing
  // only in stable id and trust. This is TRUE_EQUAL_RELEVANCE by construction.
  const clone = (id, trustScore) => ({
    ...base.compatible[0],
    item: { ...source, id, trustScore },
    matchScore: 90
  });
  const EXPECTED = "todo053-aaa"; // lexicographically smallest stable id

  const permutations = [
    { label: "order A,Z trust 1/100", matches: [clone("todo053-aaa", 1), clone("todo053-zzz", 100)] },
    { label: "order Z,A trust 100/1", matches: [clone("todo053-zzz", 100), clone("todo053-aaa", 1)] },
    { label: "order A,Z trust 100/1 (inverted)", matches: [clone("todo053-aaa", 100), clone("todo053-zzz", 1)] },
    { label: "order Z,A trust 1/100 (inverted)", matches: [clone("todo053-zzz", 1), clone("todo053-aaa", 100)] },
    { label: "equal trust 50/50 order A,Z", matches: [clone("todo053-aaa", 50), clone("todo053-zzz", 50)] },
    { label: "equal trust 50/50 order Z,A", matches: [clone("todo053-zzz", 50), clone("todo053-aaa", 50)] }
  ];
  const winners = permutations.map((p) => {
    const winner = selectedId(billingTicket, p.matches);
    check(`J ${p.label}`, winner === EXPECTED, `winner=${winner}`);
    return winner;
  });
  // Repeated runs must be stable (no randomness / no hidden state).
  const repeated = new Set();
  for (let i = 0; i < 25; i += 1) {
    repeated.add(selectedId(billingTicket, [clone("todo053-zzz", 100), clone("todo053-aaa", 1)]));
  }
  check("J repeated runs stable (25x)", repeated.size === 1 && repeated.has(EXPECTED), `winners=${[...repeated].join(",")}`);
  check("F order-independence", new Set(winners).size === 1, `distinct winners=${new Set(winners).size}`);
  check("G trust never decides an equal-relevance tie", winners.every((w) => w === EXPECTED));

  /* ---------------- K: stronger relevance + low trust beats weaker + high trust ---------------- */
  const strongId = HERO_BILLING;
  const weakId = "demo-ki-invoice-tax-rounding";
  const strongLesson = findMatchingLesson(billingTicket, items.find((i) => i.id === strongId));
  const weakLesson = findMatchingLesson(billingTicket, items.find((i) => i.id === weakId));
  const skewed = items.map((i) => i.id === strongId ? { ...i, trustScore: 1 } : i.id === weakId ? { ...i, trustScore: 100 } : i);
  const skewedResult = pipeline(billingTicket, profile, skewed);
  check("K stronger low-trust candidate beats weaker high-trust",
    skewedResult.topMatch?.item.id === strongId && skewedResult.topMatch.item.trustScore === 1,
    `winner=${skewedResult.topMatch?.item.id} trust=${skewedResult.topMatch?.item.trustScore} lesson ${strongLesson?.score}>${weakLesson?.score ?? 0}`);

  /* ---------------- L: winning a tie-break does not authorize ---------------- */
  // A vague billing ticket: a candidate may still be selected, but weak lesson
  // evidence must fail closed (TODO-046) regardless of the tie-break winner.
  const vague = ticket("TODO053-L", "Generic invoice question", "Can someone review our invoice?");
  const vagueResult = pipeline(vague, profile, items);
  check("L tie-break winner with weak lesson evidence fails closed",
    vagueResult.authorized === false && vagueResult.draft.source === "no_template",
    `authorized=${vagueResult.authorized} source=${vagueResult.draft.source} canonical=${vagueResult.topMatch?.item.id ?? "none"}`);
  // And the equal-relevance clones must not bypass authorization either.
  const cloneDraft = draftResponse(vague, understandForProfile(vague, profile), clone("todo053-aaa", 100), profile, false);
  check("L equal-relevance clone cannot self-authorize on a vague ticket",
    cloneDraft.basedOnKnowledgeIds.length === 0 || cloneDraft.source === "no_template",
    `source=${cloneDraft.source} ids=${cloneDraft.basedOnKnowledgeIds.join(",")}`);

  /* ---------------- M: cross-domain top-1 ranking preserved ---------------- */
  const CROSS = [
    ["Authentication", "demo-ki-sso-certificate-redirect-loop", "SSO redirect loop after certificate rotation", "authentication certificate redirect timeline root cause 01 sso-certificate-redirect-loop"],
    ["Billing", HERO_BILLING, "Duplicate Invoice After Seat Changes", "billing duplicate invoice timeline root cause 01 duplicate-invoice-seat-change"],
    ["Integrations", "demo-ki-webhook-signature-secret-rotation", "Webhook Signature Failure", "integrations webhook signature timeline root cause 01 webhook-signature-secret-rotation"],
    ["Permissions", "demo-ki-permission-inheritance-delay", "Permission Inheritance Delay", "permissions inheritance timeline root cause 01 permission-inheritance-delay"],
    ["Reporting", "demo-ki-scheduled-report-timezone", "Scheduled Report Timezone Boundary", "reporting report timezone timeline root cause 01 scheduled-report-timezone"],
    ["Mobile", "demo-ki-mobile-offline-sync-conflict", "Mobile Offline Synchronization Conflict", "mobile offline timeline root cause 01 mobile-offline-sync-conflict"],
    ["Notifications", "demo-ki-email-notification-suppression", "Email Notification Suppression", "notifications email timeline root cause 01 email-notification-suppression"]
  ];
  CROSS.forEach(([domain, expectedId, subject, description], index) => {
    const r = pipeline(ticket(`TODO053-M${index}`, subject, description), profile, items);
    check(`M ${domain} top-1 ranking preserved`, r.topMatch?.item.id === expectedId, `winner=${r.topMatch?.item.id ?? "none"}`);
  });

  /* ---------------- O: mature data untouched ---------------- */
  const hero = items.find((i) => i.id === "demo-ki-sso-certificate-redirect-loop");
  check("O TODO-043 hero provenance intact", hero.sourceTicketId === "OIP-20230104-0001", hero.sourceTicketId);
  const after = await snapshots();
  check("O protected organizations unchanged", PROTECTED.every((id) => after[id] === before[id]));

  console.log(`\n=== TODO-053 SUMMARY: ${checks - fails}/${checks} checks passed ===`);
  console.log(`Tie-break contract: lesson score -> multi-token -> ticket-evidence coverage -> matchScore -> stable knowledge id (ascending). Trust, reuse, array order, and DB order never participate.`);
  await prisma.$disconnect();
  assert.equal(fails, 0, `${fails} checks failed.`);
  console.log("TODO-053 EQUAL-RELEVANCE TIE-BREAK: PASS");
}
main().catch(async (err) => { console.error(err); try { await prisma.$disconnect(); } catch {} process.exit(1); });
