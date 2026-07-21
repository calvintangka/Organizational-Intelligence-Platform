import type {
  KnowledgeCandidate,
  KnowledgeItem,
  MemoryChangeRecord,
  OrgMetrics,
  OrganizationProfile,
  ReflectionAction,
  TicketRecord,
  ValidationRecord
} from "@/types";
import type { MigrationExportTicketSequence } from "@/types/migrationExport";

export type NarrativeArcClass = "HERO" | "HIGH_FREQUENCY" | "LONG_TAIL";
export type DemoDomain =
  | "authentication"
  | "billing"
  | "integrations"
  | "permissions"
  | "reporting"
  | "mobile"
  | "notifications";
export type MaturityPlan = "high" | "established" | "developing" | "young";

export interface NarrativeArc {
  id: string;
  arcClass: NarrativeArcClass;
  domain: DemoDomain;
  maturityPlan: MaturityPlan;
  canonical: {
    id: string;
    title: string;
    problemSummary: string;
    category: string;
    tags: string[];
  };
  content: {
    symptom: string;
    initialGuidance: string;
    initialCustomerResponse: string;
    rootCauses: string[];
    solutionSteps: string[];
    ticketOpeners: string[];
  };
  lifecycle: {
    introducedAt: string;
    firstKnowledgeAfterTickets: number;
    incidentMonths: string[];
  };
  targets: {
    tickets: number;
    validations: number;
    lessons: number;
    versions: number;
    trustEvidence: number;
  };
}

export interface DeveloperDemoSimulationConfig {
  organizationId: string;
  profile: OrganizationProfile;
  seed: string;
  rngAlgorithm: "xoshiro128ss-v1";
  contractVersion: number;
  narrativeContentVersion: number;
  historyStart: string;
  historyEnd: string;
  timeZone: "Asia/Jakarta";
  ticketPrefix: "OIP";
}

export interface SimulatedTicketRecord extends TicketRecord {
  actorId: string;
  arcId: string;
  knowledgeId: string;
  resolutionMode: "human" | "automatic" | "none";
}

export interface SimulatedValidationRecord extends ValidationRecord {
  actorId: string;
}

export interface SimulatedMemoryChangeRecord extends MemoryChangeRecord {
  actorId: string;
}

export interface TrustEvidenceIntent {
  id: string;
  organizationId: string;
  knowledgeItemId: string;
  sourceTicketId: string;
  trustEventType: "HUMAN_REUSE";
  validationRecordId: string;
  actorId: string;
  delta: number;
  createdAt: string;
}

export type HistoricalEventType =
  | "ticket_created"
  | "knowledge_created"
  | "lesson_discovered"
  | "lesson_alias_created"
  | "knowledge_merged"
  | "version_created"
  | "human_reuse"
  | "automatic_success"
  | "edited_resolution"
  | "wrong_resolution";

export interface HistoricalEvent {
  id: string;
  type: HistoricalEventType;
  at: string;
  organizationId: string;
  arcId: string;
  actorId: string;
  ticketIds: string[];
  knowledgeId: string;
  candidateId?: string;
  validationId?: string;
  memoryChangeId?: string;
  payload: {
    action?: ReflectionAction;
    mode?: "human" | "automatic";
    success?: boolean;
    requiredEdits?: boolean;
    trustFrom?: number;
    trustTo?: number;
    trustDelta?: number;
    lessonId?: string;
    versionId?: string;
    detail?: string;
  };
}

export interface SimulatedPattern {
  id: string;
  organizationId: string;
  arcId: string;
  title: string;
  category: string;
  firstSeenAt: string;
  promotedAt: string;
  sourceTicketIds: string[];
}

export interface DeveloperDemoSimulationResources {
  knowledgeItems: KnowledgeItem[];
  tickets: SimulatedTicketRecord[];
  candidates: KnowledgeCandidate[];
  validations: SimulatedValidationRecord[];
  memoryChanges: SimulatedMemoryChangeRecord[];
  trustEvidenceIntents: TrustEvidenceIntent[];
  patterns: SimulatedPattern[];
  metrics: OrgMetrics;
  ticketSequence: MigrationExportTicketSequence;
}

export interface IntegrityReport {
  organizationIsolationViolations: number;
  unresolvedActorReferences: number;
  duplicateIds: number;
  candidateViolations: number;
  validationReferenceViolations: number;
  memoryReferenceViolations: number;
  memoryChainViolations: number;
  trustEvidenceUniquenessViolations: number;
  unresolvedTicketReferences: number;
  timestampViolations: number;
  aliasViolations: number;
  trustLifecycleViolations: number;
  metricViolations: number;
  ticketSequenceViolations: number;
  crossOrganizationReferences: number;
}

export interface RepresentativeHeroArc {
  arcId: string;
  title: string;
  firstTicketAt: string;
  knowledgeCreatedAt: string;
  finalTrust: number;
  lessons: number;
  versions: number;
  validations: number;
  evidenceIntents: number;
  milestones: Array<{ at: string; type: HistoricalEventType; detail: string }>;
}

export interface DeveloperDemoSimulation {
  config: DeveloperDemoSimulationConfig;
  arcs: NarrativeArc[];
  actorIds: string[];
  events: HistoricalEvent[];
  resources: DeveloperDemoSimulationResources;
  representativeHeroArc: RepresentativeHeroArc;
  integrity: IntegrityReport;
  digest: string;
}
