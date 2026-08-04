import type { AIAdapter } from "@/lib/ai/types";
import { processTicket, type ProcessTicketResult, type TicketInput } from "@/lib/application/tickets/processTicket";
import type { OrganizationPersistenceSession } from "@/lib/persistence/session";
import type { ClaimedJob, DurableJobRecord, JobProgress, JobType } from "@/lib/application/jobs/types";

export interface JobHandlerContext {
  job: ClaimedJob["job"];
  persistence: OrganizationPersistenceSession;
  ai: AIAdapter;
  signal: AbortSignal;
  reportProgress(progress: Omit<JobProgress, "updatedAt">): Promise<void>;
}

export type JobHandler = (context: JobHandlerContext) => Promise<unknown>;

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
  return new JobHandlerRegistry().register("ticket.process", async ({ job, persistence, ai, signal, reportProgress }) => {
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
  });
}

export function unsupportedJobHandlerMessage(type: JobType): string {
  return `${type} is not enabled in the first durable worker rollout.`;
}
