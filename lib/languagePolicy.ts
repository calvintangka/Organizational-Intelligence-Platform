/**
 * TODO-058 Phase F — response language policy.
 *
 * Which language an outgoing draft is written in becomes an ORGANIZATION
 * decision rather than whatever the LLM happened to mirror. The policy is
 * resolved deterministically from the organization's settings plus the detected
 * language, so the same ticket always produces the same target language
 * regardless of which AI provider served the draft — or whether any did.
 */
import type { LanguagePolicy, OrganizationProfile, ResponseLanguageMode } from "@/types";
import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  languageLabel,
  type LanguageDetection,
  type SupportedLanguageCode
} from "@/lib/languageDetection";

/**
 * Product default: reply in the customer's language, fall back to English when
 * detection is not confident. This is what an organization gets before it ever
 * opens the language settings, and it matches the incidental behavior that
 * multilingual LLMs already produced — so existing organizations see no change.
 */
export const DEFAULT_LANGUAGE_POLICY: LanguagePolicy = {
  organizationLanguage: DEFAULT_LANGUAGE,
  responseMode: "customer_language",
  internalLanguage: DEFAULT_LANGUAGE,
  minimumDetectionConfidence: 0.6
};

const RESPONSE_MODES: ResponseLanguageMode[] = ["customer_language", "organization_language", "fixed_language"];

function validMode(value: unknown): ResponseLanguageMode {
  return RESPONSE_MODES.includes(value as ResponseLanguageMode)
    ? (value as ResponseLanguageMode)
    : DEFAULT_LANGUAGE_POLICY.responseMode;
}

function validLanguage(value: unknown, fallback: SupportedLanguageCode): SupportedLanguageCode {
  return isSupportedLanguage(value) ? value : fallback;
}

function validConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_LANGUAGE_POLICY.minimumDetectionConfidence;
  return Math.max(0, Math.min(1, value));
}

/**
 * Coerce a stored policy into a complete, valid one. A profile that has never
 * configured language settings resolves to the product default, which is why
 * this is backward compatible with every existing organization.
 */
export function resolveLanguagePolicy(profile: Pick<OrganizationProfile, "languagePolicy"> | null | undefined): LanguagePolicy {
  const stored = profile?.languagePolicy;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return { ...DEFAULT_LANGUAGE_POLICY };
  const organizationLanguage = validLanguage(stored.organizationLanguage, DEFAULT_LANGUAGE);
  const responseMode = validMode(stored.responseMode);
  const policy: LanguagePolicy = {
    organizationLanguage,
    responseMode,
    internalLanguage: validLanguage(stored.internalLanguage, organizationLanguage),
    minimumDetectionConfidence: validConfidence(stored.minimumDetectionConfidence)
  };
  if (responseMode === "fixed_language") {
    policy.fixedResponseLanguage = validLanguage(stored.fixedResponseLanguage, organizationLanguage);
  }
  return policy;
}

export type ResponseLanguageReason =
  | "customer_language"
  | "low_confidence_fallback"
  | "organization_language"
  | "fixed_language";

export interface ResponseLanguageDecision {
  /** Language the draft must be written in. */
  language: SupportedLanguageCode;
  /** Display label for the UI. */
  label: string;
  reason: ResponseLanguageReason;
  /** Human-readable justification, shown in the UI and the intelligence log. */
  explanation: string;
}

/**
 * Decide the outgoing draft language from policy plus detection.
 *
 * A detection below the policy's confidence bar never selects a language: the
 * organization language is used instead, so a weak guess cannot cause a reply in
 * a language the customer did not write.
 */
export function resolveResponseLanguage(
  policy: LanguagePolicy,
  detection: Pick<LanguageDetection, "language" | "confidence"> | null | undefined
): ResponseLanguageDecision {
  const organizationLanguage = validLanguage(policy.organizationLanguage, DEFAULT_LANGUAGE);

  if (policy.responseMode === "fixed_language") {
    const language = validLanguage(policy.fixedResponseLanguage, organizationLanguage);
    return {
      language,
      label: languageLabel(language),
      reason: "fixed_language",
      explanation: `Organization policy replies in ${languageLabel(language)} for every ticket.`
    };
  }

  if (policy.responseMode === "organization_language") {
    return {
      language: organizationLanguage,
      label: languageLabel(organizationLanguage),
      reason: "organization_language",
      explanation: `Organization policy replies in the organization language, ${languageLabel(organizationLanguage)}.`
    };
  }

  const detected = detection && isSupportedLanguage(detection.language) ? detection.language : null;
  const confidence = typeof detection?.confidence === "number" ? detection.confidence : 0;
  if (!detected || confidence < validConfidence(policy.minimumDetectionConfidence)) {
    return {
      language: organizationLanguage,
      label: languageLabel(organizationLanguage),
      reason: "low_confidence_fallback",
      explanation:
        `Detected language confidence ${confidence.toFixed(2)} is below the configured minimum ` +
        `${validConfidence(policy.minimumDetectionConfidence).toFixed(2)}, so the reply uses the organization language, ${languageLabel(organizationLanguage)}.`
    };
  }

  return {
    language: detected,
    label: languageLabel(detected),
    reason: "customer_language",
    explanation: `Replying in the customer's language, ${languageLabel(detected)} (confidence ${confidence.toFixed(2)}).`
  };
}

/**
 * Instruction appended to an AI drafting prompt so the provider cannot choose
 * the language on its own. Deterministic drafts carry the same decision as
 * metadata, so both paths obey one policy.
 */
export function responseLanguageInstruction(decision: ResponseLanguageDecision): string {
  return (
    `Response language rule: write the entire customer-facing response in ${decision.label} ` +
    `(${decision.language}). Do not mix languages. Do not translate product names, ticket ids, or ` +
    `error codes. ${decision.explanation}`
  );
}
