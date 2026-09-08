import type { OrganizationalMemoryInspection } from "@/types/organizationalMemory";

export interface CurrentMemoryProvenanceSummary {
  sourceLabel: string;
  sourceIdentity: string;
  validationLabel: string;
  evidenceCount: number;
  evidenceSummaries: string[];
}

function sourceLabel(inspection: OrganizationalMemoryInspection): string {
  const metadata = inspection.source?.metadata;
  return metadata && typeof metadata.title === "string"
    ? metadata.title
    : inspection.source?.sourceObjectId ?? "Organizational experience";
}

/**
 * Build the small authoritative provenance projection used beside a retrieval
 * match. Retrieval explainability stays separate; this reads only the
 * org-scoped inspection payload for the current Memory snapshot.
 */
export function projectCurrentMemoryProvenance(
  inspection: OrganizationalMemoryInspection
): CurrentMemoryProvenanceSummary {
  const validation = inspection.knowledgeItem.provenance?.validatedBy
    ?? inspection.history.validationRecords.find((record) => record.decision === "approved")?.actor
    ?? "recorded human review";
  const source = inspection.source;
  return {
    sourceLabel: sourceLabel(inspection),
    sourceIdentity: source
      ? `${source.sourceKind} · ${source.sourceObjectType} · ${source.sourceObjectId}`
      : "Source identity unavailable",
    validationLabel: validation,
    evidenceCount: inspection.evidence.length,
    evidenceSummaries: inspection.evidence
      .map((entry) => entry.evidence.content?.trim() ?? "")
      .filter(Boolean)
      .slice(0, 3)
  };
}
