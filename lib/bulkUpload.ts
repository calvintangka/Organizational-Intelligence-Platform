import type { AIAdapter } from "@/lib/ai/types";
import { assessBusinessRelevanceForProfile, understandForProfile } from "@/lib/analyzer";
import {
  createCanonicalProblem,
  findCanonicalProblem,
  identifyCanonicalProblem,
  withCanonicalProblemDefaults
} from "@/lib/canonicalProblemEngine";
import { findMatchingLesson } from "@/lib/drafting";
import type {
  BulkAnalyzedQuery,
  BulkAnalysisProgress,
  BulkAnalysisResult,
  BulkAnalysisMode,
  BulkCluster,
  BulkClusterConfidence,
  BulkUploadEntry,
  BulkUploadFieldOption,
  BulkUploadMappingRequest,
  BulkUploadMappingSelection,
  BulkUploadParseResult,
  BulkUploadShape,
  KnowledgeItem,
  OrganizationProfile,
  ReflectionAction,
  SupportedBulkUploadFormat,
  Ticket
} from "@/types";

const MESSAGE_FIELD_HINTS = ["message", "query", "text", "body", "issue", "description", "prompt", "question", "subject"];
const RESOLUTION_FIELD_HINTS = ["resolution", "answer", "solution", "response", "reply", "outcome", "resolved", "fix"];
const BULK_UPLOAD_LIMIT = 1000;

type ParsedObjectRow = Record<string, unknown>;

interface AnalyzeBulkEntriesInput {
  entries: BulkUploadEntry[];
  organizationProfile: OrganizationProfile;
  knowledgeItems: KnowledgeItem[];
  aiAdapter: AIAdapter;
  onProgress?: (progress: BulkAnalysisProgress) => void;
}

export interface BulkClusterCommitDraft {
  action: Extract<ReflectionAction, "create_new" | "merge_existing" | "create_version">;
  sourceTicketIds: string[];
  solution: string;
  customerResponseTemplate: string;
  internalGuidance: string;
  canonicalProblemTitle?: string;
  category?: string;
  relatedKnowledgeId?: string;
  rationale: string;
  beforeState: KnowledgeItem | null;
  afterState: KnowledgeItem;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toText(value: unknown): string {
  if (typeof value === "string") return normalizeWhitespace(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function makeEntryId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`;
}

function detectFormat(fileName: string): SupportedBulkUploadFormat | null {
  const match = /\.([a-z0-9]+)$/i.exec(fileName);
  const extension = match?.[1]?.toLowerCase();
  if (extension === "json" || extension === "csv" || extension === "md" || extension === "txt") return extension;
  return null;
}

function shapeForEntries(entries: BulkUploadEntry[]): BulkUploadShape {
  const withResolution = entries.filter((entry) => !!entry.resolution?.trim()).length;
  if (withResolution === 0) return "raw_queries";
  if (withResolution === entries.length) return "queries_with_resolutions";
  return "mixed";
}

function maybeTruncateEntries(entries: BulkUploadEntry[], warnings: string[]): { entries: BulkUploadEntry[]; truncatedCount: number } {
  if (entries.length <= BULK_UPLOAD_LIMIT) {
    return { entries, truncatedCount: 0 };
  }
  const truncatedCount = entries.length - BULK_UPLOAD_LIMIT;
  warnings.push(`Batch capped at ${BULK_UPLOAD_LIMIT} queries. ${truncatedCount} additional row${truncatedCount === 1 ? "" : "s"} were not analyzed.`);
  return { entries: entries.slice(0, BULK_UPLOAD_LIMIT), truncatedCount };
}

function scoreFieldName(key: string, hints: string[]): number {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  let score = 0;
  for (const hint of hints) {
    const normalizedHint = hint.replace(/[^a-z0-9]/g, "");
    if (normalized === normalizedHint) score = Math.max(score, 5);
    else if (normalized.startsWith(normalizedHint) || normalized.endsWith(normalizedHint)) score = Math.max(score, 4);
    else if (normalized.includes(normalizedHint)) score = Math.max(score, 3);
  }
  return score;
}

/**
 * True when `key` is unambiguously a query/subject-shaped field (exact hint
 * match, e.g. "subject", "message", "query"). Such a field must never be
 * accepted as the resolution field — doing so is what let a raw subject line
 * flow into a knowledge item's customer response as if it were a real answer.
 * This is enforced here (not just in the suggestion heuristic) so it holds
 * even for a caller-supplied mapping that bypasses field auto-suggestion.
 */
function isMessageShapedField(key: string): boolean {
  return key !== "__subject_body__" && scoreFieldName(key, MESSAGE_FIELD_HINTS) >= 5;
}

function collectFieldOptions(rows: ParsedObjectRow[]): BulkUploadFieldOption[] {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const options = keys.map((key) => ({
    key,
    label: key,
    sample: rows.map((row) => toText(row[key])).find((sample) => sample.length > 0) ?? ""
  }));
  const hasSubject = keys.some((key) => key.toLowerCase() === "subject");
  const hasBody = keys.some((key) => key.toLowerCase() === "body");
  if (hasSubject && hasBody) {
    const sampleRow = rows.find((row) => toText(row.subject).length > 0 || toText(row.body).length > 0);
    options.unshift({
      key: "__subject_body__",
      label: "subject + body",
      sample: normalizeWhitespace(`${toText(sampleRow?.subject)} ${toText(sampleRow?.body)}`)
    });
  }
  return options;
}

function suggestField(
  options: BulkUploadFieldOption[],
  hints: string[],
  preferredSynthetic = false
): { key?: string; ambiguous: boolean } {
  const ranked = options
    .map((option) => ({
      option,
      score:
        option.key === "__subject_body__" && preferredSynthetic
          ? 4
          : scoreFieldName(option.key, hints)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.option.key.localeCompare(b.option.key));

  if (ranked.length === 0) return { ambiguous: false };
  const [first, second] = ranked;
  return {
    key: first.option.key,
    ambiguous: !!second && second.score === first.score && second.option.key !== first.option.key
  };
}

function buildMappingRequest(rows: ParsedObjectRow[]): BulkUploadMappingRequest {
  const fieldOptions = collectFieldOptions(rows);
  const resolutionFieldOptions = fieldOptions.filter((option) => !isMessageShapedField(option.key));
  const message = suggestField(fieldOptions, MESSAGE_FIELD_HINTS, true);
  const resolution = suggestField(resolutionFieldOptions, RESOLUTION_FIELD_HINTS);
  return {
    fieldOptions,
    resolutionFieldOptions,
    suggestedMessageField: message.key,
    suggestedResolutionField: resolution.key
  };
}

function extractMessage(row: ParsedObjectRow, field: string): string {
  if (field === "__subject_body__") {
    return normalizeWhitespace(`${toText(row.subject)} ${toText(row.body)}`);
  }
  return toText(row[field]);
}

function extractEntriesFromObjectRows(
  rows: ParsedObjectRow[],
  sourcePrefix: string,
  mapping?: BulkUploadMappingSelection
): { entries: BulkUploadEntry[]; skippedRows: number; needsMapping: boolean; mappingRequest?: BulkUploadMappingRequest } {
  const mappingRequest = buildMappingRequest(rows);
  const fieldOptions = mappingRequest.fieldOptions;
  const messageSuggestion = suggestField(fieldOptions, MESSAGE_FIELD_HINTS, true);
  const resolutionSuggestion = suggestField(mappingRequest.resolutionFieldOptions, RESOLUTION_FIELD_HINTS);
  const messageField = mapping?.messageField ?? mappingRequest.suggestedMessageField;
  const rawResolutionField = mapping?.resolutionField ?? mappingRequest.suggestedResolutionField;
  // A field that is itself query/subject-shaped (or is literally the same
  // column as the message field) can never be a legitimate resolution source
  // — treat it as "no resolution field" rather than let it flow through.
  const resolutionField =
    rawResolutionField && rawResolutionField !== messageField && !isMessageShapedField(rawResolutionField)
      ? rawResolutionField
      : undefined;

  const needsMapping =
    !mapping &&
    (
      !messageField ||
      messageSuggestion.ambiguous ||
      resolutionSuggestion.ambiguous
    );

  if (needsMapping || !messageField) {
    return { entries: [], skippedRows: 0, needsMapping: true, mappingRequest };
  }

  let skippedRows = 0;
  const entries: BulkUploadEntry[] = [];
  rows.forEach((row, index) => {
    const message = extractMessage(row, messageField);
    if (!message) {
      skippedRows += 1;
      return;
    }
    const resolution = resolutionField ? toText(row[resolutionField]) : "";
    entries.push({
      id: makeEntryId(sourcePrefix, index),
      originalIndex: index,
      message,
      resolution: resolution || undefined,
      sourceLabel: `${sourcePrefix} row ${index + 1}`
    });
  });

  return { entries, skippedRows, needsMapping: false, mappingRequest };
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current);
      current = "";
      if (row.some((cell) => cell.trim().length > 0)) {
        rows.push(row.map((cell) => cell.trim()));
      }
      row = [];
      continue;
    }

    current += char;
  }

  row.push(current);
  if (row.some((cell) => cell.trim().length > 0)) {
    rows.push(row.map((cell) => cell.trim()));
  }
  return rows;
}

function parseJsonEntries(
  content: string,
  mapping?: BulkUploadMappingSelection
): { entries: BulkUploadEntry[]; skippedRows: number; needsMapping: boolean; mappingRequest?: BulkUploadMappingRequest } {
  const parsed = JSON.parse(content) as unknown;
  const rows =
    Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed !== null
      ? Object.values(parsed).find((value) => Array.isArray(value)) ?? [parsed]
      : [];

  if (!Array.isArray(rows)) {
    return { entries: [], skippedRows: 0, needsMapping: false };
  }

  if (rows.every((row) => typeof row === "string")) {
    return {
      entries: rows
        .map((row, index) => normalizeWhitespace(row))
        .filter(Boolean)
        .map((message, index) => ({
          id: makeEntryId("json", index),
          originalIndex: index,
          message,
          sourceLabel: `json row ${index + 1}`
        })),
      skippedRows: rows.filter((row) => !normalizeWhitespace(String(row))).length,
      needsMapping: false
    };
  }

  const objectRows = rows.filter((row): row is ParsedObjectRow => typeof row === "object" && row !== null);
  return extractEntriesFromObjectRows(objectRows, "json", mapping);
}

function parseCsvEntries(
  content: string,
  mapping?: BulkUploadMappingSelection
): { entries: BulkUploadEntry[]; skippedRows: number; needsMapping: boolean; mappingRequest?: BulkUploadMappingRequest } {
  const rows = parseCsv(content);
  if (rows.length === 0) {
    return { entries: [], skippedRows: 0, needsMapping: false };
  }

  if (rows.length === 1) {
    const [message] = rows[0];
    return {
      entries: message
        ? [{
            id: "csv-1",
            originalIndex: 0,
            message,
            sourceLabel: "csv row 1"
          }]
        : [],
      skippedRows: message ? 0 : 1,
      needsMapping: false
    };
  }

  const [headerRow, ...valueRows] = rows;
  const headers = headerRow.map((header, index) => header || `column_${index + 1}`);
  const objectRows = valueRows.map((cells) =>
    headers.reduce<ParsedObjectRow>((record, header, index) => {
      record[header] = cells[index] ?? "";
      return record;
    }, {})
  );
  return extractEntriesFromObjectRows(objectRows, "csv", mapping);
}

function parseTextEntries(content: string, sourcePrefix: "md" | "txt"): { entries: BulkUploadEntry[]; skippedRows: number } {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*+]|\d+\.)\s*/, "").replace(/^>\s*/, "").trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  const entries = lines.map((message, index) => ({
    id: makeEntryId(sourcePrefix, index),
    originalIndex: index,
    message: normalizeWhitespace(message),
    sourceLabel: `${sourcePrefix} line ${index + 1}`
  }));

  return { entries, skippedRows: 0 };
}

export function parseBulkUploadFile(
  fileName: string,
  content: string,
  mapping?: BulkUploadMappingSelection
): BulkUploadParseResult {
  const format = detectFormat(fileName);
  if (!format) {
    throw new Error("Unsupported file type. Upload .json, .csv, .md, or .txt.");
  }

  const warnings: string[] = [];
  let entries: BulkUploadEntry[] = [];
  let skippedRows = 0;
  let needsMapping = false;
  let mappingRequest: BulkUploadMappingRequest | undefined;

  try {
    if (format === "json") {
      const result = parseJsonEntries(content, mapping);
      entries = result.entries;
      skippedRows = result.skippedRows;
      needsMapping = result.needsMapping;
      mappingRequest = result.mappingRequest;
    } else if (format === "csv") {
      const result = parseCsvEntries(content, mapping);
      entries = result.entries;
      skippedRows = result.skippedRows;
      needsMapping = result.needsMapping;
      mappingRequest = result.mappingRequest;
    } else {
      const result = parseTextEntries(content, format);
      entries = result.entries;
      skippedRows = result.skippedRows;
    }
  } catch {
    throw new Error(`Unable to parse this ${format.toUpperCase()} file.`);
  }

  const limited = maybeTruncateEntries(entries, warnings);

  return {
    entries: limited.entries,
    summary: {
      format,
      shape: shapeForEntries(limited.entries),
      detectedQueries: limited.entries.length,
      skippedRows,
      truncatedCount: limited.truncatedCount,
      warnings
    },
    needsMapping,
    mappingRequest
  };
}

function buildBulkTicket(entry: BulkUploadEntry): Ticket {
  const subject = entry.message.length > 80 ? `${entry.message.slice(0, 80)}…` : entry.message;
  return {
    id: `bulk-ticket-${entry.id}`,
    customerName: "Bulk Upload",
    subject,
    description: entry.message,
    category: "General",
    status: "new",
    createdAt: new Date().toISOString()
  };
}

function summarizeResolution(resolutions: string[]): string {
  if (resolutions.length === 0) return "";

  const counts = new Map<string, { original: string; count: number }>();
  for (const resolution of resolutions) {
    const normalized = normalizeWhitespace(resolution).toLowerCase();
    if (!normalized) continue;
    const existing = counts.get(normalized);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(normalized, { original: normalizeWhitespace(resolution), count: 1 });
    }
  }

  const ranked = [...counts.values()].sort((a, b) => b.count - a.count || b.original.length - a.original.length);
  return ranked[0]?.original ?? "";
}

function overlapRatio(a: string, b: string): number {
  const tokensA = new Set(normalizeWhitespace(a).toLowerCase().split(/\s+/).filter(Boolean));
  const tokensB = new Set(normalizeWhitespace(b).toLowerCase().split(/\s+/).filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let shared = 0;
  tokensA.forEach((token) => {
    if (tokensB.has(token)) shared += 1;
  });
  return shared / Math.max(tokensA.size, tokensB.size);
}

function deriveConfidence(
  query: BulkAnalyzedQuery,
  relevanceStatus: "relevant" | "uncertain" | "out_of_scope"
): BulkClusterConfidence {
  if (relevanceStatus === "out_of_scope") return "low";
  if (query.existingMatch && query.existingMatch.matchScore >= 92) return "high";
  if (query.understanding.category === "General" || query.understanding.detectedSignals.length === 0) return "low";
  if (query.understanding.detectedSignals.length >= 2) return "high";
  return "medium";
}

function averageConfidence(items: BulkAnalyzedQuery[]): BulkClusterConfidence {
  const score = items.reduce((total, item) => total + (item.confidence === "high" ? 3 : item.confidence === "medium" ? 2 : 1), 0) / Math.max(items.length, 1);
  if (score >= 2.5) return "high";
  if (score >= 1.75) return "medium";
  return "low";
}

function createUnclusteredBucket(providerLabel: string, analysisMode: BulkAnalysisMode): BulkCluster {
  return {
    id: "bulk-unclustered",
    kind: "unclustered",
    canonicalProblemId: "unclustered",
    canonicalProblemTitle: "Unclustered / low confidence",
    problemSummary: "Queries that need individual review before they can be learned as a validated pattern.",
    category: "General",
    count: 0,
    sampleQueries: [],
    items: [],
    knowledgeDraft: {
      customerResponseTemplate: "",
      internalGuidance: "",
      rationale: "Confidence too low for safe clustering.",
      resolutionNeeded: true
    },
    confidence: "low",
    reasoning: "Queries were held back because the system could not safely validate a common pattern.",
    analysisMode,
    providerLabel
  };
}

function mergeClusterEvidence(item: KnowledgeItem, cluster: BulkCluster, at: string): KnowledgeItem {
  const base = withCanonicalProblemDefaults(item);
  const existingIds = new Set((base.exampleTickets ?? []).map((example) => example.ticketId));
  const addedExamples = cluster.items
    .filter((entry) => !existingIds.has(entry.ticket.id))
    .map((entry) => ({
      ticketId: entry.ticket.id,
      customerName: entry.ticket.customerName,
      originalIssue: entry.ticket.description,
      createdAt: entry.ticket.createdAt,
      resolutionMode: "human" as const
    }));

  return {
    ...base,
    tags: Array.from(new Set([...base.tags, ...cluster.items.flatMap((entry) => entry.understanding.tags)])),
    exampleTickets: [...(base.exampleTickets ?? []), ...addedExamples],
    timesSeen: (base.timesSeen ?? 0) + addedExamples.length,
    lastUpdated: at,
    lastValidated: at,
    lastValidatedAt: at
  };
}

function updateProgress(onProgress: AnalyzeBulkEntriesInput["onProgress"], completed: number, total: number, currentLabel: string) {
  onProgress?.({
    completed,
    total,
    currentLabel,
    percent: total === 0 ? 100 : Math.round((completed / total) * 100)
  });
}

export async function analyzeBulkEntries(input: AnalyzeBulkEntriesInput): Promise<BulkAnalysisResult> {
  const { entries, organizationProfile, knowledgeItems, aiAdapter, onProgress } = input;
  let analysisMode: BulkAnalysisMode = aiAdapter.config.mode === "disabled" ? "deterministic" : "ai_assisted";
  let usedAIAssistance = false;
  let fallbackUsed = false;
  // Bug fix: the "Clustered via X" badge must reflect whichever tier actually
  // returned a successful response, not the AI adapter's static chain-level
  // label (which always names every tier, e.g. "AI Chain (LM Studio → Remote
  // Gemma → Claude API)" — a string that always contains "Claude" regardless
  // of whether Claude ever ran or succeeded). Track the most recent genuinely
  // successful call's own providerLabel instead.
  let actualProviderLabel: string | undefined;
  // F-3: track AI call attempts so a single bad response no longer flips the
  // mode to "deterministic_fallback". A majority-failure threshold is applied
  // at the end of the loop.
  let aiCallAttempts = 0;
  let aiCallFailures = 0;
  const analyzedQueries: Array<BulkAnalyzedQuery & { relevanceStatus: "relevant" | "uncertain" | "out_of_scope" }> = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    updateProgress(onProgress, index, entries.length, `Analyzing ${entry.sourceLabel}`);
    const ticket = buildBulkTicket(entry);
    const relevance = assessBusinessRelevanceForProfile(`${ticket.subject} ${ticket.description}`, organizationProfile);
    const understanding = understandForProfile(ticket, organizationProfile);
    const canonicalProblem = identifyCanonicalProblem(understanding, organizationProfile);
    const relevanceStatus = relevance.status;
    const canonicalMatch = relevanceStatus === "out_of_scope" ? null : findCanonicalProblem(understanding, knowledgeItems, organizationProfile);
    let existingMatch = canonicalMatch
      ? {
          item: canonicalMatch.item,
          matchScore: canonicalMatch.similarity,
          matchReason: canonicalMatch.reason
        }
      : null;
    const reasoningParts = [
      `Category ${understanding.category}`,
      `canonical problem ${canonicalProblem.title}`
    ];

    if (existingMatch && aiAdapter.config.mode !== "disabled") {
      const result = await aiAdapter.provider.discriminateMatch({
        ticket,
        matchedCanonicalTitle: existingMatch.item.canonicalProblemTitle ?? existingMatch.item.title,
        matchedProblemSummary: existingMatch.item.problemSummary ?? existingMatch.item.problem,
        deterministicUnderstanding: understanding
      });
      if (result.ok && result.data) {
        usedAIAssistance = true;
        actualProviderLabel = result.providerLabel ?? actualProviderLabel;
        if (result.data.isDistinctFromMatch && result.data.confidence !== "low") {
          reasoningParts.push(`AI rejected the existing-memory match: ${result.data.reasoning}`);
          existingMatch = null;
        } else if (result.data.reasoning) {
          reasoningParts.push(`AI confirmed the match: ${result.data.reasoning}`);
        }
      } else {
        // F-3: a single bad response no longer flips the mode. Track per-call
        // outcomes and decide after the loop whether enough calls failed to
        // truly be a "deterministic_fallback" vs "mostly AI-assisted".
        fallbackUsed = true;
        aiCallAttempts += 1;
        aiCallFailures += 1;
      }
    }

    const analyzedBase: BulkAnalyzedQuery = {
      entry,
      ticket,
      understanding,
      canonicalProblem,
      existingMatch,
      confidence: "medium",
      reasoning: reasoningParts.join(" · ")
    };
    const confidence = deriveConfidence(analyzedBase, relevanceStatus);
    analyzedQueries.push({
      ...analyzedBase,
      confidence,
      relevanceStatus
    });

    if (index > 0 && index % 25 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Placeholder for the unclustered bucket; the real value (actual succeeding
  // tier if any AI call succeeded, else the static chain label for display in
  // non-"ai_assisted" contexts) is only known after the loop below runs.
  const unclustered = createUnclusteredBucket(aiAdapter.provider.label, analysisMode);
  const clusterMap = new Map<string, BulkAnalyzedQuery[]>();

  for (const query of analyzedQueries) {
    const lowConfidence =
      query.relevanceStatus === "out_of_scope" ||
      query.confidence === "low" ||
      query.understanding.category === "General";

    if (lowConfidence) {
      unclustered.items.push(query);
      continue;
    }

    const key = query.existingMatch
      ? `existing:${query.existingMatch.item.id}`
      : `new:${query.canonicalProblem.id}`;

    const existing = clusterMap.get(key) ?? [];
    existing.push(query);
    clusterMap.set(key, existing);
  }

  const clusters: BulkCluster[] = [];
  const groupedEntries = [...clusterMap.entries()];
  for (let index = 0; index < groupedEntries.length; index += 1) {
    const [key, items] = groupedEntries[index];
    const representative = items[0];
    const existingKnowledge = representative.existingMatch
      ? withCanonicalProblemDefaults(representative.existingMatch.item)
      : null;
    const providedResolutions = items.map((item) => item.entry.resolution ?? "").filter((value) => value.trim().length > 0);
    // When the source file supplied no real resolutions, ground the proposed
    // response in the matched knowledge item's own content instead of leaving
    // it blank or synthesizing something new: prefer a lesson whose signals
    // match this cluster's representative ticket (reuses the same
    // lesson-matching logic single-ticket drafting already relies on), and
    // only fall back to the item's generic template when no lesson matches.
    const matchedLesson = existingKnowledge ? findMatchingLesson(representative.ticket, existingKnowledge) : null;
    const proposedTemplate = providedResolutions.length > 0
      ? summarizeResolution(providedResolutions)
      : matchedLesson?.lesson.customerResponse ?? existingKnowledge?.customerResponseTemplate ?? "";
    const proposedAction =
      existingKnowledge && proposedTemplate
        ? overlapRatio(proposedTemplate, existingKnowledge.customerResponseTemplate ?? existingKnowledge.approvedAnswer) < 0.65
          ? "create_version"
          : "merge_existing"
        : existingKnowledge
        ? "merge_existing"
        : "create_new";

    let reasoning = `${items.length} query${items.length === 1 ? "" : "ies"} align to ${representative.canonicalProblem.title}.`;
    if (aiAdapter.config.mode !== "disabled") {
      const advisory = await aiAdapter.provider.suggestCanonicalProblem({
        ticket: representative.ticket,
        organizationProfile,
        deterministicUnderstanding: representative.understanding,
        deterministicCanonicalProblem: {
          title: representative.canonicalProblem.title,
          summary: representative.canonicalProblem.problemSummary,
          category: representative.canonicalProblem.category
        }
      });
      aiCallAttempts += 1;
      if (advisory.ok && advisory.data) {
        usedAIAssistance = true;
        actualProviderLabel = advisory.providerLabel ?? actualProviderLabel;
        if (advisory.data.rationale?.trim()) {
          reasoning = advisory.data.rationale.trim();
        }
      } else {
        fallbackUsed = true;
        aiCallFailures += 1;
      }
    }

    clusters.push({
      id: `cluster-${key.replace(/[^a-z0-9:-]/gi, "-")}`,
      kind: existingKnowledge ? "existing" : "new",
      proposedAction,
      canonicalProblemId: representative.canonicalProblem.id,
      canonicalProblemTitle: existingKnowledge?.canonicalProblemTitle ?? representative.canonicalProblem.title,
      problemSummary: existingKnowledge?.problemSummary ?? representative.canonicalProblem.problemSummary,
      category: existingKnowledge?.category ?? representative.canonicalProblem.category,
      relatedKnowledgeId: existingKnowledge?.id,
      relatedKnowledgeTitle: existingKnowledge?.canonicalProblemTitle ?? existingKnowledge?.title,
      count: items.length,
      sampleQueries: items.slice(0, 5).map((item) => ({
        entryId: item.entry.id,
        message: item.entry.message,
        resolution: item.entry.resolution
      })),
      items,
      knowledgeDraft: {
        customerResponseTemplate: proposedTemplate,
        internalGuidance: existingKnowledge?.internalGuidance ?? representative.canonicalProblem.problemSummary,
        rationale: existingKnowledge
          ? `Human validation will confirm that ${items.length} uploaded quer${items.length === 1 ? "y" : "ies"} strengthen ${existingKnowledge.canonicalProblemTitle ?? existingKnowledge.title}.`
          : `Human validation will confirm that ${items.length} uploaded quer${items.length === 1 ? "y" : "ies"} establish a new canonical problem.`,
        resolutionNeeded: proposedTemplate.trim().length === 0
      },
      confidence: averageConfidence(items),
      reasoning,
      analysisMode,
      // Placeholder; the real value is only known once every AI call in this
      // function has run (see the final pass below via applyMode/applyLabel).
      providerLabel: aiAdapter.provider.label
    });
  }

  unclustered.count = unclustered.items.length;
  unclustered.sampleQueries = unclustered.items.slice(0, 5).map((item) => ({
    entryId: item.entry.id,
    message: item.entry.message,
    resolution: item.entry.resolution
  }));

  // F-3: a few failed LLM responses should not flip the whole run into
  // "deterministic_fallback". Require a majority of AI attempts to have
  // failed before downgrading the analysis mode.
  const failureRate = aiCallAttempts > 0 ? aiCallFailures / aiCallAttempts : 0;
  if (fallbackUsed && aiCallAttempts > 0 && failureRate >= 0.5) {
    analysisMode = "deterministic_fallback";
  } else if (!usedAIAssistance) {
    analysisMode = "deterministic";
  }

  // The label shown to the user must name the tier that actually produced a
  // successful response, never the adapter's static "names every tier" chain
  // label (see actualProviderLabel comment above). Falls back to the static
  // label only when no AI call ever succeeded, purely for diagnostic/disabled
  // display contexts that don't branch on tier-specific substrings.
  const providerLabel = actualProviderLabel ?? aiAdapter.provider.label;
  const applyMode = (cluster: BulkCluster): BulkCluster => ({ ...cluster, analysisMode, providerLabel });
  updateProgress(onProgress, entries.length, entries.length, "Analysis complete");

  return {
    total: entries.length,
    clusters: clusters
      .map(applyMode)
      .sort((a, b) => b.count - a.count || a.canonicalProblemTitle.localeCompare(b.canonicalProblemTitle)),
    unclustered: applyMode(unclustered),
    analysisMode,
    providerLabel
  };
}

export function getBulkUploadLimit(): number {
  return BULK_UPLOAD_LIMIT;
}

export function prepareBulkClusterCommit(
  cluster: BulkCluster,
  knowledgeItems: KnowledgeItem[],
  organizationProfile: OrganizationProfile,
  at = new Date().toISOString()
): BulkClusterCommitDraft {
  const responseTemplate = cluster.knowledgeDraft.customerResponseTemplate.trim();
  const representative = cluster.items[0];
  if (!representative) {
    throw new Error("This cluster no longer contains any uploaded queries.");
  }

  if (!cluster.proposedAction || cluster.kind === "unclustered") {
    throw new Error("Unclustered queries must be handled through the single-ticket flow.");
  }

  if (!responseTemplate) {
    throw new Error("A validated response template is required before this cluster can be committed.");
  }
  const sourceTicketIds = cluster.items.map((item) => item.ticket.id);

  if (cluster.proposedAction === "create_new") {
    const created = createCanonicalProblem(representative.ticket, representative.understanding, responseTemplate, organizationProfile, at);
    return {
      action: "create_new",
      sourceTicketIds,
      solution: cluster.problemSummary,
      customerResponseTemplate: responseTemplate,
      internalGuidance: cluster.knowledgeDraft.internalGuidance,
      canonicalProblemTitle: cluster.canonicalProblemTitle,
      category: cluster.category,
      rationale: cluster.knowledgeDraft.rationale,
      beforeState: null,
      afterState: {
        ...created,
        tags: Array.from(new Set(cluster.items.flatMap((item) => item.understanding.tags))),
        problemSummary: cluster.problemSummary,
        internalGuidance: cluster.knowledgeDraft.internalGuidance,
        approvedAnswer: responseTemplate,
        customerResponseTemplate: responseTemplate,
        exampleTickets: cluster.items.map((item) => ({
          ticketId: item.ticket.id,
          customerName: item.ticket.customerName,
          originalIssue: item.ticket.description,
          createdAt: item.ticket.createdAt,
          resolutionMode: "human" as const
        })),
        timesSeen: cluster.items.length,
        humanReviewCount: 1,
        knowledgeVersions: [
          {
            versionId: `${created.canonicalProblemId}-v1`,
            version: 1,
            createdAt: at,
            changeReason: `Created from validated bulk cluster (${cluster.count} uploaded queries)`,
            sourceTicketId: representative.ticket.id,
            summary: "Initial validated bulk-cluster response"
          }
        ],
        learningHistory: [
          {
            id: `${created.canonicalProblemId}-history-${Date.now()}`,
            event: "Canonical problem created from bulk upload",
            detail: `${cluster.count} uploaded queries validated together`,
            createdAt: at
          }
        ]
      }
    };
  }

  const target = knowledgeItems.find((item) => item.id === cluster.relatedKnowledgeId);
  if (!target) {
    throw new Error("The target knowledge item could not be found. Re-run the bulk analysis and try again.");
  }
  const base = withCanonicalProblemDefaults(target);
  const mergedEvidence = mergeClusterEvidence(base, cluster, at);

  if (cluster.proposedAction === "merge_existing") {
    return {
      action: "merge_existing",
      sourceTicketIds,
      solution: cluster.problemSummary,
      customerResponseTemplate: base.customerResponseTemplate ?? base.approvedAnswer,
      internalGuidance: cluster.knowledgeDraft.internalGuidance || base.internalGuidance || cluster.problemSummary,
      canonicalProblemTitle: base.canonicalProblemTitle ?? base.title,
      category: base.category,
      relatedKnowledgeId: base.id,
      rationale: cluster.knowledgeDraft.rationale,
      beforeState: target,
      afterState: mergedEvidence
    };
  }

  const versionNumber = (base.knowledgeVersions?.length ?? 0) + 1;
  return {
    action: "create_version",
    sourceTicketIds,
    solution: cluster.problemSummary,
    customerResponseTemplate: responseTemplate,
    internalGuidance: cluster.knowledgeDraft.internalGuidance || mergedEvidence.internalGuidance || cluster.problemSummary,
    canonicalProblemTitle: mergedEvidence.canonicalProblemTitle ?? mergedEvidence.title,
    category: mergedEvidence.category,
    relatedKnowledgeId: mergedEvidence.id,
    rationale: cluster.knowledgeDraft.rationale,
    beforeState: target,
    afterState: {
      ...mergedEvidence,
      internalGuidance: cluster.knowledgeDraft.internalGuidance || mergedEvidence.internalGuidance,
      customerResponseTemplate: responseTemplate,
      approvedAnswer: responseTemplate,
      humanReviewCount: (mergedEvidence.humanReviewCount ?? 0) + 1,
      knowledgeVersions: [
        ...(mergedEvidence.knowledgeVersions ?? []),
        {
          versionId: `${mergedEvidence.canonicalProblemId}-v${versionNumber}`,
          version: versionNumber,
          createdAt: at,
          changeReason: `Validated bulk cluster introduced a stronger shared response across ${cluster.count} uploaded queries`,
          sourceTicketId: representative.ticket.id,
          summary: `v${versionNumber}: bulk cluster response refinement`
        }
      ]
    }
  };
}
