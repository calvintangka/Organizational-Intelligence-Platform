import type { KnowledgeItem } from "@/types";
import { KnowledgeItemCard } from "./KnowledgeItemCard";

interface KnowledgeBaseListProps {
  knowledgeItems: KnowledgeItem[];
  highlightSourceTicketId?: string;
}

export function KnowledgeBaseList({ knowledgeItems, highlightSourceTicketId }: KnowledgeBaseListProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <p className="text-sm font-semibold uppercase tracking-wide text-memory">Organizational memory</p>
      <h2 className="mt-2 text-2xl font-bold text-ink">Canonical problems become reusable memory</h2>
      <p className="mt-2 text-slate-600">
        Tickets are evidence. Canonical problems are the durable organizational knowledge.
      </p>
      <div className="mt-5 grid gap-4">
        {knowledgeItems.map((item) => (
          <KnowledgeItemCard key={item.id} item={item} highlightSourceTicketId={highlightSourceTicketId} />
        ))}
      </div>
    </section>
  );
}
