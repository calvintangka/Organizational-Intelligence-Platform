import type { BusinessRelevance } from "@/types";

interface RelevanceGuardrailPanelProps {
  relevance: BusinessRelevance;
}

const statusCopy: Record<BusinessRelevance["status"], { badge: string; badgeClass: string; title: string; message: string; action: string }> = {
  relevant: {
    badge: "Business Relevant",
    badgeClass: "bg-emerald-50 text-trust",
    title: "Business relevance check passed",
    message:
      "This request appears related to the supported product or service, so the OIP engine can continue analysis.",
    action: "Continue normal OIP workflow"
  },
  out_of_scope: {
    badge: "Out of Scope",
    badgeClass: "bg-rose-50 text-rose-700",
    title: "Request dismissed before analysis",
    message:
      "Sorry, this request does not appear to be related to the supported product or service. This support workflow can only help with product, account, billing, subscription, delivery, or technical issues.",
    action: "Dismissed before analysis and memory capture"
  },
  uncertain: {
    badge: "Needs Clarification",
    badgeClass: "bg-amber-50 text-amber-700",
    title: "Clarification required before analysis",
    message:
      "I could not confirm whether this request is related to the supported product or service. Please clarify the product, account, billing, subscription, delivery, or technical issue you need help with.",
    action: "Clarification required before analysis"
  }
};

export function RelevanceGuardrailPanel({ relevance }: RelevanceGuardrailPanelProps) {
  const copy = statusCopy[relevance.status];

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${copy.badgeClass}`}>
          {copy.badge}
        </span>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-memory">
          Business relevance guardrail
        </span>
      </div>

      <h2 className="mt-3 text-2xl font-bold text-ink">{copy.title}</h2>
      <p className="mt-2 leading-7 text-slate-700">{copy.message}</p>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <InfoCard label="Relevance status" value={copy.badge} />
        <InfoCard label="Supported domain" value={relevance.supportedDomain} />
        <InfoCard label="Reason" value={relevance.reason} />
        <InfoCard label="Action taken" value={copy.action} />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <SignalList title="Business signals" signals={relevance.matchedBusinessSignals} empty="None detected" />
        <SignalList title="Out-of-scope signals" signals={relevance.detectedOutOfScopeSignals} empty="None detected" />
      </div>
    </section>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-6 text-slate-800">{value}</p>
    </div>
  );
}

function SignalList({ title, signals, empty }: { title: string; signals: string[]; empty: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {signals.length > 0 ? (
          signals.map((signal) => (
            <span key={signal} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {signal}
            </span>
          ))
        ) : (
          <span className="text-sm text-slate-500">{empty}</span>
        )}
      </div>
    </div>
  );
}
