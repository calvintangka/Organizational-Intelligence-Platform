import type { TicketRecord, TicketRecordStatus } from "@/types";

/** Operationally active TicketRecord states shown by the Home Open tickets card. */
export const OPEN_TICKET_STATUSES = ["open", "in_review", "waiting_for_customer"] as const;

export function isOpenTicketStatus(status: TicketRecordStatus): boolean {
  return (OPEN_TICKET_STATUSES as readonly string[]).includes(status);
}

export function countOpenTicketRecords(records: Pick<TicketRecord, "status">[]): number {
  return records.filter((record) => isOpenTicketStatus(record.status)).length;
}
