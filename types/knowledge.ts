export interface KnowledgeProvenance {
  sourceTicketId: string;
  contributingTicketIds?: string[];
  createdBy: string;
  createdAt: string;
  validatedBy: string;
  validatedAt: string;
  validationBasis: string;
  validationScope: string;
}

export interface KnowledgeValidation {
  validatedBy: string;
  validatedAt: string;
  validationBasis: string;
  validationScope: string;
  status: "validated" | "pending" | "rejected";
}

export type KnowledgeCandidateStatus = "proposed" | "validated" | "rejected";

export interface KnowledgeCandidateContent {
  solution: string;
  customerResponseTemplate: string;
  internalGuidance: string;
  canonicalProblemTitle?: string;
  category?: string;
  lessons?: Lesson[];
  importMetadata?: {
    sourceType: "knowledge_pack";
    sourceLabel: string;
    packId: string;
    packName: string;
    packVersion: string;
    packAuthor: string;
    packLanguage: string;
    packDescription: string;
  };
}

export interface KnowledgeCandidate {
  id: string;
  // Pre-isolation localStorage records may omit ownership. Org-scoped loaders
  // stamp the requested id; persistence APIs require that id explicitly.
  organizationId?: string;
  sourceTicketIds: string[];
  proposedAction: ReflectionAction;
  proposedContent: KnowledgeCandidateContent;
  relatedKnowledgeId?: string;
  rationale: string;
  status: KnowledgeCandidateStatus;
  createdAt: string;
}

export interface ValidationRecord {
  id: string;
  // Kept optional only for legacy v2 deserialization before migration stamps it.
  organizationId?: string;
  candidateId: string;
  knowledgeId?: string;
  knowledgeVersionId?: string;
  decision: "approved" | "rejected";
  actor: string;
  roleExercised: "knowledge_validator";
  rationale?: string;
  timestamp: string;
}

export interface MemoryChangeRecord {
  id: string;
  // Kept optional only for preserved legacy history read through owner fallback.
  organizationId?: string;
  knowledgeId: string;
  candidateId: string;
  validationRecordId: string;
  changeType: ReflectionAction;
  beforeState: KnowledgeItem | null;
  afterState: KnowledgeItem;
  timestamp: string;
}

export interface CanonicalProblemExample {
  ticketId: string;
  customerName: string;
  originalIssue: string;
  createdAt: string;
  resolutionMode: "human" | "automatic" | "pending";
}

export interface KnowledgeVersion {
  versionId: string;
  version?: number;
  createdAt: string;
  changeReason: string;
  sourceTicketId: string;
  summary?: string;
}

export type ReflectionAction = "create_new" | "merge_existing" | "create_version" | "trust_update_only";

export interface ReflectionDecision {
  isLearningEvent: boolean;
  action: ReflectionAction;
  rationale: string;
  existingItemId?: string;
  existingItemTitle?: string;
  existingItemSimilarity?: number;
  versionReason?: string;
  problemNameRequired?: boolean;
  suggestedProblemName?: string;
  trustImpact: "increase" | "decrease" | "reset_partial" | "none";
  estimatedTrustDelta: number;
}

export interface LearningHistoryEntry {
  id: string;
  event: string;
  detail?: string;
  createdAt: string;
}

export interface Lesson {
  id: string;
  title?: string;
  rootCause: string;
  solution: string;
  customerResponse: string;
  signals: string[];
  whenToEscalate?: string;
  doNotPromise?: string[];
  createdAt: string;
  sourceTicketId: string;
  sourceTicketIds?: string[];
  updatedAt?: string;
  conflictOfLessonId?: string;
  conflictReason?: string;
}

export type LessonMode = "new" | "matches_existing" | "improves_existing";

export interface LessonDraft {
  mode: LessonMode;
  rootCause: string;
  solution: string;
  customerResponse: string;
  signals: string[];
  existingLessonId?: string;
}

export interface ReflectionCommitInput {
  lessonDraft?: LessonDraft;
  problemName?: string;
}

export interface KnowledgeItem {
  id: string;
  // Seed and legacy records can omit ownership; org-scoped persistence stamps it.
  organizationId?: string;
  /**
   * Server persistence optimistic-concurrency revision. Populated by database
   * reads and bumped on every committed write; absent for local-only items.
   */
  revision?: number;
  title: string;
  problem: string;
  approvedAnswer: string;
  category: string;
  tags: string[];
  sourceTicketId: string;
  timesReused: number;
  createdAt: string;
  approvedAt: string;
  lifecycleState?: "active" | "candidate" | "deprecated";
  provenance?: KnowledgeProvenance;
  validation?: KnowledgeValidation;

  // Phase 4.3 — Organizational Learning metadata
  timesSeen?: number;
  successfulResolutions?: number;
  failedResolutions?: number;
  successRate?: number;
  trustScore?: number;
  lastUsedAt?: string | null;
  lastValidatedAt?: string | null;
  autoResponseEligible?: boolean;
  humanReviewCount?: number;
  automaticResolutionCount?: number;

  // Phase 4.4 — Canonical Organizational Problem metadata
  canonicalProblemId?: string;
  canonicalProblemTitle?: string;
  problemSummary?: string;
  internalGuidance?: string;
  customerResponseTemplate?: string;
  resolutionWorkflow?: string[];
  exampleTickets?: CanonicalProblemExample[];
  knowledgeVersions?: KnowledgeVersion[];
  learningHistory?: LearningHistoryEntry[];
  lessons?: Lesson[];
  lastUpdated?: string;
  lastValidated?: string;
}

export type TrustDecision = "human_required" | "human_recommended" | "auto_resolution";
export type ResolutionMode = "human" | "automatic";

export interface TrustEvaluation {
  score: number;
  decision: TrustDecision;
  autoEligible: boolean;
  maturity: "Learning" | "Maturing" | "Production Knowledge";
  decisionLabel: string;
}

export interface KnowledgeMatch {
  item: KnowledgeItem;
  matchScore: number;
  matchReason: string;
  matchedTags?: string[];
  matchedKeywords?: string[];
  matchedCategory?: string | null;
}
