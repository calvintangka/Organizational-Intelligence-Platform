import type { Ticket } from "./ticket";
import type { KnowledgeMatch, ReflectionAction } from "./knowledge";
import type { Understanding } from "./oip";

export type SupportedBulkUploadFormat = "json" | "csv" | "md" | "txt";
export type BulkUploadShape = "raw_queries" | "queries_with_resolutions" | "mixed";
export type BulkClusterConfidence = "high" | "medium" | "low";
export type BulkAnalysisMode = "deterministic" | "ai_assisted" | "deterministic_fallback";

export interface BulkUploadEntry {
  id: string;
  originalIndex: number;
  message: string;
  resolution?: string;
  sourceLabel: string;
}

export interface BulkUploadFieldOption {
  key: string;
  label: string;
  sample: string;
}

export interface BulkUploadMappingRequest {
  fieldOptions: BulkUploadFieldOption[];
  /** fieldOptions minus any field that is unambiguously query/subject-shaped
   * (e.g. "subject", "message"). A subject-line field must never be offered
   * as a resolution candidate, since it is never a real customer response. */
  resolutionFieldOptions: BulkUploadFieldOption[];
  suggestedMessageField?: string;
  suggestedResolutionField?: string;
}

export interface BulkUploadMappingSelection {
  messageField: string;
  resolutionField?: string;
}

export interface BulkUploadParseSummary {
  format: SupportedBulkUploadFormat;
  shape: BulkUploadShape;
  detectedQueries: number;
  skippedRows: number;
  truncatedCount: number;
  warnings: string[];
}

export interface BulkUploadParseResult {
  entries: BulkUploadEntry[];
  summary: BulkUploadParseSummary;
  needsMapping: boolean;
  mappingRequest?: BulkUploadMappingRequest;
}

export interface BulkClusterSample {
  entryId: string;
  message: string;
  resolution?: string;
}

export interface BulkAnalyzedQuery {
  entry: BulkUploadEntry;
  ticket: Ticket;
  understanding: Understanding;
  canonicalProblem: {
    id: string;
    title: string;
    problemSummary: string;
    category: string;
    tags: string[];
  };
  existingMatch: KnowledgeMatch | null;
  confidence: BulkClusterConfidence;
  reasoning: string;
}

export interface BulkKnowledgeDraft {
  customerResponseTemplate: string;
  internalGuidance: string;
  rationale: string;
  resolutionNeeded: boolean;
}

export interface BulkCluster {
  id: string;
  kind: "new" | "existing" | "unclustered";
  proposedAction?: Extract<ReflectionAction, "create_new" | "merge_existing" | "create_version">;
  canonicalProblemId: string;
  canonicalProblemTitle: string;
  problemSummary: string;
  category: string;
  relatedKnowledgeId?: string;
  relatedKnowledgeTitle?: string;
  count: number;
  sampleQueries: BulkClusterSample[];
  items: BulkAnalyzedQuery[];
  knowledgeDraft: BulkKnowledgeDraft;
  confidence: BulkClusterConfidence;
  reasoning: string;
  analysisMode: BulkAnalysisMode;
  providerLabel: string;
}

/**
 * TODO-062A: bulk analysis runs in two distinct phases and the second one used
 * to be invisible. `phase` lets the UI distinguish "still reading rows" from
 * "clustering the rows it already read", so a long clustering pass can no
 * longer masquerade as a stalled final row.
 */
export type BulkAnalysisPhase = "analyzing" | "clustering" | "complete";

export interface BulkAnalysisProgress {
  /** Units finished within the current phase (not across the whole run). */
  completed: number;
  /** Units in the current phase. */
  total: number;
  currentLabel: string;
  /** Monotonic 0-100 across the whole run, not just the current phase. */
  percent: number;
  phase: BulkAnalysisPhase;
}

export interface BulkAnalysisResult {
  total: number;
  clusters: BulkCluster[];
  unclustered: BulkCluster;
  analysisMode: BulkAnalysisMode;
  providerLabel: string;
}
