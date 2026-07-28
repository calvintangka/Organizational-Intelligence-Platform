export type CustomerTone = "professional" | "friendly" | "formal" | "empathetic";

/**
 * TODO-058 Phase E — a business concept and the surface forms that mean it in
 * any supported language.
 *
 * Vocabulary is modelled as CONCEPTS, not words: one concept row carries every
 * language's wording, so an organization never duplicates a concept per
 * language and Organizational Memory never forks by language.
 */
export interface BusinessConcept {
  /** Language-neutral concept id, e.g. "invoice". Stable; used for matching. */
  id: string;
  /** Human-readable label in the organization's documentation language. */
  label: string;
  /** Surface forms across languages, e.g. ["faktur", "factura", "請求書"]. */
  aliases: string[];
}

/** TODO-058 Phase F — which language an outgoing draft is written in. */
export type ResponseLanguageMode =
  /** Reply in the language the customer wrote in (falls back when unsure). */
  | "customer_language"
  /** Always reply in the organization's own language. */
  | "organization_language"
  /** Always reply in one fixed language regardless of input. */
  | "fixed_language";

export interface LanguagePolicy {
  /** Organization language; also the fallback when detection is unsure. */
  organizationLanguage: string;
  responseMode: ResponseLanguageMode;
  /** Required when responseMode is "fixed_language". */
  fixedResponseLanguage?: string;
  /** Language for internal reasoning and documentation (lessons, guidance). */
  internalLanguage: string;
  /**
   * 0..1. Detections below this fall back rather than replying in a language
   * guessed from weak evidence.
   */
  minimumDetectionConfidence: number;
}

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
  /**
   * TODO-058: concept-level vocabulary with multilingual aliases. Optional and
   * additive — an organization that never sets it keeps the existing
   * `businessVocabulary` behavior unchanged.
   */
  conceptVocabulary?: BusinessConcept[];
  /**
   * TODO-058: response-language policy. Optional — absent means the product
   * default (organization language English, reply in the customer's language).
   */
  languagePolicy?: LanguagePolicy;
  createdAt: string;
  updatedAt: string;
  /** Server-side optimistic-concurrency revision for profile settings. */
  profileRevision?: number;
}
