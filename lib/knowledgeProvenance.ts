import type { KnowledgeItem, Ticket, ValidationRecord } from "@/types";

/** Durable ticket identity used by knowledge/provenance records. */
export function ticketReferenceId(ticket: Pick<Ticket, "id" | "ticketId">): string {
  return ticket.ticketId || ticket.id;
}

/**
 * Apply validation metadata without changing the historical canonical origin.
 *
 * A candidate's source tickets are supporting evidence. They are never allowed
 * to replace an existing canonical source ticket. When the server has an
 * authoritative stored item, its top-level sourceTicketId wins over a stale
 * client provenance payload; this also repairs the legacy split-brain shape
 * where the top-level origin is correct but content.provenance drifted.
 */
export function withStableValidationProvenance(
  item: KnowledgeItem,
  candidateSourceTicketIds: string[],
  validation: Pick<ValidationRecord, "actor" | "timestamp" | "rationale"> & { scope?: string },
  storedItem?: KnowledgeItem | null
): KnowledgeItem {
  const existing = storedItem?.provenance ?? item.provenance;
  const historicalOrigin = storedItem?.sourceTicketId || storedItem?.provenance?.sourceTicketId
    || item.sourceTicketId || item.provenance?.sourceTicketId;
  const origin = historicalOrigin || candidateSourceTicketIds.find(Boolean) || "";
  const contributingTicketIds = [...new Set([
    ...(existing?.contributingTicketIds ?? []),
    ...(candidateSourceTicketIds ?? []),
    origin
  ].filter(Boolean))];

  return {
    ...item,
    sourceTicketId: origin,
    provenance: {
      sourceTicketId: origin,
      contributingTicketIds,
      createdBy: existing?.createdBy ?? "oip_prototype",
      createdAt: existing?.createdAt ?? item.createdAt,
      validatedBy: validation.actor,
      validatedAt: validation.timestamp,
      validationBasis: validation.rationale ?? "Prototype knowledge validation",
      validationScope: validation.scope ?? "Prototype knowledge validation"
    }
  };
}
