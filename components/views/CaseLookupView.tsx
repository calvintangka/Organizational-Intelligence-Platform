"use client";

import { useState } from "react";
import type { TicketRecord, KnowledgeItem } from "@/types";
import type { ActiveView } from "@/components/maesa/Sidebar";
import {
  searchTicketRecords,
  filterTicketRecords,
  type CaseFilterChip,
} from "@/lib/ticketRecords";

interface CaseLookupViewProps {
  ticketRecords: TicketRecord[];
  knowledgeItems: KnowledgeItem[];
  darkMode: boolean;
  onNavigateToKnowledge: (knowledgeId: string) => void;
  onNavigate: (view: ActiveView) => void;
  onResumeTicket?: (record: TicketRecord) => void;
}

const FILTER_CHIPS: { id: CaseFilterChip; label: string }[] = [
  { id: "all", label: "All" },
  { id: "heavily_edited", label: "Heavily edited" },
  { id: "cold_start", label: "Cold start" },
  { id: "uncategorized", label: "Uncategorized" },
  { id: "rejected", label: "Rejected" },
  { id: "discarded", label: "Discarded" },
];

const PAGE_SIZE = 20;

function statusBadge(status: TicketRecord["status"], darkMode: boolean): string {
  switch (status) {
    case "resolved":
      return darkMode
        ? "bg-emerald-900/40 text-emerald-300"
        : "bg-emerald-50 text-emerald-700";
    case "in_review":
      return darkMode
        ? "bg-amber-900/40 text-amber-300"
        : "bg-amber-50 text-amber-700";
    case "rejected":
      return darkMode
        ? "bg-red-900/40 text-red-300"
        : "bg-red-50 text-red-700";
    case "discarded":
      return darkMode
        ? "bg-slate-700/60 text-slate-400"
        : "bg-slate-200 text-slate-500";
    default:
      return darkMode
        ? "bg-slate-700 text-slate-300"
        : "bg-slate-100 text-slate-600";
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function CaseLookupView({
  ticketRecords,
  knowledgeItems,
  darkMode,
  onNavigateToKnowledge,
  onResumeTicket,
}: CaseLookupViewProps) {
  const [query, setQuery] = useState("");
  const [activeChip, setActiveChip] = useState<CaseFilterChip>("all");
  const [selectedCase, setSelectedCase] = useState<TicketRecord | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const card = darkMode
    ? "rounded-2xl border border-[#2d3f52] bg-[#1a2b3c]"
    : "rounded-2xl border border-slate-200 bg-white";
  const headingCls = darkMode ? "text-white" : "text-[#111827]";
  const mutedCls = darkMode ? "text-slate-400" : "text-[#667085]";
  const subCard = darkMode
    ? "rounded-xl border border-[#2d3f52] bg-[#111827] p-3"
    : "rounded-xl border border-slate-100 bg-slate-50 p-3";

  const filtered = filterTicketRecords(
    searchTicketRecords(ticketRecords, query),
    activeChip
  );
  const visible = filtered.slice(0, visibleCount);

  if (selectedCase) {
    return (
      <CaseDetailView
        record={selectedCase}
        knowledgeItems={knowledgeItems}
        darkMode={darkMode}
        onBack={() => setSelectedCase(null)}
        onNavigateToKnowledge={onNavigateToKnowledge}
        card={card}
        headingCls={headingCls}
        mutedCls={mutedCls}
        subCard={subCard}
        onResume={onResumeTicket ? () => onResumeTicket(selectedCase) : undefined}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <h1 className={`text-3xl font-bold ${headingCls}`}>Cases</h1>
      <p className={`mt-1 text-sm ${mutedCls}`}>
        Search and review ticket records across the pipeline journey.
      </p>

      {/* Search */}
      <div className="mt-5">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
          placeholder="Search by ticket ID, text, or category..."
          className={`w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-blue-200 ${
            darkMode
              ? "border-[#2d3f52] bg-[#111827] text-slate-200 placeholder:text-slate-600"
              : "border-slate-200 bg-white text-[#111827]"
          }`}
        />
      </div>

      {/* Filter chips */}
      <div className="mt-3 flex flex-wrap gap-2">
        {FILTER_CHIPS.map((chip) => {
          const active = activeChip === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => {
                setActiveChip(chip.id);
                setVisibleCount(PAGE_SIZE);
              }}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                active
                  ? darkMode
                    ? "bg-blue-600 text-white"
                    : "bg-[#2563EB] text-white"
                  : darkMode
                  ? "bg-[#1e3048] text-slate-300 hover:bg-[#2d3f52]"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Results count */}
      <p className={`mt-3 text-xs ${mutedCls}`}>
        {filtered.length} case{filtered.length !== 1 ? "s" : ""} found
      </p>

      {/* Case list */}
      <div className="mt-3 space-y-2">
        {visible.length === 0 && (
          <div className={`${card} p-6 text-center`}>
            <p className={mutedCls}>No cases match your search.</p>
          </div>
        )}
        {visible.map((record) => (
          <button
            key={record.ticketId}
            type="button"
            onClick={() => setSelectedCase(record)}
            className={`${card} w-full p-4 text-left transition hover:shadow-md`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono text-xs font-bold ${
                      darkMode ? "text-blue-300" : "text-[#2563EB]"
                    }`}
                  >
                    {record.ticketId}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge(
                      record.status,
                      darkMode
                    )}`}
                  >
                    {record.status.replace("_", " ")}
                  </span>
                  {record.resolution.humanEdited && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        darkMode
                          ? "bg-purple-900/40 text-purple-300"
                          : "bg-purple-50 text-purple-700"
                      }`}
                    >
                      edited
                    </span>
                  )}
                </div>
                <p
                  className={`mt-1 truncate text-sm ${
                    darkMode ? "text-slate-300" : "text-[#111827]"
                  }`}
                >
                  {record.subject ?? record.rawMessage.slice(0, 100)}
                </p>
                <div className={`mt-1 flex items-center gap-3 text-xs ${mutedCls}`}>
                  <span>{formatDate(record.createdAt)}</span>
                  {record.classification && (
                    <span>{record.classification.category}</span>
                  )}
                  {record.draftSource && (
                    <span>{record.draftSource.replace("_", " ")}</span>
                  )}
                </div>
              </div>
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className={`mt-1 flex-shrink-0 ${mutedCls}`}
              >
                <path
                  d="M6 4l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </button>
        ))}
      </div>

      {/* Load more */}
      {visibleCount < filtered.length && (
        <button
          type="button"
          onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
          className={`mt-4 w-full rounded-xl py-2.5 text-sm font-semibold transition-colors ${
            darkMode
              ? "bg-[#1e3048] text-slate-300 hover:bg-[#2d3f52]"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Load more ({filtered.length - visibleCount} remaining)
        </button>
      )}
    </div>
  );
}

/* ──────────────────────────── Case Detail View ──────────────────────────── */

interface CaseDetailViewProps {
  record: TicketRecord;
  knowledgeItems: KnowledgeItem[];
  darkMode: boolean;
  onBack: () => void;
  onNavigateToKnowledge: (knowledgeId: string) => void;
  card: string;
  headingCls: string;
  mutedCls: string;
  subCard: string;
  onResume?: () => void;
}

function CaseDetailView({
  record,
  knowledgeItems,
  darkMode,
  onBack,
  onNavigateToKnowledge,
  card,
  headingCls,
  mutedCls,
  subCard,
  onResume,
}: CaseDetailViewProps) {
  const sectionHeading = `text-xs font-bold uppercase tracking-wide ${
    darkMode ? "text-slate-400" : "text-slate-500"
  }`;

  const linkedKnowledge = record.reflection.knowledgeChanged
    ? knowledgeItems.find((k) => k.id === record.reflection.knowledgeChanged)
    : null;

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className={`mb-4 flex items-center gap-1.5 text-sm font-semibold transition-colors ${
          darkMode
            ? "text-slate-400 hover:text-white"
            : "text-slate-500 hover:text-[#111827]"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M10 4l-4 4 4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back to cases
      </button>

      {/* Header */}
      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`font-mono text-lg font-bold ${
              darkMode ? "text-blue-300" : "text-[#2563EB]"
            }`}
          >
            {record.ticketId}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadge(
              record.status,
              darkMode
            )}`}
          >
            {record.status.replace("_", " ")}
          </span>
          {/* F-1: Resume in workspace button. Only available for in_review
              tickets; resolved / rejected / discarded / open records do not
              expose it because there is nothing half-done to resume. */}
          {record.status === "in_review" && onResume && (
            <button
              type="button"
              onClick={onResume}
              data-testid="case-resume-button"
              className={`ml-auto rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors ${
                darkMode
                  ? "bg-blue-600 hover:bg-blue-500"
                  : "bg-[#2563EB] hover:bg-blue-700"
              }`}
            >
              Resume in workspace
            </button>
          )}
        </div>
        <p className={`mt-1 text-xs ${mutedCls}`}>
          Created {formatDate(record.createdAt)}
        </p>
      </div>

      <div className="mt-4 space-y-4">
        {/* Original message */}
        <div className={`${card} p-5`}>
          <h3 className={sectionHeading}>Original message</h3>
          {record.subject && (
            <p className={`mt-2 text-sm font-semibold ${headingCls}`}>
              {record.subject}
            </p>
          )}
          <p
            className={`mt-1 text-sm leading-6 ${
              darkMode ? "text-slate-300" : "text-[#111827]"
            }`}
          >
            {record.rawMessage}
          </p>
        </div>

        {/* Classification */}
        {record.classification && (
          <div className={`${card} p-5`}>
            <h3 className={sectionHeading}>Classification</h3>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className={subCard}>
                <p className={`text-[10px] ${mutedCls}`}>Category</p>
                <p className={`text-sm font-semibold ${headingCls}`}>
                  {record.classification.category}
                </p>
              </div>
              <div className={subCard}>
                <p className={`text-[10px] ${mutedCls}`}>Intent</p>
                <p className={`text-sm font-semibold ${headingCls}`}>
                  {record.classification.intent}
                </p>
              </div>
              <div className={subCard}>
                <p className={`text-[10px] ${mutedCls}`}>Canonical problem</p>
                <p className={`text-sm font-semibold ${headingCls}`}>
                  {record.classification.canonicalProblem ?? "None"}
                </p>
              </div>
              <div className={subCard}>
                <p className={`text-[10px] ${mutedCls}`}>Classified by</p>
                <p className={`text-sm font-semibold ${headingCls}`}>
                  {record.classification.classifiedBy === "deterministic"
                    ? "Deterministic engine"
                    : "LLM fallback"}
                </p>
              </div>
              <div className={subCard}>
                <p className={`text-[10px] ${mutedCls}`}>Confidence</p>
                <p className={`text-sm font-semibold ${headingCls}`}>
                  {record.classification.confidence}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Memory match */}
        {record.memoryMatch && (
          <div className={`${card} p-5`}>
            <h3 className={sectionHeading}>Memory</h3>
            <div className="mt-2">
              {record.memoryMatch.matchType === "none" ? (
                <p
                  className={`text-sm ${
                    darkMode ? "text-amber-300" : "text-amber-700"
                  }`}
                >
                  Cold start -- no organizational memory matched
                </p>
              ) : (
                <div className="space-y-2">
                  <div className={subCard}>
                    <p className={`text-[10px] ${mutedCls}`}>Match type</p>
                    <p className={`text-sm font-semibold ${headingCls}`}>
                      {record.memoryMatch.matchType === "lesson"
                        ? "Lesson match"
                        : "Template match"}
                    </p>
                  </div>
                  {record.memoryMatch.knowledgeId && (
                    <div className={subCard}>
                      <p className={`text-[10px] ${mutedCls}`}>
                        Knowledge item
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          onNavigateToKnowledge(
                            record.memoryMatch!.knowledgeId!
                          )
                        }
                        className={`text-sm font-semibold ${
                          darkMode
                            ? "text-blue-300 hover:text-blue-200"
                            : "text-[#2563EB] hover:text-blue-700"
                        }`}
                      >
                        {knowledgeItems.find(
                          (k) => k.id === record.memoryMatch!.knowledgeId
                        )?.title ?? record.memoryMatch.knowledgeId}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Resolution */}
        <div className={`${card} p-5`}>
          <h3 className={sectionHeading}>Resolution</h3>
          {record.resolution.finalResponse ? (
            <div className="mt-2 space-y-2">
              <div className={subCard}>
                <p className={`text-[10px] ${mutedCls}`}>Final response</p>
                <p
                  className={`mt-1 text-sm leading-6 ${
                    darkMode ? "text-slate-300" : "text-[#111827]"
                  }`}
                >
                  {record.resolution.finalResponse}
                </p>
              </div>
              <div className="flex gap-3">
                <div className={`flex-1 ${subCard}`}>
                  <p className={`text-[10px] ${mutedCls}`}>Human edited</p>
                  <p className={`text-sm font-semibold ${headingCls}`}>
                    {record.resolution.humanEdited ? "Yes" : "No"}
                  </p>
                </div>
                {record.resolution.editDistanceNote && (
                  <div className={`flex-1 ${subCard}`}>
                    <p className={`text-[10px] ${mutedCls}`}>Edit distance</p>
                    <p className={`text-sm ${headingCls}`}>
                      {record.resolution.editDistanceNote}
                    </p>
                  </div>
                )}
                {record.resolution.resolvedAt && (
                  <div className={`flex-1 ${subCard}`}>
                    <p className={`text-[10px] ${mutedCls}`}>Resolved at</p>
                    <p className={`text-sm ${headingCls}`}>
                      {formatDate(record.resolution.resolvedAt)}
                    </p>
                  </div>
                )}
              </div>
              {record.draftSource && (
                <div className={subCard}>
                  <p className={`text-[10px] ${mutedCls}`}>Draft source</p>
                  <p className={`text-sm font-semibold ${headingCls}`}>
                    {record.draftSource === "ai_advisory"
                      ? "AI advisory"
                      : record.draftSource === "deterministic"
                      ? "Deterministic template"
                      : "No template (cold start)"}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className={`mt-2 text-sm ${mutedCls}`}>
              Not yet resolved
            </p>
          )}
        </div>

        {/* Learning / Reflection */}
        <div className={`${card} p-5`}>
          <h3 className={sectionHeading}>Learning</h3>
          {record.reflection.decision ? (
            <div className="mt-2 space-y-2">
              <div className={subCard}>
                <p className={`text-[10px] ${mutedCls}`}>Reflection decision</p>
                <p className={`text-sm font-semibold ${headingCls}`}>
                  {record.reflection.decision.replace(/_/g, " ")}
                </p>
              </div>
              {record.reflection.lessonCreatedId && (
                <div className={subCard}>
                  <p className={`text-[10px] ${mutedCls}`}>Lesson created</p>
                  <p className={`text-sm ${headingCls}`}>
                    {record.reflection.lessonCreatedId}
                  </p>
                </div>
              )}
              {record.reflection.lessonReinforcedId && (
                <div className={subCard}>
                  <p className={`text-[10px] ${mutedCls}`}>
                    Lesson reinforced
                  </p>
                  <p className={`text-sm ${headingCls}`}>
                    {record.reflection.lessonReinforcedId}
                  </p>
                </div>
              )}
              {linkedKnowledge && (
                <div className={subCard}>
                  <p className={`text-[10px] ${mutedCls}`}>
                    Knowledge affected
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      onNavigateToKnowledge(linkedKnowledge.id)
                    }
                    className={`text-sm font-semibold ${
                      darkMode
                        ? "text-blue-300 hover:text-blue-200"
                        : "text-[#2563EB] hover:text-blue-700"
                    }`}
                  >
                    {linkedKnowledge.title}
                  </button>
                </div>
              )}
              {record.validationRecordIds.length > 0 && (
                <div className={subCard}>
                  <p className={`text-[10px] ${mutedCls}`}>
                    Validation records
                  </p>
                  <p className={`text-xs font-mono ${headingCls}`}>
                    {record.validationRecordIds.join(", ")}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className={`mt-2 text-sm ${mutedCls}`}>
              No reflection recorded yet
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
