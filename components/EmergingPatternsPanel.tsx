import type { EmergingPattern } from "@/types/patterns";

interface EmergingPatternsPanelProps {
  patterns: EmergingPattern[];
  onPromote: (patternId: string) => void;
}

export function EmergingPatternsPanel({ patterns, onPromote }: EmergingPatternsPanelProps) {
  const active = patterns.filter((p) => p.status !== "dismissed");

  if (active.length === 0) {
    return (
      <section className="rounded-3xl border border-amber-200 bg-amber-50/40 p-6 shadow-soft">
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-700">
          Pattern Discovery
        </span>
        <h2 className="mt-2 text-2xl font-bold text-ink">Emerging Organizational Patterns</h2>
        <p className="mt-2 text-slate-600">
          No emerging patterns detected yet. Process tickets that do not match existing canonical problems to discover new patterns.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-amber-200 bg-amber-50/40 p-6 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-700">
          Pattern Discovery
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
          {active.length} pattern{active.length !== 1 ? "s" : ""}
        </span>
      </div>
      <h2 className="mt-2 text-2xl font-bold text-ink">Emerging Organizational Patterns</h2>
      <p className="mt-2 text-slate-600">
        The OIP discovers recurring problems that are not yet captured as canonical knowledge.
        Patterns with enough evidence can be promoted to canonical problems.
      </p>

      <div className="mt-5 grid gap-4">
        {active.map((pattern) => (
          <PatternCard key={pattern.id} pattern={pattern} onPromote={onPromote} />
        ))}
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: EmergingPattern["status"] }) {
  const styles: Record<EmergingPattern["status"], string> = {
    monitoring: "bg-slate-100 text-slate-600",
    suggested: "bg-amber-100 text-amber-700",
    promoted: "bg-emerald-100 text-trust",
    dismissed: "bg-red-100 text-red-600"
  };
  const labels: Record<EmergingPattern["status"], string> = {
    monitoring: "Monitoring",
    suggested: "Suggested",
    promoted: "Promoted",
    dismissed: "Dismissed"
  };

  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function PatternCard({ pattern, onPromote }: { pattern: EmergingPattern; onPromote: (id: string) => void }) {
  const canPromote =
    (pattern.status === "suggested" || pattern.suggestedCanonicalProblem) &&
    pattern.status !== "promoted";

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-ink">{pattern.title}</h3>
            <StatusBadge status={pattern.status} />
            {pattern.suggestedCanonicalProblem && pattern.status !== "promoted" ? (
              <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-signal">
                Promote Candidate
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{pattern.summary}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${
            pattern.confidenceScore >= 75
              ? "bg-emerald-50 text-trust"
              : pattern.confidenceScore >= 50
              ? "bg-amber-50 text-amber-700"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {pattern.confidenceScore}% confidence
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <PatternStat label="Seen" value={`${pattern.timesSeen}`} accent={pattern.timesSeen >= 5} />
        <PatternStat
          label="Confidence"
          value={`${pattern.confidenceScore}%`}
          accent={pattern.confidenceScore >= 75}
        />
        <PatternStat label="Category" value={pattern.category} />
        <PatternStat
          label="Suggest CP"
          value={pattern.suggestedCanonicalProblem ? "YES" : "no"}
          accent={pattern.suggestedCanonicalProblem}
        />
      </dl>

      {pattern.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {pattern.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {pattern.exampleTickets.length > 0 ? (
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Example Tickets</p>
          <ul className="mt-2 space-y-1.5">
            {pattern.exampleTickets.slice(0, 6).map((ex) => (
              <li key={ex.ticketId} className="text-xs leading-5 text-slate-600">
                <span className="font-semibold">{ex.customerName}:</span> {ex.originalIssue}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canPromote ? (
        <button
          type="button"
          onClick={() => onPromote(pattern.id)}
          className="mt-3 rounded-2xl bg-signal px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-700"
        >
          Promote to Canonical Problem
        </button>
      ) : null}

      {pattern.status === "promoted" ? (
        <p className="mt-3 text-sm font-semibold text-trust">Promoted to canonical problem</p>
      ) : null}
    </article>
  );
}

function PatternStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-2 text-center ${
        accent ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"
      }`}
    >
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-sm font-bold ${accent ? "text-amber-700" : "text-ink"}`}>{value}</dd>
    </div>
  );
}
