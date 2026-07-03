"use client";

import type { KnowledgeItem, OrgMetrics, EmergingPattern } from "@/types";
import type { ActiveView } from "@/components/maesa/Sidebar";

interface HomeViewProps {
  knowledgeItems: KnowledgeItem[];
  orgMetrics: OrgMetrics;
  emergingPatterns: EmergingPattern[];
  orgName: string;
  darkMode: boolean;
  onNavigate: (view: ActiveView) => void;
  onNewTicket: () => void;
}

function StatCard({ label, value, darkMode }: { label: string; value: string | number; darkMode: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${darkMode ? "bg-[#1a2b3c] border-[#2d3f52]" : "bg-white border-slate-200"}`}>
      <p className={`text-sm ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>{label}</p>
      <p className={`mt-1 text-3xl font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>{value}</p>
    </div>
  );
}

const TIMELINE_COLORS: Record<string, string> = {
  green: "bg-[#22C55E]",
  blue: "bg-[#2563EB]",
  amber: "bg-[#F59E0B]",
  purple: "bg-[#7C3AED]",
};

export function HomeView({ knowledgeItems, orgMetrics, emergingPatterns, orgName, darkMode, onNavigate, onNewTicket }: HomeViewProps) {
  const autoResolved = orgMetrics.autoResolutions ?? 0;
  const totalResolved = (orgMetrics.autoResolutions ?? 0) + (orgMetrics.humanResolutions ?? 0);
  const reuseRate = totalResolved > 0 ? Math.round(((orgMetrics.knowledgeReused ?? 0) / totalResolved) * 100) : 0;
  const trustGrowth = knowledgeItems.length > 0 ? Math.round(knowledgeItems.reduce((sum, k) => sum + (k.trustScore ?? 20), 0) / knowledgeItems.length) : 0;

  // Learning timeline events derived from actual state
  const timelineEvents: { color: string; label: string; time: string }[] = [];

  if (orgMetrics.knowledgeVersions && orgMetrics.knowledgeVersions > 0) {
    timelineEvents.push({ color: "green", label: `Knowledge improved to new version`, time: "recent" });
  }
  if (orgMetrics.autoResolutions && orgMetrics.autoResolutions > 0) {
    timelineEvents.push({ color: "blue", label: `Trust increased after ${orgMetrics.autoResolutions} auto-resolutions`, time: "this session" });
  }
  if (emergingPatterns.filter(p => p.status !== "promoted").length > 0) {
    const pat = emergingPatterns.find(p => p.status !== "promoted");
    timelineEvents.push({ color: "amber", label: `Emerging pattern detected: ${pat?.title ?? "unknown"}`, time: "recent" });
  }
  if (orgMetrics.knowledgeReused && orgMetrics.knowledgeReused > 0) {
    timelineEvents.push({ color: "purple", label: `Knowledge reused ${orgMetrics.knowledgeReused} times across tickets`, time: "this session" });
  }
  if (timelineEvents.length === 0) {
    timelineEvents.push({ color: "blue", label: "Submit a ticket to start building organizational memory", time: "now" });
    timelineEvents.push({ color: "green", label: "Knowledge grows from every approved resolution", time: "—" });
    timelineEvents.push({ color: "purple", label: "Trust earns auto-resolution over time", time: "—" });
  }

  const trustLabel = (score: number) => score >= 80 ? "Auto eligible" : "Human review";
  const trustColor = (score: number) => score >= 80
    ? (darkMode ? "bg-emerald-900/50 text-emerald-300" : "bg-emerald-50 text-emerald-700")
    : (darkMode ? "bg-amber-900/50 text-amber-300" : "bg-amber-50 text-amber-700");

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Greeting */}
      <div className="mb-6">
        <div>
          <h1 className={`text-3xl font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>
            Good morning, {orgName} Support Team
          </h1>
          <p className={`mt-1 text-sm ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>
            Today&apos;s work and recent organizational learning.
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-6">
        <StatCard label="Open tickets" value={orgMetrics.lifetimeTickets ?? 0} darkMode={darkMode} />
        <StatCard label="Knowledge reused today" value={orgMetrics.knowledgeReused ?? 0} darkMode={darkMode} />
        <StatCard label="Auto-resolved today" value={autoResolved} darkMode={darkMode} />
        <StatCard label="Trust growth" value={trustGrowth > 0 ? `+${trustGrowth}` : "—"} darkMode={darkMode} />
      </div>

      {/* Mid row: Timeline + Quick actions */}
      <div className="grid gap-4 lg:grid-cols-[1fr_300px] mb-6">
        {/* Organizational learning timeline */}
        <div className={`rounded-2xl border p-5 ${darkMode ? "bg-[#1a2b3c] border-[#2d3f52]" : "bg-white border-slate-200"}`}>
          <h2 className={`font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>Organizational learning timeline</h2>
          <div className="mt-4 space-y-3">
            {timelineEvents.map((event, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${TIMELINE_COLORS[event.color]}`} />
                  <span className={`text-sm ${darkMode ? "text-slate-300" : "text-[#111827]"}`}>{event.label}</span>
                </div>
                <span className={`text-xs flex-shrink-0 ${darkMode ? "text-slate-500" : "text-[#667085]"}`}>{event.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className={`rounded-2xl border p-5 ${darkMode ? "bg-[#1a2b3c] border-[#2d3f52]" : "bg-white border-slate-200"}`}>
          <h2 className={`font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>Quick actions</h2>
          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={onNewTicket}
              className="w-full rounded-xl bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors text-left"
            >
              New Ticket
            </button>
            <button
              type="button"
              onClick={() => onNavigate("knowledge")}
              className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors text-left ${darkMode ? "bg-[#111827] text-white hover:bg-[#0f1a27]" : "bg-[#111827] text-white hover:bg-slate-800"}`}
            >
              Search Knowledge
            </button>
            <button
              type="button"
              onClick={() => onNavigate("dashboard")}
              className={`w-full rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition-colors ${darkMode ? "bg-[#1e3048] text-slate-200 hover:bg-[#24344d]" : "bg-slate-50 text-[#111827] hover:bg-slate-100"}`}
            >
              Open Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* What the organization knows */}
      {knowledgeItems.length > 0 && (
        <div className={`rounded-2xl border p-5 ${darkMode ? "bg-[#1a2b3c] border-[#2d3f52]" : "bg-white border-slate-200"}`}>
          <h2 className={`font-bold mb-4 ${darkMode ? "text-white" : "text-[#111827]"}`}>What the organization knows</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {knowledgeItems.slice(0, 6).map((item) => {
              const trust = item.trustScore ?? 20;
              const versionCount = item.knowledgeVersions?.length ?? 1;
              const tickets = item.exampleTickets?.length ?? 1;
              const lastReflection = item.knowledgeVersions?.length
                ? `created v${versionCount} version`
                : "confirmed existing solution";
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate("knowledge")}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    darkMode
                      ? "border-[#2d3f52] hover:bg-[#1e3048]"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <p className={`font-bold text-sm ${darkMode ? "text-white" : "text-[#111827]"}`}>
                    {item.canonicalProblemTitle ?? item.title}
                  </p>
                  <p className={`mt-1 text-xs ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>
                    Trust {trust} • v{versionCount} • {tickets} ticket{tickets !== 1 ? "s" : ""}
                  </p>
                  <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${trustColor(trust)}`}>
                    {trustLabel(trust)}
                  </span>
                  <p className={`mt-2 text-xs ${darkMode ? "text-slate-500" : "text-slate-500"}`}>
                    Recent reflection: {lastReflection}
                  </p>
                </button>
              );
            })}
          </div>
          {knowledgeItems.length === 0 && (
            <p className={`text-sm ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>
              No knowledge yet. Submit and approve a ticket to create the first organizational knowledge entry.
            </p>
          )}
        </div>
      )}

      {knowledgeItems.length === 0 && (
        <div className={`rounded-2xl border border-dashed p-10 text-center ${darkMode ? "border-[#2d3f52]" : "border-slate-300"}`}>
          <p className={`font-semibold ${darkMode ? "text-white" : "text-[#111827]"}`}>No organizational knowledge yet</p>
          <p className={`mt-1 text-sm ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>
            Submit a ticket and approve a resolution to teach OIP its first lesson.
          </p>
          <button
            type="button"
            onClick={onNewTicket}
            className="mt-4 rounded-xl bg-[#2563EB] px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Submit first ticket
          </button>
        </div>
      )}
    </div>
  );
}
