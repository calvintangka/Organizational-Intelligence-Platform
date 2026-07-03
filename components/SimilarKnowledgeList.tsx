import type { KnowledgeMatch } from "@/types";
import { evaluateTrust } from "@/lib/trustEngine";
import { DecisionBadge, MaturityBadge } from "./TrustBadges";

function formatLastUsed(value?: string | null): string {
  if (!value) return "never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "never";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface SimilarKnowledgeListProps {
  matches: KnowledgeMatch[];
  title?: string;
  subtitle?: string;
  highlightSourceTicketId?: string;
  highlightBadge?: string;
  showReuseExplanation?: boolean;
  autoResolutionThreshold?: number;
}

export function SimilarKnowledgeList({
  matches,
  title = "The system checks organizational memory first",
  subtitle,
  highlightSourceTicketId,
  highlightBadge = "Created from first approved ticket",
  showReuseExplanation = false,
  autoResolutionThreshold = 80
}: SimilarKnowledgeListProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-trust">
          Canonical problem retrieval
        </span>
        {matches.length > 0 ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
            {matches.length} candidate{matches.length !== 1 ? "s" : ""}
          </span>
        ) : null}
      </div>
      <h2 className="mt-2 text-2xl font-bold text-ink">{title}</h2>
      {subtitle ? <p className="mt-2 text-slate-600">{subtitle}</p> : null}

      {showReuseExplanation ? (
        <p className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-medium leading-6 text-memory">
          The second ticket reuses knowledge created from the first ticket. This proves the organization learned from the
          previous support work.
        </p>
      ) : null}

      {matches.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-slate-600">
          <p className="font-medium">No reusable knowledge found yet.</p>
          <p className="mt-1 text-sm">This ticket can become new validated knowledge after human review.</p>
        </div>
      ) : (
        <div className="mt-5 grid gap-4">
          {matches.map(({ item, matchScore, matchReason, matchedTags, matchedKeywords, matchedCategory }, index) => {
            const isHighlighted = highlightSourceTicketId && item.sourceTicketId === highlightSourceTicketId;
            const trust = evaluateTrust(item, autoResolutionThreshold);
            return (
              <article
                key={`${item.id}-${index}`}
                className={`rounded-2xl border p-5 ${
                  isHighlighted ? "border-blue-200 bg-blue-50/40" : "border-slate-200"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-ink">{item.title}</h3>
                      <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-bold text-signal">
                        Canonical Problem
                      </span>
                      <MaturityBadge score={trust.score} threshold={autoResolutionThreshold} />
                      <DecisionBadge decision={trust.decision} />
                      {isHighlighted ? (
                        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-memory">
                          {highlightBadge}
                        </span>
                      ) : null}
                      {item.validation ? (
                        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-memory">
                          Human Validated
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.problemSummary ?? item.problem}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${
                      matchScore >= 70
                        ? "bg-emerald-50 text-trust"
                        : matchScore >= 40
                        ? "bg-amber-50 text-amber-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {matchScore}% similarity
                  </span>
                </div>

                {/* Learning stats — the heart of Organizational Intelligence */}
                <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <Stat label="Similarity" value={`${matchScore}`} />
                  <Stat label="Trust" value={`${trust.score}`} accent={trust.score >= autoResolutionThreshold} />
                  <Stat label="Examples" value={`${item.exampleTickets?.length ?? item.timesSeen ?? 0}`} />
                  <Stat label="Versions" value={`${item.knowledgeVersions?.length ?? 1}`} />
                  <Stat label="Reused" value={`${item.timesReused ?? 0}×`} />
                  <Stat label="Success" value={`${item.successRate ?? 100}%`} />
                  <Stat label="Last used" value={formatLastUsed(item.lastUsedAt)} />
                  <Stat label="Auto" value={trust.autoEligible ? "YES" : "no"} accent={trust.autoEligible} />
                </dl>

                <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">{matchReason}</p>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Internal Guidance</p>
                    <p className="mt-1 line-clamp-4 whitespace-pre-line text-xs leading-5 text-slate-600">
                      {item.internalGuidance ?? item.problem}
                    </p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-trust">Customer Response</p>
                    <p className="mt-1 line-clamp-4 whitespace-pre-line text-xs leading-5 text-slate-600">
                      {item.customerResponseTemplate ?? item.approvedAnswer}
                    </p>
                  </div>
                </div>

                {(matchedTags && matchedTags.length > 0) || (matchedKeywords && matchedKeywords.length > 0) ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {matchedCategory ? (
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-memory">
                        category: {matchedCategory}
                      </span>
                    ) : null}
                    {matchedTags?.map((tag) => (
                      <span key={`tag-${tag}`} className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-trust">
                        tag: {tag}
                      </span>
                    ))}
                    {matchedKeywords?.map((kw, index) => (
                      <span key={`kw-${kw}-${index}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                        kw: {kw}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {matches.length > 0 ? (
        <p className="mt-4 text-xs text-slate-500">
          Similarity is recall; Trust is earned through outcomes. Knowledge at the active organization threshold can auto-resolve without human review.
        </p>
      ) : null}
    </section>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-2 text-center ${accent ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-sm font-bold ${accent ? "text-trust" : "text-ink"}`}>{value}</dd>
    </div>
  );
}
