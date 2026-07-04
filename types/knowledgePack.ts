import type { Lesson } from "./knowledge";

export interface PackLesson {
  title: string;
  rootCause: string;
  solution: string;
  customerResponse: string;
  signals: string[];
  whenToEscalate: string;
  doNotPromise: string[];
}

export interface KnowledgePack {
  packId: string;
  packName: string;
  description: string;
  language: string;
  canonicalProblem: {
    title: string;
    category: string;
    description: string;
  };
  lessons: PackLesson[];
  version: string;
  author: string;
}

export interface KnowledgePackPreview {
  pack: KnowledgePack;
  categoryWarning: string | null;
}

export interface KnowledgePackCandidateDraft {
  canonicalProblemTitle: string;
  category: string;
  problemSummary: string;
  internalGuidance: string;
  customerResponseTemplate: string;
  lessons: Lesson[];
}
