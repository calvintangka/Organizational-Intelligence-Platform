import type { ReasoningSummary, Confidence } from "@/types/oip";

interface ReasoningPanelProps {
  reasoning: ReasoningSummary;
  confidence: Confidence;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "bg-emerald-50 border-emerald-200 text-trust",
  medium: "bg-amber-50 border-amber-200 text-amber-800",
  low: "bg-red-50 border-red-200 text-red-800"
};

const CONFIDENCE_BAR: Record<string, string> = {
  high: "bg-trust",
  medium: "bg-amber-500",
  low: "bg-red-500"
};

export function ReasoningPanel({ reasoning, confidence }: ReasoningPanelProps) {
  const colorClass = CONFIDENCE_COLORS[confidence.level] ?? CONFIDENCE_COLORS["low"];
  const barClass = CONFIDENCE_BAR[confidence.level] ?? CONFIDENCE_BAR["low"];

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-signal">
          OIP Engine
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-600">
          Deterministic reasoning
        </span>
      </div>
      <h2 className="mt-2 text-xl font-bold text-ink">Reasoning &amp; Confidence</h2>
      <p className="mt-1 text-sm text-slate-600">
        The engine explains what it understood and why it is or is not confident. Confidence affects copy only — it never bypasses human review.
      </p>

      <div className="mt-5 space-y-4">
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What the system understood</p>
          <p className="mt-2 text-sm leading-6 text-slate-800">{reasoning.understood}</p>
        </div>

        {reasoning.relevantMemory ? (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-memory">Relevant memory found</p>
            <p className="mt-1 font-semibold text-ink">{reasoning.relevantMemory}</p>
            {reasoning.relevanceReason ? (
              <p className="mt-1 text-sm leading-6 text-slate-700">{reasoning.relevanceReason}</p>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">No prior memory matched</p>
            <p className="mt-1 text-sm text-slate-600">This ticket will create new organizational knowledge after human review.</p>
          </div>
        )}

        <div className={`rounded-2xl border p-4 ${colorClass}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide">
              Confidence: {confidence.level} ({confidence.score}/100)
            </p>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-white/60">
            <div
              className={`h-2 rounded-full ${barClass} transition-all duration-500`}
              style={{ width: `${confidence.score}%` }}
            />
          </div>
          {confidence.basis.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {confidence.basis.map((b) => (
                <li key={b} className="flex gap-1.5 text-xs">
                  <span>✓</span> {b}
                </li>
              ))}
            </ul>
          ) : null}
          {confidence.uncertainty.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {confidence.uncertainty.map((u) => (
                <li key={u} className="flex gap-1.5 text-xs opacity-70">
                  <span>○</span> {u}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Why human review is required</p>
          <p className="mt-1 text-sm leading-6 text-amber-900">{reasoning.humanReviewRationale}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
          <p className="font-semibold">Uncertainty</p>
          <p className="mt-0.5">{reasoning.uncertainty}</p>
        </div>
      </div>
    </section>
  );
}
