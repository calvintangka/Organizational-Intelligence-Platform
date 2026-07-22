/* TODO-044 — read-only cross-domain classification robustness probe. */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required; TODO-044 is read-only.");

const { prisma } = require(path.join(root, "lib", "server", "prisma.ts"));
const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const fixture = JSON.parse(fs.readFileSync(path.join(root, "scripts", "fixtures", "todo044-classification-fixtures.json"), "utf8"));
const todo041 = JSON.parse(fs.readFileSync(path.join(root, "scripts", "fixtures", "todo041-cross-domain-fixtures.json"), "utf8"));

const DEMO = "profile-oip-developer-demo";
const HERO = "demo-ki-sso-certificate-redirect-loop";
const PROTECTED = [DEMO, "profile-maesa-tech", "profile-fastdrop-logistics", "profile-pramana-consulting", "test-oip-regression"];

function digest(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

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
  return { digest: digest({ organization, knowledge, candidates, validations, memory, tickets, evidence, patterns, logs, metrics, sequence }), counts: { knowledge: knowledge.length, candidates: candidates.length, validations: validations.length, memory: memory.length, tickets: tickets.length, evidence: evidence.length, patterns: patterns.length } };
}

async function snapshots() { return Object.fromEntries(await Promise.all(PROTECTED.map(async (id) => [id, await organizationSnapshot(id)]))); }

function classify(definition, profile, prefix = "TODO044") {
  const ticket = { id: `${prefix}-${definition.id}`, ticketId: `${prefix}-${definition.id}`, subject: definition.subject, description: definition.description, category: "General", status: "new", createdAt: "2026-07-22T00:00:00.000Z" };
  const understanding = understandForProfile(ticket, profile);
  return {
    id: definition.id,
    domain: definition.domain ?? "control",
    expectedCategory: definition.expectedCategory,
    actualCategory: understanding.category,
    passed: understanding.category === definition.expectedCategory,
    detectedSignals: understanding.detectedSignals,
    tags: understanding.tags,
    summary: understanding.summary,
    competingCategory: null,
    score: null,
    ticket: { subject: definition.subject, description: definition.description }
  };
}

function domainMetrics(rows) {
  const total = rows.length;
  const correct = rows.filter((row) => row.passed).length;
  return { total, correct, rate: total ? Number((correct / total).toFixed(4)) : 0, failures: rows.filter((row) => !row.passed).map((row) => ({ id: row.id, expected: row.expectedCategory, actual: row.actualCategory, evidence: row.detectedSignals })) };
}

async function main() {
  const before = await snapshots();
  const profile = await persistence.getOrganizationProfile(DEMO);
  const items = await persistence.loadKnowledge(DEMO);
  if (items.length !== 45) throw new Error(`Expected 45 Developer Demo items, got ${items.length}.`);

  const baseline = {
    overall: { correct: 15, total: 70 },
    sso: { correct: 10, total: 10 },
    nonSso: { correct: 5, total: 60 },
    domains: { Billing: 3, "API & Integrations": 0, "Permissions & Access": 2, "Reporting & Exports": 0, "Mobile Application": 0, "Notifications & Email": 0, "Authentication / SSO": 10 }
  };
  const positives = todo041.domains.flatMap((domain) => domain.paraphrases.map((definition) => classify({ ...definition, domain: domain.domain, expectedCategory: domain.expectedCategory }, profile, "TODO044-TODO041")));
  const unseen = fixture.unseen.map((definition) => classify(definition, profile, "TODO044-UNSEEN"));
  const negatives = fixture.negativeControls.map((definition) => classify(definition, profile, "TODO044-NEGATIVE"));
  const ambiguity = fixture.ambiguity.map((definition) => classify(definition, profile, "TODO044-AMBIGUITY"));
  const positiveByDomain = Object.fromEntries(todo041.domains.map((domain) => [domain.domain, domainMetrics(positives.filter((row) => row.domain === domain.domain))]));
  const overall = domainMetrics(positives);
  const sso = domainMetrics(positives.filter((row) => row.domain === "Authentication / SSO"));
  const nonSso = domainMetrics(positives.filter((row) => row.domain !== "Authentication / SSO"));
  const unseenMetrics = domainMetrics(unseen);
  const negativeFalseClassifications = negatives.filter((row) => row.actualCategory !== row.expectedCategory);
  const ambiguityMetrics = domainMetrics(ambiguity);

  const possessiveDefinitions = [
    { id: "POS01", domain: "API & Integrations", expectedCategory: "API & Integrations", subject: "Provider's webhook is rejected", description: "The provider's callback signature fails the listener authenticity check." },
    { id: "POS02", domain: "Billing", expectedCategory: "Billing", subject: "Customer's invoice is duplicated", description: "The customer's statement contains a second charge after a seat adjustment." },
    { id: "POS03", domain: "Permissions & Access", expectedCategory: "Permissions & Access", subject: "User's permission is missing", description: "The user's role did not inherit access to the workspace." },
    { id: "POS04", domain: "Mobile Application", expectedCategory: "Mobile Application", subject: "Device's offline state will not sync", description: "The device's local update is rejected when the phone reconnects." },
    { id: "POS05", domain: "Reporting & Exports", expectedCategory: "Reporting & Exports", subject: "Report's date range is wrong", description: "The report's dashboard includes rows outside the selected period." }
  ].map((definition) => classify(definition, profile, "TODO044-POSSESSIVE"));

  // Trust is not an analyzer input. Re-run a representative classification
  // while changing only in-memory item trust to make that invariant explicit.
  const trustTicket = { id: "TRUST-CLASSIFICATION", ticketId: "TRUST-CLASSIFICATION", subject: "The downloaded CSV is unreadable", description: "The export completes, but accented names become replacement characters in the spreadsheet.", category: "General", status: "new", createdAt: "2026-07-22T00:00:00.000Z" };
  const trustClassifications = [1, 50, 95, 100].map((trustScore) => ({ trustScore, category: understandForProfile(trustTicket, profile).category }));
  const trustIndependent = trustClassifications.every((entry) => entry.category === "Reporting & Exports");

  const after = await snapshots();
  const protectedUnchanged = JSON.stringify(before) === JSON.stringify(after);
  const hero = items.find((item) => item.id === HERO);
  const provenance = { sourceTicketId: hero?.sourceTicketId ?? null, expected: "OIP-20230104-0001", intact: hero?.sourceTicketId === "OIP-20230104-0001" };
  const safetyRegression = negativeFalseClassifications.length > 0 || !ambiguityMetrics.correct || !trustIndependent || !protectedUnchanged || !provenance.intact;
  const classificationImproved = overall.correct > baseline.overall.correct && nonSso.correct > baseline.nonSso.correct && unseenMetrics.correct >= 27;
  const verdict = safetyRegression ? "SAFETY_REGRESSION" : classificationImproved ? "COMPLETED_WITH_REMAINING_LAYERS" : "CLASSIFICATION_WEAKNESS_REMAINS";
  const report = { verdict, baseline, overall, sso, nonSso, positiveByDomain, positives, unseen: { ...unseenMetrics, rows: unseen }, negatives: { total: negatives.length, falseClassificationCount: negativeFalseClassifications.length, falseClassificationRate: negatives.length ? Number((negativeFalseClassifications.length / negatives.length).toFixed(4)) : 0, rows: negatives }, ambiguity: { ...ambiguityMetrics, rows: ambiguity }, possessive: { ...domainMetrics(possessiveDefinitions), rows: possessiveDefinitions }, trust: { independent: trustIndependent, cases: trustClassifications }, protectedUnchanged, provenance, snapshots: { before, after } };
  console.log(`TODO044 BASELINE overall=${baseline.overall.correct}/${baseline.overall.total} nonSso=${baseline.nonSso.correct}/${baseline.nonSso.total}`);
  console.log(`TODO044 CLASSIFICATION overall=${overall.correct}/${overall.total} sso=${sso.correct}/${sso.total} nonSso=${nonSso.correct}/${nonSso.total} unseen=${unseenMetrics.correct}/${unseenMetrics.total}`);
  console.log(`TODO044 NEGATIVES false=${negativeFalseClassifications.length}/${negatives.length} ambiguity=${ambiguityMetrics.correct}/${ambiguityMetrics.total}`);
  console.log(`TODO044 POSSESSIVE ${domainMetrics(possessiveDefinitions).correct}/${possessiveDefinitions.length} trustIndependent=${trustIndependent}`);
  console.log(`TODO044 SNAPSHOTS ${protectedUnchanged ? "UNCHANGED" : "DRIFT DETECTED"}`);
  console.log(`TODO044 PROVENANCE ${JSON.stringify(provenance)}`);
  console.log(`TODO044 VERDICT ${verdict}`);
  console.log(JSON.stringify(report, null, 2));
  if (safetyRegression) process.exitCode = 2;
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { try { await prisma.$disconnect(); } catch { /* ignore shutdown errors */ } });

