import type { KnowledgeItem } from "@/types";
import { evaluateTrust } from "@/lib/trustEngine";
import { MaturityBadge, DecisionBadge, TrustMeter } from "./TrustBadges";

interface KnowledgeItemCardProps {
  item: KnowledgeItem;
  highlightSourceTicketId?: string;
}

export function KnowledgeItemCard({ item, highlightSourceTicketId }: KnowledgeItemCardProps) {
  const isNewlyCreated = highlightSourceTicketId === item.sourceTicketId;
  const isValidated = !!item.validation;
  const trust = evaluateTrust(item);

  return (
    <article className={`rounded-2xl border p-5 ${isNewlyCreated ? "border-blue-200 bg-blue-50/30" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-ink">{item.title}</h3>
            <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-bold text-signal">
              Canonical Problem
            </span>
            <MaturityBadge score={trust.score} />
            <DecisionBadge decision={trust.decision} />
            {isValidated ? (
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-memory">
                Human Validated
              </span>
            ) : null}
            {isNewlyCreated ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                Created this session
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{item.problem}</p>
          {isNewlyCreated && item.provenance ? (
            <p className="mt-1.5 text-xs text-memory">
              Provenance: created from ticket <code className="rounded bg-blue-100 px-1">{item.provenance.sourceTicketId}</code>,
              validated by {item.provenance.validatedBy} · {item.provenance.validationScope}
            </p>
          ) : null}
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-memory shrink-0">
          reused {item.timesReused}×
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1.4fr_1fr] sm:items-center">
        <TrustMeter score={trust.score} />
        <div className="grid grid-cols-3 gap-2 text-center">
          <MiniStat label="Examples" value={`${item.exampleTickets?.length ?? item.timesSeen ?? item.timesReused ?? 0}`} />
          <MiniStat label="Versions" value={`${item.knowledgeVersions?.length ?? 1}`} />
          <MiniStat label="Success" value={`${item.successRate ?? 100}%`} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <section className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Internal Guidance</p>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">
            {item.internalGuidance ?? item.problem}
          </p>
        </section>
        <section className="rounded-xl bg-emerald-50 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-trust">Customer Response Template</p>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">
            {item.customerResponseTemplate ?? item.approvedAnswer}
          </p>
        </section>
      </div>

      {item.resolutionWorkflow && item.resolutionWorkflow.length > 0 ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Resolution Workflow</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            {item.resolutionWorkflow.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {item.exampleTickets && item.exampleTickets.length > 0 ? (
        <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-memory">Example Tickets</p>
          <div className="mt-2 grid gap-2">
            {item.exampleTickets.slice(-4).map((example) => (
              <div key={example.ticketId} className="rounded-lg bg-white p-2 text-xs text-slate-600">
                <span className="font-semibold text-ink">{example.customerName}</span> · {example.originalIssue}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {isNewlyCreated && item.validation ? (
        <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
          <p className="text-xs font-semibold text-trust">Validation record</p>
          <p className="mt-0.5 text-xs text-slate-600">
            Validated by: {item.validation.validatedBy} · Basis: {item.validation.validationBasis}
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {isNewlyCreated ? (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
            Created during this demo
          </span>
        ) : null}
        {item.tags.map((tag) => (
          <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            #{tag}
          </span>
        ))}
      </div>
    </article>
  );
}

function MiniStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-1.5 ${accent ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-sm font-bold ${accent ? "text-trust" : "text-ink"}`}>{value}</p>
    </div>
  );
}
