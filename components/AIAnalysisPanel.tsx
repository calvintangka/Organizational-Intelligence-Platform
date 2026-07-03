import type { AIAnalysis } from "@/types";

interface AIAnalysisPanelProps {
  analysis: AIAnalysis;
}

export function AIAnalysisPanel({ analysis }: AIAnalysisPanelProps) {
  const signals = analysis.detectedSignals ?? [];

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-signal">
          OIP Engine
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-600">
          Deterministic analysis
        </span>
      </div>
      <h2 className="mt-2 text-2xl font-bold text-ink">Issue analyzed into a reusable signal</h2>
      <p className="mt-2 text-sm text-slate-600">
        The deterministic OIP engine classifies the issue first. Any AI suggestion is advisory and shown separately.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Summary</p>
          <p className="mt-2 text-sm leading-7 text-slate-800">{analysis.summary}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Core problem</p>
          <p className="mt-2 text-sm leading-7 text-slate-800">{analysis.coreProblem}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-memory">
          {analysis.category}
        </span>
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${
            analysis.urgency === "high"
              ? "bg-red-50 text-red-700"
              : analysis.urgency === "low"
              ? "bg-slate-100 text-slate-600"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {analysis.urgency} urgency
        </span>
        {analysis.suggestedTags.map((tag) => (
          <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
            #{tag}
          </span>
        ))}
      </div>

      {signals.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-purple-100 bg-purple-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-signal">Detected signals</p>
          <p className="mt-1 text-xs text-slate-600">
            Keywords found in the ticket that informed the category and tags:
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {signals.map((signal) => (
              <span key={signal} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-signal ring-1 ring-purple-200">
                {signal}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
