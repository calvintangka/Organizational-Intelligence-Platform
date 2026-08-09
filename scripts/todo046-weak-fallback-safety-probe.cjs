/*
 * TODO-046 — weak same-category canonical fallback safety probe.
 *
 * Read-only. This probe reproduces TODO-041 C02 through the production
 * analyzer/retrieval/selection/compatibility/drafting boundaries, exercises
 * the final authorization invariant, and keeps every synthetic variant in
 * memory.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required; TODO-046 is read-only.");

const { prisma } = require(path.join(root, "lib", "server", "prisma.ts"));
const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const {
  assessCompatibilityDecision,
  draftResponse,
  findMatchingLesson,
  isRetrievalCandidateEligible,
  isStrongLessonEvidence
} = require(path.join(root, "lib", "drafting.ts"));
const { selectPreferredMatch, withPreDiscriminationLessonMatches } = require(path.join(root, "lib", "lessonSelection.ts"));
const { evaluateSemanticLessonCompatibility } = require(path.join(root, "lib", "ai", "semanticCompatibility.ts"));

const DEMO = "profile-oip-developer-demo";
const HERO = "demo-ki-sso-certificate-redirect-loop";
const PROTECTED = [DEMO, "profile-maesa-tech", "profile-fastdrop-logistics", "profile-pramana-consulting", "test-oip-regression"];
const fixture = JSON.parse(fs.readFileSync(path.join(root, "scripts", "fixtures", "todo041-cross-domain-fixtures.json"), "utf8"));

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function organizationSnapshot(organizationId) {
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
  return {
    digest: digest({ organization, knowledge, candidates, validations, memory, tickets, evidence, patterns, logs, metrics, sequence }),
    counts: { knowledge: knowledge.length, candidates: candidates.length, validations: validations.length, memory: memory.length, tickets: tickets.length, evidence: evidence.length, patterns: patterns.length }
  };
}

async function snapshots() {
  return Object.fromEntries(await Promise.all(PROTECTED.map(async (id) => [id, await organizationSnapshot(id)])));
}

function ticket(definition, prefix = "TODO046") {
  return {
    id: `${prefix}-${definition.id}`,
    ticketId: `${prefix}-${definition.id}`,
    customerName: "TODO-046 Audit",
    subject: definition.subject,
    description: definition.description,
    category: "General",
    status: "new",
    createdAt: "2026-07-22T00:00:00.000Z"
  };
}

function runPipeline(input, profile, items) {
  const understanding = understandForProfile(input, profile);
  const canonical = identifyCanonicalProblem(understanding, profile);
  const rawMatches = retrieveMemory(understanding, items, new Set());
  const matches = withPreDiscriminationLessonMatches(input, understanding, rawMatches, items, canonical.title);
  const compatibleMatches = matches.filter((match) => isRetrievalCandidateEligible(understanding, match.item, input));
  const selected = compatibleMatches.length ? selectPreferredMatch(input, compatibleMatches) : null;
  const topMatch = selected?.match ?? null;
  const lessonMatch = topMatch ? findMatchingLesson(input, topMatch.item) : null;
  const compatibility = topMatch ? assessCompatibilityDecision(understanding, topMatch.item, input) : null;
  const draft = draftResponse(input, understanding, topMatch, profile, false);
  return { understanding, canonical, rawMatches, matches, compatibleMatches, selected, topMatch, lessonMatch, compatibility, draft };
}

function compactTrace(result) {
  return {
    analyzerCategory: result.understanding.category,
    canonicalProblem: result.canonical.title,
    rawCandidates: result.rawMatches.slice(0, 5).map((match) => ({ id: match.item.id, score: match.matchScore })),
    selectedCanonical: result.topMatch?.item.id ?? null,
    selectedLesson: result.lessonMatch?.lesson.id ?? null,
    matchedSignals: result.lessonMatch?.matchedSignals ?? [],
    lessonEvidenceScore: result.lessonMatch?.score ?? 0,
    multiTokenEvidence: result.lessonMatch?.multiTokenMatches ?? 0,
    ticketEvidenceCoverage: result.lessonMatch?.ticketEvidenceCoverage ?? 0,
    canonicalRetrievalScore: result.topMatch?.matchScore ?? null,
    compatibility: result.compatibility?.state ?? "none",
    compatibilityReason: result.compatibility?.reason ?? null,
    draftAuthorizationPath: result.draft.source,
    finalDraftType: result.draft.basedOnKnowledgeIds.length ? "grounded" : "no_template",
    basedOnKnowledgeIds: result.draft.basedOnKnowledgeIds,
    confidenceNote: result.draft.confidenceNote
  };
}

function weakBoundaryCase(definition, baseItem, profile) {
  const input = ticket(definition, "TODO046-MATRIX");
  const rawUnderstanding = understandForProfile(input, profile);
  // The matrix isolates the final safety boundary. Keep the broad category
  // compatible in-memory even where the current classifier has no custom
  // persisted-domain rule; no database object or production classifier is changed.
  const category = definition.categoryOverride ?? definition.domain;
  const understanding = { ...rawUnderstanding, category };
  const candidate = { ...baseItem, category };
  const match = {
    item: candidate,
    matchScore: 50,
    matchReason: "controlled weak same-category candidate",
    matchedTags: [],
    matchedKeywords: [],
    matchedCategory: category
  };
  const lesson = findMatchingLesson(input, candidate);
  const compatibility = assessCompatibilityDecision(understanding, candidate, input);
  const draft = draftResponse(input, understanding, match, profile, false);
  return {
    id: definition.id,
    domain: definition.domain,
    analyzerCategory: rawUnderstanding.category,
    forcedCompatibleCategory: category,
    selectedCanonical: candidate.id,
    lesson: lesson?.lesson.id ?? null,
    matchedSignals: lesson?.matchedSignals ?? [],
    lessonEvidenceScore: lesson?.score ?? 0,
    multiTokenEvidence: lesson?.multiTokenMatches ?? 0,
    compatibility: compatibility.state,
    authorized: draft.basedOnKnowledgeIds.length > 0,
    draftSource: draft.source,
    passed: draft.basedOnKnowledgeIds.length === 0
  };
}

async function aiSafety(c02, profile) {
  const weak = c02.topMatch;
  assert.ok(weak, "C02 must retain a selected candidate for AI boundary checks.");
  const weakTicket = c02.ticket;
  const validLessonId = weak.item.lessons?.[0]?.id ?? null;
  const forged = draftResponse(weakTicket, c02.result.understanding, weak, profile, false, validLessonId ? {
    itemId: weak.item.id,
    lessonId: validLessonId,
    confidence: "high",
    reasoning: "Forged high-confidence compatibility."
  } : null);

  const calls = { compatible: 0, unavailable: 0, malformed: 0 };
  const provider = (key, response) => ({
    async discriminateMatch() {
      calls[key] += 1;
      return response;
    }
  });
  const understanding = c02.result.understanding;
  const compatible = await evaluateSemanticLessonCompatibility(provider("compatible", {
    ok: true, providerMode: "claude", providerLabel: "TODO-046 controlled Claude", latencyMs: 0,
    data: { isDistinctFromMatch: false, confidence: "high", reasoning: "Should not bypass deterministic compatibility." }
  }), weakTicket, understanding, weak.item);
  const unavailable = await evaluateSemanticLessonCompatibility(provider("unavailable", {
    ok: false, providerMode: "claude", providerLabel: "TODO-046 controlled failure", latencyMs: 0, error: "unavailable"
  }), weakTicket, understanding, weak.item);
  const malformed = await evaluateSemanticLessonCompatibility(provider("malformed", {
    ok: true, providerMode: "claude", providerLabel: "TODO-046 controlled malformed", latencyMs: 0,
    data: { isDistinctFromMatch: false, confidence: "invalid", reasoning: "Malformed confidence." }
  }), weakTicket, understanding, weak.item);
  return {
    highConfidence: { providerCalls: calls.compatible, authorized: Boolean(compatible.authorization), blocked: !compatible.authorization && calls.compatible === 0 },
    providerUnavailable: { providerCalls: calls.unavailable, authorized: Boolean(unavailable.authorization), blocked: !unavailable.authorization },
    malformed: { providerCalls: calls.malformed, authorized: Boolean(malformed.authorization), blocked: !malformed.authorization },
    forgedLesson: { authorized: forged.basedOnKnowledgeIds.length > 0, blocked: forged.basedOnKnowledgeIds.length === 0 }
  };
}

async function main() {
  const before = await snapshots();
  const [profile, items] = await Promise.all([persistence.getOrganizationProfile(DEMO), persistence.loadKnowledge(DEMO)]);
  assert.equal(items.length, 47, "Expected the current 47-item Developer Demo.");
  const c02Definition = fixture.controls.find((control) => control.id === "C02");
  assert.ok(c02Definition, "TODO-041 C02 fixture is required.");
  const c02Ticket = ticket(c02Definition, "TODO046-C02");
  const c02Result = runPipeline(c02Ticket, profile, items);
  assert.ok(c02Result.topMatch, "C02 must retain a candidate for reproduction.");
  const legacyWouldAuthorize = Boolean(c02Result.compatibleMatches.length && c02Result.topMatch && !c02Result.lessonMatch && c02Result.topMatch.matchScore > 0);
  const c02 = {
    ticket: { subject: c02Ticket.subject, description: c02Ticket.description },
    before: { ...compactTrace(c02Result), legacyWouldAuthorize, expectedBehavior: "no validated Organizational Memory authorization" },
    after: { ...compactTrace(c02Result), expectedBehavior: "no_template / human authoring", passed: c02Result.draft.basedOnKnowledgeIds.length === 0 }
  };

  const matrixDefinitions = [
    ["W01", "Billing", "demo-ki-duplicate-invoice-seat-change", "A billing question needs review.", "Please explain this charge."],
    ["W02", "Login", HERO, "I have a login question.", "Please help with account access."],
    ["W03", "API & Integrations", "demo-ki-webhook-signature-secret-rotation", "I have an integration question.", "Please explain a webhook setting."],
    ["W04", "Permissions & Access", "demo-ki-guest-workspace-access", "I have an access question.", "Please explain workspace permissions."],
    ["W05", "Reporting & Exports", "demo-ki-csv-export-encoding", "I have a report question.", "Please explain an export setting."],
    ["W06", "Mobile Application", "demo-ki-mobile-offline-sync-conflict", "I have a mobile question.", "Please explain a sync setting."],
    ["W07", "Notifications & Email", "demo-ki-email-notification-suppression", "I have a notification question.", "Please explain an email setting."],
    ["W08", "Billing", "demo-ki-duplicate-invoice-seat-change", "Generic invoice question.", "Can someone review our invoice?"],
    ["W09", "Login", HERO, "Generic login issue.", "I cannot describe any more detail."],
    ["W10", "API & Integrations", "demo-ki-webhook-signature-secret-rotation", "Generic webhook question.", "What does this integration do?"],
    ["W11", "Permissions & Access", "demo-ki-guest-workspace-access", "Generic access issue.", "Please help with access."],
    ["W12", "Reporting & Exports", "demo-ki-csv-export-encoding", "Generic report issue.", "The report needs review."],
    ["W13", "Mobile Application", "demo-ki-mobile-offline-sync-conflict", "Generic mobile issue.", "The mobile app needs review."],
    ["W14", "Notifications & Email", "demo-ki-email-notification-suppression", "Generic notification issue.", "Please review our notifications."]
  ];
  const matrix = matrixDefinitions.map(([id, domain, itemId, subject, description]) => {
    const item = items.find((candidate) => candidate.id === itemId);
    assert.ok(item, `Missing matrix item ${itemId}`);
    return weakBoundaryCase({ id, domain, subject, description }, item, profile);
  });

  const positiveDefinitions = [
    ["M02", "Sign-in keeps bouncing after the IdP signing credential was replaced", "Our SAML users return to the identity provider repeatedly after we renewed the certificate. authentication certificate redirect timeline."],
    ["M03", "SSO Redirect Loop After Certificate Rotation", "Certificate validity or signing metadata no longer matches. authentication certificate redirect timeline root cause 04 sso-certificate-redirect-loop"],
    ["M06", "Duplicate Invoice After Seat Changes", "billing duplicate invoice timeline root cause 01 duplicate-invoice-seat-change"],
    ["M15", "Webhook Signature Failure After Secret Rotation", "integrations webhook signature timeline root cause 01 webhook-signature-secret-rotation"],
    ["M16", "Permission Inheritance Delay", "permissions inheritance timeline root cause 01 permission-inheritance-delay"],
    ["M17", "Scheduled Report Timezone Boundary", "reporting report timezone timeline root cause 01 scheduled-report-timezone"],
    ["M18", "Email Notification Suppression", "notifications email timeline root cause 01 email-notification-suppression"]
  ];
  const positive = positiveDefinitions.map(([id, subject, description]) => {
    const result = runPipeline(ticket({ id, subject, description }, "TODO046-POSITIVE"), profile, items);
    return { id, selectedCanonical: result.topMatch?.item.id ?? null, selectedLesson: result.lessonMatch?.lesson.id ?? null, authorized: result.draft.basedOnKnowledgeIds.length > 0, source: result.draft.source };
  });

  // Expanded weak-fallback coverage: these inputs may produce a broad
  // deterministic category or weak retrieval candidates, but none contains
  // enough validated evidence to authorize a grounded response.
  const safetyFallbackDefinitions = [
    ["empty", "", ""],
    ["contradictory", "Refund request", "The account was never used, but employees logged in and exported data. Please investigate before deciding."],
    ["multilingual-ambiguous", "Necesito ayuda", "No entiendo este asunto y no puedo explicar el problema con claridad."],
    ["unsupported-request", "Legal advice", "Please provide legal strategy for a contract dispute and diagnose a medical condition."],
    ["malformed", "Unknown request", "%%%% @@@ ???"],
    ["provider-exhaustion", "Invoice review", "Please review this invoice; no validated root-cause details are available."],
    ["federated-credential-exposure", "Send the SAML signing credential", "Please send the signing credential and private key so I can complete the certificate rotation."]
  ];
  const safetyFallback = safetyFallbackDefinitions.map(([id, subject, description]) => {
    const result = runPipeline(ticket({ id, subject, description }, "TODO046-FALLBACK"), profile, items);
    return {
      id,
      category: result.understanding.category,
      canonical: result.canonical.id,
      source: result.draft.source,
      authorized: result.draft.basedOnKnowledgeIds.length > 0,
      basedOnKnowledgeIds: result.draft.basedOnKnowledgeIds
    };
  });

  const trustValues = [1, 50, 95, 100];
  const trust = trustValues.map((trustScore) => {
    const trustItems = items.map((item) => item.id === c02Result.topMatch.item.id ? { ...item, trustScore } : item);
    const result = runPipeline(c02Ticket, profile, trustItems);
    return { trustScore, authorized: result.draft.basedOnKnowledgeIds.length > 0, source: result.draft.source };
  });
  const strongBilling = positive.find((row) => row.id === "M06");
  const strongItems = items.map((item) => item.id === "demo-ki-duplicate-invoice-seat-change" ? { ...item, trustScore: 1 } : item.id === "demo-ki-annual-renewal-seat-count" ? { ...item, trustScore: 100 } : item);
  const strongTrustResult = runPipeline(ticket({ id: "TRUST-STRONG", subject: "Duplicate Invoice After Seat Changes", description: "billing duplicate invoice timeline root cause 01 duplicate-invoice-seat-change" }, "TODO046-TRUST"), profile, strongItems);
  const trustSafety = { weakFallback: trust, strongMatchAuthorized: Boolean(strongBilling?.authorized && strongTrustResult.draft.basedOnKnowledgeIds.includes("demo-ki-duplicate-invoice-seat-change")), strongSelected: strongTrustResult.topMatch?.item.id ?? null };

  const ai = await aiSafety({ ticket: c02Ticket, topMatch: c02Result.topMatch, result: c02Result }, profile);
  const todo030 = runPipeline(ticket({ id: "M07", subject: "Invoice mentions a webhook status word", description: "I need a billing invoice address changed. No integration or signature failure occurred." }, "TODO046-TODO030"), profile, items);
  const todo040 = runPipeline(ticket({ id: "G01", subject: "Staff bounce between app and identity provider after certificate renewal", description: "Ever since the identity provider's certificate renewal, employees bounce between the workspace and the provider and never get signed in." }, "TODO046-TODO040"), profile, items);

  const after = await snapshots();
  const protectedUnchanged = JSON.stringify(before) === JSON.stringify(after);
  const hero = (await persistence.loadKnowledge(DEMO)).find((item) => item.id === HERO);
  const provenance = { sourceTicketId: hero?.sourceTicketId ?? null, expected: "OIP-20230104-0001", intact: hero?.sourceTicketId === "OIP-20230104-0001" };
  const aiPass = Object.values(ai).every((entry) => entry.blocked === true);
  const matrixPass = matrix.every((entry) => entry.passed);
  const positivePass = positive.every((entry) => entry.authorized);
  const fallbackPass = safetyFallback.every((entry) => !entry.authorized && entry.source === "no_template");
  const exposure = safetyFallback.find((entry) => entry.id === "federated-credential-exposure");
  const securityBoundaryPass = exposure?.category === "Security Incident" && !exposure.authorized && exposure.source === "no_template";
  const verdict = !c02.after.passed || !matrixPass || !positivePass || !fallbackPass || !securityBoundaryPass || !aiPass || !protectedUnchanged || !provenance.intact ? "SAFETY_FAILURE_REMAINS" : "COMPLETED";
  const report = { verdict, c02, matrix, positive, safetyFallback, todo030: { authorized: todo030.draft.basedOnKnowledgeIds.length > 0, source: todo030.draft.source }, todo040: { authorized: todo040.draft.basedOnKnowledgeIds.length > 0, lesson: todo040.lessonMatch?.lesson.id ?? null }, trustSafety, ai, matrixPass, positivePass, fallbackPass, securityBoundaryPass, aiPass, protectedUnchanged, provenance, snapshots: { before, after } };
  console.log(`TODO046 C02 beforeLegacy=${legacyWouldAuthorize} afterAuthorized=${c02.after.finalDraftType === "grounded"} afterSource=${c02.after.draftAuthorizationPath}`);
  console.log(`TODO046 MATRIX ${matrixPass ? "PASS" : "FAIL"} unsafe=${matrix.filter((entry) => entry.authorized).length}/${matrix.length}`);
  console.log(`TODO046 POSITIVE ${positivePass ? "PASS" : "FAIL"} authorized=${positive.filter((entry) => entry.authorized).length}/${positive.length}`);
  console.log(`TODO046 FALLBACK ${fallbackPass ? "PASS" : "FAIL"} authorized=${safetyFallback.filter((entry) => entry.authorized).length}/${safetyFallback.length}`);
  console.log(`TODO046 SECURITY_BOUNDARY ${securityBoundaryPass ? "PASS" : "FAIL"} category=${exposure?.category ?? "none"}`);
  console.log(`TODO046 TRUST ${JSON.stringify(trustSafety)}`);
  console.log(`TODO046 AI ${JSON.stringify({ aiPass, ai })}`);
  console.log(`TODO046 TODO030 authorized=${todo030.draft.basedOnKnowledgeIds.length > 0} source=${todo030.draft.source}`);
  console.log(`TODO046 TODO040 authorized=${todo040.draft.basedOnKnowledgeIds.length > 0} lesson=${todo040.lessonMatch?.lesson.id ?? "none"}`);
  console.log(`TODO046 SNAPSHOTS ${protectedUnchanged ? "UNCHANGED" : "DRIFT DETECTED"}`);
  console.log(`TODO046 PROVENANCE ${JSON.stringify(provenance)}`);
  console.log(`TODO046 VERDICT ${verdict}`);
  console.log(JSON.stringify(report, null, 2));
  if (verdict !== "COMPLETED") process.exitCode = 2;
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  try { await prisma.$disconnect(); } catch { /* ignore shutdown errors */ }
});
