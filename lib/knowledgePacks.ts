import type {
  KnowledgeCandidate,
  KnowledgeCandidateContent,
  KnowledgeItem,
  KnowledgePack,
  KnowledgePackCandidateDraft,
  KnowledgePackPreview,
  Lesson,
  OrganizationProfile,
  Ticket,
  Understanding
} from "@/types";
import { isRecognizedClassifierCategory } from "@/lib/analyzer";
import { createCanonicalProblem, normalizeReusableLessonTemplate } from "@/lib/canonicalProblemEngine";

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Knowledge pack is missing ${label}.`);
  }
  return value.trim();
}

function assertStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error(`Knowledge pack has an invalid ${label} list.`);
  }
  return value.map((item) => item.trim());
}

function makeLessonId(packId: string, title: string, index: number): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `lesson-${packId}-${slug || index + 1}`;
}

function inferPackTags(pack: KnowledgePack): string[] {
  const titleTokens = `${pack.canonicalProblem.title} ${pack.canonicalProblem.category}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
  const signalTokens = pack.lessons
    .flatMap((lesson) => lesson.signals)
    .flatMap((signal) => signal.toLowerCase().split(/[^a-z0-9]+/))
    .filter((token) => token.length > 2);

  return [...new Set([...titleTokens, ...signalTokens])].slice(0, 14);
}

function buildPackSourceLabel(packId: string): string {
  return `knowledge_pack: ${packId}`;
}

export function parseKnowledgePack(raw: unknown): KnowledgePack {
  if (!raw || typeof raw !== "object") {
    throw new Error("Knowledge pack file must be a JSON object.");
  }

  const pack = raw as Record<string, unknown>;
  const canonicalProblem = pack.canonicalProblem as Record<string, unknown> | undefined;
  const lessonsRaw = pack.lessons;

  if (!canonicalProblem || typeof canonicalProblem !== "object") {
    throw new Error("Knowledge pack is missing canonicalProblem.");
  }

  if (!Array.isArray(lessonsRaw) || lessonsRaw.length === 0) {
    throw new Error("Knowledge pack must contain at least one lesson.");
  }

  return {
    packId: assertString(pack.packId, "packId"),
    packName: assertString(pack.packName, "packName"),
    description: assertString(pack.description, "description"),
    language: assertString(pack.language, "language"),
    canonicalProblem: {
      title: assertString(canonicalProblem.title, "canonicalProblem.title"),
      category: assertString(canonicalProblem.category, "canonicalProblem.category"),
      description: assertString(canonicalProblem.description, "canonicalProblem.description")
    },
    lessons: lessonsRaw.map((lessonRaw, index) => {
      if (!lessonRaw || typeof lessonRaw !== "object") {
        throw new Error(`Knowledge pack lesson ${index + 1} is invalid.`);
      }
      const lesson = lessonRaw as Record<string, unknown>;
      return {
        title: assertString(lesson.title, `lessons[${index}].title`),
        rootCause: assertString(lesson.rootCause, `lessons[${index}].rootCause`),
        solution: assertString(lesson.solution, `lessons[${index}].solution`),
        customerResponse: assertString(lesson.customerResponse, `lessons[${index}].customerResponse`),
        signals: assertStringArray(lesson.signals, `lessons[${index}].signals`),
        whenToEscalate: assertString(lesson.whenToEscalate, `lessons[${index}].whenToEscalate`),
        doNotPromise: assertStringArray(lesson.doNotPromise, `lessons[${index}].doNotPromise`)
      };
    }),
    version: assertString(pack.version, "version"),
    author: assertString(pack.author, "author")
  };
}

export function parseKnowledgePackText(text: string): KnowledgePackPreview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Knowledge pack file is not valid JSON.");
  }

  const pack = parseKnowledgePack(parsed);
  return {
    pack,
    categoryWarning: getKnowledgePackCategoryWarning(pack)
  };
}

export function getKnowledgePackCategoryWarning(pack: KnowledgePack): string | null {
  if (isRecognizedClassifierCategory(pack.canonicalProblem.category)) {
    return null;
  }
  return `Category "${pack.canonicalProblem.category}" is not recognized by the classifier - tickets will reach this knowledge via lesson signals and LLM fallback classification only.`;
}

export function buildPackLessons(pack: KnowledgePack, createdAt: string): Lesson[] {
  const sourceTicketId = buildPackSourceLabel(pack.packId);
  return pack.lessons.map((lesson, index) => ({
    id: makeLessonId(pack.packId, lesson.title, index),
    title: lesson.title,
    rootCause: lesson.rootCause,
    solution: lesson.solution,
    customerResponse: normalizeReusableLessonTemplate(lesson.customerResponse),
    signals: [...lesson.signals],
    whenToEscalate: lesson.whenToEscalate,
    doNotPromise: [...lesson.doNotPromise],
    createdAt,
    sourceTicketId
  }));
}

export function buildPackCandidateContent(
  pack: KnowledgePack,
  createdAt: string,
  customerResponseTemplate: string,
  internalGuidance: string
): KnowledgeCandidateContent {
  return {
    solution: pack.canonicalProblem.description,
    customerResponseTemplate,
    internalGuidance,
    canonicalProblemTitle: pack.canonicalProblem.title,
    category: pack.canonicalProblem.category,
    lessons: buildPackLessons(pack, createdAt),
    importMetadata: {
      sourceType: "knowledge_pack",
      sourceLabel: buildPackSourceLabel(pack.packId),
      packId: pack.packId,
      packName: pack.packName,
      packVersion: pack.version,
      packAuthor: pack.author,
      packLanguage: pack.language,
      packDescription: pack.description
    }
  };
}

export function candidateToPackDraft(candidate: KnowledgeCandidate): KnowledgePackCandidateDraft | null {
  const content = candidate.proposedContent;
  if (content.importMetadata?.sourceType !== "knowledge_pack" || !content.lessons?.length) {
    return null;
  }

  return {
    canonicalProblemTitle: content.canonicalProblemTitle ?? "",
    category: content.category ?? "",
    problemSummary: content.solution,
    internalGuidance: content.internalGuidance,
    customerResponseTemplate: content.customerResponseTemplate,
      lessons: content.lessons.map((lesson) => ({
        ...lesson,
        title: lesson.title,
        signals: [...lesson.signals],
        doNotPromise: lesson.doNotPromise ? [...lesson.doNotPromise] : []
      }))
  };
}

export function buildKnowledgeItemFromPackCandidate(
  candidate: KnowledgeCandidate,
  draft: KnowledgePackCandidateDraft,
  organizationProfile: OrganizationProfile,
  createdAt: string
): KnowledgeItem {
  const normalizedLessons = draft.lessons.map((lesson) => ({
    ...lesson,
    customerResponse: normalizeReusableLessonTemplate(lesson.customerResponse)
  }));
  const sourceLabel = candidate.proposedContent.importMetadata?.sourceLabel ?? candidate.sourceTicketIds[0] ?? "knowledge_pack:unknown";
  const signalTags = normalizedLessons
    .flatMap((lesson) => lesson.signals)
    .flatMap((signal) => signal.toLowerCase().split(/[^a-z0-9]+/))
    .filter((token) => token.length > 2);
  const tags = [...new Set([...inferPackTags({
    packId: candidate.proposedContent.importMetadata?.packId ?? "unknown",
    packName: candidate.proposedContent.importMetadata?.packName ?? draft.canonicalProblemTitle,
    description: candidate.proposedContent.importMetadata?.packDescription ?? draft.problemSummary,
    language: candidate.proposedContent.importMetadata?.packLanguage ?? "en",
    canonicalProblem: {
      title: draft.canonicalProblemTitle,
      category: draft.category,
      description: draft.problemSummary
    },
    lessons: normalizedLessons.map((lesson) => ({
      title: lesson.rootCause,
      rootCause: lesson.rootCause,
      solution: lesson.solution,
      customerResponse: lesson.customerResponse,
      signals: lesson.signals,
      whenToEscalate: lesson.whenToEscalate ?? "",
      doNotPromise: lesson.doNotPromise ?? []
    })),
    version: candidate.proposedContent.importMetadata?.packVersion ?? "v1",
    author: candidate.proposedContent.importMetadata?.packAuthor ?? organizationProfile.name
  }), ...signalTags])];
  const syntheticTicket: Ticket = {
    id: sourceLabel,
    ticketId: sourceLabel,
    customerName: candidate.proposedContent.importMetadata?.packName ?? "Knowledge Pack",
    subject: draft.canonicalProblemTitle,
    description: draft.problemSummary,
    category: draft.category,
    status: "new",
    createdAt
  };
  const syntheticUnderstanding: Understanding = {
    ticketId: sourceLabel,
    summary: draft.problemSummary,
    coreProblem: draft.problemSummary,
    category: draft.category,
    intent: "knowledge_pack_import",
    urgency: "medium",
    tags,
    detectedSignals: draft.lessons.flatMap((lesson) => lesson.signals),
    extractedFields: {
      senderName: null,
      senderRole: null,
      companyName: null,
      deadline: null,
      subIssues: [],
      urgencyIndicators: []
    }
  };

  const created = createCanonicalProblem(
    syntheticTicket,
    syntheticUnderstanding,
    draft.customerResponseTemplate,
    organizationProfile,
    createdAt,
    {
      title: draft.canonicalProblemTitle,
      category: draft.category,
      problemSummary: draft.problemSummary,
      tags
    }
  );

  return {
    ...created,
    sourceTicketId: sourceLabel,
    problem: draft.problemSummary,
    problemSummary: draft.problemSummary,
    internalGuidance: draft.internalGuidance,
    customerResponseTemplate: draft.customerResponseTemplate,
    approvedAnswer: draft.customerResponseTemplate,
    lessons: normalizedLessons,
    exampleTickets: [
      {
        ticketId: sourceLabel,
        customerName: candidate.proposedContent.importMetadata?.packName ?? "Knowledge Pack",
        originalIssue: candidate.proposedContent.importMetadata?.packDescription ?? draft.problemSummary,
        createdAt,
        resolutionMode: "human"
      }
    ],
    knowledgeVersions: [
      {
        versionId: `${created.canonicalProblemId}-v1`,
        version: 1,
        createdAt,
        changeReason: `Validated starter knowledge pack import (${candidate.proposedContent.importMetadata?.packId ?? "unknown"})`,
        sourceTicketId: sourceLabel,
        summary: "Initial version created from a starter knowledge pack"
      }
    ],
    learningHistory: [
      {
        id: `${created.canonicalProblemId}-history-pack-import`,
        event: "Starter knowledge pack validated",
        detail: `${candidate.proposedContent.importMetadata?.packName ?? draft.canonicalProblemTitle} imported with ${normalizedLessons.length} approved lessons.`,
        createdAt
      }
    ]
  };
}
