"use client";

import { useState } from "react";
import type { KnowledgeItem, EmergingPattern, ValidationRecord, MemoryChangeRecord } from "@/types";
import { MemoryNetworkOverlay } from "@/components/MemoryNetworkOverlay";

interface KnowledgeViewProps {
  knowledgeItems: KnowledgeItem[];
  emergingPatterns: EmergingPattern[];
  validationRecords: ValidationRecord[];
  memoryChangeRecords: MemoryChangeRecord[];
  darkMode: boolean;
  orgId: string;
  onPromote: (patternId: string) => void;
}

function TrustBadge({ score, darkMode }: { score: number; darkMode: boolean }) {
  const isAuto = score >= 80;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
      isAuto
        ? (darkMode ? "bg-emerald-900/60 text-emerald-300" : "bg-emerald-100 text-emerald-700")
        : (darkMode ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600")
    }`}>
      Trust {score}
    </span>
  );
}

function VersionBadge({ count, darkMode }: { count: number; darkMode: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${darkMode ? "bg-blue-900/50 text-blue-300" : "bg-blue-50 text-blue-700"}`}>
      v{count}
    </span>
  );
}

function VersionTimeline({ count, darkMode }: { count: number; darkMode: boolean }) {
  return (
    <div className="flex items-center gap-1.5 mt-2">
      {Array.from({ length: Math.min(count, 6) }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full ${
            i === count - 1
              ? "w-6 bg-[#2563EB]"
              : (darkMode ? "w-4 bg-slate-600" : "w-4 bg-slate-200")
          }`}
        />
      ))}
    </div>
  );
}

function MemoryNetwork({ items, darkMode, onExpand }: { items: KnowledgeItem[]; darkMode: boolean; onExpand: () => void }) {
  if (items.length === 0) return null;

  // Simple bubble layout for 4-6 items
  const positions = [
    { x: 55, y: 35 },
    { x: 20, y: 60 },
    { x: 80, y: 65 },
    { x: 40, y: 80 },
    { x: 65, y: 85 },
  ];

  const colors = ["#c7d2fe", "#bbf7d0", "#fde68a", "#ddd6fe"];

  return (
    <div
      className={`rounded-2xl border p-5 cursor-pointer group transition-colors ${darkMode ? "bg-[#1a2b3c] border-[#2d3f52] hover:border-blue-500/40" : "bg-white border-slate-200 hover:border-blue-300"}`}
      onClick={onExpand}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onExpand(); }}
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className={`font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>Memory network</h2>
        <svg
          width="16" height="16" viewBox="0 0 16 16" fill="none"
          className={`transition-opacity ${darkMode ? "text-slate-500 group-hover:text-blue-400" : "text-slate-400 group-hover:text-blue-600"}`}
        >
          <path d="M6 2H2v4M14 2h-4m4 0v4M6 14H2v-4m12 4h-4m4 0v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="relative" style={{ height: "200px" }}>
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {items.slice(0, 5).map((item, i) => {
            const pos = positions[i] ?? { x: 50, y: 50 };
            const nextPos = positions[(i + 1) % Math.min(items.length, 5)];
            return (
              <g key={item.id}>
                {i < items.length - 1 && (
                  <line
                    x1={pos.x} y1={pos.y} x2={nextPos.x} y2={nextPos.y}
                    stroke={darkMode ? "#2d3f52" : "#e2e8f0"} strokeWidth="0.5"
                  />
                )}
              </g>
            );
          })}
          {items.slice(0, 5).map((item, i) => {
            const pos = positions[i] ?? { x: 50, y: 50 };
            const title = (item.canonicalProblemTitle ?? item.title).split(" ").slice(0, 2).join(" ");
            return (
              <g key={item.id}>
                <ellipse cx={pos.x} cy={pos.y} rx="14" ry="8" fill={colors[i % colors.length]} opacity="0.8" />
                <text x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="middle" fontSize="3.5" fill="#374151" fontWeight="500">
                  {title}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className={`text-[10px] text-center mt-1 transition-opacity opacity-0 group-hover:opacity-100 ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
        Click to expand
      </p>
    </div>
  );
}

export function KnowledgeView({
  knowledgeItems,
  emergingPatterns,
  validationRecords,
  memoryChangeRecords,
  darkMode,
  orgId,
  onPromote
}: KnowledgeViewProps) {
  const [networkOpen, setNetworkOpen] = useState(false);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <span className={`text-xs font-bold uppercase tracking-widest ${darkMode ? "text-blue-400" : "text-[#2563EB]"}`}>MEMORY</span>
        <h1 className={`mt-1 text-3xl font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>Organizational Memory</h1>
        <p className={`mt-1 text-sm ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>
          Living knowledge with trust, provenance, and version history.
        </p>
        {knowledgeItems.length > 0 && (
          <p className={`mt-2 text-sm font-semibold ${darkMode ? "text-slate-300" : "text-[#111827]"}`}>
            Canonical problems become reusable organizational knowledge
          </p>
        )}
      </div>

      {knowledgeItems.length === 0 ? (
        <div className={`rounded-2xl border border-dashed p-12 text-center ${darkMode ? "border-[#2d3f52]" : "border-slate-300"}`}>
          <p className={`font-semibold ${darkMode ? "text-white" : "text-[#111827]"}`}>No organizational memory yet</p>
          <p className={`mt-1 text-sm ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>
            Approved resolutions become knowledge entries here.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          {/* Knowledge cards */}
          <div className="space-y-4">
            {knowledgeItems.map((item) => {
              const trust = item.trustScore ?? 20;
              const versionCount = (item.knowledgeVersions?.length ?? 0) || 1;
              const tickets = item.exampleTickets?.length ?? 0;
              const lastUpdated = item.lastUpdated ?? item.lastValidated ?? item.approvedAt ?? item.createdAt;
              const itemValidations = validationRecords.filter((record) => record.knowledgeId === item.id);
              const itemChanges = memoryChangeRecords.filter((record) => record.knowledgeId === item.id);
              const dateStr = lastUpdated
                ? new Date(lastUpdated).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                : "—";

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-5 ${darkMode ? "bg-[#1a2b3c] border-[#2d3f52]" : "bg-white border-slate-200"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className={`text-lg font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>
                        {item.canonicalProblemTitle ?? item.title}
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <TrustBadge score={trust} darkMode={darkMode} />
                        <VersionBadge count={versionCount} darkMode={darkMode} />
                        <span className={`text-xs ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>
                          {tickets} supporting ticket{tickets !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <p className={`text-xs font-semibold ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Version timeline</p>
                    <VersionTimeline count={versionCount} darkMode={darkMode} />
                  </div>

                  <p className={`mt-3 text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                    Provenance verified • Last updated {dateStr}
                  </p>

                  {/* Expanded details */}
                  {item.customerResponseTemplate && (
                    <details className="mt-3">
                      <summary className={`cursor-pointer text-xs font-semibold ${darkMode ? "text-blue-400" : "text-[#2563EB]"} hover:underline`}>
                        View knowledge details
                      </summary>
                      <div className="mt-3 space-y-3">
                        {item.internalGuidance && (
                          <div>
                            <p className={`text-xs font-bold uppercase tracking-wide mb-1 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Internal guidance</p>
                            <p className={`text-xs leading-5 rounded-lg p-3 ${darkMode ? "bg-[#111827] text-slate-300" : "bg-slate-50 text-slate-600"}`}>
                              {item.internalGuidance}
                            </p>
                          </div>
                        )}
                        <div>
                          <p className={`text-xs font-bold uppercase tracking-wide mb-1 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Customer response template</p>
                          <p className={`text-xs leading-5 rounded-lg p-3 whitespace-pre-line ${darkMode ? "bg-[#111827] text-slate-300" : "bg-slate-50 text-slate-600"}`}>
                            {item.customerResponseTemplate}
                          </p>
                        </div>
                        {item.knowledgeVersions && item.knowledgeVersions.length > 1 && (
                          <div>
                            <p className={`text-xs font-bold uppercase tracking-wide mb-1 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Version history</p>
                            <div className="space-y-1">
                              {item.knowledgeVersions.map((v) => (
                                <div key={v.versionId} className={`text-xs p-2 rounded-lg ${darkMode ? "bg-[#111827]" : "bg-slate-50"}`}>
                                  <span className={`font-semibold ${darkMode ? "text-blue-400" : "text-[#2563EB]"}`}>v{v.version ?? v.versionId}</span>
                                  {v.changeReason && <span className={`ml-2 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{v.changeReason}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div>
                          <p className={`text-xs font-bold uppercase tracking-wide mb-1 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Validation history</p>
                          {itemValidations.length === 0 ? (
                            <p className={`text-xs rounded-lg p-3 ${darkMode ? "bg-[#111827] text-slate-400" : "bg-slate-50 text-slate-500"}`}>
                              No validation records found for this item.
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {itemValidations.slice(-4).map((record) => (
                                <div key={record.id} className={`text-xs p-2 rounded-lg ${darkMode ? "bg-[#111827] text-slate-300" : "bg-slate-50 text-slate-600"}`}>
                                  <span className={`font-semibold ${darkMode ? "text-emerald-300" : "text-emerald-700"}`}>{record.decision}</span>
                                  <span className="ml-2">{record.actor} as {record.roleExercised}</span>
                                  <span className={`ml-2 ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                                    {new Date(record.timestamp).toLocaleString()}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className={`text-xs font-bold uppercase tracking-wide mb-1 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Memory change history</p>
                          {itemChanges.length === 0 ? (
                            <p className={`text-xs rounded-lg p-3 ${darkMode ? "bg-[#111827] text-slate-400" : "bg-slate-50 text-slate-500"}`}>
                              No memory change records found for this item.
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {itemChanges.slice(-4).map((record) => (
                                <div key={record.id} className={`text-xs p-2 rounded-lg ${darkMode ? "bg-[#111827] text-slate-300" : "bg-slate-50 text-slate-600"}`}>
                                  <span className={`font-semibold ${darkMode ? "text-blue-400" : "text-[#2563EB]"}`}>{record.changeType}</span>
                                  <span className="ml-2">Candidate {record.candidateId.slice(-8)}</span>
                                  <span className={`ml-2 ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                                    before: {record.beforeState ? "snapshot" : "none"} / after: snapshot
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        {item.lessons && item.lessons.length > 0 && (
                          <div>
                            <p className={`text-xs font-bold uppercase tracking-wide mb-1 ${darkMode ? "text-amber-400" : "text-amber-700"}`}>Lessons learned</p>
                            <div className="space-y-2">
                              {item.lessons.map((lesson) => (
                                <div key={lesson.id} className={`rounded-lg p-3 ${darkMode ? "bg-amber-900/20 border border-amber-700/30" : "bg-amber-50 border border-amber-200"}`}>
                                  <div className="flex items-start justify-between gap-2">
                                    <p className={`text-xs font-semibold ${darkMode ? "text-amber-300" : "text-amber-800"}`}>{lesson.rootCause}</p>
                                    <span className={`flex-shrink-0 text-[10px] ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                                      {new Date(lesson.createdAt).toLocaleDateString()}
                                    </span>
                                  </div>
                                  <p className={`mt-1 text-xs ${darkMode ? "text-slate-300" : "text-slate-600"}`}>{lesson.solution}</p>
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {lesson.signals.map(s => (
                                      <span key={s} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${darkMode ? "bg-amber-900/40 text-amber-300" : "bg-amber-100 text-amber-700"}`}>
                                        {s}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                </div>
              );
            })}

            {/* Emerging patterns ready for promotion */}
            {emergingPatterns.filter(p => p.status === "suggested" && p.suggestedCanonicalProblem).length > 0 && (
              <div className={`rounded-2xl border p-5 ${darkMode ? "bg-amber-900/20 border-amber-700/30" : "bg-amber-50 border-amber-200"}`}>
                <p className={`text-xs font-bold uppercase tracking-wide ${darkMode ? "text-amber-400" : "text-amber-700"}`}>Emerging patterns</p>
                <p className={`mt-1 font-semibold ${darkMode ? "text-white" : "text-[#111827]"}`}>Patterns ready for promotion</p>
                <div className="mt-3 space-y-2">
                  {emergingPatterns.filter(p => p.status === "suggested" && p.suggestedCanonicalProblem).map(p => (
                    <div key={p.id} className="flex items-center justify-between gap-3">
                      <div>
                        <p className={`text-sm font-medium ${darkMode ? "text-slate-200" : "text-[#111827]"}`}>{p.title}</p>
                        <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{p.confidenceScore}% confidence · {p.timesSeen} tickets</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onPromote(p.id)}
                        className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 transition-colors"
                      >
                        Promote
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Memory network */}
          <div>
            <MemoryNetwork items={knowledgeItems} darkMode={darkMode} onExpand={() => setNetworkOpen(true)} />
          </div>
        </div>
      )}

      {networkOpen && knowledgeItems.length > 0 && (
        <MemoryNetworkOverlay
          items={knowledgeItems}
          darkMode={darkMode}
          orgId={orgId}
          onClose={() => setNetworkOpen(false)}
        />
      )}
    </div>
  );
}
