"use client";

import { useState } from "react";
import type {
  AIAnalysis,
  AIAdvisory,
  BusinessRelevance,
  KnowledgeItem,
  KnowledgeMatch,
  ReflectionCommitInput,
  OrganizationProfile,
  ReflectionDecision,
  ResolutionMode,
  SuggestedResponse,
  Ticket,
  TrustDecision,
} from "@/types";
import { HumanReviewEditor } from "@/components/HumanReviewEditor";
import { ReflectionPanel } from "@/components/ReflectionPanel";
import { ProvenancePanel } from "@/components/ProvenancePanel";
import { findMatchingLesson } from "@/lib/drafting";

export type TicketPhase =
  | "idle"
  | "analyzing"
  | "review"
  | "approved"
  | "reflecting"
  | "complete";

interface TicketWorkspaceProps {
  intakeMode: "single" | "bulk";
  // State
  currentStep: number;
  isProcessing: boolean;
  ticketPhase: TicketPhase;
  selectedTicket: Ticket | null;
  aiAnalysis: AIAnalysis | null;
  similarKnowledge: KnowledgeMatch[];
  suggestedResponse: SuggestedResponse | null;
  reviewedResponse: string;
  reflectionDecision: ReflectionDecision | null;
  knowledgeItems: KnowledgeItem[];
  businessRelevance: BusinessRelevance | null;
  aiAdvisory: AIAdvisory | null;
  errorMessage: string;
  organizationProfile: OrganizationProfile;
  // LLM discrimination result (shown in OIP reasoning when a match was rejected)
  discriminationReasoning?: string | null;
  discriminatedMatchTitle?: string | null;
  // Reuse state (step 8)
  reuseItem: KnowledgeItem | null;
  reuseDecision: TrustDecision | null;
  reuseResponseText: string;
  reuseResponseSource?: SuggestedResponse["source"];
  reuseResolvedMode: ResolutionMode | null;
  lastTrustDelta: number;
  runCount: number;
  customSecondText: string;
  darkMode: boolean;
  lastSavedKnowledgeId: string | null;
  // Callbacks
  onSubmitTicket: (text: string) => void;
  onUpdateReviewedResponse: (text: string) => void;
  onApproveResponse: () => void;
  onViewReflection: () => void;
  onConfirmReflection: (input?: ReflectionCommitInput) => void;
  onApproveReuse: () => void;
  onProcessReuse: (text?: string) => void;
  onRunAgain: () => void;
  onSetCustomSecondText: (text: string) => void;
  onSwitchToSingle: () => void;
  onSwitchToBulk: () => void;
}

type TimelineStatus = "pending" | "running" | "done" | "active";

interface TimelineItem {
  id: string;
  label: string;
  detail?: string;
  status: TimelineStatus;
}

function TimelineDot({ status }: { status: TimelineStatus }) {
  if (status === "done") {
    return (
      <div className="w-5 h-5 rounded-full bg-[#22C55E] flex items-center justify-center flex-shrink-0">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  if (status === "running") {
    return (
      <div className="w-5 h-5 rounded-full bg-[#2563EB] flex items-center justify-center flex-shrink-0 animate-pulse">
        <div className="w-2 h-2 rounded-full bg-white" />
      </div>
    );
  }
  if (status === "active") {
    return (
      <div className="w-5 h-5 rounded-full border-2 border-[#2563EB] flex items-center justify-center flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-[#2563EB]" />
      </div>
    );
  }
  return <div className="w-5 h-5 rounded-full border-2 border-slate-300 flex-shrink-0" />;
}

function OIPTimeline({ items, darkMode }: { items: TimelineItem[]; darkMode: boolean }) {
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isDone = item.status === "done";
        const isRunning = item.status === "running";
        const isActive = item.status === "active";

        const rowTint = isDone
          ? darkMode
            ? "bg-emerald-900/20 border-emerald-800/40"
            : "bg-emerald-50 border-emerald-100"
          : isRunning || isActive
          ? darkMode
            ? "bg-blue-900/20 border-blue-800/40"
            : "bg-blue-50 border-blue-100"
          : darkMode
          ? "bg-[#111827]/50 border-[#243247]"
          : "bg-slate-50 border-slate-100";

        const labelCls = isDone
          ? darkMode
            ? "text-emerald-300"
            : "text-[#15803d]"
          : isRunning || isActive
          ? darkMode
            ? "text-white"
            : "text-[#111827]"
          : darkMode
          ? "text-slate-500"
          : "text-slate-400";

        return (
          <div
            key={item.id}
            className={`flex items-start gap-3 rounded-xl border px-3.5 py-2.5 transition-colors duration-300 ${rowTint} ${
              isRunning ? "ring-1 ring-blue-400/40" : ""
            }`}
          >
            <div className="mt-0.5">
              <TimelineDot status={item.status} />
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium leading-tight ${labelCls}`}>{item.label}</p>
              {item.detail && (
                <p className={`mt-0.5 text-xs leading-snug ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>
                  {item.detail}
                </p>
              )}
            </div>
            {isRunning && (
              <span className="mt-0.5 flex-shrink-0 text-[10px] font-bold uppercase tracking-wide text-[#2563EB]">
                Running
              </span>
            )}
            {isActive && (
              <span className={`mt-0.5 flex-shrink-0 text-[10px] font-bold uppercase tracking-wide ${darkMode ? "text-blue-300" : "text-[#2563EB]"}`}>
                Active
              </span>
            )}
            {isDone && (
              <span className={`mt-0.5 flex-shrink-0 text-[10px] font-bold uppercase tracking-wide ${darkMode ? "text-emerald-400" : "text-[#16a34a]"}`}>
                Done
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function getTimelineItems(
  step: number,
  isProcessing: boolean,
  analysis: AIAnalysis | null,
  topMatch: KnowledgeMatch | null,
  suggestedResponse: SuggestedResponse | null,
  reflectionDecision: ReflectionDecision | null,
  lastSavedKnowledgeId: string | null,
): TimelineItem[] {
  return [
    {
      id: "analyze",
      label: analysis ? `Intent: ${analysis.category}` : "Analyzing issue",
      detail: analysis?.coreProblem ? `Canonical problem: ${analysis.coreProblem}` : undefined,
      status: step >= 2 ? "done" : step === 1 && isProcessing ? "running" : "pending",
    },
    {
      id: "memory",
      label: topMatch
        ? `Memory found: ${topMatch.item.canonicalProblemTitle ?? topMatch.item.title}`
        : step >= 3
        ? "No knowledge match â€” cold start"
        : "Searching organizational memory",
      detail: topMatch ? `${topMatch.matchScore}% match` : undefined,
      status: step >= 3 ? "done" : step === 2 && isProcessing ? "running" : "pending",
    },
    {
      id: "trust",
      label: topMatch
        ? `Trust evaluated: ${topMatch.item.trustScore ?? 20}/100`
        : step >= 3
        ? "Trust: no match"
        : "Evaluating trust",
      detail: step >= 3 && topMatch
        ? (topMatch.item.trustScore ?? 20) >= 80 ? "Auto-resolution eligible" : "Human review required"
        : undefined,
      status: step >= 3 ? "done" : "pending",
    },
    {
      id: "draft",
      label: suggestedResponse
        ? "Suggested response generated"
        : step === 3 && isProcessing
        ? "Generating draft with AI..."
        : "Generating draft",
      detail: suggestedResponse?.fallbackNotice ?? draftGroundingLabel(suggestedResponse),
      status: step >= 4 ? "done" : step === 3 && isProcessing ? "running" : "pending",
    },
    {
      id: "review",
      label: "Human review",
      detail: step >= 6 ? "Approved by reviewer" : step >= 4 ? "Waiting for approval" : undefined,
      status: step >= 6 ? "done" : step >= 4 ? "active" : "pending",
    },
    {
      id: "reflection",
      label: reflectionDecision
        ? `Reflection: ${reflectionDecision.action.replace(/_/g, " ")}`
        : "Reflection",
      detail: step >= 8 ? "Complete" : step >= 6 ? "Analysis ready" : undefined,
      status: step >= 8 ? "done" : step >= 6 ? "active" : "pending",
    },
    {
      id: "knowledge",
      label: lastSavedKnowledgeId ? "Knowledge updated" : "Knowledge update",
      status: step >= 8 && lastSavedKnowledgeId ? "done" : "pending",
    },
  ];
}

function draftGroundingLabel(response: SuggestedResponse | null): string | undefined {
  if (!response || response.source !== "ai_advisory") return undefined;
  if (response.draftMode === "lesson_grounded") {
    return `AI draft grounded in validated lesson: ${response.groundingLabel ?? "matched lesson"}`;
  }
  if (response.draftMode === "memory_grounded") {
    return "AI draft grounded in organizational memory";
  }
  if (response.draftMode === "cold_start") {
    return "AI suggestion - no organizational knowledge exists yet; this draft is not based on validated memory. Review carefully before sending.";
  }
  return "AI advisory draft. Human review is required before sending.";
}

export function TicketWorkspace({
  intakeMode,
  currentStep,
  isProcessing,
  ticketPhase,
  selectedTicket,
  aiAnalysis,
  similarKnowledge,
  suggestedResponse,
  reviewedResponse,
  reflectionDecision,
  knowledgeItems,
  businessRelevance,
  aiAdvisory,
  errorMessage,
  organizationProfile,
  discriminationReasoning,
  discriminatedMatchTitle,
  reuseItem,
  reuseDecision,
  reuseResponseText,
  reuseResponseSource = "deterministic",
  reuseResolvedMode,
  lastTrustDelta,
  runCount,
  customSecondText,
  darkMode,
  lastSavedKnowledgeId,
  onSubmitTicket,
  onUpdateReviewedResponse,
  onApproveResponse,
  onViewReflection,
  onConfirmReflection,
  onApproveReuse,
  onProcessReuse,
  onRunAgain,
  onSetCustomSecondText,
  onSwitchToSingle,
  onSwitchToBulk,
}: TicketWorkspaceProps) {
  const topMatch = similarKnowledge.length > 0 ? similarKnowledge[0] : null;
  const timelineItems = getTimelineItems(currentStep, isProcessing, aiAnalysis, topMatch, suggestedResponse, reflectionDecision, lastSavedKnowledgeId);
  const isColdStart = knowledgeItems.length === 0 || (!!suggestedResponse && suggestedResponse.basedOnKnowledgeIds.length === 0);
  const reuseLessonMatch = reuseItem && customSecondText.trim()
    ? findMatchingLesson(
        { id: "", customerName: "Customer", subject: customSecondText, description: customSecondText, category: "", status: "new" as const, createdAt: "" },
        reuseItem
      )
    : null;

  const card = `rounded-2xl border ${darkMode ? "bg-[#1a2b3c] border-[#2d3f52]" : "bg-white border-slate-200"}`;
  const headingCls = `font-bold ${darkMode ? "text-white" : "text-[#111827]"}`;
  const mutedCls = `text-sm ${darkMode ? "text-slate-400" : "text-[#667085]"}`;

  return (
    <div className="flex flex-col h-full">
      {/* Sub-header */}
      <div className="px-6 pb-4 pt-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className={`text-2xl font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>Tickets</h1>
            <p className={mutedCls}>A continuous workspace where OIP learns from every resolved issue.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSwitchToSingle}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                intakeMode === "single"
                  ? "bg-[#2563EB] text-white hover:bg-blue-700"
                  : darkMode
                  ? "border border-[#2d3f52] text-slate-300 hover:bg-[#111827]"
                  : "border border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              New Ticket
            </button>
            <button
              type="button"
              onClick={onSwitchToBulk}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                intakeMode === "bulk"
                  ? "bg-[#2563EB] text-white hover:bg-blue-700"
                  : darkMode
                  ? "border border-[#2d3f52] text-slate-300 hover:bg-[#111827]"
                  : "border border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              Upload queries
            </button>
          </div>
        </div>
      </div>

      {/* 3-column workspace */}
      <div className="flex flex-1 min-h-0 flex-col gap-5 overflow-y-auto px-6 pb-6 lg:flex-row lg:overflow-hidden">
        {/* Left: Customer ticket */}
        <div className="w-full flex-shrink-0 lg:w-[330px] lg:overflow-y-auto">
          <div className={`${card} min-h-[320px] p-6 lg:min-h-full`}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${darkMode ? "bg-blue-900/50 text-blue-300" : "bg-blue-50 text-[#2563EB]"}`}>
                {ticketPhase === "idle" ? "New ticket" : "Customer ticket"}
              </span>
            </div>

            {ticketPhase === "idle" ? (
              /* Ticket input form */
              <TicketInputForm darkMode={darkMode} onSubmit={onSubmitTicket} />
            ) : (
              /* Submitted ticket (read-only) */
              <div>
                <p className={`text-xs font-semibold mb-1 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Customer issue</p>
                <div className={`rounded-xl p-3 text-sm leading-6 ${darkMode ? "bg-[#111827] text-slate-300" : "bg-slate-50 text-[#111827]"}`}>
                  {selectedTicket?.description ?? selectedTicket?.subject}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center: OIP reasoning */}
        <div className="flex-1 lg:min-h-0 lg:overflow-y-auto">
          <div className={`${card} mb-4 p-5 ${ticketPhase === "idle" ? "lg:min-h-full" : ""}`}>
            <h2 className={headingCls}>OIP reasoning</h2>

            {ticketPhase === "idle" ? (
              <p className={`mt-2 ${mutedCls}`}>Submit a ticket to start the OIP analysis pipeline.</p>
            ) : (
              <div className="mt-4">
                <OIPTimeline items={timelineItems} darkMode={darkMode} />
                {discriminationReasoning && discriminatedMatchTitle && (
                  <div className={`mt-3 rounded-xl border p-3 ${darkMode ? "bg-amber-900/20 border-amber-700/40" : "bg-amber-50 border-amber-200"}`}>
                    <p className={`text-xs font-bold uppercase tracking-wide ${darkMode ? "text-amber-300" : "text-amber-700"}`}>
                      AI discrimination
                    </p>
                    <p className={`mt-1 text-xs font-semibold ${darkMode ? "text-amber-200" : "text-amber-800"}`}>
                      Candidate match &ldquo;{discriminatedMatchTitle}&rdquo; rejected â€” identified as a distinct problem
                    </p>
                    <p className={`mt-1 text-xs leading-snug ${darkMode ? "text-amber-300/80" : "text-amber-700"}`}>
                      {discriminationReasoning}
                    </p>
                    <p className={`mt-1.5 text-[10px] ${darkMode ? "text-amber-400/60" : "text-amber-600/70"}`}>
                      Treated as no-match â†’ honest cold-start path â†’ human review required
                    </p>
                  </div>
                )}
              </div>
            )}

            {errorMessage && (
              <div className={`mt-4 rounded-xl p-3 text-sm ${darkMode ? "bg-red-900/20 text-red-300" : "bg-amber-50 text-amber-800"}`}>
                {errorMessage}
              </div>
            )}
          </div>

          {/* Human review (step 4-5) */}
          {(currentStep === 4 || currentStep === 5) && suggestedResponse && (
            <div className={`${card} p-5 mb-4`}>
              <HumanReviewEditor
                reviewedResponse={reviewedResponse}
                onChange={onUpdateReviewedResponse}
                onApprove={onApproveResponse}
                canApprove={reviewedResponse.trim().length > 0}
                placeholderText={suggestedResponse?.draftResponse}
                sourceLabel={draftGroundingLabel(suggestedResponse)}
                fallbackNotice={suggestedResponse?.fallbackNotice}
                deterministicDraft={suggestedResponse?.deterministicDraft}
                isAIDraft={suggestedResponse?.source === "ai_advisory"}
                isNoTemplate={suggestedResponse?.source === "no_template"}
              />
              {suggestedResponse.confidenceNote && (
                <p className={`mt-3 text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>{suggestedResponse.confidenceNote}</p>
              )}
            </div>
          )}

          {/* Resolution approved + reflection preview (step 6) */}
          {currentStep === 6 && reflectionDecision && (
            <div className="space-y-3">
              <div className={`${card} p-5`}>
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${darkMode ? "bg-emerald-900/50 text-emerald-300" : "bg-emerald-100 text-emerald-700"}`}>
                    Human Approved
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${reflectionDecision.isLearningEvent ? (darkMode ? "bg-purple-900/50 text-purple-300" : "bg-purple-100 text-purple-700") : (darkMode ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600")}`}>
                    {reflectionDecision.isLearningEvent ? "Learning event" : "Trust update only"}
                  </span>
                </div>
                <h3 className={`mt-3 font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>Resolution approved by human reviewer</h3>
                <p className={`mt-1 text-sm ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>
                  OIP completed a reflection analysis. Review before saving to organizational memory.
                </p>
              </div>
              <div className={`${card} p-5`}>
                <p className={`text-xs font-bold uppercase tracking-wide ${darkMode ? "text-purple-400" : "text-[#7C3AED]"}`}>Reflection preview</p>
                <p className={`mt-1 font-semibold ${darkMode ? "text-white" : "text-[#111827]"}`}>
                  {reflectionDecision.action === "create_new" && "Will create a new knowledge entry"}
                  {reflectionDecision.action === "merge_existing" && `Will merge into "${reflectionDecision.existingItemTitle}"`}
                  {reflectionDecision.action === "create_version" && `Will create a new version of "${reflectionDecision.existingItemTitle}"`}
                  {reflectionDecision.action === "trust_update_only" && `Will update trust for "${reflectionDecision.existingItemTitle}"`}
                </p>
                <p className={`mt-1 text-sm leading-6 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                  {reflectionDecision.rationale.slice(0, 200)}{reflectionDecision.rationale.length > 200 ? "â€¦" : ""}
                </p>
                <button
                  type="button"
                  onClick={onViewReflection}
                  className={`mt-3 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${darkMode ? "bg-[#2563EB] text-white hover:bg-blue-600" : "bg-[#111827] text-white hover:bg-slate-800"}`}
                >
                  View Reflection Analysis
                </button>
              </div>
            </div>
          )}

          {/* Full reflection (step 7) */}
          {currentStep === 7 && reflectionDecision && (
            <ReflectionPanel
              decision={reflectionDecision}
              onConfirm={onConfirmReflection}
              existingLessons={reflectionDecision.existingItemId ? knowledgeItems.find(k => k.id === reflectionDecision.existingItemId)?.lessons : undefined}
              reviewedResponse={reviewedResponse}
              darkMode={darkMode}
            />
          )}

          {/* Complete state (step 8+) */}
          {currentStep >= 8 && (
            <div className="space-y-3">
              <div className={`${card} p-5`}>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#22C55E] flex items-center justify-center">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h3 className={`font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>Reflection complete</h3>
                </div>
                <p className={`mt-2 text-sm ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>
                  {reflectionDecision?.isLearningEvent
                    ? "This ticket supports existing knowledge. Trust increased without creating duplicate memory."
                    : "The organization's knowledge has been updated."}
                </p>
              </div>

              {/* Reuse ticket section */}
              <div className={`${card} p-5`}>
                <p className={`text-xs font-bold uppercase tracking-wide ${darkMode ? "text-blue-400" : "text-[#2563EB]"}`}>Try a similar ticket</p>
                <h3 className={`mt-1 font-semibold ${darkMode ? "text-white" : "text-[#111827]"}`}>
                  Submit a similar issue to see how memory and trust work
                </h3>
                <p className={`mt-1 text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                  OIP will find matching knowledge and decide whether to auto-resolve or route to human review.
                </p>
                <textarea
                  value={customSecondText}
                  onChange={(e) => onSetCustomSecondText(e.target.value)}
                  placeholder="Type a support issue similar to one you have already approved..."
                  rows={3}
                  className={`mt-3 w-full rounded-xl border px-3 py-2.5 text-sm leading-6 outline-none transition focus:ring-2 focus:ring-blue-200 resize-none ${darkMode ? "bg-[#111827] border-[#2d3f52] text-slate-200 placeholder:text-slate-600" : "bg-slate-50 border-slate-200 text-slate-800"}`}
                />
                <button
                  type="button"
                  onClick={() => onProcessReuse(customSecondText)}
                  disabled={customSecondText.trim().length < 5}
                  className="mt-2 rounded-xl bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Process reuse ticket
                </button>

                {/* Resolution result */}
                {reuseItem && (reuseResolvedMode !== null || reuseDecision !== null) && (
                  <div className="mt-4">
                    {reuseLessonMatch && (
                      <div className={`mb-2 rounded-xl p-3 ${darkMode ? "bg-amber-900/20 border border-amber-700/30" : "bg-amber-50 border border-amber-200"}`}>
                        <p className={`text-xs font-bold ${darkMode ? "text-amber-400" : "text-amber-700"}`}>Lesson matched</p>
                        <p className={`mt-0.5 text-xs font-semibold ${darkMode ? "text-amber-300" : "text-amber-800"}`}>{reuseLessonMatch.lesson.rootCause}</p>
                        <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Signals: {reuseLessonMatch.matchedSignals.join(", ")}</p>
                      </div>
                    )}
                    {reuseResolvedMode === "automatic" ? (
                      <div className={`rounded-xl p-4 ${darkMode ? "bg-emerald-900/20 border border-emerald-700/30" : "bg-emerald-50 border border-emerald-200"}`}>
                        <p className={`text-sm font-bold ${darkMode ? "text-emerald-300" : "text-emerald-700"}`}>
                          Auto Resolved â€” trust at {reuseItem.trustScore ?? 20}/100
                        </p>
                        <p className={`mt-1 text-xs ${darkMode ? "text-emerald-400" : "text-emerald-600"}`}>
                          Resolved automatically from validated organizational memory using the stored response template.
                        </p>
                        <p className={`mt-2 text-sm rounded-xl p-2 leading-6 ${darkMode ? "bg-[#111827] text-slate-300" : "bg-white text-slate-700"}`}>{reuseResponseText}</p>
                      </div>
                    ) : reuseResolvedMode === "human" ? (
                      <div className={`rounded-xl p-4 ${darkMode ? "bg-blue-900/20 border border-blue-700/30" : "bg-blue-50 border border-blue-200"}`}>
                        <p className={`text-sm font-bold ${darkMode ? "text-blue-300" : "text-blue-700"}`}>
                          Human approved â€” trust increased (+{lastTrustDelta})
                        </p>
                        <p className={`mt-2 text-sm rounded-xl p-2 leading-6 ${darkMode ? "bg-[#111827] text-slate-300" : "bg-white text-slate-700"}`}>{reuseResponseText}</p>
                      </div>
                    ) : (
                      <div className={`rounded-xl p-4 ${darkMode ? "bg-amber-900/20 border border-amber-700/30" : "bg-amber-50 border border-amber-200"}`}>
                        <p className={`text-sm font-bold ${darkMode ? "text-amber-300" : "text-amber-700"}`}>
                          Human review required â€” trust {reuseItem.trustScore ?? 20}/{organizationProfile.autoResolutionThreshold}
                        </p>
                        {reuseResponseSource === "ai_advisory" ? (
                          <p className={`mt-1 text-xs font-semibold ${darkMode ? "text-amber-300" : "text-amber-700"}`}>
                            AI advisory draft detected. Fresh AI text cannot auto-resolve and must be approved by a human.
                          </p>
                        ) : null}
                        <p className={`mt-2 text-sm rounded-xl p-2 leading-6 ${darkMode ? "bg-[#111827] text-slate-300" : "bg-white text-slate-700"}`}>{reuseResponseText}</p>
                        <button
                          type="button"
                          onClick={onApproveReuse}
                          className="mt-2 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
                        >
                          Approve reuse (human)
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={onRunAgain}
                      className={`mt-2 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${darkMode ? "border border-[#2d3f52] text-slate-300 hover:bg-[#1e3048]" : "border border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                    >
                      Process the same ticket again
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Organizational memory */}
        <div className="w-full flex-shrink-0 lg:w-[300px] lg:overflow-y-auto">
          <div className={`${card} min-h-[320px] p-6 lg:min-h-full`}>
          <h2 className={`font-bold mb-3 ${darkMode ? "text-white" : "text-[#111827]"}`}>Organizational memory</h2>

          {ticketPhase === "idle" || (!topMatch && currentStep < 3) ? (
            <div className={`rounded-2xl border border-dashed p-5 text-center ${darkMode ? "border-[#2d3f52]" : "border-slate-300"}`}>
              <p className={`text-sm ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                {knowledgeItems.length === 0
                  ? "No knowledge yet. Submit and approve a ticket to create organizational memory."
                  : "Memory will appear here after ticket analysis."}
              </p>
            </div>
          ) : topMatch ? (
            <div className={`rounded-xl p-4 ${darkMode ? "bg-[#111827]" : "bg-slate-50"}`}>
              <h3 className={`font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>
                {topMatch.item.canonicalProblemTitle ?? topMatch.item.title}
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${darkMode ? "bg-emerald-900/50 text-emerald-300" : "bg-emerald-100 text-emerald-700"}`}>
                  Trust {topMatch.item.trustScore ?? 20}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${darkMode ? "bg-blue-900/50 text-blue-300" : "bg-blue-50 text-blue-700"}`}>
                  v{(topMatch.item.knowledgeVersions?.length ?? 0) || 1}
                </span>
              </div>
              {topMatch.item.exampleTickets && topMatch.item.exampleTickets.length > 0 && (
                <p className={`mt-2 text-xs ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>
                  Supported by {topMatch.item.exampleTickets.length} ticket{topMatch.item.exampleTickets.length !== 1 ? "s" : ""} and {topMatch.item.humanReviewCount ?? 0} human approval{(topMatch.item.humanReviewCount ?? 0) !== 1 ? "s" : ""}.
                </p>
              )}
              <div className="mt-3">
                <p className={`text-xs font-bold ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Why this answer?</p>
                <p className={`mt-1 text-xs ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>
                  Knowledge ID {topMatch.item.id.slice(0, 10)}â€¦ â€¢ Version {(topMatch.item.knowledgeVersions?.length ?? 0) || 1} â€¢ Last reviewed today
                </p>
              </div>
            </div>
          ) : (
            <div className={`rounded-xl p-4 ${darkMode ? "bg-[#111827]" : "bg-slate-50"}`}>
              <p className={`text-sm font-semibold ${darkMode ? "text-slate-300" : "text-[#111827]"}`}>No knowledge match</p>
              <p className={`mt-1 text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                {knowledgeItems.length === 0
                  ? "Cold start â€” no organizational memory exists yet."
                  : "This ticket doesn't match existing knowledge. Approval will create a new entry."}
              </p>
            </div>
          )}

          {/* Provenance panel (when draft generated) */}
          {currentStep >= 4 && (
            <div className="mt-3">
              <ProvenancePanel
                topMatch={topMatch}
                isColdStart={isColdStart}
                ticket={selectedTicket}
                isUncategorized={aiAnalysis?.category === "Uncategorized" && !topMatch}
                response={suggestedResponse}
              />
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* Ticket input form â€” left column idle state */
function TicketInputForm({ darkMode, onSubmit }: { darkMode: boolean; onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");

  return (
    <div>
      <p className={`text-xs font-semibold mb-1.5 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Customer issue</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Describe the customer's issue..."
        rows={5}
        className={`w-full rounded-xl border px-3 py-2.5 text-sm leading-6 outline-none transition focus:ring-2 focus:ring-blue-200 resize-none ${darkMode ? "bg-[#111827] border-[#2d3f52] text-slate-200 placeholder:text-slate-600" : "bg-white border-slate-200 text-[#111827]"}`}
      />
      <button
        type="button"
        onClick={() => { if (text.trim().length >= 5) onSubmit(text.trim()); }}
        disabled={text.trim().length < 5}
        className="mt-3 w-full rounded-xl bg-[#2563EB] py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Submit Ticket
      </button>
    </div>
  );
}


