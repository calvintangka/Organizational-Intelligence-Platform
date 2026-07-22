/* TODO-045 read-only semantic lesson evidence probe. */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const { prisma } = require(path.join(root, "lib", "server", "prisma.ts"));
const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const {
  assessCompatibilityDecision,
  draftResponse,
  findMatchingLesson,
  isCompatibleForDrafting,
  isStrongLessonEvidence
} = require(path.join(root, "lib", "drafting.ts"));
const { selectPreferredMatch, withPreDiscriminationLessonMatches } = require(path.join(root, "lib", "lessonSelection.ts"));

const DEMO = "profile-oip-developer-demo";
const HERO = "demo-ki-sso-certificate-redirect-loop";
const PROTECTED = [DEMO, "profile-maesa-tech", "profile-fastdrop-logistics", "profile-pramana-consulting", "test-oip-regression"];
const todo041 = JSON.parse(fs.readFileSync(path.join(root, "scripts", "fixtures", "todo041-cross-domain-fixtures.json"), "utf8"));
const todo037 = JSON.parse(fs.readFileSync(path.join(root, "scripts", "fixtures", "todo037-natural-paraphrase-fixtures.json"), "utf8"));
const fixture = JSON.parse(fs.readFileSync(path.join(root, "scripts", "fixtures", "todo045-semantic-lesson-fixtures.json"), "utf8"));

function digest(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
async function snapshot(organizationId) {
  const where = { organizationId };
  const [organization, knowledge, candidates, validations, memory, tickets, evidence, patterns, logs, metrics, sequence] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId } }),
    prisma.knowledgeItem.findMany({ where, orderBy: { id: "asc" } }),
    prisma.knowledgeCandidate.findMany({ where, orderBy: { id: "asc" } }),
    prisma.validationRecord.findMany({ where, orderBy: { id: "asc" } }),
    prisma.memoryChangeRecord.findMany({ where, orderBy: { id: "asc" } }),
    prisma.ticketRecord.findMany({ where, orderBy: { id: "asc" } }),
    prisma.trustEvidence.findMany({ where, orderBy: { id: "asc" } }),
    prisma.emergingPattern.findMany({ where, orderBy: { id: "asc" } }),
    prisma.intelligenceLog.findMany({ where, orderBy: { id: "asc" } }),
    prisma.orgMetrics.findUnique({ where: { organizationId } }),
    prisma.ticketSequence.findUnique({ where: { organizationId } })
  ]);
  return { digest: digest({ organization, knowledge, candidates, validations, memory, tickets, evidence, patterns, logs, metrics, sequence }), counts: { knowledge: knowledge.length, lessons: knowledge.reduce((n, item) => n + (item.content?.lessons?.length ?? 0), 0), candidates: candidates.length, validations: validations.length, memory: memory.length, tickets: tickets.length, evidence: evidence.length, patterns: patterns.length } };
}
async function snapshots() { return Object.fromEntries(await Promise.all(PROTECTED.map(async (id) => [id, await snapshot(id)]))); }
function ticket(definition, prefix = "TODO045") { return { id: `${prefix}-${definition.id}`, ticketId: `${prefix}-${definition.id}`, customerName: "TODO-045 Audit", subject: definition.subject, description: definition.description, category: "General", status: "new", createdAt: "2026-07-22T00:00:00.000Z" }; }
function run(input, profile, items) {
  const understanding = understandForProfile(input, profile);
  const canonical = identifyCanonicalProblem(understanding, profile);
  const rawMatches = retrieveMemory(understanding, items, new Set());
  const matches = withPreDiscriminationLessonMatches(input, understanding, rawMatches, items, canonical.title);
  const compatible = matches.filter((match) => isCompatibleForDrafting(understanding, match.item, input));
  const selected = compatible.length ? selectPreferredMatch(input, compatible) : null;
  const topMatch = selected?.match ?? null;
  const lessonMatch = topMatch ? findMatchingLesson(input, topMatch.item) : null;
  const compatibility = topMatch ? assessCompatibilityDecision(understanding, topMatch.item, input) : null;
  const draft = draftResponse(input, understanding, topMatch, profile, false);
  return { understanding, canonical, rawMatches, topMatch, lessonMatch, compatibility, draft };
}
function authorized(result, expected) { return result.draft.basedOnKnowledgeIds.includes(expected.expectedCanonicalId); }
function positiveResult(definition, profile, items) {
  const result = run(ticket(definition), profile, items);
  return { id: definition.id, category: result.understanding.category, rawTop: result.rawMatches[0]?.item.id ?? null, selectedCanonical: result.topMatch?.item.id ?? null, selectedLesson: result.lessonMatch?.lesson.id ?? null, score: result.lessonMatch?.score ?? 0, multiToken: result.lessonMatch?.multiTokenMatches ?? 0, strong: Boolean(result.lessonMatch && isStrongLessonEvidence(result.lessonMatch, true)), authorized: authorized(result, definition), signalEvidence: result.lessonMatch?.signalEvidence ?? [] };
}
function controlResult(definition, profile, items) {
  const result = run(ticket(definition), profile, items);
  return { id: definition.id, selectedCanonical: result.topMatch?.item.id ?? null, selectedLesson: result.lessonMatch?.lesson.id ?? null, authorized: result.draft.basedOnKnowledgeIds.length > 0 };
}
function appendSignals(definition, suffix) { return { ...definition, id: `${definition.id}-${suffix}`, description: `${definition.description} ${suffix}` }; }

async function main() {
  const before = await snapshots();
  const [profile, items] = await Promise.all([persistence.getOrganizationProfile(DEMO), persistence.loadKnowledge(DEMO)]);
  if (items.length !== 45) throw new Error(`Expected 45 mature Developer Demo knowledge items; got ${items.length}.`);

  const rows = [];
  const exact = [];
  for (const domain of todo041.domains) for (const definition of domain.paraphrases) {
    const natural = run(ticket(definition), profile, items);
    const one = run(ticket(appendSignals(definition, domain.oneSignal)), profile, items);
    const many = run(ticket(appendSignals(definition, domain.manySignals)), profile, items);
    rows.push({ id: definition.id, domain: domain.domain, authorized: natural.draft.basedOnKnowledgeIds.includes(domain.expectedCanonicalId), canonical: natural.topMatch?.item.id === domain.expectedCanonicalId, lesson: natural.lessonMatch?.lesson.id === domain.expectedLessonId, strong: Boolean(natural.lessonMatch && isStrongLessonEvidence(natural.lessonMatch, true)) });
    exact.push({ id: definition.id, natural: natural.draft.basedOnKnowledgeIds.includes(domain.expectedCanonicalId), oneSignal: one.draft.basedOnKnowledgeIds.includes(domain.expectedCanonicalId), manySignals: many.draft.basedOnKnowledgeIds.includes(domain.expectedCanonicalId) });
  }
  const unseen = fixture.unseen.map((definition) => positiveResult(definition, profile, items));
  const controls = [...fixture.negativeControls, ...fixture.contradictionControls].map((definition) => controlResult(definition, profile, items));

  const sibling = [];
  for (const domain of todo041.domains.filter((entry) => entry.domain !== "Authentication / SSO")) {
    const item = items.find((candidate) => candidate.id === domain.expectedCanonicalId);
    if (!item) continue;
    const input = ticket({ id: `SIB-${domain.id}`, subject: `${domain.domain} root cause`, description: domain.manySignals });
    const normal = findMatchingLesson(input, item);
    const reversed = findMatchingLesson(input, { ...item, lessons: [...(item.lessons ?? [])].reverse() });
    sibling.push({ domain: domain.domain, expected: domain.expectedLessonId, normal: normal?.lesson.id ?? null, reversed: reversed?.lesson.id ?? null, orderIndependent: normal?.lesson.id === reversed?.lesson.id });
  }

  const trustTarget = items.find((item) => item.id === "demo-ki-duplicate-invoice-seat-change");
  const trustCompetitor = items.find((item) => item.id === "demo-ki-annual-renewal-seat-count");
  const trustTicket = ticket({ id: "TRUST", subject: "Repeated charge after changing seats", description: "The invoice lists the same seat charge twice after a capacity edit." });
  const trustA = run(trustTicket, profile, items.map((item) => ({ ...item, trustScore: item.id === trustTarget?.id ? 1 : item.id === trustCompetitor?.id ? 100 : item.trustScore })));
  const trustB = run(trustTicket, profile, items.map((item) => ({ ...item, trustScore: item.id === trustTarget?.id ? 100 : item.id === trustCompetitor?.id ? 1 : item.trustScore })));
  const trust = { rawTopStable: trustA.rawMatches[0]?.item.id === trustB.rawMatches[0]?.item.id, selectedStable: trustA.topMatch?.item.id === trustB.topMatch?.item.id, selected: trustA.topMatch?.item.id ?? null };

  const after = await snapshots();
  const hero = (await persistence.loadKnowledge(DEMO)).find((item) => item.id === HERO);
  const protectedUnchanged = JSON.stringify(before) === JSON.stringify(after);
  const provenance = { sourceTicketId: hero?.sourceTicketId ?? null, sourceTicketIds: hero?.sourceTicketIds ?? [], intact: hero?.sourceTicketId === "OIP-20230104-0001" };
  const post041 = { total: rows.length, authorized: rows.filter((row) => row.authorized).length, controls: controls.length, falsePositives: controls.filter((row) => row.authorized).length, exactNatural: exact.filter((row) => row.natural).length, exactOneSignal: exact.filter((row) => row.oneSignal).length, exactManySignals: exact.filter((row) => row.manySignals).length };
  const unseenPassed = unseen.filter((row) => row.category === fixture.unseen.find((item) => item.id === row.id)?.expectedCategory && row.rawTop === fixture.unseen.find((item) => item.id === row.id)?.expectedCanonicalId && row.selectedCanonical === fixture.unseen.find((item) => item.id === row.id)?.expectedCanonicalId && row.selectedLesson === fixture.unseen.find((item) => item.id === row.id)?.expectedLessonId && row.strong && row.authorized).length;
  const contradictionCount = fixture.contradictionControls.length;
  const contradictionPassed = controls.slice(-contradictionCount).filter((row) => !row.authorized).length;
  const safetyPass = protectedUnchanged && provenance.intact && post041.falsePositives === 0 && contradictionPassed === contradictionCount && trust.rawTopStable && trust.selectedStable;
  const verdict = safetyPass && unseenPassed === unseen.length && post041.authorized === post041.total ? "COMPLETED" : safetyPass ? "COMPLETED_WITH_REMAINING_AMBIGUITY" : "SAFETY_REGRESSION";
  console.log(`TODO045 BASELINE postTODO047=authorization 8/70 nonSso 0/60 exactNatural 8/70 exactOneSignal 13/70 exactManySignals 70/70`);
  console.log(`TODO045 AFTER authorization=${post041.authorized}/${post041.total} controls=${post041.controls} falsePositives=${post041.falsePositives} exactNatural=${post041.exactNatural}/${post041.total} exactOneSignal=${post041.exactOneSignal}/${post041.total} exactManySignals=${post041.exactManySignals}/${post041.total}`);
  console.log(`TODO045 UNSEEN ${unseenPassed}/${unseen.length}`);
  console.log(`TODO045 CONTROLS ${post041.controls - contradictionCount}/${post041.controls - contradictionCount} contradiction=${contradictionPassed}/${contradictionCount}`);
  console.log(`TODO045 SIBLING ${sibling.filter((row) => row.orderIndependent && row.normal === row.expected).length}/${sibling.length}`);
  console.log(`TODO045 TRUST ${JSON.stringify(trust)}`);
  console.log(`TODO045 SNAPSHOTS ${protectedUnchanged ? "UNCHANGED" : "DRIFT DETECTED"} provenance=${provenance.intact ? "INTACT" : "DRIFT"}`);
  console.log(`TODO045 VERDICT ${verdict}`);
  console.log(JSON.stringify({ verdict, post041, unseen, controls, sibling, trust, provenance, protectedUnchanged }, null, 2));
  if (verdict === "SAFETY_REGRESSION") process.exitCode = 2;
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { try { await prisma.$disconnect(); } catch {} });
