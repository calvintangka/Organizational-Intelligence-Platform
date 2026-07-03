import type { AIAnalysis, SuggestedResponse } from "@/types";

export const seedAnalyses: Record<string, AIAnalysis> = {
  "ticket-activation-001": {
    ticketId: "ticket-activation-001",
    summary: "Customer purchased the product but cannot activate it because the activation code is rejected.",
    coreProblem: "Activation code rejected after purchase",
    category: "Activation",
    urgency: "medium",
    suggestedTags: ["activation", "activation-code", "purchase", "license"]
  },
  "ticket-activation-002": {
    ticketId: "ticket-activation-002",
    summary: "Second customer has a similar activation failure using a code from the purchase email.",
    coreProblem: "Activation code from email is not accepted",
    category: "Activation",
    urgency: "medium",
    suggestedTags: ["activation", "activation-code", "purchase", "license"]
  },
  "ticket-login-001": {
    ticketId: "ticket-login-001",
    summary: "Customer cannot log in after resetting their password.",
    coreProblem: "Login failure after password reset",
    category: "Login",
    urgency: "medium",
    suggestedTags: ["login", "password", "reset"]
  },
  "ticket-account-001": {
    ticketId: "ticket-account-001",
    summary: "Customer account is locked after repeated failed login attempts.",
    coreProblem: "Account locked due to failed login attempts",
    category: "Account Access",
    urgency: "high",
    suggestedTags: ["account", "locked", "login", "password"]
  },
  "ticket-payment-001": {
    ticketId: "ticket-payment-001",
    summary: "Customer sees a failed payment while their bank app shows a charge.",
    coreProblem: "Payment failed with possible pending authorization",
    category: "Billing",
    urgency: "high",
    suggestedTags: ["payment", "failed-payment", "authorization", "billing"]
  },
  "ticket-refund-001": {
    ticketId: "ticket-refund-001",
    summary: "Customer requests a refund after purchasing the wrong plan.",
    coreProblem: "Refund request for incorrect plan purchase",
    category: "Refund",
    urgency: "medium",
    suggestedTags: ["refund", "payment", "plan"]
  },
  "ticket-subscription-001": {
    ticketId: "ticket-subscription-001",
    summary: "Customer wants to cancel subscription before the next renewal.",
    coreProblem: "Subscription cancellation before renewal",
    category: "Subscription",
    urgency: "medium",
    suggestedTags: ["subscription", "cancel", "renewal"]
  },
  "ticket-delivery-001": {
    ticketId: "ticket-delivery-001",
    summary: "Customer reports delivery delay and stale tracking information.",
    coreProblem: "Delivery delayed with no tracking update",
    category: "Delivery",
    urgency: "medium",
    suggestedTags: ["delivery", "tracking", "delay"]
  }
};

export const seedSuggestedResponses: Record<string, SuggestedResponse> = {
  "ticket-activation-001": {
    ticketId: "ticket-activation-001",
    draftResponse:
      "Hi Ayu, thanks for reaching out. Please confirm you are using the newest purchase email and copy the activation code without extra spaces. Also check that the code is being entered for the correct product version. If it still fails, please send your purchase email and a screenshot of the activation error so our team can verify the license.",
    basedOnKnowledgeIds: ["knowledge-activation-001"],
    confidenceNote:
      "High confidence because this matches existing activation-code troubleshooting knowledge. Human review is still required before saving or sending."
  },
  "ticket-activation-002": {
    ticketId: "ticket-activation-002",
    draftResponse:
      "Hi Bima, this looks similar to a known activation-code issue. Please use the latest purchase email, copy the code without spaces, and confirm the product version matches the license. If the issue continues, send the purchase email and activation-code screenshot so support can verify it.",
    basedOnKnowledgeIds: ["knowledge-activation-001"],
    confidenceNote:
      "High confidence because saved activation knowledge applies to this similar ticket."
  }
};
