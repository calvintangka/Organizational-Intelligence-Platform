export type CustomerTone = "professional" | "friendly" | "formal" | "empathetic";

export interface OrganizationProfile {
  id: string;
  name: string;
  industry: string;
  description: string;
  products: string[];
  services: string[];
  supportedDomains: string[];
  businessVocabulary: string[];
  supportedIssueTypes: string[];
  outOfScopeTopics: string[];
  customerTone: CustomerTone;
  supportBoundaries: string[];
  autoResolutionThreshold: number;
  escalationRules: string[];
  /** Brand accent color as a hex string (e.g. "#2563EB"). Drives avatars and active states. */
  accentColor?: string;
  /** Optional override for the avatar initials. When absent, initials are derived from `name`. */
  logoInitials?: string;
  createdAt: string;
  updatedAt: string;
}
