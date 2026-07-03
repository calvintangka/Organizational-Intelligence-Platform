import type { DerivedOrgStats } from "@/lib/orgMemory";

interface OrgMetricsDashboardProps {
  stats: DerivedOrgStats;
}

export function OrgMetricsDashboard({ stats }: OrgMetricsDashboardProps) {
  const noResolutions = stats.lifetimeTickets === 0;
  const noKnowledge = stats.canonicalProblems === 0;
  const noAICalls = stats.aiCalls === 0;

  const cards: Array<{ label: string; value: string; hint?: string; accent?: boolean }> = [
    { label: "Canonical problems", value: `${stats.canonicalProblems}` },
    { label: "Knowledge versions", value: `${stats.knowledgeVersions}` },
    { label: "Merged tickets", value: `${stats.mergedTickets}` },
    { label: "Duplicate prevention", value: stats.mergedTickets === 0 ? "--" : `${stats.duplicatePreventionRatePct}%`, accent: stats.duplicatePreventionRatePct > 0 },
    { label: "Lifetime tickets", value: stats.lifetimeTickets.toLocaleString() },
    { label: "Knowledge reused", value: stats.knowledgeReused.toLocaleString() },
    { label: "Auto resolution rate", value: noResolutions ? "--" : `${stats.autoResolutionRatePct}%`, accent: !noResolutions },
    { label: "Average trust", value: noKnowledge ? "--" : `${stats.averageTrust}`, accent: stats.averageTrust >= 80 },
    { label: "Avg resolution time", value: noResolutions ? "--" : `${stats.averageResolutionTimeSec} sec` },
    { label: "Memory growth today", value: `+${stats.memoryGrowthToday}`, hint: "new knowledge today" },
    { label: "Emerging patterns", value: `${stats.emergingPatternsDetected}`, hint: "detected by pattern discovery" },
    { label: "Promoted patterns", value: `${stats.promotedPatterns}`, accent: stats.promotedPatterns > 0 },
    { label: "Unresolved patterns", value: `${stats.unresolvedEmergingPatterns}`, accent: stats.unresolvedEmergingPatterns > 0 },
    { label: "AI calls", value: `${stats.aiCalls}` },
    { label: "AI success rate", value: noAICalls ? "--" : `${stats.aiSuccessRatePct}%`, accent: !noAICalls },
    { label: "AI fallbacks", value: `${stats.aiFallbacks}`, accent: stats.aiFallbacks > 0 },
    { label: "AI agreement", value: noAICalls ? "--" : `${stats.aiAgreementRatePct}%`, accent: stats.aiAgreementRatePct >= 80 },
    { label: "Human accepted AI", value: `${stats.humanAcceptedAISuggestions}`, accent: stats.humanAcceptedAISuggestions > 0 }
  ];

  return (
    <section className="rounded-3xl border border-purple-200 bg-purple-50/40 p-6 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-signal">
          Organization
        </span>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-trust">
          Persistent memory
        </span>
      </div>
      <h2 className="mt-2 text-2xl font-bold text-ink">Organizational intelligence (lifetime)</h2>
      <p className="mt-2 text-slate-600">
        These numbers persist across sessions and grow as the organization learns. They do not reset when you reset the session.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`rounded-2xl border p-5 ${card.accent ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}
          >
            <p className="text-sm font-semibold text-slate-500">{card.label}</p>
            <p className={`mt-2 text-3xl font-black ${card.accent ? "text-trust" : "text-ink"}`}>{card.value}</p>
            {card.hint ? <p className="mt-0.5 text-xs text-slate-400">{card.hint}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
