import type { AIAdapter } from "@/lib/ai/types";
import { analyzeBulkEntries } from "@/lib/bulkUpload";
import { processTicket, type ProcessTicketResult, type TicketInput } from "@/lib/application/tickets/processTicket";
import type { OrganizationPersistenceSession } from "@/lib/persistence/session";
import type { ClaimedJob, JobProgress, JobType } from "@/lib/application/jobs/types";
import type { BulkAnalysisResult, BulkUploadEntry, TicketRecord } from "@/types";
import { detectLanguage, isSupportedLanguage } from "@/lib/languageDetection";
import { resolveLanguagePolicy, resolveResponseLanguage } from "@/lib/languagePolicy";
import { generateReflectionCommand, validateReflectionCommand } from "@/lib/application/learning/reflectionCommands";
import { preparedReflectionStore } from "@/lib/server/jobs/preparedReflectionStore";
import type { ReflectionDecision, Ticket } from "@/types";

export interface JobHandlerContext {
  job: ClaimedJob["job"];
  actor: { id?: string; name?: string; email?: string };
  persistence: OrganizationPersistenceSession;
  ai: AIAdapter;
  signal: AbortSignal;
  reportProgress(progress: Omit<JobProgress, "updatedAt">): Promise<void>;
}

export type JobHandler = (context: JobHandlerContext) => Promise<unknown>;

export interface BulkJobResult {
  uploadKey: string;
  preparedCount: number;
  analysis: BulkAnalysisResult;
}

function asTicketInput(value: unknown): TicketInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The ticket job input is invalid.");
  const input = value as Record<string, unknown>;
  if (typeof input.description !== "string" || !input.description.trim()) throw new Error("A ticket description is required.");
  return {
    description: input.description.trim(),
    ...(typeof input.subject === "string" ? { subject: input.subject.trim() } : {}),
    ...(typeof input.customerName === "string" ? { customerName: input.customerName.trim() } : {}),
    ...(input.sender && typeof input.sender === "object" && !Array.isArray(input.sender) ? { sender: input.sender as TicketInput["sender"] } : {}),
    ...(typeof input.source === "string" ? { source: input.source.trim() } : {}),
    ...(typeof input.externalReference === "string" ? { externalReference: input.externalReference.trim() } : {}),
    intakeMode: "single",
    ...(typeof input.createdAt === "string" ? { createdAt: input.createdAt } : {})
  };
}

function ticketProgress(stage: string, message?: string): Omit<JobProgress, "updatedAt"> {
  const stages = ["received", "persisted", "analyzing", "retrieved", "drafted", "in_review"];
  const index = Math.max(0, stages.indexOf(stage));
  return { stage, completed: index, total: stages.length, percent: Math.round((index / stages.length) * 100), message };
}

export class JobHandlerRegistry {
  private readonly handlers = new Map<JobType, JobHandler>();
  register(type: JobType, handler: JobHandler): this { this.handlers.set(type, handler); return this; }
  get(type: JobType): JobHandler | undefined { return this.handlers.get(type); }
  supportedTypes(): JobType[] { return [...this.handlers.keys()]; }
}

export function createDefaultJobHandlerRegistry(): JobHandlerRegistry {
  return new JobHandlerRegistry()
  .register("ticket.process", async ({ job, persistence, ai, signal, reportProgress }) => {
    const profile = await persistence.loadOrganizationProfile();
    const knowledgeItems = await persistence.loadKnowledge();
    const ticketInput = asTicketInput(job.input.ticketInput);
    await reportProgress(ticketProgress("received", "Ticket job accepted by worker"));
    const result = await processTicket({
      organizationId: job.organizationId,
      actorContext: job.actorId ? { id: job.actorId } : {},
      authority: job.authority,
      requestId: job.requestId,
      idempotencyKey: job.idempotencyKey,
      ticketInput,
      organizationProfile: profile,
      processingOptions: { knowledgeItems, aiAdapter: ai },
      signal
    }, {
      persistence,
      ai,
      onEvent: (event) => {
        const stage = event.name.toLowerCase().includes("received") ? "persisted" : event.name.toLowerCase().includes("draft") ? "drafted" : "analyzing";
        void reportProgress(ticketProgress(stage, event.detail ?? event.name));
      }
    });
    await reportProgress(ticketProgress("in_review", "Ticket is ready for review"));
    return result satisfies ProcessTicketResult;
  })
  .register("bulk.analyze", async ({ job, persistence, ai, signal, reportProgress }) => {
    const input = job.input as { uploadKey?: unknown; entries?: unknown };
    const uploadKey = typeof input.uploadKey === "string" ? input.uploadKey.trim() : "";
    const entries = Array.isArray(input.entries) ? input.entries as BulkUploadEntry[] : [];
    if (!uploadKey || entries.length === 0 || entries.length > 1000 || entries.some((entry) => !entry || typeof entry.id !== "string" || typeof entry.message !== "string" || !entry.message.trim())) {
      throw new Error("The durable bulk job input is invalid.");
    }
    if (new Set(entries.map((entry) => entry.id)).size !== entries.length) throw new Error("Bulk entry IDs must be unique.");
    const profile = await persistence.loadOrganizationProfile();
    const knowledgeItems = await persistence.loadKnowledge();
    await reportProgress({ stage: "preparing", completed: 0, total: entries.length, percent: 0, message: `Preparing ${entries.length} uploaded rows` });
    const prepared = await persistence.prepareBulkTicketRecords(profile, entries.map((entry) => ({ uploadKey, entryId: entry.id, rawMessage: entry.message, subject: entry.message.length > 80 ? `${entry.message.slice(0, 80)}…` : entry.message })));
    if (prepared.length !== entries.length) throw new Error(`Durable bulk preparation returned ${prepared.length} rows for ${entries.length} entries.`);
    let progressChain = Promise.resolve();
    const analysis = await analyzeBulkEntries({
      entries,
      organizationProfile: profile,
      knowledgeItems,
      aiAdapter: ai,
      signal,
      onProgress: (progress) => {
        const phase = progress.phase === "clustering" ? "clustering" : "analyzing";
        progressChain = progressChain.then(() => reportProgress({
          stage: phase,
          completed: progress.completed,
          total: progress.total,
          percent: progress.percent,
          message: `${phase} ${progress.completed}/${progress.total}`
        }));
      }
    });
    await progressChain;
    await reportProgress({ stage: "finalizing", completed: entries.length, total: entries.length, percent: 99, message: "Persisting bulk analysis" });
    const byEntry = new Map<string, { item: BulkAnalysisResult["clusters"][number]["items"][number]; clusterId: string }>();
    for (const cluster of analysis.clusters) for (const item of cluster.items) byEntry.set(item.entry.id, { item, clusterId: cluster.id });
    for (const item of analysis.unclustered.items) byEntry.set(item.entry.id, { item, clusterId: analysis.unclustered.id });
    const preparedByEntry = new Map(prepared.map((record) => [record.bulkEntryId, record]));
    const policy = resolveLanguagePolicy(profile);
    const updates: TicketRecord[] = entries.map((entry) => {
      const analyzed = byEntry.get(entry.id);
      const record = preparedByEntry.get(entry.id);
      if (!analyzed || !record) throw new Error(`Bulk analysis did not produce a durable row for ${entry.id}.`);
      const detection = detectLanguage(entry.message, { defaultLanguage: isSupportedLanguage(policy.organizationLanguage) ? policy.organizationLanguage : undefined });
      const responseLanguage = resolveResponseLanguage(policy, detection);
      return {
        ...record,
        bulkClusterId: analyzed.clusterId,
        status: "in_review",
        classification: {
          category: analyzed.item.understanding.category,
          intent: analyzed.item.understanding.intent ?? "unspecified",
          canonicalProblem: analyzed.item.canonicalProblem.title,
          classifiedBy: "deterministic",
          confidence: analyzed.item.confidence,
          inquiryType: analyzed.item.understanding.businessClassification?.inquiryType,
          businessIntent: analyzed.item.understanding.businessClassification?.intent,
          language: { detected: detection.language, confidence: detection.confidence, method: detection.method, responseLanguage: responseLanguage.language }
        },
        memoryMatch: analyzed.item.existingMatch ? { knowledgeId: analyzed.item.existingMatch.item.id, matchType: analyzed.item.retrievedLessonId ? "lesson" : "template", lessonId: analyzed.item.retrievedLessonId ?? null, retrievalAudit: analyzed.item.retrievalAudit } : { knowledgeId: null, matchType: "none", lessonId: null, retrievalAudit: analyzed.item.retrievalAudit }
      };
    });
    await persistence.saveTicketRecords(updates);
    await reportProgress({ stage: "succeeded", completed: entries.length, total: entries.length, percent: 100, message: "Bulk analysis complete" });
    return { uploadKey, preparedCount: prepared.length, analysis } satisfies BulkJobResult;
  })
  .register("reflection.generate", async ({ job, actor, persistence, signal, reportProgress }) => {
    if (signal.aborted) throw new Error("Reflection generation was cancelled.");
    const input = job.input as {
      ticket?: unknown;
      understanding?: unknown;
      reviewedResponse?: unknown;
      existingMatch?: unknown;
      selectedDraft?: unknown;
      languageContext?: unknown;
    };
    if (!input.ticket || typeof input.ticket !== "object" || !input.understanding || typeof input.understanding !== "object" || typeof input.reviewedResponse !== "string" || !input.reviewedResponse.trim()) {
      throw new Error("The reflection job input is invalid.");
    }
    const ticket = input.ticket as Ticket;
    const records = await persistence.loadTicketRecords();
    const ticketId = ticket.ticketId ?? ticket.id;
    if (!records.some((record) => record.ticketId === ticketId)) throw new Error("The reflection ticket is not present in the organization scope.");
    const profile = await persistence.loadOrganizationProfile();
    const knowledgeItems = await persistence.loadKnowledge();
    const rawMatch = input.existingMatch && typeof input.existingMatch === "object" ? input.existingMatch as { item?: { id?: unknown }; similarity?: unknown; reason?: unknown } : null;
    const existingMatch = rawMatch?.item?.id
      ? { ...rawMatch, item: knowledgeItems.find((item) => item.id === rawMatch.item?.id) } as any
      : null;
    if (rawMatch?.item?.id && !existingMatch?.item) throw new Error("The reflection memory match is not present in the organization scope.");
    await reportProgress({ stage: "generating", completed: 1, total: 4, percent: 25, message: "Generating prepared reflection" });
    const generated = generateReflectionCommand({
      organizationId: job.organizationId,
      actor: { id: actor.id ?? job.actorId ?? "durable-worker", name: actor.name ?? "Durable Worker", email: actor.email },
      authority: job.authority,
      requestId: job.requestId,
      organizationProfile: profile,
      ticket,
      understanding: input.understanding as any,
      reviewedResponse: input.reviewedResponse,
      existingMatch,
      selectedDraft: input.selectedDraft as any,
      languageContext: input.languageContext as any
    });
    if (signal.aborted) throw new Error("Reflection generation was cancelled.");
    await reportProgress({ stage: "validating", completed: 2, total: 4, percent: 50, message: "Validating reflection safety boundary" });
    const validation = validateReflectionCommand({
      organizationId: job.organizationId,
      actor: { id: actor.id ?? job.actorId ?? "durable-worker", name: actor.name ?? "Durable Worker", email: actor.email },
      authority: job.authority,
      requestId: job.requestId,
      reflection: generated.reflection,
      safetyContext: { customerName: ticket.customerName, organizationName: profile.name, sourceTicketId: ticketId, sourceTicketText: `${ticket.subject} ${ticket.description}` }
    });
    if (!validation.accepted) throw new Error(`Reflection validation rejected: ${validation.reasons.join(", ")}.`);
    await reportProgress({ stage: "persisting", completed: 3, total: 4, percent: 75, message: "Persisting prepared reflection for human review" });
    const saved = await preparedReflectionStore.save({
      context: persistence.context,
      jobId: job.id,
      ticketId,
      inputDigest: job.inputDigest,
      idempotencyKey: job.idempotencyKey,
      ticket,
      understanding: input.understanding,
      reviewedResponse: input.reviewedResponse,
      reflection: generated.reflection,
      warnings: validation.warnings,
      reasons: validation.reasons,
      generationMetadata: { source: generated.diagnostics.source, organizationId: job.organizationId, requestId: job.requestId, correlationId: job.correlationId, status: "prepared", promotionRequired: true }
    });
    await reportProgress({ stage: "prepared", completed: 4, total: 4, percent: 100, message: "Prepared reflection is ready for human review" });
    return { preparedReflection: saved.record, replayed: saved.replayed, reflection: generated.reflection as ReflectionDecision, validation: { accepted: validation.accepted, warnings: validation.warnings, reasons: validation.reasons }, promotionRequired: true };
  });
}

export function unsupportedJobHandlerMessage(type: JobType): string {
  return `${type} is not enabled in the first durable worker rollout.`;
}
