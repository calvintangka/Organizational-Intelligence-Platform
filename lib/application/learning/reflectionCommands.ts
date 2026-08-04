import { assessReflectionSafety, type ReflectionSafetyContext } from "@/lib/reflectionSafety";
import { generateReflection, type ReflectionLanguageContext } from "@/lib/reflection";
import type { ValidationCommitResult } from "@/lib/persistence/adapter";
import type { OrganizationPersistenceSession } from "@/lib/persistence/session";
import {
  createCanonicalProblem,
  createGeneralizedEvidenceExample,
  dedupeLessonCollection,
  identifyCanonicalProblem,
  lessonContentFingerprint,
  mergeIntoCanonicalProblem,
  mergeLessonIntoExisting,
  normalizeReusableLessonTemplate,
  resolveLessonIdForItem,
  withCanonicalProblemDefaults,
  createOpaqueProvenanceId
} from "@/lib/canonicalProblemEngine";
import { recordResolution, TRUST_INITIAL } from "@/lib/trustEngine";
import { ticketReferenceId, withStableValidationProvenance } from "@/lib/knowledgeProvenance";
import { businessLessonSignalAliases } from "@/lib/businessInquiry";
import type {
  DraftGroundingMode,
  IntelligenceLogEntry,
  KnowledgeCandidate,
  KnowledgeItem,
  Lesson,
  LessonDraft,
  MemoryChangeRecord,
  Metrics,
  OrgMetrics,
  OrganizationProfile,
  ReflectionAction,
  ReflectionCommitInput,
  ReflectionDecision,
  SuggestedResponse,
  Ticket,
  Understanding,
  ValidationRecord
} from "@/types";
import type { CanonicalProblemMatch } from "@/lib/canonicalProblemEngine";

export interface LearningActorContext { id: string; name: string; email?: string; }
export type LearningAuthority = "local" | "server";

export interface GenerateReflectionCommand {
  organizationId: string;
  actor: LearningActorContext;
  authority: LearningAuthority;
  requestId: string;
  organizationProfile: OrganizationProfile;
  ticket: Ticket;
  understanding: Understanding;
  reviewedResponse: string;
  existingMatch: CanonicalProblemMatch | null;
  selectedDraft?: { draftMode?: DraftGroundingMode; matchedLesson?: Lesson | null };
  languageContext?: ReflectionLanguageContext;
}

export interface GenerateReflectionResult {
  requestId: string;
  reflection: ReflectionDecision;
  diagnostics: { source: "deterministic"; organizationId: string };
}

export interface ValidateReflectionCommand {
  organizationId: string;
  actor: LearningActorContext;
  authority: LearningAuthority;
  requestId: string;
  reflection: ReflectionDecision;
  lessonDraft?: LessonDraft;
  safetyContext: ReflectionSafetyContext;
}

export interface ReflectionValidationResult {
  requestId: string;
  accepted: boolean;
  warnings: string[];
  reasons: string[];
  normalizedReflection: ReflectionDecision;
  normalizedLessonDraft?: LessonDraft;
}

export type LearningErrorClass =
  | "tenant_mismatch"
  | "invalid_command"
  | "reflection_generation_failure"
  | "validation_rejected"
  | "promotion_conflict"
  | "stale_revision"
  | "duplicate_validation"
  | "duplicate_promotion"
  | "rollback"
  | "unexpected_persistence"
  | "provider_failure";

export interface LearningFailure {
  requestId: string;
  errorClass: LearningErrorClass;
  retryable: boolean;
  safeMessage: string;
  organizationId: string;
  diagnosticMetadata?: Record<string, string | number | boolean | undefined>;
}

export class LearningApplicationError extends Error {
  readonly failure: LearningFailure;
  constructor(failure: LearningFailure, cause?: unknown) {
    super(failure.safeMessage, cause ? { cause } : undefined);
    this.name = "LearningApplicationError";
    this.failure = failure;
  }
}

export interface PromoteKnowledgeCommand {
  organizationId: string;
  actor: LearningActorContext;
  authority: LearningAuthority;
  requestId: string;
  idempotencyKey: string;
  organizationProfile: OrganizationProfile;
  ticket: Ticket;
  understanding: Understanding;
  reviewedResponse: string;
  suggestedResponse?: SuggestedResponse | null;
  reflection: ReflectionDecision;
  lessonDraft?: LessonDraft;
  problemName?: string;
  knowledgeItems: KnowledgeItem[];
  validationRecords: ValidationRecord[];
  currentOrgMetrics?: OrgMetrics;
  now?: string;
}

export interface KnowledgePromotionResult {
  requestId: string;
  replayed: boolean;
  action: ReflectionAction;
  committed: ValidationCommitResult;
  knowledgeItem: KnowledgeItem;
  candidate: KnowledgeCandidate;
  validation: ValidationRecord;
  memoryChange: MemoryChangeRecord;
  trustDelta: number;
  metricsPatch: Partial<Metrics>;
  orgMetricsPatch: Partial<OrgMetrics>;
  ticketReflection: {
    decision: ReflectionAction;
    lessonCreatedId: string | null;
    lessonReinforcedId: string | null;
    knowledgeChanged: string;
    validationRecordId: string;
  };
  followUp: Array<{ type: "knowledge_promoted" | "lesson_strengthened" | "pattern_discovery_requested" | "metrics_refresh_requested"; knowledgeId?: string; ticketId?: string }>;
  diagnostics: { organizationId: string; actorId: string; authority: LearningAuthority };
}

export interface LearningPorts {
  persistence: Pick<OrganizationPersistenceSession, "context" | "commitValidatedMemoryChange">;
  idempotency?: LearningIdempotencyPort;
  onEvent?: (event: { name: string; detail?: string }) => void;
}

interface StoredPromotion { payloadHash: string; result: KnowledgePromotionResult; }
export interface LearningIdempotencyPort {
  get(key: string): StoredPromotion | undefined;
  set(key: string, value: StoredPromotion): void;
}

const promotionReplayStore = new Map<string, StoredPromotion>();
const defaultIdempotency: LearningIdempotencyPort = {
  get: (key) => promotionReplayStore.get(key),
  set: (key, value) => promotionReplayStore.set(key, value)
};

function fail(command: { requestId: string; organizationId: string }, errorClass: LearningErrorClass, safeMessage: string, retryable = false, cause?: unknown): never {
  throw new LearningApplicationError({ requestId: command.requestId, organizationId: command.organizationId, errorClass, retryable, safeMessage }, cause);
}

function assertScope(command: { organizationId: string; requestId: string; actor: LearningActorContext; authority: LearningAuthority }, profileId?: string): void {
  if (!command.organizationId || !command.requestId || !command.actor?.id || !command.actor?.name) fail(command, "invalid_command", "Organization, request, and actor context are required.");
  if (profileId !== undefined && profileId !== command.organizationId) fail(command, "tenant_mismatch", "The learning organization does not match the explicit profile scope.");
  if (command.authority !== "local" && command.authority !== "server") fail(command, "invalid_command", "A valid persistence authority is required.");
}

function normalizeLessonDraft(draft: LessonDraft): LessonDraft {
  return {
    ...draft,
    rootCause: draft.rootCause.trim(),
    solution: draft.solution.trim(),
    customerResponse: draft.customerResponse.trim(),
    signals: [...new Set(draft.signals.map((signal) => signal.trim()).filter(Boolean))],
    existingLessonId: draft.existingLessonId?.trim() || undefined
  };
}

function stableId(prefix: string, key: string): string {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  return `${prefix}-${(hash >>> 0).toString(16)}`;
}

function payloadHash(command: PromoteKnowledgeCommand): string {
  const value = JSON.stringify({
    organizationId: command.organizationId,
    ticketId: ticketReferenceId(command.ticket),
    action: command.reflection.action,
    reflection: command.reflection,
    lessonDraft: command.lessonDraft,
    reviewedResponse: command.reviewedResponse,
    existingItemId: command.reflection.existingItemId
  });
  return stableId("payload", value);
}

function createCandidate(command: PromoteKnowledgeCommand, input: {
  action: ReflectionAction;
  sourceTicketIds: string[];
  solution: string;
  customerResponseTemplate: string;
  internalGuidance: string;
  canonicalProblemTitle?: string;
  category?: string;
  lessons?: Lesson[];
  relatedKnowledgeId?: string;
  rationale: string;
  now: string;
}): KnowledgeCandidate {
  return {
    id: stableId("candidate", command.idempotencyKey),
    organizationId: command.organizationId,
    sourceTicketIds: input.sourceTicketIds,
    proposedAction: input.action,
    proposedContent: {
      solution: input.solution,
      customerResponseTemplate: input.customerResponseTemplate,
      internalGuidance: input.internalGuidance,
      canonicalProblemTitle: input.canonicalProblemTitle,
      category: input.category,
      lessons: input.lessons
    },
    relatedKnowledgeId: input.relatedKnowledgeId,
    rationale: input.rationale,
    status: "proposed",
    createdAt: input.now
  };
}

function applyLessonToItem(item: KnowledgeItem, draft: LessonDraft, ticketId: string, now: string): KnowledgeItem {
  const lessons = item.lessons ?? [];
  const customerResponse = normalizeReusableLessonTemplate(draft.customerResponse);
  if (draft.mode === "new") {
    const lesson: Lesson = {
      id: stableId("lesson", `${ticketId}:${draft.rootCause}:${draft.solution}`),
      rootCause: draft.rootCause,
      solution: draft.solution,
      customerResponse,
      signals: item.category === "Business Inquiry"
        ? [...new Set([...draft.signals, ...businessLessonSignalAliases(item.canonicalProblemTitle ?? item.title)])]
        : draft.signals,
      createdAt: now,
      sourceTicketId: createOpaqueProvenanceId(ticketId)
    };
    return { ...item, lessons: mergeLessonIntoExisting(lessons, lesson, item.canonicalProblemId ?? item.id).lessons };
  }
  if (draft.mode === "improves_existing" && draft.existingLessonId) {
    const lessonId = resolveLessonIdForItem(item, draft.existingLessonId) ?? draft.existingLessonId;
    const updated = {
      ...item,
      lessons: lessons.map((lesson) => lesson.id === lessonId
        ? { ...lesson, rootCause: draft.rootCause, solution: draft.solution, customerResponse, signals: item.category === "Business Inquiry" ? [...new Set([...draft.signals, ...businessLessonSignalAliases(item.canonicalProblemTitle ?? item.title)])] : draft.signals, updatedAt: now }
        : lesson)
    };
    return { ...updated, lessons: dedupeLessonCollection(updated.lessons ?? [], { dedupeLessonContent: true }) };
  }
  return item;
}

function withValidationMetadata(item: KnowledgeItem, candidate: KnowledgeCandidate, validation: ValidationRecord): KnowledgeItem {
  return {
    ...withStableValidationProvenance(item, candidate.sourceTicketIds, {
      actor: validation.actor,
      timestamp: validation.timestamp,
      rationale: validation.rationale ?? candidate.rationale,
      scope: `Prototype ${candidate.proposedAction} validation`
    }),
    validation: {
      validatedBy: validation.actor,
      validatedAt: validation.timestamp,
      validationBasis: validation.rationale ?? candidate.rationale,
      validationScope: `Prototype ${candidate.proposedAction} validation`,
      status: validation.decision === "approved" ? "validated" : "rejected"
    },
    lifecycleState: validation.decision === "approved" ? "active" : item.lifecycleState
  };
}

export function generateReflectionCommand(command: GenerateReflectionCommand): GenerateReflectionResult {
  assertScope(command, command.organizationProfile.id);
  try {
    const reflection = generateReflection(command.understanding, command.reviewedResponse, command.existingMatch, command.selectedDraft, command.languageContext);
    return { requestId: command.requestId, reflection, diagnostics: { source: "deterministic", organizationId: command.organizationId } };
  } catch (error) {
    return fail(command, "reflection_generation_failure", "Reflection could not be generated. Review the ticket and try again.", false, error);
  }
}

export function validateReflectionCommand(command: ValidateReflectionCommand): ReflectionValidationResult {
  assertScope(command);
  const normalized = command.lessonDraft ? normalizeLessonDraft(command.lessonDraft) : undefined;
  if (!normalized) return { requestId: command.requestId, accepted: true, warnings: [], reasons: [], normalizedReflection: command.reflection };
  const safety = assessReflectionSafety(normalized, command.safetyContext);
  if (!safety.safe) {
    return { requestId: command.requestId, accepted: false, warnings: [], reasons: safety.issues, normalizedReflection: command.reflection, normalizedLessonDraft: normalized };
  }
  const warnings = normalized.mode === "new" && normalized.signals.length === 0 ? ["The lesson has no signal phrases; retrieval may be weaker until further evidence is learned."] : [];
  return { requestId: command.requestId, accepted: true, warnings, reasons: [], normalizedReflection: command.reflection, normalizedLessonDraft: normalized };
}

export async function promoteKnowledgeCommand(command: PromoteKnowledgeCommand, ports: LearningPorts): Promise<KnowledgePromotionResult> {
  assertScope(command, command.organizationProfile.id);
  if (
    ports.persistence.context.organizationId !== command.organizationId
    || ports.persistence.context.authority !== command.authority
  ) {
    fail(command, "unexpected_persistence", "Learning persistence scope does not match the explicit command context.");
  }
  if (!command.idempotencyKey.trim()) fail(command, "invalid_command", "An idempotency key is required for knowledge promotion.");
  const idempotency = ports.idempotency ?? defaultIdempotency;
  const scopedKey = `${command.organizationId}:${command.idempotencyKey}`;
  const hash = payloadHash(command);
  const replay = idempotency.get(scopedKey);
  if (replay) {
    if (replay.payloadHash !== hash) fail(command, "duplicate_promotion", "This idempotency key was already used for a different promotion payload.");
    return { ...replay.result, replayed: true };
  }
  if (command.lessonDraft) {
    const validation = validateReflectionCommand({
      organizationId: command.organizationId,
      actor: command.actor,
      authority: command.authority,
      requestId: command.requestId,
      reflection: command.reflection,
      lessonDraft: command.lessonDraft,
      safetyContext: { customerName: command.ticket.customerName, organizationName: command.organizationProfile.name, sourceTicketId: ticketReferenceId(command.ticket), sourceTicketText: `${command.ticket.subject} ${command.ticket.description}` }
    });
    if (!validation.accepted) fail(command, "validation_rejected", `Reflection rejected: ${validation.reasons.join(", ")}.`);
  }
  const now = command.now ?? new Date().toISOString();
  const ticketId = ticketReferenceId(command.ticket);
  const und = command.understanding;
  const draft = command.lessonDraft ? normalizeLessonDraft(command.lessonDraft) : undefined;
  const action = command.reflection.action;
  const expectedKnowledgeRevision = command.reflection.existingItemId
    ? command.knowledgeItems.find((item) => item.id === command.reflection.existingItemId)?.revision ?? 0
    : null;
  let beforeState: KnowledgeItem | null = null;
  let afterState: KnowledgeItem;
  let candidate: KnowledgeCandidate;
  let trustDelta = command.reflection.estimatedTrustDelta;
  let metricsPatch: Partial<Metrics> = { humanApprovedResponses: 1 };
  let orgMetricsPatch: Partial<OrgMetrics> = {};
  let lessonCreatedId: string | null = null;
  let lessonReinforcedId: string | null = null;

  if (action === "create_new") {
    const isBusinessInquiry = und.businessClassification?.inquiryType === "business_inquiry";
    const isUncategorized = !!command.reflection.problemNameRequired;
    const businessIntent = und.businessClassification?.intent;
    const businessTitle = businessIntent === "multilingual_support" ? "Multilingual Support Inquiry" : businessIntent === "company_information" ? "Company Information Inquiry" : businessIntent === "general_business_inquiry" ? "General Business Inquiry" : "Product Information Inquiry";
    const title = isBusinessInquiry ? businessTitle : isUncategorized ? command.problemName?.trim() : identifyCanonicalProblem(und, command.organizationProfile).title;
    if (isUncategorized && !title) fail(command, "invalid_command", "Name the new problem in Reflection before committing it to Organizational Memory.");
    const category = isBusinessInquiry ? "Business Inquiry" : isUncategorized ? "Uncategorized" : und.category;
    const canonicalTitle = title ?? "Uncategorized";
    const response = draft?.customerResponse?.trim() || command.reviewedResponse;
    candidate = createCandidate(command, { action, sourceTicketIds: [ticketId], solution: draft?.rootCause ?? und.coreProblem, customerResponseTemplate: response, internalGuidance: draft?.solution ?? und.summary, canonicalProblemTitle: canonicalTitle, category, rationale: command.reflection.rationale, now });
    const customCanonical = isBusinessInquiry || isUncategorized
      ? { title: canonicalTitle, category, problemSummary: draft?.rootCause ?? und.coreProblem, tags: und.tags }
      : undefined;
    afterState = createCanonicalProblem(command.ticket, und, response, command.organizationProfile, now, customCanonical);
    if (draft) afterState = applyLessonToItem(afterState, { ...draft, mode: "new" }, ticketId, now);
    metricsPatch = { ...metricsPatch, knowledgeItemsCreated: 1, canonicalProblemsTouched: 1, knowledgeVersionsCreated: 1 };
    orgMetricsPatch = { memoryGrowthToday: (command.currentOrgMetrics?.memoryGrowthToday ?? 0) + 1, knowledgeVersions: (command.currentOrgMetrics?.knowledgeVersions ?? 0) + 1 };
    lessonCreatedId = draft?.mode === "new" ? afterState.lessons?.find((lesson) => lessonContentFingerprint(lesson) === lessonContentFingerprint(draft))?.id ?? null : null;
  } else {
    beforeState = command.knowledgeItems.find((item) => item.id === command.reflection.existingItemId) ?? null;
    if (!beforeState) fail(command, "promotion_conflict", "The knowledge item selected by Reflection is no longer available.", true);
    const base = withCanonicalProblemDefaults(beforeState);
    candidate = createCandidate(command, {
      action,
      sourceTicketIds: [ticketId],
      solution: und.coreProblem,
      customerResponseTemplate: base.customerResponseTemplate ?? base.approvedAnswer,
      internalGuidance: base.internalGuidance ?? und.summary,
      canonicalProblemTitle: base.canonicalProblemTitle ?? base.title,
      category: base.category,
      relatedKnowledgeId: base.id,
      rationale: command.reflection.rationale,
      now
    });
    if (action === "merge_existing") {
      afterState = mergeIntoCanonicalProblem(base, command.ticket, und, undefined, "human", now);
      if (draft) afterState = applyLessonToItem(afterState, draft, ticketId, now);
      metricsPatch = { ...metricsPatch, canonicalProblemsTouched: 1, mergedTickets: 1, duplicatePreventions: 1 };
      orgMetricsPatch = { mergedTickets: (command.currentOrgMetrics?.mergedTickets ?? 0) + 1, duplicatePreventions: (command.currentOrgMetrics?.duplicatePreventions ?? 0) + 1 };
    } else if (action === "create_version") {
      const lessonGrounded = command.suggestedResponse?.draftMode === "lesson_grounded";
      const updatesGeneric = !lessonGrounded && !draft;
      const version = (base.knowledgeVersions?.length ?? 0) + 1;
      afterState = {
        ...base,
        ...(updatesGeneric ? { customerResponseTemplate: command.reviewedResponse, approvedAnswer: command.reviewedResponse } : {}),
        exampleTickets: [...(base.exampleTickets ?? []), createGeneralizedEvidenceExample(ticketId, base.problemSummary ?? base.problem, "human")],
        knowledgeVersions: updatesGeneric ? [...(base.knowledgeVersions ?? []), { versionId: `${base.canonicalProblemId}-v${version}`, version, createdAt: now, changeReason: command.reflection.versionReason ?? "Human review introduced an improved response", sourceTicketId: ticketId, summary: `v${version}: Updated customer response template` }] : base.knowledgeVersions ?? [],
        timesSeen: (base.timesSeen ?? 0) + 1,
        humanReviewCount: (base.humanReviewCount ?? 0) + 1,
        lastUpdated: now,
        lastValidated: now,
        lastValidatedAt: now
      };
      if (draft) afterState = applyLessonToItem(afterState, draft, ticketId, now);
      metricsPatch = { ...metricsPatch, canonicalProblemsTouched: 1, ...(updatesGeneric ? { knowledgeVersionsCreated: 1 } : {}) };
      orgMetricsPatch = updatesGeneric ? { knowledgeVersions: (command.currentOrgMetrics?.knowledgeVersions ?? 0) + 1 } : {};
    } else {
      const targetWithEvidence = mergeIntoCanonicalProblem(base, command.ticket, und, undefined, "human", now);
      const trust = recordResolution(targetWithEvidence, { mode: "human", success: true, at: now }, command.organizationProfile, command.validationRecords);
      afterState = draft ? applyLessonToItem(trust.item, draft, ticketId, now) : trust.item;
      trustDelta = trust.trustDelta;
      lessonReinforcedId = draft?.mode === "improves_existing" ? draft.existingLessonId ?? null : null;
      metricsPatch = { ...metricsPatch, ...(lessonReinforcedId ? {} : {}) };
    }
  }

  if (!lessonReinforcedId && draft?.mode === "improves_existing") lessonReinforcedId = draft.existingLessonId ?? null;
  const createdKnowledge = action === "create_new";
  orgMetricsPatch = {
    lifetimeTickets: (command.currentOrgMetrics?.lifetimeTickets ?? 0) + 1,
    knowledgeReused: (command.currentOrgMetrics?.knowledgeReused ?? 0) + (createdKnowledge ? 0 : 1),
    humanResolutions: (command.currentOrgMetrics?.humanResolutions ?? 0) + 1,
    totalResolutionTimeSec: (command.currentOrgMetrics?.totalResolutionTimeSec ?? 0) + 95,
    resolutionsCount: (command.currentOrgMetrics?.resolutionsCount ?? 0) + 1,
    memoryGrowthToday: (command.currentOrgMetrics?.memoryGrowthToday ?? 0) + (createdKnowledge ? 1 : 0),
    ...orgMetricsPatch
  };

  const validation: ValidationRecord = {
    id: stableId("validation", command.idempotencyKey),
    organizationId: command.organizationId,
    candidateId: candidate.id,
    knowledgeId: afterState.id,
    knowledgeVersionId: afterState.knowledgeVersions?.at(-1)?.versionId,
    decision: "approved",
    actor: command.actor.name,
    roleExercised: "knowledge_validator",
    rationale: command.reflection.rationale,
    timestamp: now
  };
  const validatedCandidate: KnowledgeCandidate = { ...candidate, status: "validated" };
  afterState = { ...withValidationMetadata(afterState, validatedCandidate, validation), revision: (expectedKnowledgeRevision ?? 0) + 1 };
  const memoryChange: MemoryChangeRecord = {
    id: stableId("memory-change", command.idempotencyKey),
    organizationId: command.organizationId,
    knowledgeId: afterState.id,
    candidateId: candidate.id,
    validationRecordId: validation.id,
    changeType: action,
    beforeState,
    afterState,
    timestamp: now
  };
  let committed: ValidationCommitResult;
  try {
    committed = await ports.persistence.commitValidatedMemoryChange({ candidate: validatedCandidate, validation, memoryChange, knowledgeItem: afterState, expectedKnowledgeRevision, idempotencyKey: command.idempotencyKey });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const errorClass: LearningErrorClass = /stale|revision|changed/.test(message) ? "stale_revision" : /already|duplicate|idempotency|conflict/.test(message) ? "promotion_conflict" : "rollback";
    return fail(command, errorClass, "Knowledge promotion was not committed. The review remains retryable and no partial promotion is reported.", errorClass === "stale_revision", error);
  }
  const result: KnowledgePromotionResult = {
    requestId: command.requestId,
    replayed: committed.replayed,
    action,
    committed,
    knowledgeItem: committed.knowledgeItem,
    candidate: committed.candidate,
    validation: committed.validation,
    memoryChange: committed.memoryChange,
    trustDelta,
    metricsPatch,
    orgMetricsPatch,
    ticketReflection: { decision: action, lessonCreatedId, lessonReinforcedId, knowledgeChanged: committed.knowledgeItem.id, validationRecordId: committed.validation.id },
    followUp: [
      { type: "knowledge_promoted", knowledgeId: committed.knowledgeItem.id, ticketId },
      ...(draft ? [{ type: "lesson_strengthened" as const, knowledgeId: committed.knowledgeItem.id, ticketId }] : []),
      { type: "metrics_refresh_requested" }
    ],
    diagnostics: { organizationId: command.organizationId, actorId: command.actor.id, authority: command.authority }
  };
  idempotency.set(scopedKey, { payloadHash: hash, result });
  ports.onEvent?.({ name: "Knowledge promotion committed", detail: `${committed.knowledgeItem.title} · ${action}` });
  return result;
}

export type { ReflectionCommitInput };
