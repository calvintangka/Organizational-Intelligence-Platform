import { primaryDemoTicketId, secondDemoTicketId, seedTickets } from "@/data/seedTickets";
import { seedKnowledge } from "@/data/seedKnowledge";
import { seedAnalyses, seedSuggestedResponses } from "@/data/seedResponses";
import { staticDemoMetrics } from "@/lib/metrics";
import { findSeedKnowledgeMatches } from "@/lib/matching";

export function getStaticDemoData(selectedTicketId = primaryDemoTicketId) {
  const selectedTicket = seedTickets.find((ticket) => ticket.id === selectedTicketId) ?? seedTickets[0];
  const secondTicket = seedTickets.find((ticket) => ticket.id === secondDemoTicketId) ?? seedTickets[1];
  const analysis = seedAnalyses[selectedTicket.id] ?? seedAnalyses[primaryDemoTicketId];
  const suggestedResponse =
    seedSuggestedResponses[selectedTicket.id] ?? seedSuggestedResponses[primaryDemoTicketId];
  const matches = findSeedKnowledgeMatches(analysis, seedKnowledge);

  return {
    tickets: seedTickets,
    selectedTicket,
    secondTicket,
    analysis,
    suggestedResponse,
    matches,
    knowledgeItems: seedKnowledge,
    metrics: staticDemoMetrics
  };
}
