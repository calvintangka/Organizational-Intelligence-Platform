interface HumanReviewEditorProps {
  reviewedResponse: string;
  onChange: (value: string) => void;
  onApprove: () => void;
  canApprove?: boolean;
  placeholderText?: string;
  sourceLabel?: string;
  fallbackNotice?: string;
  fallbackTechnicalDetails?: string;
  /** Raw validated template - shown alongside the AI draft for comparison */
  deterministicDraft?: string;
  /** Whether the current draft came from the AI advisory */
  isAIDraft?: boolean;
  /** Whether no deterministic template exists and the human must author from scratch */
  isNoTemplate?: boolean;
  showRetryButton?: boolean;
  isRetrying?: boolean;
  onRetryAIDraft?: () => void;
}

export function HumanReviewEditor({
  reviewedResponse,
  onChange,
  onApprove,
  canApprove = true,
  placeholderText,
  sourceLabel,
  fallbackNotice,
  fallbackTechnicalDetails,
  deterministicDraft,
  isAIDraft = false,
  isNoTemplate = false,
  showRetryButton = false,
  isRetrying = false,
  onRetryAIDraft,
}: HumanReviewEditorProps) {
  const showComparison = isAIDraft && deterministicDraft && deterministicDraft.trim() !== reviewedResponse.trim();
  const sourceBadge = isNoTemplate ? "No template available" : isAIDraft ? "AI advisory" : "Deterministic draft";
  const sourceBadgeClass = isNoTemplate
    ? "bg-blue-50 text-[#2563EB]"
    : isAIDraft
    ? "bg-purple-50 text-signal"
    : "bg-slate-100 text-slate-700";

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${sourceBadgeClass}`}>
          {sourceBadge}
        </span>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-trust">
          Human review required
        </span>
      </div>
      <h2 className="mt-2 text-2xl font-bold text-ink">Draft response ready</h2>
      <p className="mt-2 text-slate-600">
        {isNoTemplate
          ? "OIP could not find an existing category or response template for this ticket. Write the first validated response below, then continue to reflection so the organization can learn this issue type."
          : sourceLabel
          ? sourceLabel
          : "Write the correct response below, then approve it to continue into reflection. OIP does not send or learn from this draft until a human approves it."}
      </p>

      {fallbackNotice && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-amber-800">{fallbackNotice}</p>
            {showRetryButton && onRetryAIDraft && (
              <button
                type="button"
                onClick={onRetryAIDraft}
                disabled={isRetrying}
                className="flex-shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRetrying ? "Retrying..." : "Retry AI draft"}
              </button>
            )}
          </div>
          {fallbackTechnicalDetails && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-amber-600 hover:text-amber-800">Technical details</summary>
              <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-amber-100/60 p-2 font-mono text-[11px] leading-5 text-amber-900/80">{fallbackTechnicalDetails}</pre>
            </details>
          )}
        </div>
      )}

      {isNoTemplate && placeholderText && (
        <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[#2563EB]">Authoring prompt</p>
          <p className="mt-1 text-sm leading-6 text-slate-700">{placeholderText}</p>
        </div>
      )}

      {showComparison && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
            AI personalized this draft from the validated template - compare before approving
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-600">Raw validated template</p>
              <div className="min-h-32 whitespace-pre-line rounded-xl border border-slate-200 bg-white p-3 text-xs leading-6 text-slate-700">
                {deterministicDraft}
              </div>
              <button
                type="button"
                onClick={() => onChange(deterministicDraft!)}
                className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Use this version
              </button>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-amber-700">AI-personalized draft</p>
              <div className="min-h-32 whitespace-pre-line rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs leading-6 text-slate-700">
                {reviewedResponse}
              </div>
              <p className="mt-2 text-[10px] text-amber-600">
                Already loaded in the editor below - edit freely or switch to the raw template.
              </p>
            </div>
          </div>
        </div>
      )}

      <textarea
        value={reviewedResponse}
        onChange={(event) => onChange(event.target.value)}
        placeholder={isNoTemplate ? placeholderText : undefined}
        className="mt-5 min-h-56 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 leading-7 text-slate-800 outline-none transition focus:border-trust focus:ring-4 focus:ring-emerald-100"
      />

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onApprove}
          disabled={!canApprove}
          className="rounded-2xl bg-trust px-5 py-3 font-semibold text-white shadow-sm disabled:opacity-50"
        >
          Approve & Continue to Reflection
        </button>
        <span className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-trust">
          Knowledge validation happens in the next step.
        </span>
      </div>
    </section>
  );
}
