import type { Ticket } from "@/types";

interface TicketCardProps {
  ticket: Ticket;
  label?: string;
  helper?: string;
  badge?: string;
}

export function TicketCard({ ticket, label = "Support ticket", helper, badge }: TicketCardProps) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-memory">{label}</p>
          <h3 className="mt-2 text-xl font-bold text-ink">{ticket.subject}</h3>
          {helper ? <p className="mt-2 text-sm font-medium text-slate-600">{helper}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {badge ? (
            <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-memory">{badge}</span>
          ) : null}
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
            {ticket.category}
          </span>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2">
        <div>
          <dt className="font-semibold text-slate-500">Customer</dt>
          <dd className="mt-1 text-slate-900">{ticket.customerName}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-500">Status</dt>
          <dd className="mt-1 capitalize text-slate-900">{ticket.status}</dd>
        </div>
      </dl>

      <p className="mt-5 rounded-2xl bg-slate-50 p-4 leading-7 text-slate-700">{ticket.description}</p>
    </article>
  );
}
