import { developerDemoActors } from "@/data/developerDemoFoundation";
import { deriveDeveloperDemoMetrics } from "@/lib/developerDemo/metrics";
import type {
  DeveloperDemoSimulation,
  IntegrityReport,
  SimulatedValidationRecord
} from "@/lib/developerDemo/types";
import { parseTicketId } from "@/lib/ticketIdFormat";
import { resolveLessonIdForItem } from "@/lib/canonicalProblemEngine";
import { stableStringify } from "@/lib/persistence/migrationExportDigest";
import { recordResolution, TRUST_INITIAL } from "@/lib/trustEngine";
import type { KnowledgeItem } from "@/types";

type SimulationDraft = Omit<DeveloperDemoSimulation, "digest" | "integrity">;
type IntegrityKey = keyof IntegrityReport;

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function equal(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

export function verifyDeveloperDemoSimulation(simulation: SimulationDraft): IntegrityReport {
  const report: IntegrityReport = {
    organizationIsolationViolations: 0,
    unresolvedActorReferences: 0,
    duplicateIds: 0,
    candidateViolations: 0,
    validationReferenceViolations: 0,
    memoryReferenceViolations: 0,
    memoryChainViolations: 0,
    trustEvidenceUniquenessViolations: 0,
    unresolvedTicketReferences: 0,
    timestampViolations: 0,
    aliasViolations: 0,
    trustLifecycleViolations: 0,
    metricViolations: 0,
    ticketSequenceViolations: 0,
    crossOrganizationReferences: 0
  };
  const fail = (key: IntegrityKey, condition: boolean) => {
    if (!condition) report[key] += 1;
  };
  const organizationId = simulation.config.organizationId;
  fail("organizationIsolationViolations", organizationId === "profile-oip-developer-demo");
  fail("organizationIsolationViolations", simulation.config.profile.id === organizationId);

  const actorIds = new Set(developerDemoActors.map((actor) => actor.id));
  fail("unresolvedActorReferences", simulation.actorIds.length === actorIds.size);
  for (const actorId of simulation.actorIds) fail("unresolvedActorReferences", actorIds.has(actorId));

  const tickets = simulation.resources.tickets;
  const knowledgeItems = simulation.resources.knowledgeItems;
  const candidates = simulation.resources.candidates;
  const validations = simulation.resources.validations;
  const memoryChanges = simulation.resources.memoryChanges;
  const evidence = simulation.resources.trustEvidenceIntents;
  const ticketById = new Map(tickets.map((ticket) => [ticket.ticketId, ticket]));
  const knowledgeById = new Map(knowledgeItems.map((item) => [item.id, item]));
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const validationById = new Map(validations.map((validation) => [validation.id, validation]));
  const eventByValidationId = new Map(
    simulation.events
      .filter((event) => event.validationId)
      .map((event) => [event.validationId!, event])
  );
  fail("validationReferenceViolations", eventByValidationId.size === validations.length);

  const allIds = new Set<string>();
  const addId = (id: string) => {
    if (allIds.has(id)) report.duplicateIds += 1;
    allIds.add(id);
  };
  for (const ticket of tickets) addId(ticket.ticketId);
  for (const item of knowledgeItems) {
    addId(item.id);
    for (const lesson of item.lessons ?? []) {
      addId(lesson.id);
      for (const alias of lesson.aliasLessonIds ?? []) addId(alias);
    }
    for (const version of item.knowledgeVersions ?? []) addId(version.versionId);
    for (const history of item.learningHistory ?? []) addId(history.id);
  }
  for (const candidate of candidates) addId(candidate.id);
  for (const validation of validations) addId(validation.id);
  for (const memory of memoryChanges) addId(memory.id);
  for (const intent of evidence) addId(intent.id);
  for (const pattern of simulation.resources.patterns) addId(pattern.id);
  for (const event of simulation.events) addId(event.id);

  for (const ticket of tickets) {
    fail("organizationIsolationViolations", ticket.orgId === organizationId);
    fail("unresolvedActorReferences", actorIds.has(ticket.actorId));
    fail("crossOrganizationReferences", ticket.orgId === organizationId);
    for (const validationId of ticket.validationRecordIds) {
      const validation = validationById.get(validationId);
      fail("validationReferenceViolations", Boolean(validation));
      if (validation) fail("timestampViolations", ticket.createdAt <= validation.timestamp);
    }
  }

  const validationCountByCandidate = new Map<string, number>();
  for (const validation of validations) {
    validationCountByCandidate.set(validation.candidateId, (validationCountByCandidate.get(validation.candidateId) ?? 0) + 1);
    fail("organizationIsolationViolations", validation.organizationId === organizationId);
    fail("unresolvedActorReferences", actorIds.has(validation.actorId));
    const candidate = candidateById.get(validation.candidateId);
    fail("validationReferenceViolations", Boolean(candidate));
    fail("validationReferenceViolations", Boolean(validation.knowledgeId && knowledgeById.has(validation.knowledgeId)));
    if (candidate) {
      fail("timestampViolations", candidate.createdAt <= validation.timestamp);
      fail("candidateViolations", candidate.status === "validated");
    }
    if (validation.knowledgeId && validation.knowledgeVersionId) {
      const item = knowledgeById.get(validation.knowledgeId);
      fail("validationReferenceViolations", Boolean(item?.knowledgeVersions?.some((version) => version.versionId === validation.knowledgeVersionId)));
    }
  }

  for (const candidate of candidates) {
    fail("organizationIsolationViolations", candidate.organizationId === organizationId);
    fail("candidateViolations", (validationCountByCandidate.get(candidate.id) ?? 0) === 1);
    const uniqueSources = [...new Set(candidate.sourceTicketIds)];
    fail("candidateViolations", candidate.sourceTicketIds.length > 0);
    fail("candidateViolations", uniqueSources.length === candidate.sourceTicketIds.length);
    fail("candidateViolations", equal(candidate.sourceTicketIds, [...candidate.sourceTicketIds].sort(asciiCompare)));
    for (const ticketId of candidate.sourceTicketIds) {
      const ticket = ticketById.get(ticketId);
      fail("unresolvedTicketReferences", Boolean(ticket));
      if (ticket) fail("timestampViolations", ticket.createdAt <= candidate.createdAt);
    }
  }

  const memoryCountByValidation = new Map<string, number>();
  for (const memory of memoryChanges) {
    memoryCountByValidation.set(memory.validationRecordId, (memoryCountByValidation.get(memory.validationRecordId) ?? 0) + 1);
    fail("organizationIsolationViolations", memory.organizationId === organizationId);
    fail("unresolvedActorReferences", actorIds.has(memory.actorId));
    const validation = validationById.get(memory.validationRecordId);
    const candidate = candidateById.get(memory.candidateId);
    fail("memoryReferenceViolations", Boolean(validation));
    fail("memoryReferenceViolations", Boolean(candidate));
    fail("memoryReferenceViolations", validation?.candidateId === memory.candidateId);
    fail("memoryReferenceViolations", validation?.knowledgeId === memory.knowledgeId);
    fail("memoryReferenceViolations", validation?.actorId === memory.actorId);
    fail("memoryReferenceViolations", candidate?.proposedAction === memory.changeType);
    fail("memoryReferenceViolations", memory.afterState.id === memory.knowledgeId);
    fail("organizationIsolationViolations", memory.afterState.organizationId === organizationId);
    if (memory.beforeState) fail("organizationIsolationViolations", memory.beforeState.organizationId === organizationId);
    if (validation) fail("timestampViolations", validation.timestamp === memory.timestamp);
  }
  for (const validation of validations) fail("memoryReferenceViolations", (memoryCountByValidation.get(validation.id) ?? 0) === 1);

  const evidenceKeys = new Set<string>();
  for (const intent of evidence) {
    fail("organizationIsolationViolations", intent.organizationId === organizationId);
    fail("unresolvedActorReferences", actorIds.has(intent.actorId));
    const evidenceTicket = ticketById.get(intent.sourceTicketId);
    fail("unresolvedTicketReferences", Boolean(evidenceTicket));
    fail("trustEvidenceUniquenessViolations", evidenceTicket?.status === "resolved" && evidenceTicket.resolutionMode === "human");
    fail("validationReferenceViolations", validationById.has(intent.validationRecordId));
    fail("validationReferenceViolations", knowledgeById.has(intent.knowledgeItemId));
    const validation = validationById.get(intent.validationRecordId);
    const candidate = validation ? candidateById.get(validation.candidateId) : undefined;
    const event = eventByValidationId.get(intent.validationRecordId);
    fail("validationReferenceViolations", validation?.knowledgeId === intent.knowledgeItemId);
    fail("validationReferenceViolations", Boolean(candidate?.sourceTicketIds.includes(intent.sourceTicketId)));
    fail("validationReferenceViolations", event?.payload.action === "trust_update_only" && event.payload.mode === "human" && event.payload.success === true);
    fail("trustLifecycleViolations", intent.delta === (event?.payload.trustTo ?? 0) - (event?.payload.trustFrom ?? 0));
    fail("timestampViolations", (ticketById.get(intent.sourceTicketId)?.createdAt ?? "9999") <= intent.createdAt);
    const key = `${intent.organizationId}|${intent.knowledgeItemId}|${intent.sourceTicketId}|${intent.trustEventType}`;
    if (evidenceKeys.has(key)) report.trustEvidenceUniquenessViolations += 1;
    evidenceKeys.add(key);
  }

  const aliasOwners = new Map<string, string>();
  for (const item of knowledgeItems) {
    fail("organizationIsolationViolations", item.organizationId === organizationId);
    const source = ticketById.get(item.sourceTicketId);
    fail("unresolvedTicketReferences", Boolean(source));
    if (source) fail("timestampViolations", source.createdAt <= item.createdAt);
    const canonicalLessonIds = new Set((item.lessons ?? []).map((lesson) => lesson.id));
    for (const lesson of item.lessons ?? []) {
      const primarySource = ticketById.get(lesson.sourceTicketId);
      fail("unresolvedTicketReferences", Boolean(primarySource));
      if (primarySource) fail("timestampViolations", primarySource.createdAt <= lesson.createdAt);
      for (const ticketId of [...new Set(lesson.sourceTicketIds ?? [])]) {
        const contributingTicket = ticketById.get(ticketId);
        fail("unresolvedTicketReferences", Boolean(contributingTicket));
        if (contributingTicket) fail("timestampViolations", contributingTicket.createdAt <= (lesson.updatedAt ?? lesson.createdAt));
      }
      for (const alias of lesson.aliasLessonIds ?? []) {
        fail("aliasViolations", alias !== lesson.id && !canonicalLessonIds.has(alias));
        fail("aliasViolations", resolveLessonIdForItem(item, alias) === lesson.id);
        const existingOwner = aliasOwners.get(alias);
        fail("aliasViolations", !existingOwner || existingOwner === item.id);
        aliasOwners.set(alias, item.id);
      }
    }
    const versions = item.knowledgeVersions ?? [];
    versions.forEach((version, index) => {
      const ticket = ticketById.get(version.sourceTicketId);
      fail("unresolvedTicketReferences", Boolean(ticket));
      if (ticket) fail("timestampViolations", ticket.createdAt <= version.createdAt);
      fail("timestampViolations", index === 0 || versions[index - 1].createdAt <= version.createdAt);
      fail("aliasViolations", version.versionId === `${item.id}-v${String(index + 1).padStart(3, "0")}`);
    });
    for (const example of item.exampleTickets ?? []) {
      const ticket = ticketById.get(example.ticketId);
      fail("unresolvedTicketReferences", Boolean(ticket));
      if (ticket) fail("timestampViolations", ticket.createdAt === example.createdAt);
    }
  }

  for (const pattern of simulation.resources.patterns) {
    fail("organizationIsolationViolations", pattern.organizationId === organizationId);
    fail("timestampViolations", pattern.firstSeenAt <= pattern.promotedAt);
    for (const ticketId of pattern.sourceTicketIds) fail("unresolvedTicketReferences", ticketById.has(ticketId));
  }
  for (const event of simulation.events) {
    fail("organizationIsolationViolations", event.organizationId === organizationId);
    fail("unresolvedActorReferences", actorIds.has(event.actorId));
    fail("validationReferenceViolations", !event.validationId || validationById.has(event.validationId));
    for (const ticketId of event.ticketIds) {
      const ticket = ticketById.get(ticketId);
      fail("unresolvedTicketReferences", Boolean(ticket));
      if (ticket && event.payload.action === "trust_update_only") {
        fail("trustLifecycleViolations", ticket.resolutionMode === event.payload.mode);
        fail("trustLifecycleViolations", event.payload.success ? ticket.status === "resolved" : ticket.status === "rejected");
      }
    }
  }

  for (const item of knowledgeItems) {
    const chain = memoryChanges
      .filter((memory) => memory.knowledgeId === item.id)
      .sort((left, right) => asciiCompare(left.timestamp, right.timestamp) || asciiCompare(left.id, right.id));
    fail("memoryChainViolations", chain.length > 0 && chain[0].beforeState === null);
    fail("trustLifecycleViolations", (chain[0]?.afterState.trustScore ?? -1) === TRUST_INITIAL);
    let previous: KnowledgeItem | null = null;
    const priorValidations: SimulatedValidationRecord[] = [];
    for (const memory of chain) {
      if (previous) fail("memoryChainViolations", equal(memory.beforeState, previous));
      const validation = validationById.get(memory.validationRecordId);
      const event = eventByValidationId.get(memory.validationRecordId);
      fail("memoryReferenceViolations", Boolean(event && validation));
      if (memory.beforeState && event?.payload.action === "trust_update_only") {
        const replay = recordResolution(
          memory.beforeState,
          {
            mode: event.payload.mode ?? "human",
            success: event.payload.success ?? false,
            requiredEdits: event.payload.requiredEdits,
            at: event.at
          },
          simulation.config.profile,
          priorValidations
        );
        const expected = { ...replay.item, organizationId, lastUpdated: event.at };
        fail("trustLifecycleViolations", equal(expected, memory.afterState));
        fail("trustLifecycleViolations", replay.trustFrom === event.payload.trustFrom);
        fail("trustLifecycleViolations", replay.trustTo === event.payload.trustTo);
        fail("trustLifecycleViolations", replay.trustDelta === event.payload.trustDelta);
      } else if (memory.beforeState) {
        fail("trustLifecycleViolations", memory.beforeState.trustScore === memory.afterState.trustScore);
      }
      if (validation) priorValidations.push(validation);
      previous = memory.afterState;
    }
    fail("memoryChainViolations", Boolean(previous && equal(previous, item)));
  }

  const recomputedMetrics = deriveDeveloperDemoMetrics({
    organizationId,
    historyEnd: simulation.config.historyEnd,
    tickets,
    knowledgeItems,
    candidates,
    patterns: simulation.resources.patterns
  });
  fail("metricViolations", equal(recomputedMetrics, simulation.resources.metrics));

  let maximumSequence = 0;
  for (const ticket of tickets) {
    const parsed = parseTicketId(ticket.ticketId);
    fail("ticketSequenceViolations", Boolean(parsed && parsed.prefix === simulation.config.ticketPrefix));
    if (parsed) maximumSequence = Math.max(maximumSequence, parsed.sequenceNumber);
  }
  fail("ticketSequenceViolations", simulation.resources.ticketSequence.organizationId === organizationId);
  fail("ticketSequenceViolations", simulation.resources.ticketSequence.counter === maximumSequence);
  fail("ticketSequenceViolations", maximumSequence === tickets.length);

  const targetTotals = simulation.arcs.reduce((totals, arc) => ({
    tickets: totals.tickets + arc.targets.tickets,
    validations: totals.validations + arc.targets.validations,
    lessons: totals.lessons + arc.targets.lessons,
    versions: totals.versions + arc.targets.versions,
    evidence: totals.evidence + arc.targets.trustEvidence
  }), { tickets: 0, validations: 0, lessons: 0, versions: 0, evidence: 0 });
  fail("metricViolations", tickets.length === targetTotals.tickets);
  fail("metricViolations", knowledgeItems.length === simulation.arcs.length);
  fail("metricViolations", validations.length === targetTotals.validations && candidates.length === validations.length && memoryChanges.length === validations.length);
  fail("metricViolations", knowledgeItems.reduce((sum, item) => sum + (item.lessons?.length ?? 0), 0) === targetTotals.lessons);
  fail("metricViolations", knowledgeItems.reduce((sum, item) => sum + (item.knowledgeVersions?.length ?? 0), 0) === targetTotals.versions);
  fail("metricViolations", evidence.length === targetTotals.evidence);
  const actorsUsed = new Set([
    ...tickets.map((ticket) => ticket.actorId),
    ...validations.map((validation) => validation.actorId)
  ]);
  fail("unresolvedActorReferences", actorsUsed.size === actorIds.size);
  for (const arc of simulation.arcs) {
    const item = knowledgeById.get(arc.canonical.id);
    fail("memoryChainViolations", Boolean(item));
    fail("metricViolations", tickets.filter((ticket) => ticket.arcId === arc.id).length === arc.targets.tickets);
    fail("metricViolations", validations.filter((validation) => validation.knowledgeId === arc.canonical.id).length === arc.targets.validations);
    fail("metricViolations", (item?.lessons?.length ?? 0) === arc.targets.lessons);
    fail("metricViolations", (item?.knowledgeVersions?.length ?? 0) === arc.targets.versions);
    fail("metricViolations", evidence.filter((intent) => intent.knowledgeItemId === arc.canonical.id).length === arc.targets.trustEvidence);
  }

  const violations = Object.values(report).reduce((sum, count) => sum + count, 0);
  if (violations > 0) {
    throw new Error(`Developer-demo simulation integrity verification failed: ${stableStringify(report)}`);
  }
  return report;
}
