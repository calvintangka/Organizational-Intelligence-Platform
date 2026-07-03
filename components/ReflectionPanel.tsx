import { useState } from "react";
import type { ReflectionAction, ReflectionCommitInput, ReflectionDecision, Lesson, LessonMode } from "@/types";

const ACTION_LABELS: Record<ReflectionAction, string> = {
  create_new: "New Knowledge Entry",
  merge_existing: "Add Supporting Evidence",
  create_version: "Improved Version",
  trust_update_only: "Trust Confirmed"
};

const ACTION_COLORS: Record<ReflectionAction, string> = {
  create_new: "bg-emerald-100 text-emerald-800",
  merge_existing: "bg-blue-100 text-blue-800",
  create_version: "bg-purple-100 text-purple-800",
  trust_update_only: "bg-slate-100 text-slate-700"
};

const TRUST_IMPACT_LABELS: Record<string, string> = {
  increase: "Trust Increases",
  decrease: "Trust Decreases",
  reset_partial: "Trust Partially Resets",
  none: "No Trust Change"
};

const TRUST_IMPACT_COLORS: Record<string, string> = {
  increase: "bg-emerald-50 text-emerald-700",
  decrease: "bg-red-50 text-red-700",
  reset_partial: "bg-amber-50 text-amber-700",
  none: "bg-slate-50 text-slate-600"
};

const LESSON_MODE_LABELS: Record<LessonMode, string> = {
  new: "New Lesson",
  matches_existing: "Matches Existing",
  improves_existing: "Improves Existing"
};

interface ReflectionPanelProps {
  decision: ReflectionDecision;
  onConfirm: (input?: ReflectionCommitInput) => void;
  existingLessons?: Lesson[];
  reviewedResponse?: string;
  darkMode?: boolean;
}

export function ReflectionPanel({ decision, onConfirm, existingLessons = [], reviewedResponse = "", darkMode = false }: ReflectionPanelProps) {
  const actionColor = ACTION_COLORS[decision.action];
  const trustColor = TRUST_IMPACT_COLORS[decision.trustImpact];
  const requiresProblemName = !!decision.problemNameRequired;
  const requiresLesson = requiresProblemName;

  const [lessonOpen, setLessonOpen] = useState(requiresLesson);
  const [lessonMode, setLessonMode] = useState<LessonMode>(requiresLesson || existingLessons.length === 0 ? "new" : "improves_existing");
  const [problemName, setProblemName] = useState(decision.suggestedProblemName ?? "");
  const [rootCause, setRootCause] = useState("");
  const [solution, setSolution] = useState("");
  const [customerResponse, setCustomerResponse] = useState(reviewedResponse);
  const [signalInput, setSignalInput] = useState("");
  const [signals, setSignals] = useState<string[]>([]);
  const [selectedExistingId, setSelectedExistingId] = useState<string | undefined>(existingLessons[0]?.id);
  const [validationMessage, setValidationMessage] = useState("");

  function addSignal() {
    const trimmed = signalInput.trim().toLowerCase();
    if (trimmed && !signals.includes(trimmed)) {
      setSignals([...signals, trimmed]);
    }
    setSignalInput("");
  }

  function removeSignal(signal: string) {
    setSignals(signals.filter((sig) => sig !== signal));
  }

  function handleSignalKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSignal();
    }
  }

  function selectExistingLesson(id: string) {
    setSelectedExistingId(id);
    const lesson = existingLessons.find((entry) => entry.id === id);
    if (lesson && lessonMode === "improves_existing") {
      setRootCause(lesson.rootCause);
      setSolution(lesson.solution);
      setCustomerResponse(lesson.customerResponse);
      setSignals([...lesson.signals]);
    }
  }

  function handleConfirm() {
    setValidationMessage("");

    if (requiresProblemName && !problemName.trim()) {
      setValidationMessage("Name the new problem before committing this learning.");
      return;
    }

    const hasLessonFields = !!rootCause.trim() && !!solution.trim() && !!customerResponse.trim() && signals.length > 0;
    if (requiresLesson && (!lessonOpen || !hasLessonFields)) {
      setValidationMessage("Capture the root cause, solution, customer response, and signals for this new issue type before committing.");
      return;
    }

    if (!lessonOpen || !rootCause.trim() || !solution.trim() || signals.length === 0) {
      onConfirm(problemName.trim() ? { problemName: problemName.trim() } : undefined);
      return;
    }

    onConfirm({
      problemName: problemName.trim() || undefined,
      lessonDraft: {
        mode: lessonMode,
        rootCause: rootCause.trim(),
        solution: solution.trim(),
        customerResponse: customerResponse.trim() || reviewedResponse,
        signals,
        existingLessonId: lessonMode !== "new" ? selectedExistingId : undefined
      }
    });
  }

  const hasLessonData = lessonOpen && rootCause.trim() && solution.trim() && signals.length > 0;

  const bg = darkMode ? "bg-[#1a2b3c]" : "bg-white";
  const border = darkMode ? "border-[#2d3f52]" : "border-slate-200";
  const text = darkMode ? "text-white" : "text-ink";
  const textMuted = darkMode ? "text-slate-400" : "text-slate-600";
  const textFaint = darkMode ? "text-slate-500" : "text-slate-500";
  const inputBg = darkMode ? "bg-[#111827] border-[#2d3f52] text-white placeholder-slate-500" : "bg-white border-slate-200 text-slate-800 placeholder-slate-400";
  const sectionBg = darkMode ? "bg-[#111827] border-[#2d3f52]" : "bg-slate-50 border-slate-100";

  return (
    <div className="grid gap-4">
      <section className={`rounded-3xl border ${border} ${bg} p-6 shadow-soft`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${decision.isLearningEvent ? "bg-purple-100 text-purple-800" : "bg-slate-100 text-slate-600"}`}>
            {decision.isLearningEvent ? "Learning Event" : "Not a Learning Event"}
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${actionColor}`}>
            {ACTION_LABELS[decision.action]}
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${trustColor}`}>
            {TRUST_IMPACT_LABELS[decision.trustImpact]}
            {decision.estimatedTrustDelta !== 0 && <span className="ml-1">({decision.estimatedTrustDelta > 0 ? "+" : ""}{decision.estimatedTrustDelta})</span>}
          </span>
        </div>

        <h2 className={`mt-3 text-2xl font-bold ${text}`}>What did OIP learn from this resolution?</h2>
        <p className={`mt-2 leading-7 ${textMuted}`}>{decision.rationale}</p>

        {decision.existingItemTitle && (
          <div className={`mt-4 rounded-2xl border ${sectionBg} p-4`}>
            <p className={`text-xs font-bold uppercase tracking-wide ${textFaint}`}>Matched Knowledge</p>
            <p className={`mt-1 font-semibold ${text}`}>{decision.existingItemTitle}</p>
            {decision.existingItemSimilarity !== undefined && <p className={`mt-0.5 text-sm ${textFaint}`}>{decision.existingItemSimilarity}% similarity to this ticket</p>}
          </div>
        )}

        {decision.versionReason && (
          <div className="mt-4 rounded-2xl border border-purple-100 bg-purple-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-signal">Why a new version?</p>
            <p className="mt-1 text-sm text-slate-700">{decision.versionReason}</p>
          </div>
        )}
      </section>

      <section className={`rounded-3xl border ${border} ${bg} p-6 shadow-soft`}>
        <button type="button" onClick={() => setLessonOpen(!lessonOpen)} className="flex w-full items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${lessonOpen ? "bg-amber-100" : darkMode ? "bg-[#111827]" : "bg-slate-100"}`}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 11.5V14h2.5l7.37-7.37-2.5-2.5L2 11.5zM13.77 4.63a.664.664 0 000-.94l-1.56-1.56a.664.664 0 00-.94 0l-1.22 1.22 2.5 2.5 1.22-1.22z" fill={lessonOpen ? "#d97706" : darkMode ? "#94a3b8" : "#64748b"} />
              </svg>
            </div>
            <div className="text-left">
              <p className={`font-semibold ${text}`}>Teach a Lesson</p>
              <p className={`text-xs ${textFaint}`}>
                {lessonOpen ? "Author root-cause, solution, and signals for future ticket matching" : "Optionally capture what you learned for smarter future drafts"}
              </p>
            </div>
          </div>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={`transition-transform ${lessonOpen ? "rotate-180" : ""}`}>
            <path d="M5 7.5L10 12.5L15 7.5" stroke={darkMode ? "#94a3b8" : "#64748b"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {lessonOpen && (
          <div className="mt-5 space-y-4">
            {requiresProblemName && (
              <div>
                <label className={`text-xs font-bold uppercase tracking-wide ${textFaint}`}>Problem Name</label>
                <p className={`mt-0.5 text-xs ${textFaint}`}>Name the new canonical problem that this ticket teaches the organization.</p>
                <input
                  type="text"
                  value={problemName}
                  onChange={(e) => setProblemName(e.target.value)}
                  placeholder="e.g. Account Recovery - Forgot Registration Email"
                  className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${inputBg}`}
                />
              </div>
            )}

            <div>
              <p className={`text-xs font-bold uppercase tracking-wide ${textFaint}`}>Lesson Type</p>
              <div className={`mt-2 grid rounded-2xl p-1 ${darkMode ? "bg-[#111827]" : "bg-slate-100"}`}>
                <div className="grid grid-cols-3 gap-1">
                  {(["new", "matches_existing", "improves_existing"] as LessonMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setLessonMode(mode);
                        if (mode === "improves_existing" && selectedExistingId) {
                          selectExistingLesson(selectedExistingId);
                        }
                      }}
                      disabled={requiresLesson ? mode !== "new" : mode !== "new" && existingLessons.length === 0}
                      className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                        lessonMode === mode
                          ? darkMode
                            ? "bg-[#27469e] text-white shadow-sm"
                            : "bg-white text-[#2563EB] shadow-sm"
                          : requiresLesson && mode !== "new"
                          ? darkMode
                            ? "cursor-not-allowed text-slate-600"
                            : "cursor-not-allowed text-slate-300"
                          : mode !== "new" && existingLessons.length === 0
                          ? darkMode
                            ? "cursor-not-allowed text-slate-600"
                            : "cursor-not-allowed text-slate-300"
                          : darkMode
                          ? "text-slate-400 hover:text-white"
                          : "text-slate-600 hover:text-[#111827]"
                      }`}
                    >
                      {LESSON_MODE_LABELS[mode]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {lessonMode !== "new" && existingLessons.length > 0 && !requiresLesson && (
              <div>
                <label className={`text-xs font-bold uppercase tracking-wide ${textFaint}`}>Select Existing Lesson</label>
                <select value={selectedExistingId ?? ""} onChange={(e) => selectExistingLesson(e.target.value)} className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${inputBg}`}>
                  {existingLessons.map((lesson) => (
                    <option key={lesson.id} value={lesson.id}>
                      {lesson.rootCause} ({lesson.signals.join(", ")})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className={`text-xs font-bold uppercase tracking-wide ${textFaint}`}>Root Cause</label>
              <textarea value={rootCause} onChange={(e) => setRootCause(e.target.value)} placeholder="What caused this issue?" rows={2} className={`mt-1 w-full resize-none rounded-xl border px-3 py-2 text-sm ${inputBg}`} />
            </div>

            <div>
              <label className={`text-xs font-bold uppercase tracking-wide ${textFaint}`}>Solution</label>
              <textarea value={solution} onChange={(e) => setSolution(e.target.value)} placeholder="How should this issue be resolved?" rows={2} className={`mt-1 w-full resize-none rounded-xl border px-3 py-2 text-sm ${inputBg}`} />
            </div>

            <div>
              <label className={`text-xs font-bold uppercase tracking-wide ${textFaint}`}>Customer Response</label>
              <p className={`mt-0.5 text-xs ${textFaint}`}>Use {"{{customerName}}"} and {"{{organizationName}}"} as placeholders</p>
              <textarea value={customerResponse} onChange={(e) => setCustomerResponse(e.target.value)} placeholder="The customer-facing response template for this lesson" rows={4} className={`mt-1 w-full resize-none rounded-xl border px-3 py-2 text-sm ${inputBg}`} />
            </div>

            <div>
              <label className={`text-xs font-bold uppercase tracking-wide ${textFaint}`}>Signals</label>
              <p className={`mt-0.5 text-xs ${textFaint}`}>Keywords that indicate this lesson applies. Press Enter or comma to add.</p>
              <div className="mt-1 flex gap-2">
                <input type="text" value={signalInput} onChange={(e) => setSignalInput(e.target.value)} onKeyDown={handleSignalKeyDown} placeholder="e.g. forgot registration email" className={`flex-1 rounded-xl border px-3 py-2 text-sm ${inputBg}`} />
                <button type="button" onClick={addSignal} className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${darkMode ? "bg-[#27469e] text-white hover:bg-[#1e3a8a]" : "bg-slate-800 text-white hover:bg-slate-700"}`}>
                  Add
                </button>
              </div>
              {signals.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {signals.map((signal) => (
                    <span key={signal} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${darkMode ? "bg-amber-900/40 text-amber-300" : "bg-amber-50 text-amber-800"}`}>
                      {signal}
                      <button type="button" onClick={() => removeSignal(signal)} className="ml-0.5 hover:opacity-70">&times;</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className={`rounded-3xl border ${border} ${bg} p-4 shadow-sm`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={`font-semibold ${text}`}>
              {decision.action === "create_new" && "Ready to validate this candidate as new organizational knowledge."}
              {decision.action === "merge_existing" && "Ready to validate this ticket as supporting evidence for existing knowledge."}
              {decision.action === "create_version" && "Ready to validate an improved version of existing knowledge."}
              {decision.action === "trust_update_only" && "Ready to validate this confirmation and update trust."}
            </p>
            <p className={`mt-0.5 text-sm ${textFaint}`}>
              {hasLessonData
                ? `A lesson will be ${lessonMode === "new" ? "created" : lessonMode === "improves_existing" ? "updated" : "confirmed"} alongside this validation.`
                : decision.isLearningEvent
                ? requiresLesson
                  ? "This new issue type must be named and taught before memory can be updated."
                  : "OIP identified a learning opportunity. Validation will create a record before memory changes."
                : "The organization already knows this solution. Trust grows through confirmed repetition."}
            </p>
            {validationMessage && <p className="mt-2 text-sm font-medium text-red-600">{validationMessage}</p>}
          </div>
          <button type="button" onClick={handleConfirm} className={`rounded-2xl px-6 py-3 font-semibold text-white transition ${darkMode ? "bg-[#27469e] hover:bg-[#1e3a8a]" : "bg-ink hover:bg-slate-700"}`}>
            Validate &amp; Commit to Organizational Memory
          </button>
        </div>
      </section>
    </div>
  );
}

