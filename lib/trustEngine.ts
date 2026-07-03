import type { KnowledgeItem, OrganizationProfile, ResolutionMode, TrustDecision, TrustEvaluation, ValidationRecord } from "@/types";
import { defaultOrganizationProfile } from "@/data/seedOrganizationProfiles";

/**
 * Trust Engine - Phase 4.3 Organizational Learning.
 *
 * Knowledge gains or loses trust through outcomes. Phase 4.6 makes the
 * auto-resolution threshold configurable per organization profile.
 */

export const TRUST_INITIAL = 20;
export const TRUST_HUMAN_REUSE = 5;
export const TRUST_AUTO_SUCCESS = 3;
export const TRUST_HUMAN_EDIT_PENALTY = -2;
export const TRUST_WRONG_ANSWER = -10;

export const AUTO_THRESHOLD = 80;
export const RECOMMEND_THRESHOLD = 40;

export function clampTrust(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function resolveThreshold(profileOrThreshold: OrganizationProfile | number = defaultOrganizationProfile): number {
  return typeof profileOrThreshold === "number" ? profileOrThreshold : profileOrThreshold.autoResolutionThreshold;
}

function requiresHumanReview(item: KnowledgeItem, profile: OrganizationProfile): boolean {
  if (!profile.industry.toLowerCase().includes("legal")) return false;

  const text = `${item.title} ${item.problem} ${item.problemSummary ?? ""} ${item.category} ${item.tags.join(" ")}`.toLowerCase();
  return ["legal advice", "lawsuit", "sue", "case strategy", "settlement", "court", "employer dispute"].some((signal) =>
    text.includes(signal)
  );
}

/**
 * Fill in sensible defaults for any learning metadata that is missing.
 * Used when reading older knowledge items (e.g. seeds without trust fields).
 */
export function withLearningDefaults(item: KnowledgeItem, autoResolutionThreshold = AUTO_THRESHOLD): KnowledgeItem {
  const timesReused = item.timesReused ?? 0;
  const successfulResolutions = item.successfulResolutions ?? timesReused;
  const failedResolutions = item.failedResolutions ?? 0;
  const trustScore = clampTrust(item.trustScore ?? TRUST_INITIAL);

  return {
    ...item,
    timesReused,
    timesSeen: item.timesSeen ?? timesReused,
    successfulResolutions,
    failedResolutions,
    successRate: item.successRate ?? computeSuccessRate(successfulResolutions, failedResolutions),
    trustScore,
    lastUsedAt: item.lastUsedAt ?? null,
    lastValidatedAt: item.lastValidatedAt ?? item.approvedAt ?? null,
    autoResponseEligible: item.autoResponseEligible ?? false,
    humanReviewCount: item.humanReviewCount ?? 0,
    automaticResolutionCount: item.automaticResolutionCount ?? 0,
    lifecycleState: item.lifecycleState ?? "active"
  };
}

export function computeSuccessRate(successful: number, failed: number): number {
  const total = successful + failed;
  if (total === 0) return 100;
  return Math.round((successful / total) * 100);
}

export function getTrustDecision(score: number, autoResolutionThreshold = AUTO_THRESHOLD): TrustDecision {
  if (score >= autoResolutionThreshold) return "auto_resolution";
  if (score >= RECOMMEND_THRESHOLD) return "human_recommended";
  return "human_required";
}

function currentVersionId(item: KnowledgeItem): string | undefined {
  const versions = item.knowledgeVersions ?? [];
  return versions.length > 0 ? versions[versions.length - 1].versionId : undefined;
}

export function hasApprovedValidationForActiveVersion(
  item: KnowledgeItem,
  validationRecords: ValidationRecord[] = []
): boolean {
  const versionId = currentVersionId(item);
  return validationRecords.some((record) =>
    record.knowledgeId === item.id &&
    record.decision === "approved" &&
    (!versionId || record.knowledgeVersionId === versionId)
  );
}

export function decisionLabel(decision: TrustDecision): string {
  switch (decision) {
    case "auto_resolution":
      return "Automatic Resolution Allowed";
    case "human_recommended":
      return "Human Review Recommended";
    case "human_required":
    default:
      return "Human Review Required";
  }
}

export function trustMaturity(score: number, autoResolutionThreshold = AUTO_THRESHOLD): TrustEvaluation["maturity"] {
  if (score >= autoResolutionThreshold) return "Production Knowledge";
  if (score >= RECOMMEND_THRESHOLD) return "Maturing";
  return "Learning";
}

/**
 * Evaluate the trust of a knowledge item and decide how a matching ticket
 * should be handled. Pure function; does not mutate.
 */
export function evaluateTrust(
  item: KnowledgeItem,
  profileOrThreshold: OrganizationProfile | number = defaultOrganizationProfile,
  validationRecords: ValidationRecord[] = []
): TrustEvaluation {
  const threshold = resolveThreshold(profileOrThreshold);
  const score = clampTrust(item.trustScore ?? TRUST_INITIAL);
  const profile = typeof profileOrThreshold === "number" ? null : profileOrThreshold;
  const scoreDecision = getTrustDecision(score, threshold);
  const hasValidation = hasApprovedValidationForActiveVersion(item, validationRecords);
  const decision =
    profile && requiresHumanReview(item, profile)
      ? "human_required"
      : scoreDecision === "auto_resolution" && !hasValidation
      ? "human_recommended"
      : scoreDecision;

  return {
    score,
    decision,
    autoEligible: decision === "auto_resolution",
    maturity: trustMaturity(score, threshold),
    decisionLabel: decisionLabel(decision)
  };
}

/**
 * Apply a raw trust delta and return the updated item plus the applied delta.
 */
export function updateTrust(
  item: KnowledgeItem,
  delta: number,
  autoResolutionThreshold = AUTO_THRESHOLD
): { item: KnowledgeItem; delta: number; from: number; to: number } {
  const base = withLearningDefaults(item, autoResolutionThreshold);
  const from = base.trustScore ?? TRUST_INITIAL;
  const to = clampTrust(from + delta);
  return {
    item: { ...base, trustScore: to, autoResponseEligible: false },
    delta: to - from,
    from,
    to
  };
}

export interface ResolutionInput {
  mode: ResolutionMode;
  success: boolean;
  requiredEdits?: boolean;
  at?: string;
}

export interface ResolutionResult {
  item: KnowledgeItem;
  trustDelta: number;
  trustFrom: number;
  trustTo: number;
  events: Array<{ event: string; detail?: string }>;
}

/**
 * Record the outcome of using a knowledge item to resolve a ticket.
 * Updates counters, success rate, trust, lifecycle, and timestamps.
 */
export function recordResolution(
  item: KnowledgeItem,
  input: ResolutionInput,
  profileOrThreshold: OrganizationProfile | number = defaultOrganizationProfile,
  validationRecords: ValidationRecord[] = []
): ResolutionResult {
  const threshold = resolveThreshold(profileOrThreshold);
  const profile = typeof profileOrThreshold === "number" ? null : profileOrThreshold;
  const at = input.at ?? new Date().toISOString();
  const base = withLearningDefaults(item, threshold);
  const events: ResolutionResult["events"] = [];

  let trustDelta = 0;
  if (input.success) {
    trustDelta += input.mode === "automatic" ? TRUST_AUTO_SUCCESS : TRUST_HUMAN_REUSE;
  } else {
    trustDelta += TRUST_WRONG_ANSWER;
  }
  if (input.requiredEdits) {
    trustDelta += TRUST_HUMAN_EDIT_PENALTY;
  }

  const trustFrom = base.trustScore ?? TRUST_INITIAL;
  const trustTo = clampTrust(trustFrom + trustDelta);

  const successfulResolutions = (base.successfulResolutions ?? 0) + (input.success ? 1 : 0);
  const failedResolutions = (base.failedResolutions ?? 0) + (input.success ? 0 : 1);
  const timesReused = (base.timesReused ?? 0) + 1;
  const timesSeen = (base.timesSeen ?? 0) + 1;
  const humanReviewCount = (base.humanReviewCount ?? 0) + (input.mode === "human" ? 1 : 0);
  const automaticResolutionCount = (base.automaticResolutionCount ?? 0) + (input.mode === "automatic" ? 1 : 0);
  const successRate = computeSuccessRate(successfulResolutions, failedResolutions);
  const hasValidation = hasApprovedValidationForActiveVersion(base, validationRecords);
  const autoResponseEligible = profile && requiresHumanReview(base, profile) ? false : trustTo >= threshold && hasValidation;

  const updated: KnowledgeItem = {
    ...base,
    timesReused,
    timesSeen,
    successfulResolutions,
    failedResolutions,
    successRate,
    trustScore: trustTo,
    lastUsedAt: at,
    lastValidatedAt: input.mode === "human" ? at : base.lastValidatedAt ?? null,
    autoResponseEligible,
    humanReviewCount,
    automaticResolutionCount
  };

  events.push({
    event: input.mode === "automatic" ? "Automatic resolution completed" : "Human-approved reuse completed",
    detail: `"${updated.title}"`
  });
  events.push({ event: `Times seen increased -> ${timesSeen}` });
  events.push({ event: `Success rate recalculated -> ${successRate}%` });
  events.push({
    event: `Trust ${trustDelta >= 0 ? "increased" : "decreased"} ${trustFrom} -> ${trustTo}`,
    detail: `Delta ${trustDelta >= 0 ? "+" : ""}${trustDelta}`
  });
  if (!autoResponseEligible && trustTo >= threshold - 10 && trustFrom < threshold) {
    events.push({ event: "Knowledge approaching auto-resolution threshold" });
  }
  if (autoResponseEligible && trustFrom < threshold) {
    events.push({
      event: "Knowledge reached Production Knowledge status",
      detail: `Trust >= ${threshold} - future matches can auto-resolve`
    });
  }
  events.push({ event: "Organizational memory updated" });

  return { item: updated, trustDelta, trustFrom, trustTo, events };
}

/**
 * Average trust across all knowledge items (rounded). 0 if none.
 */
export function averageTrust(items: KnowledgeItem[]): number {
  if (items.length === 0) return 0;
  const total = items.reduce((sum, item) => sum + (item.trustScore ?? TRUST_INITIAL), 0);
  return Math.round(total / items.length);
}
