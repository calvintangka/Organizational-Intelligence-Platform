export type ReuseOutcomeClassification = "SUCCESS" | "CORRECTION_REQUIRED" | "FAILURE";
export type KnowledgeChallengeState = "OPEN" | "RESOLVED";
export type KnowledgeChallengeDisposition = "REVALIDATED" | "SCOPE_UPDATED" | "DEPRECATED";

export interface OrganizationalSourceView {
  id: string;
  organizationId: string;
  sourceKind: string;
  sourceSystem: string;
  sourceObjectType: string;
  sourceObjectId: string;
  occurredAt: string | null;
  capturedAt: string | null;
  actorId: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface EvidenceRecordView {
  id: string;
  organizationId: string;
  sourceId: string;
  evidenceType: string;
  evidenceRole: string;
  actorId: string | null;
  occurredAt: string | null;
  content: string | null;
  reference: string | null;
  state: string;
  metadata?: Record<string, unknown> | null;
  idempotencyKey: string;
  createdAt: string;
}

export interface KnowledgeReuseOutcomeView {
  id: string;
  organizationId: string;
  knowledgeItemId: string;
  knowledgeVersionId: string | null;
  sourceId: string;
  evidenceId: string;
  actorId: string;
  reuseMode: string | null;
  classification: ReuseOutcomeClassification;
  requiredEdits: boolean;
  trustAction: string | null;
  trustDelta: number | null;
  trustEvidenceId: string | null;
  knowledgeRevision: number;
  idempotencyKey: string;
  createdAt: string;
  source?: OrganizationalSourceView | null;
  evidence?: EvidenceRecordView | null;
}

export interface KnowledgeChallengeView {
  id: string;
  organizationId: string;
  knowledgeItemId: string;
  knowledgeVersionId: string | null;
  sourceId: string;
  evidenceId: string;
  openedBy: string;
  rationale: string;
  state: KnowledgeChallengeState;
  disposition: KnowledgeChallengeDisposition | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  decisionRationale: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export type OrganizationalSourceKind = "OPERATIONAL_EVENT" | "INCIDENT" | "DECISION" | "PROCESS_LEARNING" | "OTHER";

export interface OrganizationalMemoryInspection {
  knowledgeItem: import("@/types/knowledge").KnowledgeItem;
  source: OrganizationalSourceView | null;
  evidence: Array<{
    id: string;
    relationship: string;
    knowledgeVersionId: string | null;
    evidence: EvidenceRecordView;
    source: OrganizationalSourceView;
  }>;
  outcomes: KnowledgeReuseOutcomeView[];
  challenges: KnowledgeChallengeView[];
  history: import("@/types/knowledge").KnowledgeHistory;
}

export interface PreparedOrganizationalLearning {
  candidate: import("@/types/knowledge").KnowledgeCandidate;
  reflection: import("@/types/knowledge").ReflectionDecision;
}
