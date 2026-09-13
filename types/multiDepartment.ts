export type DomainSensitivity = "internal" | "restricted";
export type DomainStatus = "active" | "archived";

export interface OrganizationDomain {
  id: string;
  organizationId: string;
  key: string;
  label: string;
  description: string | null;
  status: string;
  sensitivity: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DomainCapabilityGrant {
  id: string;
  organizationId: string;
  domainId: string;
  roleId: string;
  capabilityKey: string;
  createdAt: string;
}

export type SkillStatus = "DRAFT" | "READY_FOR_REVIEW" | "VALIDATED" | "SUSPENDED" | "REVOKED";
export type SkillPolicy = "ADVISORY" | "DRAFT_ONLY" | "HUMAN_APPROVAL_REQUIRED" | "BOUNDED_EXECUTION";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface SkillInputDefinition {
  key: string;
  label: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface OrganizationalSkillDefinition {
  purpose: string;
  requiredInputs: SkillInputDefinition[];
  capabilities: string[];
  permissions: string[];
  tools: string[];
  constraints: string[];
  expectedOutput: string;
  escalationConditions: string[];
  provenance?: Record<string, unknown>;
}

export interface OrganizationalSkill {
  id: string;
  organizationId: string;
  domainId: string;
  key: string;
  name: string;
  description: string;
  status: string;
  currentVersion: number | null;
  createdBy: string;
  validatedBy: string | null;
  validatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  domain?: OrganizationDomain | null;
  currentVersionRecord?: OrganizationalSkillVersion | null;
}

export interface OrganizationalSkillVersion {
  id: string;
  organizationId: string;
  skillId: string;
  version: number;
  status: string;
  definition: OrganizationalSkillDefinition;
  riskLevel: string;
  executionPolicy: string;
  humanReviewPolicy: string;
  scope: Record<string, unknown>;
  fingerprint: string;
  createdBy: string;
  validatedBy: string | null;
  validatedAt: string | null;
  createdAt: string;
  memoryLinks?: SkillMemoryLink[];
}

export interface SkillMemoryLink {
  id: string;
  organizationId: string;
  skillVersionId: string;
  knowledgeItemId: string;
  knowledgeVersionId: string | null;
  knowledgeRevision: number;
  relationship: string;
  createdAt: string;
}

export interface EffectiveSkillPolicy {
  mode: SkillPolicy;
  riskLevel: RiskLevel;
  humanReviewRequired: boolean;
  externalSideEffectsAllowed: boolean;
  requiredCapabilities: string[];
  permissions: string[];
  tools: string[];
  scope: Record<string, unknown>;
  warnings: string[];
}

export interface SkillCompositionResult {
  requestedTask: string;
  skillVersionIds: string[];
  inputs: SkillInputDefinition[];
  policy: EffectiveSkillPolicy;
  memoryLinks: SkillMemoryLink[];
  constraints: string[];
}

export type ExecutionSessionStatus = "PREPARED" | "RESULT_RECEIVED" | "HUMAN_REVIEW" | "ACCEPTED" | "CORRECTED" | "REJECTED" | "UNRESOLVED";
export type ExecutionOutcomeClassification = "REINFORCEMENT" | "CORRECTION" | "CHALLENGE" | "NEW_LESSON" | "SCOPE_CHANGE" | "UNRESOLVED";

export interface ExecutionPackage {
  id: string;
  organizationId: string;
  requestedTask: string;
  status: string;
  packageVersion: number;
  payload: Record<string, unknown>;
  payloadDigest: string;
  policy: EffectiveSkillPolicy;
  scope: Record<string, unknown>;
  riskLevel: string;
  humanReviewRequired: boolean;
  createdBy: string;
  idempotencyKey: string;
  requestId: string;
  correlationId: string;
  expiresAt: string | null;
  handedOffAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionSession {
  id: string;
  organizationId: string;
  packageId: string;
  status: ExecutionSessionStatus | string;
  executorType: string;
  externalCorrelationId: string | null;
  resultPayload: Record<string, unknown> | null;
  resultReference: string | null;
  resultDigest: string | null;
  reviewedBy: string | null;
  reviewDecision: string | null;
  reviewNotes: string | null;
  correctionPayload: Record<string, unknown> | null;
  outcomeClassification: ExecutionOutcomeClassification | string | null;
  outcomeSourceId: string | null;
  outcomeEvidenceId: string | null;
  idempotencyKey: string;
  createdAt: string;
  receivedAt: string | null;
  reviewedAt: string | null;
  updatedAt: string;
}

export type AskSource = "memory" | "current_data" | "combined" | "auto";
export type AskState = "memory_answer" | "memory_no_match" | "memory_weak_match" | "combined_answer" | "current_data_unavailable" | "clarification_required" | "forbidden";

export interface AskResult {
  state: AskState;
  source: "ORGANIZATIONAL_MEMORY" | "CURRENT_COMPANY_DATA" | "COMBINED" | "AMBIGUOUS";
  query: string;
  answer: string | null;
  memoryResult: unknown | null;
  memoryContext?: import("@/types/organizationalMemory").OrganizationalMemoryInspection | null;
  currentData: Record<string, unknown> | null;
  warnings: string[];
  routingExplanation: string;
}
