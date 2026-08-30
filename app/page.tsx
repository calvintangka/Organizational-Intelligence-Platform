"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Sidebar } from "@/components/maesa/Sidebar";
import type { ActiveView } from "@/components/maesa/Sidebar";
import { HomeView } from "@/components/views/HomeView";
import { TicketWorkspace } from "@/components/views/TicketWorkspace";
import type { TicketPhase } from "@/components/views/TicketWorkspace";
import { BulkUploadWorkspace } from "@/components/views/BulkUploadWorkspace";
import { KnowledgeView } from "@/components/views/KnowledgeView";
import { OrganizationalMemorySurface } from "@/components/views/OrganizationalMemorySurface";
import { DashboardView } from "@/components/views/DashboardView";
import { OperationsView } from "@/components/views/OperationsView";
import { OrganizationView, type NewOrganizationInput } from "@/components/views/OrganizationView";
import { AccentPicker } from "@/components/AccentPicker";
import { AccountWorkspaceMenu } from "@/components/AccountWorkspaceMenu";
import { defaultOrganizationProfile, seedOrganizationProfiles } from "@/data/seedOrganizationProfiles";
import { createAIAdapter } from "@/lib/ai/adapter";
import { buildAIAdvisory } from "@/lib/ai/deterministic";
import type { AIProviderResult } from "@/lib/ai/types";
import { assessBusinessRelevanceForProfile, routeBusinessInquiryUnderstanding, understandForProfile } from "@/lib/analyzer";
import { extractCustomerContext, isLikelyPersonName, textHasExplicitRole } from "@/lib/customerContext";
import { classifyBusinessDomain } from "@/lib/domainClassifier";
import { businessLessonSignalAliases } from "@/lib/businessInquiry";
import { analyzeBulkEntries, prepareBulkClusterCommit } from "@/lib/bulkUpload";
import { retrieveMemory } from "@/lib/memory";
import { draftBusinessInquiryResponse, draftResponse, findMatchingLesson, isRetrievalCandidateEligible, ticketContradictsLesson } from "@/lib/drafting";
import type { LessonMatchResult, SemanticLessonAuthorization } from "@/lib/drafting";
import {
  buildDiscriminationLessonPayload,
  isStrongLessonMatch,
  moveMatchToFront,
  selectPreferredMatch,
  stripRejectedMatch,
  withPreDiscriminationLessonMatches
} from "@/lib/lessonSelection";
import { evaluateSemanticLessonCompatibility } from "@/lib/ai/semanticCompatibility";
import {
  buildKnowledgeItemFromPackCandidate,
  buildPackCandidateContent
} from "@/lib/knowledgePacks";
import { generateReflection } from "@/lib/reflection";
import { assessReflectionSafety, buildReflectionSafetyContext } from "@/lib/reflectionSafety";
import {
  createCanonicalProblem,
  createGeneralizedEvidenceExample,
  dedupeLessonCollection,
  getCustomerResponseTemplate,
  identifyCanonicalProblem,
  lessonContentFingerprint,
  mergeLessonIntoExisting,
  mergeIntoCanonicalProblem,
  normalizeReusableLessonTemplate,
  createOpaqueProvenanceId,
  resolveLessonIdForItem,
  upsertCanonicalProblem,
  withCanonicalProblemDefaults
} from "@/lib/canonicalProblemEngine";
import { createLogEntry } from "@/lib/intelligenceLog";
import { TicketRequestGuard } from "@/lib/ticketRequestGuard";
import {
  hasSpecificCanonicalMatch,
  promotePatternToCanonicalProblem
} from "@/lib/patternDiscovery";
import { defaultMetrics } from "@/lib/metrics";
import {
  recordResolution,
  evaluateTrust,
  TRUST_INITIAL
} from "@/lib/trustEngine";
import { ticketReferenceId, withStableValidationProvenance } from "@/lib/knowledgeProvenance";
import {
  persistence,
  persistenceMode,
  createPersistenceSessionForOrganization,
  migrationWarningForMode,
  ServerPersistenceAdapterError,
} from "@/lib/persistence";
import type { OrganizationPersistenceSession } from "@/lib/persistence";
import {
  LEGACY_MEMORY_FALLBACK_WARNING,
  readsMemoryChangeHistoryFromLegacy,
} from "@/lib/orgMemory";
import {
  syncProfileIntoList,
  initialsFor,
  normalizeAccentColor,
  normalizeOrganizationProfile,
} from "@/lib/organizationProfile";
import { useOrganizationDocumentTitle } from "@/lib/documentTitle";
import { detectLanguage, isSupportedLanguage, languageLabel, type SupportedLanguageCode } from "@/lib/languageDetection";
import { resolveLanguagePolicy, resolveResponseLanguage } from "@/lib/languagePolicy";
import { measureTelemetry, measureTelemetrySync, recordTelemetryEvent, startTelemetrySpan } from "@/lib/telemetry";
import {
  createTicketRecord,
  computeEditDistance,
} from "@/lib/ticketRecords";
import { countOpenTicketRecords } from "@/lib/ticketMetrics";
import { ticketWorkflowResumable } from "@/lib/ticketReflectionRecovery";
import { ZendeskLandingPage } from "@/components/landing/LandingPageZendesk";
import { CaseLookupView } from "@/components/views/CaseLookupView";
import { AuthorizationProvider } from "@/components/AuthorizationContext";
import { DeveloperDiagnosticsView } from "@/components/views/DeveloperDiagnosticsView";
import { bulkResult, cancelJob, enqueueBulkJob, enqueuePatternDiscoveryJob, enqueueReflectionJob, getJob, reflectionResult } from "@/lib/application/jobs/client";
import type { ProcessTicketResult } from "@/lib/application/tickets/processTicket";
import { digestJobInput } from "@/lib/application/jobs/types";
import { buildPatternDiscoveryInput, patternDiscoveryIdempotencyKey } from "@/lib/application/jobs/patternTypes";
import {
  generateReflectionCommand,
  promoteKnowledgeCommand,
  validateReflectionCommand,
  LearningApplicationError
} from "@/lib/application/learning/reflectionCommands";
const PAGE_LOAD_STARTED_AT = Date.now();
const AUTH_HYDRATION_TIMEOUT_MS = 2_500;
const AUTH_HYDRATION_RETRY_DELAY_MS = 250;
const ASYNC_BULK_INTAKE_ENABLED = process.env.NEXT_PUBLIC_OIP_ASYNC_BULK_INTAKE === "true";
const ASYNC_REFLECTION_ENABLED = process.env.NEXT_PUBLIC_OIP_ASYNC_REFLECTION === "true";
import type {
  AIAnalysis,
  AIAdvisory,
  AIAdvisoryStatus,
  AIDiagnostics,
  AIKnowledgeEnrichment,
  KnowledgeItem,
  KnowledgeHistory,
  KnowledgeMatch,
  Metrics,
  OrgMetrics,
  ReflectionDecision,
  SuggestedResponse,
  Ticket,
  TicketPageRequest,
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
  BulkAnalyzedQuery,
  BulkCluster,
  BulkUploadEntry,
  Understanding,
  LessonDraft,
  Lesson,
  ReflectionCommitInput,
  DraftGroundingMode,
  BusinessDomainClassification,
  TicketRecord,
  TicketResolutionEvidenceType,
  TicketWorkflowCommand,
  KnowledgePack,
  KnowledgePackCandidateDraft,
} from "@/types";
import type { CuratedDeveloperDemoScenario } from "@/data/developerDemoScenarios";

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

type KnowledgeHistoryLoadState = "not_loaded" | "loading" | "loaded" | "error";

interface KnowledgeConflictRecovery {
  organizationId: string;
  resourceId: string;
  operation: string;
  expectedRevision: number | null;
  currentRevision: number | null;
  localWorkPreserved: boolean;
  latestLoaded: boolean;
}

function mergeRecordsById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const merged = new Map(current.map((record) => [record.id, record]));
  for (const record of incoming) merged.set(record.id, record);
  return [...merged.values()];
}
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

function createInitialMetrics(): Metrics {
  return { ...defaultMetrics };
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
    extractedFields: und.extractedFields,
    businessClassification: und.businessClassification
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
    extractedFields: analysis.extractedFields ?? emptyExtractedTicketFields(),
    businessClassification: analysis.businessClassification
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

// TODO-050: identity (name/role/company) is deterministic-first. Explicit
// deterministic identity wins; the AI advisory may only FILL a null field, and
// even then a name must pass isLikelyPersonName and a role is accepted only when
// the ticket text explicitly states one — so hallucinated or issue-text AI
// identity can never overwrite or invent a customer identity. Non-identity
// fields (deadline, sub-issues, urgency) keep the prior AI-preferred behavior.
function mergeExtractedTicketFields(
  base: ExtractedTicketFields,
  advisoryFields?: ExtractedTicketFields,
  sourceText = ""
): ExtractedTicketFields {
  if (!advisoryFields) return base;
  const aiName = isLikelyPersonName(advisoryFields.senderName) ? advisoryFields.senderName : null;
  const aiRole = advisoryFields.senderRole && textHasExplicitRole(sourceText) ? advisoryFields.senderRole : null;

  return {
    senderName: base.senderName ?? aiName,
    senderRole: base.senderRole ?? aiRole,
    companyName: base.companyName ?? advisoryFields.companyName,
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
      advisory?.analysisSuggestion?.extractedFields,
      understanding.originalText ?? ""
    )
  };
}

type AuthUser = { id: string; name: string; email: string };

/**
 * TODO-056: the shape /api/auth/active-organization actually returns. It is an
 * authorization/identity context, NOT an OrganizationProfile — typing it as one
 * silently produced partial profiles with undefined fields in React state.
 */
type ActiveOrganizationContext = { id: string; name: string; industry: string; description: string };

/**
 * TODO-058: resolve the incoming ticket's language and the language the reply
 * must be written in.
 *
 * Deterministic and provider-independent, so the decision exists even when every
 * AI tier is unavailable. The result is metadata about THIS ticket — it never
 * selects, partitions, or forks organizational memory, which stays
 * language-neutral.
 */
function resolveTicketLanguage(ticket: Ticket, profile: OrganizationProfile) {
  const policy = resolveLanguagePolicy(profile);
  const defaultLanguage = isSupportedLanguage(policy.organizationLanguage)
    ? policy.organizationLanguage
    : undefined;
  const detection = detectLanguage(`${ticket.subject ?? ""} ${ticket.description ?? ""}`.trim(), { defaultLanguage });
  return { policy, detection, response: resolveResponseLanguage(policy, detection) };
}

function LoginScreen({ onAuthenticated, initialMode = "login" }: { onAuthenticated: (user: AuthUser) => void; initialMode?: "login" | "signup" }) {
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const response = await fetch(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "signup" ? { name, email, password } : { email, password })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.data) {
        setError(payload?.error?.message ?? (mode === "signup" ? "Unable to create your account." : "Unable to sign in."));
        return;
      }
      onAuthenticated(payload.data);
    } catch {
      setError("Unable to reach the authentication service.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F3F6FA] px-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#2563EB]">Powered by OIP</p>
        <h1 className="mt-3 text-3xl font-bold text-[#111827]">{mode === "signup" ? "Create your OIP account" : "Sign in to OIP"}</h1>
        <a href="/" className="mb-6 inline-flex min-h-11 items-center text-sm font-semibold text-slate-500 hover:text-slate-900">{"\u2190"} Back to OIP</a>
        <p className="mt-2 text-sm text-slate-500">{mode === "signup" ? "Start with an account, then create your first organization." : "Use your authenticated OIP account to continue."}</p>
        {mode === "signup" && <>
          <label className="mt-8 block text-sm font-semibold text-slate-700" htmlFor="auth-name">Name</label>
          <input id="auth-name" name="name" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#2563EB]" />
        </>}
        <label className={`${mode === "signup" ? "mt-5" : "mt-8"} block text-sm font-semibold text-slate-700`} htmlFor="auth-email">Email</label>
        <input id="auth-email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#2563EB]" />
        <label className="mt-5 block text-sm font-semibold text-slate-700" htmlFor="auth-password">Password</label>
        <input id="auth-password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 8 : undefined} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#2563EB]" />
        {error && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={isSubmitting} className="mt-6 w-full rounded-xl bg-[#2563EB] px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
          {isSubmitting ? (mode === "signup" ? "Creating account…" : "Signing in…") : (mode === "signup" ? "Create account" : "Sign in")}
        </button>
        <p className="mt-5 text-center text-sm text-slate-600">
          {mode === "signup" ? "Already have an account?" : "Don’t have an account?"}{" "}
          <button type="button" className="font-semibold text-[#2563EB]" onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(""); }}>
            {mode === "signup" ? "Sign in" : "Create account"}
          </button>
        </p>
      </form>
    </main>
  );
}

function FirstOrganizationOnboarding({ onCreate }: { onCreate: (input: NewOrganizationInput, idempotencyKey: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("General");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const key = useRef<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError("Enter an organization name with at least 2 characters.");
      return;
    }
    setError("");
    setSubmitting(true);
    const idempotencyKey = key.current ?? `first-org-${crypto.randomUUID()}`;
    key.current = idempotencyKey;
    try {
      await onCreate({ name, industry, description, initials: "", accentColor: "#7C3AED", tone: "professional" }, idempotencyKey);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Organization creation failed. Please retry.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F3F6FA] px-4">
      <form onSubmit={submit} aria-busy={submitting} className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#2563EB]">Welcome to OIP</p>
        <h1 className="mt-3 text-3xl font-bold text-[#111827]">Create your organization</h1>
        <p className="mt-2 text-sm text-slate-500">Your first workspace starts empty and you will be its Owner.</p>
        <label className="mt-8 block text-sm font-semibold text-slate-700" htmlFor="first-org-name">Organization name</label>
        <input id="first-org-name" required minLength={2} value={name} onChange={(event) => { setName(event.target.value); setError(""); }} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#2563EB]" placeholder="e.g. Nimbus Cloud" />
        <label className="mt-5 block text-sm font-semibold text-slate-700" htmlFor="first-org-industry">Industry</label>
        <input id="first-org-industry" required value={industry} onChange={(event) => { setIndustry(event.target.value); setError(""); }} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#2563EB]" />
        <label className="mt-5 block text-sm font-semibold text-slate-700" htmlFor="first-org-description">Description <span className="font-normal text-slate-400">(optional)</span></label>
        <textarea id="first-org-description" value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#2563EB]" />
        {error && <p role="alert" aria-live="polite" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={submitting || name.trim().length < 2} className="mt-6 w-full rounded-xl bg-[#2563EB] px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
          {submitting ? "Creating organization…" : "Create organization"}
        </button>
      </form>
    </main>
  );
}

export default function Home() {
  const [authStatus, setAuthStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [secondTicket, setSecondTicket] = useState<Ticket | null>(null);
  const [secondTicketRecord, setSecondTicketRecord] = useState<TicketRecord | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [similarKnowledge, setSimilarKnowledge] = useState<KnowledgeMatch[]>([]);
  const [suggestedResponse, setSuggestedResponse] = useState<SuggestedResponse | null>(null);
  const [reviewedResponse, setReviewedResponse] = useState("");
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>(() => persistence.seedKnowledge());
  const [knowledgeCandidates, setKnowledgeCandidates] = useState<KnowledgeCandidate[]>([]);
  const [validationRecords, setValidationRecords] = useState<ValidationRecord[]>([]);
  const [memoryChangeRecords, setMemoryChangeRecords] = useState<MemoryChangeRecord[]>([]);
  const [historyLoadState, setHistoryLoadState] = useState<Record<string, { state: KnowledgeHistoryLoadState; error?: string }>>({});
  const [organizationProfile, setOrganizationProfile] = useState<OrganizationProfile>(defaultOrganizationProfile);
  const [organizationList, setOrganizationList] = useState<OrganizationProfile[]>(seedOrganizationProfiles);
  const [authorizedOrganizations, setAuthorizedOrganizations] = useState<OrganizationProfile[]>([]);
  const [organizationBootstrapState, setOrganizationBootstrapState] = useState<"loading" | "onboarding" | "ready" | "error">("loading");
  const [organizationSwitching, setOrganizationSwitching] = useState(false);
  const [openCreateOrganization, setOpenCreateOrganization] = useState(false);
  const [metrics, setMetrics] = useState<Metrics>(createInitialMetrics);
  const [orgMetrics, setOrgMetrics] = useState<OrgMetrics>(() => persistence.seedOrgMetrics(defaultOrganizationProfile.id));
  const [hydrated, setHydrated] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [migrationWarning, setMigrationWarning] = useState("");
  // BUG-009: non-blocking notice shown after stale-profile conflict recovery.
  const [profileConflictNotice, setProfileConflictNotice] = useState("");
  const [revisionConflictNotice, setRevisionConflictNotice] = useState("");
  const [knowledgeConflictRecovery, setKnowledgeConflictRecovery] = useState<KnowledgeConflictRecovery | null>(null);

  async function openPersistenceSession(organizationId: string, operation: string, requestId?: string): Promise<OrganizationPersistenceSession> {
    const id = requestId ?? `${operation}:${organizationId}:${Date.now()}`;
    return createPersistenceSessionForOrganization({
      organizationId,
      actorContext: authUser ? { id: authUser.id, name: authUser.name, email: authUser.email } : { id: "ui-anonymous", name: "UI" },
      requestId: id,
      correlationId: id
    });
  }

  async function refreshOpenTicketMetric(organizationId: string): Promise<void> {
    const generation = organizationSwitchGeneration.current;
    const session = await openPersistenceSession(organizationId, "refresh-open-ticket-metric");
    const loaded = await session.loadOrgMetrics();
    if (generation !== organizationSwitchGeneration.current) return;
    let latest = loaded ?? session.seedOrgMetrics();
    if (latest.openTickets === undefined && session.context.authority === "local") {
      latest = { ...latest, openTickets: countOpenTicketRecords(await session.loadTicketRecords()) };
    }
    if (generation !== organizationSwitchGeneration.current) return;
    setOrgMetrics((current) => ({ ...current, ...latest, organizationId }));
  }

  // TODO-055: the browser tab follows the active organization. It reads the
  // organization state the app already holds — no extra request, no polling, no
  // extra global state. Anything short of a hydrated authenticated organization
  // shows the bare product name, so a refresh never flashes the seed
  // organization's name and the login screen stays unbranded.
  useOrganizationDocumentTitle(
    authStatus === "authenticated" && hydrated ? organizationProfile.name : null
  );

  // OIP engine state
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
  const ticketSaveChains = useRef<Record<string, Promise<void>>>({});
  const draftSaveChains = useRef<Record<string, Promise<void>>>({});
  const draftSaveState = useRef<Record<string, { record: TicketRecord; value: string }>>({});
  // Profile edits have their own resource-specific write chain. This lets a
  // switch drain an actual pending profile edit without treating navigation as
  // a reason to re-save an unchanged whole organization snapshot.
  const profileSaveChains = useRef<Record<string, Promise<void>>>({});
  const bulkTicketRecords = useRef<Record<string, TicketRecord>>({});
  const [activeTicketRecord, setActiveTicketRecord] = useState<TicketRecord | null>(null);
  const [isConversationSubmitting, setIsConversationSubmitting] = useState(false);

  // LLM match discrimination — reasoning surfaced in the analysis step
  const [discriminationReasoning, setDiscriminationReasoning] = useState<string | null>(null);
  const [discriminatedMatchTitle, setDiscriminatedMatchTitle] = useState<string | null>(null);

  // Reflection / Knowledge Evolution
  const [reflectionDecision, setReflectionDecision] = useState<ReflectionDecision | null>(null);
  const [lastSavedKnowledgeId, setLastSavedKnowledgeId] = useState<string | null>(null);
  const [isValidationSubmitting, setIsValidationSubmitting] = useState(false);
  // Keep the latest committed knowledge collection available to a later
  // Reflection event even when that event handler was created before the
  // preceding commit's React state update completed.
  const knowledgeItemsRef = useRef<KnowledgeItem[]>([]);
  knowledgeItemsRef.current = knowledgeItems;

  // Maesa Tech UI state
  const [activeView, setActiveView] = useState<ActiveView>("home");
  const [ticketIntakeMode, setTicketIntakeMode] = useState<"single" | "bulk">("single");
  const [darkMode, setDarkMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRetryingDraft, setIsRetryingDraft] = useState(false);
  const organizationSwitchGeneration = useRef(0);
  const ticketRequestGuard = useRef(new TicketRequestGuard());
  const ticketAbortController = useRef<AbortController | null>(null);
  const learningCommandContext = useRef<{ requestId: string; idempotencyKey: string } | null>(null);
  const knowledgeHistoryCache = useRef<Record<string, KnowledgeHistory>>({});
  const knowledgeHistoryRequests = useRef<Record<string, Promise<KnowledgeHistory>>>({});
  const validationCommitInFlight = useRef(false);
  // The server returns a fresh organization revision after each profile write.
  // Keep that revision outside React state so a successful save does not
  // trigger another save, while later legitimate edits still carry the
  // latest optimistic-concurrency precondition.
  const profileRevisionByOrganization = useRef<Record<string, string>>({});
  const profileSettingsRevisionByOrganization = useRef<Record<string, number>>({});
  // Server hydration and organization switching replace complete authoritative
  // collections. Those replacements are reads, not resource mutations, so the
  // following effects must not echo the loaded snapshots back to persistence.
  const suppressedHydrationPersistence = useRef(new Set<string>());

  function suppressHydratedCollectionPersistence(): void {
    for (const resource of ["knowledge", "candidates", "metrics", "log", "patterns"]) {
      suppressedHydrationPersistence.current.add(resource);
    }
  }

  function shouldPersistHydratedCollection(resource: string): boolean {
    if (!hydrated) return false;
    if (suppressedHydrationPersistence.current.delete(resource)) return false;
    return true;
  }
  function cancelActiveTicketRequest() {
    ticketRequestGuard.current.cancel();
    ticketAbortController.current?.abort();
    ticketAbortController.current = null;
    setIsProcessing(false);
  }

  function ticketRequestIsCurrent(generation?: number): boolean {
    return generation === undefined || ticketRequestGuard.current.isCurrent(generation);
  }

  function clearKnowledgeHistoryCache() {
    knowledgeHistoryCache.current = {};
    knowledgeHistoryRequests.current = {};
    setHistoryLoadState({});
  }

  async function ensureKnowledgeHistory(organizationId: string, knowledgeId: string): Promise<KnowledgeHistory> {
    const key = `${organizationId}:${knowledgeId}`;
    const cached = knowledgeHistoryCache.current[key];
    if (cached) return cached;
    const pending = knowledgeHistoryRequests.current[key];
    if (pending) return pending;

    const generation = organizationSwitchGeneration.current;
    setHistoryLoadState((current) => ({ ...current, [knowledgeId]: { state: "loading" } }));
    const request = openPersistenceSession(organizationId, "knowledge-history")
      .then((session) => session.loadKnowledgeHistory(knowledgeId));
    knowledgeHistoryRequests.current[key] = request;
    try {
      const history = await request;
      if (generation !== organizationSwitchGeneration.current) return history;
      knowledgeHistoryCache.current[key] = history;
      setValidationRecords((current) => mergeRecordsById(current, history.validationRecords));
      setMemoryChangeRecords((current) => mergeRecordsById(current, history.memoryChangeRecords));
      setHistoryLoadState((current) => ({ ...current, [knowledgeId]: { state: "loaded" } }));
      return history;
    } catch (error) {
      if (generation === organizationSwitchGeneration.current) {
        setHistoryLoadState((current) => ({
          ...current,
          [knowledgeId]: {
            state: "error",
            error: error instanceof Error ? error.message : "Unable to load knowledge history."
          }
        }));
      }
      throw error;
    } finally {
      if (knowledgeHistoryRequests.current[key] === request) delete knowledgeHistoryRequests.current[key];
    }
  }

  useEffect(() => {
    const startedAt = PAGE_LOAD_STARTED_AT;
    recordTelemetryEvent({
      name: "page_load",
      category: "ui",
      durationMs: Date.now() - startedAt,
      startedAt,
      endedAt: Date.now(),
      success: true,
      unit: "operations",
      tags: { measuredAt: "first_effect" }
    });
  }, []);

  useEffect(() => {
    if (authStatus !== "authenticated" || !hydrated || activeView !== "home") return;
    void refreshOpenTicketMetric(organizationProfile.id).catch((error) => {
      reportPersistenceError("refreshOpenTicketMetricOnHomeNavigation", error);
    });
  }, [activeView, authStatus, hydrated, organizationProfile.id]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateAuthentication(): Promise<void> {
      for (let attempt = 0; attempt < 2 && !cancelled; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), AUTH_HYDRATION_TIMEOUT_MS);

        try {
          const response = await fetch("/api/auth/me", { cache: "no-store", signal: controller.signal });
          const payload = await response.json().catch(() => null);
          if (cancelled) return;

          if (response.ok && payload?.data) {
            setAuthUser(payload.data);
            setAuthStatus("authenticated");
          } else {
            setAuthStatus("unauthenticated");
          }
          return;
        } catch {
          if (attempt === 0 && !cancelled) {
            await new Promise((resolve) => setTimeout(resolve, AUTH_HYDRATION_RETRY_DELAY_MS));
          }
        } finally {
          clearTimeout(timeout);
        }
      }

      if (!cancelled) setAuthStatus("unauthenticated");
    }

    void hydrateAuthentication();
    return () => {
      cancelled = true;
    };
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthUser(null);
    setAuthorizedOrganizations([]);
    setOrganizationBootstrapState("loading");
    setAuthStatus("unauthenticated");
  }

  /* ---------- Persistence: load on mount, save on change ---------- */

  useEffect(() => {
    if (authStatus !== "authenticated") {
      setOrganizationBootstrapState("loading");
      return;
    }
    let cancelled = false;
    setOrganizationBootstrapState("loading");

    void (async () => {
      try {
        const organizationsResponse = await fetch("/api/organizations", { cache: "no-store" });
        const organizationsPayload = await organizationsResponse.json().catch(() => null) as { data?: OrganizationProfile[]; error?: { message?: string } } | null;
        if (!organizationsResponse.ok || !Array.isArray(organizationsPayload?.data)) {
          throw new Error(organizationsPayload?.error?.message ?? "Unable to load available organizations.");
        }
        const authorizedProfiles = organizationsPayload.data;
        if (!cancelled) setAuthorizedOrganizations(authorizedProfiles);
        if (authorizedProfiles.length === 0) {
          if (!cancelled) {
            setOrganizationList([]);
            setHydrated(false);
            setOrganizationBootstrapState("onboarding");
          }
          return;
        }
        // The authenticated active-organization context is authoritative on
        // refresh. Do not let a preserved shell/localStorage selection choose
        // an organization outside the user's current membership set.
        const activeResponse = await fetch("/api/auth/active-organization", { cache: "no-store" });
        const activePayload = await activeResponse.json().catch(() => null) as {
          data?: { activeOrganizationId?: string | null; organization?: ActiveOrganizationContext | null };
          error?: { message?: string };
        } | null;
        if (!activeResponse.ok) {
          throw new Error(activePayload?.error?.message ?? "Unable to resolve the active organization.");
        }
        const activeContext = activePayload?.data;
        if (!activeContext?.activeOrganizationId || !activeContext.organization) {
          throw new Error("No authorized organization is available for this user.");
        }
        const activeOrganizationContext = activeContext.organization;
        const orgId = activeContext.activeOrganizationId;
        // Resolve one immutable organization session before touching any
        // organization-owned resource. Switching organizations later cannot
        // retarget this in-flight hydration.
        const session = await openPersistenceSession(orgId, "hydrate-organization");
        const migration = await session.prepareOrganization();
        // Authority-aware: the legacy localStorage migration notice is only
        // relevant while the active organization operates locally. A
        // server-authoritative organization reads memory history from PostgreSQL.
        setMigrationWarning(migrationWarningForMode(session.context.authority, migration.warnings));
        const [
          loadedOrganizationList,
          loadedKnowledge,
          loadedCandidates,
          loadedValidationRecords,
          loadedMemoryChangeRecords,
          loadedOrgMetrics,
          loadedIntelligenceLog,
          loadedPatterns
        ] = await Promise.all([
          persistence.loadOrganizationList(),
          session.loadKnowledge(),
          session.loadKnowledgeCandidates(),
          Promise.resolve([] as ValidationRecord[]),
          Promise.resolve([] as MemoryChangeRecord[]),
          session.loadOrgMetrics(),
          session.loadOrgLog(),
          session.loadEmergingPatterns()
        ]);

        if (cancelled) return;

        // TODO-056: /api/auth/active-organization returns an authorization
        // CONTEXT (id, name, industry, description) — not a full profile. Using
        // it as organizationProfile left every other field undefined, which both
        // rendered the auto-resolution slider uncontrolled and sent an undefined
        // revision on the next save (a spurious stale-profile conflict). Take the
        // complete profile from the organization list, which both persistence
        // modes return in full, and keep the context only for identity.
        const loadedProfile =
          loadedOrganizationList.find((organization) => organization.id === orgId)
          ?? normalizeOrganizationProfile({
            ...defaultOrganizationProfile,
            ...activeOrganizationContext
          } as OrganizationProfile);

        setOrganizationProfile(loadedProfile);
        profileRevisionByOrganization.current[orgId] = loadedProfile.updatedAt;
        profileSettingsRevisionByOrganization.current[orgId] = loadedProfile.profileRevision ?? 0;
        setOrganizationList(syncProfileIntoList(loadedOrganizationList, loadedProfile));
        suppressHydratedCollectionPersistence();
        setKnowledgeItems(loadedKnowledge);
        setKnowledgeCandidates(loadedCandidates);
        clearKnowledgeHistoryCache();
        setValidationRecords(loadedValidationRecords);
        setMemoryChangeRecords(loadedMemoryChangeRecords);
        let hydratedMetrics = loadedOrgMetrics ?? session.seedOrgMetrics();
        if (hydratedMetrics.openTickets === undefined && session.context.authority === "local") {
          hydratedMetrics = { ...hydratedMetrics, openTickets: countOpenTicketRecords(await session.loadTicketRecords()) };
        }
        setOrgMetrics({
          ...hydratedMetrics,
          organizationId: loadedOrgMetrics?.organizationId ?? orgId
        });
        setIntelligenceLog(loadedIntelligenceLog);
        setEmergingPatterns(loadedPatterns);
        setDarkMode(window.localStorage.getItem("maesa-theme") === "dark");
        setHydrated(true);
        setOrganizationBootstrapState("ready");
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to hydrate persistence state.", error);
        setErrorMessage("Failed to load persisted organization data. Hydration was left incomplete to avoid overwriting existing browser storage.");
        setOrganizationBootstrapState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  function reportPersistenceError(scope: string, error: unknown) {
    if (error instanceof ServerPersistenceAdapterError && error.code === "REVISION_CONFLICT") {
      console.warn(`Expected recoverable persistence conflict in ${scope}.`, error);
      setRevisionConflictNotice("This item was updated elsewhere. Reload the latest version before saving again.");
      setErrorMessage("Your change was not saved because the item changed elsewhere.");
      return;
    }
    console.error(`Persistence ${scope} failed.`, error);
    const detail = error instanceof Error ? error.message : "The browser could not persist the latest change.";
    setErrorMessage(`Persistence failed for ${scope}: ${detail}`);
    setMigrationWarning((current) => current ? `${current} Persistence failed for ${scope}: ${detail}` : `Persistence failed for ${scope}: ${detail}`);
  }

  function queuePersistenceSave(scope: string, operation: Promise<void>) {
    void operation.catch((error) => {
      reportPersistenceError(scope, error);
    });
  }

  /**
   * RSS-1.2S3: the only client-owned fields that may be written directly. All
   * authority (status, actor, timestamps, resolution, review and memory state)
   * is derived server-side.
   */
  function clientTicketFields(record: TicketRecord) {
    return {
      ticketId: record.ticketId,
      orgId: record.orgId,
      rawMessage: record.rawMessage,
      subject: record.subject,
      bulkUploadKey: record.bulkUploadKey ?? null,
      bulkEntryId: record.bulkEntryId ?? null
    };
  }

  /**
   * RSS-1.2S3: execute a server-owned ticket workflow transition. The server
   * validates the transition against the current workflow state and computes
   * every authoritative field; the client never writes state directly.
   */
  async function transitionTicket(ticketId: string, command: TicketWorkflowCommand): Promise<TicketRecord> {
    const organizationId = organizationProfile.id;
    const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/tickets/${encodeURIComponent(ticketId)}/transition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(command)
    });
    const payload = await response.json().catch(() => null) as { data?: TicketRecord; error?: { message?: string } } | null;
    if (!response.ok) {
      throw new Error(payload?.error?.message ?? `Ticket transition failed (${response.status}).`);
    }
    if (!payload?.data) throw new Error("Ticket transition returned no result.");
    try {
      await refreshOpenTicketMetric(organizationId);
    } catch (error) {
      reportPersistenceError("refreshOpenTicketMetric", error);
    }
    return payload.data;
  }

  function recordKnowledgeConflict(
    operation: string,
    error: unknown,
    resourceId: string,
    expectedRevision: number | null
  ) {
    if (!(error instanceof ServerPersistenceAdapterError) || error.code !== "REVISION_CONFLICT") return;
    setKnowledgeConflictRecovery({
      organizationId: organizationProfile.id,
      resourceId,
      operation,
      expectedRevision: error.details?.expectedRevision ?? expectedRevision,
      currentRevision: error.details?.currentRevision ?? null,
      localWorkPreserved: true,
      latestLoaded: false
    });
  }

  function queueInReviewDraftSave(record: TicketRecord, value: string) {
    const ticketId = record.ticketId;
    const state = draftSaveState.current[ticketId] ?? { record, value };
    state.value = value;
    draftSaveState.current[ticketId] = state;
    const previous = draftSaveChains.current[ticketId] ?? Promise.resolve();
    const operation = previous
      .catch(() => undefined)
      .then(async () => {
        const nextValue = state.value;
        const expectedDraftRevision = state.record.resolution.draftRevision ?? 0;
        let persisted: TicketRecord;
        if (persistenceMode === "local") {
          persisted = {
            ...state.record,
            resolution: {
              ...state.record.resolution,
              finalResponse: nextValue.trim() || null,
              humanEdited: true,
              resolvedAt: null,
              draftRevision: expectedDraftRevision + 1
            }
          };
          const session = await openPersistenceSession(record.orgId, "save-in-review-draft");
          await session.saveTicketRecord(persisted);
        } else {
          persisted = await transitionTicket(ticketId, {
            kind: "save_draft",
            finalResponse: nextValue,
            humanEdited: true,
            expectedDraftRevision
          });
        }
        state.record = persisted;
        if (state.value === nextValue && activeTicketRecord?.ticketId === ticketId) {
          setActiveTicketRecord(persisted);
        }
      });
    draftSaveChains.current[ticketId] = operation;
    queuePersistenceSave("saveInReviewDraft", operation);
  }

  function persistTicketRecord(record: TicketRecord) {
    const organizationId = record.orgId;
    const previous = ticketSaveChains.current[organizationId] ?? Promise.resolve();
    const operation = previous
      .catch(() => undefined)
      .then(async () => {
        if (persistenceMode === "local") {
          const session = await openPersistenceSession(organizationId, "save-ticket");
          await session.saveTicketRecord(record);
          return;
        }
        const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/tickets`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify([clientTicketFields(record)])
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
          throw new Error(body?.error?.message ?? `Ticket save failed (${response.status}).`);
        }
      });
    ticketSaveChains.current[organizationId] = operation;
    queuePersistenceSave("saveTicketRecord", operation);
  }

  function persistTicketRecords(records: TicketRecord[]) {
    for (const record of records) persistTicketRecord(record);
  }

  async function flushTicketSaves(organizationId: string): Promise<void> {
    await ticketSaveChains.current[organizationId];
    const draftTicketIds = Object.values(draftSaveState.current)
      .filter((state) => state.record.orgId === organizationId)
      .map((state) => state.record.ticketId);
    await Promise.all(draftTicketIds.map((ticketId) => draftSaveChains.current[ticketId] ?? Promise.resolve()));
  }

  async function flushDraftSave(ticketId: string): Promise<void> {
    await draftSaveChains.current[ticketId];
  }

  const loadCasePage = useCallback(
    (organizationId: string, request: TicketPageRequest) =>
      openPersistenceSession(organizationId, "load-ticket-page").then((session) => session.loadTicketPage(request)),
    []
  );

  /**
   * BUG-009: recover from a rejected stale organization-profile write.
   *
   * The server correctly rejects a stale profile PUT with 409 CONFLICT. Instead
   * of surfacing that as a persistence error and stranding the browser on an old
   * revision, load the server-authoritative profile, replace React state, and
   * refresh revision tracking so the next legitimate edit succeeds. The rejected
   * stale payload is NOT retried and conflicting edits are NOT auto-merged.
   */
  async function recoverFromStaleProfileConflict(error: unknown, savingOrgId: string, generation: number) {
    const isStaleConflict =
      error instanceof ServerPersistenceAdapterError && (error.status === 409 || error.code === "CONFLICT");
    if (!isStaleConflict) {
      reportPersistenceError("saveOrganizationProfile", error);
      return;
    }
    try {
      const session = await openPersistenceSession(savingOrgId, "recover-profile");
      const latest = await session.loadOrganizationProfile();
      // Race safety: abandon recovery if the user switched organizations while
      // the fetch was in flight, or if the authoritative profile no longer
      // belongs to the organization whose write was rejected. This prevents a
      // late recovery for Organization A from overwriting Organization B.
      if (generation !== organizationSwitchGeneration.current) return;
      if (latest.id !== savingOrgId) return;
      setOrganizationProfile(latest);
      profileRevisionByOrganization.current[latest.id] = latest.updatedAt;
      profileSettingsRevisionByOrganization.current[latest.id] = latest.profileRevision ?? 0;
      setProfileConflictNotice(
        "This organization profile was updated in another session. The latest version has been loaded. Please re-apply your change."
      );
    } catch (recoveryError) {
      if (generation !== organizationSwitchGeneration.current) return;
      reportPersistenceError("saveOrganizationProfile", recoveryError);
    }
  }

  function persistOrganizationProfile(profile: OrganizationProfile): Promise<void> {
    const snapshot = {
      ...profile,
      updatedAt: profileRevisionByOrganization.current[profile.id] ?? profile.updatedAt,
      profileRevision: profileSettingsRevisionByOrganization.current[profile.id] ?? profile.profileRevision ?? 0
    };
    const savingOrgId = snapshot.id;
    const generation = organizationSwitchGeneration.current;
    const previous = profileSaveChains.current[savingOrgId] ?? Promise.resolve();
    const operation = previous
      .catch(() => undefined)
      .then(async () => {
        const session = await openPersistenceSession(savingOrgId, "save-profile");
        return await session.saveOrganizationProfile(snapshot);
      })
      .then((saved) => {
        profileRevisionByOrganization.current[saved.id] = saved.updatedAt;
        profileSettingsRevisionByOrganization.current[saved.id] = saved.profileRevision ?? 0;
        setProfileConflictNotice("");
      })
      .catch(async (error) => {
        const isStaleConflict =
          error instanceof ServerPersistenceAdapterError && (error.status === 409 || error.code === "CONFLICT");
        if (isStaleConflict) {
          await recoverFromStaleProfileConflict(error, savingOrgId, generation);
          return;
        }
        reportPersistenceError("saveOrganizationProfile", error);
        throw error;
      });
    profileSaveChains.current[savingOrgId] = operation;
    return operation;
  }

  async function flushProfileSaves(organizationId: string): Promise<void> {
    await profileSaveChains.current[organizationId];
  }

  async function persistOrganizationState(orgId: string): Promise<void> {
    const session = await openPersistenceSession(orgId, "save-organization-state");
    await Promise.all([
      session.saveKnowledge(knowledgeItems),
      session.saveKnowledgeCandidates(knowledgeCandidates),
      session.saveOrgMetrics(orgMetrics),
      session.saveOrgLog(intelligenceLog),
      session.saveEmergingPatterns(emergingPatterns)
    ]);
  }

  async function loadOrganizationStateInternal(orgId: string) {
    const session = await openPersistenceSession(orgId, "load-organization-state");
    const [knowledge, candidates, validations, changes, loadedMetrics, log, patterns] = await Promise.all([
      session.loadKnowledge(),
      session.loadKnowledgeCandidates(),
      Promise.resolve([] as ValidationRecord[]),
      Promise.resolve([] as MemoryChangeRecord[]),
      session.loadOrgMetrics(),
      session.loadOrgLog(),
      session.loadEmergingPatterns()
    ]);
    return {
      knowledge,
      candidates,
      validations,
      changes,
      metrics: {
        ...(loadedMetrics ?? session.seedOrgMetrics()),
        organizationId: loadedMetrics?.organizationId ?? orgId
      },
      log,
      patterns
    };
  }

  // Validation and memory-change history persist through the validated-memory
  // commit boundary, never through partial client snapshots.
  useEffect(() => {
    if (persistenceMode === "local" && shouldPersistHydratedCollection("knowledge")) queuePersistenceSave("saveKnowledge", openPersistenceSession(organizationProfile.id, "save-knowledge").then((session) => session.saveKnowledge(knowledgeItems)));
  }, [knowledgeItems, organizationProfile.id, hydrated, persistenceMode]);

  useEffect(() => {
    if (shouldPersistHydratedCollection("candidates")) queuePersistenceSave("saveKnowledgeCandidates", openPersistenceSession(organizationProfile.id, "save-candidates").then((session) => session.saveKnowledgeCandidates(knowledgeCandidates)));
  }, [knowledgeCandidates, organizationProfile.id, hydrated]);

  useEffect(() => {
    if (shouldPersistHydratedCollection("metrics")) queuePersistenceSave("saveOrgMetrics", openPersistenceSession(organizationProfile.id, "save-metrics").then((session) => session.saveOrgMetrics(orgMetrics)));
  }, [orgMetrics, organizationProfile.id, hydrated]);

  useEffect(() => {
    if (shouldPersistHydratedCollection("log")) queuePersistenceSave("saveOrgLog", openPersistenceSession(organizationProfile.id, "save-log").then((session) => session.saveOrgLog(intelligenceLog)));
  }, [intelligenceLog, organizationProfile.id, hydrated]);

  useEffect(() => {
    if (shouldPersistHydratedCollection("patterns")) queuePersistenceSave("saveEmergingPatterns", openPersistenceSession(organizationProfile.id, "save-patterns").then((session) => session.saveEmergingPatterns(emergingPatterns)));
  }, [emergingPatterns, organizationProfile.id, hydrated]);

  useEffect(() => {
    // In server mode the organization list is authoritative membership data.
    // Persisting a whole stale list would replay old profile JSON into every
    // organization, so only the local shell may snapshot this legacy state.
    if (hydrated && persistenceMode === "local") queuePersistenceSave("saveOrganizationList", persistence.saveOrganizationList(organizationList));
  }, [organizationList, hydrated]);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem("maesa-theme", darkMode ? "dark" : "light");
  }, [darkMode, hydrated]);

  /* ---------- Helpers ---------- */

  function addLogEntries(entries: IntelligenceLogEntry[]) {
    setIntelligenceLog((prev) => [...prev, ...entries]);
  }

  function recordAIResults(
    results: Array<AIProviderResult<unknown>>,
    advisoryStatus?: AIAdvisoryStatus,
    agreementPct?: number,
    requestGeneration?: number
  ) {
    if (!ticketRequestIsCurrent(requestGeneration)) return;
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

  function updateMetricsInternal(updates: Partial<Record<keyof Metrics, number>>) {
    setMetrics((current) => {
      const next = { ...current };
      for (const [key, value] of Object.entries(updates) as Array<[keyof Metrics, number]>) {
        next[key] += value;
      }
      return next;
    });
  }

  function updateMetrics(updates: Partial<Record<keyof Metrics, number>>) {
    measureTelemetrySync("organization_metrics_update", "pipeline", () => updateMetricsInternal(updates), { unit: "operations" });
  }

  function recordOrgResolution(mode: ResolutionMode, opts?: { createdKnowledge?: boolean }) {
    const metricsSpan = startTelemetrySpan("organization_metrics_update", "pipeline", { unit: "operations" });
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
    metricsSpan.end(true);
  }

  function makeRecordId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // Reuse approvals are retried from the browser, so their durable identity
  // must be stable across renders and repeated clicks. This is intentionally
  // scoped to the approval tuple; ordinary learning commits remain unique.
  function stableReuseId(prefix: string, key: string): string {
    let hash = 2166136261;
    for (let index = 0; index < key.length; index += 1) {
      hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
    }
    return `${prefix}-${(hash >>> 0).toString(16)}`;
  }

  function snapshotKnowledgeItem(item: KnowledgeItem | null): KnowledgeItem | null {
    return item ? JSON.parse(JSON.stringify(item)) as KnowledgeItem : null;
  }

  function stampKnowledgeItemOrganization(item: KnowledgeItem): KnowledgeItem {
    return { ...item, organizationId: item.organizationId ?? organizationProfile.id };
  }

  function stampKnowledgeItemSnapshotOrganization(item: KnowledgeItem | null): KnowledgeItem | null {
    return item ? stampKnowledgeItemOrganization(snapshotKnowledgeItem(item)!) : null;
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

  async function applyValidatedMemoryChangeInternal(
    candidate: KnowledgeCandidate,
    beforeState: KnowledgeItem | null,
    afterState: KnowledgeItem,
    rationale = "Prototype knowledge validation",
    commitIdentity?: {
      validationId: string;
      memoryChangeId: string;
      idempotencyKey: string;
    }
  ): Promise<{
    validatedItem: KnowledgeItem;
    validatedCandidate: KnowledgeCandidate;
    validation: ValidationRecord;
    memoryChange: MemoryChangeRecord;
    replayed: boolean;
    trustApplied?: boolean;
    auditSummary: {
      organizationId: string;
      actorId?: string;
      actor: string;
      sourceTicketIds: string[];
      decision: ValidationRecord["decision"];
      changeType: MemoryChangeRecord["changeType"];
    };
  }> {
    if (validationCommitInFlight.current) {
      throw new Error("A validation commit is already in progress. Wait for it to finish before retrying.");
    }
    validationCommitInFlight.current = true;
    setIsValidationSubmitting(true);
    const timestamp = new Date().toISOString();
    const organizationId = candidate.organizationId ?? organizationProfile.id;
    const stampedAfterState = stampKnowledgeItemOrganization(afterState);
    const validation: ValidationRecord = {
      id: commitIdentity?.validationId ?? makeRecordId("validation"),
      organizationId,
      candidateId: candidate.id,
      knowledgeId: stampedAfterState.id,
      knowledgeVersionId: latestVersionId(stampedAfterState),
      decision: "approved",
      actor: "Prototype Knowledge Validator",
      roleExercised: "knowledge_validator",
      rationale,
      timestamp
    };
    const validatedCandidate: KnowledgeCandidate = { ...candidate, organizationId, status: "validated" };
    // Optimistic-concurrency bookkeeping for server persistence: the commit
    // asserts the pre-change revision and the state copy carries the bumped
    // one so consecutive commits against the same canonical problem chain.
    const expectedKnowledgeRevision = beforeState ? beforeState.revision ?? 0 : null;
    const validatedItem: KnowledgeItem = {
      ...stampKnowledgeItemOrganization(
        withValidationMetadata(stampedAfterState, validatedCandidate, validation)
      ),
      revision: (expectedKnowledgeRevision ?? 0) + 1
    };
    const memoryChange: MemoryChangeRecord = {
      id: commitIdentity?.memoryChangeId ?? makeRecordId("memory-change"),
      organizationId,
      knowledgeId: validatedItem.id,
      candidateId: validatedCandidate.id,
      validationRecordId: validation.id,
      changeType: validatedCandidate.proposedAction,
      beforeState: stampKnowledgeItemSnapshotOrganization(beforeState),
      afterState: stampKnowledgeItemSnapshotOrganization(validatedItem)!,
      timestamp
    };

    try {
      // The adapter owns the complete transition. React state is reconciled
      // only from the committed aggregate returned by that command.
      const learningSession = await openPersistenceSession(organizationId, "commit-validation", validation.id);
      const committed = await learningSession.commitValidatedMemoryChange({
        candidate: validatedCandidate,
        validation,
        memoryChange,
        knowledgeItem: validatedItem,
        expectedKnowledgeRevision,
        idempotencyKey: commitIdentity?.idempotencyKey ?? validation.id
      });
      const committedItem = committed.knowledgeItem;
      const committedCandidate = committed.candidate;
      const committedValidation = committed.validation;
      const committedMemoryChange = committed.memoryChange;
      setKnowledgeConflictRecovery(null);
      setRevisionConflictNotice("");
      // The governed commit already persisted the authoritative aggregate.
      // Do not echo that returned snapshot through the legacy collection-save
      // effects, which would turn a successful revision bump into a second
      // unsolicited write before the next approval can read it.
      suppressedHydrationPersistence.current.add("knowledge");
      suppressedHydrationPersistence.current.add("candidates");
      setKnowledgeCandidates((prev) => {
        const exists = prev.some((item) => item.id === committedCandidate.id);
        return exists
          ? prev.map((item) => (item.id === committedCandidate.id ? committedCandidate : item))
          : [...prev, committedCandidate];
      });
      const historyKey = `${organizationId}:${committedItem.id}`;
      const cachedHistory = knowledgeHistoryCache.current[historyKey];
      if (cachedHistory) {
        knowledgeHistoryCache.current[historyKey] = {
          validationRecords: mergeRecordsById(cachedHistory.validationRecords, [committedValidation]),
          memoryChangeRecords: mergeRecordsById(cachedHistory.memoryChangeRecords, [committedMemoryChange])
        };
      }
      setValidationRecords((prev) => mergeRecordsById(prev, [committedValidation]));
      setMemoryChangeRecords((prev) => mergeRecordsById(prev, [committedMemoryChange]));
      setKnowledgeItems((prev) => upsertCanonicalProblem(prev, committedItem));
      setSimilarKnowledge((prev) => prev.map((m) => (m.item.id === committedItem.id ? { ...m, item: committedItem } : m)));

      return {
        ...committed,
        validatedItem: committedItem,
        validatedCandidate: committedCandidate,
        validation: committedValidation,
        memoryChange: committedMemoryChange
      };
    } catch (error) {
      recordKnowledgeConflict(
        "commitValidatedMemoryChange",
        error,
        afterState.id,
        expectedKnowledgeRevision
      );
      reportPersistenceError("commitValidatedMemoryChange", error);
      throw error;
    } finally {
      validationCommitInFlight.current = false;
      setIsValidationSubmitting(false);
    }
  }

  async function applyValidatedMemoryChange(
    candidate: KnowledgeCandidate,
    beforeState: KnowledgeItem | null,
    afterState: KnowledgeItem,
    rationale = "Prototype knowledge validation",
    commitIdentity?: {
      validationId: string;
      memoryChangeId: string;
      idempotencyKey: string;
    }
  ) {
    return measureTelemetry(
      "knowledge_promotion",
      "pipeline",
      () => measureTelemetry(
        "validation_commit",
        "pipeline",
        () => measureTelemetry(
          "memory_change_commit",
          "pipeline",
          () => applyValidatedMemoryChangeInternal(candidate, beforeState, afterState, rationale, commitIdentity),
          { unit: "operations", tags: { action: candidate.proposedAction } }
        ),
        { unit: "operations", tags: { action: candidate.proposedAction } }
      ),
      { unit: "operations", tags: { action: candidate.proposedAction } }
    );
  }

  async function loadOrganizationState(orgId: string) {
    return measureTelemetry(
      "refresh",
      "ui",
      () => loadOrganizationStateInternal(orgId),
      { unit: "operations", tags: { organizationId: orgId } }
    );
  }

  async function reloadLatestKnowledge(): Promise<void> {
    const organizationId = organizationProfile.id;
    const generation = organizationSwitchGeneration.current;
    try {
      const session = await openPersistenceSession(organizationId, "reload-revision-conflict");
      const latest = await session.loadKnowledge();
      if (generation !== organizationSwitchGeneration.current || latest.some((item) => item.organizationId && item.organizationId !== organizationId)) return;
      suppressHydratedCollectionPersistence();
      setKnowledgeItems(latest);
      setSimilarKnowledge((current) => current.map((match) => {
        const refreshed = latest.find((item) => item.id === match.item.id);
        return refreshed ? { ...match, item: refreshed } : match;
      }));
      clearKnowledgeHistoryCache();
      setKnowledgeConflictRecovery((current) => current ? { ...current, currentRevision: latest.find((item) => item.id === current.resourceId)?.revision ?? current.currentRevision, latestLoaded: true } : current);
      setRevisionConflictNotice(
        knowledgeConflictRecovery
          ? "Latest server state loaded. Your unsaved review remains open; reconcile it with the latest version before retrying."
          : ""
      );
      setErrorMessage("");
    } catch (error) {
      reportPersistenceError("reloadLatestKnowledge", error);
    }
  }

  async function commitValidatedMemoryChange(
    candidate: KnowledgeCandidate,
    beforeState: KnowledgeItem | null,
    afterState: KnowledgeItem,
    rationale = "Prototype knowledge validation",
    commitIdentity?: {
      validationId: string;
      memoryChangeId: string;
      idempotencyKey: string;
    }
  ): Promise<KnowledgeItem> {
    return (await applyValidatedMemoryChange(candidate, beforeState, afterState, rationale, commitIdentity)).validatedItem;
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
      organizationId: organizationProfile.id,
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

  async function validateKnowledgePackCandidate(
    candidateId: string,
    draft: KnowledgePackCandidateDraft
  ): Promise<KnowledgeItem | null> {
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
    const result = await applyValidatedMemoryChange(
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

  async function analyzeUploadedQueriesInternal(
    entries: BulkUploadEntry[],
    onProgress: (progress: BulkAnalysisProgress) => void,
    signal: AbortSignal,
    uploadKey: string
  ) {
    const result = await analyzeBulkEntries({
      entries,
      organizationProfile,
      knowledgeItems,
      aiAdapter,
      onProgress,
      signal
    });
    const analyzedByEntry = new Map<string, { item: BulkAnalyzedQuery; clusterId: string }>();
    for (const cluster of result.clusters) {
      for (const item of cluster.items) analyzedByEntry.set(item.entry.id, { item, clusterId: cluster.id });
    }
    for (const item of result.unclustered.items) {
      analyzedByEntry.set(item.entry.id, { item, clusterId: result.unclustered.id });
    }
    const updates: TicketRecord[] = [];
    for (const entry of entries) {
      const prepared = bulkTicketRecords.current[`${uploadKey}:${entry.id}`];
      const analyzed = analyzedByEntry.get(entry.id);
      if (!prepared || !analyzed) throw new Error(`Durable bulk ticket missing analysis for uploaded row ${entry.id}.`);
      const language = resolveTicketLanguage(analyzed.item.ticket, organizationProfile);
      updates.push({
        ...prepared,
        bulkClusterId: analyzed.clusterId,
        status: "in_review",
          classification: {
          category: analyzed.item.understanding.category,
          intent: analyzed.item.understanding.intent ?? "unspecified",
          canonicalProblem: analyzed.item.canonicalProblem.title,
          classifiedBy: "deterministic",
          confidence: analyzed.item.confidence,
          inquiryType: analyzed.item.understanding.businessClassification?.inquiryType,
          businessIntent: analyzed.item.understanding.businessClassification?.intent,
          language: {
            detected: language.detection.language,
            confidence: language.detection.confidence,
            method: language.detection.method,
              responseLanguage: language.response.language
            }
          },
          memoryMatch: analyzed.item.existingMatch
            ? {
                knowledgeId: analyzed.item.existingMatch.item.id,
                matchType: analyzed.item.retrievedLessonId ? "lesson" : "template",
                lessonId: analyzed.item.retrievedLessonId ?? null,
                retrievalAudit: analyzed.item.retrievalAudit
              }
            : {
                knowledgeId: null,
                matchType: "none",
                lessonId: null,
                retrievalAudit: analyzed.item.retrievalAudit
              }
      });
    }
    // RSS-1.2S3: attach the deterministic analysis through a server-owned
    // transition; the server validates structure and org-scoped references and
    // derives the workflow state.
    for (const update of updates) {
      void transitionTicket(update.ticketId, {
        kind: "attach_analysis",
        classification: update.classification,
        memoryMatch: update.memoryMatch,
        bulkClusterId: update.bulkClusterId ?? null
      })
        .then((record) => { if (update.bulkEntryId) bulkTicketRecords.current[`${uploadKey}:${update.bulkEntryId}`] = record; })
        .catch((error) => reportPersistenceError("attachBulkAnalysis", error));
    }
    await flushTicketSaves(organizationProfile.id);
    for (const update of updates) bulkTicketRecords.current[`${uploadKey}:${update.bulkEntryId}`] = update;
    return result;
  }

  async function analyzeUploadedQueries(
    entries: BulkUploadEntry[],
    onProgress: (progress: BulkAnalysisProgress) => void,
    signal: AbortSignal,
    uploadKey: string
  ) {
    if (ASYNC_BULK_INTAKE_ENABLED) {
      const queued = await enqueueBulkJob(organizationProfile.id, uploadKey, entries, { idempotencyKey: uploadKey });
      let job = queued.data.job;
      while (true) {
        if (signal.aborted) {
          await cancelJob(organizationProfile.id, job.id).catch(() => undefined);
          throw new Error("Bulk analysis was cancelled.");
        }
        job = await getJob(organizationProfile.id, job.id);
        const stage = job.progress.stage;
        const phase: BulkAnalysisProgress["phase"] = stage === "clustering" ? "clustering" : stage === "succeeded" ? "complete" : "analyzing";
        onProgress({
          completed: Math.min(entries.length, job.progress.completed),
          total: job.progress.total ?? entries.length,
          currentLabel: job.progress.message ?? `Bulk job ${stage}`,
          percent: Math.min(100, Math.max(0, job.progress.percent)),
          phase
        });
        if (job.status === "succeeded") return bulkResult(job);
        if (["failed", "cancelled", "dead_lettered"].includes(job.status)) throw new Error(job.error?.safeMessage ?? `Bulk job ended in ${job.status}.`);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    const startedAt = Date.now();
    let lastProgressAt = startedAt;
    return measureTelemetry(
      "bulk_upload",
      "ui",
      () => analyzeUploadedQueriesInternal(entries, (progress) => {
        const now = Date.now();
        recordTelemetryEvent({
          name: "analysis_progress",
          category: "ui",
          durationMs: now - lastProgressAt,
          startedAt: lastProgressAt,
          endedAt: now,
          success: true,
          unit: "rows",
          tags: { phase: progress.phase, completed: progress.completed, total: progress.total }
        });
        lastProgressAt = now;
        onProgress(progress);
      }, signal, uploadKey),
      { unit: "rows", quantity: entries.length, tags: { rows: entries.length } }
    );
  }

  async function prepareBulkEntries(uploadKey: string, entries: BulkUploadEntry[]): Promise<void> {
    const bulkSession = await openPersistenceSession(organizationProfile.id, "prepare-bulk");
    const prepared = await bulkSession.prepareBulkTicketRecords(
      organizationProfile,
      entries.map((entry) => ({
        uploadKey,
        entryId: entry.id,
        rawMessage: entry.message,
        subject: entry.message.length > 80 ? `${entry.message.slice(0, 80)}…` : entry.message
      }))
    );
    if (prepared.length !== entries.length) {
      throw new Error(`Bulk persistence returned ${prepared.length} tickets for ${entries.length} uploaded rows.`);
    }
    for (const record of prepared) {
      bulkTicketRecords.current[`${uploadKey}:${record.bulkEntryId}`] = record;
    }
  }

  async function commitBulkCluster(cluster: BulkCluster, uploadKey: string): Promise<{
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
    const result = await applyValidatedMemoryChange(candidate, prepared.beforeState, prepared.afterState, prepared.rationale);
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
      const rec = bulkTicketRecords.current[`${uploadKey}:${item.entry.id}`];
      if (!rec) {
        throw new Error(`Durable bulk ticket missing for uploaded row ${item.entry.id}.`);
      }
      return {
        ...rec,
        bulkClusterId: cluster.id,
        classification: {
          category: item.understanding.category,
          intent: item.understanding.intent ?? "unspecified",
          canonicalProblem: item.canonicalProblem.title,
          classifiedBy: "deterministic" as const,
          confidence: "bulk",
          inquiryType: item.understanding.businessClassification?.inquiryType,
          businessIntent: item.understanding.businessClassification?.intent,
          // TODO-058A: bulk-committed tickets record language metadata on the
          // same terms as single tickets, so the field is never silently absent
          // depending on which intake path a ticket arrived through.
          language: (() => {
            const resolved = resolveTicketLanguage(item.ticket, organizationProfile);
            return {
              detected: resolved.detection.language,
              confidence: resolved.detection.confidence,
              method: resolved.detection.method,
              responseLanguage: resolved.response.language,
            };
          })(),
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
        // TODO-026: bulk clusters are committed through human validation.
        resolutionMode: "human" as const,
      };
    });
    // RSS-1.2S3: commit bulk cluster validation through a server-owned
    // transition. The server validates the validation-record and knowledge
    // references against this organization and derives the resolved state.
    for (const rec of bulkRecords) {
      void transitionTicket(rec.ticketId, {
        kind: "commit",
        validationRecordIds: rec.validationRecordIds ?? [],
        knowledgeId: rec.memoryMatch?.knowledgeId ?? null,
        action: rec.reflection?.decision ?? prepared.action,
        lessonCreatedId: rec.reflection?.lessonCreatedId ?? null,
        lessonReinforcedId: rec.reflection?.lessonReinforcedId ?? null,
        knowledgeChanged: rec.reflection?.knowledgeChanged ?? null,
        classification: rec.classification,
        memoryMatch: rec.memoryMatch
      })
        .then((record) => { if (rec.bulkEntryId) bulkTicketRecords.current[`${uploadKey}:${rec.bulkEntryId}`] = record; })
        .catch((error) => reportPersistenceError("commitBulkValidation", error));
    }
    await flushTicketSaves(organizationProfile.id);

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

  async function loadTicketRecordById(ticketId: string): Promise<TicketRecord> {
    const response = await fetch(`/api/organizations/${encodeURIComponent(organizationProfile.id)}/tickets?full=true`);
    const payload = await response.json().catch(() => null) as { data?: TicketRecord[]; error?: { message?: string } } | null;
    if (!response.ok) throw new Error(payload?.error?.message ?? `Could not load ticket ${ticketId}.`);
    const record = payload?.data?.find((item) => item.ticketId === ticketId);
    if (!record) throw new Error(`The persisted source ticket ${ticketId} was not found in this organization.`);
    return record;
  }

  async function persistReuseTicket(description: string): Promise<{ ticket: Ticket; record: TicketRecord }> {
    const idempotencyKey = stableReuseId("reuse-ticket", `${organizationProfile.id}|${description.trim()}`);
    const response = await fetch(`/api/organizations/${encodeURIComponent(organizationProfile.id)}/tickets/process`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        description: description.trim(),
        customerName: "Demo User",
        idempotencyKey
      })
    });
    const payload = await response.json().catch(() => null) as { data?: ProcessTicketResult; error?: { message?: string } } | null;
    if (!response.ok || !payload?.data?.ticket || !payload.data.persistedTicket) {
      throw new Error(payload?.error?.message ?? "The reuse ticket could not be persisted. Retry is safe.");
    }
    setSecondTicketRecord(payload.data.persistedTicket);
    draftSaveState.current[payload.data.persistedTicket.ticketId] = {
      record: payload.data.persistedTicket,
      value: payload.data.persistedTicket.resolution.finalResponse ?? ""
    };
    return { ticket: payload.data.ticket, record: payload.data.persistedTicket };
  }

  async function ensureReuseTicketResolved(ticketId: string, itemId: string, mode: ResolutionMode): Promise<TicketRecord> {
    let record = await loadTicketRecordById(ticketId);
    const reuseKey = `${organizationProfile.id}|${ticketId}|${itemId}|${mode}`;
    const evidenceKey = stableReuseId("reuse-evidence", reuseKey);
    const evidenceType: TicketResolutionEvidenceType = mode === "human" ? "manual_verified_resolution" : "agent_verification";
    let evidence = record.resolutionEvidence?.find((item) => item.idempotencyKey === evidenceKey);

    if (!evidence) {
      if (record.status === "resolved" || record.status === "discarded" || record.status === "rejected") {
        throw new Error("The persisted reuse ticket is already terminal without the required resolution evidence.");
      }
      record = await transitionTicket(ticketId, {
        kind: "attach_resolution_evidence",
        evidenceType,
        sourceMessageId: null,
        note: mode === "human"
          ? `Human-approved reuse of knowledge item ${itemId}; reviewer verification of reuse correctness, not customer confirmation.`
          : `Agent-verified reuse of knowledge item ${itemId}; this is not customer confirmation.`,
        idempotencyKey: evidenceKey
      });
      evidence = record.resolutionEvidence?.find((item) => item.idempotencyKey === evidenceKey);
    }

    if (!evidence) throw new Error("The reuse ticket did not return durable resolution evidence.");
    if (record.status !== "resolved") {
      record = await transitionTicket(ticketId, { kind: "resolve_with_evidence", evidenceId: evidence.id });
    }
    setSecondTicketRecord(record);
    return record;
  }

  /** Apply a successful resolution outcome to a knowledge item and record learning. */
  async function applyResolution(itemId: string, mode: ResolutionMode, evidenceTicket?: Ticket) {
    // A preceding Reflection commit may have advanced the canonical revision
    // while this workspace still holds the earlier hydrated snapshot. Reuse
    // must calculate its trust update from the authoritative current item so
    // the governed commit remains retryable rather than manufacturing a stale
    // client-side version.
    const latestKnowledge = await (await openPersistenceSession(organizationProfile.id, "load-reuse-knowledge")).loadKnowledge();
    const target = latestKnowledge.find((i) => i.id === itemId) ?? knowledgeItems.find((i) => i.id === itemId);
    if (!target) return;

    const sourceTicketId = evidenceTicket ? ticketReferenceId(evidenceTicket) : target.sourceTicketId;
    if (!sourceTicketId) throw new Error("A reuse approval requires a persisted source ticket.");
    const sourceRecord = evidenceTicket
      ? await ensureReuseTicketResolved(sourceTicketId, itemId, mode)
      : null;

    const targetWithEvidence = evidenceTicket
      ? mergeIntoCanonicalProblem(target, evidenceTicket, understandForProfile(evidenceTicket, organizationProfile), undefined, mode)
      : target;
    const result = recordResolution(targetWithEvidence, { mode, success: true }, organizationProfile, validationRecords);
    const reuseKey = `${organizationProfile.id}|${itemId}|${sourceTicketId}|${mode}`;
    const candidate = {
      ...createCandidate({
      action: "trust_update_only",
      sourceTicketIds: [sourceTicketId],
      solution: result.item.problemSummary ?? result.item.problem,
      customerResponseTemplate: result.item.customerResponseTemplate ?? result.item.approvedAnswer,
      internalGuidance: result.item.internalGuidance ?? result.item.problem,
      canonicalProblemTitle: result.item.canonicalProblemTitle ?? result.item.title,
      category: result.item.category,
      relatedKnowledgeId: itemId,
      rationale: `${mode === "automatic" ? "Automatic" : "Human-approved"} successful reuse updated trust from ${result.trustFrom} to ${result.trustTo}.`
      }),
      id: stableReuseId("reuse-candidate", reuseKey)
    };
    const committed = await applyValidatedMemoryChange(
      candidate,
      target,
      result.item,
      candidate.rationale,
      {
        validationId: stableReuseId("reuse-validation", reuseKey),
        memoryChangeId: stableReuseId("reuse-memory-change", reuseKey),
        idempotencyKey: stableReuseId("reuse-commit", reuseKey)
      }
    );
    const committedItem = committed.validatedItem;

    if (sourceRecord && !sourceRecord.validationRecordIds.includes(committed.validation.id)) {
      const committedTicket = await transitionTicket(sourceTicketId, {
        kind: "commit",
        validationRecordIds: [committed.validation.id],
        knowledgeId: committedItem.id,
        action: "trust_update_only",
        knowledgeChanged: committedItem.id,
        finalResponse: evidenceTicket ? result.item.customerResponseTemplate ?? result.item.approvedAnswer : undefined,
        automatic: mode === "automatic"
      });
      setSecondTicketRecord(committedTicket);
    }

    if (!committed.replayed) {
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
    return committed;
  }

  async function checkPatternDiscovery(ticket: Ticket, analysis: AIAnalysis, requestGeneration?: number) {
    const und = toUnderstanding(analysis);
    if (hasSpecificCanonicalMatch(und, knowledgeItems)) return;
    if (!ticketRequestIsCurrent(requestGeneration)) return;
    const patternInput = buildPatternDiscoveryInput({
      organizationId: organizationProfile.id,
      actorId: authUser?.id,
      sourceTicketId: ticketReferenceId(ticket),
      understandingSummary: und.coreProblem || und.summary,
      detectedSignals: und.detectedSignals,
      tags: und.tags,
      category: und.category,
      language: detectLanguage(`${ticket.subject} ${ticket.description}`).language
    });
    const patternKey = patternDiscoveryIdempotencyKey(organizationProfile.id, ticketReferenceId(ticket));
    try {
      const queued = await enqueuePatternDiscoveryJob(organizationProfile.id, patternInput, { idempotencyKey: patternKey, correlationId: `pattern-follow-up-${ticketReferenceId(ticket)}` });
      if (!ticketRequestIsCurrent(requestGeneration)) return;
      addLogEntries([createLogEntry("Pattern discovery queued", queued.data.replayed ? "Existing durable follow-up reused" : `Job ${queued.data.jobId} queued for background analysis`)]);
    } catch {
      addLogEntries([createLogEntry("Pattern discovery follow-up unavailable", "The ticket workflow remains authoritative; the durable follow-up can be retried by operations.")]);
    }
  }

  async function promotePattern(patternId: string) {
    const pattern = emergingPatterns.find((p) => p.id === patternId);
    if (!pattern) return;

    const newKnowledge = stampKnowledgeItemOrganization(promotePatternToCanonicalProblem(pattern));
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
    const committedItem = await commitValidatedMemoryChange(candidate, null, newKnowledge, candidate.rationale);
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
    setSelectedTicket(null);
    setSecondTicket(null);
    setSecondTicketRecord(null);
    setAiAnalysis(null);
    setSimilarKnowledge([]);
    setSuggestedResponse(null);
    setReviewedResponse("");
    setBusinessRelevance(null);
    setDomainClassification(null);
    setAiAdvisory(null);
    setSessionCreatedIds(new Set());
    setCustomSecondText("");
    setLastDraftUsedAI(false);
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

  /** Reset Session — clears the current workflow only. Org memory persists. */
  function resetSession() {
    cancelActiveTicketRequest();
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
    setActiveTicketRecord(updated);
    void transitionTicket(activeTicketRecord.ticketId, { kind: "discard" })
      .then((record) => setActiveTicketRecord(record))
      .catch((error) => reportPersistenceError("discardTicket", error));
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
   * draft source, and the durable work-in-progress response. We reconstruct
   * the runtime Ticket, aiAnalysis, and deterministic comparison draft; the
   * persisted response remains authoritative in the editor.
   *
   * Does NOT re-run classification or memory retrieval — the stored results
   * stand. Only the safe display layer is rebuilt.
   *
   * Active conversations resume in place. Resolved cases resume only when the
   * server has marked them Reflection-eligible after resolution evidence was
   * recorded; if a prepared Reflection exists the validation screen is
   * restored, otherwise the ticket resumes at human review so the existing
   * "Approve & Continue to Reflection" step can prepare it. This does not
   * reopen the conversation or weaken the evidence gate. Warns before
   * clobbering a different in-progress workspace.
   */
  function resumeTicketFromRecord(record: TicketRecord) {
    if (!ticketWorkflowResumable(record)) return;

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
    // F-1 / TODO-050: extract customer context from the persisted message so the
    // F-2 greeting safety net has a real (validated) name to substitute.
    const resumeContext = extractCustomerContext(record.rawMessage);
    const extractedName = resumeContext.senderName;
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
        senderName: extractedName,
        companyName: resumeContext.companyName,
        senderRole: resumeContext.senderRole
      },
      businessClassification:
        record.classification?.inquiryType === "business_inquiry" &&
        (record.classification.businessIntent === "product_information" ||
          record.classification.businessIntent === "company_information" ||
          record.classification.businessIntent === "general_business_inquiry" ||
          record.classification.businessIntent === "multilingual_support")
          ? {
              inquiryType: "business_inquiry",
              intent: record.classification.businessIntent,
              confidence: record.classification.confidence === "high" || record.classification.confidence === "medium" ? record.classification.confidence : "low",
              signals: []
            }
          : record.classification?.inquiryType === "operational_support"
          ? { inquiryType: "operational_support", intent: "operational_support", confidence: "low", signals: [] }
          : undefined
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

    const restoredBusinessMemory = reconstructedUnderstanding.businessClassification?.inquiryType === "business_inquiry"
      && reconstructedSimilarKnowledge[0]?.item.category === "Business Inquiry";
    const draft = reconstructedUnderstanding.businessClassification?.inquiryType === "business_inquiry" && !restoredBusinessMemory
      ? draftBusinessInquiryResponse(
          reconstructedTicket,
          reconstructedUnderstanding,
          organizationProfile,
          resolveTicketLanguage(reconstructedTicket, organizationProfile).response.language
        )
      : draftResponse(
          reconstructedTicket,
          reconstructedUnderstanding,
          reconstructedSimilarKnowledge[0] ?? null,
          organizationProfile,
          !restoredKnowledge
        );

    const reconstructedResponse: SuggestedResponse = {
      ticketId: record.ticketId,
      draftResponse: draft.draftResponse,
      basedOnKnowledgeIds: draft.basedOnKnowledgeIds,
      confidenceNote: draft.confidenceNote,
      source: draft.source,
      draftMode: reconstructedUnderstanding.businessClassification?.inquiryType === "business_inquiry" && !restoredBusinessMemory
        ? "memory_grounded"
        : record.memoryMatch?.matchType === "lesson"
        ? "lesson_grounded"
        : record.memoryMatch?.knowledgeId
        ? "memory_grounded"
        : "cold_start",
      groundingLabel: reconstructedUnderstanding.businessClassification?.inquiryType === "business_inquiry" && !restoredBusinessMemory
        ? "organization profile"
        : restoredKnowledge?.title ?? (record.memoryMatch?.knowledgeId ? "organizational memory" : "no organizational knowledge")
    };

    const reviewedText = record.status === "waiting_for_customer"
      ? ""
      : record.resolution.finalResponse && record.resolution.finalResponse.trim().length > 0
        ? record.resolution.finalResponse
        : draft.draftResponse;

    const preparedDecision = record.reflection.preparedDecision ?? null;
    setActiveTicketRecord(record);
    draftSaveState.current[record.ticketId] = { record, value: record.resolution.finalResponse ?? "" };
    setSelectedTicket(reconstructedTicket);
    setAiAnalysis(understandingToAnalysis(reconstructedUnderstanding));
    setSimilarKnowledge(reconstructedSimilarKnowledge);
    setSuggestedResponse(record.status === "waiting_for_customer" ? null : reconstructedResponse);
    setReviewedResponse(reviewedText);
    setBusinessRelevance(null);
    setDomainClassification(null);
    setAiAdvisory(null);
    setLastDraftUsedAI(false);
    setReuseMatchId(null);
    setReuseDecision(null);
    setReuseResponseText("");
    setReuseResolvedMode(null);
    setLastTrustDelta(0);
    setRunCount(0);
    setReflectionDecision(preparedDecision);
    setCustomSecondText("");
    setActiveView("tickets");
    setTicketIntakeMode("single");
    setCurrentStep(preparedDecision ? 7 : 5); // Restore prepared Reflection, otherwise Human Review / conversation waiting state
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

    const requestGeneration = ticketRequestGuard.current.begin();
    setIsRetryingDraft(true);
    try {
      const und = toUnderstanding(aiAnalysis);
      const canonicalProblem = identifyCanonicalProblem(und, organizationProfile);
      const topMatch = similarKnowledge.length > 0 ? similarKnowledge[0] : null;
      const draft = draftResponse(selectedTicket, und, topMatch, organizationProfile, !topMatch);
      const aiDraft = await requestDraftAdvisory(
        selectedTicket, und, canonicalProblem.title, topMatch,
        draft.draftResponse, draft.confidenceNote, draft.source ?? "deterministic", aiAdvisory, requestGeneration
      );
      if (!ticketRequestIsCurrent(requestGeneration)) return;

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
          fallbackNotice: "AI advisory unavailable — check that DeepSeek is configured or enable local LM Studio; a deterministic draft is shown."
        });
        addLogEntries([createLogEntry("AI draft retry failed", "All AI tiers unavailable")]);
      }
    } finally {
      setIsRetryingDraft(false);
    }
  }

  /** Reset Organization — wipes persisted memory and reseeds defaults. */
  async function resetOrganization() {
    cancelActiveTicketRequest();
    try {
      await flushTicketSaves(organizationProfile.id);
      const session = await openPersistenceSession(organizationProfile.id, "reset-organization");
      await session.resetOrganization();
    } catch (error) {
      reportPersistenceError("resetOrganization", error);
      return;
    }
    const seedSession = await openPersistenceSession(organizationProfile.id, "reset-seeds");
    setKnowledgeItems(seedSession.seedKnowledge().map((item) => ({ ...item, organizationId: organizationProfile.id })));
    setKnowledgeCandidates([]);
    clearKnowledgeHistoryCache();
    setValidationRecords([]);
    setMemoryChangeRecords([]);
    setOrgMetrics(seedSession.seedOrgMetrics());
    setIntelligenceLog([]);
    setEmergingPatterns(seedSession.seedEmergingPatterns());
    setActiveTicketRecord(null);
    resetWorkflowState();
    setCurrentStep(0);
  }

  function confirmAndResetOrganization() {
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(
        "Reset Organization will clear this organization's scoped memory, preserve the legacy backup, suppress automatic legacy re-import, and reseed defaults. Continue?"
      );
    if (confirmed) resetOrganization();
  }

  /**
   * TODO-058 Phase H: a reviewer corrects the detected language. The override is
   * authoritative (confidence 1) and re-resolves the response language through
   * the same organization policy, so a correction cannot bypass the policy.
   * Ticket metadata only — organizational memory is untouched.
   */
  function overrideTicketLanguage(language: SupportedLanguageCode) {
    if (!activeTicketRecord?.classification) return;
    const policy = resolveLanguagePolicy(organizationProfile);
    const response = resolveResponseLanguage(policy, { language, confidence: 1 });
    // RSS-1.2S3: the reviewer language decision is a server-owned transition;
    // the server records the authoritative classification.language metadata.
    void transitionTicket(activeTicketRecord.ticketId, { kind: "language", language })
      .then((record) => setActiveTicketRecord(record))
      .catch((error) => reportPersistenceError("overrideTicketLanguage", error));
    addLogEntries([
      createLogEntry(
        `Reviewer set ticket language: ${languageLabel(language)}`,
        `${activeTicketRecord.ticketId} — ${response.explanation}`
      ),
    ]);
  }

  function changeOrganizationProfile(profile: OrganizationProfile) {
    const normalizedProfile = normalizeOrganizationProfile(profile);
    setOrganizationProfile(normalizedProfile);
    setOrganizationList((list) => syncProfileIntoList(list, normalizedProfile));
    if (hydrated) queuePersistenceSave("saveOrganizationProfile", persistOrganizationProfile(normalizedProfile));
    setBusinessRelevance(null);
    setAiAdvisory(null);
    setErrorMessage("");
    addLogEntries([createLogEntry("Organization profile updated", `Representing ${normalizedProfile.name} (${normalizedProfile.industry})`)]);
  }

  async function selectOrganization(
    id: string,
    availableOrganizations: OrganizationProfile[] = organizationList,
    persistCurrent = true,
    authorizedOrganizationSet: OrganizationProfile[] = authorizedOrganizations
  ) {
    const found = availableOrganizations.find((org) => org.id === id);
    if (!found || found.id === organizationProfile.id) return false;
    if (!authorizedOrganizationSet.some((organization) => organization.id === found.id)) {
      setErrorMessage("You do not have access to that organization.");
      return false;
    }
    setOrganizationSwitching(true);
    const switchSpan = startTelemetrySpan("organization_switch", "ui", {
      unit: "operations",
      tags: { from: organizationProfile.id, to: found.id }
    });
    const generation = ++organizationSwitchGeneration.current;
    let authorizedContext: ActiveOrganizationContext | null = null;
    let serverTransitioned = false;

    // A switch drains only explicit resource queues. It never treats the
    // browser's loaded organization snapshot as pending work.
    try {
      if (persistCurrent) {
        await flushTicketSaves(organizationProfile.id);
        await flushProfileSaves(organizationProfile.id);
      }

      // Authorization and the authoritative context transition happen only
      // after pending resource-specific writes have settled. A failure above
      // therefore leaves both server and UI on the outgoing organization.
      const response = await fetch("/api/auth/active-organization", {
        method: "PUT",
        cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: found.id })
      });
      const payload = await response.json().catch(() => null) as {
        data?: { organization?: ActiveOrganizationContext | null };
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "You do not have access to that organization.");
      }
      authorizedContext = payload?.data?.organization ?? null;
      serverTransitioned = true;

      // Invalidate in-flight work only after the server accepted the context
      // transition. Late results cannot be applied to the incoming state.
      cancelActiveTicketRequest();
      clearKnowledgeHistoryCache();
      setHydrated(false);
      setErrorMessage("");
      setProfileConflictNotice("");
      setRevisionConflictNotice("");
      resetWorkflowState();

      // The incoming load creates a new immutable session and does not write
      // any resource belonging to the outgoing organization.
      const loaded = await loadOrganizationState(found.id);
      if (generation !== organizationSwitchGeneration.current) {
        switchSpan.end(false, { superseded: true });
        return false;
      }
      // TODO-056: the active-organization response is an authorization context,
      // not a profile. It confirms the switch was authorized for this id; the
      // complete profile comes from the organization list so no profile field
      // (threshold, revision, vocabulary) is left undefined after a switch.
      if (authorizedContext && authorizedContext.id !== found.id) {
        throw new Error("The authorized organization did not match the requested organization.");
      }
      const incomingProfile = found;
      setOrganizationProfile(incomingProfile);
      profileRevisionByOrganization.current[found.id] = incomingProfile.updatedAt;
      profileSettingsRevisionByOrganization.current[found.id] = incomingProfile.profileRevision ?? 0;
      setOrganizationList((current) => syncProfileIntoList(current, incomingProfile));
      suppressHydratedCollectionPersistence();
      setKnowledgeItems(loaded.knowledge);
      setKnowledgeCandidates(loaded.candidates);
      setValidationRecords(loaded.validations);
      setMemoryChangeRecords(loaded.changes);
      setOrgMetrics(loaded.metrics);
      setIntelligenceLog(loaded.log);
      setEmergingPatterns(loaded.patterns);
      setBusinessRelevance(null);
      setAiAdvisory(null);
      // Recompute the legacy-storage notice for the INCOMING organization so a
      // prior organization's warning never lingers. Server-authoritative orgs
      // clear it; local orgs surface it only when they still read memory history
      // from legacy storage. This is read-only — it never rewrites the marker.
      setMigrationWarning(
        persistenceMode === "local" && readsMemoryChangeHistoryFromLegacy(incomingProfile.id)
          ? LEGACY_MEMORY_FALLBACK_WARNING
          : ""
      );
      setHydrated(true);
      switchSpan.end(true);
      return true;
    } catch (error) {
      if (generation !== organizationSwitchGeneration.current) {
        switchSpan.end(false, { superseded: true });
        return false;
      }
      console.error("Failed to switch organization.", error);
      if (serverTransitioned) {
        // The authoritative server transition succeeded, but target hydration
        // did not. Reload from server authority rather than leaving a stale
        // outgoing client context beside an incoming server context.
        setErrorMessage("The organization changed but its workspace could not load. Reloading the authoritative organization context.");
        switchSpan.end(false, { recovery: "hard_reload" });
        window.location.reload();
        return false;
      }
      setErrorMessage(error instanceof Error ? error.message : "The organization switch was not completed.");
      switchSpan.end(false);
      return false;
    } finally {
      setOrganizationSwitching(false);
    }
  }

  async function addOrganization(input: NewOrganizationInput, idempotencyKey: string): Promise<void> {
    try {
      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          name: input.name,
          industry: input.industry,
          ...(input.description?.trim() ? { description: input.description } : {}),
          customerTone: input.tone,
          accentColor: input.accentColor,
          ...(input.initials.trim() ? { logoInitials: input.initials } : {})
        })
      });
      const payload = await response.json().catch(() => null) as {
        data?: { organization?: OrganizationProfile };
        error?: { message?: string };
      } | null;
      if (!response.ok || !payload?.data?.organization) {
        throw new Error(payload?.error?.message ?? "Organization creation failed.");
      }

      // The create response proves durable provisioning. Refresh the membership
      // projection before switching, so the RSS-2.1 authorization guard uses
      // authoritative server membership rather than a fabricated client entry.
      const organizationsResponse = await fetch("/api/organizations", { cache: "no-store" });
      const organizationsPayload = await organizationsResponse.json().catch(() => null) as {
        data?: OrganizationProfile[];
        error?: { message?: string };
      } | null;
      if (!organizationsResponse.ok || !Array.isArray(organizationsPayload?.data)) {
        throw new Error(organizationsPayload?.error?.message ?? "Organization was created but available organizations could not be refreshed.");
      }
      const authoritativeOrganizations = organizationsPayload.data;
      if (!authoritativeOrganizations.some((organization) => organization.id === payload.data!.organization!.id)) {
        throw new Error("Organization was created but its owner membership was not available.");
      }
      setAuthorizedOrganizations(authoritativeOrganizations);
      setOrganizationList(authoritativeOrganizations);
      const switched = await selectOrganization(payload.data.organization.id, authoritativeOrganizations, true, authoritativeOrganizations);
      if (!switched) throw new Error("Organization was created but the workspace could not be loaded. Please refresh.");
      setOrganizationBootstrapState("ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Organization creation failed.";
      setErrorMessage(message);
      throw error;
    }
  }

  async function deleteOrganization(id: string) {
    if (organizationList.length <= 1) return;
    const nextList = organizationList.filter((org) => org.id !== id);
    if (nextList.length === organizationList.length) return;
    try {
      await flushTicketSaves(id);
      if (id === organizationProfile.id && hydrated) {
        await persistOrganizationState(id);
      }
      // Route deletion through the DELETED organization's own authority so a
      // server-authoritative organization is removed from PostgreSQL and a
      // local-authoritative one from localStorage — never the wrong backend.
      const targetSession = await openPersistenceSession(id, "delete-organization");
      await targetSession.deleteOrganization();
      if (id === organizationProfile.id) {
        await selectOrganization(nextList[0].id, nextList, false);
      } else {
        await persistence.saveOrganizationList(nextList);
        setOrganizationList(nextList);
      }
    } catch (error) {
      reportPersistenceError("deleteOrganization", error);
    }
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
    return "AI assistant could not be reached.";
  }

  function draftModeLabel(mode: DraftGroundingMode, groundingLabel?: string): string {
    if (mode === "lesson_grounded") {
      return `AI draft grounded in validated lesson: ${groundingLabel ?? "matched lesson"}`;
    }
    if (mode === "memory_grounded") {
      return groundingLabel === "organization profile"
        ? "AI draft grounded in organization profile"
        : "AI draft grounded in organizational memory";
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

  function formatDraftFallbackNotice(
    source: SuggestedResponse["source"],
    reason?: string,
    diagnostics?: AIDiagnostics
  ): string {
    return source === "no_template"
      ? "AI assistant unavailable — no compatible organizational template exists; author the response for human review."
      : formatFallbackNotice(reason, diagnostics);
  }

  function summarizeFallbackReason(reason?: string, providerLabel?: string): string {
    const raw = reason?.trim();
    if (!raw) return "AI advisory unavailable.";
    if (/^(AI assistant unavailable|Still unavailable|AI advisory is disabled)/i.test(raw)) {
      return raw;
    }
    if (/\bfailed:\b/i.test(raw) && raw.length <= 180 && !/[<>]/.test(raw)) {
      return raw;
    }

    const normalizedProvider = providerLabel?.replace(/^AI Chain \((.+)\)$/i, "$1") ?? "AI provider";
    const lower = raw.toLowerCase();
    const status = raw.match(/\bHTTP\s+(\d{3})\b/i)?.[1] ?? raw.match(/\bstatus(?: code)?\s*:?\s*(\d{3})\b/i)?.[1];

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
    if (understanding.businessClassification?.inquiryType === "business_inquiry") {
      const unsupportedBusinessContent = [
        { label: "invented public link", pattern: /https?:\/\/|www\.|official website/i },
        { label: "invented attachment or brochure", pattern: /\b(?:attached|attachment|brochure|datasheet)\b/i },
        { label: "unsupported pricing detail", pattern: /\b(?:pricing|price|cost|per seat|per user)\b/i },
        { label: "unsupported integration claim", pattern: /\b(?:integration|integrations|integrate)\b/i },
        { label: "unsupported account-details request", pattern: /\b(?:account details|account information|account credentials)\b/i }
      ].find((rule) => rule.pattern.test(draft));
      if (unsupportedBusinessContent) {
        return `AI business draft included ${unsupportedBusinessContent.label}; only approved organization-profile facts are allowed.`;
      }
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
    matchedLesson?: LessonMatchResult | null,
    requestGeneration?: number
  ): Promise<KnowledgeMatch | null> {
    const validatedLessonMatch: LessonMatchResult | null =
      matchedLesson && isStrongLessonMatch(matchedLesson) ? matchedLesson : null;
    const validatedLessonLabel = validatedLessonMatch
      ? validatedLessonMatch.lesson.title ?? validatedLessonMatch.lesson.rootCause ?? "validated lesson"
      : null;
    const validationPayload = validatedLessonMatch ? buildDiscriminationLessonPayload(validatedLessonMatch) : undefined;

    const contradictedValidatedLesson =
      validatedLessonMatch && ticketContradictsLesson(ticket, validatedLessonMatch.lesson)
        ? validatedLessonMatch
        : null;

    if (validatedLessonMatch && validatedLessonLabel && !contradictedValidatedLesson) {
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

    if (contradictedValidatedLesson && validatedLessonLabel) {
      addLogEntries([
        createLogEntry(
          "Strong lesson match requires discrimination",
          `"${validatedLessonLabel}" matched strongly, but the ticket contains contradiction signals so AI discrimination still runs`
        )
      ]);
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

    if (!ticketRequestIsCurrent(requestGeneration)) return topMatch;
    recordAIResults([result], undefined, undefined, requestGeneration);

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

  /**
   * TODO-009 Step 2: semantic compatibility fallback for BUG-008 paraphrases.
   * Consulted ONLY when the deterministic compatibility gate produced zero
   * compatible matches. Evaluates the top retrieval candidate's validated
   * lessons through the existing AI discrimination layer; lib/drafting
   * re-verifies every deterministic veto before any reuse, so this can resolve
   * "unknown" but can never override a contradiction or known incompatibility.
   */
  async function requestSemanticCompatibilityFallback(
    ticket: Ticket,
    understanding: ReturnType<typeof understandForProfile>,
    retrievalMatches: KnowledgeMatch[],
    requestGeneration?: number
  ): Promise<{ match: KnowledgeMatch; authorization: SemanticLessonAuthorization } | null> {
    if (aiAdapter.config.mode === "disabled") return null;
    const candidate = retrievalMatches[0];
    if (!candidate) return null;

    const evaluation = await evaluateSemanticLessonCompatibility(aiAdapter.provider, ticket, understanding, candidate.item);
    if (!ticketRequestIsCurrent(requestGeneration)) return null;
    if (evaluation.aiResults.length > 0) recordAIResults(evaluation.aiResults, undefined, undefined, requestGeneration);
    if (!evaluation.authorization) {
      // Only log when the fallback actually consulted the LLM; silent
      // ineligibility (compatible/incompatible/unclassified) needs no entry.
      if (evaluation.aiResults.length > 0) {
        addLogEntries([
          createLogEntry(
            "Semantic compatibility fallback declined",
            evaluation.declineReason ?? "No confident semantic equivalence; keeping human-review path."
          )
        ]);
      }
      return null;
    }

    addLogEntries([
      createLogEntry(
        "Semantic compatibility fallback: validated lesson confirmed",
        `"${candidate.item.title}" — deterministic root-cause evidence was insufficient; AI discrimination confirmed the same underlying problem with high confidence.`
      ),
      createLogEntry("Semantic compatibility reasoning", evaluation.authorization.reasoning)
    ]);
    return { match: candidate, authorization: evaluation.authorization };
  }

  async function requestAnalysisAdvisory(
    ticket: Ticket,
    deterministicUnderstanding: ReturnType<typeof understandForProfile>,
    canonicalProblem: { title: string; problemSummary: string; category: string },
    requestGeneration?: number
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

    recordAIResults([analysisResult, canonicalResult], advisory.status, advisory.agreementPct, requestGeneration);
    return advisory;
  }

  async function requestDraftAdvisoryInternal(
    ticket: Ticket,
    understanding: ReturnType<typeof toUnderstanding>,
    canonicalProblemTitle: string,
    matchedKnowledge: KnowledgeMatch | null,
    deterministicDraft: string,
    deterministicConfidenceNote: string,
    deterministicSource: SuggestedResponse["source"],
    baseAdvisory: AIAdvisory | null,
    requestGeneration?: number,
    semanticAuthorization?: SemanticLessonAuthorization | null,
    conversationContext?: string
  ): Promise<{
    advisory: AIAdvisory | null;
    response: SuggestedResponse;
    usedAIDraft: boolean;
  }> {
    const isBusinessInquiry = understanding.businessClassification?.inquiryType === "business_inquiry";
    const isBusinessMemoryReuse = isBusinessInquiry && matchedKnowledge?.item.category === "Business Inquiry";
    const deterministicLessonMatch = matchedKnowledge ? findMatchingLesson(ticket, matchedKnowledge.item) : null;
    const semanticLesson = matchedKnowledge && semanticAuthorization
      ? matchedKnowledge.item.lessons?.find((lesson) => lesson.id === resolveLessonIdForItem(matchedKnowledge.item, semanticAuthorization.lessonId)) ?? null
      : null;
    const lessonMatch = deterministicLessonMatch;
    const groundingLesson = lessonMatch?.lesson ?? semanticLesson;
    const draftMode: DraftGroundingMode = isBusinessInquiry && !isBusinessMemoryReuse
      ? "memory_grounded"
      : groundingLesson
      ? "lesson_grounded"
      : matchedKnowledge && deterministicSource !== "no_template"
      ? "memory_grounded"
      : "cold_start";
    const groundingLabel =
      isBusinessInquiry && !isBusinessMemoryReuse
        ? "organization profile"
        : draftMode === "lesson_grounded"
        ? groundingLesson?.title ?? groundingLesson?.rootCause ?? "matched lesson"
        : draftMode === "memory_grounded"
        ? matchedKnowledge?.item.canonicalProblemTitle ?? matchedKnowledge?.item.title ?? "organizational memory"
        : "no organizational knowledge";
    const groundingContent =
      isBusinessInquiry && !isBusinessMemoryReuse
        ? deterministicDraft
        : draftMode === "lesson_grounded"
        ? groundingLesson
          ? normalizeReusableLessonTemplate(groundingLesson.customerResponse)
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
          fallbackNotice: isBusinessInquiry && !isBusinessMemoryReuse
            ? "AI assistant unavailable — showing a grounded organization-profile draft for human review."
            : formatDraftFallbackNotice(deterministicSource, defaultAvailabilityMessage(), baseAdvisory?.diagnostics),
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
      // TODO-058 Phase F: the provider is told which language to write in
      // rather than inferring it from the ticket, so every provider produces
      // the same policy-compliant language.
      responseLanguage: resolveTicketLanguage(ticket, organizationProfile).response,
      lessonGrounding: groundingLesson
        ? {
            rootCause: groundingLesson.rootCause,
            solution: groundingLesson.solution,
            customerResponse: normalizeReusableLessonTemplate(groundingLesson.customerResponse),
            matchedSignals: lessonMatch?.matchedSignals ?? groundingLesson.signals,
            doNotPromise: groundingLesson.doNotPromise
          }
        : undefined,
      deterministicDraft,
      matchedKnowledge,
      conversationContext
    });
    const enrichmentRequest: Promise<AIProviderResult<AIKnowledgeEnrichment>> =
      draftMode === "cold_start" || (isBusinessInquiry && !isBusinessMemoryReuse)
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
    if (!ticketRequestIsCurrent(requestGeneration)) {
      return {
        advisory: baseAdvisory,
        response: fallbackResponse,
        usedAIDraft: false
      };
    }

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

    recordAIResults([draftResult, enrichmentResult], nextAdvisory.status, nextAdvisory.agreementPct, requestGeneration);

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
        fallbackNotice: isBusinessInquiry && !isBusinessMemoryReuse
          ? "AI assistant unavailable or declined the draft — showing a grounded organization-profile draft for human review."
          : formatDraftFallbackNotice(
          deterministicSource,
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

  async function requestDraftAdvisory(
    ticket: Ticket,
    understanding: ReturnType<typeof toUnderstanding>,
    canonicalProblemTitle: string,
    matchedKnowledge: KnowledgeMatch | null,
    deterministicDraft: string,
    deterministicConfidenceNote: string,
    deterministicSource: SuggestedResponse["source"],
    baseAdvisory: AIAdvisory | null,
    requestGeneration?: number,
    semanticAuthorization?: SemanticLessonAuthorization | null,
    conversationContext?: string
  ) {
    return measureTelemetry(
      "ai_drafting",
      "pipeline",
      () => requestDraftAdvisoryInternal(
        ticket,
        understanding,
        canonicalProblemTitle,
        matchedKnowledge,
        deterministicDraft,
        deterministicConfidenceNote,
        deterministicSource,
        baseAdvisory,
        requestGeneration,
        semanticAuthorization,
        conversationContext
      ),
      { unit: "requests", tags: { providerMode: aiAdapter.config.mode } }
    );
  }

  function updateReviewedResponse(value: string) {
    setReviewedResponse(value);
    if (activeTicketRecord?.status === "in_review") {
      queueInReviewDraftSave(activeTicketRecord, value);
    }
  }

  async function sendAgentConversationResponse() {
    const current = activeTicketRecord;
    if (!current || current.status !== "in_review" || !reviewedResponse.trim() || isConversationSubmitting) return;
    setIsConversationSubmitting(true);
    try {
      await flushDraftSave(current.ticketId);
      const latest = draftSaveState.current[current.ticketId]?.record ?? current;
      const next = await transitionTicket(current.ticketId, {
        kind: "send_agent_message",
        finalResponse: reviewedResponse,
        humanEdited: true,
        expectedDraftRevision: latest.resolution.draftRevision ?? 0,
        idempotencyKey: `ui:agent:${current.ticketId}:${digestJobInput({ response: reviewedResponse })}`
      });
      setActiveTicketRecord(next);
      draftSaveState.current[current.ticketId] = { record: next, value: "" };
      setSuggestedResponse(null);
      setReviewedResponse("");
      addLogEntries([createLogEntry("Agent response sent", `${current.ticketId} is waiting for the customer`)]);
    } catch (error) {
      reportPersistenceError("sendAgentConversationResponse", error);
    } finally {
      setIsConversationSubmitting(false);
    }
  }

  async function addCustomerConversationReply(content: string) {
    const current = activeTicketRecord;
    if (!current || current.status !== "waiting_for_customer" || isConversationSubmitting) return;
    setIsConversationSubmitting(true);
    try {
      const next = await transitionTicket(current.ticketId, {
        kind: "append_customer_message",
        content,
        idempotencyKey: `ui:customer:${current.ticketId}:${digestJobInput({ content })}`
      });
      const messages = next.messages ?? [];
      const boundedContext = messages.slice(-8).map((message) => `${message.direction === "customer" ? "Customer" : "Agent"}: ${message.content}`).join("\n\n");
      const followUpTicket = selectedTicket
        ? { ...selectedTicket, description: boundedContext }
        : null;
      if (!followUpTicket || !aiAnalysis) {
        setActiveTicketRecord(next);
        setSuggestedResponse(null);
        setReviewedResponse("");
        return;
      }
      const followUpUnderstanding = toUnderstanding(aiAnalysis);
      const deterministicFollowUpDraft = draftResponse(
        followUpTicket,
        followUpUnderstanding,
        similarKnowledge[0] ?? null,
        organizationProfile,
        !similarKnowledge[0]
      );
      const followUpAdvisory = await requestDraftAdvisory(
        followUpTicket,
        followUpUnderstanding,
        identifyCanonicalProblem(followUpUnderstanding, organizationProfile).title,
        similarKnowledge[0] ?? null,
        deterministicFollowUpDraft.draftResponse,
        deterministicFollowUpDraft.confidenceNote,
        deterministicFollowUpDraft.source ?? "deterministic",
        aiAdvisory,
        undefined,
        undefined,
        boundedContext
      );
      const followUpDraft = followUpAdvisory.response;
      if (followUpAdvisory.usedAIDraft) {
        setAiAdvisory(followUpAdvisory.advisory);
        setLastDraftUsedAI(true);
      }
      setActiveTicketRecord(next);
      draftSaveState.current[current.ticketId] = { record: next, value: followUpDraft.draftResponse };
      setSelectedTicket(followUpTicket);
      setSuggestedResponse({
        ticketId: next.ticketId,
        draftResponse: followUpDraft.draftResponse,
        basedOnKnowledgeIds: followUpDraft.basedOnKnowledgeIds,
        confidenceNote: followUpDraft.confidenceNote,
        source: followUpDraft.source,
        draftMode: followUpDraft.draftMode,
        groundingLabel: followUpDraft.groundingLabel
      });
      setReviewedResponse(followUpDraft.draftResponse);
      queueInReviewDraftSave(next, followUpDraft.draftResponse);
      addLogEntries([createLogEntry("Customer follow-up received", `${current.ticketId} reopened with bounded conversation context`)]);
    } catch (error) {
      reportPersistenceError("addCustomerConversationReply", error);
    } finally {
      setIsConversationSubmitting(false);
    }
  }

  async function attachResolutionEvidence(sourceMessageId: string | null, evidenceType: TicketResolutionEvidenceType, note: string) {
    const current = activeTicketRecord;
    if (!current || current.status === "resolved" || current.status === "discarded" || isConversationSubmitting) return;
    setIsConversationSubmitting(true);
    try {
      const next = await transitionTicket(current.ticketId, {
        kind: "attach_resolution_evidence",
        evidenceType,
        sourceMessageId,
        note,
        idempotencyKey: `ui:evidence:${current.ticketId}:${evidenceType}:${sourceMessageId ?? "manual"}:${digestJobInput({ note })}`
      });
      setActiveTicketRecord(next);
      addLogEntries([createLogEntry("Resolution evidence recorded", `${evidenceType.replaceAll("_", " ")} attached to ${current.ticketId}`)]);
    } catch (error) {
      reportPersistenceError("attachResolutionEvidence", error);
    } finally {
      setIsConversationSubmitting(false);
    }
  }

  async function resolveWithEvidence(evidenceId: string) {
    const current = activeTicketRecord;
    if (!current || isConversationSubmitting) return;
    setIsConversationSubmitting(true);
    try {
      const next = await transitionTicket(current.ticketId, { kind: "resolve_with_evidence", evidenceId });
      setActiveTicketRecord(next);
      addLogEntries([createLogEntry("Case resolved with evidence", `${current.ticketId} is now eligible for Reflection validation`)]);
      if (reflectionDecision) setCurrentStep(7);
    } catch (error) {
      reportPersistenceError("resolveWithEvidence", error);
    } finally {
      setIsConversationSubmitting(false);
    }
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

  async function approveResponse() {
    if (!selectedTicket || !aiAnalysis || !reviewedResponse.trim()) {
      setErrorMessage("Review the response before approving it as knowledge.");
      return;
    }
    if (businessRelevance?.status === "out_of_scope") {
      setErrorMessage("Out-of-scope tickets cannot be approved into Organizational Memory.");
      return;
    }
    if (activeTicketRecord) await flushDraftSave(activeTicketRecord.ticketId);
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
    // TODO-058C: reflection needs to know whether the reply was rendered in a
    // different language from the organization's documentation, so a
    // policy-compliant translation is never mistaken for a rewritten answer.
    const reflectionLanguage = resolveTicketLanguage(selectedTicket, organizationProfile);
    const reflectionRequestId = `reflection-${ticketReferenceId(selectedTicket)}-${Date.now()}`;
    const reflectionIdempotencyKey = `reflection:${ticketReferenceId(selectedTicket)}:${digestJobInput({ reviewedResponse })}`;
    let reflection: ReflectionDecision;
    if (ASYNC_REFLECTION_ENABLED) {
      const queued = await enqueueReflectionJob(organizationProfile.id, {
        ticket: selectedTicket,
        understanding: und,
        reviewedResponse,
        existingMatch,
        selectedDraft: { draftMode: suggestedResponse?.draftMode, matchedLesson },
        languageContext: { responseLanguage: reflectionLanguage.response.language, internalLanguage: reflectionLanguage.policy.internalLanguage }
      }, { idempotencyKey: reflectionIdempotencyKey, correlationId: reflectionRequestId });
      let job = queued.data.job;
      while (true) {
        job = await getJob(organizationProfile.id, job.id);
        if (job.status === "succeeded") {
          reflection = reflectionResult(job).reflection;
          break;
        }
        if (["failed", "cancelled", "dead_lettered"].includes(job.status)) throw new Error(job.error?.safeMessage ?? `Reflection job ended in ${job.status}.`);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } else {
      const reflectionSession = await openPersistenceSession(organizationProfile.id, "generate-reflection", reflectionRequestId);
      reflection = measureTelemetrySync(
        "reflection",
        "pipeline",
        () => generateReflectionCommand({
          organizationId: organizationProfile.id,
          actor: { id: authUser?.id ?? "ui-reviewer", name: authUser?.name ?? "Prototype Knowledge Validator", email: authUser?.email },
          authority: reflectionSession.context.authority,
          requestId: reflectionRequestId,
          organizationProfile,
          ticket: selectedTicket,
          understanding: und,
          reviewedResponse,
          existingMatch,
          selectedDraft: { draftMode: suggestedResponse?.draftMode, matchedLesson },
          languageContext: { responseLanguage: reflectionLanguage.response.language, internalLanguage: reflectionLanguage.policy.internalLanguage }
        }).reflection,
        { unit: "tickets" }
      );
    }
    learningCommandContext.current = { requestId: reflectionRequestId, idempotencyKey: reflectionIdempotencyKey };
    setReflectionDecision(reflection);

    if (activeTicketRecord) {
      try {
        const prepared = await transitionTicket(activeTicketRecord.ticketId, {
          kind: "prepare_reflection",
          reflection
        });
        setActiveTicketRecord(prepared);
      } catch (error) {
        reportPersistenceError("prepareReflection", error);
        setErrorMessage("Reflection could not be saved for resume. Retry approval safely.");
        return;
      }
    }

    // Keep the ticket in the reviewable state until reflection is committed.
    // RSS-1.2S3's `approve` command is a terminal response approval, while
    // this customer journey still has a governed knowledge commit to perform.
    // The commit transition below records the final response and resolves the
    // ticket atomically with the validation/knowledge references.

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
    const lessonSignals = item.category === "Business Inquiry"
      ? [...new Set([...lessonDraft.signals, ...businessLessonSignalAliases(item.canonicalProblemTitle ?? item.title)])]
      : lessonDraft.signals;

    if (lessonDraft.mode === "new") {
      const lesson: Lesson = {
        id: `lesson-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        rootCause: lessonDraft.rootCause,
        solution: lessonDraft.solution,
        customerResponse: normalizedCustomerResponse,
        signals: lessonSignals,
        createdAt: now,
        sourceTicketId: createOpaqueProvenanceId(ticketId)
      };
      const merged = mergeLessonIntoExisting(existingLessons, lesson, item.canonicalProblemId ?? item.id);
      return { ...item, lessons: merged.lessons };
    }

    if (lessonDraft.mode === "improves_existing" && lessonDraft.existingLessonId) {
      const canonicalLessonId = resolveLessonIdForItem(item, lessonDraft.existingLessonId) ?? lessonDraft.existingLessonId;
      const updated = {
        ...item,
        lessons: existingLessons.map(l =>
          l.id === canonicalLessonId
          ? { ...l, rootCause: lessonDraft.rootCause, solution: lessonDraft.solution, customerResponse: normalizedCustomerResponse, signals: lessonSignals }
            : l
        )
      };
      return {
        ...updated,
        lessons: dedupeLessonCollection(updated.lessons ?? [], { dedupeLessonContent: true })
      };
    }

    return item;
  }

  /** Thin UI controller for the extracted reflection/learning commands. */
  async function confirmReflectionApplication(input?: ReflectionCommitInput) {
    if (!selectedTicket || !aiAnalysis || !reflectionDecision) return;
    if (activeTicketRecord?.status !== "resolved" || activeTicketRecord.reflection.validationEligible !== true) {
      setErrorMessage(activeTicketRecord?.reflection.validationEligibilityReason ?? "Resolution evidence is required before this Reflection can be validated.");
      setCurrentStep(7);
      return;
    }
    const context = learningCommandContext.current ?? {
      requestId: `reflection-${ticketReferenceId(selectedTicket)}-${Date.now()}`,
      idempotencyKey: `reflection:${ticketReferenceId(selectedTicket)}:${Date.now()}`
    };
    learningCommandContext.current = context;
    const lessonDraft = input?.lessonDraft;
    const resourcePersistence = await openPersistenceSession(organizationProfile.id, "promote-knowledge", context.requestId);
    const validation = validateReflectionCommand({
      organizationId: organizationProfile.id,
      actor: { id: authUser?.id ?? "ui-reviewer", name: authUser?.name ?? "Prototype Knowledge Validator", email: authUser?.email },
      authority: resourcePersistence.context.authority,
      requestId: context.requestId,
      reflection: reflectionDecision,
      lessonDraft,
      safetyContext: buildReflectionSafetyContext({
        customerName: selectedTicket.customerName,
        organizationName: organizationProfile.name,
        sourceTicketId: ticketReferenceId(selectedTicket),
        sourceTicketText: `${selectedTicket.subject} ${selectedTicket.description}`,
        extractedCustomerName: aiAnalysis.extractedFields?.senderName,
        extractedCompanyName: aiAnalysis.extractedFields?.companyName,
        reusableProblemName: input?.problemName
      })
    });
    if (!validation.accepted) {
      setErrorMessage(`Reflection rejected: ${validation.reasons.join(", ")} before promoting this lesson.`);
      setCurrentStep(7);
      return;
    }
    try {
      const result = await promoteKnowledgeCommand({
        organizationId: organizationProfile.id,
        actor: { id: authUser?.id ?? "ui-reviewer", name: authUser?.name ?? "Prototype Knowledge Validator", email: authUser?.email },
        authority: resourcePersistence.context.authority,
        requestId: context.requestId,
        idempotencyKey: context.idempotencyKey,
        organizationProfile,
        ticket: selectedTicket,
        understanding: toUnderstanding(aiAnalysis),
        reviewedResponse,
        suggestedResponse,
        reflection: reflectionDecision,
        lessonDraft: validation.normalizedLessonDraft,
        problemName: input?.problemName,
        knowledgeItems: knowledgeItemsRef.current,
        validationRecords,
        currentOrgMetrics: orgMetrics
      }, {
        persistence: resourcePersistence,
        onEvent: (event) => addLogEntries([createLogEntry(event.name, event.detail)])
      });
      const committedItem = result.knowledgeItem.revision === result.committed.knowledgeRevision
        ? result.knowledgeItem
        : { ...result.knowledgeItem, revision: result.committed.knowledgeRevision };
      setKnowledgeCandidates((prev) => {
        const exists = prev.some((item) => item.id === result.candidate.id);
        return exists ? prev.map((item) => item.id === result.candidate.id ? result.candidate : item) : [...prev, result.candidate];
      });
      setValidationRecords((prev) => mergeRecordsById(prev, [result.validation]));
      setMemoryChangeRecords((prev) => mergeRecordsById(prev, [result.memoryChange]));
      setKnowledgeItems((prev) => {
        const next = upsertCanonicalProblem(prev, committedItem);
        knowledgeItemsRef.current = next;
        return next;
      });
      setSimilarKnowledge((prev) => prev.map((match) => match.item.id === committedItem.id ? { ...match, item: committedItem } : match));
      if (result.action === "create_new") setSessionCreatedIds((prev) => new Set([...prev, committedItem.id]));
      setLastSavedKnowledgeId(committedItem.id);
      setLastTrustDelta(result.trustDelta);
      updateMetrics(result.metricsPatch);
      setOrgMetrics((prev) => ({ ...prev, ...result.orgMetricsPatch, lastUpdatedAt: new Date().toISOString() }));
      if (lastDraftUsedAI) recordHumanAcceptedAISuggestion();
      if (activeTicketRecord) {
        // RSS-1.2S3: the reflection-confirmed resolution is a server-owned
        // commit; the server validates the validation/knowledge references and
        // derives the resolved state. Await it so the UI cannot show a
        // successful reflection while the governed ticket commit is still
        // pending or has failed.
        try {
          const record = await transitionTicket(activeTicketRecord.ticketId, {
            kind: "commit",
            validationRecordIds: [result.validation.id],
            knowledgeId: committedItem.id,
            action: result.action,
            lessonCreatedId: result.ticketReflection.lessonCreatedId ?? null,
            lessonReinforcedId: result.ticketReflection.lessonReinforcedId ?? null,
            knowledgeChanged: result.ticketReflection.knowledgeChanged ?? null,
            finalResponse: reviewedResponse,
            automatic: false
          });
          setActiveTicketRecord(record);
        } catch (error) {
          reportPersistenceError("confirmReflection", error);
          setCurrentStep(7);
          return;
        }
      }
      addLogEntries([
        createLogEntry("Reflection confirmed", `${result.action.replace(/_/g, " ")} · ${committedItem.title}`),
        createLogEntry("Validation record created", result.validation.id),
        createLogEntry("Memory change recorded", result.memoryChange.id),
        ...(result.ticketReflection.lessonCreatedId ? [createLogEntry("Lesson authored", result.ticketReflection.lessonCreatedId)] : []),
        ...(result.ticketReflection.lessonReinforcedId ? [createLogEntry("Lesson strengthened", result.ticketReflection.lessonReinforcedId)] : [])
      ]);
      setErrorMessage("");
      setKnowledgeConflictRecovery(null);
      setRevisionConflictNotice("");
      setCurrentStep(8);
    } catch (error) {
      if (error instanceof LearningApplicationError) {
        if (error.failure.errorClass === "stale_revision") {
          const resourceId = reflectionDecision?.existingItemId ?? "selected knowledge item";
          const expectedRevision = knowledgeItems.find((item) => item.id === resourceId)?.revision ?? null;
          setKnowledgeConflictRecovery({
            organizationId: organizationProfile.id,
            resourceId,
            operation: "promoteKnowledge",
            expectedRevision,
            currentRevision: typeof error.failure.diagnosticMetadata?.currentRevision === "number" ? error.failure.diagnosticMetadata.currentRevision : null,
            localWorkPreserved: true,
            latestLoaded: false
          });
          console.warn("Expected recoverable learning promotion conflict.", error);
          setRevisionConflictNotice("This item was updated elsewhere. Reload the latest version before saving again.");
          setErrorMessage("Your change was not saved because the item changed elsewhere.");
        } else {
          setErrorMessage(error.failure.safeMessage);
        }
      }
      else {
        reportPersistenceError("promoteKnowledge", error);
        setErrorMessage("Knowledge promotion failed. No success state was applied; retry is safe.");
      }
      setCurrentStep(7);
    }
  }

  // Retained temporarily for parity comparison while the extracted command
  // path is exercised; it is not wired to the UI. Remove after TODO-069 parity
  // evidence is archived.
  async function confirmReflectionLegacy(input?: ReflectionCommitInput) {
    if (!selectedTicket || !aiAnalysis || !reflectionDecision) return;
    const commitSpan = startTelemetrySpan("commit", "ui", { unit: "operations" });

    try {
    const und = toUnderstanding(aiAnalysis);
    const now = new Date().toISOString();
    const lessonDraft = input?.lessonDraft;
    if (lessonDraft) {
      const safety = assessReflectionSafety(lessonDraft, {
        customerName: selectedTicket.customerName,
        organizationName: organizationProfile.name,
        sourceTicketId: ticketReferenceId(selectedTicket),
        sourceTicketText: `${selectedTicket.subject} ${selectedTicket.description}`
      });
      if (!safety.safe) {
        setErrorMessage(`Reflection rejected: remove ${safety.issues.join(", ")} before promoting this lesson.`);
        commitSpan.end(false);
        return;
      }
    }
    let committedItemForReflection: KnowledgeItem | null = null;
    // Keep the transactional identifiers in this closure. React state updates
    // are asynchronous, so deriving ticket audit links from validationRecords
    // immediately after a commit can otherwise produce an apparently resolved
    // ticket with empty validationRecordIds/knowledgeChanged fields.
    let committedValidationId: string | null = null;

    if (reflectionDecision.action === "create_new") {
      const problemName = input?.problemName?.trim();
      const isUncategorized = !!reflectionDecision.problemNameRequired;
      const businessIntent = und.businessClassification?.intent;
      const isBusinessInquiry = und.businessClassification?.inquiryType === "business_inquiry";
      const businessTitle = businessIntent === "multilingual_support"
        ? "Multilingual Support Inquiry"
        : businessIntent === "company_information"
        ? "Company Information Inquiry"
        : businessIntent === "general_business_inquiry"
        ? "General Business Inquiry"
        : "Product Information Inquiry";
      const canonicalProblemTitle = isBusinessInquiry
        ? businessTitle
        : isUncategorized ? problemName : identifyCanonicalProblem(und, organizationProfile).title;
      if (isUncategorized && !canonicalProblemTitle) {
        setErrorMessage("Name the new problem in Reflection before committing it to Organizational Memory.");
        commitSpan.end(false);
        return;
      }
      const derivedCategory = isBusinessInquiry
        ? "Business Inquiry"
        : isUncategorized
        ? "Uncategorized"
        : und.category;
      const canonicalCustomerResponse = lessonDraft?.customerResponse?.trim() || reviewedResponse;
      const businessTags = isBusinessInquiry
        ? businessLessonSignalAliases(canonicalProblemTitle!, businessIntent)
        : [];
      const candidate = createCandidate({
        action: "create_new",
        sourceTicketIds: [ticketReferenceId(selectedTicket)],
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
        isBusinessInquiry
          ? {
              title: canonicalProblemTitle,
              category: "Business Inquiry",
              problemSummary: lessonDraft?.rootCause ?? und.coreProblem,
              tags: [...new Set([...und.tags, ...businessTags])]
            }
          : isUncategorized
          ? {
              title: canonicalProblemTitle,
              category: derivedCategory,
              problemSummary: lessonDraft?.rootCause ?? und.coreProblem,
              tags: [...new Set([...und.tags, ...canonicalProblemTitle!.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2)])]
            }
          : undefined
      );
      if (lessonDraft) newItem = applyLessonToItem(newItem, { ...lessonDraft, mode: "new" }, ticketReferenceId(selectedTicket), now);
      const committedResult = await applyValidatedMemoryChange(candidate, null, newItem, reflectionDecision.rationale);
      const committedItem = committedResult.validatedItem;
      committedValidationId = committedResult.validation.id;
      committedItemForReflection = committedItem;
      setSessionCreatedIds((prev) => new Set([...prev, committedItem.id]));
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
            sourceTicketIds: [ticketReferenceId(selectedTicket)],
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
        if (lessonDraft) merged = applyLessonToItem(merged, lessonDraft, ticketReferenceId(selectedTicket), now);
        const committedResult = await applyValidatedMemoryChange(candidate, target, merged, reflectionDecision.rationale);
        const committedItem = committedResult.validatedItem;
        committedValidationId = committedResult.validation.id;
        committedItemForReflection = committedItem;
        setSessionCreatedIds((prev) => new Set([...prev, committedItem.id]));
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
          sourceTicketIds: [ticketReferenceId(selectedTicket)],
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
            createGeneralizedEvidenceExample(
              ticketReferenceId(selectedTicket),
              base.problemSummary ?? base.problem,
              "human"
            )
          ],
          knowledgeVersions: updatesGenericTemplate
            ? [
                ...(base.knowledgeVersions ?? []),
                {
                  versionId: `${base.canonicalProblemId}-v${newVersionNum}`,
                  version: newVersionNum,
                  createdAt: now,
                  changeReason: reflectionDecision.versionReason ?? "Human review introduced an improved response",
                  sourceTicketId: ticketReferenceId(selectedTicket),
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
        if (lessonDraft) evolved = applyLessonToItem(evolved, lessonDraft, ticketReferenceId(selectedTicket), now);
        const committedResult = await applyValidatedMemoryChange(candidate, target, evolved, reflectionDecision.versionReason ?? reflectionDecision.rationale);
        const committedItem = committedResult.validatedItem;
        committedValidationId = committedResult.validation.id;
        committedItemForReflection = committedItem;
        setSessionCreatedIds((prev) => new Set([...prev, committedItem.id]));
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
            sourceTicketIds: [ticketReferenceId(selectedTicket)],
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
          if (lessonDraft) trustItem = applyLessonToItem(trustItem, lessonDraft, ticketReferenceId(selectedTicket), now);
          const committedResult = await applyValidatedMemoryChange(candidate, target, trustItem, reflectionDecision.rationale);
          const committedItem = committedResult.validatedItem;
          committedValidationId = committedResult.validation.id;
          committedItemForReflection = committedItem;
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
      const lessonDraftFingerprint = lessonDraft?.mode === "new"
        ? lessonContentFingerprint({
            rootCause: lessonDraft.rootCause,
            solution: lessonDraft.solution,
            customerResponse: normalizeReusableLessonTemplate(lessonDraft.customerResponse)
          })
        : null;
      const lessonCreated = lessonDraft?.mode === "new"
        ? committedItemForReflection?.lessons?.find((lesson) => lessonContentFingerprint(lesson) === lessonDraftFingerprint)?.id ?? null
        : null;
      const lessonReinforced = lessonDraft?.mode === "improves_existing" ? lessonDraft.existingLessonId ?? null : null;
      const validationRecordIds = committedValidationId
        ? [committedValidationId]
        : validationRecords
            .filter((v) => v.candidateId && knowledgeCandidates.some(
              (c) => c.id === v.candidateId && c.sourceTicketIds.includes(ticketReferenceId(selectedTicket))
            ))
            .map((v) => v.id);
      const knowledgeChanged = committedItemForReflection?.id ?? lastSavedKnowledgeId ?? null;
      const updated: TicketRecord = {
        ...activeTicketRecord,
        reflection: {
          decision: reflectionDecision.action,
          lessonCreatedId: lessonCreated,
          lessonReinforcedId: lessonReinforced,
          knowledgeChanged,
        },
        validationRecordIds,
        status: "resolved",
        // TODO-026: the primary review workspace resolves through human approval.
        resolutionMode: "human",
      };
      setActiveTicketRecord(updated);
      // RSS-1.2S3: resolve through a server-owned commit; the server validates
      // the validation/knowledge references and derives the resolved state.
      void transitionTicket(activeTicketRecord.ticketId, {
        kind: "commit",
        validationRecordIds,
        knowledgeId: knowledgeChanged,
        action: reflectionDecision.action,
        lessonCreatedId: lessonCreated ?? null,
        lessonReinforcedId: lessonReinforced ?? null,
        knowledgeChanged,
        automatic: false
      })
        .then((record) => setActiveTicketRecord(record))
        .catch((error) => reportPersistenceError("resolveTicket", error));
    }

    setErrorMessage("");
    setCurrentStep(8);
    commitSpan.end(true);
    } catch {
      // The authoritative command rejected or failed. Keep the review open so
      // the reviewer can retry; no success state or resolved ticket is shown.
      setCurrentStep(7);
      commitSpan.end(false);
    }
  }

  /**
   * Process the second (reuse) ticket. Retrieves memory, evaluates trust, and
   * either auto-resolves at the active profile threshold or routes to human approval.
   * Calling again with the same ticket lets judges watch trust climb to auto-resolution.
   */
  async function processSecondTicket(customText?: string) {
    const requestedSecond =
      customText && customText.trim().length >= 5
        ? makeCustomTicket(customText.trim())
        : secondTicket;
    if (!requestedSecond) {
      setErrorMessage("Type a support issue in the text box below to test memory reuse.");
      return;
    }
    const requestGeneration = ticketRequestGuard.current.begin();

    const relevance = assessBusinessRelevanceForProfile(`${requestedSecond.subject} ${requestedSecond.description}`, organizationProfile);
    setBusinessRelevance(relevance);

    if (!relevance.isRelevant && relevance.status === "out_of_scope") {
      setSecondTicket({ ...requestedSecond, status: "new" });
      setSecondTicketRecord(null);
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

    let second = requestedSecond;
    let persistedSecondRecord = secondTicketRecord;
    if (customText && customText.trim().length >= 5) {
      const persisted = await persistReuseTicket(customText.trim());
      second = persisted.ticket;
      persistedSecondRecord = persisted.record;
    } else if (!second.ticketId || !persistedSecondRecord || persistedSecondRecord.ticketId !== second.ticketId) {
      if (!second.ticketId) {
        throw new Error("The reuse ticket is not persisted. Submit it through the ticket workflow before approval.");
      }
      persistedSecondRecord = await loadTicketRecordById(second.ticketId);
      setSecondTicketRecord(persistedSecondRecord);
    }

    // Business Domain Classification for reuse ticket
    const reuseDomain = classifyBusinessDomain(
      `${second.subject} ${second.description}`,
      second.id,
      organizationProfile
    );
    setDomainClassification(reuseDomain);

    const und = understandForProfile(second, organizationProfile);
    const businessRouting = routeBusinessInquiryUnderstanding(und);
    const routedUnderstanding = businessRouting.understanding;
    const canonicalProblem = businessRouting.canonicalProblem ?? identifyCanonicalProblem(routedUnderstanding, organizationProfile);
    const advisory = await requestAnalysisAdvisory(second, routedUnderstanding, {
      title: canonicalProblem.title,
      problemSummary: canonicalProblem.problemSummary,
      category: canonicalProblem.category
    }, requestGeneration);
    if (!ticketRequestIsCurrent(requestGeneration)) return;
    const enrichedUnderstanding = applyAdvisoryExtractedFields(routedUnderstanding, advisory);
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
    const compatibleMatches = matches.filter((m) => isRetrievalCandidateEligible(enrichedUnderstanding, m.item, second));
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
    let reuseValidationHistory: ValidationRecord[] = [];
    try {
      reuseValidationHistory = (await ensureKnowledgeHistory(organizationProfile.id, reusedMatch.item.id)).validationRecords;
    } catch (error) {
      reportPersistenceError("loadKnowledgeHistory", error);
    }
    if (!ticketRequestIsCurrent(requestGeneration)) return;
    const trust = evaluateTrust(reusedMatch.item, organizationProfile, reuseValidationHistory);
    // LLM discrimination on the reuse candidate — prevents false-positive memory reuse
    setDiscriminationReasoning(null);
    setDiscriminatedMatchTitle(null);
    const effectiveReuseMatch =
      reusedLessonMatch &&
      isStrongLessonMatch(reusedLessonMatch) &&
      !ticketContradictsLesson(second, reusedLessonMatch.lesson)
      ? reusedMatch
      : await requestMatchDiscrimination(second, reusedMatch, enrichedUnderstanding, reusedLessonMatch ?? undefined, requestGeneration);
    if (!ticketRequestIsCurrent(requestGeneration)) return;

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
    const aiDraft = await requestDraftAdvisory(second, enrichedUnderstanding, canonicalProblem.title, effectiveReuseMatch, draft.draftResponse, draft.confidenceNote, draft.source ?? "deterministic", advisory, requestGeneration);
    if (!ticketRequestIsCurrent(requestGeneration)) return;
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
    setSimilarKnowledge(moveMatchToFront(compatibleMatches, effectiveReuseMatch.item.id));
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
        `Top candidate: "${effectiveReuseMatch.item.title}" — intrinsic relevance retained for ranking`
      ),
      createLogEntry(`Trust evaluated: ${trust.score}/100 → ${trust.decisionLabel}`, `Maturity: ${trust.maturity}`),
      isUnknownIssue
        ? createLogEntry("Auto-resolution blocked", "Unknown issues must always go through human review before learning")
        : draftSource === "ai_advisory" && trust.decision === "auto_resolution"
        ? createLogEntry("AI draft requires human review", "Fresh AI advisory text cannot use the automatic-resolution path")
        : createLogEntry("Draft source checked", draftSource === "ai_advisory" ? "AI advisory draft held for review" : "Deterministic validated template")
    ]);

    if (effectiveReuseDecision === "auto_resolution") {
      addLogEntries([createLogEntry("Auto-resolution path", `Trust >= ${organizationProfile.autoResolutionThreshold} - validated template rendered from organizational memory`)]);
      await applyResolution(effectiveReuseMatch.item.id, "automatic", second);
      setReuseResolvedMode("automatic");
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

    await checkPatternDiscovery(second, secondAnalysis, requestGeneration);
    if (!ticketRequestIsCurrent(requestGeneration)) return;

    setErrorMessage("");
    setCurrentStep(8);
  }

  /** Human approves the reuse — records a human-approved successful resolution (+trust). */
  async function approveReuse() {
    if (!reuseMatchId || !secondTicket?.ticketId || reuseResolvedMode !== null) return;
    try {
      await applyResolution(reuseMatchId, "human", secondTicket);
      setReuseResolvedMode("human");
      if (lastDraftUsedAI) {
        recordHumanAcceptedAISuggestion();
      }
      addLogEntries([createLogEntry("Human approved reuse", "Knowledge confirmed correct — trust increased")]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "The reuse approval could not be persisted.";
      setErrorMessage(`Reuse approval was not committed: ${detail}`);
    }
  }

  /** Submit a ticket to the transport-independent application service. */
  async function processTicketPipeline(text: string, curatedScenario?: CuratedDeveloperDemoScenario) {
    if (!text.trim() || isProcessing) return;
    const requestGeneration = ticketRequestGuard.current.begin();
    const abortController = new AbortController();
    ticketAbortController.current = abortController;
    setIsProcessing(true);
    setErrorMessage("");
    setCurrentStep(1);
    const profile = normalizeOrganizationProfile(organizationProfile);
    const requestId = `ticket-request-${profile.id}-${Date.now()}-${requestGeneration}`;
    try {
      // RSS-1.2S3: interactive ticket processing runs on the server, which
      // derives every authoritative field (actor, status, timestamps,
      // classification, memory references, workflow state). The client only
      // submits the ticket's facts.
      const response = await fetch(`/api/organizations/${encodeURIComponent(profile.id)}/tickets/process`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          description: text.trim(),
          ...(curatedScenario ? { subject: curatedScenario.ticketSubject, customerName: "Demo User" } : { customerName: "Demo User" }),
          idempotencyKey: `ui:${requestId}`
        })
      });
      const payload = await response.json().catch(() => null) as { data?: ProcessTicketResult; error?: { message?: string } } | null;
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Ticket processing failed. Retry is safe.");
      }
      const result = payload?.data;
      if (!result) throw new Error("Ticket processing returned no result. Retry is safe.");
      if (!ticketRequestIsCurrent(requestGeneration)) return;
      setSelectedTicket(result.ticket);
      setActiveTicketRecord(result.persistedTicket);
      draftSaveState.current[result.persistedTicket.ticketId] = { record: result.persistedTicket, value: result.persistedTicket.resolution.finalResponse ?? "" };
      setBusinessRelevance(result.businessRelevance);
      setDomainClassification(result.domainClassification);
      setAiAnalysis(result.analysis);
      setAiAdvisory(result.advisory);
      setSimilarKnowledge(result.similarKnowledge);
      setSuggestedResponse(result.draft);
      setReviewedResponse(result.draft.source === "no_template" ? "" : result.draft.draftResponse);
      setLastDraftUsedAI(result.draft.source === "ai_advisory");
      setDiscriminationReasoning(null);
      setDiscriminatedMatchTitle(null);
      addLogEntries([
        createLogEntry("Observed ticket input", `Ticket: ${result.ticket.ticketId}`),
        createLogEntry(`Detected language: ${languageLabel(result.language.detection.language)}`, `Confidence ${result.language.detection.confidence.toFixed(2)} (${result.language.detection.method}). ${result.language.response.explanation}`),
        createLogEntry(`Extracted category: ${result.understanding.category}`, `Urgency: ${result.understanding.urgency}`),
        createLogEntry("Canonical problem proposed", result.canonicalSelection.title),
        createLogEntry("Generated draft response", result.draft.source === "ai_advisory" ? "AI advisory draft" : "Deterministic draft")
      ]);
      const patternFollowUp = result.followUp.find((entry) => entry.type === "pattern_discovery_requested");
      if (patternFollowUp) {
        const patternInput = buildPatternDiscoveryInput({
          organizationId: profile.id,
          actorId: authUser?.id,
          sourceTicketId: patternFollowUp.ticketId,
          understandingSummary: result.understanding.coreProblem || result.understanding.summary,
          detectedSignals: result.understanding.detectedSignals,
          tags: result.understanding.tags,
          category: result.understanding.category,
          language: result.language.detection.language
        });
        const patternKey = patternDiscoveryIdempotencyKey(profile.id, patternFollowUp.ticketId);
        void enqueuePatternDiscoveryJob(profile.id, patternInput, { idempotencyKey: patternKey, correlationId: requestId })
          .then((queued) => addLogEntries([createLogEntry("Pattern discovery queued", queued.data.replayed ? "Existing durable follow-up reused" : `Job ${queued.data.jobId} queued after ticket success`)]))
          .catch(() => addLogEntries([createLogEntry("Pattern discovery follow-up unavailable", "The ticket result succeeded; retry the visible durable follow-up when the job service recovers.")]));
      }
      updateMetrics({ ticketsProcessed: 1, memoryRetrievals: 1, repeatedIssuesDetected: result.memoryMatch ? 1 : 0 });
      setCurrentStep(4);
    } catch (error) {
      if (!ticketRequestIsCurrent(requestGeneration)) return;
      if (error instanceof DOMException && error.name === "AbortError") {
        setErrorMessage("Ticket processing was cancelled.");
        return;
      }
      console.error("Ticket processing failed.", error);
      setErrorMessage(error instanceof Error ? error.message : "Ticket processing could not be completed. Retry is safe.");
    } finally {
      if (ticketRequestIsCurrent(requestGeneration)) setIsProcessing(false);
      if (ticketAbortController.current === abortController) ticketAbortController.current = null;
    }
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
    cancelActiveTicketRequest();
    setActiveView("tickets");
    setTicketIntakeMode("single");
    if (currentStep > 0) resetSession();
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
  const currentOrganizationForMenu = authorizedOrganizations.find((organization) => organization.id === organizationProfile.id) ?? null;

  const authEntryMode = typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get("auth");
  const requestedAuthMode = authEntryMode === "signup" ? "signup" : "login";
  if (authStatus === "loading") {
    return <main className="flex min-h-screen items-center justify-center bg-[#F3F6FA] text-sm text-slate-500">Checking authentication…</main>;
  }
  if (!authUser) {
    if (authEntryMode !== "login" && authEntryMode !== "signup") return <ZendeskLandingPage />;
    return <LoginScreen initialMode={requestedAuthMode} onAuthenticated={(user) => { setAuthUser(user); setAuthStatus("authenticated"); }} />;
  }
  if (organizationBootstrapState === "loading") {
    return <main role="status" aria-live="polite" className="flex min-h-screen items-center justify-center bg-[#F3F6FA] text-sm text-slate-500">Loading your organizations and workspace…</main>;
  }
  if (organizationBootstrapState === "onboarding") {
    return <FirstOrganizationOnboarding onCreate={addOrganization} />;
  }
  if (organizationBootstrapState === "error") {
    return (
      <main role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F3F6FA] px-4 text-center text-sm text-red-700">
        <p>{errorMessage || "Unable to load your workspace."}</p>
        <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700">Try again</button>
      </main>
    );
  }

  return (
    <AuthorizationProvider organizationId={organizationProfile.id}>
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
            <AccountWorkspaceMenu
              user={authUser}
              currentOrganization={currentOrganizationForMenu}
              organizations={authorizedOrganizations}
              darkMode={darkMode}
              accentColor={accent}
              onSelectOrganization={(id) => { void selectOrganization(id, authorizedOrganizations); }}
              onCreateOrganization={() => { setOpenCreateOrganization(true); setActiveView("organization"); }}
              onSignOut={logout}
              busy={organizationSwitching}
            />
          </div>
        </header>

        {organizationSwitching && (
          <div role="status" aria-live="polite" className={`mx-4 mb-3 rounded-xl border px-4 py-2 text-sm md:mx-6 ${darkMode ? "border-blue-700/50 bg-blue-900/20 text-blue-200" : "border-blue-200 bg-blue-50 text-blue-800"}`}>
            Switching to the selected organization…
          </div>
        )}

        {migrationWarning && (
          <div className={`mx-4 mb-3 rounded-xl border px-4 py-3 text-sm md:mx-6 ${darkMode ? "border-amber-700/50 bg-amber-900/20 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            <strong>Storage migration notice:</strong> {migrationWarning}
          </div>
        )}

        {profileConflictNotice && (
          <div className={`mx-4 mb-3 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm md:mx-6 ${darkMode ? "border-sky-700/50 bg-sky-900/20 text-sky-200" : "border-sky-200 bg-sky-50 text-sky-800"}`}>
            <span><strong>Profile updated elsewhere:</strong> {profileConflictNotice}</span>
            <button
              type="button"
              onClick={() => setProfileConflictNotice("")}
              className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${darkMode ? "hover:bg-sky-800/40" : "hover:bg-sky-100"}`}
              aria-label="Dismiss profile update notice"
            >
              Dismiss
            </button>
          </div>
        )}

        {revisionConflictNotice && (
          <div className={`mx-4 mb-3 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm md:mx-6 ${darkMode ? "border-amber-700/50 bg-amber-900/20 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
            <div className="min-w-0">
              <p><strong>Updated elsewhere:</strong> {revisionConflictNotice}</p>
              {knowledgeConflictRecovery?.localWorkPreserved && (
                <p className="mt-1 text-xs opacity-90">
                  Your unsaved review remains available in this workspace. Reloading changes the authoritative knowledge item only; it does not auto-merge or overwrite your local review.
                </p>
              )}
              {knowledgeConflictRecovery?.latestLoaded && (
                <p className="mt-1 text-xs font-semibold opacity-90">Review the latest version, then retry the original action deliberately.</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => { void reloadLatestKnowledge(); }}
              className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${darkMode ? "bg-amber-800/50 hover:bg-amber-800" : "bg-amber-100 hover:bg-amber-200"}`}
            >
              Reload latest
            </button>
          </div>
        )}

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
                  reflectionValidationEligible={activeTicketRecord?.status === "resolved" && activeTicketRecord.reflection.validationEligible === true}
                  reflectionValidationBlockedReason={activeTicketRecord?.reflection.validationEligibilityReason ?? "Resolution evidence is required before this Reflection can be validated."}
                  knowledgeItems={knowledgeItems}
                  businessRelevance={businessRelevance}
                  domainClassification={domainClassification}
                  ticketLanguage={activeTicketRecord?.classification?.language ?? null}
                  onLanguageOverride={overrideTicketLanguage}
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
                  onSubmitTicket={(text, scenario) => { void processTicketPipeline(text, scenario); }}
                  onUpdateReviewedResponse={updateReviewedResponse}
                  onApproveResponse={approveResponse}
                  onViewReflection={() => setCurrentStep(7)}
                  onConfirmReflection={confirmReflectionApplication}
                  isValidationSubmitting={isValidationSubmitting}
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
                  conversationMessages={activeTicketRecord?.messages ?? []}
                  resolutionEvidence={activeTicketRecord?.resolutionEvidence ?? []}
                  caseStatus={activeTicketRecord?.status ?? null}
                  isConversationSubmitting={isConversationSubmitting}
                  onSendAgentResponse={() => { void sendAgentConversationResponse(); }}
                  onAddCustomerReply={(text) => { void addCustomerConversationReply(text); }}
                  onAttachResolutionEvidence={(sourceMessageId, evidenceType, note) => { void attachResolutionEvidence(sourceMessageId, evidenceType, note); }}
                  onResolveWithEvidence={(evidenceId) => { void resolveWithEvidence(evidenceId); }}
                />
              ) : (
                <BulkUploadWorkspace
                  darkMode={darkMode}
                  onSwitchToSingle={handleNewTicket}
                  onSwitchToBulk={handleUploadQueries}
                  onPrepareBulkEntries={prepareBulkEntries}
                  onAnalyze={analyzeUploadedQueries}
                  onCommitCluster={commitBulkCluster}
                  onOpenSingleTicket={handleBulkSingleTicket}
                />
              )}
            </div>
          )}

          {activeView === "cases" && (
            <CaseLookupView
              organizationId={organizationProfile.id}
              knowledgeItems={knowledgeItems}
              darkMode={darkMode}
              loadTicketPage={loadCasePage}
              onNavigateToKnowledge={() => {
                setActiveView("knowledge");
              }}
              onResumeTicket={resumeTicketFromRecord}
            />
          )}

          {activeView === "knowledge" && (
            <div>
              <OrganizationalMemorySurface
                organizationId={organizationProfile.id}
                knowledgeItems={knowledgeItems}
                darkMode={darkMode}
                onRefresh={async () => {
                  const refreshed = await loadOrganizationState(organizationProfile.id);
                  suppressHydratedCollectionPersistence();
                  setKnowledgeItems(refreshed.knowledge);
                  setKnowledgeCandidates(refreshed.candidates);
                  setValidationRecords(refreshed.validations);
                  setMemoryChangeRecords(refreshed.changes);
                  setOrgMetrics(refreshed.metrics);
                  setIntelligenceLog(refreshed.log);
                  setEmergingPatterns(refreshed.patterns);
                }}
              />
              <KnowledgeView
                knowledgeItems={knowledgeItems}
                knowledgeCandidates={knowledgeCandidates}
                emergingPatterns={emergingPatterns}
                validationRecords={validationRecords}
                memoryChangeRecords={memoryChangeRecords}
                historyLoadState={historyLoadState}
                darkMode={darkMode}
                orgId={organizationProfile.id}
                onPromote={promotePattern}
                onImportPack={importKnowledgePack}
                onValidatePackCandidate={validateKnowledgePackCandidate}
                onRejectPackCandidate={rejectKnowledgePackCandidate}
                onLoadHistory={async (knowledgeId) => {
                  await ensureKnowledgeHistory(organizationProfile.id, knowledgeId);
                }}
              />
            </div>
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

          {activeView === "operations" && (
            <OperationsView organizationId={organizationProfile.id} darkMode={darkMode} accentColor={accent} />
          )}

          {activeView === "developer" && (
            <DeveloperDiagnosticsView darkMode={darkMode} accentColor={accent} />
          )}

          {activeView === "organization" && (
            <OrganizationView
              profile={organizationProfile}
              organizations={authorizedOrganizations}
              onChange={changeOrganizationProfile}
              onSelectOrg={(id) => { void selectOrganization(id, authorizedOrganizations); }}
              onAddOrg={addOrganization}
              onDeleteOrg={deleteOrganization}
              darkMode={darkMode}
              openCreateOrganization={openCreateOrganization}
              onCreateOrganizationOpened={() => setOpenCreateOrganization(false)}
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
    </AuthorizationProvider>
  );
}
