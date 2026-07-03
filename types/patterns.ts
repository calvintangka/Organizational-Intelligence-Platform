export interface EmergingPatternExample {
  ticketId: string;
  customerName: string;
  originalIssue: string;
  createdAt: string;
}

export interface EmergingPattern {
  id: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  keywords: string[];
  exampleTickets: EmergingPatternExample[];
  timesSeen: number;
  confidenceScore: number;
  suggestedCanonicalProblem: boolean;
  status: "monitoring" | "suggested" | "promoted" | "dismissed";
  firstSeenAt: string;
  lastSeenAt: string;
}
