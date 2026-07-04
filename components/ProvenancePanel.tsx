import type { KnowledgeMatch, SuggestedResponse, Ticket } from "@/types";
import { findMatchingLesson } from "@/lib/drafting";

interface ProvenancePanelProps {
  topMatch: KnowledgeMatch | null;
  isColdStart: boolean;
  ticket?: Ticket | null;
  isUncategorized?: boolean;
  response?: SuggestedResponse | null;
}

function responseGroundingCopy(response?: SuggestedResponse | null): { title: string; body: string } | null {
  if (!response) return null;

  if (response.fallbackNotice) {
    return {
      title: response.fallbackNotice,
      body:
        response.source === "no_template"
          ? "No validated organizational knowledge was available, so OIP kept the cold-start authoring placeholder for human review."
          : "OIP kept the deterministic fallback because the AI advisory was unavailable or unusable."
    };
  }

  if (response.source !== "ai_advisory") return null;

  if (response.draftMode === "lesson_grounded") {
    return {
      title: `AI draft grounded in validated lesson: ${response.groundingLabel ?? "matched lesson"}`,
      body:
        "Gemma adapted the matched lesson's approved customer response to this customer's wording. Human review remains required before sending or learning."
    };
  }

  if (response.draftMode === "memory_grounded") {
    return {
      title: "AI draft grounded in organizational memory",
      body:
        "Gemma personalized the validated customer response template from organizational memory. The raw template remains available for comparison in human review."
    };
  }

  if (response.draftMode === "cold_start") {
    return {
      title: "AI suggestion - no organizational knowledge exists yet",
      body:
        "This draft is not based on validated memory. It is a first-response suggestion from the ticket alone and must be reviewed carefully before sending."
    };
  }

  return null;
}

export function ProvenancePanel({ topMatch, isColdStart, ticket, isUncategorized = false, response }: ProvenancePanelProps) {
  const lessonMatch = topMatch && ticket ? findMatchingLesson(ticket, topMatch.item) : null;
  const groundingCopy = responseGroundingCopy(response);

  if (groundingCopy) {
    return (
      <section className="rounded-3xl border border-amber-200 bg-amber-50/60 p-5 shadow-soft">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Why this response?</p>
        <p className="mt-2 font-semibold text-ink">{groundingCopy.title}</p>
        <p className="mt-1 text-sm leading-6 text-slate-700">{groundingCopy.body}</p>
      </section>
    );
  }

  if (isUncategorized || isColdStart || !topMatch) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Why this response?</p>
        <p className="mt-2 font-semibold text-ink">{isUncategorized ? "No template available" : "No approved knowledge available yet"}</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          {isUncategorized
            ? "This issue type has not been seen before. Your response will become the organization's first knowledge for this problem type."
            : "This response was drafted from the category template - a safe starting point. Once a resolution is approved and reflected upon, the organization will have its first knowledge entry for this problem type and future drafts will draw from real approved experience."}
        </p>
      </section>
    );
  }

  const item = topMatch.item;
  const versions = item.knowledgeVersions ?? [];
  const versionCount = versions.length || 1;
  const latestVersion = versions[versions.length - 1];
  const exampleTickets = item.exampleTickets ?? [];
  const lastUpdated = item.lastUpdated ?? item.lastValidated ?? item.approvedAt ?? item.createdAt;

  return (
    <section className="rounded-3xl border border-blue-100 bg-blue-50/40 p-5 shadow-soft">
      <p className="text-xs font-bold uppercase tracking-wide text-memory">Why this response?</p>
      <p className="mt-1.5 font-semibold text-ink">
        {lessonMatch ? "Lesson-informed draft" : "Based on approved organizational knowledge"}
      </p>
      <p className="mt-1 text-sm text-slate-600">
        {lessonMatch
          ? `OIP matched this ticket to a learned lesson: "${lessonMatch.lesson.title ?? lessonMatch.lesson.rootCause}" (matched signals: ${lessonMatch.matchedSignals.join(", ")}). The response below uses this lesson's specific guidance.`
          : "OIP matched this ticket to an approved knowledge entry and used it to draft the response below."}
      </p>

      {lessonMatch && (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 11.5V14h2.5l7.37-7.37-2.5-2.5L2 11.5zM13.77 4.63a.664.664 0 000-.94l-1.56-1.56a.664.664 0 00-.94 0l-1.22 1.22 2.5 2.5 1.22-1.22z" fill="#d97706" />
            </svg>
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Matched Lesson</p>
          </div>
          <p className="mt-1.5 text-sm font-semibold text-amber-900">{lessonMatch.lesson.title ?? lessonMatch.lesson.rootCause}</p>
          <p className="mt-0.5 text-xs text-amber-800">{lessonMatch.lesson.solution}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {lessonMatch.lesson.signals.map((signal) => (
              <span
                key={signal}
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  lessonMatch.matchedSignals.includes(signal)
                    ? "bg-amber-200 text-amber-900 ring-1 ring-amber-400"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {signal}
                {lessonMatch.matchedSignals.includes(signal) ? " ✓" : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-blue-100 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Knowledge Used</p>
          <p className="mt-1 text-sm font-semibold leading-snug text-ink">{item.canonicalProblemTitle ?? item.title}</p>
          <p className="mt-0.5 font-mono text-xs text-slate-400">{item.id.slice(0, 26)}...</p>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Match &amp; Trust</p>
          <p className="mt-1 text-sm font-semibold text-ink">{topMatch.matchScore}% match</p>
          <p className="mt-0.5 text-xs text-slate-500">Trust: {item.trustScore ?? 20}/100</p>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Version</p>
          <p className="mt-1 text-sm font-semibold text-ink">v{versionCount}</p>
          <p className="mt-0.5 text-xs leading-snug text-slate-500">{latestVersion?.changeReason ?? "Initial version"}</p>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Last Updated</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {lastUpdated ? new Date(lastUpdated).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "-"}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{item.timesSeen ?? 1} ticket{(item.timesSeen ?? 1) !== 1 ? "s" : ""} seen</p>
        </div>
      </div>

      {exampleTickets.length > 0 && (
        <div className="mt-3 rounded-2xl border border-blue-100 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Supporting Tickets ({exampleTickets.length})</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {exampleTickets.slice(0, 6).map((example) => (
              <span key={example.ticketId} className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-0.5 font-mono text-xs text-blue-700">
                {example.ticketId.length > 20 ? example.ticketId.slice(-20) : example.ticketId}
              </span>
            ))}
            {exampleTickets.length > 6 && (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500">+{exampleTickets.length - 6} more</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
