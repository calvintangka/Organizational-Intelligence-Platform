import { DEVELOPER_DEMO_ORGANIZATION_ID } from "@/data/developerDemoFoundation";

export type CuratedDraftingMode = "deterministic" | "no_template";

/**
 * Developer-only rehearsal inputs. These are expectations for the real OIP
 * pipeline, never instructions to retrieval, ranking, or drafting.
 */
export interface CuratedDeveloperDemoScenario {
  id: string;
  title: string;
  shortDescription: string;
  organizationId: typeof DEVELOPER_DEMO_ORGANIZATION_ID;
  ticketSubject: string;
  ticketBody: string;
  expectedCategory: string;
  expectedKnowledgeId: string | null;
  expectedLessonId: string | null;
  expectedAuthorized: boolean;
  expectedDraftingMode: CuratedDraftingMode;
  expectedTrust: number | null;
  expectedTrustBehavior: string;
  expectedProvenanceHighlights: string[];
  expectedExplanationHighlights: string[];
  talkingPoints: string[];
}

export const curatedDeveloperDemoScenarios: readonly CuratedDeveloperDemoScenario[] = [
  {
    id: "years-old-sso-reuse",
    title: "Years-old SSO knowledge, reused immediately",
    shortDescription: "A new certificate-rotation ticket draws on authentication knowledge first created in January 2023.",
    organizationId: DEVELOPER_DEMO_ORGANIZATION_ID,
    ticketSubject: "SSO Redirect Loop After Certificate Rotation",
    ticketBody: "Our identity provider certificate was rotated and users are being sent back to sign-in. authentication certificate redirect timeline.",
    expectedCategory: "Authentication",
    expectedKnowledgeId: "demo-ki-sso-certificate-redirect-loop",
    expectedLessonId: "demo-les-sso-certificate-redirect-loop-001",
    expectedAuthorized: true,
    expectedDraftingMode: "deterministic",
    expectedTrust: 95,
    expectedTrustBehavior: "Trust 95 is governance evidence after a relevance-based SSO match; it is not the reason the item was retrieved.",
    expectedProvenanceHighlights: ["OIP-20230104-0001", "created 2023-01-13", "140 validations", "7 knowledge versions"],
    expectedExplanationHighlights: ["SSO canonical", "matched lesson", "authentication certificate", "redirect timeline", "trust 95", "supporting tickets"],
    talkingPoints: ["This incident was first recorded years ago.", "The current ticket receives a validated lesson-informed response immediately.", "The UI exposes the source ticket, versions, trust, and supporting evidence."]
  },
  {
    id: "sso-specific-root-cause",
    title: "Specific root cause among SSO siblings",
    shortDescription: "The same SSO canonical contains multiple historic causes; root-cause 04 evidence selects the certificate-metadata lesson.",
    organizationId: DEVELOPER_DEMO_ORGANIZATION_ID,
    ticketSubject: "SSO Redirect Loop After Certificate Rotation",
    ticketBody: "Certificate signing metadata no longer matches after rotation. authentication certificate redirect timeline root cause 04 sso-certificate-redirect-loop.",
    expectedCategory: "Authentication",
    expectedKnowledgeId: "demo-ki-sso-certificate-redirect-loop",
    expectedLessonId: "demo-les-sso-certificate-redirect-loop-004",
    expectedAuthorized: true,
    expectedDraftingMode: "deterministic",
    expectedTrust: 95,
    expectedTrustBehavior: "The structured root-cause evidence breaks the sibling tie; trust remains confidence information.",
    expectedProvenanceHighlights: ["lesson source OIP-20240108-0796", "10 sibling lessons", "root cause 04"],
    expectedExplanationHighlights: ["root cause 04 signal", "lesson 004", "generic sibling not selected", "trust 95"],
    talkingPoints: ["OIP first identifies the shared canonical problem.", "It then selects the historically supported root cause for this ticket.", "Specificity is evidence-driven, not array order or trust."]
  },
  {
    id: "relevance-before-trust",
    title: "Relevance before trust",
    shortDescription: "A duplicate-invoice ticket selects the lower-trust exact item over a higher-trust but less relevant billing candidate.",
    organizationId: DEVELOPER_DEMO_ORGANIZATION_ID,
    ticketSubject: "Duplicate Invoice After Seat Changes",
    ticketBody: "Two invoice lines charged the same seat period after a seat change. billing duplicate invoice timeline root cause 01 duplicate-invoice-seat-change.",
    expectedCategory: "Billing",
    expectedKnowledgeId: "demo-ki-duplicate-invoice-seat-change",
    expectedLessonId: "demo-les-duplicate-invoice-seat-change-001",
    expectedAuthorized: true,
    expectedDraftingMode: "deterministic",
    expectedTrust: 95,
    expectedTrustBehavior: "The exact duplicate-invoice item (trust 95) must outrank the plausible proration-credit candidate (trust 98) by relevance.",
    expectedProvenanceHighlights: ["OIP-20230109-0004", "created 2023-02-13", "7 knowledge versions"],
    expectedExplanationHighlights: ["duplicate invoice canonical", "seat-boundary lesson", "trust 95 shown after selection"],
    talkingPoints: ["The highest-trust item is not automatically the answer.", "OIP selects the ticket's best-supported root cause first.", "Trust informs governance and confidence after relevance selection."]
  },
  {
    id: "fail-closed-weak-overlap",
    title: "Mature memory still fails closed",
    shortDescription: "A billing request has a superficial invoice overlap, but OIP refuses an unsupported lesson-informed response.",
    organizationId: DEVELOPER_DEMO_ORGANIZATION_ID,
    ticketSubject: "Invoice address change with incidental webhook wording",
    ticketBody: "I need a billing invoice address changed. No integration or signature failure occurred.",
    expectedCategory: "Billing",
    expectedKnowledgeId: "demo-ki-invoice-currency-display",
    expectedLessonId: "demo-les-invoice-currency-display-001",
    expectedAuthorized: false,
    expectedDraftingMode: "no_template",
    expectedTrust: 28,
    expectedTrustBehavior: "Trust and a weak lexical overlap cannot authorize drafting.",
    expectedProvenanceHighlights: ["candidate may be visible", "lesson evidence remains weak"],
    expectedExplanationHighlights: ["no_template", "human review", "no knowledge authorization"],
    talkingPoints: ["Years of memory do not make OIP reckless.", "A candidate can be considered without being authorized.", "Weak evidence stays in the human-review path."]
  }
] as const;

export function isCuratedDeveloperDemoOrganization(organizationId: string | undefined): boolean {
  return organizationId === DEVELOPER_DEMO_ORGANIZATION_ID;
}

export function curatedScenarioText(scenario: CuratedDeveloperDemoScenario): string {
  return `${scenario.ticketSubject}\n\n${scenario.ticketBody}`;
}
