/*
 * TODO-025E — Mature Memory Integrity & Trust Reconstruction audit.
 *
 * A read-only, PostgreSQL-first audit of profile-oip-developer-demo. It does NOT
 * treat the TODO-025C simulator as the source of truth: every primary assertion
 * is reconstructed from durable database records and the production trust rules
 * in lib/trustEngine.ts. Zero persistent writes. The only simulator import is a
 * clearly isolated, secondary sanity cross-check at the very end.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

const { getPrismaClient } = require(path.join(root, "lib", "server", "prisma.ts"));
const {
  TRUST_INITIAL,
  TRUST_HUMAN_REUSE,
  TRUST_AUTO_SUCCESS,
  TRUST_HUMAN_EDIT_PENALTY,
  TRUST_WRONG_ANSWER,
  clampTrust
} = require(path.join(root, "lib", "trustEngine.ts"));
const { resolveLessonIdForItem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { stableStringify } = require(path.join(root, "lib", "persistence", "migrationExportDigest.ts"));
const {
  DEVELOPER_DEMO_ORGANIZATION_ID,
  PROTECTED_ORGANIZATION_IDS,
  developerDemoActors
} = require(path.join(root, "data", "developerDemoFoundation.ts"));

const O = DEVELOPER_DEMO_ORGANIZATION_ID;
const HERO_TITLE = "SSO Redirect Loop After Certificate Rotation";

const findings = [];
function finding(classification, severity, section, summary, evidence) {
  findings.push({ classification, severity, section, summary, evidence });
}

const summary = {};
function digest(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}
function iso(value) {
  return value instanceof Date ? value.toISOString() : value;
}
function trustOf(state) {
  if (state === null || state === undefined) return null;
  const value = state.trustScore;
  return typeof value === "number" ? value : null;
}
function asc(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

async function loadOrganization(prisma) {
  const where = { organizationId: O };
  const [organization, memberships, users, knowledge, candidates, validations, memory, evidence, tickets, patterns, metrics, sequence] =
    await Promise.all([
      prisma.organization.findUnique({ where: { id: O } }),
      prisma.organizationMembership.findMany({ where, orderBy: { userId: "asc" } }),
      prisma.user.findMany({ where: { id: { startsWith: "user-oip-demo-" } }, orderBy: { id: "asc" } }),
      prisma.knowledgeItem.findMany({ where, orderBy: { id: "asc" } }),
      prisma.knowledgeCandidate.findMany({ where, orderBy: { id: "asc" } }),
      prisma.validationRecord.findMany({ where, orderBy: { id: "asc" } }),
      prisma.memoryChangeRecord.findMany({ where, orderBy: { id: "asc" } }),
      prisma.trustEvidence.findMany({ where, orderBy: { id: "asc" } }),
      prisma.ticketRecord.findMany({ where, orderBy: { ticketId: "asc" } }),
      prisma.emergingPattern.findMany({ where, orderBy: { id: "asc" } }),
      prisma.orgMetrics.findUnique({ where: { organizationId: O } }),
      prisma.ticketSequence.findUnique({ where: { organizationId: O } })
    ]);
  return { organization, memberships, users, knowledge, candidates, validations, memory, evidence, tickets, patterns, metrics, sequence };
}

function normalizeKnowledgeContent(row) {
  // Durable current knowledge as a comparable snapshot (revision is a persistence
  // artifact absent from the historical afterState snapshots).
  const content = row.content ?? {};
  return {
    id: row.id,
    organizationId: row.organizationId,
    trustScore: row.trustScore,
    timesReused: row.timesReused,
    timesSeen: row.timesSeen,
    lessons: content.lessons ?? [],
    knowledgeVersions: content.knowledgeVersions ?? [],
    lifecycleState: row.lifecycleState
  };
}
function normalizeAfterState(after) {
  return {
    id: after.id,
    organizationId: after.organizationId,
    trustScore: after.trustScore,
    timesReused: after.timesReused,
    timesSeen: after.timesSeen,
    lessons: after.lessons ?? [],
    knowledgeVersions: after.knowledgeVersions ?? [],
    lifecycleState: after.lifecycleState
  };
}

function auditTrust(data) {
  const { knowledge, memory, candidates, tickets, evidence } = data;
  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  const ticketById = new Map(tickets.map((t) => [t.ticketId, t]));
  const evidenceByValidation = new Set(evidence.map((e) => e.validationRecordId));
  const memByItem = new Map();
  for (const m of memory) {
    if (!memByItem.has(m.knowledgeItemId)) memByItem.set(m.knowledgeItemId, []);
    memByItem.get(m.knowledgeItemId).push(m);
  }

  let exact = 0;
  let mismatches = 0;
  let baselineOk = 0;
  let chainOk = 0;
  let finalStateMatch = 0;
  let deltaLegal = 0;
  let deltaTotal = 0;
  let explainedTrustEvents = 0;
  let trustEvents = 0;
  let modeInferredEvents = 0;
  let trustEventsMissingEvidence = 0;
  let outOfRange = 0;

  const legalRawDeltas = new Set([TRUST_HUMAN_REUSE, TRUST_AUTO_SUCCESS, TRUST_WRONG_ANSWER, TRUST_HUMAN_REUSE + TRUST_HUMAN_EDIT_PENALTY, TRUST_WRONG_ANSWER + TRUST_HUMAN_EDIT_PENALTY]);

  for (const item of knowledge) {
    const chain = (memByItem.get(item.id) ?? []).slice().sort((a, b) => asc(iso(a.timestamp), iso(b.timestamp)) || asc(a.id, b.id));
    if (chain.length === 0) {
      finding("DATA_CORRUPTION", "high", "B", `KnowledgeItem ${item.id} has no MemoryChangeRecord history.`, { itemId: item.id });
      mismatches += 1;
      continue;
    }
    // Baseline.
    const first = chain[0];
    if (first.beforeState === null && trustOf(first.afterState) === TRUST_INITIAL) baselineOk += 1;
    else finding("DATA_CORRUPTION", "high", "B", `KnowledgeItem ${item.id} baseline is not a null-before / trust ${TRUST_INITIAL} creation.`, { itemId: item.id, firstBefore: first.beforeState, firstTrust: trustOf(first.afterState) });

    // Chain integrity + trust reconstruction.
    let reconstructed = TRUST_INITIAL;
    let chainIntact = true;
    for (let i = 0; i < chain.length; i += 1) {
      const m = chain[i];
      const before = trustOf(m.beforeState);
      const after = trustOf(m.afterState);
      if (after < 0 || after > 100) { outOfRange += 1; finding("DATA_CORRUPTION", "high", "B", `Trust out of range on ${m.id}: ${after}.`, { memoryId: m.id, after }); }
      if (i > 0 && stableStringify(m.beforeState) !== stableStringify(chain[i - 1].afterState)) {
        chainIntact = false;
        finding("DATA_CORRUPTION", "high", "B", `Broken memory chain for ${item.id} at ${m.id}: beforeState != prior afterState.`, { itemId: item.id, memoryId: m.id });
      }
      const delta = (after ?? 0) - (before ?? TRUST_INITIAL);
      if (m.changeType === "trust_update_only") {
        trustEvents += 1;
        deltaTotal += 1;
        if (legalRawDeltas.has(delta) && after === clampTrust((before ?? TRUST_INITIAL) + delta)) deltaLegal += 1;
        else finding("DATA_CORRUPTION", "medium", "B", `Illegal trust delta ${delta} on ${m.id}.`, { memoryId: m.id, before, after, delta });

        // Independent production-rule attribution from durable signals.
        const candidate = candidateById.get(m.candidateId);
        const sourceTickets = (candidate?.sourceTicketIds ?? []).map((tid) => ticketById.get(tid)).filter(Boolean);
        const hasEvidence = evidenceByValidation.has(m.validationRecordId);
        const allEdited = sourceTickets.length > 0 && sourceTickets.every((t) => t.resolution?.humanEdited === true);
        const anyRejected = sourceTickets.some((t) => t.status === "rejected");
        let expectedRaw = null;
        let inferredMode = null;
        if (delta < 0) { expectedRaw = TRUST_WRONG_ANSWER; inferredMode = anyRejected ? "human_wrong(ticket=rejected)" : "wrong"; }
        else if (hasEvidence) { expectedRaw = TRUST_HUMAN_REUSE + (allEdited ? TRUST_HUMAN_EDIT_PENALTY : 0); inferredMode = "human_reuse(evidence)"; }
        else { expectedRaw = TRUST_AUTO_SUCCESS; inferredMode = "automatic(no-evidence)"; modeInferredEvents += 1; }
        if (expectedRaw === delta) explainedTrustEvents += 1;
        else finding("AUDITABILITY_GAP", "low", "B", `Trust event ${m.id} delta ${delta} not explained by durable signals (expected ${expectedRaw}).`, { memoryId: m.id, delta, expectedRaw, hasEvidence, allEdited, anyRejected });
        // A positive human reuse must carry evidence; auto/wrong legitimately need none.
        if (delta > 0 && !hasEvidence && !(expectedRaw === TRUST_AUTO_SUCCESS)) {
          trustEventsMissingEvidence += 1;
          finding("DATA_CORRUPTION", "medium", "B", `Positive human trust event ${m.id} lacks TrustEvidence.`, { memoryId: m.id, delta });
        }
        reconstructed = clampTrust(reconstructed + delta);
      } else {
        if (delta !== 0) finding("DATA_CORRUPTION", "medium", "B", `Non-trust event ${m.id} (${m.changeType}) changed trust by ${delta}.`, { memoryId: m.id, changeType: m.changeType, delta });
      }
    }
    if (chainIntact) chainOk += 1;

    // Final reconstructed trust and final state vs current knowledge.
    const finalAfter = trustOf(chain[chain.length - 1].afterState);
    if (reconstructed === item.trustScore && finalAfter === item.trustScore) exact += 1;
    else { mismatches += 1; finding("DATA_CORRUPTION", "high", "B", `Reconstructed trust ${reconstructed} / final snapshot ${finalAfter} != persisted ${item.trustScore} for ${item.id}.`, { itemId: item.id, reconstructed, finalAfter, persisted: item.trustScore }); }
    if (digest(normalizeAfterState(chain[chain.length - 1].afterState)) === digest(normalizeKnowledgeContent(item))) finalStateMatch += 1;
    else finding("DATA_CORRUPTION", "high", "D", `Final afterState snapshot does not equal current KnowledgeItem for ${item.id}.`, { itemId: item.id });
  }

  summary.trust = { itemsAudited: knowledge.length, exactTrustMatches: exact, mismatches, baselineOk, chainIntact: chainOk, finalStateMatch, trustEvents, deltaLegal, deltaTotal, explainedTrustEvents, modeInferredEvents, trustEventsMissingEvidence, outOfRange };
}

function auditEvidence(data) {
  const { evidence, knowledge, validations, tickets } = data;
  const knowledgeIds = new Set(knowledge.map((k) => k.id));
  const validationById = new Map(validations.map((v) => [v.id, v]));
  const ticketById = new Map(tickets.map((t) => [t.ticketId, t]));
  const validationDelta = new Map();
  // Reconstruct each validation's trust-event delta from durable memory snapshots.
  for (const m of data.memory) {
    if (m.changeType === "trust_update_only") {
      validationDelta.set(m.validationRecordId, (trustOf(m.afterState) ?? 0) - (trustOf(m.beforeState) ?? TRUST_INITIAL));
    }
  }
  const keys = new Set();
  let valid = 0, orphanKnowledge = 0, orphanTicket = 0, orphanValidation = 0, badType = 0, deltaMismatch = 0, chronologyBad = 0, crossOrg = 0, duplicates = 0;
  for (const e of evidence) {
    let ok = true;
    if (e.organizationId !== O) { crossOrg += 1; ok = false; finding("DATA_CORRUPTION", "high", "C", `TrustEvidence ${e.id} cross-org.`, { id: e.id }); }
    if (!knowledgeIds.has(e.knowledgeItemId)) { orphanKnowledge += 1; ok = false; finding("DATA_CORRUPTION", "high", "C", `TrustEvidence ${e.id} unresolved knowledgeItemId.`, { id: e.id }); }
    const ticket = ticketById.get(e.sourceTicketId);
    if (!ticket) { orphanTicket += 1; ok = false; finding("DATA_CORRUPTION", "high", "C", `TrustEvidence ${e.id} unresolved sourceTicketId.`, { id: e.id, sourceTicketId: e.sourceTicketId }); }
    const validation = validationById.get(e.validationRecordId);
    if (!validation) { orphanValidation += 1; ok = false; finding("DATA_CORRUPTION", "high", "C", `TrustEvidence ${e.id} unresolved validationRecordId.`, { id: e.id }); }
    if (e.trustEventType !== "HUMAN_REUSE") { badType += 1; ok = false; finding("DATA_CORRUPTION", "medium", "C", `TrustEvidence ${e.id} unexpected type ${e.trustEventType}.`, { id: e.id }); }
    const expectDelta = validationDelta.get(e.validationRecordId);
    if (expectDelta !== undefined && e.delta !== expectDelta) { deltaMismatch += 1; ok = false; finding("DATA_CORRUPTION", "medium", "C", `TrustEvidence ${e.id} delta ${e.delta} != event delta ${expectDelta}.`, { id: e.id }); }
    if (ticket && iso(ticket.createdAt) > iso(e.createdAt)) { chronologyBad += 1; ok = false; finding("DATA_CORRUPTION", "medium", "C", `TrustEvidence ${e.id} predates its source ticket.`, { id: e.id }); }
    if (validation && iso(validation.timestamp) !== iso(e.createdAt)) { chronologyBad += 1; finding("AUDITABILITY_GAP", "low", "C", `TrustEvidence ${e.id} createdAt != validation timestamp.`, { id: e.id }); }
    const key = `${e.organizationId}|${e.knowledgeItemId}|${e.sourceTicketId}|${e.trustEventType}`;
    if (keys.has(key)) { duplicates += 1; ok = false; finding("DATA_CORRUPTION", "high", "C", `Duplicate TrustEvidence key ${key}.`, { id: e.id }); }
    keys.add(key);
    if (ok) valid += 1;
  }
  summary.evidence = { audited: evidence.length, valid, orphanKnowledge, orphanTicket, orphanValidation, badType, deltaMismatch, chronologyBad, crossOrg, duplicates, uniqueKeys: keys.size };
}

function auditValidationMemory(data) {
  const { validations, memory, candidates, knowledge } = data;
  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  const knowledgeIds = new Set(knowledge.map((k) => k.id));
  const validationById = new Map(validations.map((v) => [v.id, v]));
  const memberIds = new Set(developerDemoActors.map((a) => a.id));
  let vOk = 0, vBad = 0;
  const candidateValidationCount = new Map();
  for (const v of validations) {
    let ok = true;
    if (v.organizationId !== O) { ok = false; finding("DATA_CORRUPTION", "high", "D", `Validation ${v.id} cross-org.`, { id: v.id }); }
    if (!candidateById.has(v.candidateId)) { ok = false; finding("DATA_CORRUPTION", "high", "D", `Validation ${v.id} unresolved candidate.`, { id: v.id }); }
    if (v.knowledgeItemId && !knowledgeIds.has(v.knowledgeItemId)) { ok = false; finding("DATA_CORRUPTION", "high", "D", `Validation ${v.id} unresolved knowledge.`, { id: v.id }); }
    if (!v.actorId || !memberIds.has(v.actorId)) { ok = false; finding("DATA_CORRUPTION", "high", "I", `Validation ${v.id} actorId unresolved: ${v.actorId}.`, { id: v.id }); }
    candidateValidationCount.set(v.candidateId, (candidateValidationCount.get(v.candidateId) ?? 0) + 1);
    if (ok) vOk += 1; else vBad += 1;
  }
  for (const [candidateId, count] of candidateValidationCount) {
    if (count > 1) finding("DATA_CORRUPTION", "high", "D", `Candidate ${candidateId} has ${count} validations (unique expected).`, { candidateId, count });
  }
  let mOk = 0, mBad = 0;
  const validationMemoryCount = new Map();
  for (const m of memory) {
    let ok = true;
    if (m.organizationId !== O) { ok = false; finding("DATA_CORRUPTION", "high", "D", `Memory ${m.id} cross-org.`, { id: m.id }); }
    const v = validationById.get(m.validationRecordId);
    if (!v) { ok = false; finding("DATA_CORRUPTION", "high", "D", `Memory ${m.id} unresolved validation.`, { id: m.id }); }
    if (!candidateById.has(m.candidateId)) { ok = false; finding("DATA_CORRUPTION", "high", "D", `Memory ${m.id} unresolved candidate.`, { id: m.id }); }
    if (!knowledgeIds.has(m.knowledgeItemId)) { ok = false; finding("DATA_CORRUPTION", "high", "D", `Memory ${m.id} unresolved knowledge.`, { id: m.id }); }
    if (!m.actorId || !memberIds.has(m.actorId)) { ok = false; finding("DATA_CORRUPTION", "high", "I", `Memory ${m.id} actorId unresolved: ${m.actorId}.`, { id: m.id }); }
    if (v && m.actorId !== v.actorId) { ok = false; finding("DATA_CORRUPTION", "medium", "I", `Memory ${m.id} actor != validation actor.`, { id: m.id }); }
    if (m.beforeState !== null && typeof m.beforeState !== "object") { ok = false; finding("DATA_CORRUPTION", "high", "D", `Memory ${m.id} malformed beforeState.`, { id: m.id }); }
    if (typeof m.afterState !== "object" || m.afterState === null) { ok = false; finding("DATA_CORRUPTION", "high", "D", `Memory ${m.id} malformed afterState.`, { id: m.id }); }
    if (m.afterState && m.afterState.id !== m.knowledgeItemId) { ok = false; finding("DATA_CORRUPTION", "high", "D", `Memory ${m.id} afterState.id != knowledgeItemId.`, { id: m.id }); }
    if (v && iso(v.timestamp) !== iso(m.timestamp)) finding("AUDITABILITY_GAP", "low", "H", `Memory ${m.id} timestamp != validation timestamp.`, { id: m.id });
    validationMemoryCount.set(m.validationRecordId, (validationMemoryCount.get(m.validationRecordId) ?? 0) + 1);
    if (ok) mOk += 1; else mBad += 1;
  }
  for (const [validationId, count] of validationMemoryCount) {
    if (count > 1) finding("DATA_CORRUPTION", "high", "D", `Validation ${validationId} linked to ${count} memory records.`, { validationId, count });
  }
  summary.validationMemory = { validations: validations.length, validationsOk: vOk, validationsBad: vBad, memory: memory.length, memoryOk: mOk, memoryBad: mBad };
}

function auditVersions(data) {
  const { knowledge, tickets } = data;
  const ticketIds = new Set(tickets.map((t) => t.ticketId));
  let total = 0, unique = 0, chronoOk = 0, sourceOk = 0;
  const globalIds = new Set();
  for (const item of knowledge) {
    const versions = (item.content?.knowledgeVersions ?? []);
    const seen = new Set();
    let prev = null;
    versions.forEach((v, index) => {
      total += 1;
      if (!seen.has(v.versionId) && !globalIds.has(v.versionId)) unique += 1;
      else finding("DATA_CORRUPTION", "high", "E", `Duplicate versionId ${v.versionId}.`, { itemId: item.id });
      seen.add(v.versionId); globalIds.add(v.versionId);
      const expectedId = `${item.id}-v${String(index + 1).padStart(3, "0")}`;
      if (v.versionId !== expectedId) finding("AUDITABILITY_GAP", "low", "E", `Version ${v.versionId} does not follow ${expectedId} progression.`, { itemId: item.id });
      if (prev === null || iso(prev) <= iso(v.createdAt)) chronoOk += 1;
      else finding("DATA_CORRUPTION", "medium", "E", `Version ${v.versionId} out of chronological order.`, { itemId: item.id });
      prev = v.createdAt;
      if (v.sourceTicketId && ticketIds.has(v.sourceTicketId)) sourceOk += 1;
      else finding("AUDITABILITY_GAP", "low", "E", `Version ${v.versionId} sourceTicketId unresolved.`, { itemId: item.id, sourceTicketId: v.sourceTicketId });
    });
  }
  summary.versions = { total, unique, chronoOk, sourceOk };
}

function auditLessons(data) {
  const { knowledge } = data;
  let totalLessons = 0, aliases = 0, aliasResolveOk = 0, contentDupes = 0;
  const globalAliasOwners = new Map();
  const canonicalLessonToItem = new Map();
  for (const item of knowledge) {
    const lessons = item.content?.lessons ?? [];
    const ids = new Set();
    const contentKeys = new Set();
    for (const lesson of lessons) {
      totalLessons += 1;
      if (ids.has(lesson.id)) finding("DATA_CORRUPTION", "high", "F", `Duplicate lesson id ${lesson.id} in ${item.id}.`, { itemId: item.id });
      ids.add(lesson.id);
      canonicalLessonToItem.set(lesson.id, item.id);
      const key = stableStringify({ r: lesson.rootCause, s: lesson.solution, c: lesson.customerResponse, g: (lesson.signals ?? []).slice().sort() });
      if (contentKeys.has(key)) { contentDupes += 1; finding("DATA_CORRUPTION", "medium", "F", `TODO-016 violation: duplicate lesson content in ${item.id}.`, { itemId: item.id, lessonId: lesson.id }); }
      contentKeys.add(key);
    }
    const itemForResolve = { lessons };
    for (const lesson of lessons) {
      for (const alias of lesson.aliasLessonIds ?? []) {
        aliases += 1;
        // Alias must resolve directly to a canonical lesson in THIS item (no chains/cycles/cross-item).
        const resolved = resolveLessonIdForItem(itemForResolve, alias);
        if (resolved && ids.has(resolved) && !ids.has(alias)) aliasResolveOk += 1;
        else finding("DATA_CORRUPTION", "high", "F", `Alias ${alias} does not resolve to a canonical lesson in ${item.id} (resolved=${resolved}).`, { itemId: item.id, alias, resolved });
        const owner = globalAliasOwners.get(alias);
        if (owner && owner !== item.id) finding("DATA_CORRUPTION", "high", "F", `Alias ${alias} used across items ${owner} and ${item.id}.`, { alias });
        globalAliasOwners.set(alias, item.id);
        if (canonicalLessonToItem.has(alias)) finding("DATA_CORRUPTION", "high", "F", `Alias ${alias} collides with a canonical lesson id.`, { alias });
      }
    }
  }
  // Unknown historical lesson id must fail closed.
  const sampleItem = knowledge.find((k) => (k.content?.lessons ?? []).length > 0);
  if (sampleItem && resolveLessonIdForItem({ lessons: sampleItem.content.lessons }, "definitely-not-a-real-lesson") !== null) {
    finding("DATA_CORRUPTION", "high", "F", "Unknown lesson id did not fail closed.", {});
  }
  summary.lessons = { totalLessons, aliases, aliasResolveOk, contentDupes };
}

function auditTicketsCandidates(data) {
  const { tickets, candidates, knowledge } = data;
  const ticketById = new Map(tickets.map((t) => [t.ticketId, t]));
  const knowledgeById = new Map(knowledge.map((k) => [k.id, k]));
  const lessonResolvableByItem = new Map();
  for (const k of knowledge) {
    const set = new Set();
    for (const l of k.content?.lessons ?? []) { set.add(l.id); for (const a of l.aliasLessonIds ?? []) set.add(a); }
    lessonResolvableByItem.set(k.id, set);
  }
  let dupTicketIds = 0, ticketCrossOrg = 0, memoryMatchOk = 0, memoryMatchUnresolved = 0, reflectionOk = 0, reflectionUnresolved = 0;
  const seenTicket = new Set();
  for (const t of tickets) {
    if (seenTicket.has(t.ticketId)) { dupTicketIds += 1; finding("DATA_CORRUPTION", "high", "G", `Duplicate ticketId ${t.ticketId}.`, {}); }
    seenTicket.add(t.ticketId);
    if (t.organizationId !== O) { ticketCrossOrg += 1; finding("DATA_CORRUPTION", "high", "G", `Ticket ${t.ticketId} cross-org.`, {}); }
    const match = t.memoryMatch;
    if (match && match.knowledgeId) {
      const item = knowledgeById.get(match.knowledgeId);
      if (!item) { memoryMatchUnresolved += 1; finding("AUDITABILITY_GAP", "low", "G", `Ticket ${t.ticketId} memoryMatch.knowledgeId unresolved.`, { ticketId: t.ticketId }); }
      else {
        memoryMatchOk += 1;
        if (match.lessonId && !lessonResolvableByItem.get(item.id)?.has(match.lessonId)) finding("AUDITABILITY_GAP", "low", "G", `Ticket ${t.ticketId} memoryMatch.lessonId not resolvable in item.`, { ticketId: t.ticketId });
      }
    }
    const reflection = t.reflection;
    for (const key of ["lessonCreatedId", "lessonReinforcedId"]) {
      const lessonId = reflection?.[key];
      if (!lessonId) continue;
      const item = reflection.knowledgeChanged ? knowledgeById.get(reflection.knowledgeChanged) : null;
      if (item && lessonResolvableByItem.get(item.id)?.has(lessonId)) reflectionOk += 1;
      else { reflectionUnresolved += 1; finding("AUDITABILITY_GAP", "low", "G", `Ticket ${t.ticketId} reflection.${key} unresolved.`, { ticketId: t.ticketId, lessonId }); }
    }
  }
  let candidateCrossTicket = 0, orphanSource = 0;
  for (const c of candidates) {
    if (c.organizationId !== O) finding("DATA_CORRUPTION", "high", "G", `Candidate ${c.id} cross-org.`, {});
    if (!c.sourceTicketIds || c.sourceTicketIds.length === 0) { orphanSource += 1; finding("DATA_CORRUPTION", "medium", "G", `Candidate ${c.id} has no source tickets.`, { id: c.id }); }
    for (const tid of c.sourceTicketIds ?? []) if (!ticketById.has(tid)) { candidateCrossTicket += 1; finding("DATA_CORRUPTION", "high", "G", `Candidate ${c.id} references unknown ticket ${tid}.`, { id: c.id }); }
  }
  let knowledgeSourceOk = 0;
  for (const k of knowledge) if (ticketById.has(k.sourceTicketId)) knowledgeSourceOk += 1; else finding("DATA_CORRUPTION", "high", "G", `Knowledge ${k.id} sourceTicketId unresolved.`, { id: k.id });
  summary.ticketsCandidates = { tickets: tickets.length, dupTicketIds, ticketCrossOrg, memoryMatchOk, memoryMatchUnresolved, reflectionOk, reflectionUnresolved, candidates: candidates.length, candidateCrossTicket, orphanSource, knowledgeSourceOk };
}

function auditChronology(data) {
  const { candidates, validations, memory, tickets } = data;
  const ticketById = new Map(tickets.map((t) => [t.ticketId, t]));
  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  const validationById = new Map(validations.map((v) => [v.id, v]));
  let inversions = 0;
  for (const v of validations) {
    const c = candidateById.get(v.candidateId);
    if (c && iso(c.createdAt) > iso(v.timestamp)) { inversions += 1; finding("DATA_CORRUPTION", "high", "H", `Validation ${v.id} precedes its candidate.`, { id: v.id }); }
  }
  for (const c of candidates) for (const tid of c.sourceTicketIds ?? []) {
    const t = ticketById.get(tid);
    if (t && iso(t.createdAt) > iso(c.createdAt)) { inversions += 1; finding("DATA_CORRUPTION", "high", "H", `Candidate ${c.id} precedes source ticket ${tid}.`, { id: c.id }); }
  }
  for (const m of memory) {
    const v = validationById.get(m.validationRecordId);
    if (v && iso(m.timestamp) < iso(v.timestamp)) { inversions += 1; finding("DATA_CORRUPTION", "high", "H", `Memory ${m.id} precedes validation.`, { id: m.id }); }
  }
  summary.chronology = { inversions };
}

function auditMetrics(data) {
  const { metrics, tickets, knowledge, candidates, patterns } = data;
  const knowledgeById = new Map(knowledge.map((k) => [k.id, k]));
  const derived = {
    lifetimeTickets: tickets.length,
    resolutionsCount: tickets.filter((t) => (t.status === "resolved" || t.status === "rejected") && t.resolution?.resolvedAt).length,
    knowledgeReused: tickets.filter((t) => {
      const kid = t.memoryMatch?.knowledgeId;
      if (t.status !== "resolved" || !kid) return false;
      const k = knowledgeById.get(kid);
      return Boolean(k && t.ticketId !== k.sourceTicketId && iso(t.createdAt) >= iso(k.createdAt));
    }).length,
    mergedTickets: new Set(candidates.filter((c) => c.proposedAction === "merge_existing" && String(c.rationale).startsWith("Canonical support merge")).flatMap((c) => c.sourceTicketIds ?? [])).size,
    knowledgeVersions: knowledge.reduce((n, k) => n + (k.content?.knowledgeVersions?.length ?? 0), 0),
    emergingPatternsDetected: patterns.length
  };
  const compare = (field, derivedValue) => {
    const persisted = metrics?.[field];
    const match = persisted === derivedValue;
    if (!match) finding("DATA_CORRUPTION", "medium", "J", `OrgMetrics.${field} persisted ${persisted} != independently derived ${derivedValue}.`, { field, persisted, derivedValue });
    return { field, persisted, derived: derivedValue, match };
  };
  const rows = [
    compare("lifetimeTickets", derived.lifetimeTickets),
    compare("resolutionsCount", derived.resolutionsCount),
    compare("knowledgeReused", derived.knowledgeReused),
    compare("mergedTickets", derived.mergedTickets),
    compare("duplicatePreventions", derived.mergedTickets),
    compare("knowledgeVersions", derived.knowledgeVersions),
    compare("emergingPatternsDetected", derived.emergingPatternsDetected),
    compare("promotedPatterns", derived.emergingPatternsDetected)
  ];
  // TODO-026: TicketRecord.resolutionMode now makes auto/human reconstructable
  // where present. Reconstruct independently; null rows are unknown (never human).
  const completed = tickets.filter((t) => (t.status === "resolved" || t.status === "rejected") && t.resolution?.resolvedAt);
  const modeAuto = completed.filter((t) => t.resolutionMode === "automatic").length;
  const modeHuman = completed.filter((t) => t.resolutionMode === "human").length;
  const modeUnknown = completed.filter((t) => t.resolutionMode !== "automatic" && t.resolutionMode !== "human").length;
  const reconstructable = modeUnknown === 0;
  if (reconstructable) {
    if (metrics?.autoResolutions !== modeAuto) finding("DATA_CORRUPTION", "medium", "J", `OrgMetrics.autoResolutions ${metrics?.autoResolutions} != reconstructed ${modeAuto}.`, { modeAuto });
    if (metrics?.humanResolutions !== modeHuman) finding("DATA_CORRUPTION", "medium", "J", `OrgMetrics.humanResolutions ${metrics?.humanResolutions} != reconstructed ${modeHuman}.`, { modeHuman });
  } else {
    finding("AUDITABILITY_GAP", "medium", "J", `${modeUnknown} completed resolutions have null resolutionMode (historical rows predating TODO-026). The durable TicketRecord.resolutionMode field now exists, but the persisted auto/human split (auto=${metrics?.autoResolutions}, human=${metrics?.humanResolutions}) is not reconstructable for these rows until an explicitly approved reseed/backfill. Null is NOT counted as human.`, { autoResolutions: metrics?.autoResolutions, humanResolutions: metrics?.humanResolutions, modeUnknown, modeAuto, modeHuman });
  }
  summary.metrics = { derivableFields: rows, resolutionMode: { automatic: modeAuto, human: modeHuman, unknownNull: modeUnknown }, autoHumanReconstructable: reconstructable };
}

function auditSequence(data) {
  const { sequence, tickets } = data;
  let maxSeq = 0, dup = 0;
  const seen = new Set();
  for (const t of tickets) {
    const m = /-(\d{4,})$/.exec(t.ticketId);
    const n = m ? Number(m[1]) : 0;
    maxSeq = Math.max(maxSeq, n);
    if (seen.has(t.ticketId)) dup += 1;
    seen.add(t.ticketId);
  }
  const counter = sequence?.counter ?? 0;
  if (counter !== 5000) finding("DATA_CORRUPTION", "high", "K", `TicketSequence counter ${counter} != 5000.`, { counter });
  if (maxSeq !== counter) finding("DATA_CORRUPTION", "high", "K", `Highest ticket sequence ${maxSeq} != counter ${counter}.`, { maxSeq, counter });
  const nextCollision = seen.has(`OIP-`) ? 0 : tickets.filter((t) => /-(\d{4,})$/.test(t.ticketId) && Number(/-(\d{4,})$/.exec(t.ticketId)[1]) === counter + 1).length;
  if (nextCollision > 0) finding("DATA_CORRUPTION", "high", "K", `Next sequence ${counter + 1} already used.`, {});
  summary.sequence = { counter, maxSeq, duplicates: dup, nextSequence: counter + 1, nextCollision };
}

function reconstructHero(data) {
  const { knowledge, memory, validations, evidence, tickets, candidates } = data;
  const item = knowledge.find((k) => k.canonicalProblemTitle === HERO_TITLE || k.title === HERO_TITLE);
  if (!item) { finding("DATA_CORRUPTION", "high", "L", `HERO arc "${HERO_TITLE}" not found.`, {}); summary.hero = { found: false }; return; }
  const chain = memory.filter((m) => m.knowledgeItemId === item.id).sort((a, b) => asc(iso(a.timestamp), iso(b.timestamp)) || asc(a.id, b.id));
  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  const versionEvents = chain.filter((m) => m.changeType === "create_version").length;
  const lessonEvents = chain.filter((m) => m.changeType === "merge_existing").length;
  const trustEvts = chain.filter((m) => m.changeType === "trust_update_only");
  const wrong = trustEvts.filter((m) => (trustOf(m.afterState) ?? 0) < (trustOf(m.beforeState) ?? TRUST_INITIAL)).length;
  const heroEvidence = evidence.filter((e) => e.knowledgeItemId === item.id).length;
  const heroValidations = validations.filter((v) => v.knowledgeItemId === item.id).length;
  const sourceTicket = tickets.find((t) => t.ticketId === item.sourceTicketId);
  const trustPath = chain.map((m) => trustOf(m.afterState));
  summary.hero = {
    found: true,
    itemId: item.id,
    title: item.canonicalProblemTitle,
    sourceTicketId: item.sourceTicketId,
    sourceTicketResolved: Boolean(sourceTicket),
    firstEventAt: iso(chain[0]?.timestamp),
    createdAt: iso(item.createdAt),
    initialTrust: trustOf(chain[0]?.afterState),
    finalTrust: item.trustScore,
    lessons: item.content?.lessons?.length ?? 0,
    versions: item.content?.knowledgeVersions?.length ?? 0,
    lessonEvents,
    versionEvents,
    trustEvents: trustEvts.length,
    wrongResolutionEvents: wrong,
    validations: heroValidations,
    evidenceRows: heroEvidence,
    supportingTickets: item.content?.exampleTickets?.length ?? 0,
    trustProgression: `${trustPath[0]} -> ${trustPath[trustPath.length - 1]} (${trustPath.length} events)`,
    provenancePresent: Boolean(item.content?.provenance)
  };
  if (!sourceTicket) finding("AUDITABILITY_GAP", "medium", "L", "HERO source ticket not durably resolvable.", { itemId: item.id });
}

async function protectedSnapshot(prisma) {
  const result = {};
  for (const organizationId of PROTECTED_ORGANIZATION_IDS) {
    const where = { organizationId };
    const value = {
      organization: await prisma.organization.findUnique({ where: { id: organizationId } }),
      knowledge: await prisma.knowledgeItem.count({ where }),
      tickets: await prisma.ticketRecord.count({ where }),
      validations: await prisma.validationRecord.count({ where }),
      memory: await prisma.memoryChangeRecord.count({ where }),
      evidence: await prisma.trustEvidence.count({ where }),
      metrics: await prisma.orgMetrics.findUnique({ where: { organizationId } }),
      sequence: await prisma.ticketSequence.findUnique({ where: { organizationId } })
    };
    result[organizationId] = crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }
  return result;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const prisma = getPrismaClient();
  const protectedBefore = await protectedSnapshot(prisma);

  const data = await loadOrganization(prisma);
  assert(data.organization, "Developer demo organization must exist.");

  // M. Organization isolation of authoritative references.
  const memberIds = new Set(data.memberships.map((m) => m.userId));
  for (const actor of developerDemoActors) if (!memberIds.has(actor.id)) finding("DATA_CORRUPTION", "high", "M", `Synthetic actor ${actor.id} is not a demo member.`, {});

  auditTrust(data);
  auditEvidence(data);
  auditValidationMemory(data);
  auditVersions(data);
  auditLessons(data);
  auditTicketsCandidates(data);
  auditChronology(data);
  auditMetrics(data);
  auditSequence(data);
  reconstructHero(data);

  const protectedAfter = await protectedSnapshot(prisma);
  assert.deepEqual(protectedAfter, protectedBefore, "Protected organizations must be unchanged by the read-only audit.");

  // Secondary, clearly-isolated sanity cross-check against the simulator (NOT a
  // primary assertion): counts only.
  let simulatorCrossCheck = "skipped";
  try {
    const { simulateDeveloperDemo } = require(path.join(root, "lib", "developerDemo", "simulator.ts"));
    const sim = simulateDeveloperDemo();
    simulatorCrossCheck = sim.digest === "d0ed2d9d5045548bfcaf3203463542843c2b02a752020cf2b0a3df11996df34b"
      && sim.resources.knowledgeItems.length === data.knowledge.length
      && sim.resources.tickets.length === data.tickets.length
        ? "counts+digest match (secondary only)" : "MISMATCH";
  } catch (error) {
    simulatorCrossCheck = `unavailable: ${error.message}`;
  }

  const bySeverity = findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] ?? 0) + 1; return acc; }, {});
  const byClass = findings.reduce((acc, f) => { acc[f.classification] = (acc[f.classification] ?? 0) + 1; return acc; }, {});
  const corruption = findings.filter((f) => f.classification === "DATA_CORRUPTION");

  const verdict = corruption.length > 0
    ? "DATA_INTEGRITY_FAILURE"
    : findings.some((f) => f.classification === "AUDITABILITY_GAP" || f.classification === "MODEL_LIMITATION")
      ? "PASS_WITH_FINDINGS"
      : "PASS";

  console.log(JSON.stringify({
    verdict,
    organizationId: O,
    counts: {
      knowledge: data.knowledge.length, candidates: data.candidates.length, validations: data.validations.length,
      memory: data.memory.length, evidence: data.evidence.length, tickets: data.tickets.length,
      patterns: data.patterns.length, versions: summary.versions.total, lessons: summary.lessons.totalLessons,
      sequence: data.sequence?.counter
    },
    summary,
    findingsBySeverity: bySeverity,
    findingsByClassification: byClass,
    findings,
    simulatorCrossCheck,
    protectedOrganizationsUnchanged: true
  }, null, 2));

  if (corruption.length > 0) {
    console.error(`\nDATA_INTEGRITY_FAILURE: ${corruption.length} corruption finding(s).`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.stack : String(error)); process.exitCode = 1; })
  .finally(async () => { try { await getPrismaClient().$disconnect(); } catch { /* ignore */ } });
