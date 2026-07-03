import type { SuggestedResponse } from "@/types";

interface SuggestedResponsePanelProps {
  response: SuggestedResponse;
}

function sourceLabel(response: SuggestedResponse): string {
  if (response.fallbackNotice) return response.fallbackNotice;
  if (response.source !== "ai_advisory") return response.source === "no_template" ? "No template available" : "Deterministic draft";
  if (response.draftMode === "lesson_grounded") {
    return `AI draft grounded in validated lesson: ${response.groundingLabel ?? "matched lesson"}`;
  }
  if (response.draftMode === "memory_grounded") return "AI draft grounded in organizational memory";
  if (response.draftMode === "cold_start") {
    return "AI suggestion - no organizational knowledge exists yet; review carefully";
  }
  return "AI-assisted advisory draft";
}

export function SuggestedResponsePanel({ response }: SuggestedResponsePanelProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-signal">
          OIP Engine draft
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-600">
          {sourceLabel(response)}
        </span>
      </div>
      <h2 className="mt-2 text-2xl font-bold text-ink">Draft ready for human review</h2>
      <p className="mt-2 text-slate-600">
        The OIP chose this draft from deterministic logic or an AI advisory suggestion. A human must review it before it is saved or sent.
      </p>

      <div className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm leading-7 text-slate-800">{response.draftResponse}</div>

      <div className="mt-5 rounded-2xl border border-purple-100 bg-purple-50 p-4 text-sm leading-6 text-purple-900">
        <strong>Confidence note:</strong> {response.confidenceNote}
      </div>

      {response.basedOnKnowledgeIds.length > 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          Based on knowledge: {response.basedOnKnowledgeIds.join(", ")}
        </p>
      ) : null}
    </section>
  );
}
