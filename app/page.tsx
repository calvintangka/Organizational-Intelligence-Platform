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
import type { LessonMatchResult } from "@/lib/drafting";
import {
  buildKnowledgeItemFromPackCandidate,
  buildPackCandidateContent,
  candidateToPackDraft
} from "@/lib/knowledgePacks";
import { generateReflection } from "@/lib/reflection";
import {
  createCanonicalProblem,
  getCustomerResponseTemplate,
  identifyCanonicalProblem,
  mergeIntoCanonicalProblem,
  normalizeReusableLessonTemplate,
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
import {
  generateTicketId,
  createTicketRecord,
  upsertTicketRecord,
  loadTicketRecords,
  saveTicketRecords,
  clearTicketRecords,
  computeEditDistance,
} from "@/lib/ticketRecords";
import { CaseLookupView } from "@/components/views/CaseLookupView";
import type {
  AIAnalysis,
  AIAdvisory,
  AIAdvisoryStatus,
  AIDiagnostics,
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
  ExtractedTicketFields,
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
  TicketRecord,
  KnowledgePack,
  KnowledgePackCandidateDraft,
} from "@/types";

const aiAdapter = createAIAdapter();
const EMAIL_RECOVERY_FORBIDDEN_DRAFT_TERMS = [
  "caps lock",
  "saved password",
  "autofill",
  "credential mismatch",
  "old password"
];
const EMAIL_RECOVERY_VALIDATION_TERMS = [
  "verify",
  "verification",
  "invoice",
  "order id",
  "subscription",
  "purchase date",
  "payment method",
  "login email",
  "account email"
];
const ACTIVATION_REQUIRED_DRAFT_TERMS = [
  "activation code",
  "purchase email",
  "product version",
  "screenshot"
];
const ACTIVATION_ALLOWED_TOPIC_TERMS = [
  "activation",
  "activation code",
  "license",
  "product version",
  "purchase email",
  "activation error"
];
const ACTIVATION_FORBIDDEN_DRAFT_TERMS = [
  "password",
  "login email",
  "recover the email",
  "credentials",
  "caps lock",
  "saved password"
];
const UNVALIDATED_PROCESS_REFERENCES: Array<{ label: string; pattern: RegExp }> = [
  { label: "billing support team", pattern: /\bbilling support team\b/i },
  { label: "finance team", pattern: /\bfinance team\b/i },
  { label: "specialist", pattern: /\bspecialist\b/i },
  { label: "escalation", pattern: /\bescalat(?:e|ed|ion)\b/i },
  { label: "handoff", pattern: /\bhandoff\b/i },
  { label: "back-office team", pattern: /\bback[- ]office team\b/i }
];
const UNGROUNDED_TIMELINE_REFERENCES: Array<{ label: string; pattern: RegExp }> = [
  { label: "within-N-hours-days", pattern: /\bwithin \d+\s+(?:business\s+)?(?:hour|hours|day|days|week|weeks)\b/i },
  { label: "by end of day", pattern: /\b(?:by|before) end of (?:day|week)\b/i },
  { label: "shortly", pattern: /\bshortly\b/i },
  { label: "soon", pattern: /\bsoon\b/i },
  { label: "as soon as possible", pattern: /\bas soon as possible\b/i }
];
const OUTCOME_COMMITMENT_RULES: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "unvalidated refund or credit promise",
    pattern:
      /\b(?:we|i)(?:'ll| will)\s+(?:issue|process|approve|arrange|provide|send)\s+(?:a\s+)?(?:refund|credit)\b/i
  },
  {
    label: "unvalidated invoice correction promise",
    pattern: /\b(?:we|i)(?:'ll| will)\s+(?:correct|update|reissue|revise|amend)\s+(?:the\s+)?invoice\b/i
  },
  {
    label: "approved outcome language",
    pattern:
      /\b(?:your|the)\s+(?:refund|credit)\s+(?:has been|is)\s+(?:approved|processed|completed|confirmed)\b|\b(?:the\s+)?invoice\s+(?:has been|is)\s+(?:corrected|updated|reissued|revised|amended)\b/i
  }
];

interface DraftSafetyContext {
  draftMode: DraftGroundingMode;
  groundingContent: string;
  organizationName: string;
}

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

const STRONG_LESSON_MATCH_THRESHOLD = 2;

interface MatchWithLesson {
  match: KnowledgeMatch;
  lessonMatch: LessonMatchResult | null;
}

function createInitialMetrics(): Metrics {
  return { ...defaultMetrics };
}

function findTicket(ticketId: string): Ticket | null {
  if (!ticketId) return null;
  return seedTickets.find((item) => item.id === ticketId) ?? null;
}

function makeCustomTicket(description: string, ticketId?: string): Ticket {
  const subject = description.length > 80 ? description.slice(0, 80) + "…" : description;
  return {
    id: `ticket-custom-${Date.now()}`,
    ticketId,
    customerName: "Demo User",
    subject,
    description,
    category: "General",
    status: "new",
    createdAt: new Date().toISOString()
  };
}

function isStrongLessonMatch(lessonMatch: LessonMatchResult | null | undefined): lessonMatch is LessonMatchResult {
  return !!lessonMatch && lessonMatch.score >= STRONG_LESSON_MATCH_THRESHOLD;
}

function buildDiscriminationLessonPayload(lessonMatch: LessonMatchResult) {
  return {
    title: lessonMatch.lesson.title,
    rootCause: lessonMatch.lesson.rootCause,
    signals: lessonMatch.matchedSignals,
    customerResponse: lessonMatch.lesson.customerResponse
  };
}

function selectPreferredMatch(ticket: Ticket, matches: KnowledgeMatch[]): MatchWithLesson | null {
  if (matches.length === 0) return null;

  const annotated = matches.map((match) => ({
    match,
    lessonMatch: findMatchingLesson(ticket, match.item)
  }));
  const lessonBacked = annotated.filter((entry) => isStrongLessonMatch(entry.lessonMatch));
  const pool = lessonBacked.length > 0 ? lessonBacked : annotated;
  const topScore = Math.max(...pool.map((entry) => entry.match.matchScore));
  const relevantCluster = pool.filter((entry) => entry.match.matchScore >= topScore - 10);

  return relevantCluster.reduce((best, current) => {
    const bestTrust = best.match.item.trustScore ?? 0;
    const currentTrust = current.match.item.trustScore ?? 0;
    if (currentTrust !== bestTrust) return currentTrust > bestTrust ? current : best;

    const bestLessonScore = best.lessonMatch?.score ?? 0;
    const currentLessonScore = current.lessonMatch?.score ?? 0;
    if (currentLessonScore !== bestLessonScore) return currentLessonScore > bestLessonScore ? current : best;

    if (current.match.matchScore !== best.match.matchScore) return current.match.matchScore > best.match.matchScore ? current : best;
    return current;
  }, relevantCluster[0]);
}

function normalizeLessonSearchText(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function isLessonSearchCandidate(
  understanding: Understanding,
  item: KnowledgeItem,
  canonicalProblemTitle: string
): boolean {
  if (!item.lessons?.length) return false;
  if (!isCompatibleForDrafting(understanding, item)) return false;

  const targetTokens = new Set(normalizeLessonSearchText(`${canonicalProblemTitle} ${understanding.category}`));
  const itemTokens = normalizeLessonSearchText(
    `${item.canonicalProblemTitle ?? ""} ${item.title} ${item.category} ${item.tags.join(" ")}`
  );
  return itemTokens.some((token) => targetTokens.has(token));
}

function withPreDiscriminationLessonMatches(
  ticket: Ticket,
  understanding: Understanding,
  matches: KnowledgeMatch[],
  items: KnowledgeItem[],
  canonicalProblemTitle: string
): KnowledgeMatch[] {
  const lessonMatches = items
    .filter((item) => isLessonSearchCandidate(understanding, item, canonicalProblemTitle))
    .map((item) => ({ item, lessonMatch: findMatchingLesson(ticket, item) }))
    .filter((entry): entry is { item: KnowledgeItem; lessonMatch: LessonMatchResult } => isStrongLessonMatch(entry.lessonMatch));

  if (lessonMatches.length === 0) return matches;

  const best = lessonMatches.reduce((winner, current) => {
    if (current.lessonMatch.score !== winner.lessonMatch.score) {
      return current.lessonMatch.score > winner.lessonMatch.score ? current : winner;
    }
    const currentTrust = current.item.trustScore ?? 0;
    const winnerTrust = winner.item.trustScore ?? 0;
    return currentTrust > winnerTrust ? current : winner;
  }, lessonMatches[0]);

  const existing = matches.find((match) => match.item.id === best.item.id);
  const lessonLabel = best.lessonMatch.lesson.title ?? best.lessonMatch.lesson.rootCause;
  const lessonBackedMatch: KnowledgeMatch = {
    item: best.item,
    matchScore: Math.max(existing?.matchScore ?? 0, 95),
    matchReason: `Validated lesson match - "${lessonLabel}" matched before AI discrimination via signals: ${best.lessonMatch.matchedSignals.join(", ")}.`,
    matchedTags: existing?.matchedTags ?? [],
    matchedKeywords: best.lessonMatch.matchedSignals.slice(0, 4),
    matchedCategory: best.item.category
  };

  return moveMatchToFront(
    [lessonBackedMatch, ...matches.filter((match) => match.item.id !== best.item.id)],
    best.item.id
  );
}

function moveMatchToFront(matches: KnowledgeMatch[], matchId?: string): KnowledgeMatch[] {
  if (!matchId) return matches;
  return [
    ...matches.filter((match) => match.item.id === matchId),
    ...matches.filter((match) => match.item.id !== matchId)
  ];
}

function stripRejectedMatch(matches: KnowledgeMatch[], matchId?: string): KnowledgeMatch[] {
  if (!matchId) return matches;
  return matches.filter((match) => match.item.id !== matchId);
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
    detectedSignals: und.detectedSignals,
    extractedFields: und.extractedFields
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
    detectedSignals: analysis.detectedSignals ?? [],
    extractedFields: analysis.extractedFields ?? emptyExtractedTicketFields()
  };
}

function emptyExtractedTicketFields(): ExtractedTicketFields {
  return {
    senderName: null,
    senderRole: null,
    companyName: null,
    deadline: null,
    subIssues: [],
    urgencyIndicators: []
  };
}

/**
 * F-1: Best-effort sender-name extraction for the resume path. The original
 * AI analysis is not re-run on resume, but the deterministic extractor in
 * `lib/analyzer.ts` only finds names after a closing salutation ("Regards,
 * Sarah"). Real customer messages often start with "Hi, my name is Sarah
 * Johnson" or similar. This helper extends coverage so the F-2 greeting fix
 * still works after a resume. Returns null when nothing matches.
 */
function extractSenderNameForResume(rawMessage: string): string | null {
  const patterns: RegExp[] = [
    /\bmy name is\s+([A-Z][A-Za-z .'-]{1,80}?)(?:\s+from|\.|,|\n|$)/,
    /\bthis is\s+([A-Z][A-Za-z .'-]{1,80}?)(?:\s+from|\.|,|\n|$)/,
    /\bI'?m\s+([A-Z][A-Za-z .'-]{1,80}?)(?:\s+from|\.|,|\n|$)/,
    /^[ \t]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})[ \t]*$/
  ];
  for (const pattern of patterns) {
    const match = rawMessage.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim();
      if (candidate.length >= 3 && !/@/.test(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * F-7: Deterministic post-processing guard so every customer-facing draft,
 * from every code path, ends with the same ticket reference line. Mirrors the
 * !draft.includes() guard in `lib/drafting.ts` so the LLM cannot forget it.
 * Returns the draft unchanged when there is no public-facing ticket reference
 * to attach (e.g., during analysis-only flows before id assignment).
 */
function appendTicketReference(draft: string, ticketRefId: string | undefined): string {
  if (!ticketRefId) return draft;
  if (draft.includes(ticketRefId)) return draft;
  return `${draft.trimEnd()}\n\nYour ticket reference is ${ticketRefId}.`;
}

/**
 * F-2: Personalize the greeting line when a sender name was extracted but the
 * AI used a bare "Hello," / "Hi," / "Dear," opener. The prompt already
 * instructs the model on this, but observed cold-start drafts have dropped the
 * name. We substitute the deterministic greeting instead of trusting the LLM.
 *
 * Tone rules mirror `preferredGreeting()` in `lib/ai/prompts.ts` so this
 * safety net is consistent with the prompt's intent.
 */
function personalizeAIDraftGreeting(
  draft: string,
  senderName: string | null,
  tone: OrganizationProfile["customerTone"]
): string {
  if (!senderName) return draft;
  const firstName = senderName.trim().split(/\s+/)[0] ?? senderName.trim();
  // If the AI already used the name in the opening line, don't double it.
  const firstLine = draft.split(/\n/)[0] ?? "";
  if (firstLine.includes(senderName) || firstLine.includes(firstName)) return draft;
  let personalized: string;
  switch (tone) {
    case "friendly":
    case "empathetic":
      personalized = `Hi ${firstName},`;
      break;
    case "formal":
      personalized = `Dear ${senderName},`;
      break;
    case "professional":
    default:
      personalized = `Hello ${senderName},`;
      break;
  }
  // Match the first line if it opens with a bare greeting (no name).
  // Patterns observed in practice: "Hello,", "Hi,", "Dear,", "Hi there,"
  // followed by any whitespace and the rest of the draft.
  const greetingPattern = /^(Hello|Hi|Dear)\s*(?:there\s*)?,\s*/i;
  if (greetingPattern.test(draft)) {
    return draft.replace(greetingPattern, `${personalized} `);
  }
  // Pattern "Hello." with no comma (some prompt drift): "Hello. We..."
  const greetingPatternNoComma = /^(Hello|Hi|Dear)\s+(?=[A-Z])/;
  if (greetingPatternNoComma.test(draft)) {
    return draft.replace(greetingPatternNoComma, `${personalized} `);
  }
  return draft;
}

function mergeExtractedTicketFields(
  base: ExtractedTicketFields,
  advisoryFields?: ExtractedTicketFields
): ExtractedTicketFields {
  if (!advisoryFields) return base;

  return {
    senderName: advisoryFields.senderName ?? base.senderName,
    senderRole: advisoryFields.senderRole ?? base.senderRole,
    companyName: advisoryFields.companyName ?? base.companyName,
    deadline: advisoryFields.deadline ?? base.deadline,
    subIssues: advisoryFields.subIssues.length > 0 ? advisoryFields.subIssues : base.subIssues,
    urgencyIndicators: advisoryFields.urgencyIndicators.length > 0 ? advisoryFields.urgencyIndicators : base.urgencyIndicators
  };
}

function applyAdvisoryExtractedFields(
  understanding: ReturnType<typeof understandForProfile>,
  advisory: AIAdvisory | null
): ReturnType<typeof understandForProfile> {
  return {
    ...understanding,
    extractedFields: mergeExtractedTicketFields(
      understanding.extractedFields ?? emptyExtractedTicketFields(),
      advisory?.analysisSuggestion?.extractedFields
    )
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

  // Ticket records (first-class persisted case records)
  const [ticketRecords, setTicketRecords] = useState<TicketRecord[]>([]);
  const [activeTicketRecord, setActiveTicketRecord] = useState<TicketRecord | null>(null);

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
  const [isRetryingDraft, setIsRetryingDraft] = useState(false);

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
    setTicketRecords(loadTicketRecords());
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
    if (hydrated) saveTicketRecords(ticketRecords);
  }, [ticketRecords, hydrated]);

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
    lessons?: Lesson[];
    importMetadata?: KnowledgeCandidate["proposedContent"]["importMetadata"];
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
        category: input.category,
        lessons: input.lessons,
        importMetadata: input.importMetadata
      },
      relatedKnowledgeId: input.relatedKnowledgeId,
      rationale: input.rationale,
      status: "proposed",
      createdAt: input.createdAt ?? new Date().toISOString()
    };
  }

  function importKnowledgePack(pack: KnowledgePack): KnowledgeCandidate {
    const now = new Date().toISOString();
    const customerResponseTemplate = getCustomerResponseTemplate(pack.canonicalProblem.category, organizationProfile);
    const internalGuidance = [
      `Starter knowledge pack import for ${pack.canonicalProblem.title}.`,
      pack.description,
      "Review every lesson before validation. Imported packs remain pending until a human approves them."
    ].join(" ");
    const content = buildPackCandidateContent(pack, now, customerResponseTemplate, internalGuidance);
    const candidate = createCandidate({
      action: "create_new",
      sourceTicketIds: [content.importMetadata?.sourceLabel ?? `knowledge_pack: ${pack.packId}`],
      solution: content.solution,
      customerResponseTemplate: content.customerResponseTemplate,
      internalGuidance: content.internalGuidance,
      canonicalProblemTitle: content.canonicalProblemTitle,
      category: content.category,
      lessons: content.lessons,
      importMetadata: content.importMetadata,
      rationale: `Imported starter knowledge pack "${pack.packName}" as a pending validation candidate.`,
      createdAt: now
    });

    setKnowledgeCandidates((prev) => [...prev, candidate]);
    addLogEntries([
      createLogEntry(
        "Knowledge pack imported as candidate",
        `${pack.packName} (${pack.lessons.length} lessons) is awaiting validation before it becomes organizational memory.`
      )
    ]);
    return candidate;
  }

  function validateKnowledgePackCandidate(
    candidateId: string,
    draft: KnowledgePackCandidateDraft
  ): KnowledgeItem | null {
    const candidate = knowledgeCandidates.find((item) => item.id === candidateId && item.status === "proposed");
    if (!candidate) {
      setErrorMessage("This imported knowledge pack candidate is no longer available for validation.");
      return null;
    }
    if (!draft.lessons.length) {
      setErrorMessage("At least one lesson must remain before validating this knowledge pack.");
      return null;
    }

    const now = new Date().toISOString();
    const updatedCandidate: KnowledgeCandidate = {
      ...candidate,
      rationale: `Validated starter knowledge pack "${candidate.proposedContent.importMetadata?.packName ?? draft.canonicalProblemTitle}".`,
      proposedContent: {
        ...candidate.proposedContent,
        solution: draft.problemSummary.trim(),
        internalGuidance: draft.internalGuidance.trim(),
        customerResponseTemplate: draft.customerResponseTemplate.trim(),
        canonicalProblemTitle: draft.canonicalProblemTitle.trim(),
        category: draft.category.trim(),
        lessons: draft.lessons.map((lesson) => ({
          ...lesson,
          signals: lesson.signals.map((signal) => signal.trim()).filter(Boolean),
          whenToEscalate: lesson.whenToEscalate?.trim(),
          doNotPromise: lesson.doNotPromise?.map((entry) => entry.trim()).filter(Boolean)
        }))
      }
    };
    const afterState = buildKnowledgeItemFromPackCandidate(updatedCandidate, draft, organizationProfile, now);
    const result = applyValidatedMemoryChange(
      updatedCandidate,
      null,
      afterState,
      `Starter knowledge pack validated: ${updatedCandidate.proposedContent.importMetadata?.packName ?? draft.canonicalProblemTitle}`
    );

    setSessionCreatedIds((prev) => new Set([...prev, result.validatedItem.id]));
    setLastSavedKnowledgeId(result.validatedItem.id);
    recordOrgResolution("human", { createdKnowledge: true });
    updateMetrics({ knowledgeItemsCreated: 1, humanApprovedResponses: 1, canonicalProblemsTouched: 1, knowledgeVersionsCreated: 1 });
    addLogEntries([
      createLogEntry(
        "Knowledge pack validated",
        `${updatedCandidate.proposedContent.importMetadata?.packName ?? draft.canonicalProblemTitle} committed with ${draft.lessons.length} approved lessons.`
      ),
      createLogEntry("Validation record created", result.validation.id),
      createLogEntry("Memory change recorded", result.memoryChange.id)
    ]);
    return result.validatedItem;
  }

  function rejectKnowledgePackCandidate(candidateId: string) {
    const candidate = knowledgeCandidates.find((item) => item.id === candidateId);
    if (!candidate) return;
    setKnowledgeCandidates((prev) =>
      prev.map((item) => (item.id === candidateId ? { ...item, status: "rejected" } : item))
    );
    addLogEntries([
      createLogEntry(
        "Knowledge pack rejected",
        `${candidate.proposedContent.importMetadata?.packName ?? candidate.proposedContent.canonicalProblemTitle ?? candidate.id} was rejected before validation.`
      )
    ]);
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
    // Create ticket records for each bulk-uploaded query
    const bulkRecords: TicketRecord[] = (cluster.items ?? []).map((item) => {
      const bulkTicketId = generateTicketId(organizationProfile);
      const rec = createTicketRecord(bulkTicketId, organizationProfile.id, item.entry.message, item.ticket.subject);
      return {
        ...rec,
        classification: {
          category: item.understanding.category,
          intent: item.understanding.intent ?? "unspecified",
          canonicalProblem: item.canonicalProblem.title,
          classifiedBy: "deterministic" as const,
          confidence: "bulk",
        },
        memoryMatch: { knowledgeId: result.validatedItem.id, matchType: "template" as const, lessonId: null },
        draftSource: "deterministic" as const,
        reflection: {
          decision: prepared.action,
          lessonCreatedId: null,
          lessonReinforcedId: null,
          knowledgeChanged: result.validatedItem.id,
        },
        validationRecordIds: [result.validation.id],
        status: "resolved" as const,
      };
    });
    if (bulkRecords.length > 0) {
      setTicketRecords((prev) => [...prev, ...bulkRecords]);
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
    setActiveTicketRecord(null);
    setIsRetryingDraft(false);
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

  function discardTicket() {
    if (!activeTicketRecord) return;
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(
        "Discard this ticket? It will be marked as discarded and no knowledge will be created. This cannot be undone."
      );
    if (!confirmed) return;

    const updated: TicketRecord = { ...activeTicketRecord, status: "discarded" };
    setTicketRecords((prev) => upsertTicketRecord(prev, updated));
    addLogEntries([
      createLogEntry("Ticket discarded", `${activeTicketRecord.ticketId} discarded by user before reflection commit`)
    ]);
    resetWorkflowState();
    setCurrentStep(0);
  }

  /**
   * F-1: Resume a half-completed ticket from the Cases view.
   *
   * The persisted TicketRecord stores everything required to restore the
   * pipeline at the safe "Human Review" step: classification, memory match,
   * draft source, and the edited reviewed text (if any). We reconstruct the
   * runtime Ticket, aiAnalysis, and re-run the deterministic draft for
   * comparison; the AI advisory draft is not persisted, so the user lands at
   * step 5 (Human Review) with the deterministic draft in the editor.
   *
   * Does NOT re-run classification or memory retrieval — the stored results
   * stand. Only the safe display layer is rebuilt.
   *
   * Refuses to resume resolved / rejected / discarded / open cases. Warns
   * before clobbering a different in-progress workspace.
   */
  function resumeTicketFromRecord(record: TicketRecord) {
    // Only in-review tickets can be resumed.
    if (record.status !== "in_review") return;

    // Warn before clobbering a different in-progress ticket.
    const otherInProgress =
      activeTicketRecord &&
      activeTicketRecord.ticketId !== record.ticketId &&
      currentStep > 0 &&
      currentStep < 8 &&
      activeTicketRecord.status !== "discarded" &&
      activeTicketRecord.status !== "rejected";
    if (otherInProgress) {
      const ok = window.confirm(
        `You have another ticket in progress (${activeTicketRecord!.ticketId}). Switch to ${record.ticketId} anyway?`
      );
      if (!ok) return;
    }

    const subject = record.subject ?? record.rawMessage.slice(0, 80);
    // F-1: extract sender name from the persisted message so the F-2 greeting
    // safety net has something real to substitute.
    const extractedName = extractSenderNameForResume(record.rawMessage);
    const reconstructedTicket: Ticket = {
      id: record.ticketId,
      ticketId: record.ticketId,
      customerName: extractedName ?? "Customer",
      subject,
      description: record.rawMessage,
      category: record.classification?.category ?? "General",
      status: "drafted",
      createdAt: record.createdAt
    };

    // Reconstruct the Understanding from persisted classification. Sender
    // name extraction is preserved when present so the F-2 greeting fix
    // remains effective after a resume.
    const reconstructedUnderstanding: Understanding = {
      ticketId: record.ticketId,
      summary: record.classification?.canonicalProblem ?? record.subject ?? record.rawMessage.slice(0, 80),
      coreProblem: record.classification?.canonicalProblem ?? "Unknown",
      category: record.classification?.category ?? "General",
      intent: record.classification?.intent ?? "unspecified",
      urgency: "medium",
      tags: [],
      detectedSignals: [],
      extractedFields: {
        ...emptyExtractedTicketFields(),
        senderName: extractedName
      }
    };

    // Re-derive similarKnowledge from the persisted knowledgeId when present.
    const restoredKnowledge = record.memoryMatch?.knowledgeId
      ? knowledgeItems.find((k) => k.id === record.memoryMatch!.knowledgeId) ?? null
      : null;
    const reconstructedSimilarKnowledge: KnowledgeMatch[] = restoredKnowledge
      ? [
          {
            item: restoredKnowledge,
            matchScore: 80,
            matchReason: "Restored from case record"
          }
        ]
      : [];

    const draft = draftResponse(
      reconstructedTicket,
      reconstructedUnderstanding,
      reconstructedSimilarKnowledge[0] ?? null,
      organizationProfile,
      knowledgeItems.length === 0
    );

    const reconstructedResponse: SuggestedResponse = {
      ticketId: record.ticketId,
      draftResponse: draft.draftResponse,
      basedOnKnowledgeIds: draft.basedOnKnowledgeIds,
      confidenceNote: draft.confidenceNote,
      source: draft.source,
      draftMode: record.draftSource === "ai_advisory" ? "memory_grounded" : record.memoryMatch?.matchType === "lesson" ? "lesson_grounded" : "memory_grounded",
      groundingLabel: restoredKnowledge?.title ?? "organizational memory"
    };

    const reviewedText =
      record.resolution.finalResponse && record.resolution.finalResponse.trim().length > 0
        ? record.resolution.finalResponse
        : draft.draftResponse;

    setActiveTicketRecord(record);
    setSelectedTicket(reconstructedTicket);
    setAiAnalysis(understandingToAnalysis(reconstructedUnderstanding));
    setSimilarKnowledge(reconstructedSimilarKnowledge);
    setSuggestedResponse(reconstructedResponse);
    setReviewedResponse(reviewedText);
    setObservation(null);
    setReasoning(null);
    setConfidence(null);
    setBusinessRelevance(null);
    setDomainClassification(null);
    setAiAdvisory(null);
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
    setCustomSecondText("");
    setActiveView("tickets");
    setTicketIntakeMode("single");
    setCurrentStep(5); // Human Review
    addLogEntries([
      createLogEntry(
        "Ticket resumed from Cases",
        `${record.ticketId} restored to Human Review with stored classification and edited text`
      )
    ]);
  }

  async function retryAIDraft() {
    if (!selectedTicket || !aiAnalysis || isRetryingDraft) return;
    if (aiAdapter.config.mode === "disabled") return;

    setIsRetryingDraft(true);
    try {
      const und = toUnderstanding(aiAnalysis);
      const canonicalProblem = identifyCanonicalProblem(und, organizationProfile);
      const topMatch = similarKnowledge.length > 0 ? similarKnowledge[0] : null;
      const draft = draftResponse(selectedTicket, und, topMatch, organizationProfile, knowledgeItems.length === 0);
      const aiDraft = await requestDraftAdvisory(
        selectedTicket, und, canonicalProblem.title, topMatch,
        draft.draftResponse, draft.confidenceNote, draft.source ?? "deterministic", aiAdvisory
      );

      if (aiDraft.usedAIDraft) {
        setAiAdvisory(aiDraft.advisory);
        setLastDraftUsedAI(true);
        setSuggestedResponse(aiDraft.response);
        setReviewedResponse(aiDraft.response.draftResponse);
        addLogEntries([createLogEntry("AI draft retry succeeded", "AI advisory draft now available for review")]);
      } else {
        setAiAdvisory(aiDraft.advisory);
        setSuggestedResponse({
          ...aiDraft.response,
          fallbackNotice: "Still unavailable — check that LM Studio is running or configure a Claude API key."
        });
        addLogEntries([createLogEntry("AI draft retry failed", "All AI tiers unavailable")]);
      }
    } finally {
      setIsRetryingDraft(false);
    }
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
    setTicketRecords([]);
    setActiveTicketRecord(null);
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
      return "AI advisory is disabled.";
    }
    if (aiAdapter.config.mode === "amd") {
      return "AMD Cloud placeholder is not implemented yet.";
    }
    return "AI assistant could not be reached.";
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

  function buildDefaultDiagnostics(fallbackReason?: string): AIDiagnostics {
    return {
      mode: aiAdapter.config.mode,
      provider: aiAdapter.provider.label,
      model: aiAdapter.config.model,
      proxyPath: aiAdapter.config.proxyPath,
      endpointUsed: aiAdapter.config.proxyPath,
      proxySucceeded: aiAdapter.config.mode === "disabled" ? false : undefined,
      fallbackReason,
      attempts: aiAdapter.config.mode === "disabled"
        ? [
            {
              label: "AI disabled",
              provider: aiAdapter.provider.label,
              status: "skipped",
              reason: "AI is disabled in configuration."
            }
          ]
        : undefined
    };
  }

  function coalesceDiagnostics(results: Array<AIProviderResult<unknown>>, fallbackReason?: string): AIDiagnostics {
    const firstDiagnostics = results.find((result) => result.diagnostics)?.diagnostics;
    const firstError = results.find((result) => !result.ok)?.error;
    const anySucceeded = results.some((result) => result.diagnostics?.proxySucceeded === true);
    const anyFailed = results.some((result) => result.diagnostics?.proxySucceeded === false);
    const normalizedFallbackReason = firstDiagnostics?.fallbackReason ?? fallbackReason ?? firstError;

    return {
      ...buildDefaultDiagnostics(normalizedFallbackReason),
      ...firstDiagnostics,
      attempts: firstDiagnostics?.attempts,
      proxySucceeded: anySucceeded ? true : anyFailed ? false : firstDiagnostics?.proxySucceeded,
      fallbackReason: normalizedFallbackReason
    };
  }

  function formatFallbackNotice(_fallbackReason?: string, _diagnostics?: AIDiagnostics): string {
    return "AI assistant unavailable — showing standard template instead.";
  }

  function summarizeFallbackReason(reason?: string, providerLabel?: string): string {
    const raw = reason?.trim();
    if (!raw) return "AI advisory unavailable.";
    if (/^(AI assistant unavailable|Still unavailable|AI advisory is disabled|AMD Cloud placeholder)/i.test(raw)) {
      return raw;
    }
    if (/\bfailed:\b/i.test(raw) && raw.length <= 180 && !/[<>]/.test(raw)) {
      return raw;
    }

    const normalizedProvider = providerLabel?.replace(/^AI Chain \((.+)\)$/i, "$1") ?? "AI provider";
    const lower = raw.toLowerCase();
    const status = raw.match(/\bHTTP\s+(\d{3})\b/i)?.[1] ?? raw.match(/\bstatus(?: code)?\s*:?\s*(\d{3})\b/i)?.[1];

    if (normalizedProvider.includes("Remote Gemma") && (lower.includes("ngrok") || lower.includes("<html") || lower.includes("<!doctype"))) {
      return "Remote Gemma failed: ngrok endpoint offline.";
    }

    if (lower.includes("<html") || lower.includes("<!doctype")) {
      return `${normalizedProvider} failed: ${status ? `HTTP ${status} returned an HTML error page.` : "received an HTML error page."}`;
    }

    const plain = raw
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ")
      .trim();
    const truncated = plain.length > 180 ? `${plain.slice(0, 177)}...` : plain;

    if (!providerLabel || truncated === raw) return truncated;
    return `${normalizedProvider} failed: ${truncated}`;
  }

  function buildFallbackTechnicalDetails(fallbackReason?: string, diagnostics?: AIDiagnostics): string {
    const proxyPath = diagnostics?.proxyPath ?? aiAdapter.config.proxyPath;
    const baseUrl = diagnostics?.serverBaseUrl ?? "server-configured";
    const reason = summarizeFallbackReason(
      diagnostics?.fallbackReason ?? fallbackReason,
      diagnostics?.provider ?? aiAdapter.provider.label
    );
    const proxyStatus = diagnostics?.proxySucceeded === true ? "succeeded" : diagnostics?.proxySucceeded === false ? "failed" : "unknown";
    const attempts = diagnostics?.attempts ?? [];
    const attemptSummary = attempts.length > 0
      ? `\nChain attempts:\n${attempts.map((attempt) => `- ${attempt.label} [${attempt.status}]${attempt.reason ? `: ${summarizeFallbackReason(attempt.reason, attempt.provider)}` : ""}`).join("\n")}`
      : "";
    return `Reason: ${reason}\nProxy: ${proxyPath}\nServer base URL: ${baseUrl}\nProxy status: ${proxyStatus}\nMode: ${diagnostics?.mode ?? aiAdapter.config.mode}${attemptSummary}`;
  }

  function validateEmailRecoveryDraft(draft: string): string | null {
    const lower = draft.toLowerCase();
    const forbiddenTerm = EMAIL_RECOVERY_FORBIDDEN_DRAFT_TERMS.find((term) => lower.includes(term));
    if (forbiddenTerm) {
      return `AI draft rejected because it did not match email recovery intent. Found password-focused wording: "${forbiddenTerm}".`;
    }

    const mentionsPasswordReset = lower.includes("password reset") || lower.includes("reset your password");
    const mentionsRecoveryGoal = lower.includes("email") && EMAIL_RECOVERY_VALIDATION_TERMS.some((term) => lower.includes(term));
    if (mentionsPasswordReset && !mentionsRecoveryGoal) {
      return "AI draft rejected because it did not match email recovery intent.";
    }

    if (!mentionsRecoveryGoal) {
      return "AI draft rejected because it did not match email recovery intent.";
    }

    return null;
  }

  function validateActivationDraft(draft: string): string | null {
    const lower = draft.toLowerCase();
    const forbiddenTerm = ACTIVATION_FORBIDDEN_DRAFT_TERMS.find((term) => lower.includes(term));
    if (forbiddenTerm) {
      return `AI draft rejected because it did not match Activation category. Found non-activation wording: "${forbiddenTerm}".`;
    }

    const mentionsActivationTopic = ACTIVATION_ALLOWED_TOPIC_TERMS.some((term) => lower.includes(term));
    if (!mentionsActivationTopic) {
      return "AI draft rejected because it did not match Activation category.";
    }

    const missingRequiredTerms = ACTIVATION_REQUIRED_DRAFT_TERMS.filter((term) => !lower.includes(term));
    if (missingRequiredTerms.length > 0) {
      return `AI draft rejected because it did not match Activation category. Missing activation details: ${missingRequiredTerms.join(", ")}.`;
    }

    return null;
  }

  function stripAllowedSupportSignoff(draft: string, organizationName: string): string {
    const escapedOrganizationName = organizationName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return draft.replace(new RegExp(`\\b${escapedOrganizationName}\\s+support\\s+team\\b`, "gi"), "");
  }

  function findUnsupportedPattern(
    text: string,
    rules: Array<{ label: string; pattern: RegExp }>,
    groundedText: string
  ): string | null {
    for (const rule of rules) {
      if (rule.pattern.test(text) && !rule.pattern.test(groundedText)) {
        return rule.label;
      }
    }
    return null;
  }

  function validateNoUnvalidatedCommitments(draft: string, context: DraftSafetyContext): string | null {
    const draftWithoutSignoff = stripAllowedSupportSignoff(draft, context.organizationName);
    const groundedText = context.groundingContent;

    const unsupportedProcess = findUnsupportedPattern(
      draftWithoutSignoff,
      UNVALIDATED_PROCESS_REFERENCES,
      groundedText
    );
    if (unsupportedProcess) {
      return `AI draft invented an unsupported organization process or role: "${unsupportedProcess}".`;
    }

    const unsupportedTimeline = findUnsupportedPattern(
      draftWithoutSignoff,
      UNGROUNDED_TIMELINE_REFERENCES,
      groundedText
    );
    if (unsupportedTimeline) {
      return `AI draft committed to an unsupported timeline: "${unsupportedTimeline}".`;
    }

    const unsupportedOutcome = findUnsupportedPattern(draftWithoutSignoff, OUTCOME_COMMITMENT_RULES, groundedText);
    if (unsupportedOutcome) {
      return `AI draft made an unsupported commitment: ${unsupportedOutcome}.`;
    }

    return null;
  }

  function getAIDraftRejectionReason(
    understanding: Understanding,
    result: AIProviderResult<{ draftResponse: string; confidence: number }>,
    context: DraftSafetyContext
  ): string | null {
    const draft = result.data?.draftResponse?.trim();
    if (!result.ok || !draft) return result.error ?? "AI draft was empty.";
    const lower = draft.toLowerCase();
    if (lower.includes("internal guidance") || lower.includes("root cause hypothesis")) {
      return "AI draft included internal-only guidance.";
    }
    const commitmentViolation = validateNoUnvalidatedCommitments(draft, context);
    if (commitmentViolation) {
      return commitmentViolation;
    }
    if (understanding.category === "Activation") {
      return validateActivationDraft(draft);
    }
    if (understanding.intent === "email_recovery") {
      return validateEmailRecoveryDraft(draft);
    }
    return null;
  }

  function isUsableAIDraft(
    understanding: Understanding,
    result: AIProviderResult<{ draftResponse: string; confidence: number }>,
    context: DraftSafetyContext
  ): boolean {
    return getAIDraftRejectionReason(understanding, result, context) === null;
  }

  function createAIStatusLogEntry(advisory: AIAdvisory): IntelligenceLogEntry {
    const detail = [
      `${advisory.providerLabel}: ${advisory.status} · Agreement ${advisory.agreementPct}%`,
      `Mode ${advisory.diagnostics.mode}`,
      `Proxy ${advisory.diagnostics.proxyPath}`,
      `Base ${advisory.diagnostics.serverBaseUrl ?? "server-configured"}`,
      advisory.diagnostics.proxySucceeded === true ? "Proxy succeeded" : advisory.diagnostics.proxySucceeded === false ? "Proxy failed" : "",
      advisory.diagnostics.fallbackReason ? `Fallback: ${advisory.diagnostics.fallbackReason}` : ""
    ].filter(Boolean).join(" · ");

    return createLogEntry("AI advisory status", detail);
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
    deterministicUnderstanding: ReturnType<typeof understandForProfile>,
    matchedLesson?: LessonMatchResult | null
  ): Promise<KnowledgeMatch | null> {
    const validatedLessonMatch: LessonMatchResult | null =
      matchedLesson && isStrongLessonMatch(matchedLesson) ? matchedLesson : null;
    const validatedLessonLabel = validatedLessonMatch
      ? validatedLessonMatch.lesson.title ?? validatedLessonMatch.lesson.rootCause ?? "validated lesson"
      : null;
    const validationPayload = validatedLessonMatch ? buildDiscriminationLessonPayload(validatedLessonMatch) : undefined;

    if (validatedLessonMatch && validatedLessonLabel) {
      setDiscriminationReasoning(null);
      setDiscriminatedMatchTitle(null);
      addLogEntries([
        createLogEntry(
          "Lesson match accepted without broad discrimination",
          `"${validatedLessonLabel}" is a strong validated lesson match for this ticket`
        )
      ]);
      return topMatch;
    }

    if (aiAdapter.config.mode === "disabled") return topMatch;

    const result = await aiAdapter.provider.discriminateMatch({
      ticket,
      matchedCanonicalTitle: validatedLessonLabel
        ? validatedLessonLabel ?? topMatch.item.canonicalProblemTitle ?? topMatch.item.title
        : topMatch.item.canonicalProblemTitle ?? topMatch.item.title,
      matchedProblemSummary: validationPayload
        ? validationPayload.rootCause
        : topMatch.item.problemSummary ?? topMatch.item.problem,
      matchedLesson: validationPayload,
      deterministicUnderstanding
    });

    recordAIResults([result]);

    if (result.ok && result.data) {
      const { isDistinctFromMatch, confidence, reasoning } = result.data;
      if (isDistinctFromMatch && confidence !== "low") {
        const matchTitle = validatedLessonLabel
          ? validatedLessonLabel ?? topMatch.item.canonicalProblemTitle ?? topMatch.item.title
          : topMatch.item.canonicalProblemTitle ?? topMatch.item.title;
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
          `"${validatedLessonLabel ?? topMatch.item.canonicalProblemTitle ?? topMatch.item.title}" confirmed as same problem (${confidence} confidence)`
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
        availabilityMessage: defaultAvailabilityMessage(),
        diagnostics: buildDefaultDiagnostics(defaultAvailabilityMessage())
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
        : summarizeFallbackReason(
            analysisResult.error || canonicalResult.error || defaultAvailabilityMessage(),
            analysisResult.providerLabel || canonicalResult.providerLabel || aiAdapter.provider.label
          );
    const diagnostics = coalesceDiagnostics([analysisResult, canonicalResult], availabilityMessage);

    const advisory = buildAIAdvisory({
      ticketId: ticket.id,
      providerMode: aiAdapter.config.mode,
      providerLabel: aiAdapter.provider.label,
      model: aiAdapter.config.model,
      deterministicLabel: canonicalProblem.title,
      analysisSuggestion: analysisResult.ok ? analysisResult.data : undefined,
      canonicalSuggestion: canonicalResult.ok ? canonicalResult.data : undefined,
      availabilityMessage: diagnostics.fallbackReason,
      diagnostics
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
        ? lessonMatch?.lesson.title ?? lessonMatch?.lesson.rootCause ?? "matched lesson"
        : draftMode === "memory_grounded"
        ? matchedKnowledge?.item.canonicalProblemTitle ?? matchedKnowledge?.item.title ?? "organizational memory"
        : "no organizational knowledge";
    const groundingContent =
      draftMode === "lesson_grounded"
        ? lessonMatch
          ? normalizeReusableLessonTemplate(lessonMatch.lesson.customerResponse)
          : deterministicDraft
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
          fallbackNotice: formatFallbackNotice(defaultAvailabilityMessage(), baseAdvisory?.diagnostics),
          fallbackTechnicalDetails: buildFallbackTechnicalDetails(defaultAvailabilityMessage(), baseAdvisory?.diagnostics)
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
            customerResponse: normalizeReusableLessonTemplate(lessonMatch.lesson.customerResponse),
            matchedSignals: lessonMatch.matchedSignals,
            doNotPromise: lessonMatch.lesson.doNotPromise
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

    const diagnostics = coalesceDiagnostics(
      [draftResult, enrichmentResult],
      draftResult.ok || enrichmentResult.ok
        ? undefined
        : summarizeFallbackReason(
            draftResult.error || enrichmentResult.error || defaultAvailabilityMessage(),
            draftResult.providerLabel || enrichmentResult.providerLabel || aiAdapter.provider.label
          )
    );
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
          : diagnostics.fallbackReason,
      diagnostics
    });

    recordAIResults([draftResult, enrichmentResult], nextAdvisory.status, nextAdvisory.agreementPct);

    if (draftMode === "lesson_grounded") {
      return {
        advisory: nextAdvisory,
        response: fallbackResponse,
        usedAIDraft: false
      };
    }

    const draftSafetyContext: DraftSafetyContext = {
      draftMode,
      groundingContent,
      organizationName: organizationProfile.name
    };
    const draftRejectionReason = getAIDraftRejectionReason(understanding, draftResult, draftSafetyContext);

    if (draftRejectionReason === null && isUsableAIDraft(understanding, draftResult, draftSafetyContext)) {
      // F-7: deterministic post-processing guard so every AI grounding mode
      // (lesson_grounded / memory_grounded / cold_start) ends with the same
      // ticket reference line. Mirrors the !draft.includes() guard in
      // lib/drafting.ts so the LLM cannot forget it.
      // F-2: deterministic greeting safety net — substitute personalized
      // greeting if the AI used a bare "Hello," / "Hi," despite the prompt
      // instruction. Sender name is sourced from understanding.extractedFields,
      // which is populated deterministically and (when available) by the AI
      // analysis call.
      const senderName = understanding.extractedFields?.senderName ?? null;
      const greeted = personalizeAIDraftGreeting(
        draftResult.data!.draftResponse,
        senderName,
        organizationProfile.customerTone
      );
      const aiDraft = appendTicketReference(greeted, ticket.ticketId);
      return {
        advisory: nextAdvisory,
        usedAIDraft: true,
        response: {
          ticketId: ticket.id,
          draftResponse: aiDraft,
          basedOnKnowledgeIds: matchedKnowledge ? [matchedKnowledge.item.id] : [],
          confidenceNote: `${draftModeLabel(draftMode, groundingLabel)} (${draftResult.data!.confidence}% confidence). Human review is required before sending or learning.`,
          source: "ai_advisory",
          draftMode,
          groundingLabel,
          providerLabel: draftResult.providerLabel,
          // Raw validated template preserved for side-by-side comparison in human review
          deterministicDraft: draftMode === "cold_start" ? undefined : deterministicDraft
        }
      };
    }

    if (draftRejectionReason && draftResult.ok) {
      const rejectionEvent = draftRejectionReason.includes("Activation category")
        ? "AI draft rejected because it did not match Activation category."
        : draftRejectionReason.includes("email recovery intent")
        ? "AI draft rejected because it did not match email recovery intent."
        : draftRejectionReason.includes("unsupported")
        ? "AI draft rejected because it made unsupported commitments."
        : "AI draft rejected.";
      addLogEntries([
        createLogEntry(
          rejectionEvent,
          draftRejectionReason
        )
      ]);
    }

    return {
      advisory: {
        ...nextAdvisory,
        diagnostics: {
          ...nextAdvisory.diagnostics,
          fallbackReason: draftRejectionReason ?? nextAdvisory.diagnostics.fallbackReason
        }
      },
      response: {
        ...fallbackResponse,
        fallbackNotice: formatFallbackNotice(
          draftRejectionReason ?? draftResult.error ?? enrichmentResult.error ?? defaultAvailabilityMessage(),
          nextAdvisory.diagnostics
        ),
        fallbackTechnicalDetails: buildFallbackTechnicalDetails(
          draftRejectionReason ?? draftResult.error ?? enrichmentResult.error ?? defaultAvailabilityMessage(),
          nextAdvisory.diagnostics
        )
      },
      usedAIDraft: false
    };
  }

  async function analyzeTicket(ticket: Ticket) {
    setErrorMessage("");
    setDiscriminationReasoning(null);
    setDiscriminatedMatchTitle(null);
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
    const advisory = await requestAnalysisAdvisory(ticket, und, {
      title: canonicalProblem.title,
      problemSummary: canonicalProblem.problemSummary,
      category: canonicalProblem.category
    });
    const enrichedUnderstanding = applyAdvisoryExtractedFields(und, advisory);
    const analysis = understandingToAnalysis(enrichedUnderstanding);

    const logEntries = [
      ...createRelevanceLogEntries(relevance),
      createLogEntry("Observed ticket input", `Source: ${source} · Ticket: ${ticket.id}`),
      createLogEntry(`Extracted category: ${enrichedUnderstanding.category}`, `Urgency: ${enrichedUnderstanding.urgency} · Tags: ${enrichedUnderstanding.tags.join(", ")}`),
      createLogEntry("Canonical problem proposed", `${canonicalProblem.title} · ${canonicalProblem.problemSummary}`),
      enrichedUnderstanding.detectedSignals.length > 0
        ? createLogEntry(`Detected signals: ${enrichedUnderstanding.detectedSignals.join(", ")}`)
        : createLogEntry("Signal detection: no strong signals found")
    ];

    setObservation(obs);
    setAiAnalysis(analysis);
    setAiAdvisory(advisory);
    setSelectedTicket({ ...ticket, status: "analyzed" });
    addLogEntries(logEntries);
    addLogEntries([createAIStatusLogEntry(advisory)]);
    updateMetrics({ ticketsProcessed: 1 });
    setCurrentStep(2);
  }

  function findSimilarKnowledge(analysis: AIAnalysis, items: KnowledgeItem[] = knowledgeItems) {
    setErrorMessage("");
    const und = toUnderstanding(analysis);
    const canonicalProblem = identifyCanonicalProblem(und, organizationProfile);
    const matches = withPreDiscriminationLessonMatches(
      selectedTicket ?? makeCustomTicket(analysis.summary, analysis.ticketId),
      und,
      retrieveMemory(und, items, sessionCreatedIds),
      items,
      canonicalProblem.title
    );
    const compatibleMatches = matches.filter((m) => isCompatibleForDrafting(und, m.item) || !!findMatchingLesson(selectedTicket ?? makeCustomTicket(analysis.summary, analysis.ticketId), m.item));
    const selectedMatchInfo =
      compatibleMatches.length > 0
        ? selectPreferredMatch(selectedTicket ?? makeCustomTicket(analysis.summary, analysis.ticketId), compatibleMatches)
        : null;
    const topMatch = selectedMatchInfo?.match ?? (matches.length > 0 ? matches[0] : null);
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

    setSimilarKnowledge(topMatch ? moveMatchToFront(matches, topMatch.item.id) : matches);
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
    const canonicalProblem = identifyCanonicalProblem(und, organizationProfile);
    const lessonAwareMatches = withPreDiscriminationLessonMatches(ticket, und, matches, knowledgeItems, canonicalProblem.title);
    const compatibleMatches = lessonAwareMatches.filter((m) => isCompatibleForDrafting(und, m.item) || !!findMatchingLesson(ticket, m.item));
    const selectedMatchInfo = compatibleMatches.length > 0 ? selectPreferredMatch(ticket, compatibleMatches) : null;
    const topMatch = selectedMatchInfo?.match ?? null;
    const lessonMatch = selectedMatchInfo?.lessonMatch ?? null;

    // LLM discrimination: confirm the top match describes the same problem, not a distinct one
    setDiscriminationReasoning(null);
    setDiscriminatedMatchTitle(null);
    const effectiveTopMatch = topMatch
      ? await requestMatchDiscrimination(ticket, topMatch, und, lessonMatch ?? undefined)
      : null;
    const resolvedMatches = effectiveTopMatch
      ? moveMatchToFront(lessonAwareMatches, effectiveTopMatch.item.id)
      : topMatch
      ? stripRejectedMatch(lessonAwareMatches, topMatch.item.id)
      : lessonAwareMatches;

    const draft = draftResponse(ticket, und, effectiveTopMatch, organizationProfile, knowledgeItems.length === 0);
    const aiDraft = await requestDraftAdvisory(ticket, und, canonicalProblem.title, effectiveTopMatch, draft.draftResponse, draft.confidenceNote, draft.source ?? "deterministic", aiAdvisory);
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
    setSimilarKnowledge(resolvedMatches);
    setSuggestedResponse(response);
    setReviewedResponse(response.source === "no_template" ? "" : response.draftResponse);
    setSelectedTicket({ ...ticket, status: "drafted" });
    setCurrentStep(4);
  }

  function updateReviewedResponse(value: string) {
    setReviewedResponse(value);
  }

  function resolveDraftSourceMatch(): KnowledgeMatch | null {
    const groundedKnowledgeId = suggestedResponse?.basedOnKnowledgeIds[0];
    if (groundedKnowledgeId) {
      const exactMatch = similarKnowledge.find((match) => match.item.id === groundedKnowledgeId);
      if (exactMatch) return exactMatch;

      const groundedItem = knowledgeItems.find((item) => item.id === groundedKnowledgeId);
      if (groundedItem) {
        return {
          item: groundedItem,
          matchScore: similarKnowledge[0]?.item.id === groundedKnowledgeId ? similarKnowledge[0].matchScore : 80,
          matchReason: "Derived from the rendered draft source."
        };
      }
    }

    return similarKnowledge[0] ?? null;
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
    const draftedMatch = resolveDraftSourceMatch();
    const existingMatch = draftedMatch
      ? {
          item: draftedMatch.item,
          similarity: draftedMatch.matchScore,
          reason: draftedMatch.matchReason
        }
      : null;
    const matchedLesson =
      draftedMatch && suggestedResponse?.draftMode === "lesson_grounded"
        ? findMatchingLesson(selectedTicket, draftedMatch.item)?.lesson ?? null
        : null;
    const reflection = generateReflection(und, reviewedResponse, existingMatch, {
      draftMode: suggestedResponse?.draftMode,
      matchedLesson
    });
    setReflectionDecision(reflection);

    // Update ticket record with resolution
    if (activeTicketRecord) {
      const originalDraft = suggestedResponse?.draftResponse ?? "";
      const humanEdited = reviewedResponse !== originalDraft;
      const editNote = humanEdited ? computeEditDistance(originalDraft, reviewedResponse) : null;
      const updated: TicketRecord = {
        ...activeTicketRecord,
        resolution: {
          finalResponse: reviewedResponse,
          humanEdited,
          editDistanceNote: editNote,
          resolvedAt: new Date().toISOString(),
        },
      };
      setActiveTicketRecord(updated);
      setTicketRecords((prev) => upsertTicketRecord(prev, updated));
    }

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
    const normalizedCustomerResponse = normalizeReusableLessonTemplate(lessonDraft.customerResponse);

    if (lessonDraft.mode === "new") {
      const lesson: Lesson = {
        id: `lesson-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        rootCause: lessonDraft.rootCause,
        solution: lessonDraft.solution,
        customerResponse: normalizedCustomerResponse,
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
            ? { ...l, rootCause: lessonDraft.rootCause, solution: lessonDraft.solution, customerResponse: normalizedCustomerResponse, signals: lessonDraft.signals }
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
        // Lesson-grounded drafts and explicit lesson edits both live in lessons[] and
        // must never overwrite the parent knowledge item's generic customer template.
        // Only a direct edit to the generic template path creates a new version.
        const isLessonGroundedDraft = suggestedResponse?.draftMode === "lesson_grounded";
        const updatesGenericTemplate = !isLessonGroundedDraft && !lessonDraft;
        const newVersionNum = (base.knowledgeVersions?.length ?? 0) + 1;
        const candidate = createCandidate({
          action: "create_version",
          sourceTicketIds: [selectedTicket.id],
          solution: und.coreProblem,
          customerResponseTemplate: updatesGenericTemplate ? reviewedResponse : (base.customerResponseTemplate ?? base.approvedAnswer),
          internalGuidance: base.internalGuidance ?? und.summary,
          canonicalProblemTitle: base.canonicalProblemTitle ?? base.title,
          category: base.category,
          relatedKnowledgeId: base.id,
          rationale: reflectionDecision.rationale,
          createdAt: now
        });
        let evolved: KnowledgeItem = {
          ...base,
          ...(updatesGenericTemplate
            ? { customerResponseTemplate: reviewedResponse, approvedAnswer: reviewedResponse }
            : {}),
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
          knowledgeVersions: updatesGenericTemplate
            ? [
                ...(base.knowledgeVersions ?? []),
                {
                  versionId: `${base.canonicalProblemId}-v${newVersionNum}`,
                  version: newVersionNum,
                  createdAt: now,
                  changeReason: reflectionDecision.versionReason ?? "Human review introduced an improved response",
                  sourceTicketId: selectedTicket.id,
                  summary: `v${newVersionNum}: Updated customer response template`
                }
              ]
            : base.knowledgeVersions ?? [],
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
        if (updatesGenericTemplate) {
          setOrgMetrics((prev) => ({
            ...prev,
            knowledgeVersions: (prev.knowledgeVersions ?? 0) + 1,
            lastUpdatedAt: now
          }));
        }
        updateMetrics({
          humanApprovedResponses: 1,
          canonicalProblemsTouched: 1,
          ...(updatesGenericTemplate ? { knowledgeVersionsCreated: 1 } : {})
        });
        const versionLogEntries = updatesGenericTemplate
          ? [
              createLogEntry("Knowledge candidate validated", `Candidate ${candidate.id} approved by Prototype Knowledge Validator`),
              createLogEntry("Reflection confirmed: knowledge evolved", `"${base.canonicalProblemTitle}" → v${newVersionNum}`),
              createLogEntry("New version recorded", reflectionDecision.versionReason ?? "Improved response approach")
            ]
          : [
              createLogEntry("Knowledge candidate validated", `Candidate ${candidate.id} approved by Prototype Knowledge Validator`),
              createLogEntry(
                "Reflection confirmed: lesson-backed draft preserved",
                `"${base.canonicalProblemTitle}" kept its generic template while lesson-grounded knowledge was confirmed`
              )
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

    // Update ticket record with reflection outcome and resolve
    if (activeTicketRecord) {
      const lessonCreated = lessonDraft?.mode === "new"
        ? knowledgeItems.find((k) => k.id === lastSavedKnowledgeId)?.lessons?.at(-1)?.id ?? null
        : null;
      const lessonReinforced = lessonDraft?.mode === "improves_existing" ? lessonDraft.existingLessonId ?? null : null;
      const updated: TicketRecord = {
        ...activeTicketRecord,
        reflection: {
          decision: reflectionDecision.action,
          lessonCreatedId: lessonCreated,
          lessonReinforcedId: lessonReinforced,
          knowledgeChanged: lastSavedKnowledgeId,
        },
        validationRecordIds: validationRecords
          .filter((v) => v.candidateId && knowledgeCandidates.some(
            (c) => c.id === v.candidateId && c.sourceTicketIds.includes(selectedTicket.id)
          ))
          .map((v) => v.id),
        status: "resolved",
      };
      setActiveTicketRecord(updated);
      setTicketRecords((prev) => upsertTicketRecord(prev, updated));
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
    const enrichedUnderstanding = applyAdvisoryExtractedFields(und, advisory);
    const matches = withPreDiscriminationLessonMatches(
      second,
      enrichedUnderstanding,
      retrieveMemory(enrichedUnderstanding, knowledgeItems, sessionCreatedIds),
      knowledgeItems,
      canonicalProblem.title
    );

    // Among the strongly-relevant matches, the organization reaches for its
    // MOST TRUSTED knowledge — that is what enables auto-resolution over time.
    // Category-incompatible items are excluded before the trust-based selection so
    // a high-trust Activation item cannot drive a Login ticket's reuse response.
    const compatibleMatches = matches.filter((m) => isCompatibleForDrafting(enrichedUnderstanding, m.item) || !!findMatchingLesson(second, m.item));
    const selectedMatchInfo = compatibleMatches.length > 0 ? selectPreferredMatch(second, compatibleMatches) : null;
    const reusedMatch = selectedMatchInfo?.match ?? null;
    const reusedLessonMatch = selectedMatchInfo?.lessonMatch ?? null;

    // Cold Start path: no matches or no compatible matches → route to human review
    if (matches.length === 0 || !reusedMatch) {
      const coldStartDraft = draftResponse(second, enrichedUnderstanding, null, organizationProfile, knowledgeItems.length === 0);
      const secondAnalysis = understandingToAnalysis(enrichedUnderstanding);
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
    const trust = evaluateTrust(reusedMatch.item, organizationProfile, validationRecords);
    // LLM discrimination on the reuse candidate — prevents false-positive memory reuse
    setDiscriminationReasoning(null);
    setDiscriminatedMatchTitle(null);
    const effectiveReuseMatch = reusedLessonMatch && isStrongLessonMatch(reusedLessonMatch)
      ? reusedMatch
      : await requestMatchDiscrimination(second, reusedMatch, enrichedUnderstanding, reusedLessonMatch ?? undefined);

    // If discrimination says this is a distinct problem, treat as cold-start (no match)
    if (!effectiveReuseMatch) {
      const coldStartDraft = draftResponse(second, enrichedUnderstanding, null, organizationProfile);
      const secondAnalysis = understandingToAnalysis(enrichedUnderstanding);
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

    const draft = draftResponse(second, enrichedUnderstanding, effectiveReuseMatch, organizationProfile);
    const aiDraft = await requestDraftAdvisory(second, enrichedUnderstanding, canonicalProblem.title, effectiveReuseMatch, draft.draftResponse, draft.confidenceNote, draft.source ?? "deterministic", advisory);
    const draftSource = aiDraft.response.source ?? "deterministic";
    const isUnknownIssue = enrichedUnderstanding.category === "Uncategorized" || enrichedUnderstanding.category === "General";
    const effectiveReuseDecision: TrustDecision =
      isUnknownIssue ? "human_required"
      : draftSource === "ai_advisory" && trust.decision === "auto_resolution" ? "human_required"
      : trust.decision;
    const secondAnalysis = understandingToAnalysis(enrichedUnderstanding);

    setSecondTicket({ ...second, status: "analyzed" });
    setAiAnalysis(secondAnalysis);
    setAiAdvisory(aiDraft.advisory ?? advisory);
    setSimilarKnowledge(moveMatchToFront(matches, effectiveReuseMatch.item.id));
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
      createLogEntry(`Category detected: ${enrichedUnderstanding.category}`, `Tags: ${enrichedUnderstanding.tags.join(", ")}`),
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
    const tId = generateTicketId(organizationProfile);
    const ticket = makeCustomTicket(text.trim(), tId);
    setSelectedTicket(ticket);
    setCurrentStep(1);

    // Create ticket record at submission
    let record = createTicketRecord(tId, organizationProfile.id, text.trim(), ticket.subject);
    setActiveTicketRecord(record);
    setTicketRecords((prev) => upsertTicketRecord(prev, record));

    // Phase 1: Analysis
    const relevance = assessBusinessRelevanceForProfile(`${ticket.subject} ${ticket.description}`, organizationProfile);
    setBusinessRelevance(relevance);
    addLogEntries(createRelevanceLogEntries(relevance));

    if (!relevance.isRelevant && relevance.status === "out_of_scope") {
      setErrorMessage(`Rejected by Business Relevance Guardrail: ${relevance.reason}`);
      record = { ...record, status: "rejected" };
      setActiveTicketRecord(record);
      setTicketRecords((prev) => upsertTicketRecord(prev, record));
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
    const advisory = await requestAnalysisAdvisory(ticket, und, {
      title: canonicalProblem.title,
      problemSummary: canonicalProblem.problemSummary,
      category: canonicalProblem.category
    });
    const enrichedUnderstanding = applyAdvisoryExtractedFields(und, advisory);
    const analysis = understandingToAnalysis(enrichedUnderstanding);

    // Update record with classification
    record = {
      ...record,
      classification: {
        category: enrichedUnderstanding.category,
        intent: enrichedUnderstanding.intent ?? "unspecified",
        canonicalProblem: canonicalProblem.title,
        classifiedBy: "deterministic",
        confidence: domain.confidence,
      },
    };
    setActiveTicketRecord(record);
    setTicketRecords((prev) => upsertTicketRecord(prev, record));

    setObservation(obs);
    setAiAnalysis(analysis);
    setAiAdvisory(advisory);
    setSelectedTicket({ ...ticket, status: "analyzed" });
    addLogEntries([
      createLogEntry("Observed ticket input", `Ticket: ${tId}`),
      createLogEntry(`Extracted category: ${enrichedUnderstanding.category}`, `Urgency: ${enrichedUnderstanding.urgency}`),
      createLogEntry("Canonical problem proposed", canonicalProblem.title),
    ]);
    updateMetrics({ ticketsProcessed: 1 });
    setCurrentStep(2);

    // Phase 2: Memory retrieval
    const matches = withPreDiscriminationLessonMatches(
      ticket,
      enrichedUnderstanding,
      retrieveMemory(enrichedUnderstanding, knowledgeItems, sessionCreatedIds),
      knowledgeItems,
      canonicalProblem.title
    );
    const compatibleMatches = matches.filter((m) => isCompatibleForDrafting(enrichedUnderstanding, m.item) || !!findMatchingLesson(ticket, m.item));
    const selectedMatchInfo = compatibleMatches.length > 0 ? selectPreferredMatch(ticket, compatibleMatches) : null;
    const topMatch = selectedMatchInfo?.match ?? null;
    const lessonMatchForRecord = selectedMatchInfo?.lessonMatch ?? null;
    const newReasoning = buildReasoning(enrichedUnderstanding, topMatch);
    const newConfidence = buildConfidence(enrichedUnderstanding, topMatch);
    const topTrust = topMatch ? evaluateTrust(topMatch.item, organizationProfile, validationRecords) : null;

    record = {
      ...record,
      memoryMatch: {
        knowledgeId: topMatch?.item.id ?? null,
        matchType: lessonMatchForRecord ? "lesson" : topMatch ? "template" : "none",
        lessonId: lessonMatchForRecord?.lesson.id ?? null,
      },
    };
    setActiveTicketRecord(record);
    setTicketRecords((prev) => upsertTicketRecord(prev, record));

    setSimilarKnowledge(topMatch ? moveMatchToFront(matches, topMatch.item.id) : []);
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
      ? await requestMatchDiscrimination(ticket, topMatch, und, lessonMatchForRecord ?? undefined)
      : null;
    if (topMatch && !effectiveTopMatch) {
      // Discrimination rejected the retrieval match as a distinct problem.
      // The Organizational Memory panel and pipeline "memory found"/"trust"
      // steps read similarKnowledge[0] (see TicketWorkspace.tsx) — without
      // this, they kept showing the rejected match while the draft correctly
      // treated the ticket as unmatched, producing a contradictory UI state.
      setSimilarKnowledge((prev) => stripRejectedMatch(prev, topMatch.item.id));
    }
    const draft = draftResponse(ticket, enrichedUnderstanding, effectiveTopMatch, organizationProfile, knowledgeItems.length === 0);
    const aiDraft = await requestDraftAdvisory(ticket, enrichedUnderstanding, canonicalProblem.title, effectiveTopMatch, draft.draftResponse, draft.confidenceNote, draft.source ?? "deterministic", advisory);
    const response = aiDraft.response;

    // Update record with draft source and move to in_review
    record = {
      ...record,
      draftSource: response.source as TicketRecord["draftSource"],
      status: "in_review",
    };
    setActiveTicketRecord(record);
    setTicketRecords((prev) => upsertTicketRecord(prev, record));

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
                  aiModeEnabled={aiAdapter.config.mode !== "disabled"}
                  isRetryingDraft={isRetryingDraft}
                  onDiscardTicket={discardTicket}
                  onRetryAIDraft={() => { void retryAIDraft(); }}
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

          {activeView === "cases" && (
            <CaseLookupView
              ticketRecords={ticketRecords}
              knowledgeItems={knowledgeItems}
              darkMode={darkMode}
              onNavigateToKnowledge={(knowledgeId) => {
                setActiveView("knowledge");
              }}
              onNavigate={setActiveView}
              onResumeTicket={resumeTicketFromRecord}
            />
          )}

          {activeView === "knowledge" && (
            <KnowledgeView
              knowledgeItems={knowledgeItems}
              knowledgeCandidates={knowledgeCandidates}
              emergingPatterns={emergingPatterns}
              validationRecords={validationRecords}
              memoryChangeRecords={memoryChangeRecords}
              darkMode={darkMode}
              orgId={organizationProfile.id}
              onPromote={promotePattern}
              onImportPack={importKnowledgePack}
              onValidatePackCandidate={validateKnowledgePackCandidate}
              onRejectPackCandidate={rejectKnowledgePackCandidate}
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





