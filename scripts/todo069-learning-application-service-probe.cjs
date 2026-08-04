const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });
const learning = require(path.join(root, "lib", "application", "learning", "reflectionCommands.ts"));
const { understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { seedOrganizationProfiles } = require(path.join(root, "data", "seedOrganizationProfiles.ts"));

const profile = seedOrganizationProfiles.find((item) => item.id === "profile-maesa-tech");
assert.ok(profile, "TODO-069 probe profile must exist");

function ticket(id, description, language = "en") {
  return {
    id: `ticket-${id}`,
    ticketId: `TODO069-${id}`,
    customerName: "Customer",
    subject: language === "id" ? "Masalah akses" : "Support issue",
    description,
    category: "General",
    status: "drafted",
    createdAt: new Date().toISOString()
  };
}

function item(id, overrides = {}) {
  return {
    id,
    organizationId: profile.id,
    title: "Single sign-on certificate issue",
    canonicalProblemTitle: "Single sign-on certificate issue",
    problem: "A certificate configuration causes a single sign-on redirect loop.",
    problemSummary: "A certificate configuration causes a single sign-on redirect loop.",
    approvedAnswer: "Validate the certificate chain and update the identity provider configuration.",
    customerResponseTemplate: "Validate the certificate chain and update the identity provider configuration.",
    internalGuidance: "Use the validated certificate rotation procedure.",
    category: "Authentication",
    tags: ["sso", "certificate"],
    sourceTicketId: "TODO069-SOURCE",
    timesReused: 1,
    timesSeen: 3,
    createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    trustScore: 70,
    revision: 0,
    lifecycleState: "active",
    lessons: [{
      id: `${id}-lesson`,
      title: "Certificate rotation lesson",
      rootCause: "The identity provider certificate is expired or mismatched.",
      solution: "Validate the certificate chain and rotate the signing certificate.",
      customerResponse: "Validate the certificate chain and rotate the signing certificate.",
      signals: ["certificate", "redirect loop"],
      createdAt: new Date().toISOString(),
      sourceTicketId: "TODO069-SOURCE"
    }],
    knowledgeVersions: [],
    ...overrides
  };
}

function fakePersistence({ fail = false, initialItems = [], authority = "local" } = {}) {
  const knowledge = new Map(initialItems.map((entry) => [entry.id, entry]));
  const candidates = new Map();
  const validations = new Map();
  const changes = new Map();
  return {
    knowledge,
    context: { organizationId: profile.id, authority, requestId: "todo069-probe", actorContext: { id: "probe-actor", name: "TODO-069 Probe" } },
    async commitValidatedMemoryChange(request) {
      const organizationId = profile.id;
      if (fail) throw new Error("injected rollback persistence failure");
      for (const owned of [request.candidate, request.validation, request.memoryChange, request.knowledgeItem]) {
        if (owned.organizationId && owned.organizationId !== organizationId) throw new Error("tenant conflict");
      }
      const existingValidation = validations.get(request.validation.id);
      if (existingValidation) {
        assert.equal(existingValidation.candidateId, request.candidate.id);
        return {
          replayed: true,
          knowledgeRevision: knowledge.get(request.knowledgeItem.id).revision,
          trustApplied: true,
          candidate: candidates.get(request.candidate.id),
          validation: existingValidation,
          memoryChange: changes.get(request.memoryChange.id),
          knowledgeItem: knowledge.get(request.knowledgeItem.id),
          auditSummary: { organizationId, actorId: "probe-actor", actor: "TODO-069 Probe", sourceTicketIds: request.candidate.sourceTicketIds, decision: existingValidation.decision, changeType: request.memoryChange.changeType }
        };
      }
      const existing = knowledge.get(request.knowledgeItem.id);
      if (request.expectedKnowledgeRevision === null && existing) throw new Error("promotion conflict: knowledge item already exists");
      if (request.expectedKnowledgeRevision !== null && (existing?.revision ?? 0) !== request.expectedKnowledgeRevision) throw new Error("stale revision conflict");
      const committedKnowledge = { ...request.knowledgeItem, organizationId, revision: (request.expectedKnowledgeRevision ?? 0) + 1 };
      const committedCandidate = { ...request.candidate, organizationId, status: "validated" };
      candidates.set(committedCandidate.id, committedCandidate);
      validations.set(request.validation.id, request.validation);
      changes.set(request.memoryChange.id, request.memoryChange);
      knowledge.set(committedKnowledge.id, committedKnowledge);
      return {
        replayed: false,
        knowledgeRevision: committedKnowledge.revision,
        trustApplied: true,
        candidate: committedCandidate,
        validation: request.validation,
        memoryChange: request.memoryChange,
        knowledgeItem: committedKnowledge,
        auditSummary: { organizationId, actorId: "probe-actor", actor: "TODO-069 Probe", sourceTicketIds: committedCandidate.sourceTicketIds, decision: request.validation.decision, changeType: request.memoryChange.changeType }
      };
    }
  };
}

function reflectionCommand(id, currentTicket, reviewedResponse, existingMatch = null, languageContext = {}) {
  const understanding = understandForProfile(currentTicket, profile);
  const result = learning.generateReflectionCommand({
    organizationId: profile.id,
    actor: { id: "probe-actor", name: "TODO-069 Probe" },
    authority: "local",
    requestId: `todo069-reflection-${id}`,
    organizationProfile: profile,
    ticket: currentTicket,
    understanding,
    reviewedResponse,
    existingMatch,
    languageContext
  });
  return { result, understanding };
}

async function promote(id, currentTicket, reviewedResponse, generated, persistence, extra = {}) {
  return learning.promoteKnowledgeCommand({
    organizationId: profile.id,
    actor: { id: "probe-actor", name: "TODO-069 Probe" },
    authority: extra.authority ?? "local",
    requestId: `todo069-promote-${id}`,
    idempotencyKey: `todo069-key-${id}`,
    organizationProfile: profile,
    ticket: currentTicket,
    understanding: generated.understanding,
    reviewedResponse,
    reflection: generated.result.reflection,
    lessonDraft: extra.lessonDraft,
    problemName: extra.problemName,
    knowledgeItems: extra.knowledgeItems ?? [],
    validationRecords: extra.validationRecords ?? [],
    currentOrgMetrics: extra.currentOrgMetrics
  }, { persistence });
}

async function main() {
  const newPersistence = fakePersistence();
  const newTicket = ticket("NEW", "The application crashes on startup after the latest update.");
  const newGenerated = reflectionCommand("new", newTicket, "Please reinstall the latest version and send the error details.");
  assert.equal(newGenerated.result.reflection.action, "create_new");
  const newResult = await promote("new", newTicket, "Please reinstall the latest version and send the error details.", newGenerated, newPersistence, {
    lessonDraft: { mode: "new", rootCause: "The application starts with an incompatible update state.", solution: "Reinstall the supported version.", customerResponse: "Please reinstall the supported version.", signals: ["crashes on startup"] }
  });
  assert.equal(newResult.committed.replayed, false);
  assert.equal(newResult.candidate.status, "validated");
  assert.ok(newResult.knowledgeItem.lessons.length === 1, "new learning creates a lesson");
  assert.equal(newResult.followUp[0].type, "knowledge_promoted");

  const known = item("todo069-known");
  const knownPersistence = fakePersistence({ initialItems: [known] });
  const knownTicket = ticket("KNOWN", "Our single sign-on certificate creates a redirect loop.");
  const knownMatch = { item: known, similarity: 60, reason: "partial problem match" };
  const strengthen = reflectionCommand("strengthen", knownTicket, "Validate the certificate chain and rotate the signing certificate.", knownMatch);
  assert.equal(strengthen.result.reflection.action, "merge_existing");
  const strengthenResult = await promote("strengthen", knownTicket, "Validate the certificate chain and rotate the signing certificate.", strengthen, knownPersistence, {
    knowledgeItems: [known],
    lessonDraft: { mode: "improves_existing", existingLessonId: known.lessons[0].id, rootCause: "The identity provider certificate is mismatched.", solution: "Rotate the signing certificate after validating the chain.", customerResponse: "Validate the certificate chain and rotate the signing certificate.", signals: ["certificate", "redirect loop"] }
  });
  assert.equal(strengthenResult.action, "merge_existing");
  assert.equal(strengthenResult.ticketReflection.lessonReinforcedId, known.lessons[0].id);

  const replay = await promote("strengthen", knownTicket, "Validate the certificate chain and rotate the signing certificate.", strengthen, knownPersistence, {
    knowledgeItems: [known],
    lessonDraft: { mode: "improves_existing", existingLessonId: known.lessons[0].id, rootCause: "The identity provider certificate is mismatched.", solution: "Rotate the signing certificate after validating the chain.", customerResponse: "Validate the certificate chain and rotate the signing certificate.", signals: ["certificate", "redirect loop"] }
  });
  assert.equal(replay.replayed, true, "same promotion command replays");
  await assert.rejects(() => promote("strengthen", knownTicket, "different response payload", strengthen, knownPersistence, { knowledgeItems: [known] }), (error) => error.failure?.errorClass === "duplicate_promotion");

  const knownAfterStrengthen = strengthenResult.knowledgeItem;
  const versionTicket = ticket("VERSION", "The single sign-on certificate is not accepted after rotation.");
  const versionGenerated = reflectionCommand("version", versionTicket, "Contact the identity provider and replace the certificate with a newly issued chain.", { item: knownAfterStrengthen, similarity: 95, reason: "strong known problem" });
  assert.equal(versionGenerated.result.reflection.action, "create_version");
  const versionResult = await promote("version", versionTicket, "Contact the identity provider and replace the certificate with a newly issued chain.", versionGenerated, knownPersistence, { knowledgeItems: [knownAfterStrengthen] });
  assert.equal(versionResult.action, "create_version");
  assert.equal(versionResult.knowledgeItem.knowledgeVersions.length, (knownAfterStrengthen.knowledgeVersions ?? []).length + 1);

  const trustTicket = ticket("TRUST", "The single sign-on certificate issue is resolved by the existing procedure.");
  const trustGenerated = reflectionCommand("trust", trustTicket, known.customerResponseTemplate, { item: known, similarity: 95, reason: "strong known problem" });
  assert.equal(trustGenerated.result.reflection.action, "trust_update_only");
  const trustResult = await promote("trust", trustTicket, known.customerResponseTemplate, trustGenerated, fakePersistence({ initialItems: [known] }), { knowledgeItems: [known] });
  assert.equal(trustResult.action, "trust_update_only");
  assert.ok(typeof trustResult.trustDelta === "number");

  const indonesian = ticket("ID", "Sertifikat single sign-on menyebabkan pengalihan login berulang.", "id");
  const crossLanguage = reflectionCommand("cross-language", indonesian, "Silakan validasi rantai sertifikat dan putar sertifikat penandatangan.", { item: known, similarity: 95, reason: "cross-language match" }, { responseLanguage: "id", internalLanguage: "en" });
  assert.equal(crossLanguage.result.reflection.action, "trust_update_only", "language-neutral similarity must avoid duplicate version");

  const unsafe = learning.validateReflectionCommand({
    organizationId: profile.id,
    actor: { id: "probe-actor", name: "TODO-069 Probe" },
    authority: "local",
    requestId: "todo069-unsafe",
    reflection: newGenerated.result.reflection,
    lessonDraft: { mode: "new", rootCause: "Use password: secret123", solution: "Temporary workaround", customerResponse: "Reply to customer@example.com", signals: ["ticket #123456"] },
    safetyContext: { customerName: newTicket.customerName, organizationName: profile.name, sourceTicketId: newTicket.ticketId, sourceTicketText: newTicket.description }
  });
  assert.equal(unsafe.accepted, false);
  assert.ok(unsafe.reasons.length >= 2);

  await assert.rejects(() => promote("rollback", newTicket, "A safe response.", newGenerated, fakePersistence({ fail: true }), { lessonDraft: { mode: "new", rootCause: "A stable root cause.", solution: "A stable solution.", customerResponse: "A stable response.", signals: ["startup"] } }), (error) => error.failure?.errorClass === "rollback");
  const stalePersistence = fakePersistence({ initialItems: [{ ...known, revision: 5 }] });
  await assert.rejects(() => promote("stale", knownTicket, "A safe response.", strengthen, stalePersistence, { knowledgeItems: [{ ...known, revision: 4 }] }), (error) => error.failure?.errorClass === "stale_revision");
  assert.throws(() => learning.generateReflectionCommand({
    organizationId: "other-org",
    actor: { id: "probe-actor", name: "TODO-069 Probe" },
    authority: "local",
    requestId: "todo069-scope",
    organizationProfile: profile,
    ticket: newTicket,
    understanding: newGenerated.understanding,
    reviewedResponse: "safe",
    existingMatch: null
  }), (error) => error.failure?.errorClass === "tenant_mismatch");

  const local = await promote("parity-local", newTicket, "A safe response.", newGenerated, fakePersistence(), { lessonDraft: { mode: "new", rootCause: "A stable root cause.", solution: "A stable solution.", customerResponse: "A stable response.", signals: ["startup"] } });
  const server = await promote("parity-server", newTicket, "A safe response.", newGenerated, fakePersistence({ authority: "server" }), { authority: "server", lessonDraft: { mode: "new", rootCause: "A stable root cause.", solution: "A stable solution.", customerResponse: "A stable response.", signals: ["startup"] } });
  assert.deepEqual(Object.keys(local.committed).sort(), Object.keys(server.committed).sort(), "local/server promotion result shape parity");

  console.log("TODO-069 learning application service probe: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
