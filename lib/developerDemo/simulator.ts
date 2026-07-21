import {
  DEVELOPER_DEMO_ORGANIZATION_ID,
  developerDemoActors
} from "@/data/developerDemoFoundation";
import { developerDemoNarrativeArcs } from "@/data/developer-demo/narrativeArcs";
import {
  createCanonicalProblem,
  dedupeLessonCollection,
  mergeIntoCanonicalProblem
} from "@/lib/canonicalProblemEngine";
import { developerDemoSimulationConfig } from "@/lib/developerDemo/config";
import { computeDeveloperDemoSimulationDigest } from "@/lib/developerDemo/digest";
import { deriveDeveloperDemoMetrics } from "@/lib/developerDemo/metrics";
import { NamedDeterministicRng } from "@/lib/developerDemo/rng";
import type {
  DeveloperDemoSimulation,
  DeveloperDemoSimulationConfig,
  HistoricalEvent,
  HistoricalEventType,
  NarrativeArc,
  SimulatedMemoryChangeRecord,
  SimulatedPattern,
  SimulatedTicketRecord,
  SimulatedValidationRecord,
  TrustEvidenceIntent
} from "@/lib/developerDemo/types";
import { verifyDeveloperDemoSimulation } from "@/lib/developerDemo/verify";
import { formatTicketId } from "@/lib/ticketIdFormat";
import { recordResolution } from "@/lib/trustEngine";
import type {
  KnowledgeCandidate,
  KnowledgeItem,
  Lesson,
  ReflectionAction,
  Ticket,
  Understanding
} from "@/types";

const CUSTOMER_NAMES = [
  "Alya Noor", "Bima Arta", "Citra Wren", "Dian Sato", "Eka Vale", "Fara Quinn",
  "Gita Rowan", "Hadi Sol", "Indra Kade", "Juno Hart", "Kara Lumen", "Lio Voss",
  "Maya Rafi", "Nara Ivo", "Oren Mira", "Pia Taro", "Qori Nila", "Reno Anya",
  "Sana Dax", "Tio Sera", "Uma Rafi", "Vera Solis", "Wira Vale", "Xena Hart"
] as const;
const COMPANY_NAMES = [
  "Northstar Atelier", "Kite Harbor", "Juniper Works", "Cobalt Field", "Lantern Grove",
  "Pioneer Stack", "Riverstone Labs", "Atlas Loom", "Brightmill Studio", "Saffron Systems",
  "Cedar Point Digital", "Nimbus Forge", "Copperline Group", "Orchid Circuit", "Summit Thread"
] as const;
const PLATFORMS = ["Chrome on Windows", "Safari on macOS", "Edge on Windows", "Firefox on Linux", "Android", "iOS", "an API worker", "a managed browser"] as const;

interface TicketIntent {
  arc: NarrativeArc;
  arcOrdinal: number;
  at: string;
  actorId: string;
  status: SimulatedTicketRecord["status"];
  reservedOutcome?: TrustOutcome;
  customerName: string;
  companyName: string;
  platform: string;
  ticketId?: string;
}

type TrustOutcome =
  | { kind: "human"; requiredEdits: boolean }
  | { kind: "automatic"; requiredEdits: false }
  | { kind: "wrong"; requiredEdits: false };

interface TrustAssignment {
  outcome: TrustOutcome;
  ticketOrdinals: number[];
}

type LifecycleKind = "create" | "lesson" | "alias" | "version" | "merge" | "trust";

interface LifecycleIntent {
  arc: NarrativeArc;
  kind: LifecycleKind;
  localOrdinal: number;
  ticketIds: string[];
  candidateAt: string;
  validationAt: string;
  lessonIndex?: number;
  trustOutcome?: TrustOutcome;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function addMilliseconds(value: string, milliseconds: number): string {
  return new Date(new Date(value).getTime() + milliseconds).toISOString();
}

function monthKeys(): string[] {
  const result: string[] = [];
  for (let year = 2023; year <= 2026; year += 1) {
    const lastMonth = year === 2026 ? 6 : 12;
    for (let month = 1; month <= lastMonth; month += 1) result.push(`${year}-${pad(month, 2)}`);
  }
  return result;
}

function monthWeight(arc: NarrativeArc, monthKey: string): number {
  if (`${monthKey}-28T23:59:59.000Z` < arc.lifecycle.introducedAt) return 0;
  const month = Number(monthKey.slice(5, 7));
  let weight = 100;
  if (arc.lifecycle.incidentMonths.includes(monthKey)) weight += arc.arcClass === "HERO" ? 260 : 130;
  if (arc.domain === "authentication" && month === 1) weight += 110;
  if (arc.domain === "billing" && [3, 6, 9, 12].includes(month)) weight += 90;
  if (arc.domain === "reporting" && [3, 6, 9, 12].includes(month)) weight += 105;
  if (arc.domain === "notifications" && [11, 12].includes(month)) weight += 75;
  if (arc.domain === "mobile" && [4, 9, 10].includes(month)) weight += 70;
  if (month === 7) weight = Math.round(weight * 0.72);
  return weight;
}

function largestRemainder(total: number, weights: number[]): number[] {
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightTotal <= 0) throw new Error("Narrative arc has no active simulation months.");
  const exact = weights.map((weight) => (total * weight) / weightTotal);
  const allocated = exact.map((value) => Math.floor(value));
  let remaining = total - allocated.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - allocated[index] }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let index = 0; index < remaining; index += 1) allocated[order[index].index] += 1;
  return allocated;
}

function availableDays(monthKey: string, introducedAt: string): Array<{ day: number; weight: number }> {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const finalDay = monthKey === "2026-06" ? Math.min(daysInMonth, 26) : daysInMonth;
  const introducedDay = introducedAt.startsWith(monthKey) ? Number(introducedAt.slice(8, 10)) : 1;
  const weekdayWeights = [30, 115, 110, 110, 110, 95, 45];
  const result: Array<{ day: number; weight: number }> = [];
  for (let day = Math.max(1, introducedDay); day <= finalDay; day += 1) {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    result.push({ day, weight: weekdayWeights[weekday] });
  }
  return result;
}

function ticketTimestamp(monthKey: string, day: number, hour: number, minute: number, second: number): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  return new Date(Date.UTC(year, month - 1, day, hour - 7, minute, second)).toISOString();
}

function humanOutcomes(count: number, editedIndices: number[]): TrustOutcome[] {
  const edited = new Set(editedIndices);
  return Array.from({ length: count }, (_, index) => ({
    kind: "human" as const,
    requiredEdits: edited.has(index)
  }));
}

function trustOutcomes(arc: NarrativeArc): TrustOutcome[] {
  if (arc.arcClass === "HERO") {
    const human = humanOutcomes(18, [5, 14]);
    return [
      ...human.slice(0, 5),
      { kind: "wrong", requiredEdits: false },
      ...human.slice(5, 11),
      { kind: "automatic", requiredEdits: false },
      ...human.slice(11, 14),
      { kind: "wrong", requiredEdits: false },
      ...human.slice(14),
      { kind: "automatic", requiredEdits: false },
      { kind: "automatic", requiredEdits: false }
    ];
  }
  if (arc.maturityPlan === "high") return humanOutcomes(16, [10]);
  if (arc.maturityPlan === "established" && arc.targets.tickets > 100) {
    const human = humanOutcomes(15, [6, 12]);
    return [...human.slice(0, 5), { kind: "wrong", requiredEdits: false }, ...human.slice(5, 10), { kind: "wrong", requiredEdits: false }, ...human.slice(10)];
  }
  if (arc.maturityPlan === "established") return humanOutcomes(10, [6]);
  if (arc.maturityPlan === "developing") return humanOutcomes(arc.targets.tickets > 50 ? 6 : 5, [2]);
  return humanOutcomes(2, [1]);
}

function balancedSizes(total: number, groups: number): number[] {
  const base = Math.floor(total / groups);
  const remainder = total % groups;
  return Array.from({ length: groups }, (_, index) => base + (index < remainder ? 1 : 0));
}

function trustAssignments(arc: NarrativeArc): TrustAssignment[] {
  const outcomes = trustOutcomes(arc);
  const humanCount = outcomes.filter((outcome) => outcome.kind === "human").length;
  const humanSizes = balancedSizes(arc.targets.trustEvidence, humanCount);
  let nextTicket = arc.lifecycle.firstKnowledgeAfterTickets;
  let humanOrdinal = 0;
  return outcomes.map((outcome) => {
    const count = outcome.kind === "human" ? humanSizes[humanOrdinal++] : 1;
    const ticketOrdinals = Array.from({ length: count }, (_, index) => nextTicket + index);
    nextTicket += count;
    if (nextTicket > arc.targets.tickets) {
      throw new Error(`Arc ${arc.id} cannot support its evidence plan without reusing source tickets.`);
    }
    return { outcome, ticketOrdinals };
  });
}

function actorForTicket(config: DeveloperDemoSimulationConfig, arc: NarrativeArc, ordinal: number): string {
  const rng = new NamedDeterministicRng(config.seed, `actor/ticket/${arc.id}/${pad(ordinal, 4)}`);
  const index = rng.weightedIndex([22, 18, 16, 14, 12, 8, 8, 2]);
  return developerDemoActors[index].id;
}

function actorForValidation(config: DeveloperDemoSimulationConfig, intent: LifecycleIntent): string {
  const rng = new NamedDeterministicRng(config.seed, `actor/validation/${intent.arc.id}/${pad(intent.localOrdinal, 4)}`);
  const eligible = intent.kind === "version"
    ? [developerDemoActors[4], developerDemoActors[5], developerDemoActors[6]]
    : [developerDemoActors[2], developerDemoActors[4], developerDemoActors[5], developerDemoActors[6], developerDemoActors[0], developerDemoActors[1]];
  const weights = intent.kind === "version" ? [28, 30, 42] : [25, 25, 20, 25, 3, 2];
  return eligible[rng.weightedIndex(weights)].id;
}

function generateTicketIntents(config: DeveloperDemoSimulationConfig): TicketIntent[] {
  const intents: TicketIntent[] = [];
  for (const arc of developerDemoNarrativeArcs) {
    const months = monthKeys();
    const allocations = largestRemainder(arc.targets.tickets, months.map((month) => monthWeight(arc, month)));
    const arcTickets: TicketIntent[] = [];
    let arcOrdinal = 0;
    for (let monthIndex = 0; monthIndex < months.length; monthIndex += 1) {
      const monthKey = months[monthIndex];
      const days = availableDays(monthKey, arc.lifecycle.introducedAt);
      if (days.length === 0 && allocations[monthIndex] > 0) throw new Error(`No valid days for ${arc.id} in ${monthKey}.`);
      for (let count = 0; count < allocations[monthIndex]; count += 1) {
        const ordinal = arcOrdinal++;
        const rng = new NamedDeterministicRng(config.seed, `ticket/${arc.id}/${pad(ordinal, 4)}`);
        const day = days[rng.weightedIndex(days.map((entry) => entry.weight))].day;
        arcTickets.push({
          arc,
          arcOrdinal: ordinal,
          at: ticketTimestamp(monthKey, day, 8 + rng.integer(10), rng.integer(60), ordinal % 60),
          actorId: actorForTicket(config, arc, ordinal),
          status: "resolved",
          customerName: rng.pick(CUSTOMER_NAMES),
          companyName: rng.pick(COMPANY_NAMES),
          platform: rng.pick(PLATFORMS)
        });
      }
    }
    arcTickets.sort((left, right) => asciiCompare(left.at, right.at) || left.arcOrdinal - right.arcOrdinal);
    const assignmentByTicket = new Map<number, TrustOutcome>();
    for (const assignment of trustAssignments(arc)) {
      for (const ordinal of assignment.ticketOrdinals) assignmentByTicket.set(ordinal, assignment.outcome);
    }
    arcTickets.forEach((ticket, index) => {
      ticket.arcOrdinal = index;
      ticket.reservedOutcome = assignmentByTicket.get(index);
      if (index < arc.lifecycle.firstKnowledgeAfterTickets || ticket.reservedOutcome?.kind === "human" || ticket.reservedOutcome?.kind === "automatic") {
        ticket.status = "resolved";
      } else if (ticket.reservedOutcome?.kind === "wrong") {
        ticket.status = "rejected";
      } else {
        const statusRng = new NamedDeterministicRng(config.seed, `ticket-status/${arc.id}/${pad(index, 4)}`);
        const statusRoll = statusRng.integer(10_000);
        ticket.status = statusRoll < 7_800 ? "resolved" : statusRoll < 8_650 ? "rejected" : statusRoll < 9_300 ? "discarded" : statusRoll < 9_650 ? "open" : "in_review";
      }
    });
    intents.push(...arcTickets);
  }
  intents.sort((left, right) => asciiCompare(left.at, right.at) || asciiCompare(left.arc.id, right.arc.id) || left.arcOrdinal - right.arcOrdinal);
  intents.forEach((intent, index) => {
    const dateStamp = intent.at.slice(0, 10).replaceAll("-", "");
    intent.ticketId = formatTicketId(config.ticketPrefix, dateStamp, index + 1);
  });
  return intents;
}

function buildTicketRecords(config: DeveloperDemoSimulationConfig, intents: TicketIntent[]): SimulatedTicketRecord[] {
  return intents.map((intent) => {
    if (!intent.ticketId) throw new Error("Ticket ID allocation did not complete.");
    const rng = new NamedDeterministicRng(config.seed, `ticket-content/${intent.ticketId}`);
    const completed = intent.status === "resolved" || intent.status === "rejected";
    const automatic = intent.reservedOutcome?.kind === "automatic"
      || (!intent.reservedOutcome && intent.status === "resolved" && intent.at >= "2025-01-01T00:00:00.000Z" && rng.integer(100) < 24);
    const resolutionMode = completed ? (automatic ? "automatic" : "human") : "none";
    const durationMinutes = completed ? 20 + rng.integer(intent.status === "rejected" ? 4_200 : 1_420) : 0;
    const resolvedAt = completed ? addMilliseconds(intent.at, durationMinutes * 60_000) : null;
    const opener = rng.pick(intent.arc.content.ticketOpeners);
    const workspaceCode = `${intent.companyName.split(" ")[0].toUpperCase()}-${pad(intent.arcOrdinal + 1, 3)}`;
    const rawMessage = `${opener}. In workspace ${workspaceCode}, ${intent.arc.content.symptom} while using ${intent.platform}. The ${intent.companyName} administrator confirmed the behavior during their ${intent.at.slice(0, 7)} review.`;
    return {
      ticketId: intent.ticketId,
      orgId: config.organizationId,
      actorId: intent.actorId,
      arcId: intent.arc.id,
      knowledgeId: intent.arc.canonical.id,
      resolutionMode,
      createdAt: intent.at,
      rawMessage,
      subject: `${intent.arc.canonical.title} — ${workspaceCode}`,
      classification: {
        category: intent.arc.canonical.category,
        intent: intent.arc.id.replace("demo-arc-", ""),
        canonicalProblem: intent.arc.canonical.title,
        classifiedBy: "deterministic",
        confidence: "high"
      },
      memoryMatch: null,
      draftSource: completed ? "deterministic" : "no_template",
      resolution: {
        finalResponse: intent.status === "resolved" ? intent.arc.content.initialCustomerResponse : null,
        humanEdited: intent.reservedOutcome
          ? intent.reservedOutcome.kind === "human" && intent.reservedOutcome.requiredEdits
          : resolutionMode === "human" && rng.integer(100) < 14,
        editDistanceNote: resolutionMode === "human" ? "Deterministic scoped wording review" : null,
        resolvedAt
      },
      reflection: {
        decision: null,
        lessonCreatedId: null,
        lessonReinforcedId: null,
        knowledgeChanged: null
      },
      validationRecordIds: [],
      status: intent.status
    };
  });
}

function sourceTime(ticket: SimulatedTicketRecord): string {
  return ticket.resolution.resolvedAt ?? ticket.createdAt;
}

function sourceForPosition(tickets: SimulatedTicketRecord[], fraction: number): SimulatedTicketRecord {
  const eligible = tickets.filter((ticket) => ticket.status === "resolved" || ticket.status === "rejected");
  const index = Math.min(eligible.length - 1, Math.max(0, Math.round(fraction * (eligible.length - 1))));
  return eligible[index];
}

function lifecycleIntentsForArc(arc: NarrativeArc, tickets: SimulatedTicketRecord[]): LifecycleIntent[] {
  const sortedTickets = [...tickets].sort((left, right) => asciiCompare(left.createdAt, right.createdAt) || asciiCompare(left.ticketId, right.ticketId));
  const byOrdinal = sortedTickets;
  const intents: LifecycleIntent[] = [];
  let localOrdinal = 0;
  const push = (kind: LifecycleKind, sourceTickets: SimulatedTicketRecord[], options: Partial<LifecycleIntent> = {}) => {
    localOrdinal += 1;
    const latest = sourceTickets.reduce((value, ticket) => sourceTime(ticket) > value ? sourceTime(ticket) : value, sourceTime(sourceTickets[0]));
    const candidateAt = addMilliseconds(latest, 3_600_000 + localOrdinal * 2_000);
    intents.push({
      arc,
      kind,
      localOrdinal,
      ticketIds: sourceTickets.map((ticket) => ticket.ticketId).sort(asciiCompare),
      candidateAt,
      validationAt: addMilliseconds(candidateAt, 300_000),
      ...options
    });
  };

  const creationSources = byOrdinal.slice(0, arc.lifecycle.firstKnowledgeAfterTickets);
  push("create", creationSources);

  const assignments = trustAssignments(arc);
  for (const assignment of assignments) {
    push("trust", assignment.ticketOrdinals.map((ordinal) => byOrdinal[ordinal]), { trustOutcome: assignment.outcome });
  }

  for (let lessonIndex = 0; lessonIndex < arc.targets.lessons; lessonIndex += 1) {
    const fraction = 0.08 + (lessonIndex + 1) / (arc.targets.lessons + 2) * 0.68;
    push("lesson", [sourceForPosition(sortedTickets, fraction)], { lessonIndex });
  }
  for (let versionIndex = 1; versionIndex < arc.targets.versions; versionIndex += 1) {
    const fraction = 0.18 + versionIndex / arc.targets.versions * 0.72;
    push("version", [sourceForPosition(sortedTickets, fraction)]);
  }

  const aliasCount = arc.arcClass === "HERO" || (arc.arcClass === "HIGH_FREQUENCY" && arc.targets.tickets > 150) ? 1 : 0;
  for (let index = 0; index < aliasCount; index += 1) push("alias", [sourceForPosition(sortedTickets, 0.82 + index * 0.04)]);

  const remaining = arc.targets.validations - intents.length;
  if (remaining < 0) throw new Error(`Arc ${arc.id} lifecycle events exceed its validation target.`);
  for (let index = 0; index < remaining; index += 1) {
    const fraction = 0.1 + (index + 1) / (remaining + 1) * 0.88;
    push("merge", [sourceForPosition(sortedTickets, fraction)]);
  }
  return intents;
}

function asTicket(ticket: SimulatedTicketRecord): Ticket {
  return {
    id: ticket.ticketId,
    ticketId: ticket.ticketId,
    customerName: ticket.rawMessage.split(" administrator")[0].split("The ").pop() ?? "Demo Customer",
    subject: ticket.subject ?? "Support request",
    description: ticket.rawMessage,
    category: ticket.classification?.category ?? "Support",
    status: ticket.status === "resolved" ? "resolved" : "reviewed",
    createdAt: ticket.createdAt
  };
}

function asUnderstanding(ticket: SimulatedTicketRecord, arc: NarrativeArc): Understanding {
  return {
    ticketId: ticket.ticketId,
    summary: arc.canonical.problemSummary,
    coreProblem: arc.canonical.title,
    category: arc.canonical.category,
    intent: arc.id.replace("demo-arc-", ""),
    urgency: arc.arcClass === "HERO" ? "high" : arc.arcClass === "HIGH_FREQUENCY" ? "medium" : "low",
    tags: arc.canonical.tags,
    detectedSignals: [arc.content.symptom, ...arc.canonical.tags.slice(0, 3)],
    extractedFields: {
      senderName: null,
      senderRole: "workspace administrator",
      companyName: null,
      deadline: null,
      subIssues: [arc.content.symptom],
      urgencyIndicators: arc.arcClass === "HERO" ? ["incident"] : []
    }
  };
}

function historyEntry(ordinal: number, event: string, detail: string, createdAt: string) {
  return { id: `demo-hist-${pad(ordinal, 7)}`, event, detail, createdAt };
}

function buildLesson(arc: NarrativeArc, index: number, sourceTicketId: string, createdAt: string): Lesson {
  const rootCause = arc.content.rootCauses[index % arc.content.rootCauses.length];
  const solution = arc.content.solutionSteps[index % arc.content.solutionSteps.length];
  const lessonOrdinal = index + 1;
  return {
    id: `demo-les-${arc.id.replace("demo-arc-", "")}-${pad(lessonOrdinal, 3)}`,
    title: `${arc.canonical.title}: root cause ${lessonOrdinal}`,
    rootCause: `${rootCause}; this explains the ${arc.canonical.title.toLowerCase()} pattern.`,
    solution: `${solution}, then verify the result against the affected workspace timeline.`,
    customerResponse: `Hello {{customerName}},\n\nWe found that ${rootCause}. We will ${solution} and confirm the result before closing {{ticketId}}.\n\nKind regards,\nOIP Developer Demo Support Team`,
    signals: [
      `${arc.domain} ${arc.canonical.tags[1] ?? "support"}`,
      `${arc.canonical.tags[2] ?? arc.domain} timeline`,
      `root cause ${pad(lessonOrdinal, 2)} ${arc.id.replace("demo-arc-", "")}`
    ],
    whenToEscalate: `Escalate when ${rootCause} remains after the scoped verification steps.`,
    doNotPromise: ["Do not promise immediate recovery before verification.", "Do not request credentials or secrets."],
    createdAt,
    sourceTicketId,
    sourceTicketIds: [sourceTicketId]
  };
}

function capEmbeddedHistory(item: KnowledgeItem): KnowledgeItem {
  return {
    ...item,
    exampleTickets: [...(item.exampleTickets ?? [])]
      .sort((left, right) => asciiCompare(left.createdAt, right.createdAt) || asciiCompare(left.ticketId, right.ticketId))
      .slice(-12),
    learningHistory: [...(item.learningHistory ?? [])]
      .sort((left, right) => asciiCompare(left.createdAt, right.createdAt) || asciiCompare(left.id, right.id))
      .slice(-24)
  };
}

function activeVersionId(item: KnowledgeItem): string | undefined {
  return item.knowledgeVersions?.[item.knowledgeVersions.length - 1]?.versionId;
}

function eventType(intent: LifecycleIntent): HistoricalEventType {
  if (intent.kind === "create") return "knowledge_created";
  if (intent.kind === "lesson") return "lesson_discovered";
  if (intent.kind === "alias") return "lesson_alias_created";
  if (intent.kind === "version") return "version_created";
  if (intent.kind === "merge") return "knowledge_merged";
  if (intent.trustOutcome?.kind === "automatic") return "automatic_success";
  if (intent.trustOutcome?.kind === "wrong") return "wrong_resolution";
  return intent.trustOutcome?.requiredEdits ? "edited_resolution" : "human_reuse";
}

function proposedAction(intent: LifecycleIntent): ReflectionAction {
  if (intent.kind === "create") return "create_new";
  if (intent.kind === "version") return "create_version";
  if (intent.kind === "trust") return "trust_update_only";
  return "merge_existing";
}

function applyLifecycleIntent(
  config: DeveloperDemoSimulationConfig,
  intent: LifecycleIntent,
  ordinal: number,
  current: KnowledgeItem | undefined,
  ticketsById: Map<string, SimulatedTicketRecord>,
  priorValidations: SimulatedValidationRecord[],
  actorId: string
): { after: KnowledgeItem; payload: HistoricalEvent["payload"] } {
  const sourceTicket = ticketsById.get(intent.ticketIds[0]);
  if (!sourceTicket) throw new Error(`Missing source ticket ${intent.ticketIds[0]}.`);
  const actor = developerDemoActors.find((candidate) => candidate.id === actorId);
  if (!actor) throw new Error(`Missing actor ${actorId}.`);

  if (intent.kind === "create") {
    const created = createCanonicalProblem(
      asTicket(sourceTicket),
      asUnderstanding(sourceTicket, intent.arc),
      intent.arc.content.initialCustomerResponse,
      config.profile,
      intent.validationAt,
      intent.arc.canonical
    );
    const after = capEmbeddedHistory({
      ...created,
      id: intent.arc.canonical.id,
      organizationId: config.organizationId,
      canonicalProblemId: intent.arc.canonical.id,
      sourceTicketId: sourceTicket.ticketId,
      createdAt: intent.validationAt,
      approvedAt: intent.validationAt,
      lastUpdated: intent.validationAt,
      lastValidated: intent.validationAt,
      lastValidatedAt: intent.validationAt,
      internalGuidance: intent.arc.content.initialGuidance,
      knowledgeVersions: [{
        versionId: `${intent.arc.canonical.id}-v001`,
        version: 1,
        createdAt: intent.validationAt,
        changeReason: "Created from the first recurring validated ticket batch",
        sourceTicketId: sourceTicket.ticketId,
        summary: "Initial diagnostic and customer-response guidance"
      }],
      learningHistory: [historyEntry(ordinal, "Canonical problem created", `Created from ${intent.ticketIds.length} recurring tickets.`, intent.validationAt)],
      provenance: {
        sourceTicketId: sourceTicket.ticketId,
        contributingTicketIds: intent.ticketIds,
        createdBy: actor.name,
        createdAt: intent.validationAt,
        validatedBy: actor.name,
        validatedAt: intent.validationAt,
        validationBasis: "Deterministic recurring-ticket review",
        validationScope: intent.arc.domain
      },
      validation: {
        validatedBy: actor.name,
        validatedAt: intent.validationAt,
        validationBasis: "Approved deterministic foundation history",
        validationScope: intent.arc.domain,
        status: "validated"
      }
    });
    return { after, payload: { action: "create_new", versionId: activeVersionId(after), detail: "Initial canonical knowledge approved at trust 20." } };
  }

  if (!current) throw new Error(`Lifecycle event ${intent.kind} preceded creation for ${intent.arc.id}.`);
  if (intent.kind === "lesson") {
    const lesson = buildLesson(intent.arc, intent.lessonIndex ?? 0, sourceTicket.ticketId, intent.validationAt);
    const lessons = dedupeLessonCollection([...(current.lessons ?? []), lesson], {
      durableLessonIds: new Set([...(current.lessons ?? []).map((entry) => entry.id), lesson.id])
    });
    const after = capEmbeddedHistory({
      ...current,
      lessons: lessons.sort((left, right) => asciiCompare(left.createdAt, right.createdAt) || asciiCompare(left.id, right.id)),
      lastUpdated: intent.validationAt,
      lastValidated: intent.validationAt,
      lastValidatedAt: intent.validationAt,
      learningHistory: [...(current.learningHistory ?? []), historyEntry(ordinal, "Lesson discovered", lesson.rootCause, intent.validationAt)]
    });
    return { after, payload: { action: "merge_existing", lessonId: lesson.id, detail: lesson.rootCause } };
  }
  if (intent.kind === "alias") {
    const canonical = current.lessons?.[0];
    if (!canonical) throw new Error(`Alias event has no lesson in ${intent.arc.id}.`);
    const aliasId = `demo-les-alias-${intent.arc.id.replace("demo-arc-", "")}`;
    const duplicate: Lesson = { ...clone(canonical), id: aliasId, createdAt: intent.validationAt, sourceTicketId: sourceTicket.ticketId, sourceTicketIds: [sourceTicket.ticketId] };
    const durableIds = new Set([...(current.lessons ?? []).map((entry) => entry.id), aliasId]);
    const lessons = dedupeLessonCollection([...(current.lessons ?? []), duplicate], { durableLessonIds: durableIds })
      .map((lesson) => (lesson.aliasLessonIds ?? []).includes(aliasId) ? { ...lesson, updatedAt: intent.validationAt } : lesson);
    const after = capEmbeddedHistory({
      ...current,
      lessons: lessons.sort((left, right) => asciiCompare(left.createdAt, right.createdAt) || asciiCompare(left.id, right.id)),
      lastUpdated: intent.validationAt,
      lastValidated: intent.validationAt,
      lastValidatedAt: intent.validationAt,
      learningHistory: [...(current.learningHistory ?? []), historyEntry(ordinal, "Equivalent lesson consolidated", `${aliasId} now resolves to ${canonical.id}.`, intent.validationAt)]
    });
    return { after, payload: { action: "merge_existing", lessonId: canonical.id, detail: `Alias ${aliasId} consolidated through production deduplication.` } };
  }
  if (intent.kind === "version") {
    const version = (current.knowledgeVersions?.length ?? 0) + 1;
    const versionId = `${current.id}-v${pad(version, 3)}`;
    const after = capEmbeddedHistory({
      ...current,
      internalGuidance: `${intent.arc.content.initialGuidance} Revision ${version} adds ${intent.arc.content.solutionSteps[(version - 1) % intent.arc.content.solutionSteps.length]}.`,
      customerResponseTemplate: `${intent.arc.content.initialCustomerResponse}\n\nValidated guidance revision ${version}: confirm the scoped result before closure.`,
      approvedAnswer: `${intent.arc.content.initialCustomerResponse}\n\nValidated guidance revision ${version}: confirm the scoped result before closure.`,
      knowledgeVersions: [...(current.knowledgeVersions ?? []), {
        versionId,
        version,
        createdAt: intent.validationAt,
        changeReason: "Historical evidence strengthened diagnostic and escalation guidance",
        sourceTicketId: sourceTicket.ticketId,
        summary: `Guidance milestone ${version} for ${intent.arc.canonical.title}`
      }],
      lastUpdated: intent.validationAt,
      lastValidated: intent.validationAt,
      lastValidatedAt: intent.validationAt,
      learningHistory: [...(current.learningHistory ?? []), historyEntry(ordinal, "Knowledge version created", versionId, intent.validationAt)]
    });
    return { after, payload: { action: "create_version", versionId, detail: `Approved ${versionId}.` } };
  }
  if (intent.kind === "merge") {
    const merged = mergeIntoCanonicalProblem(
      current,
      asTicket(sourceTicket),
      asUnderstanding(sourceTicket, intent.arc),
      undefined,
      "human",
      intent.validationAt
    );
    const history = [...(merged.learningHistory ?? [])];
    if (history.length > 0) history[history.length - 1] = historyEntry(ordinal, "Supporting ticket merged", sourceTicket.ticketId, intent.validationAt);
    const after = capEmbeddedHistory({ ...merged, organizationId: config.organizationId, learningHistory: history });
    return { after, payload: { action: "merge_existing", detail: `Canonical support merge from ${sourceTicket.ticketId}.` } };
  }

  const outcome = intent.trustOutcome;
  if (!outcome) throw new Error(`Trust event missing outcome for ${intent.arc.id}.`);
  const resolution = recordResolution(
    current,
    {
      mode: outcome.kind === "automatic" ? "automatic" : "human",
      success: outcome.kind !== "wrong",
      requiredEdits: outcome.requiredEdits,
      at: intent.validationAt
    },
    config.profile,
    priorValidations
  );
  return {
    after: capEmbeddedHistory({ ...resolution.item, organizationId: config.organizationId, lastUpdated: intent.validationAt }),
    payload: {
      action: "trust_update_only",
      mode: outcome.kind === "automatic" ? "automatic" : "human",
      success: outcome.kind !== "wrong",
      requiredEdits: outcome.requiredEdits,
      trustFrom: resolution.trustFrom,
      trustTo: resolution.trustTo,
      trustDelta: resolution.trustDelta,
      detail: `Production recordResolution applied ${resolution.trustFrom} -> ${resolution.trustTo}.`
    }
  };
}

function representativeHero(
  arc: NarrativeArc,
  events: HistoricalEvent[],
  knowledge: KnowledgeItem,
  validations: SimulatedValidationRecord[],
  evidence: TrustEvidenceIntent[]
) {
  const arcEvents = events.filter((event) => event.arcId === arc.id).sort((left, right) => asciiCompare(left.at, right.at) || asciiCompare(left.id, right.id));
  const firstTicket = arcEvents.find((event) => event.type === "ticket_created");
  const creation = arcEvents.find((event) => event.type === "knowledge_created");
  if (!firstTicket || !creation) throw new Error(`Representative hero arc ${arc.id} is incomplete.`);
  const milestoneTypes = new Set<HistoricalEventType>(["knowledge_created", "lesson_discovered", "version_created", "wrong_resolution", "automatic_success"]);
  return {
    arcId: arc.id,
    title: arc.canonical.title,
    firstTicketAt: firstTicket.at,
    knowledgeCreatedAt: creation.at,
    finalTrust: knowledge.trustScore ?? 20,
    lessons: knowledge.lessons?.length ?? 0,
    versions: knowledge.knowledgeVersions?.length ?? 0,
    validations: validations.filter((record) => record.knowledgeId === knowledge.id).length,
    evidenceIntents: evidence.filter((record) => record.knowledgeItemId === knowledge.id).length,
    milestones: arcEvents
      .filter((event) => milestoneTypes.has(event.type))
      .slice(0, 12)
      .map((event) => ({ at: event.at, type: event.type, detail: event.payload.detail ?? event.type }))
  };
}

export function simulateDeveloperDemo(seed?: string): DeveloperDemoSimulation {
  const config = developerDemoSimulationConfig(seed);
  if (config.organizationId !== DEVELOPER_DEMO_ORGANIZATION_ID) throw new Error("Developer-demo simulator exact organization guard failed.");
  const ticketIntents = generateTicketIntents(config);
  const tickets = buildTicketRecords(config, ticketIntents);
  const ticketsById = new Map(tickets.map((ticket) => [ticket.ticketId, ticket]));
  const ticketsByArc = new Map<string, SimulatedTicketRecord[]>();
  for (const ticket of tickets) ticketsByArc.set(ticket.arcId, [...(ticketsByArc.get(ticket.arcId) ?? []), ticket]);

  const lifecycleIntents = developerDemoNarrativeArcs.flatMap((arc) => {
    const arcTickets = ticketsByArc.get(arc.id);
    if (!arcTickets) throw new Error(`No tickets generated for ${arc.id}.`);
    return lifecycleIntentsForArc(arc, arcTickets);
  }).sort((left, right) =>
    asciiCompare(left.validationAt, right.validationAt)
    || asciiCompare(left.arc.id, right.arc.id)
    || left.localOrdinal - right.localOrdinal
  );

  const knowledgeById = new Map<string, KnowledgeItem>();
  const candidates: KnowledgeCandidate[] = [];
  const validations: SimulatedValidationRecord[] = [];
  const memoryChanges: SimulatedMemoryChangeRecord[] = [];
  const trustEvidenceIntents: TrustEvidenceIntent[] = [];
  const lifecycleEvents: HistoricalEvent[] = [];
  let evidenceOrdinal = 0;

  lifecycleIntents.forEach((intent, index) => {
    const ordinal = index + 1;
    const candidateId = `demo-cand-${pad(ordinal, 6)}`;
    const validationId = `demo-val-${pad(ordinal, 6)}`;
    const memoryChangeId = `demo-mcr-${pad(ordinal, 6)}`;
    const actorId = actorForValidation(config, intent);
    const actor = developerDemoActors.find((entry) => entry.id === actorId);
    if (!actor) throw new Error(`Actor ${actorId} is not part of the developer-demo foundation.`);
    const before = knowledgeById.get(intent.arc.canonical.id);
    const applied = applyLifecycleIntent(config, intent, ordinal, before, ticketsById, validations, actorId);
    const after = applied.after;
    const action = proposedAction(intent);
    const candidate: KnowledgeCandidate = {
      id: candidateId,
      organizationId: config.organizationId,
      sourceTicketIds: [...new Set(intent.ticketIds)].sort(asciiCompare),
      proposedAction: action,
      proposedContent: {
        solution: after.approvedAnswer,
        customerResponseTemplate: after.customerResponseTemplate ?? after.approvedAnswer,
        internalGuidance: after.internalGuidance ?? intent.arc.content.initialGuidance,
        canonicalProblemTitle: after.canonicalProblemTitle ?? after.title,
        category: after.category,
        lessons: clone(after.lessons ?? [])
      },
      relatedKnowledgeId: intent.kind === "create" ? undefined : after.id,
      rationale: intent.kind === "merge"
        ? `Canonical support merge from ${intent.ticketIds.join(", ")}.`
        : `Deterministic ${eventType(intent)} lifecycle event for ${intent.arc.canonical.title}.`,
      status: "validated",
      createdAt: intent.candidateAt
    };
    const validation: SimulatedValidationRecord = {
      id: validationId,
      organizationId: config.organizationId,
      candidateId,
      knowledgeId: after.id,
      knowledgeVersionId: activeVersionId(after),
      decision: "approved",
      actor: actor.name,
      actorId,
      roleExercised: "knowledge_validator",
      rationale: `Approved deterministic ${eventType(intent)} event with source provenance.`,
      timestamp: intent.validationAt
    };
    const memory: SimulatedMemoryChangeRecord = {
      id: memoryChangeId,
      organizationId: config.organizationId,
      knowledgeId: after.id,
      candidateId,
      validationRecordId: validationId,
      actorId,
      changeType: action,
      beforeState: before ? clone(before) : null,
      afterState: clone(after),
      timestamp: intent.validationAt
    };
    knowledgeById.set(after.id, clone(after));
    candidates.push(candidate);
    validations.push(validation);
    memoryChanges.push(memory);

    for (const ticketId of candidate.sourceTicketIds) {
      const ticket = ticketsById.get(ticketId);
      if (!ticket) throw new Error(`Lifecycle event references unknown ticket ${ticketId}.`);
      ticket.validationRecordIds = [...ticket.validationRecordIds, validationId].sort(asciiCompare);
      ticket.reflection = {
        decision: action,
        lessonCreatedId: applied.payload.lessonId ?? null,
        lessonReinforcedId: intent.kind === "alias" ? applied.payload.lessonId ?? null : null,
        knowledgeChanged: after.id
      };
    }

    if (intent.kind === "trust" && intent.trustOutcome?.kind === "human") {
      for (const ticketId of candidate.sourceTicketIds) {
        evidenceOrdinal += 1;
        trustEvidenceIntents.push({
          id: `demo-te-${pad(evidenceOrdinal, 7)}`,
          organizationId: config.organizationId,
          knowledgeItemId: after.id,
          sourceTicketId: ticketId,
          trustEventType: "HUMAN_REUSE",
          validationRecordId: validationId,
          actorId,
          delta: applied.payload.trustTo! - applied.payload.trustFrom!,
          createdAt: intent.validationAt
        });
      }
    }

    lifecycleEvents.push({
      id: `demo-evt-lifecycle-${pad(ordinal, 7)}`,
      type: eventType(intent),
      at: intent.validationAt,
      organizationId: config.organizationId,
      arcId: intent.arc.id,
      actorId,
      ticketIds: candidate.sourceTicketIds,
      knowledgeId: after.id,
      candidateId,
      validationId,
      memoryChangeId,
      payload: applied.payload
    });
  });

  const knowledgeItems = [...knowledgeById.values()].map((item) => {
    const createdAt = item.createdAt;
    return {
      ...item,
      lessons: [...(item.lessons ?? [])].sort((left, right) => asciiCompare(left.createdAt, right.createdAt) || asciiCompare(left.id, right.id)),
      knowledgeVersions: [...(item.knowledgeVersions ?? [])].sort((left, right) => asciiCompare(left.createdAt, right.createdAt) || asciiCompare(left.versionId, right.versionId)),
      exampleTickets: [...(item.exampleTickets ?? [])].sort((left, right) => asciiCompare(left.createdAt, right.createdAt) || asciiCompare(left.ticketId, right.ticketId)),
      learningHistory: [...(item.learningHistory ?? [])].sort((left, right) => asciiCompare(left.createdAt, right.createdAt) || asciiCompare(left.id, right.id)),
      lastUpdated: item.lastUpdated ?? createdAt
    };
  }).sort((left, right) => asciiCompare(left.id, right.id));

  for (const ticket of tickets) {
    const knowledge = knowledgeById.get(ticket.knowledgeId);
    if (knowledge && ticket.createdAt >= knowledge.createdAt) {
      ticket.memoryMatch = { knowledgeId: knowledge.id, matchType: "template", lessonId: null };
    }
  }

  const patterns: SimulatedPattern[] = developerDemoNarrativeArcs.map((arc) => {
    const arcTickets = ticketsByArc.get(arc.id)!.sort((left, right) => asciiCompare(left.createdAt, right.createdAt));
    const knowledge = knowledgeById.get(arc.canonical.id)!;
    return {
      id: `demo-pat-${arc.id.replace("demo-arc-", "")}`,
      organizationId: config.organizationId,
      arcId: arc.id,
      title: `Emerging pattern: ${arc.canonical.title}`,
      category: arc.canonical.category,
      firstSeenAt: arcTickets[0].createdAt,
      promotedAt: knowledge.createdAt,
      sourceTicketIds: arcTickets.slice(0, arc.lifecycle.firstKnowledgeAfterTickets).map((ticket) => ticket.ticketId)
    };
  }).sort((left, right) => asciiCompare(left.id, right.id));

  const ticketEvents: HistoricalEvent[] = tickets.map((ticket, index) => ({
    id: `demo-evt-ticket-${pad(index + 1, 7)}`,
    type: "ticket_created",
    at: ticket.createdAt,
    organizationId: config.organizationId,
    arcId: ticket.arcId,
    actorId: ticket.actorId,
    ticketIds: [ticket.ticketId],
    knowledgeId: ticket.knowledgeId,
    payload: { detail: ticket.subject ?? ticket.ticketId }
  }));
  const events = [...ticketEvents, ...lifecycleEvents].sort((left, right) => asciiCompare(left.at, right.at) || asciiCompare(left.id, right.id));
  const sortedTickets = tickets.sort((left, right) => {
    const leftSequence = Number(left.ticketId.split("-").pop());
    const rightSequence = Number(right.ticketId.split("-").pop());
    return leftSequence - rightSequence;
  });
  const sortedCandidates = candidates.sort((left, right) => asciiCompare(left.id, right.id));
  const sortedValidations = validations.sort((left, right) => asciiCompare(left.id, right.id));
  const sortedMemory = memoryChanges.sort((left, right) => asciiCompare(left.id, right.id));
  const sortedEvidence = trustEvidenceIntents.sort((left, right) => asciiCompare(left.id, right.id));
  const metrics = deriveDeveloperDemoMetrics({
    organizationId: config.organizationId,
    historyEnd: config.historyEnd,
    tickets: sortedTickets,
    knowledgeItems,
    candidates: sortedCandidates,
    patterns
  });
  const resources = {
    knowledgeItems,
    tickets: sortedTickets,
    candidates: sortedCandidates,
    validations: sortedValidations,
    memoryChanges: sortedMemory,
    trustEvidenceIntents: sortedEvidence,
    patterns,
    metrics,
    ticketSequence: { organizationId: config.organizationId, counter: sortedTickets.length, updatedAt: config.historyEnd }
  };
  const heroArc = developerDemoNarrativeArcs.find((arc) => arc.arcClass === "HERO")!;
  const representativeHeroArc = representativeHero(heroArc, events, knowledgeById.get(heroArc.canonical.id)!, sortedValidations, sortedEvidence);
  const draft = {
    config,
    arcs: [...developerDemoNarrativeArcs],
    actorIds: developerDemoActors.map((actor) => actor.id),
    events,
    resources,
    representativeHeroArc
  };
  const integrity = verifyDeveloperDemoSimulation(draft);
  const digest = computeDeveloperDemoSimulationDigest(draft);
  return { ...draft, integrity, digest };
}
