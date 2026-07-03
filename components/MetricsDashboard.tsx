import type { Metrics } from "@/types";

interface MetricsDashboardProps {
  metrics: Metrics;
}

const labels: Record<keyof Metrics, string> = {
  ticketsProcessed: "Tickets processed",
  knowledgeItemsCreated: "Knowledge items created",
  knowledgeItemsReused: "Knowledge items reused",
  estimatedTimeSavedMinutes: "Estimated minutes saved",
  humanApprovedResponses: "Human approvals",
  repeatedIssuesDetected: "Repeated issues detected",
  memoryRetrievals: "Memory retrievals",
  outOfScopeDismissals: "Out-of-scope dismissals",
  clarificationRequests: "Clarification requests",
  autoResolutions: "Automatic resolutions",
  canonicalProblemsTouched: "Canonical problems touched",
  knowledgeVersionsCreated: "Knowledge versions created",
  mergedTickets: "Merged tickets",
  duplicatePreventions: "Duplicate preventions",
  emergingPatternsDetected: "Emerging patterns detected",
  aiCalls: "AI calls",
  aiSuccesses: "AI successes",
  aiFailures: "AI failures",
  aiFallbacks: "AI fallbacks"
};

export function MetricsDashboard({ metrics }: MetricsDashboardProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-signal">
          OIP Engine
        </span>
      </div>
      <h2 className="mt-2 text-2xl font-bold text-ink">Session metrics</h2>
      <p className="mt-2 text-slate-600">
        These metrics reflect what happened in the current session. They reset on Reset Session — the Organization metrics above persist.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(Object.keys(metrics) as Array<keyof Metrics>).map((key) => (
          <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-500">{labels[key]}</p>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-memory">
                Live
              </span>
            </div>
            <p className="mt-2 text-3xl font-black text-ink">{metrics[key]}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        The deterministic OIP stays in charge. AI metrics only reflect advisory calls, never autonomous decisions.
      </p>
    </section>
  );
}
