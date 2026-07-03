"use client";

import type { Metrics, OrgMetrics, EmergingPattern, KnowledgeItem } from "@/types";

interface DashboardViewProps {
  orgMetrics: OrgMetrics;
  metrics: Metrics;
  knowledgeItems: KnowledgeItem[];
  emergingPatterns: EmergingPattern[];
  darkMode: boolean;
  onPromote: (patternId: string) => void;
}

function StatCard({ label, value, darkMode }: { label: string; value: string; darkMode: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${darkMode ? "bg-[#1a2b3c] border-[#2d3f52]" : "bg-white border-slate-200"}`}>
      <p className={`text-sm ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>{label}</p>
      <p className={`mt-1 text-2xl font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>{value}</p>
    </div>
  );
}

function TrustGrowthChart({ items, darkMode }: { items: KnowledgeItem[]; darkMode: boolean }) {
  if (items.length === 0) {
    return (
      <div className={`flex items-center justify-center h-32 rounded-xl ${darkMode ? "bg-[#111827]" : "bg-slate-50"}`}>
        <p className={`text-sm ${darkMode ? "text-slate-500" : "text-slate-400"}`}>No trust data yet</p>
      </div>
    );
  }

  // Plot trust scores as points on a simple line chart
  const maxTrust = 100;
  const sorted = [...items].sort((a, b) => (a.trustScore ?? 20) - (b.trustScore ?? 20));
  const width = 400;
  const height = 120;
  const pad = 16;

  const points = sorted.map((item, i) => ({
    x: pad + (i / Math.max(sorted.length - 1, 1)) * (width - 2 * pad),
    y: pad + (1 - (item.trustScore ?? 20) / maxTrust) * (height - 2 * pad),
    trust: item.trustScore ?? 20,
    title: (item.canonicalProblemTitle ?? item.title).split(" ").slice(0, 2).join(" "),
  }));

  const polyline = points.map((p, i) => {
    if (i === 0) return `M${p.x},${p.y}`;
    const prev = points[i - 1];
    const cx = (prev.x + p.x) / 2;
    return `C${cx},${prev.y} ${cx},${p.y} ${p.x},${p.y}`;
  }).join(" ");

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minWidth: "200px", height: "120px" }}>
        {/* Grid line at 80 (auto-resolution) */}
        <line
          x1={pad} y1={pad + (1 - 80 / maxTrust) * (height - 2 * pad)}
          x2={width - pad} y2={pad + (1 - 80 / maxTrust) * (height - 2 * pad)}
          stroke={darkMode ? "#2d3f52" : "#e2e8f0"} strokeWidth="1" strokeDasharray="3,3"
        />
        {points.length > 1 && (
          <path d={polyline} fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" />
        )}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill="#2563EB" />
        ))}
      </svg>
    </div>
  );
}

const CATEGORY_COLORS = ["#2563EB", "#14B8A6", "#7C3AED", "#22C55E", "#F59E0B"];

export function DashboardView({ orgMetrics, metrics, knowledgeItems, emergingPatterns, darkMode, onPromote }: DashboardViewProps) {
  const totalResolved = (orgMetrics.autoResolutions ?? 0) + (orgMetrics.humanResolutions ?? 0);
  const reuseRate = totalResolved > 0 ? Math.round(((orgMetrics.knowledgeReused ?? 0) / totalResolved) * 100) : 0;
  const autoRate = totalResolved > 0 ? Math.round(((orgMetrics.autoResolutions ?? 0) / totalResolved) * 100) : 0;
  const versionCount = orgMetrics.knowledgeVersions ?? 0;
  const dupPrevPct = orgMetrics.duplicatePreventions ?? 0;

  // Category breakdown
  const categories = Array.from(new Set(knowledgeItems.map(k => k.category).filter(Boolean)));
  const maxCategory = Math.max(...categories.map(cat => knowledgeItems.filter(k => k.category === cat).length), 1);

  const activePatterms = emergingPatterns.filter(p => p.status !== "promoted");

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className={`text-3xl font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>
          Organizational Intelligence Dashboard
        </h1>
        <p className={`mt-1 text-sm ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>
          Measured by capability growth, not only ticket throughput.
        </p>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-6">
        <StatCard label="Knowledge growth" value={versionCount > 0 ? `${versionCount} versions` : `${knowledgeItems.length} entries`} darkMode={darkMode} />
        <StatCard label="Reuse rate" value={`${reuseRate}%`} darkMode={darkMode} />
        <StatCard label="Auto-resolution" value={`${autoRate}%`} darkMode={darkMode} />
        <StatCard label="Duplicate prevention" value={dupPrevPct > 0 ? `${dupPrevPct}` : "—"} darkMode={darkMode} />
      </div>

      {/* Trust growth + Emerging patterns */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px] mb-6">
        <div className={`rounded-2xl border p-5 ${darkMode ? "bg-[#1a2b3c] border-[#2d3f52]" : "bg-white border-slate-200"}`}>
          <h2 className={`font-bold mb-4 ${darkMode ? "text-white" : "text-[#111827]"}`}>Trust growth over time</h2>
          <TrustGrowthChart items={knowledgeItems} darkMode={darkMode} />
          {knowledgeItems.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-3">
              {knowledgeItems.slice(0, 4).map((item, i) => (
                <div key={item.id} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#2563EB]" />
                  <span className={`text-xs ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>
                    {(item.canonicalProblemTitle ?? item.title).split(" ").slice(0, 2).join(" ")}: {item.trustScore ?? 20}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={`rounded-2xl border p-5 ${darkMode ? "bg-[#1a2b3c] border-[#2d3f52]" : "bg-white border-slate-200"}`}>
          <h2 className={`font-bold mb-4 ${darkMode ? "text-white" : "text-[#111827]"}`}>Emerging patterns</h2>
          {activePatterms.length === 0 ? (
            <p className={`text-sm ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>
              No emerging patterns detected yet. OIP monitors repeated similar tickets.
            </p>
          ) : (
            <div className="space-y-2">
              {activePatterms.slice(0, 5).map((p) => (
                <div key={p.id} className={`rounded-xl p-3 ${darkMode ? "bg-[#111827]" : "bg-amber-50"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm font-medium ${darkMode ? "text-slate-200" : "text-[#111827]"}`}>{p.title}</p>
                    <span className={`text-xs font-semibold ${darkMode ? "text-amber-400" : "text-amber-600"}`}>
                      {p.confidenceScore}% confidence
                    </span>
                  </div>
                  {p.status === "suggested" && p.suggestedCanonicalProblem && (
                    <button
                      type="button"
                      onClick={() => onPromote(p.id)}
                      className="mt-2 rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600 transition-colors"
                    >
                      Promote to knowledge
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top canonical problems + learning velocity */}
      {categories.length > 0 && (
        <div className={`rounded-2xl border p-5 ${darkMode ? "bg-[#1a2b3c] border-[#2d3f52]" : "bg-white border-slate-200"}`}>
          <h2 className={`font-bold mb-4 ${darkMode ? "text-white" : "text-[#111827]"}`}>
            Top canonical problems and learning velocity
          </h2>
          <div className="space-y-3">
            {categories.slice(0, 5).map((cat, i) => {
              const count = knowledgeItems.filter(k => k.category === cat).length;
              const pct = Math.round((count / maxCategory) * 100);
              return (
                <div key={cat} className="flex items-center gap-3">
                  <span className={`w-20 text-sm text-right flex-shrink-0 ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>{cat}</span>
                  <div className={`flex-1 rounded-full overflow-hidden h-3 ${darkMode ? "bg-[#111827]" : "bg-slate-100"}`}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
                    />
                  </div>
                  <span className={`text-xs w-6 flex-shrink-0 ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Session metrics */}
      <div className={`mt-4 rounded-2xl border p-5 ${darkMode ? "bg-[#1a2b3c] border-[#2d3f52]" : "bg-white border-slate-200"}`}>
        <h2 className={`font-bold mb-4 ${darkMode ? "text-white" : "text-[#111827]"}`}>Session activity</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Tickets processed", value: metrics.ticketsProcessed },
            { label: "Knowledge items created", value: metrics.knowledgeItemsCreated },
            { label: "Knowledge items reused", value: metrics.knowledgeItemsReused },
            { label: "Human approvals", value: metrics.humanApprovedResponses },
            { label: "Auto-resolutions", value: metrics.autoResolutions },
            { label: "Estimated time saved (min)", value: metrics.estimatedTimeSavedMinutes },
          ].map((m) => (
            <div key={m.label} className={`rounded-xl p-3 ${darkMode ? "bg-[#111827]" : "bg-slate-50"}`}>
              <p className={`text-xs ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>{m.label}</p>
              <p className={`text-xl font-bold mt-0.5 ${darkMode ? "text-white" : "text-[#111827]"}`}>{m.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
