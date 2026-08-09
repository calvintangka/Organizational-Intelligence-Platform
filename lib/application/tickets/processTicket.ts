import { assessBusinessRelevanceForProfile, routeBusinessInquiryUnderstanding, understandForProfile } from "@/lib/analyzer";
import { buildAIAdvisory } from "@/lib/ai/deterministic";
import type { AIAdapter, AIProviderResult } from "@/lib/ai/types";
import { evaluateSemanticLessonCompatibility } from "@/lib/ai/semanticCompatibility";
import { classifyBusinessDomain } from "@/lib/domainClassifier";
import { draftBusinessInquiryResponse, draftResponse, findMatchingLesson, isRetrievalCandidateEligible, ticketContradictsLesson } from "@/lib/drafting";
import type { LessonMatchResult, SemanticLessonAuthorization } from "@/lib/drafting";
import { retrieveMemory } from "@/lib/memory";
import {
  buildDiscriminationLessonPayload,
  isStrongLessonMatch,
  selectPreferredMatch,
  withPreDiscriminationLessonMatches
} from "@/lib/lessonSelection";
import { createTicketRecord } from "@/lib/ticketRecords";
import type { OrganizationPersistenceSession } from "@/lib/persistence/session";
import { resolveLanguagePolicy, resolveResponseLanguage } from "@/lib/languagePolicy";
import { detectLanguage, isSupportedLanguage } from "@/lib/languageDetection";
import { hasSpecificCanonicalMatch } from "@/lib/patternDiscovery";
import { identifyCanonicalProblem } from "@/lib/canonicalProblemEngine";
import { startTelemetrySpan } from "@/lib/telemetry";
import { securityIncidentDraft } from "@/lib/intentIsolation";
import { validateExtractedTicketFields } from "@/lib/customerContext";
import type {
  AIDiagnostics,
  AIAdvisory,
  AIAnalysis,
  BusinessDomainClassification,
  BusinessRelevance,
  DraftGroundingMode,
  KnowledgeItem,
  KnowledgeMatch,
  OrganizationProfile,
  SuggestedResponse,
  Ticket,
  TicketRecord,
  Understanding
} from "@/types";
import type { ExtractedTicketFields } from "@/types/oip";

export type ProcessingStage = "received" | "persisted" | "analyzing" | "retrieved" | "drafted" | "in_review" | "failed" | "cancelled";

export type ProcessTicketErrorClass =
  | "invalid_input"
  | "authorization_mismatch"
  | "persistence_failure"
  | "persistence_conflict"
  | "provider_timeout"
  | "provider_unavailable"
  | "provider_malformed_output"
  | "cancelled"
  | "permanent_analysis_failure"
  | "transient_infrastructure_failure"
  | "idempotency_conflict"
  | "unexpected_failure";

export interface ActorContext {
  id?: string;
  name?: string;
  email?: string;
}

export interface TicketInput {
  subject?: string;
  description: string;
  customerName?: string;
  sender?: { name?: string; email?: string; role?: string };
  source?: string;
  externalReference?: string;
  intakeMode?: "single" | "bulk";
  createdAt?: string;
}

export interface ProcessTicketCommand {
  organizationId: string;
  actorContext: ActorContext;
  authority: "local" | "server";
  requestId: string;
  idempotencyKey?: string;
  ticketInput: TicketInput;
  organizationProfile: OrganizationProfile;
  processingOptions?: {
    knowledgeItems?: KnowledgeItem[];
    sessionCreatedIds?: Set<string>;
    aiAdapter?: AIAdapter;
  };
  signal?: AbortSignal;
}

export interface ProcessTicketFailure {
  requestId: string;
  stage: ProcessingStage;
  errorClass: ProcessTicketErrorClass;
  retryable: boolean;
  providerStatus?: string;
  persistedTicket?: TicketRecord | null;
  safeMessage: string;
  diagnosticMetadata?: Record<string, string | number | boolean | undefined>;
}

export class ProcessTicketError extends Error {
  readonly failure: ProcessTicketFailure;

  constructor(failure: ProcessTicketFailure, cause?: unknown) {
    super(failure.safeMessage, cause ? { cause } : undefined);
    this.name = "ProcessTicketError";
    this.failure = failure;
  }
}

export interface ProcessTicketFollowUp {
  type: "pattern_discovery_requested";
  ticketId: string;
  reason: "no_specific_canonical_match";
}

export interface ProcessTicketResult {
  requestId: string;
  ticket: Ticket;
  persistedTicket: TicketRecord;
  understanding: Understanding;
  analysis: AIAnalysis;
  language: ReturnType<typeof resolveTicketLanguage>;
  businessIntent: Understanding["businessClassification"];
  businessRelevance: BusinessRelevance;
  domainClassification: BusinessDomainClassification;
  canonicalSelection: { title: string; problemSummary: string; category: string };
  memoryMatch: KnowledgeMatch | null;
  lessonMatch: LessonMatchResult | null;
  providerDiagnostics: AIDiagnostics;
  advisory: AIAdvisory;
  draft: SuggestedResponse;
  reviewState: "in_review";
  processingState: "in_review";
  auditSummary: { organizationId: string; actorId?: string; requestId: string; idempotencyKey?: string };
  telemetrySummary: { requestId: string; stages: string[] };
  persisted: true;
  replayed: boolean;
  followUp: ProcessTicketFollowUp[];
  followUpEnqueue?: { status: "enqueued" | "not_requested" | "failed"; jobId?: string; replayed?: boolean; safeMessage?: string };
  similarKnowledge: KnowledgeMatch[];
}

export interface ProcessTicketPorts {
  persistence: Pick<OrganizationPersistenceSession, "context" | "generateTicketId" | "saveTicketRecord" | "loadTicketRecords" | "loadKnowledgeHistory">;
  ai: AIAdapter;
  now?: () => string;
  onEvent?: (event: { name: string; detail?: string }) => void;
  idempotency?: ProcessTicketIdempotencyPort;
}

export interface ProcessTicketIdempotencyPort {
  get(key: string): { payloadHash: string; result: ProcessTicketResult } | undefined;
  set(key: string, value: { payloadHash: string; result: ProcessTicketResult }): void;
}

const replayStore = new Map<string, { payloadHash: string; result: ProcessTicketResult }>();
const defaultIdempotency: ProcessTicketIdempotencyPort = {
  get: (key) => replayStore.get(key),
  set: (key, value) => replayStore.set(key, value)
};

function emit(ports: ProcessTicketPorts, name: string, detail?: string): void {
  ports.onEvent?.({ name, detail });
}

function assertNotAborted(command: ProcessTicketCommand, stage: ProcessingStage, persistedTicket?: TicketRecord | null): void {
  if (!command.signal?.aborted) return;
  throw new ProcessTicketError({
    requestId: command.requestId,
    stage: "cancelled",
    errorClass: "cancelled",
    retryable: true,
    persistedTicket,
    safeMessage: "Ticket processing was cancelled. The latest persisted ticket state was preserved."
  });
}

function requireCommand(command: ProcessTicketCommand): void {
  if (!command.organizationId.trim() || command.organizationProfile.id !== command.organizationId) {
    throw new ProcessTicketError({
      requestId: command.requestId,
      stage: "received",
      errorClass: "authorization_mismatch",
      retryable: false,
      safeMessage: "The ticket organization does not match the explicit processing scope."
    });
  }
  if (!command.requestId.trim() || !command.ticketInput.description.trim()) {
    throw new ProcessTicketError({
      requestId: command.requestId,
      stage: "received",
      errorClass: "invalid_input",
      retryable: false,
      safeMessage: "A ticket description and request correlation ID are required."
    });
  }
  if (command.authority !== "local" && command.authority !== "server") {
    throw new ProcessTicketError({
      requestId: command.requestId,
      stage: "received",
      errorClass: "invalid_input",
      retryable: false,
      safeMessage: "A valid persistence authority is required."
    });
  }
}

function fingerprint(command: ProcessTicketCommand): string {
  const payload = JSON.stringify({
    organizationId: command.organizationId,
    subject: command.ticketInput.subject?.trim() ?? "",
    description: command.ticketInput.description.trim(),
    customerName: command.ticketInput.customerName?.trim() ?? "",
    source: command.ticketInput.source ?? "",
    externalReference: command.ticketInput.externalReference ?? ""
  });
  let hash = 2166136261;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function makeTicket(input: TicketInput, id: string, now: string): Ticket {
  const description = input.description.trim();
  const subject = input.subject?.trim() || (description.length > 80 ? `${description.slice(0, 80)}…` : description);
  return {
    id: `ticket-${id}`,
    ticketId: id,
    customerName: input.customerName?.trim() || input.sender?.name?.trim() || "Demo User",
    subject,
    description,
    category: "General",
    status: "new",
    createdAt: input.createdAt ?? now
  };
}

function emptyExtractedTicketFields(): ExtractedTicketFields {
  return { senderName: null, senderRole: null, companyName: null, deadline: null, subIssues: [], urgencyIndicators: [] };
}

function mergeExtractedFields(base: ExtractedTicketFields, advisory?: ExtractedTicketFields): ExtractedTicketFields {
  if (!advisory) return base;
  return {
    senderName: base.senderName ?? advisory.senderName,
    senderRole: base.senderRole ?? advisory.senderRole,
    companyName: base.companyName ?? advisory.companyName,
    deadline: advisory.deadline ?? base.deadline,
    subIssues: advisory.subIssues.length > 0 ? advisory.subIssues : base.subIssues,
    urgencyIndicators: advisory.urgencyIndicators.length > 0 ? advisory.urgencyIndicators : base.urgencyIndicators
  };
}

function applyAdvisoryFields(understanding: Understanding, advisory: AIAdvisory): Understanding {
  return {
    ...understanding,
    extractedFields: validateExtractedTicketFields(mergeExtractedFields(understanding.extractedFields ?? emptyExtractedTicketFields(), advisory.analysisSuggestion?.extractedFields))
  };
}

function canonicalForUnderstanding(understanding: Understanding, fallback: { title: string; problemSummary: string; category: string }) {
  const hint = understanding.intentIsolation?.primaryIssueHint;
  const overrides: Record<string, { title: string; problemSummary: string; category: string }> = {
    security_incident: { title: "Security Incident", problemSummary: "A security-sensitive report or unauthorized administrative request requires authorized review.", category: "Security Incident" },
    activation_failure: { title: "Activation Failure", problemSummary: "Activation or invitation email has not arrived or the activation flow cannot be completed.", category: "Activation" },
    billing_contact_update: { title: "Billing Contact Update", problemSummary: "Billing contact or invoice recipient information needs correction.", category: "Billing" },
    refund_investigation: { title: "Refund Investigation", problemSummary: "A refund or renewal charge requires investigation against account activity.", category: "Refund" },
    report_export_timeout: { title: "Large Report Export Timeout", problemSummary: "A large report or data export is timing out or remaining stuck.", category: "Reporting & Exports" },
    role_permission: { title: "Role Permission Issue", problemSummary: "A required role or permission is missing or denied.", category: "Permissions & Access" }
  };
  const selected = hint ? overrides[hint] : undefined;
  if (selected) return selected;
  return fallback.category === understanding.category ? fallback : { ...fallback, category: understanding.category };
}

function resolveTicketLanguage(ticket: Ticket, profile: OrganizationProfile) {
  const policy = resolveLanguagePolicy(profile);
  const defaultLanguage = isSupportedLanguage(policy.organizationLanguage) ? policy.organizationLanguage : undefined;
  const detection = detectLanguage(`${ticket.subject} ${ticket.description}`.trim(), { defaultLanguage });
  return { policy, detection, response: resolveResponseLanguage(policy, detection) };
}

function summarizeProviderFailure(result: AIProviderResult<unknown>): string {
  const reason = result.error?.trim() || "AI provider was unavailable.";
  return `${result.providerLabel}: ${reason.length > 180 ? `${reason.slice(0, 177)}...` : reason}`;
}

function diagnosticsFor(adapter: AIAdapter, results: Array<AIProviderResult<unknown>>, fallbackReason?: string): AIDiagnostics {
  const first = results.find((result) => result.diagnostics)?.diagnostics;
  const failed = results.find((result) => !result.ok);
  return {
    mode: adapter.config.mode,
    provider: adapter.provider.label,
    model: adapter.config.model,
    proxyPath: first?.proxyPath ?? adapter.config.proxyPath,
    endpointUsed: first?.endpointUsed ?? adapter.config.proxyPath,
    serverBaseUrl: first?.serverBaseUrl ?? adapter.config.baseUrl,
    proxySucceeded: results.some((result) => result.diagnostics?.proxySucceeded === true) ? true : results.some((result) => result.diagnostics?.proxySucceeded === false) ? false : undefined,
    fallbackReason: first?.fallbackReason ?? fallbackReason ?? failed?.error,
    latencyMs: first?.latencyMs ?? Math.max(0, ...results.map((result) => result.latencyMs)),
    retries: first?.retries,
    fallbackPath: first?.fallbackPath,
    completionStatus: results.some((result) => result.ok) ? "succeeded" : results.length > 0 ? "failed" : "skipped",
    attempts: first?.attempts
  };
}

function defaultAdvisory(adapter: AIAdapter, ticket: Ticket, canonicalTitle: string): AIAdvisory {
  const reason = adapter.config.mode === "disabled" ? "AI advisory is disabled." : "AI assistant could not be reached.";
  return buildAIAdvisory({
    ticketId: ticket.id,
    providerMode: adapter.config.mode,
    providerLabel: adapter.provider.label,
    model: adapter.config.model,
    deterministicLabel: canonicalTitle,
    availabilityMessage: reason,
    diagnostics: diagnosticsFor(adapter, [], reason)
  });
}

async function requestAnalysisAdvisory(
  ports: ProcessTicketPorts,
  ticket: Ticket,
  understanding: Understanding,
  profile: OrganizationProfile,
  canonical: { title: string; problemSummary: string; category: string }
): Promise<AIAdvisory> {
  if (ports.ai.config.mode === "disabled") return defaultAdvisory(ports.ai, ticket, canonical.title);
  const [analysis, canonicalResult] = await Promise.all([
    ports.ai.provider.analyzeTicket({ ticket, organizationProfile: profile, deterministicUnderstanding: understanding }),
    ports.ai.provider.suggestCanonicalProblem({
      ticket,
      organizationProfile: profile,
      deterministicUnderstanding: understanding,
      deterministicCanonicalProblem: { title: canonical.title, summary: canonical.problemSummary, category: canonical.category }
    })
  ]);
  const reason = analysis.ok || canonicalResult.ok ? undefined : summarizeProviderFailure(analysis) || summarizeProviderFailure(canonicalResult);
  const diagnostics = diagnosticsFor(ports.ai, [analysis, canonicalResult], reason);
  return buildAIAdvisory({
    ticketId: ticket.id,
    providerMode: ports.ai.config.mode,
    providerLabel: ports.ai.provider.label,
    model: ports.ai.config.model,
    deterministicLabel: canonical.title,
    analysisSuggestion: analysis.ok ? analysis.data : undefined,
    canonicalSuggestion: canonicalResult.ok ? canonicalResult.data : undefined,
    availabilityMessage: diagnostics.fallbackReason,
    diagnostics
  });
}

function appendTicketReference(draft: string, ticketRefId?: string): string {
  if (!ticketRefId || draft.includes(ticketRefId)) return draft;
  return `${draft.trimEnd()}\n\nYour ticket reference is ${ticketRefId}.`;
}

function personalizeGreeting(draft: string, senderName: string | null | undefined, tone: OrganizationProfile["customerTone"]): string {
  if (!senderName) return draft;
  const firstName = senderName.trim().split(/\s+/)[0] ?? senderName.trim();
  const firstLine = draft.split("\n")[0] ?? "";
  if (firstLine.includes(senderName) || firstLine.includes(firstName)) return draft;
  const greeting = tone === "formal" ? `Dear ${senderName},` : tone === "friendly" || tone === "empathetic" ? `Hi ${firstName},` : `Hello ${senderName},`;
  return /^(Hello|Hi|Dear)\s*(?:there\s*)?,\s*/i.test(draft)
    ? draft.replace(/^(Hello|Hi|Dear)\s*(?:there\s*)?,\s*/i, `${greeting} `)
    : draft;
}

function draftIsSafe(understanding: Understanding, draft: string, grounding: string): boolean {
  if (!draft.trim()) return false;
  const lower = draft.toLowerCase();
  if (lower.includes("internal guidance") || lower.includes("root cause hypothesis")) return false;
  const unsupported = [
    /\b(?:we|i)(?:'ll| will)\s+(?:issue|process|approve|arrange|provide|send)\s+(?:a\s+)?(?:refund|credit)\b/i,
    /\bwithin \d+\s+(?:business\s+)?(?:hour|hours|day|days|week|weeks)\b/i,
    /\b(?:billing support team|finance team|specialist|escalation|handoff)\b/i
  ].some((pattern) => pattern.test(draft) && !pattern.test(grounding));
  if (unsupported) return false;
  if (understanding.category === "Activation") {
    return ["activation", "license", "product version"].some((term) => lower.includes(term)) && !/\bpassword\b|\blogin email\b/i.test(lower);
  }
  return true;
}

async function requestDraft(
  ports: ProcessTicketPorts,
  ticket: Ticket,
  understanding: Understanding,
  profile: OrganizationProfile,
  canonicalTitle: string,
  matchedKnowledge: KnowledgeMatch | null,
  deterministic: SuggestedResponse,
  baseAdvisory: AIAdvisory,
  semanticAuthorization?: SemanticLessonAuthorization | null
): Promise<{ response: SuggestedResponse; advisory: AIAdvisory; usedAIDraft: boolean }> {
  const businessInquiry = understanding.businessClassification?.inquiryType === "business_inquiry";
  const businessMemory = businessInquiry && matchedKnowledge?.item.category === "Business Inquiry";
  const deterministicLesson = matchedKnowledge ? findMatchingLesson(ticket, matchedKnowledge.item) : null;
  const semanticLesson = matchedKnowledge && semanticAuthorization
    ? matchedKnowledge.item.lessons?.find((lesson) => lesson.id === semanticAuthorization.lessonId) ?? null
    : null;
  const lesson = deterministicLesson?.lesson ?? semanticLesson;
  const draftMode: DraftGroundingMode = businessInquiry && !businessMemory ? "memory_grounded" : lesson ? "lesson_grounded" : matchedKnowledge && deterministic.source !== "no_template" ? "memory_grounded" : "cold_start";
  const groundingLabel = businessInquiry && !businessMemory ? "organization profile" : lesson?.title ?? lesson?.rootCause ?? (matchedKnowledge?.item.title ?? "no organizational knowledge");
  const groundingContent = businessInquiry && !businessMemory ? deterministic.draftResponse : lesson?.customerResponse ?? deterministic.draftResponse;
  const fallback: SuggestedResponse = { ...deterministic, draftMode, groundingLabel };
  if (ports.ai.config.mode === "disabled") return { response: fallback, advisory: baseAdvisory, usedAIDraft: false };

  const draftResult = await ports.ai.provider.draftCustomerResponse({
    ticket,
    organizationProfile: profile,
    deterministicUnderstanding: understanding,
    canonicalProblemTitle: canonicalTitle,
    responseLanguage: resolveTicketLanguage(ticket, profile).response,
    groundingMode: draftMode,
    groundingLabel,
    groundingContent,
    lessonGrounding: lesson ? { rootCause: lesson.rootCause, solution: lesson.solution, customerResponse: lesson.customerResponse, matchedSignals: deterministicLesson?.matchedSignals ?? lesson.signals, doNotPromise: lesson.doNotPromise } : undefined,
    deterministicDraft: deterministic.draftResponse,
    matchedKnowledge
  });
  const enrichment = draftMode === "cold_start" || (businessInquiry && !businessMemory)
    ? { ok: false, providerMode: ports.ai.config.mode, providerLabel: ports.ai.provider.label, model: ports.ai.config.model, latencyMs: 0, error: "Knowledge enrichment skipped for cold-start draft." } as AIProviderResult<never>
    : await ports.ai.provider.enrichKnowledge({ ticket, organizationProfile: profile, deterministicUnderstanding: understanding, canonicalProblemTitle: canonicalTitle, matchedKnowledge });
  const diagnostics = diagnosticsFor(ports.ai, [draftResult, enrichment], draftResult.ok || enrichment.ok ? undefined : summarizeProviderFailure(draftResult));
  const advisory = buildAIAdvisory({
    ticketId: ticket.id,
    providerMode: ports.ai.config.mode,
    providerLabel: ports.ai.provider.label,
    model: ports.ai.config.model,
    deterministicLabel: baseAdvisory.deterministicLabel,
    analysisSuggestion: baseAdvisory.analysisSuggestion,
    canonicalSuggestion: baseAdvisory.canonicalSuggestion,
    responseSuggestion: draftResult.ok ? draftResult.data : undefined,
    knowledgeEnrichment: enrichment.ok ? enrichment.data : undefined,
    availabilityMessage: draftResult.ok || enrichment.ok ? baseAdvisory.availabilityMessage : diagnostics.fallbackReason,
    diagnostics
  });
  if (draftMode === "lesson_grounded") return { response: fallback, advisory, usedAIDraft: false };
  const candidate = draftResult.data?.draftResponse ?? "";
  if (draftResult.ok && draftResult.data && draftIsSafe(understanding, candidate, groundingContent)) {
    return {
      response: {
        ...fallback,
        draftResponse: appendTicketReference(personalizeGreeting(candidate, understanding.extractedFields?.senderName, profile.customerTone), ticket.ticketId),
        source: "ai_advisory",
        providerLabel: draftResult.providerLabel,
        deterministicDraft: draftMode === "cold_start" ? undefined : deterministic.draftResponse,
        confidenceNote: `${groundingLabel} (${draftResult.data.confidence}% confidence). Human review is required before sending or learning.`
      },
      advisory,
      usedAIDraft: true
    };
  }
  return { response: fallback, advisory, usedAIDraft: false };
}

async function discriminate(
  ports: ProcessTicketPorts,
  ticket: Ticket,
  understanding: Understanding,
  match: KnowledgeMatch,
  lessonMatch: LessonMatchResult | null
): Promise<KnowledgeMatch | null> {
  const strongLesson = lessonMatch && isStrongLessonMatch(lessonMatch) ? lessonMatch : null;
  const lesson = strongLesson && !ticketContradictsLesson(ticket, strongLesson.lesson) ? buildDiscriminationLessonPayload(strongLesson) : undefined;
  if (strongLesson && lesson) return match;
  if (ports.ai.config.mode === "disabled") return match;
  const result = await ports.ai.provider.discriminateMatch({
    ticket,
    matchedCanonicalTitle: strongLesson?.lesson.title ?? match.item.canonicalProblemTitle ?? match.item.title,
    matchedProblemSummary: lesson?.rootCause ?? match.item.problemSummary ?? match.item.problem,
    matchedLesson: lesson,
    deterministicUnderstanding: understanding
  });
  if (result.ok && result.data?.isDistinctFromMatch && result.data.confidence !== "low") return null;
  return match;
}

function analysisFrom(understanding: Understanding): AIAnalysis {
  return {
    ticketId: understanding.ticketId,
    summary: understanding.summary,
    coreProblem: understanding.coreProblem,
    category: understanding.category,
    intent: understanding.intent,
    urgency: understanding.urgency,
    suggestedTags: understanding.tags,
    detectedSignals: understanding.detectedSignals,
    extractedFields: understanding.extractedFields,
    businessClassification: understanding.businessClassification
  };
}

function classifyProviderError(error: unknown): ProcessTicketErrorClass {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/persistence|database|storage|quota|ticket counter/.test(message)) return "persistence_failure";
  if (/timeout|timed out|watchdog/.test(message)) return "provider_timeout";
  if (/malformed|invalid json|schema/.test(message)) return "provider_malformed_output";
  if (/unavailable|could not reach|connection|fetch/.test(message)) return "provider_unavailable";
  return "unexpected_failure";
}

function replaySnapshot(result: ProcessTicketResult): ProcessTicketResult {
  return JSON.parse(JSON.stringify({ ...result, persistedTicket: undefined })) as ProcessTicketResult;
}

export async function processTicket(command: ProcessTicketCommand, ports: ProcessTicketPorts): Promise<ProcessTicketResult> {
  requireCommand(command);
  if (
    ports.persistence.context.organizationId !== command.organizationId
    || ports.persistence.context.authority !== command.authority
  ) {
    throw new ProcessTicketError({
      requestId: command.requestId,
      stage: "received",
      errorClass: "authorization_mismatch",
      retryable: false,
      safeMessage: "Ticket processing persistence scope does not match the explicit command context."
    });
  }
  const idempotency = ports.idempotency ?? defaultIdempotency;
  const key = command.idempotencyKey?.trim();
  const payloadHash = fingerprint(command);
  if (key) {
    const existing = idempotency.get(`${command.organizationId}:${key}`);
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        throw new ProcessTicketError({ requestId: command.requestId, stage: "received", errorClass: "idempotency_conflict", retryable: false, safeMessage: "This idempotency key was already used for a different ticket payload." });
      }
      return { ...existing.result, replayed: true };
    }
  }

  const now = ports.now?.() ?? new Date().toISOString();
  const profile = command.organizationProfile;
  const adapter = ports.ai;
  let record: TicketRecord | null = null;
  const stages: string[] = [];
  const span = startTelemetrySpan("ticket_processing", "pipeline", { unit: "tickets", tags: { organizationId: command.organizationId, requestId: command.requestId, authority: command.authority } });
  try {
    assertNotAborted(command, "received");
    const existingRecords = await ports.persistence.loadTicketRecords();
    if (key) {
      const existing = existingRecords.find((item) => item.processingIdempotencyKey === key);
      if (existing) {
        if (existing.processingPayloadHash !== payloadHash) throw new ProcessTicketError({ requestId: command.requestId, stage: "received", errorClass: "idempotency_conflict", retryable: false, persistedTicket: existing, safeMessage: "This idempotency key was already used for a different ticket payload." });
        const cached = idempotency.get(`${command.organizationId}:${key}`)?.result;
        if (cached) return { ...cached, replayed: true };
        if (existing.processingResult && typeof existing.processingResult === "object") {
          return { ...(existing.processingResult as ProcessTicketResult), persistedTicket: existing, replayed: true };
        }
        throw new ProcessTicketError({ requestId: command.requestId, stage: "received", errorClass: "persistence_conflict", retryable: true, persistedTicket: existing, safeMessage: "The original ticket is already persisted, but its processing result is not available for safe replay." });
      }
    }
    const ticketId = await ports.persistence.generateTicketId(profile);
    const ticket = makeTicket(command.ticketInput, ticketId, now);
    record = { ...createTicketRecord(ticketId, command.organizationId, ticket.description, ticket.subject), actorId: command.actorContext.id, processingIdempotencyKey: key, processingPayloadHash: payloadHash, processingRequestId: command.requestId };
    await ports.persistence.saveTicketRecord(record);
    stages.push("persisted");
    emit(ports, "Ticket received", ticketId);
    assertNotAborted(command, "persisted", record);

    const relevance = assessBusinessRelevanceForProfile(`${ticket.subject} ${ticket.description}`, profile);
    stages.push("business_relevance");
    if (!relevance.isRelevant && relevance.status === "out_of_scope") {
      record = { ...record, status: "rejected" };
      await ports.persistence.saveTicketRecord(record);
      throw new ProcessTicketError({ requestId: command.requestId, stage: "failed", errorClass: "permanent_analysis_failure", retryable: false, persistedTicket: record, safeMessage: `Rejected by Business Relevance Guardrail: ${relevance.reason}` });
    }
    const domain = classifyBusinessDomain(`${ticket.subject} ${ticket.description}`, ticket.id, profile);
    const rawUnderstanding = understandForProfile(ticket, profile);
    const routing = routeBusinessInquiryUnderstanding(rawUnderstanding);
    const securityRouted = rawUnderstanding.intentIsolation?.securityIntent.detected === true;
    const understanding = securityRouted
      ? { ...rawUnderstanding, category: "Security Incident", intent: "security_incident", coreProblem: "Potential security incident or unauthorized administrative request", tags: ["security", "escalation", "human-review"] }
      : routing.understanding;
    const preliminaryCanonical = securityRouted
      ? canonicalForUnderstanding(understanding, { title: "Security Incident", problemSummary: "Security-sensitive request requiring authorized review.", category: "Security Incident" })
      : routing.canonicalProblem ?? identifyCanonicalProblem(understanding, profile);
    const advisory = securityRouted
      ? defaultAdvisory(adapter, ticket, "Security Incident")
      : await requestAnalysisAdvisory(ports, ticket, understanding, profile, preliminaryCanonical);
    const enriched = applyAdvisoryFields(understanding, advisory);
    const canonical = canonicalForUnderstanding(enriched, identifyCanonicalProblem(enriched, profile));
    const language = resolveTicketLanguage(ticket, profile);
    const analysis = analysisFrom(enriched);
    record = {
      ...record,
      classification: { category: enriched.category, intent: enriched.intent ?? "unspecified", canonicalProblem: canonical.title, classifiedBy: "deterministic", confidence: enriched.businessClassification?.confidence ?? domain.confidence, inquiryType: enriched.businessClassification?.inquiryType, businessIntent: enriched.businessClassification?.intent, securityDetected: enriched.intentIsolation?.securityIntent.detected, securitySeverity: enriched.intentIsolation?.securityIntent.severity, securityReasons: enriched.intentIsolation?.securityIntent.reasons, escalationRequired: enriched.intentIsolation?.securityIntent.escalationRequired, language: { detected: language.detection.language, confidence: language.detection.confidence, method: language.detection.method, responseLanguage: language.response.language } }
    };
    await ports.persistence.saveTicketRecord(record);
    if (securityRouted) stages.push("security_routed");
    stages.push("analyzing");
    assertNotAborted(command, "analyzing", record);

    const knowledgeItems = command.processingOptions?.knowledgeItems ?? [];
    const sessionCreatedIds = command.processingOptions?.sessionCreatedIds ?? new Set<string>();
    const rawMatches = securityRouted ? [] : withPreDiscriminationLessonMatches(ticket, enriched, retrieveMemory(enriched, knowledgeItems, sessionCreatedIds), knowledgeItems, canonical.title);
    const matches = rawMatches.filter((item) => isRetrievalCandidateEligible(enriched, item.item, ticket));
    const selected = selectPreferredMatch(ticket, matches);
    const topMatch = selected?.match ?? null;
    const lessonMatch = selected?.lessonMatch ?? null;
    const isBusinessInquiry = enriched.businessClassification?.inquiryType === "business_inquiry";
    const businessMemory = isBusinessInquiry && matches.some((item) => item.item.category === "Business Inquiry");
    let effectiveMatch = isBusinessInquiry && !businessMemory ? null : topMatch;
    if (effectiveMatch) effectiveMatch = await discriminate(ports, ticket, rawUnderstanding, effectiveMatch, lessonMatch);
    const semantic = !securityRouted && !isBusinessInquiry && !businessMemory && matches.length === 0 && rawMatches[0] && isRetrievalCandidateEligible(enriched, rawMatches[0].item, ticket)
      ? await evaluateSemanticLessonCompatibility(adapter.provider, ticket, enriched, rawMatches[0].item).catch(() => ({ authorization: null, aiResults: [], declineReason: "semantic evaluation failed" }))
      : null;
    if (!effectiveMatch && semantic?.authorization && rawMatches[0]) effectiveMatch = rawMatches[0];
    const memoryMatch = effectiveMatch;
    const selectedLesson = memoryMatch ? findMatchingLesson(ticket, memoryMatch.item) : null;
    const persistedLesson = topMatch ? lessonMatch : null;
    record = { ...record, memoryMatch: { knowledgeId: topMatch?.item.id ?? null, matchType: persistedLesson ? "lesson" : topMatch ? "template" : "none", lessonId: persistedLesson?.lesson.id ?? null } };
    await ports.persistence.saveTicketRecord(record);
    stages.push("retrieved");
    assertNotAborted(command, "retrieved", record);

    const deterministicDraft = securityRouted
      ? securityIncidentDraft(ticket.id)
      : enriched.businessClassification?.inquiryType === "business_inquiry" && !businessMemory
      ? draftBusinessInquiryResponse(ticket, enriched, profile, language.response.language)
      : draftResponse(ticket, enriched, memoryMatch, profile, knowledgeItems.length === 0, semantic?.authorization ?? null);
    const deterministic: SuggestedResponse = { ticketId: ticket.id, ...deterministicDraft };
    const draftResult = securityRouted
      ? { response: { ...deterministic, draftMode: "cold_start" as const, groundingLabel: "security escalation" }, advisory, usedAIDraft: false }
      : await requestDraft(ports, ticket, enriched, profile, canonical.title, memoryMatch, deterministic, advisory, semantic?.authorization ?? null);
    record = { ...record, draftSource: draftResult.response.source as TicketRecord["draftSource"], status: "in_review" };
    await ports.persistence.saveTicketRecord(record);
    stages.push("drafted", "in_review");
    assertNotAborted(command, "in_review", record);
    const result: ProcessTicketResult = {
      requestId: command.requestId,
      ticket: { ...ticket, status: "drafted" },
      persistedTicket: record,
      understanding: enriched,
      analysis,
      language,
      businessIntent: enriched.businessClassification,
      businessRelevance: relevance,
      domainClassification: domain,
      canonicalSelection: canonical,
      memoryMatch,
      lessonMatch: selectedLesson,
      providerDiagnostics: draftResult.advisory.diagnostics,
      advisory: draftResult.advisory,
      draft: draftResult.response,
      reviewState: "in_review",
      processingState: "in_review",
      auditSummary: { organizationId: command.organizationId, actorId: command.actorContext.id, requestId: command.requestId, idempotencyKey: key },
      telemetrySummary: { requestId: command.requestId, stages },
      persisted: true,
      replayed: false,
      followUp: securityRouted || hasSpecificCanonicalMatch(enriched, knowledgeItems)
        ? []
        : [{ type: "pattern_discovery_requested", ticketId: ticket.id, reason: "no_specific_canonical_match" }],
      similarKnowledge: semantic?.authorization && rawMatches[0]
        ? [rawMatches[0]]
        : memoryMatch
        ? [memoryMatch, ...matches.filter((item) => item.item.id !== memoryMatch.item.id)]
        : topMatch
        ? matches.filter((item) => item.item.id !== topMatch.item.id)
        : matches
    };
    if (key) {
      const snapshot = replaySnapshot(result);
      const persistedRecord = { ...record, processingResult: snapshot };
      result.persistedTicket = persistedRecord;
      record = persistedRecord;
    await ports.persistence.saveTicketRecord(persistedRecord);
      idempotency.set(`${command.organizationId}:${key}`, { payloadHash, result });
    }
    span.end(true);
    return result;
  } catch (error) {
    span.end(false, { stage: stages[stages.length - 1] ?? "received" });
    if (error instanceof ProcessTicketError) throw error;
    const errorClass = classifyProviderError(error);
    throw new ProcessTicketError({ requestId: command.requestId, stage: command.signal?.aborted ? "cancelled" : "failed", errorClass, retryable: ["provider_timeout", "provider_unavailable", "transient_infrastructure_failure"].includes(errorClass), persistedTicket: record, safeMessage: errorClass === "provider_timeout" ? "The AI provider timed out. Retry is safe." : "Ticket processing could not be completed. The latest persisted state was preserved." }, error);
  }
}

export function createProcessTicketPorts(input: { persistence: ProcessTicketPorts["persistence"]; ai: AIAdapter; onEvent?: ProcessTicketPorts["onEvent"] }): ProcessTicketPorts {
  return { persistence: input.persistence, ai: input.ai, onEvent: input.onEvent };
}
