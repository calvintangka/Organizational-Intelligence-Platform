import type { OrganizationProfile } from "@/types";

export const DEVELOPER_DEMO_ORGANIZATION_ID = "profile-oip-developer-demo";
export const DEVELOPER_DEMO_DISPLAY_NAME = "OIP Developer Demo";
export const DEVELOPER_DEMO_FOUNDATION_AT = "2023-01-01T00:00:00.000Z";

export const PROTECTED_ORGANIZATION_IDS = [
  "profile-maesa-tech",
  "profile-fastdrop-logistics",
  "profile-pramana-legal",
  "test-oip-regression"
] as const;
export const developerDemoProfile: OrganizationProfile = {
  id: DEVELOPER_DEMO_ORGANIZATION_ID,
  name: DEVELOPER_DEMO_DISPLAY_NAME,
  industry: "B2B Software / Technology",
  description:
    "A fictional B2B software organization used only to demonstrate OIP's server-authoritative organizational memory workflows.",
  products: [
    "OIP Cloud Workspace",
    "OIP Mobile",
    "OIP Integration Hub",
    "OIP Analytics"
  ],
  services: [
    "workspace administration support",
    "identity and access support",
    "billing and invoicing support",
    "integration support",
    "reporting and export support"
  ],
  supportedDomains: [
    "authentication",
    "single sign-on",
    "billing",
    "invoicing",
    "api",
    "integrations",
    "permissions",
    "account access",
    "reporting",
    "data export",
    "mobile application",
    "notifications",
    "email delivery"
  ],
  businessVocabulary: [
    "workspace",
    "organization admin",
    "identity provider",
    "single sign-on",
    "sso",
    "saml",
    "multi-factor authentication",
    "mfa",
    "role",
    "permission",
    "seat",
    "subscription",
    "invoice",
    "billing cycle",
    "proration",
    "api key",
    "webhook",
    "integration",
    "sync",
    "report",
    "dashboard",
    "csv export",
    "mobile app",
    "push notification",
    "email notification"
  ],
  supportedIssueTypes: [
    "login problem",
    "single sign-on failure",
    "multi-factor authentication issue",
    "account lockout",
    "role assignment issue",
    "permission denied",
    "invoice question",
    "duplicate charge",
    "subscription change",
    "api authentication failure",
    "webhook delivery failure",
    "integration sync issue",
    "reporting discrepancy",
    "data export failure",
    "mobile sign-in issue",
    "mobile sync issue",
    "push notification issue",
    "email delivery issue"
  ],
  outOfScopeTopics: [
    "medical advice",
    "legal advice",
    "financial investment advice",
    "politics",
    "religion",
    "homework"
  ],
  customerTone: "professional",
  supportBoundaries: [
    "Never request or store passwords, authentication secrets, or full payment-card details.",
    "Require human review for account ownership disputes, security incidents, and irreversible billing actions.",
    "Use only fictional demo customer and company identities in this organization."
  ],
  autoResolutionThreshold: 80,
  escalationRules: [
    "Escalate suspected account compromise and unresolved SSO certificate failures.",
    "Escalate disputed invoices or permission changes that require administrator approval.",
    "Escalate repeated API, export, mobile, or notification failures after documented checks are exhausted."
  ],
  accentColor: "#7C3AED",
  logoInitials: "OIP",
  createdAt: DEVELOPER_DEMO_FOUNDATION_AT,
  updatedAt: DEVELOPER_DEMO_FOUNDATION_AT,
  profileRevision: 0
};

export type DeveloperDemoNarrativeRole =
  | "support_agent"
  | "senior_support_agent"
  | "team_lead"
  | "knowledge_manager"
  | "administrator";

export interface DeveloperDemoActor {
  id: string;
  name: string;
  email: string;
  narrativeRole: DeveloperDemoNarrativeRole;
  membershipRole: "member";
  createdAt: string;
}

export const developerDemoActors: readonly DeveloperDemoActor[] = [
  {
    id: "user-oip-demo-01",
    name: "Mira Solis",
    email: "mira.solis@oip-demo.invalid",
    narrativeRole: "support_agent",
    membershipRole: "member",
    createdAt: "2023-01-03T01:00:00.000Z"
  },
  {
    id: "user-oip-demo-02",
    name: "Taro Vale",
    email: "taro.vale@oip-demo.invalid",
    narrativeRole: "support_agent",
    membershipRole: "member",
    createdAt: "2023-01-05T01:00:00.000Z"
  },
  {
    id: "user-oip-demo-03",
    name: "Nila Hart",
    email: "nila.hart@oip-demo.invalid",
    narrativeRole: "support_agent",
    membershipRole: "member",
    createdAt: "2023-01-09T01:00:00.000Z"
  },
  {
    id: "user-oip-demo-04",
    name: "Rafi Quill",
    email: "rafi.quill@oip-demo.invalid",
    narrativeRole: "support_agent",
    membershipRole: "member",
    createdAt: "2023-01-14T01:00:00.000Z"
  },
  {
    id: "user-oip-demo-05",
    name: "Sera Kade",
    email: "sera.kade@oip-demo.invalid",
    narrativeRole: "senior_support_agent",
    membershipRole: "member",
    createdAt: "2023-01-02T01:00:00.000Z"
  },
  {
    id: "user-oip-demo-06",
    name: "Ivo Lumen",
    email: "ivo.lumen@oip-demo.invalid",
    narrativeRole: "team_lead",
    membershipRole: "member",
    createdAt: "2023-01-01T01:00:00.000Z"
  },
  {
    id: "user-oip-demo-07",
    name: "Anya Voss",
    email: "anya.voss@oip-demo.invalid",
    narrativeRole: "knowledge_manager",
    membershipRole: "member",
    createdAt: "2023-01-02T01:00:00.000Z"
  },
  {
    id: "user-oip-demo-08",
    name: "Dax Rowan",
    email: "dax.rowan@oip-demo.invalid",
    narrativeRole: "administrator",
    membershipRole: "member",
    createdAt: "2023-01-01T01:00:00.000Z"
  }
] as const;
