"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/maesa/Sidebar";
import type { ActiveView } from "@/components/maesa/Sidebar";
import { HomeView } from "@/components/views/HomeView";
import { TicketWorkspace } from "@/components/views/TicketWorkspace";
import type { TicketPhase } from "@/components/views/TicketWorkspace";
import { BulkUploadWorkspace } from "@/components/views/BulkUploadWorkspace";
import { KnowledgeView } from "@/components/views/KnowledgeView";
import { DashboardView } from "@/components/views/DashboardView";
import { OrganizationView } from "@/components/views/OrganizationView";
import { AccentPicker } from "@/components/AccentPicker";
import { primaryDemoTicketId, secondDemoTicketId, seedTickets } from "@/data/seedTickets";
import { defaultOrganizationProfile, seedOrganizationProfiles } from "@/data/seedOrganizationProfiles";
import { createAIAdapter } from "@/lib/ai/adapter";
import { buildAIAdvisory, shouldAcceptPatternSuggestion } from "@/lib/ai/deterministic";
import type { AIProviderResult } from "@/lib/ai/types";
import { assessBusinessRelevanceForProfile, observe, understandForProfile, buildReasoning, buildConfidence } from "@/lib/analyzer";
import { classifyBusinessDomain } from "@/lib/domainClassifier";
import { analyzeBulkEntries, prepareBulkClusterCommit } from "@/lib/bulkUpload";
import { retrieveMemory } from "@/lib/memory";
import { draftResponse, findMatchingLesson, isCompatibleForDrafting } from "@/lib/drafting";
import { generateReflection } from "@/lib/reflection";
import {
  createCanonicalProblem,
  findCanonicalProblem,
  identifyCanonicalProblem,
  mergeIntoCanonicalProblem,
  upsertCanonicalProblem,
  withCanonicalProblemDefaults
} from "@/lib/canonicalProblemEngine";
import { createLogEntry } from "@/lib/intelligenceLog";
import {
  hasSpecificCanonicalMatch,
  detectEmergingPattern,
  upsertEmergingPattern,
  promotePatternToCanonicalProblem
} from "@/lib/patternDiscovery";
import { defaultMetrics } from "@/lib/metrics";
import {
  recordResolution,
  evaluateTrust,
  decisionLabel,
  getTrustDecision,
  TRUST_INITIAL
} from "@/lib/trustEngine";
import {
  loadKnowledge,
  saveKnowledge,
  loadOrgMetrics,
  saveOrgMetrics,
  loadOrgLog,
  saveOrgLog,
  clearOrganization,
  seedOrganizationalKnowledge,
  seedOrgMetrics,
  seedEmergingPatterns,
  loadEmergingPatterns,
  saveEmergingPatterns,
  loadKnowledgeCandidates,
  saveKnowledgeCandidates,
  loadValidationRecords,
  saveValidationRecords,
  loadMemoryChangeRecords,
  saveMemoryChangeRecords,
} from "@/lib/orgMemory";
import {
  loadOrganizationProfile,
  saveOrganizationProfile,
  resetOrganizationProfile,
  loadOrganizationList,
  saveOrganizationList,
  syncProfileIntoList,
  initialsFor,
  normalizeAccentColor,
} from "@/lib/organizationProfile";
import type {
  AIAnalysis,
  AIAdvisory,
  AIAdvisoryStatus,
  AIKnowledgeEnrichment,
  KnowledgeItem,
  KnowledgeMatch,
  Metrics,
  OrgMetrics,
  ReflectionDecision,
  SuggestedResponse,
  Ticket,
  Observation,
  ReasoningSummary,
  Confidence,
  BusinessRelevance,
  IntelligenceLogEntry,
  TrustDecision,
  ResolutionMode,
  EmergingPattern,
  OrganizationProfile,
  KnowledgeCandidate,
  ValidationRecord,
  MemoryChangeRecord,
  BulkAnalysisProgress,
  BulkCluster,
  BulkUploadEntry,
  Understanding,
  LessonDraft,
  Lesson,
  ReflectionCommitInput,
  DraftGroundingMode,
  BusinessDomainClassification,
} from "@/types";

const aiAdapter = createAIAdapter();

const steps = [
  "Start",
  "First Ticket",
  "Analysis",
  "Memory Retrieval",
  "Draft Response",
  "Human Review",
  "Resolution Approved",
  "Reflection",
  "Organizational Memory Updated",
  "Metrics"
];

function createInitialMetrics(): Metrics {
  return { ...defaultMetrics };
}

function findTicket(ticketId: string): Ticket | null {
  if (!ticketId) return null;
  return seedTickets.find((item) => item.id === ticketId) ?? null;
}

function makeCustomTicket(description: string): Ticket {
  const subject = description.length > 80 ? description.slice(0, 80) + "…" : description;
  return {
    id: `ticket-custom-${Date.now()}`,
    customerName: "Demo User",
    subject,
    description,
    category: "General",
    status: "new",
    createdAt: new Date().toISOString()
  };
}

function understandingToAnalysis(und: ReturnType<typeof understandForProfile>): AIAnalysis {
  return {
    ticketId: und.ticketId,
    summary: und.summary,
    coreProblem: und.coreProblem,
    category: und.category,
    intent: und.intent,
    urgency: und.urgency,
    suggestedTags: und.tags,
    detectedSignals: und.detectedSignals
  };
}

function toUnderstanding(analysis: AIAnalysis): Understanding {
  return {
    ticketId: analysis.ticketId,
    summary: analysis.summary,
    coreProblem: analysis.coreProblem,
    category: analysis.category,
    intent: analysis.intent,
    urgency: analysis.urgency,
    tags: analysis.suggestedTags,
    detectedSignals: analysis.detectedSignals ?? []
  };
}

export default function Home() {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [secondTicket, setSecondTicket] = useState<Ticket | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [similarKnowledge, setSimilarKnowledge] = useState<KnowledgeMatch[]>([]);
  const [suggestedResponse, setSuggestedResponse] = useState<SuggestedResponse | null>(null);
  const [reviewedResponse, setReviewedResponse] = useState("");
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>(seedOrganizationalKnowledge);
  const [knowledgeCandidates, setKnowledgeCandidates] = useState<KnowledgeCandidate[]>([]);
  const [validationRecords, setValidationRecords] = useState<ValidationRecord[]>([]);
  const [memoryChangeRecords, setMemoryChangeRecords] = useState<MemoryChangeRecord[]>([]);
  const [organizationProfile, setOrganizationProfile] = useState<OrganizationProfile>(defaultOrganizationProfile);
  const [organizationList, setOrganizationList] = useState<OrganizationProfile[]>(seedOrganizationProfiles);
  const [metrics, setMetrics] = useState<Metrics>(createInitialMetrics);
  const [orgMetrics, setOrgMetrics] = useState<OrgMetrics>(seedOrgMetrics);
  const [hydrated, setHydrated] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastApprovedSourceTicketId, setLastApprovedSourceTicketId] = useState<string | null>(null);
  const [reusedKnowledgeSourceTicketId, setReusedKnowledgeSourceTicketId] = useState<string | null>(null);

  // OIP engine state
  const [observation, setObservation] = useState<Observation | null>(null);
  const [reasoning, setReasoning] = useState<ReasoningSummary | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [businessRelevance, setBusinessRelevance] = useState<BusinessRelevance | null>(null);
  const [domainClassification, setDomainClassification] = useState<BusinessDomainClassification | null>(null);
  const [aiAdvisory, setAiAdvisory] = useState<AIAdvisory | null>(null);
  const [intelligenceLog, setIntelligenceLog] = useState<IntelligenceLogEntry[]>([]);
  const [sessionCreatedIds, setSessionCreatedIds] = useState<Set<string>>(new Set());
  const [customSecondText, setCustomSecondText] = useState("");
  const [lastDraftUsedAI, setLastDraftUsedAI] = useState(false);

  // Phase 4.3 — trust / learning loop state
  const [reuseMatchId, setReuseMatchId] = useState<string | null>(null);
  const [reuseDecision, setReuseDecision] = useState<TrustDecision | null>(null);
  const [reuseResponseText, setReuseResponseText] = useState("");
  const [reuseResponseSource, setReuseResponseSource] = useState<SuggestedResponse["source"]>("deterministic");
  const [reuseResolvedMode, setReuseResolvedMode] = useState<ResolutionMode | null>(null);
  const [lastTrustDelta, setLastTrustDelta] = useState(0);
  const [runCount, setRunCount] = useState(0);

  // Phase 4.5 — emerging patterns
  const [emergingPatterns, setEmergingPatterns] = useState<EmergingPattern[]>([]);

  // LLM match discrimination — reasoning surfaced in the analysis step
  const [discriminationReasoning, setDiscriminationReasoning] = useState<string | null>(null);
  const [discriminatedMatchTitle, setDiscriminatedMatchTitle] = useState<string | null>(null);

  // Reflection / Knowledge Evolution
  const [reflectionDecision, setReflectionDecision] = useState<ReflectionDecision | null>(null);
  const [lastSavedKnowledgeId, setLastSavedKnowledgeId] = useState<string | null>(null);

  // Maesa Tech UI state
  const [activeView, setActiveView] = useState<ActiveView>("home");
  const [ticketIntakeMode, setTicketIntakeMode] = useState<"single" | "bulk">("single");
  const [darkMode, setDarkMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  /* ---------- Persistence: load on mount, save on change ---------- */

  useEffect(() => {
    const loadedProfile = loadOrganizationProfile();
    setOrganizationProfile(loadedProfile);
    setOrganizationList(syncProfileIntoList(loadOrganizationList(), loadedProfile));
    setKnowledgeItems(loadKnowledge());
    setKnowledgeCandidates(loadKnowledgeCandidates());
    setValidationRecords(loadValidationRecords());
    setMemoryChangeRecords(loadMemoryChangeRecords());
    setOrgMetrics(loadOrgMetrics());
    setIntelligenceLog(loadOrgLog());
    setEmergingPatterns(loadEmergingPatterns());
    setDarkMode(window.localStorage.getItem("maesa-theme") === "dark");
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveKnowledge(knowledgeItems);
  }, [knowledgeItems, hydrated]);

  useEffect(() => {
    if (hydrated) saveKnowledgeCandidates(knowledgeCandidates);
  }, [knowledgeCandidates, hydrated]);

  useEffect(() => {
    if (hydrated) saveValidationRecords(validationRecords);
  }, [validationRecords, hydrated]);

  useEffect(() => {
    if (hydrated) saveMemoryChangeRecords(memoryChangeRecords);
  }, [memoryChangeRecords, hydrated]);

  useEffect(() => {
    if (hydrated) saveOrgMetrics(orgMetrics);
  }, [orgMetrics, hydrated]);

  useEffect(() => {
    if (hydrated) saveOrgLog(intelligenceLog);
  }, [intelligenceLog, hydrated]);

  useEffect(() => {
    if (hydrated) saveEmergingPatterns(emergingPatterns);
  }, [emergingPatterns, hydrated]);

  useEffect(() => {
    if (hydrated) saveOrganizationProfile(organizationProfile);
  }, [organizationProfile, hydrated]);

  useEffect(() => {
    if (hydrated) saveOrganizationList(organizationList);
  }, [organizationList, hydrated]);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem("maesa-theme", darkMode ? "dark" : "light");
  }, [darkMode, hydrated]);

  /* ---------- Helpers ---------- */

  function addLogEntries(entries: IntelligenceLogEntry[]) {
    setIntelligenceLog((prev) => [...prev, ...entries]);
  }

  function recordAIResults(results: Array<AIProviderResult<unknown>>, advisoryStatus?: AIAdvisoryStatus, agreementPct?: number) {
    const count = results.length;
    const successes = results.filter((result) => result.ok).length;
    const failures = count - successes;
    const fallbacks = failures > 0 ? 1 : 0;

    if (count > 0) {
      updateMetrics({
        aiCalls: count,
        aiSuccesses: successes,
        aiFailures: failures,
        aiFallbacks: fallbacks
      });
      setOrgMetrics((prev) => ({
        ...prev,
        aiCalls: (prev.aiCalls ?? 0) + count,
        aiSuccesses: (prev.aiSuccesses ?? 0) + successes,
        aiFailures: (prev.aiFailures ?? 0) + failures,
        aiFallbacks: (prev.aiFallbacks ?? 0) + fallbacks,
        aiAgreementSamples: advisoryStatus && advisoryStatus !== "disabled" && advisoryStatus !== "unavailable"
          ? (prev.aiAgreementSamples ?? 0) + 1
          : prev.aiAgreementSamples ?? 0,
        aiAgreementTotal: advisoryStatus && advisoryStatus !== "disabled" && advisoryStatus !== "unavailable"
          ? (prev.aiAgreementTotal ?? 0) + (agreementPct ?? 0)
          : prev.aiAgreementTotal ?? 0,
        lastUpdatedAt: new Date().toISOString()
      }));
    }
  }

  function recordHumanAcceptedAISuggestion() {
    setOrgMetrics((prev) => ({
      ...prev,
      humanAcceptedAISuggestions: (prev.humanAcceptedAISuggestions ?? 0) + 1,
      lastUpdatedAt: new Date().toISOString()
    }));
  }

  function updateMetrics(updates: Partial<Record<keyof Metrics, number>>) {
    setMetrics((current) => {
      const next = { ...current };
      for (const [key, value] of Object.entries(updates) as Array<[keyof Metrics, number]>) {
        next[key] += value;
      }
      return next;
    });
  }

  function recordOrgResolution(mode: ResolutionMode, opts?: { createdKnowledge?: boolean }) {
    const isAuto = mode === "automatic";
    const timeSec = isAuto ? 18 : 95;
    setOrgMetrics((prev) => ({
      ...prev,
      lifetimeTickets: prev.lifetimeTickets + 1,
      knowledgeReused: prev.knowledgeReused + (opts?.createdKnowledge ? 0 : 1),
      autoResolutions: prev.autoResolutions + (isAuto ? 1 : 0),
      humanResolutions: prev.humanResolutions + (isAuto ? 0 : 1),
      totalResolutionTimeSec: prev.totalResolutionTimeSec + timeSec,
      resolutionsCount: prev.resolutionsCount + 1,
      memoryGrowthToday: prev.memoryGrowthToday + (opts?.createdKnowledge ? 1 : 0),
      lastUpdatedAt: new Date().toISOString()
    }));
  }

  function makeRecordId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function snapshotKnowledgeItem(item: KnowledgeItem | null): KnowledgeItem | null {
    return item ? JSON.parse(JSON.stringify(item)) as KnowledgeItem : null;
  }

  function latestVersionId(item: KnowledgeItem): string | undefined {
    const versions = item.knowledgeVersions ?? [];
    return versions.length > 0 ? versions[versions.length - 1].versionId : undefined;
  }

  function withValidationMetadata(
    item: KnowledgeItem,
    candidate: KnowledgeCandidate,
    validation: ValidationRecord
  ): KnowledgeItem {
    const sourceTicketId = candidate.sourceTicketIds[0] ?? item.sourceTicketId;
    return {
      ...item,
      provenance: {
        sourceTicketId,
        contributingTicketIds: candidate.sourceTicketIds,
        createdBy: item.provenance?.createdBy ?? "oip_prototype",
        createdAt: item.provenance?.createdAt ?? item.createdAt,
        validatedBy: validation.actor,
        validatedAt: validation.timestamp,
        validationBasis: validation.rationale ?? candidate.rationale,
        validationScope: `Prototype ${candidate.proposedAction} validation`
      },
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

  function applyValidatedMemoryChange(
    candidate: KnowledgeCandidate,
    beforeState: KnowledgeItem | null,
    afterState: KnowledgeItem,
    rationale = "Prototype knowledge validation"
  ): {
    validatedItem: KnowledgeItem;
    validatedCandidate: KnowledgeCandidate;
    validation: ValidationRecord;
    memoryChange: MemoryChangeRecord;
  } {
    const timestamp = new Date().toISOString();
    const validation: ValidationRecord = {
      id: makeRecordId("validation"),
      candidateId: candidate.id,
      knowledgeId: afterState.id,
      knowledgeVersionId: latestVersionId(afterState),
      decision: "approved",
      actor: "Prototype Knowledge Validator",
      roleExercised: "knowledge_validator",
      rationale,
      timestamp
    };
    const validatedCandidate: KnowledgeCandidate = { ...candidate, status: "validated" };
    const validatedItem = withValidationMetadata(afterState, validatedCandidate, validation);
    const memoryChange: MemoryChangeRecord = {
      id: makeRecordId("memory-change"),
      knowledgeId: validatedItem.id,
      candidateId: validatedCandidate.id,
      validationRecordId: validation.id,
      changeType: validatedCandidate.proposedAction,
      beforeState: snapshotKnowledgeItem(beforeState),
      afterState: snapshotKnowledgeItem(validatedItem)!,
      timestamp
    };

    setKnowledgeCandidates((prev) => {
      const exists = prev.some((item) => item.id === validatedCandidate.id);
      return exists
        ? prev.map((item) => (item.id === validatedCandidate.id ? validatedCandidate : item))
        : [...prev, validatedCandidate];
    });
    setValidationRecords((prev) => [...prev, validation]);
    setMemoryChangeRecords((prev) => [...prev, memoryChange]);
    setKnowledgeItems((prev) => upsertCanonicalProblem(prev, validatedItem));
    setSimilarKnowledge((prev) => prev.map((m) => (m.item.id === validatedItem.id ? { ...m, item: validatedItem } : m)));

    return {
      validatedItem,
      validatedCandidate,
      validation,
      memoryChange
    };
  }

  function commitValidatedMemoryChange(
    candidate: KnowledgeCandidate,
    beforeState: KnowledgeItem | null,
    afterState: KnowledgeItem,
    rationale = "Prototype knowledge validation"
  ): KnowledgeItem {
    return applyValidatedMemoryChange(candidate, beforeState, afterState, rationale).validatedItem;
  }

  function createCandidate(input: {
    action: KnowledgeCandidate["proposedAction"];
    sourceTicketIds: string[];
    solution: string;
    customerResponseTemplate: string;
    internalGuidance: string;
    canonicalProblemTitle?: string;
    category?: string;
    relatedKnowledgeId?: string;
    rationale: string;
    createdAt?: string;
  }): KnowledgeCandidate {
    return {
      id: makeRecordId("candidate"),
      sourceTicketIds: input.sourceTicketIds,
      proposedAction: input.action,
      proposedContent: {
        solution: input.solution,
        customerResponseTemplate: input.customerResponseTemplate,
        internalGuidance: input.internalGuidance,
        canonicalProblemTitle: input.canonicalProblemTitle,
        category: input.category
      },
      relatedKnowledgeId: input.relatedKnowledgeId,
      rationale: input.rationale,
      status: "proposed",
      createdAt: input.createdAt ?? new Date().toISOString()
    };
  }

  async function analyzeUploadedQueries(
    entries: BulkUploadEntry[],
    onProgress: (progress: BulkAnalysisProgress) => void
  ) {
    return analyzeBulkEntries({
      entries,
      organizationProfile,
      knowledgeItems,
      aiAdapter,
      onProgress
    });
  }

  async function commitBulkCluster(cluster: BulkCluster): Promise<{
    knowledgeId: string;
    candidateId: string;
    validationId: string;
    memoryChangeId: string;
  }> {
    const now = new Date().toISOString();
    const prepared = prepareBulkClusterCommit(cluster, knowledgeItems, organizationProfile, now);
    const candidate = createCandidate({
      action: prepared.action,
      sourceTicketIds: prepared.sourceTicketIds,
      solution: prepared.solution,
      customerResponseTemplate: prepared.customerResponseTemplate,
      internalGuidance: prepared.internalGuidance,
      canonicalProblemTitle: prepared.canonicalProblemTitle,
      category: prepared.category,
      relatedKnowledgeId: prepared.relatedKnowledgeId,
      rationale: prepared.rationale,
      createdAt: now
    });
    const result = applyValidatedMemoryChange(candidate, prepared.beforeState, prepared.afterState, prepared.rationale);
    setSessionCreatedIds((prev) => new Set([...prev, result.validatedItem.id]));
    setLastSavedKnowledgeId(result.validatedItem.id);
    if (prepared.action === "create_new") {
      recordOrgResolution("human", { createdKnowledge: true });
      updateMetrics({ knowledgeItemsCreated: 1, humanApprovedResponses: 1, canonicalProblemsTouched: 1, knowledgeVersionsCreated: 1 });
    } else if (prepared.action === "merge_existing") {
      updateMetrics({ humanApprovedResponses: 1, canonicalProblemsTouched: 1, mergedTickets: 1, duplicatePreventions: 1 });
    } else {
      updateMetrics({ humanApprovedResponses: 1, canonicalProblemsTouched: 1, knowledgeVersionsCreated: 1 });
    }
    addLogEntries([
      createLogEntry("Bulk cluster validated", `${cluster.count} uploaded queries committed as ${prepared.action.replace(/_/g, " ")} for ${cluster.canonicalProblemTitle}`),
      createLogEntry("Validation record created", result.validation.id),
      createLogEntry("Memory change recorded", result.memoryChange.id)
    ]);
    return {
      knowledgeId: result.validatedItem.id,
      candidateId: result.validatedCandidate.id,
      validationId: result.validation.id,
      memoryChangeId: result.memoryChange.id
    };
  }

  /** Apply a successful resolution outcome to a knowledge item and record learning. */
  function applyResolution(itemId: string, mode: ResolutionMode, evidenceTicket?: Ticket) {
    const target = knowledgeItems.find((i) => i.id === itemId);
    if (!target) return;

    const targetWithEvidence = evidenceTicket
      ? mergeIntoCanonicalProblem(target, evidenceTicket, understandForProfile(evidenceTicket, organizationProfile), undefined, mode)
      : target;
    const result = recordResolution(targetWithEvidence, { mode, success: true }, organizationProfile, validationRecords);
    const candidate = createCandidate({
      action: "trust_update_only",
      sourceTicketIds: evidenceTicket ? [evidenceTicket.id] : [target.sourceTicketId],
      solution: result.item.problemSummary ?? result.item.problem,
      customerResponseTemplate: result.item.customerResponseTemplate ?? result.item.approvedAnswer,
      internalGuidance: result.item.internalGuidance ?? result.item.problem,
      canonicalProblemTitle: result.item.canonicalProblemTitle ?? result.item.title,
      category: result.item.category,
      relatedKnowledgeId: itemId,
      rationale: `${mode === "automatic" ? "Automatic" : "Human-approved"} successful reuse updated trust from ${result.trustFrom} to ${result.trustTo}.`
    });
    const committedItem = commitValidatedMemoryChange(candidate, target, result.item, candidate.rationale);
    setLastTrustDelta(result.trustDelta);
    addLogEntries(result.events.map((e) => createLogEntry(e.event, e.detail)));
    addLogEntries([
      createLogEntry("Validation record created", `Candidate ${candidate.id} approved for trust update`),
      createLogEntry("Memory change recorded", `Before/after snapshot stored for ${committedItem.title}`)
    ]);
    recordOrgResolution(mode);
    updateMetrics({
      knowledgeItemsReused: 1,
      estimatedTimeSavedMinutes: mode === "automatic" ? 12 : 8,
      autoResolutions: mode === "automatic" ? 1 : 0
    });
  }

  async function checkPatternDiscovery(ticket: Ticket, analysis: AIAnalysis) {
    const und = toUnderstanding(analysis);
    if (hasSpecificCanonicalMatch(und, knowledgeItems)) return;

    const result = detectEmergingPattern(ticket, und, emergingPatterns);
    if (!result) return;
    let pattern = result.pattern;
    if (aiAdapter.config.mode !== "disabled") {
      const patternResult = await aiAdapter.provider.suggestPatternName({
        ticket,
        organizationProfile,
        deterministicUnderstanding: und,
        deterministicPatternTitle: pattern.title,
        patternSummary: pattern.summary
      });
      if (patternResult.ok && patternResult.data) {
        recordAIResults([patternResult]);
        if (shouldAcceptPatternSuggestion(pattern.title, patternResult.data)) {
          pattern = { ...pattern, title: patternResult.data.title };
          addLogEntries([createLogEntry("AI suggested pattern name accepted", `${result.pattern.title} -> ${pattern.title}`)]);
        }
      } else if (patternResult.error && aiAdapter.config.mode !== "amd") {
        recordAIResults([patternResult]);
      }
    }

    if (result.isNew) {
      setEmergingPatterns((prev) => [...prev, pattern]);
      addLogEntries([
        createLogEntry("New emerging pattern detected", `"${result.pattern.title}" — monitoring begins`),
        createLogEntry("Pattern details", `Category: ${result.pattern.category} · Tags: ${result.pattern.tags.join(", ")}`)
      ]);
    } else {
      setEmergingPatterns((prev) => upsertEmergingPattern(prev, ticket, und, pattern));
      const updated = upsertEmergingPattern(emergingPatterns, ticket, und, pattern);
      const updatedPattern = updated.find((p) => p.id === pattern.id);
      const statusChanged = updatedPattern && updatedPattern.status !== pattern.status;
      const entries = [
        createLogEntry(
          "Emerging pattern updated",
          `"${result.pattern.title}" seen ${updatedPattern?.timesSeen ?? result.pattern.timesSeen + 1} times`
        )
      ];
      if (statusChanged && updatedPattern?.status === "suggested") {
        entries.push(createLogEntry("Pattern status → suggested", `Confidence: ${updatedPattern.confidenceScore}%`));
      }
      if (updatedPattern?.suggestedCanonicalProblem && !result.pattern.suggestedCanonicalProblem) {
        entries.push(createLogEntry("Pattern ready for promotion", `"${result.pattern.title}" meets canonical problem threshold`));
      }
      addLogEntries(entries);
    }

    updateMetrics({ emergingPatternsDetected: 1 });
    setOrgMetrics((prev) => ({
      ...prev,
      emergingPatternsDetected: (prev.emergingPatternsDetected ?? 0) + 1,
      lastUpdatedAt: new Date().toISOString()
    }));
  }

  function promotePattern(patternId: string) {
    const pattern = emergingPatterns.find((p) => p.id === patternId);
    if (!pattern) return;

    const newKnowledge = promotePatternToCanonicalProblem(pattern);
    const candidate = createCandidate({
      action: "create_new",
      sourceTicketIds: pattern.exampleTickets.map((example) => example.ticketId),
      solution: pattern.summary,
      customerResponseTemplate: newKnowledge.customerResponseTemplate ?? newKnowledge.approvedAnswer,
      internalGuidance: newKnowledge.internalGuidance ?? pattern.summary,
      canonicalProblemTitle: pattern.title,
      category: pattern.category,
      rationale: `Emerging pattern promoted after ${pattern.timesSeen} examples with ${pattern.confidenceScore}% confidence.`
    });
    const committedItem = commitValidatedMemoryChange(candidate, null, newKnowledge, candidate.rationale);
    setEmergingPatterns((prev) =>
      prev.map((p) => (p.id === patternId ? { ...p, status: "promoted" as const } : p))
    );
    setOrgMetrics((prev) => ({
      ...prev,
      promotedPatterns: (prev.promotedPatterns ?? 0) + 1,
      lastUpdatedAt: new Date().toISOString()
    }));
    addLogEntries([
      createLogEntry("Pattern candidate validated", `Candidate ${candidate.id} approved by Prototype Knowledge Validator`),
      createLogEntry("Pattern promoted to canonical problem", `"${pattern.title}" → knowledge base`),
      createLogEntry("Memory change recorded", `Trust: ${committedItem.trustScore} · Examples: ${pattern.exampleTickets.length}`)
    ]);
  }

  function resetWorkflowState() {
    setSelectedTicket(findTicket(primaryDemoTicketId));
    setSecondTicket(null);
    setAiAnalysis(null);
    setSimilarKnowledge([]);
    setSuggestedResponse(null);
    setReviewedResponse("");
    setObservation(null);
    setReasoning(null);
    setConfidence(null);
    setBusinessRelevance(null);
    setDomainClassification(null);
    setAiAdvisory(null);
    setSessionCreatedIds(new Set());
    setCustomSecondText("");
    setLastDraftUsedAI(false);
    setLastApprovedSourceTicketId(null);
    setReusedKnowledgeSourceTicketId(null);
    setReuseMatchId(null);
    setReuseDecision(null);
    setReuseResponseText("");
    setReuseResolvedMode(null);
    setLastTrustDelta(0);
    setRunCount(0);
    setReflectionDecision(null);
    setLastSavedKnowledgeId(null);
    setMetrics(createInitialMetrics());
    setErrorMessage("");
    setDiscriminationReasoning(null);
    setDiscriminatedMatchTitle(null);
  }

  function startDemo(ticket?: Ticket) {
    resetWorkflowState();
    setSelectedTicket(ticket ?? findTicket(primaryDemoTicketId));
    setCurrentStep(1);
  }

  function startCustomDemo(text: string) {
    startDemo(makeCustomTicket(text));
  }

  /** Reset Session — clears the current workflow only. Org memory persists. */
  function resetSession() {
    resetWorkflowState();
    setCurrentStep(0);
  }

  /** Reset Organization — wipes persisted memory and reseeds defaults. */
  function resetOrganization() {
    clearOrganization();
    setOrganizationProfile(resetOrganizationProfile());
    setKnowledgeItems(seedOrganizationalKnowledge());
    setKnowledgeCandidates([]);
    setValidationRecords([]);
    setMemoryChangeRecords([]);
    setOrgMetrics(seedOrgMetrics());
    setIntelligenceLog([]);
    setEmergingPatterns(seedEmergingPatterns());
    resetWorkflowState();
    setCurrentStep(0);
  }

  function confirmAndResetOrganization() {
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(
        "Reset Organization will permanently delete all persisted Organizational Memory (knowledge, trust scores, validation records, memory change history, and lifetime metrics) and reseed defaults. Continue?"
      );
    if (confirmed) resetOrganization();
  }

  function changeOrganizationProfile(profile: OrganizationProfile) {
    setOrganizationProfile(profile);
    setOrganizationList((list) => syncProfileIntoList(list, profile));
    setBusinessRelevance(null);
    setAiAdvisory(null);
    setErrorMessage("");
    addLogEntries([createLogEntry("Organization profile updated", `Representing ${profile.name} (${profile.industry})`)]);
  }

  function selectOrganization(id: string) {
    const found = organizationList.find((org) => org.id === id);
    if (!found || found.id === organizationProfile.id) return;
    setOrganizationProfile(found);
    setBusinessRelevance(null);
    setAiAdvisory(null);
    setErrorMessage("");
    addLogEntries([createLogEntry("Organization switched", `Now representing ${found.name} (${found.industry})`)]);
  }

  function addOrganization(profile: OrganizationProfile) {
    setOrganizationList((list) => syncProfileIntoList(list, profile));
    setOrganizationProfile(profile);
    setBusinessRelevance(null);
    setAiAdvisory(null);
    setErrorMessage("");
    addLogEntries([createLogEntry("Organization created", `${profile.name} (${profile.industry})`)]);
  }

  function deleteOrganization(id: string) {
    setOrganizationList((list) => {
      if (list.length <= 1) return list;
      const next = list.filter((org) => org.id !== id);
      if (id === organizationProfile.id && next.length > 0) {
        setOrganizationProfile(next[0]);
      }
      return next;
    });
  }

  function createRelevanceLogEntries(relevance: BusinessRelevance): IntelligenceLogEntry[] {
    if (relevance.status === "relevant") {
      return [
        createLogEntry("Business relevance check passed", `Organization: ${relevance.organizationName ?? organizationProfile.name}`),
        createLogEntry("Supported profile domains", relevance.supportedDomain),
        createLogEntry(`Detected product support signals: ${relevance.matchedBusinessSignals.join(", ") || "none"}`)
      ];
    }
    if (relevance.status === "out_of_scope") {
      return [
        createLogEntry("Business relevance check failed", relevance.reason),
        createLogEntry(`Detected out-of-scope signals: ${relevance.detectedOutOfScopeSignals.join(", ") || "none"}`),
        createLogEntry("Dismissed before analysis and memory capture")
      ];
    }
    return [
      createLogEntry("Business relevance uncertain", relevance.reason),
      createLogEntry("Clarification required before analysis")
    ];
  }

  function defaultAvailabilityMessage(): string {
    if (aiAdapter.config.mode === "disabled") {
      return "AI advisory is disabled. Using deterministic Organizational Intelligence.";
    }
    if (aiAdapter.config.mode === "amd") {
      return "AMD Cloud placeholder is not implemented yet. Using deterministic Organizational Intelligence.";
    }
    return "AI unavailable. Using deterministic Organizational Intelligence.";
  }

  function draftModeLabel(mode: DraftGroundingMode, groundingLabel?: string): string {
    if (mode === "lesson_grounded") {
      return `AI draft grounded in validated lesson: ${groundingLabel ?? "matched lesson"}`;
    }
    if (mode === "memory_grounded") {
      return "AI draft grounded in organizational memory";
    }
    return "AI suggestion - no organizational knowledge exists yet; this draft is not based on validated memory. Review carefully before sending.";
  }

  function isUsableAIDraft(result: AIProviderResult<{ draftResponse: string; confidence: number }>): boolean {
    const draft = result.data?.draftResponse?.trim();
    if (!result.ok || !draft) return false;
    const lower = draft.toLowerCase();
    return !lower.includes("internal guidance") && !lower.includes("root cause hypothesis");
  }

  /**
   * Ask the LLM whether the ticket describes the SAME problem as the candidate memory
   * match or a DISTINCT one. Returns the effective top match to use for drafting:
   * null if the LLM says distinct with medium/high confidence, original match otherwise.
   * Falls back silently to the deterministic match when AI is unavailable.
   */
  async function requestMatchDiscrimination(
    ticket: Ticket,
    topMatch: KnowledgeMatch,
    deterministicUnderstanding: ReturnType<typeof understandForProfile>
  ): Promise<KnowledgeMatch | null> {
    if (aiAdapter.config.mode === "disabled") return topMatch;

    const result = await aiAdapter.provider.discriminateMatch({
      ticket,
      matchedCanonicalTitle: topMatch.item.canonicalProblemTitle ?? topMatch.item.title,
      matchedProblemSummary: topMatch.item.problemSummary ?? topMatch.item.problem,
      deterministicUnderstanding
    });

    recordAIResults([result]);

    if (result.ok && result.data) {
      const { isDistinctFromMatch, confidence, reasoning } = result.data;
      if (isDistinctFromMatch && confidence !== "low") {
        const matchTitle = topMatch.item.canonicalProblemTitle ?? topMatch.item.title;
        setDiscriminationReasoning(reasoning);
        setDiscriminatedMatchTitle(matchTitle);
        addLogEntries([
          createLogEntry(
            "LLM discrimination: match rejected",
            `"${matchTitle}" identified as distinct from this ticket (${confidence} confidence) — treating as no-match`
          ),
          createLogEntry("Discrimination reasoning", reasoning)
        ]);
        return null;
      }
      // LLM confirms same problem — clear any prior discrimination state
      setDiscriminationReasoning(null);
      setDiscriminatedMatchTitle(null);
      addLogEntries([
        createLogEntry(
          "LLM discrimination: match confirmed",
          `"${topMatch.item.canonicalProblemTitle ?? topMatch.item.title}" confirmed as same problem (${confidence} confidence)`
        )
      ]);
    }

    return topMatch;
  }

  async function requestAnalysisAdvisory(
    ticket: Ticket,
    deterministicUnderstanding: ReturnType<typeof understandForProfile>,
    canonicalProblem: { title: string; problemSummary: string; category: string }
  ): Promise<AIAdvisory> {
    if (aiAdapter.config.mode === "disabled") {
      return buildAIAdvisory({
        ticketId: ticket.id,
        providerMode: aiAdapter.config.mode,
        providerLabel: aiAdapter.provider.label,
        model: aiAdapter.config.model,
        deterministicLabel: canonicalProblem.title,
        availabilityMessage: defaultAvailabilityMessage()
      });
    }

    const [analysisResult, canonicalResult] = await Promise.all([
      aiAdapter.provider.analyzeTicket({
        ticket,
        organizationProfile,
        deterministicUnderstanding
      }),
      aiAdapter.provider.suggestCanonicalProblem({
        ticket,
        organizationProfile,
        deterministicUnderstanding,
        deterministicCanonicalProblem: {
          title: canonicalProblem.title,
          summary: canonicalProblem.problemSummary,
          category: canonicalProblem.category
        }
      })
    ]);

    const availabilityMessage =
      analysisResult.ok || canonicalResult.ok
        ? undefined
        : analysisResult.error || canonicalResult.error || defaultAvailabilityMessage();

    const advisory = buildAIAdvisory({
      ticketId: ticket.id,
      providerMode: aiAdapter.config.mode,
      providerLabel: aiAdapter.provider.label,
      model: aiAdapter.config.model,
      deterministicLabel: canonicalProblem.title,
      analysisSuggestion: analysisResult.ok ? analysisResult.data : undefined,
      canonicalSuggestion: canonicalResult.ok ? canonicalResult.data : undefined,
      availabilityMessage
    });

    recordAIResults([analysisResult, canonicalResult], advisory.status, advisory.agreementPct);
    return advisory;
  }

  async function requestDraftAdvisory(
    ticket: Ticket,
    understanding: ReturnType<typeof toUnderstanding>,
    canonicalProblemTitle: string,
    matchedKnowledge: KnowledgeMatch | null,
    deterministicDraft: string,
    deterministicConfidenceNote: string,
    deterministicSource: SuggestedResponse["source"],
    baseAdvisory: AIAdvisory | null
  ): Promise<{
    advisory: AIAdvisory | null;
    response: SuggestedResponse;
    usedAIDraft: boolean;
  }> {
    const lessonMatch = matchedKnowledge ? findMatchingLesson(ticket, matchedKnowledge.item) : null;
    const draftMode: DraftGroundingMode = lessonMatch
      ? "lesson_grounded"
      : matchedKnowledge && deterministicSource !== "no_template"
      ? "memory_grounded"
      : "cold_start";
    const groundingLabel =
      draftMode === "lesson_grounded"
        ? lessonMatch?.lesson.rootCause ?? "matched lesson"
        : draftMode === "memory_grounded"
        ? matchedKnowledge?.item.canonicalProblemTitle ?? matchedKnowledge?.item.title ?? "organizational memory"
        : "no organizational knowledge";
    const groundingContent =
      draftMode === "lesson_grounded"
        ? lessonMatch?.lesson.customerResponse ?? deterministicDraft
        : draftMode === "memory_grounded"
        ? deterministicDraft
        : "";

    const fallbackResponse: SuggestedResponse = {
      ticketId: ticket.id,
      draftResponse: deterministicDraft,
      basedOnKnowledgeIds: matchedKnowledge ? [matchedKnowledge.item.id] : [],
      confidenceNote: deterministicConfidenceNote,
      source: deterministicSource ?? "deterministic",
      draftMode,
      groundingLabel
    };

    if (aiAdapter.config.mode === "disabled") {
      return {
        advisory: baseAdvisory,
        response: {
          ...fallbackResponse,
          fallbackNotice: "AI unavailable - deterministic draft shown."
        },
        usedAIDraft: false
      };
    }

    const draftRequest = aiAdapter.provider.draftCustomerResponse({
      ticket,
      organizationProfile,
      deterministicUnderstanding: understanding,
      canonicalProblemTitle,
      groundingMode: draftMode,
      groundingLabel,
      groundingContent,
      lessonGrounding: lessonMatch
        ? {
            rootCause: lessonMatch.lesson.rootCause,
            solution: lessonMatch.lesson.solution,
            customerResponse: lessonMatch.lesson.customerResponse,
            matchedSignals: lessonMatch.matchedSignals
          }
        : undefined,
      deterministicDraft,
      matchedKnowledge
    });
    const enrichmentRequest: Promise<AIProviderResult<AIKnowledgeEnrichment>> =
      draftMode === "cold_start"
        ? Promise.resolve({
            ok: false,
            providerMode: aiAdapter.config.mode,
            providerLabel: aiAdapter.provider.label,
            model: aiAdapter.config.model,
            latencyMs: 0,
            error: "Knowledge enrichment skipped for cold-start draft."
          })
        : aiAdapter.provider.enrichKnowledge({
            ticket,
            organizationProfile,
            deterministicUnderstanding: understanding,
            canonicalProblemTitle,
            matchedKnowledge
          });

    const [draftResult, enrichmentResult] = await Promise.all([draftRequest, enrichmentRequest]);

    const nextAdvisory = buildAIAdvisory({
      ticketId: ticket.id,
      providerMode: aiAdapter.config.mode,
      providerLabel: aiAdapter.provider.label,
      model: aiAdapter.config.model,
      deterministicLabel: baseAdvisory?.deterministicLabel ?? canonicalProblemTitle,
      analysisSuggestion: baseAdvisory?.analysisSuggestion,
      canonicalSuggestion: baseAdvisory?.canonicalSuggestion,
      responseSuggestion: draftResult.ok ? draftResult.data : undefined,
      knowledgeEnrichment: enrichmentResult.ok ? enrichmentResult.data : undefined,
      availabilityMessage:
        draftResult.ok || enrichmentResult.ok
          ? baseAdvisory?.availabilityMessage
          : draftResult.error || enrichmentResult.error || defaultAvailabilityMessage()
    });

    recordAIResults([draftResult, enrichmentResult], nextAdvisory.status, nextAdvisory.agreementPct);

    if (isUsableAIDraft(draftResult)) {
      return {
        advisory: nextAdvisory,
        usedAIDraft: true,
        response: {
          ticketId: ticket.id,
          draftResponse: draftResult.data!.draftResponse,
          basedOnKnowledgeIds: matchedKnowledge ? [matchedKnowledge.item.id] : [],
          confidenceNote: `${draftModeLabel(draftMode, groundingLabel)} (${draftResult.data!.confidence}% confidence). Human review is required before sending or learning.`,
          source: "ai_advisory",
          draftMode,
          groundingLabel,
          // Raw validated template preserved for side-by-side comparison in human review
          deterministicDraft: draftMode === "cold_start" ? undefined : deterministicDraft
        }
      };
    }

    return {
      advisory: nextAdvisory,
      response: {
        ...fallbackResponse,
        fallbackNotice: "AI unavailable - deterministic draft shown."
      },
      usedAIDraft: false
    };
  }

  async function analyzeTicket(ticket: Ticket) {
    setErrorMessage("");
    const source = ticket.id.startsWith("ticket-custom") ? "manual-demo-input" : "seed-ticket";
    const relevance = assessBusinessRelevanceForProfile(`${ticket.subject} ${ticket.description}`, organizationProfile);
    setBusinessRelevance(relevance);

    if (!relevance.isRelevant && relevance.status === "out_of_scope") {
      setObservation(null);
      setAiAnalysis(null);
      setSimilarKnowledge([]);
      setSuggestedResponse(null);
      setReviewedResponse("");
      setReasoning(null);
      setConfidence(null);
      setAiAdvisory(null);
      setDomainClassification(null);
      setLastDraftUsedAI(false);
      setSelectedTicket({ ...ticket, status: "new" });
      addLogEntries(createRelevanceLogEntries(relevance));
      updateMetrics({ outOfScopeDismissals: 1 });
      setErrorMessage(`Rejected by Business Relevance Guardrail: ${relevance.reason}`);
      setCurrentStep(1);
      return;
    }

    // Business Domain Classification
    const domain = classifyBusinessDomain(
      `${ticket.subject} ${ticket.description}`,
      ticket.id,
      organizationProfile
    );
    setDomainClassification(domain);
    addLogEntries([
      createLogEntry("Business domain classified", `Primary: ${domain.primaryDomain} · All: ${domain.domains.join(", ")} (${domain.confidence} confidence)`)
    ]);

    const obs = observe(ticket, source);
    const und = understandForProfile(ticket, organizationProfile);
    const canonicalProblem = identifyCanonicalProblem(und, organizationProfile);
    const analysis = understandingToAnalysis(und);
    const advisory = await requestAnalysisAdvisory(ticket, und, {
      title: canonicalProblem.title,
      problemSummary: canonicalProblem.problemSummary,
      category: canonicalProblem.category
    });

    const logEntries = [
      ...createRelevanceLogEntries(relevance),
      createLogEntry("Observed ticket input", `Source: ${source} · Ticket: ${ticket.id}`),
      createLogEntry(`Extracted category: ${und.category}`, `Urgency: ${und.urgency} · Tags: ${und.tags.join(", ")}`),
      createLogEntry("Canonical problem proposed", `${canonicalProblem.title} · ${canonicalProblem.problemSummary}`),
      und.detectedSignals.length > 0
        ? createLogEntry(`Detected signals: ${und.detectedSignals.join(", ")}`)
        : createLogEntry("Signal detection: no strong signals found")
    ];

    setObservation(obs);
    setAiAnalysis(analysis);
    setAiAdvisory(advisory);
    setSelectedTicket({ ...ticket, status: "analyzed" });
    addLogEntries(logEntries);
    addLogEntries([
      createLogEntry(
        "AI advisory status",
        `${advisory.providerLabel}: ${advisory.status} · Agreement ${advisory.agreementPct}%`
      )
    ]);
    updateMetrics({ ticketsProcessed: 1 });
    setCurrentStep(2);
  }

  function findSimilarKnowledge(analysis: AIAnalysis, items: KnowledgeItem[] = knowledgeItems) {
    setErrorMessage("");
    const und = toUnderstanding(analysis);
    const matches = retrieveMemory(und, items, sessionCreatedIds);
    const topMatch = matches.length > 0 ? matches[0] : null;
    const newReasoning = buildReasoning(und, topMatch);
    const newConfidence = buildConfidence(und, topMatch);

    const topTrust = topMatch ? evaluateTrust(topMatch.item, organizationProfile, validationRecords) : null;

    const logEntries = [
      createLogEntry(
        `Retrieved ${matches.length} memory candidate${matches.length !== 1 ? "s" : ""}`,
        topMatch ? `Top match: "${topMatch.item.title}" (${topMatch.matchScore}% similarity)` : "No knowledge matches found"
      ),
      topTrust
        ? createLogEntry(
            `Evaluated trust: ${topTrust.score}/100 → ${topTrust.decisionLabel}`,
            `Maturity: ${topTrust.maturity}`
          )
        : createLogEntry("Trust evaluation skipped", "No matched knowledge to evaluate"),
      createLogEntry("Generated reasoning summary", newReasoning.relevantMemory ? `Relevant memory: ${newReasoning.relevantMemory}` : "No relevant memory"),
      createLogEntry(`Confidence level: ${newConfidence.level} (${newConfidence.score}/100)`, `Basis: ${newConfidence.basis.join("; ")}`)
    ];

    setSimilarKnowledge(matches);
    setReasoning(newReasoning);
    setConfidence(newConfidence);
    addLogEntries(logEntries);
    updateMetrics({ repeatedIssuesDetected: matches.length > 0 ? 1 : 0, memoryRetrievals: 1 });

    if (selectedTicket) {
      void checkPatternDiscovery(selectedTicket, analysis);
    }

    setCurrentStep(3);
    return matches;
  }

  async function generateSuggestedResponse(ticket: Ticket, analysis: AIAnalysis, matches: KnowledgeMatch[]) {
    setErrorMessage("");
    const und = toUnderstanding(analysis);
    const rawTopMatch = matches.length > 0 ? matches[0] : null;

    // LLM discrimination: confirm the top match describes the same problem, not a distinct one
    setDiscriminationReasoning(null);
    setDiscriminatedMatchTitle(null);
    const topMatch = rawTopMatch
      ? await requestMatchDiscrimination(ticket, rawTopMatch, und)
      : null;

    const draft = draftResponse(ticket, und, topMatch, organizationProfile, knowledgeItems.length === 0);
    const canonicalProblem = identifyCanonicalProblem(und, organizationProfile);
    const aiDraft = await requestDraftAdvisory(ticket, und, canonicalProblem.title, topMatch, draft.draftResponse, draft.confidenceNote, draft.source ?? "deterministic", aiAdvisory);
    const response = aiDraft.response;

    addLogEntries([
      createLogEntry(
        "Generated draft response",
        response.source === "ai_advisory"
          ? "Draft informed by AI advisory and kept under OIP human review"
          : draft.basedOnKnowledgeIds.length > 0
          ? "Draft informed by matched knowledge"
          : knowledgeItems.length === 0
          ? "No approved knowledge exists — category template provided as starting point"
          : "Draft uses category template (no memory match)"
      )
    ]);

    setAiAdvisory(aiDraft.advisory);
    setLastDraftUsedAI(aiDraft.usedAIDraft);
    setSuggestedResponse(response);
    setReviewedResponse(response.source === "no_template" ? "" : response.draftResponse);
    setSelectedTicket({ ...ticket, status: "drafted" });
    setCurrentStep(4);
  }

  function updateReviewedResponse(value: string) {
    setReviewedResponse(value);
  }

  function approveResponse() {
    if (!selectedTicket || !aiAnalysis || !reviewedResponse.trim()) {
      setErrorMessage("Review the response before approving it as knowledge.");
      return;
    }
    if (businessRelevance?.status === "out_of_scope") {
      setErrorMessage("Out-of-scope tickets cannot be approved into Organizational Memory.");
      return;
    }

    const und = toUnderstanding(aiAnalysis);
    const existingMatch = findCanonicalProblem(und, knowledgeItems, organizationProfile);
    const reflection = generateReflection(und, reviewedResponse, existingMatch);
    setReflectionDecision(reflection);

    addLogEntries([
      createLogEntry("Human approved response", "Response reviewed and approved by human reviewer"),
      createLogEntry(
        "Reflection initiated",
        `Action: ${reflection.action.replace(/_/g, " ")} · Learning event: ${reflection.isLearningEvent ? "Yes" : "No"}`
      )
    ]);

    setSelectedTicket({ ...selectedTicket!, status: "approved" });
    setErrorMessage("");
    setCurrentStep(6);
  }

  function applyLessonToItem(item: KnowledgeItem, lessonDraft: LessonDraft, ticketId: string, now: string): KnowledgeItem {
    const existingLessons = item.lessons ?? [];

    if (lessonDraft.mode === "new") {
      const lesson: Lesson = {
        id: `lesson-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        rootCause: lessonDraft.rootCause,
        solution: lessonDraft.solution,
        customerResponse: lessonDraft.customerResponse,
        signals: lessonDraft.signals,
        createdAt: now,
        sourceTicketId: ticketId
      };
      return { ...item, lessons: [...existingLessons, lesson] };
    }

    if (lessonDraft.mode === "improves_existing" && lessonDraft.existingLessonId) {
      return {
        ...item,
        lessons: existingLessons.map(l =>
          l.id === lessonDraft.existingLessonId
            ? { ...l, rootCause: lessonDraft.rootCause, solution: lessonDraft.solution, customerResponse: lessonDraft.customerResponse, signals: lessonDraft.signals }
            : l
        )
      };
    }

    return item;
  }

  function confirmReflection(input?: ReflectionCommitInput) {
    if (!selectedTicket || !aiAnalysis || !reflectionDecision) return;

    const und = toUnderstanding(aiAnalysis);
    const now = new Date().toISOString();
    const lessonDraft = input?.lessonDraft;

    if (reflectionDecision.action === "create_new") {
      const problemName = input?.problemName?.trim();
      const isUncategorized = !!reflectionDecision.problemNameRequired;
      const canonicalProblemTitle = isUncategorized ? problemName : identifyCanonicalProblem(und, organizationProfile).title;
      if (isUncategorized && !canonicalProblemTitle) {
        setErrorMessage("Name the new problem in Reflection before committing it to Organizational Memory.");
        return;
      }
      const derivedCategory = isUncategorized
        ? (canonicalProblemTitle!.split(/\s*[—:-]\s*/).filter(Boolean)[0] || canonicalProblemTitle!)
        : und.category;
      const canonicalCustomerResponse = lessonDraft?.customerResponse?.trim() || reviewedResponse;
      const candidate = createCandidate({
        action: "create_new",
        sourceTicketIds: [selectedTicket.id],
        solution: lessonDraft?.rootCause ?? und.coreProblem,
        customerResponseTemplate: canonicalCustomerResponse,
        internalGuidance: lessonDraft?.solution ?? und.summary,
        canonicalProblemTitle,
        category: derivedCategory,
        rationale: reflectionDecision.rationale,
        createdAt: now
      });
      let newItem = createCanonicalProblem(
        selectedTicket,
        und,
        canonicalCustomerResponse,
        organizationProfile,
        now,
        isUncategorized
          ? {
              title: canonicalProblemTitle,
              category: derivedCategory,
              problemSummary: lessonDraft?.rootCause ?? und.coreProblem,
              tags: [...new Set([...und.tags, ...canonicalProblemTitle!.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2)])]
            }
          : undefined
      );
      if (lessonDraft) newItem = applyLessonToItem(newItem, { ...lessonDraft, mode: "new" }, selectedTicket.id, now);
      const committedItem = commitValidatedMemoryChange(candidate, null, newItem, reflectionDecision.rationale);
      setSessionCreatedIds((prev) => new Set([...prev, committedItem.id]));
      setLastApprovedSourceTicketId(selectedTicket.id);
      setLastSavedKnowledgeId(committedItem.id);
      recordOrgResolution("human", { createdKnowledge: true });
      updateMetrics({ knowledgeItemsCreated: 1, humanApprovedResponses: 1, canonicalProblemsTouched: 1, knowledgeVersionsCreated: 1 });
      const logEntries = [
        createLogEntry("Knowledge candidate validated", `Candidate ${candidate.id} approved by Prototype Knowledge Validator`),
        createLogEntry("Reflection confirmed: new canonical problem", committedItem.title),
        createLogEntry("Memory change recorded", `"${committedItem.title}" enters Learning state (trust ${TRUST_INITIAL})`)
      ];
      if (lessonDraft) logEntries.push(createLogEntry("Lesson authored", `Root cause: ${lessonDraft.rootCause} · Signals: ${lessonDraft.signals.join(", ")}`));
      addLogEntries(logEntries);
    } else if (reflectionDecision.action === "merge_existing") {
      const target = knowledgeItems.find((i) => i.id === reflectionDecision.existingItemId);
      if (target) {
        const base = withCanonicalProblemDefaults(target);
        const candidate = createCandidate({
          action: "merge_existing",
          sourceTicketIds: [selectedTicket.id],
          solution: und.coreProblem,
          customerResponseTemplate: base.customerResponseTemplate ?? base.approvedAnswer,
          internalGuidance: base.internalGuidance ?? und.summary,
          canonicalProblemTitle: base.canonicalProblemTitle ?? base.title,
          category: base.category,
          relatedKnowledgeId: base.id,
          rationale: reflectionDecision.rationale,
          createdAt: now
        });
        let merged = mergeIntoCanonicalProblem(target, selectedTicket, und, undefined, "human", now);
        if (lessonDraft) merged = applyLessonToItem(merged, lessonDraft, selectedTicket.id, now);
        const committedItem = commitValidatedMemoryChange(candidate, target, merged, reflectionDecision.rationale);
        setSessionCreatedIds((prev) => new Set([...prev, committedItem.id]));
        setLastApprovedSourceTicketId(selectedTicket.id);
        setLastSavedKnowledgeId(committedItem.id);
        setOrgMetrics((prev) => ({
          ...prev,
          mergedTickets: (prev.mergedTickets ?? 0) + 1,
          duplicatePreventions: (prev.duplicatePreventions ?? 0) + 1,
          lastUpdatedAt: now
        }));
        updateMetrics({ humanApprovedResponses: 1, canonicalProblemsTouched: 1, mergedTickets: 1, duplicatePreventions: 1 });
        const mergeLogEntries = [
          createLogEntry("Knowledge candidate validated", `Candidate ${candidate.id} approved by Prototype Knowledge Validator`),
          createLogEntry("Reflection confirmed: merged into existing", reflectionDecision.existingItemTitle ?? committedItem.title),
          createLogEntry("Evidence strengthened", `Ticket added as supporting case · Total seen: ${committedItem.timesSeen ?? 0}`)
        ];
        if (lessonDraft) mergeLogEntries.push(createLogEntry("Lesson authored", `Root cause: ${lessonDraft.rootCause} · Signals: ${lessonDraft.signals.join(", ")}`));
        addLogEntries(mergeLogEntries);
      }
    } else if (reflectionDecision.action === "create_version") {
      const target = knowledgeItems.find((i) => i.id === reflectionDecision.existingItemId);
      if (target) {
        const base = withCanonicalProblemDefaults(target);
        const newVersionNum = (base.knowledgeVersions?.length ?? 0) + 1;
        const candidate = createCandidate({
          action: "create_version",
          sourceTicketIds: [selectedTicket.id],
          solution: und.coreProblem,
          customerResponseTemplate: reviewedResponse,
          internalGuidance: base.internalGuidance ?? und.summary,
          canonicalProblemTitle: base.canonicalProblemTitle ?? base.title,
          category: base.category,
          relatedKnowledgeId: base.id,
          rationale: reflectionDecision.rationale,
          createdAt: now
        });
        let evolved: KnowledgeItem = {
          ...base,
          customerResponseTemplate: reviewedResponse,
          approvedAnswer: reviewedResponse,
          exampleTickets: [
            ...(base.exampleTickets ?? []),
            {
              ticketId: selectedTicket.id,
              customerName: selectedTicket.customerName,
              originalIssue: selectedTicket.description,
              createdAt: selectedTicket.createdAt,
              resolutionMode: "human" as const
            }
          ],
          knowledgeVersions: [
            ...(base.knowledgeVersions ?? []),
            {
              versionId: `${base.canonicalProblemId}-v${newVersionNum}`,
              version: newVersionNum,
              createdAt: now,
              changeReason: reflectionDecision.versionReason ?? "Human review introduced an improved response",
              sourceTicketId: selectedTicket.id,
              summary: `v${newVersionNum}: Updated customer response template`
            }
          ],
          timesSeen: (base.timesSeen ?? 0) + 1,
          humanReviewCount: (base.humanReviewCount ?? 0) + 1,
          lastUpdated: now,
          lastValidated: now,
          lastValidatedAt: now
        };
        if (lessonDraft) evolved = applyLessonToItem(evolved, lessonDraft, selectedTicket.id, now);
        const committedItem = commitValidatedMemoryChange(candidate, target, evolved, reflectionDecision.versionReason ?? reflectionDecision.rationale);
        setSessionCreatedIds((prev) => new Set([...prev, committedItem.id]));
        setLastApprovedSourceTicketId(selectedTicket.id);
        setLastSavedKnowledgeId(committedItem.id);
        setOrgMetrics((prev) => ({
          ...prev,
          knowledgeVersions: (prev.knowledgeVersions ?? 0) + 1,
          lastUpdatedAt: now
        }));
        updateMetrics({ humanApprovedResponses: 1, canonicalProblemsTouched: 1, knowledgeVersionsCreated: 1 });
        const versionLogEntries = [
          createLogEntry("Knowledge candidate validated", `Candidate ${candidate.id} approved by Prototype Knowledge Validator`),
          createLogEntry("Reflection confirmed: knowledge evolved", `"${base.canonicalProblemTitle}" → v${newVersionNum}`),
          createLogEntry("New version recorded", reflectionDecision.versionReason ?? "Improved response approach")
        ];
        if (lessonDraft) versionLogEntries.push(createLogEntry("Lesson authored", `Root cause: ${lessonDraft.rootCause} · Signals: ${lessonDraft.signals.join(", ")}`));
        addLogEntries(versionLogEntries);
      }
    } else if (reflectionDecision.action === "trust_update_only") {
      const existingId = reflectionDecision.existingItemId;
      if (existingId) {
        const target = knowledgeItems.find((i) => i.id === existingId);
        if (target) {
          const targetWithEvidence = mergeIntoCanonicalProblem(target, selectedTicket, und, undefined, "human", now);
          const result = recordResolution(targetWithEvidence, { mode: "human", success: true, at: now }, organizationProfile, validationRecords);
          const candidate = createCandidate({
            action: "trust_update_only",
            sourceTicketIds: [selectedTicket.id],
            solution: result.item.problemSummary ?? result.item.problem,
            customerResponseTemplate: result.item.customerResponseTemplate ?? result.item.approvedAnswer,
            internalGuidance: result.item.internalGuidance ?? result.item.problem,
            canonicalProblemTitle: result.item.canonicalProblemTitle ?? result.item.title,
            category: result.item.category,
            relatedKnowledgeId: existingId,
            rationale: reflectionDecision.rationale,
            createdAt: now
          });
          let trustItem = result.item;
          if (lessonDraft) trustItem = applyLessonToItem(trustItem, lessonDraft, selectedTicket.id, now);
          const committedItem = commitValidatedMemoryChange(candidate, target, trustItem, reflectionDecision.rationale);
          setLastTrustDelta(result.trustDelta);
          setLastSavedKnowledgeId(committedItem.id);
          addLogEntries(result.events.map((e) => createLogEntry(e.event, e.detail)));
          const trustLogEntries = [
            createLogEntry("Knowledge candidate validated", `Candidate ${candidate.id} approved by Prototype Knowledge Validator`),
            createLogEntry("Memory change recorded", `Trust update stored for ${committedItem.title}`)
          ];
          if (lessonDraft) trustLogEntries.push(createLogEntry("Lesson authored", `Root cause: ${lessonDraft.rootCause} · Signals: ${lessonDraft.signals.join(", ")}`));
          addLogEntries(trustLogEntries);
          recordOrgResolution("human");
        }
      }
      setLastApprovedSourceTicketId(selectedTicket.id);
      updateMetrics({ humanApprovedResponses: 1 });
      addLogEntries([
        createLogEntry("Reflection confirmed: trust update", reflectionDecision.existingItemTitle ?? "existing knowledge"),
        createLogEntry("Knowledge reinforced", "Same solution confirmed — trust increased")
      ]);
    }

    if (lastDraftUsedAI) {
      recordHumanAcceptedAISuggestion();
      addLogEntries([createLogEntry("Human accepted AI suggestion", "AI advisory draft approved after human review")]);
    }

    setErrorMessage("");
    setCurrentStep(8);
  }

  /**
   * Process the second (reuse) ticket. Retrieves memory, evaluates trust, and
   * either auto-resolves at the active profile threshold or routes to human approval.
   * Calling again with the same ticket lets judges watch trust climb to auto-resolution.
   */
  async function processSecondTicket(customText?: string) {
    const second =
      customText && customText.trim().length >= 5
        ? makeCustomTicket(customText.trim())
        : secondTicket ?? findTicket(secondDemoTicketId);
    if (!second) {
      setErrorMessage("Type a support issue in the text box below to test memory reuse.");
      return;
    }

    const relevance = assessBusinessRelevanceForProfile(`${second.subject} ${second.description}`, organizationProfile);
    setBusinessRelevance(relevance);

    if (!relevance.isRelevant && relevance.status === "out_of_scope") {
      setSecondTicket({ ...second, status: "new" });
      setAiAnalysis(null);
      setSimilarKnowledge([]);
      setAiAdvisory(null);
      setLastDraftUsedAI(false);
      setReuseDecision(null);
      setReuseResolvedMode(null);
      addLogEntries(createRelevanceLogEntries(relevance));
      updateMetrics({ outOfScopeDismissals: 1 });
      setErrorMessage("");
      setCurrentStep(8);
      return;
    }

    // Business Domain Classification for reuse ticket
    const reuseDomain = classifyBusinessDomain(
      `${second.subject} ${second.description}`,
      second.id,
      organizationProfile
    );
    setDomainClassification(reuseDomain);

    const und = understandForProfile(second, organizationProfile);
    const canonicalProblem = identifyCanonicalProblem(und, organizationProfile);
    const advisory = await requestAnalysisAdvisory(second, und, {
      title: canonicalProblem.title,
      problemSummary: canonicalProblem.problemSummary,
      category: canonicalProblem.category
    });
    const matches = retrieveMemory(und, knowledgeItems, sessionCreatedIds);

    // Among the strongly-relevant matches, the organization reaches for its
    // MOST TRUSTED knowledge — that is what enables auto-resolution over time.
    // Category-incompatible items are excluded before the trust-based selection so
    // a high-trust Activation item cannot drive a Login ticket's reuse response.
    const compatibleMatches = matches.filter((m) => isCompatibleForDrafting(und, m.item) || !!findMatchingLesson(second, m.item));

    // Cold Start path: no matches or no compatible matches → route to human review
    if (matches.length === 0 || compatibleMatches.length === 0) {
      const coldStartDraft = draftResponse(second, und, null, organizationProfile, knowledgeItems.length === 0);
      const secondAnalysis = understandingToAnalysis(und);
      setSecondTicket({ ...second, status: "analyzed" });
      setAiAnalysis(secondAnalysis);
      setAiAdvisory(advisory);
      setSimilarKnowledge([]);
      setReuseMatchId(null);
      setReuseDecision("human_required");
      setReuseResponseText(coldStartDraft.draftResponse);
      setReuseResponseSource("deterministic");
      setLastDraftUsedAI(false);
      setReuseResolvedMode(null);
      setRunCount((c) => c + 1);
      addLogEntries([
        ...createRelevanceLogEntries(relevance),
        createLogEntry("Observed reuse ticket", `Ticket: ${second.id}`),
        createLogEntry("Cold Start AI", "No compatible organizational memory — unknown business problem entering learning path"),
        createLogEntry("Human review required", "Unknown issues route to human review for knowledge creation")
      ]);
      setErrorMessage("");
      setCurrentStep(8);
      return;
    }
    const topScore = compatibleMatches[0].matchScore;
    const relevantCluster = compatibleMatches.filter((m) => m.matchScore >= topScore - 10);
    const reusedMatch = relevantCluster.reduce(
      (best, m) => ((m.item.trustScore ?? 0) > (best.item.trustScore ?? 0) ? m : best),
      relevantCluster[0]
    );

    const trust = evaluateTrust(reusedMatch.item, organizationProfile, validationRecords);
    // LLM discrimination on the reuse candidate — prevents false-positive memory reuse
    setDiscriminationReasoning(null);
    setDiscriminatedMatchTitle(null);
    const effectiveReuseMatch = await requestMatchDiscrimination(second, reusedMatch, und);

    // If discrimination says this is a distinct problem, treat as cold-start (no match)
    if (!effectiveReuseMatch) {
      const coldStartDraft = draftResponse(second, und, null, organizationProfile);
      const secondAnalysis = understandingToAnalysis(und);
      setSecondTicket({ ...second, status: "analyzed" });
      setAiAnalysis(secondAnalysis);
      setAiAdvisory(advisory);
      setSimilarKnowledge([]);
      setReuseMatchId(null);
      setReuseDecision("human_required");
      setReuseResponseText(coldStartDraft.draftResponse);
      setReuseResponseSource("deterministic");
      setLastDraftUsedAI(false);
      setReuseResolvedMode(null);
      setRunCount((c) => c + 1);
      addLogEntries([
        ...createRelevanceLogEntries(relevance),
        createLogEntry("Observed reuse ticket", `Ticket: ${second.id}`),
        createLogEntry("LLM discrimination rejected candidate match", "Ticket describes a distinct problem — honest cold-start path"),
        createLogEntry("Human review required", "No matching organizational memory — new knowledge will be proposed")
      ]);
      setErrorMessage("");
      setCurrentStep(8);
      return;
    }

    const draft = draftResponse(second, und, effectiveReuseMatch, organizationProfile);
    const aiDraft = await requestDraftAdvisory(second, und, canonicalProblem.title, effectiveReuseMatch, draft.draftResponse, draft.confidenceNote, draft.source ?? "deterministic", advisory);
    const draftSource = aiDraft.response.source ?? "deterministic";
    const isUnknownIssue = und.category === "Uncategorized" || und.category === "General";
    const effectiveReuseDecision: TrustDecision =
      isUnknownIssue ? "human_required"
      : draftSource === "ai_advisory" && trust.decision === "auto_resolution" ? "human_required"
      : trust.decision;
    const secondAnalysis = understandingToAnalysis(und);

    setSecondTicket({ ...second, status: "analyzed" });
    setAiAnalysis(secondAnalysis);
    setAiAdvisory(aiDraft.advisory ?? advisory);
    setSimilarKnowledge(matches);
    setReusedKnowledgeSourceTicketId(effectiveReuseMatch.item.sourceTicketId);
    setReuseMatchId(effectiveReuseMatch.item.id);
    setReuseDecision(effectiveReuseDecision);
    setReuseResponseText(aiDraft.response.draftResponse);
    setReuseResponseSource(draftSource);
    setLastDraftUsedAI(aiDraft.usedAIDraft);
    setRunCount((c) => c + 1);
    updateMetrics({ ticketsProcessed: 1, memoryRetrievals: 1, repeatedIssuesDetected: 1 });

    addLogEntries([
      ...createRelevanceLogEntries(relevance),
      createLogEntry("Observed reuse ticket", `Ticket: ${second.id}`),
      createLogEntry(`Category detected: ${und.category}`, `Tags: ${und.tags.join(", ")}`),
      createLogEntry(
        `Retrieved ${matches.length} memory candidate${matches.length !== 1 ? "s" : ""}`,
        `Top: "${effectiveReuseMatch.item.title}" — ${effectiveReuseMatch.matchScore}% similarity`
      ),
      createLogEntry(`Trust evaluated: ${trust.score}/100 → ${trust.decisionLabel}`, `Maturity: ${trust.maturity}`),
      isUnknownIssue
        ? createLogEntry("Auto-resolution blocked", "Unknown issues must always go through human review before learning")
        : draftSource === "ai_advisory" && trust.decision === "auto_resolution"
        ? createLogEntry("AI draft requires human review", "Fresh AI advisory text cannot use the automatic-resolution path")
        : createLogEntry("Draft source checked", draftSource === "ai_advisory" ? "AI advisory draft held for review" : "Deterministic validated template")
    ]);

    if (effectiveReuseDecision === "auto_resolution") {
      setReuseResolvedMode("automatic");
      addLogEntries([createLogEntry("Auto-resolution path", `Trust >= ${organizationProfile.autoResolutionThreshold} - validated template rendered from organizational memory`)]);
      applyResolution(effectiveReuseMatch.item.id, "automatic", second);
    } else {
      setReuseResolvedMode(null);
      addLogEntries([
        createLogEntry(
          "Human review path",
          draftSource === "ai_advisory"
            ? "AI advisory draft requires human approval before customer-facing resolution"
            : `${trust.decisionLabel} — awaiting human approval before learning`
        )
      ]);
    }

    await checkPatternDiscovery(second, secondAnalysis);

    setErrorMessage("");
    setCurrentStep(8);
  }

  /** Human approves the reuse — records a human-approved successful resolution (+trust). */
  function approveReuse() {
    if (!reuseMatchId) return;
    applyResolution(reuseMatchId, "human", secondTicket ?? undefined);
    setReuseResolvedMode("human");
    if (lastDraftUsedAI) {
      recordHumanAcceptedAISuggestion();
    }
    addLogEntries([createLogEntry("Human approved reuse", "Knowledge confirmed correct — trust increased")]);
  }

  function goNext() {
    if (currentStep === 0) {
      startDemo();
      return;
    }
    setCurrentStep((step) => Math.min(step + 1, steps.length - 1));
  }

  function goBack() {
    setCurrentStep((step) => Math.max(step - 1, 0));
  }

  /** Auto-process a ticket through the full analysis → memory → draft pipeline. */
  async function processTicketPipeline(text: string) {
    if (!text.trim() || isProcessing) return;
    setIsProcessing(true);
    setErrorMessage("");
    const ticket = makeCustomTicket(text.trim());
    setSelectedTicket(ticket);
    setCurrentStep(1);

    // Phase 1: Analysis
    const relevance = assessBusinessRelevanceForProfile(`${ticket.subject} ${ticket.description}`, organizationProfile);
    setBusinessRelevance(relevance);
    addLogEntries(createRelevanceLogEntries(relevance));

    if (!relevance.isRelevant && relevance.status === "out_of_scope") {
      setErrorMessage(`Rejected by Business Relevance Guardrail: ${relevance.reason}`);
      setIsProcessing(false);
      return;
    }

    // Phase 1b: Business Domain Classification
    const domain = classifyBusinessDomain(
      `${ticket.subject} ${ticket.description}`,
      ticket.id,
      organizationProfile
    );
    setDomainClassification(domain);
    addLogEntries([
      createLogEntry("Business domain classified", `Primary: ${domain.primaryDomain} · All: ${domain.domains.join(", ")} (${domain.confidence} confidence)`)
    ]);

    const obs = observe(ticket, "manual-demo-input");
    const und = understandForProfile(ticket, organizationProfile);
    const canonicalProblem = identifyCanonicalProblem(und, organizationProfile);
    const analysis = understandingToAnalysis(und);
    const advisory = await requestAnalysisAdvisory(ticket, und, {
      title: canonicalProblem.title,
      problemSummary: canonicalProblem.problemSummary,
      category: canonicalProblem.category
    });

    setObservation(obs);
    setAiAnalysis(analysis);
    setAiAdvisory(advisory);
    setSelectedTicket({ ...ticket, status: "analyzed" });
    addLogEntries([
      createLogEntry("Observed ticket input", `Ticket: ${ticket.id}`),
      createLogEntry(`Extracted category: ${und.category}`, `Urgency: ${und.urgency}`),
      createLogEntry("Canonical problem proposed", canonicalProblem.title),
    ]);
    updateMetrics({ ticketsProcessed: 1 });
    setCurrentStep(2);

    // Phase 2: Memory retrieval
    const matches = retrieveMemory(und, knowledgeItems, sessionCreatedIds);
    const topMatch = matches.length > 0 ? matches[0] : null;
    const newReasoning = buildReasoning(und, topMatch);
    const newConfidence = buildConfidence(und, topMatch);
    const topTrust = topMatch ? evaluateTrust(topMatch.item, organizationProfile, validationRecords) : null;

    setSimilarKnowledge(matches);
    setReasoning(newReasoning);
    setConfidence(newConfidence);
    addLogEntries([
      createLogEntry(
        `Retrieved ${matches.length} memory candidate${matches.length !== 1 ? "s" : ""}`,
        topMatch ? `Top: "${topMatch.item.title}" (${topMatch.matchScore}%)` : "No knowledge matches"
      ),
      topTrust
        ? createLogEntry(`Trust evaluated: ${topTrust.score}/100 → ${topTrust.decisionLabel}`)
        : createLogEntry("Trust evaluation skipped: no match"),
    ]);
    updateMetrics({ memoryRetrievals: 1, repeatedIssuesDetected: matches.length > 0 ? 1 : 0 });
    void checkPatternDiscovery(ticket, analysis);
    setCurrentStep(3);

    // Phase 3: Draft generation (with LLM discrimination on the top match)
    setDiscriminationReasoning(null);
    setDiscriminatedMatchTitle(null);
    const effectiveTopMatch = topMatch
      ? await requestMatchDiscrimination(ticket, topMatch, und)
      : null;
    const draft = draftResponse(ticket, und, effectiveTopMatch, organizationProfile, knowledgeItems.length === 0);
    const aiDraft = await requestDraftAdvisory(ticket, und, canonicalProblem.title, effectiveTopMatch, draft.draftResponse, draft.confidenceNote, draft.source ?? "deterministic", advisory);
    const response = aiDraft.response;

    addLogEntries([
      createLogEntry("Generated draft response", response.source === "ai_advisory" ? "AI advisory draft" : "Deterministic draft")
    ]);

    setAiAdvisory(aiDraft.advisory);
    setLastDraftUsedAI(aiDraft.usedAIDraft);
    setSuggestedResponse(response);
    setReviewedResponse(response.source === "no_template" ? "" : response.draftResponse);
    setSelectedTicket({ ...ticket, status: "drafted" });
    setCurrentStep(4);
    setIsProcessing(false);
  }


  // Derived constants used by views
  const reuseItem = reuseMatchId ? knowledgeItems.find((i) => i.id === reuseMatchId) ?? null : null;
  // Derive ticketPhase from currentStep
  const ticketPhase: TicketPhase =
    currentStep === 0 ? "idle"
    : currentStep <= 3 ? "analyzing"
    : currentStep <= 5 ? "review"
    : currentStep === 6 ? "approved"
    : currentStep === 7 ? "reflecting"
    : "complete";

  const handleNewTicket = () => {
    setActiveView("tickets");
    setTicketIntakeMode("single");
    if (currentStep >= 8) resetSession();
  };

  const handleUploadQueries = () => {
    setActiveView("tickets");
    setTicketIntakeMode("bulk");
  };

  const handleBulkSingleTicket = (text: string) => {
    setActiveView("tickets");
    setTicketIntakeMode("single");
    resetWorkflowState();
    void processTicketPipeline(text);
  };

  const accent = normalizeAccentColor(organizationProfile.accentColor);

  return (
    <div className={`flex h-screen flex-col overflow-hidden md:flex-row ${darkMode ? "bg-[#0b1220]" : "bg-[#F3F6FA]"}`}>
      {/* Sidebar */}
      <Sidebar
        activeView={activeView}
        onNavigate={(view) => {
          setActiveView(view);
        }}
        orgName={organizationProfile.name}
        darkMode={darkMode}
        accentColor={accent}
      />

      {/* Main content */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className={`flex flex-shrink-0 items-center justify-end px-4 pb-2 md:px-6 md:pb-0 md:pt-6 ${darkMode ? "bg-[#0b1220]" : "bg-[#F3F6FA]"}`}>
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-14 items-center justify-center rounded-2xl text-xs font-bold text-white shadow-sm"
              style={{ backgroundColor: accent }}
            >
              {initialsFor(organizationProfile)}
            </div>
          </div>
        </header>

        {/* View content */}
        <main className={`flex-1 overflow-y-auto ${darkMode ? "bg-[#0b1220]" : "bg-[#F3F6FA]"}`}>
          {activeView === "home" && (
            <HomeView
              knowledgeItems={knowledgeItems}
              orgMetrics={orgMetrics}
              emergingPatterns={emergingPatterns}
              orgName={organizationProfile.name}
              darkMode={darkMode}
              onNavigate={setActiveView}
              onNewTicket={handleNewTicket}
            />
          )}

          {activeView === "tickets" && (
            <div className={`flex h-full flex-col ${darkMode ? "bg-[#0b1220]" : "bg-[#F3F6FA]"}`}>
              {ticketIntakeMode === "single" ? (
                <TicketWorkspace
                  intakeMode={ticketIntakeMode}
                  currentStep={currentStep}
                  isProcessing={isProcessing}
                  ticketPhase={ticketPhase}
                  selectedTicket={selectedTicket}
                  aiAnalysis={aiAnalysis}
                  similarKnowledge={similarKnowledge}
                  suggestedResponse={suggestedResponse}
                  reviewedResponse={reviewedResponse}
                  reflectionDecision={reflectionDecision}
                  knowledgeItems={knowledgeItems}
                  businessRelevance={businessRelevance}
                  domainClassification={domainClassification}
                  aiAdvisory={aiAdvisory}
                  errorMessage={errorMessage}
                  organizationProfile={organizationProfile}
                  reuseItem={reuseItem}
                  reuseDecision={reuseDecision}
                  reuseResponseText={reuseResponseText}
                  reuseResponseSource={reuseResponseSource}
                  reuseResolvedMode={reuseResolvedMode}
                  lastTrustDelta={lastTrustDelta}
                  runCount={runCount}
                  customSecondText={customSecondText}
                  darkMode={darkMode}
                  lastSavedKnowledgeId={lastSavedKnowledgeId}
                  discriminationReasoning={discriminationReasoning}
                  discriminatedMatchTitle={discriminatedMatchTitle}
                  onSubmitTicket={(text) => { void processTicketPipeline(text); }}
                  onUpdateReviewedResponse={updateReviewedResponse}
                  onApproveResponse={approveResponse}
                  onViewReflection={() => setCurrentStep(7)}
                  onConfirmReflection={confirmReflection}
                  onApproveReuse={approveReuse}
                  onProcessReuse={(text) => { void processSecondTicket(text); }}
                  onRunAgain={() => { void processSecondTicket(); }}
                  onSetCustomSecondText={setCustomSecondText}
                  onSwitchToSingle={handleNewTicket}
                  onSwitchToBulk={handleUploadQueries}
                />
              ) : (
                <BulkUploadWorkspace
                  darkMode={darkMode}
                  onSwitchToSingle={handleNewTicket}
                  onSwitchToBulk={handleUploadQueries}
                  onAnalyze={analyzeUploadedQueries}
                  onCommitCluster={commitBulkCluster}
                  onOpenSingleTicket={handleBulkSingleTicket}
                />
              )}
            </div>
          )}

          {activeView === "knowledge" && (
            <KnowledgeView
              knowledgeItems={knowledgeItems}
              emergingPatterns={emergingPatterns}
              validationRecords={validationRecords}
              memoryChangeRecords={memoryChangeRecords}
              darkMode={darkMode}
              orgId={organizationProfile.id}
              onPromote={promotePattern}
            />
          )}

          {activeView === "dashboard" && (
            <DashboardView
              orgMetrics={orgMetrics}
              metrics={metrics}
              knowledgeItems={knowledgeItems}
              emergingPatterns={emergingPatterns}
              darkMode={darkMode}
              onPromote={promotePattern}
            />
          )}

          {activeView === "organization" && (
            <OrganizationView
              profile={organizationProfile}
              organizations={organizationList}
              onChange={changeOrganizationProfile}
              onSelectOrg={selectOrganization}
              onAddOrg={addOrganization}
              onDeleteOrg={deleteOrganization}
              darkMode={darkMode}
            />
          )}

          {activeView === "settings" && (
            <div className="mx-auto max-w-4xl p-6">
              <h1 className={`text-3xl font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>Settings</h1>
              <p className={`mt-1 text-sm ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>Theme, session controls, and demo maintenance.</p>

              <div className="mt-8 grid gap-5 lg:grid-cols-2">
                <div className={`rounded-2xl border p-6 ${darkMode ? "bg-[#1a2b3c] border-[#2d3f52]" : "bg-white border-slate-200"}`}>
                  <h2 className={`font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>Appearance</h2>
                  <p className={`mt-1 text-sm ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>Choose the workspace mode for support work.</p>
                  <div className={`mt-5 grid rounded-2xl p-1 ${darkMode ? "bg-[#111827]" : "bg-slate-100"}`}>
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() => setDarkMode(false)}
                        className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${!darkMode ? "bg-white text-[#2563EB] shadow-sm" : "text-slate-400 hover:text-white"}`}
                      >
                        Light
                      </button>
                      <button
                        type="button"
                        onClick={() => setDarkMode(true)}
                        className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${darkMode ? "bg-[#27469e] text-white shadow-sm" : "text-slate-600 hover:text-[#111827]"}`}
                      >
                        Dark
                      </button>
                    </div>
                  </div>
                  <p className={`mt-4 text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Theme preference is saved in this browser.</p>

                  <div className={`mt-6 border-t pt-5 ${darkMode ? "border-[#2d3f52]" : "border-slate-200"}`}>
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white"
                        style={{ backgroundColor: accent }}
                      >
                        {initialsFor(organizationProfile)}
                      </div>
                      <div>
                        <h3 className={`font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>Accent color</h3>
                        <p className={`text-xs ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>
                          Brand color for {organizationProfile.name} — drives the sidebar, avatars, and highlights.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4">
                      <AccentPicker
                        value={accent}
                        onChange={(hex) => changeOrganizationProfile({ ...organizationProfile, accentColor: hex })}
                        darkMode={darkMode}
                      />
                    </div>
                  </div>
                </div>

                <div className={`rounded-2xl border p-6 ${darkMode ? "bg-red-950/20 border-red-900/50" : "bg-red-50/60 border-red-200"}`}>
                  <p className={`text-xs font-bold uppercase tracking-wide ${darkMode ? "text-red-300" : "text-red-700"}`}>Danger Zone</p>
                  <h2 className={`mt-1 font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>Reset controls</h2>
                  <p className={`mt-1 text-sm ${darkMode ? "text-red-200/80" : "text-red-700"}`}>Use these only when preparing a fresh demo run. Organization reset permanently wipes persisted memory, validation records, trust history, and metrics.</p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={resetSession}
                      className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${darkMode ? "border-[#2d3f52] text-slate-300 hover:bg-[#1e3048]" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
                    >
                      Reset Session
                    </button>
                    <button
                      type="button"
                      onClick={confirmAndResetOrganization}
                      className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                    >
                      Reset Organization
                    </button>
                  </div>
                  <p className={`mt-4 text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                    Session reset clears only the current workflow. Organization reset requires confirmation before deleting persisted organizational memory.
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}





