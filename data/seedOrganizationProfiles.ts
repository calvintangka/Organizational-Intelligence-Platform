import type { OrganizationProfile } from "@/types";

const createdAt = "2026-06-29T00:00:00.000Z";

export const seedOrganizationProfiles: OrganizationProfile[] = [
  {
    id: "profile-maesa-tech",
    name: "Maesa Tech",
    industry: "Software / SaaS",
    description:
      "A software company offering an AI productivity platform, customer support dashboard, and account portal.",
    products: ["AI productivity platform", "customer support dashboard", "account portal"],
    services: ["software support", "account support", "billing support", "technical support"],
    supportedDomains: ["activation", "login", "billing", "subscription", "technical support", "product access"],
    businessVocabulary: [
      "activation code",
      "license key",
      "dashboard",
      "account portal",
      "password reset",
      "invoice",
      "subscription",
      "purchase email",
      "product version"
    ],
    supportedIssueTypes: [
      "activation failure",
      "login problem",
      "two-factor authentication",
      "2fa",
      "mfa",
      "billing question",
      "refund request",
      "subscription change",
      "account access"
    ],
    outOfScopeTopics: ["relationship advice", "medical advice", "legal advice", "politics", "religion", "homework"],
    customerTone: "professional",
    supportBoundaries: [
      "Do not provide medical, legal, relationship, political, religious, or homework advice.",
      "Ask for account or purchase details before troubleshooting protected account actions."
    ],
    autoResolutionThreshold: 80,
    escalationRules: ["Escalate activation failures when a valid license still fails.", "Escalate account unlocks after identity verification."],
    accentColor: "#2563EB",
    createdAt,
    updatedAt: createdAt
  },
  {
    id: "profile-fastdrop-logistics",
    name: "FastDrop Logistics",
    industry: "Delivery / Logistics",
    description: "A delivery service handling package tracking, delivery exceptions, courier issues, and refunds.",
    products: ["package delivery", "courier network", "tracking portal"],
    services: ["package tracking", "delivery support", "courier coordination", "refund support", "address correction"],
    supportedDomains: ["delivery delay", "package tracking", "lost package", "address change", "refund", "courier issue"],
    businessVocabulary: [
      "tracking number",
      "courier",
      "package",
      "parcel",
      "shipment",
      "delivery window",
      "address",
      "recipient",
      "refund"
    ],
    supportedIssueTypes: [
      "delivery delay",
      "tracking not updated",
      "lost package",
      "address change",
      "refund request",
      "courier complaint"
    ],
    outOfScopeTopics: ["software activation", "license key", "medical advice", "legal advice", "politics", "religion", "homework"],
    customerTone: "friendly",
    supportBoundaries: [
      "Do not troubleshoot software activation, login, or product-license issues.",
      "Escalate suspected theft, damaged goods, or high-value lost packages to a human."
    ],
    autoResolutionThreshold: 75,
    escalationRules: ["Escalate lost packages after missing tracking updates.", "Escalate address changes after dispatch."],
    accentColor: "#F59E0B",
    createdAt,
    updatedAt: createdAt
  },
  {
    id: "profile-pramana-legal",
    name: "Pramana Legal",
    industry: "Legal Services",
    description:
      "A law firm support desk for consultations, document status, invoices, client portal access, and appointment scheduling.",
    products: ["client portal", "consultation booking", "legal document workflow"],
    services: ["consultation booking", "document status updates", "invoice support", "client portal support", "appointment rescheduling"],
    supportedDomains: ["consultation booking", "document status", "invoice", "client portal access", "appointment rescheduling"],
    businessVocabulary: [
      "consultation",
      "appointment",
      "client portal",
      "document status",
      "case document",
      "invoice",
      "reschedule",
      "lawyer",
      "attorney"
    ],
    supportedIssueTypes: [
      "client portal access issue",
      "consultation booking issue",
      "document status request",
      "invoice question",
      "appointment rescheduling"
    ],
    outOfScopeTopics: ["legal advice", "lawsuit strategy", "should I sue", "medical advice", "politics", "religion", "homework"],
    customerTone: "formal",
    supportBoundaries: [
      "Do not give legal advice automatically.",
      "Route legal substance, lawsuit strategy, or case assessment to human review.",
      "Support staff may help with scheduling, invoices, document status, and client portal access."
    ],
    autoResolutionThreshold: 90,
    escalationRules: [
      "Legal advice requests must always go to human review.",
      "Case merits, lawsuit strategy, and employer disputes must go to human review.",
      "Client portal and invoice issues may auto-resolve if trust is high enough."
    ],
    accentColor: "#0F766E",
    createdAt,
    updatedAt: createdAt
  }
];

export const defaultOrganizationProfile = seedOrganizationProfiles[0];
