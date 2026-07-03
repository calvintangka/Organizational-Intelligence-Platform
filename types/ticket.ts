export type TicketStatus = "new" | "analyzed" | "drafted" | "reviewed" | "approved" | "resolved";

export interface Ticket {
  id: string;
  customerName: string;
  subject: string;
  description: string;
  category: string;
  status: TicketStatus;
  createdAt: string;
}
