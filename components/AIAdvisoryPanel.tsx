import type { AIAdvisory } from "@/types";

interface AIAdvisoryPanelProps {
  advisory: AIAdvisory | null;
}

const statusCopy: Record<AIAdvisory["status"], { label: string; className: string }> = {
  verified: { label: "Verified", className: "bg-emerald-50 text-trust" },
  advisory_only: { label: "Advisory Only", className: "bg-blue-50 text-memory" },
  needs_human_review: { label: "Needs Human Review", className: "bg-amber-50 text-amber-700" },
  unavailable: { label: "AI Unavailable", className: "bg-slate-100 text-slate-600" },
  disabled: { label: "AI Disabled", className: "bg-slate-100 text-slate-600" }
};

export function AIAdvisoryPanel({ advisory }: AIAdvisoryPanelProps) {
  if (!advisory) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-600">
            AI Advisory
          </span>
        </div>
        <h2 className="mt-2 text-2xl font-bold text-ink">AI suggestions appear when analysis runs</h2>
        <p className="mt-2 text-slate-600">
          The Organizational Intelligence Platform stays deterministic. AI suggestions, when enabled, appear here for comparison.
        </p>
      </section>
    );
  }

  const status = statusCopy[advisory.status];

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-signal">
          AI Advisory
        </span>
        <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${status.className}`}>
          {status.label}
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-600">
          {advisory.providerLabel}
        </span>
      </div>

      <h2 className="mt-2 text-2xl font-bold text-ink">AI assists. The OIP decides.</h2>
      <p className="mt-2 text-sm text-slate-600">
        Deterministic analysis remains authoritative. AI can suggest better labels, drafts, and enrichment, but it never approves or updates memory.
      </p>

      {advisory.availabilityMessage ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700">
          {advisory.availabilityMessage}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
        <InfoCard label="Deterministic" value={advisory.deterministicLabel} />
        <InfoCard label="AI Suggestion" value={advisory.aiLabel} />
        <InfoCard label="Agreement" value={`${advisory.agreementPct}%`} accent={advisory.agreementPct >= 85} />
        <InfoCard label="Confidence" value={`${advisory.confidencePct}%`} accent={advisory.confidencePct >= 70} />
        <InfoCard label="Status" value={status.label} accent={advisory.status === "verified"} />
      </div>

      {advisory.analysisSuggestion ? (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">AI understanding</p>
          <p className="mt-1 text-sm text-slate-700">{advisory.analysisSuggestion.summary}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-memory">
              {advisory.analysisSuggestion.category}
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
              {advisory.analysisSuggestion.urgency} urgency
            </span>
            {advisory.analysisSuggestion.tags.slice(0, 5).map((tag) => (
              <span key={tag} className="rounded-full bg-white px-3 py-1 text-xs text-slate-600">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {advisory.responseSuggestion || advisory.knowledgeEnrichment ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {advisory.responseSuggestion ? (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-memory">AI draft suggestion</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{advisory.responseSuggestion.draftResponse}</p>
            </div>
          ) : null}
          {advisory.knowledgeEnrichment ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-trust">AI knowledge enrichment</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {advisory.knowledgeEnrichment.internalGuidance[0] ?? advisory.knowledgeEnrichment.rootCauseHypotheses[0] ?? "No enrichment returned."}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function InfoCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-sm font-semibold leading-6 ${accent ? "text-trust" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}
