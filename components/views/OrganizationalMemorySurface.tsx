"use client";

import { useEffect, useMemo, useState } from "react";
import type { KnowledgeItem } from "@/types/knowledge";
import type {
  EvidenceRecordView,
  KnowledgeChallengeView,
  KnowledgeReuseOutcomeView,
  OrganizationalMemoryInspection,
  OrganizationalSourceView,
  PreparedOrganizationalLearning
} from "@/types/organizationalMemory";
import { formatLocalDateTimeInput, serializeLocalDateTimeInput } from "@/lib/eventTime";

interface OrganizationalMemorySurfaceProps {
  organizationId: string;
  knowledgeItems: KnowledgeItem[];
  darkMode: boolean;
  onRefresh: () => Promise<void>;
}

const sourceKinds = ["OPERATIONAL_EVENT", "INCIDENT", "DECISION", "PROCESS_LEARNING", "OTHER"];
const evidenceTypes = ["observation", "investigation", "system_result", "action_taken", "confirmation", "outcome", "reference"];

function randomKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function stableKey(prefix: string, parts: string[]): string {
  let hash = 2166136261;
  for (const character of parts.join("\u001f").trim().toLowerCase()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(16)}`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => null) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(payload?.error?.message ?? `Request failed (${response.status}).`);
  return payload?.data as T;
}

function cardClass(darkMode: boolean): string {
  return `rounded-2xl border p-5 ${darkMode ? "border-[#2d3f52] bg-[#1a2b3c]" : "border-slate-200 bg-white"}`;
}

function muted(darkMode: boolean): string {
  return darkMode ? "text-slate-400" : "text-slate-500";
}

function inputClass(darkMode: boolean): string {
  return `w-full rounded-xl border px-3 py-2 text-sm outline-none ${darkMode ? "border-[#2d3f52] bg-[#111827] text-white" : "border-slate-200 bg-white text-[#111827]"}`;
}

function labelClass(darkMode: boolean): string {
  return `mb-1 block text-xs font-semibold ${darkMode ? "text-slate-300" : "text-slate-600"}`;
}

function sourceLabel(source: OrganizationalSourceView | null): string {
  const metadata = source?.metadata;
  return metadata && typeof metadata.title === "string" ? metadata.title : source?.sourceObjectId ?? "Organizational experience";
}

function outcomeLabel(outcome: KnowledgeReuseOutcomeView): string {
  return outcome.classification === "SUCCESS" ? "Worked" : outcome.classification === "CORRECTION_REQUIRED" ? "Worked with correction" : "Did not work";
}

function reliabilityLabel(item: KnowledgeItem): string {
  const score = typeof item.trustScore === "number" ? item.trustScore : "—";
  return item.trustScore === 0 ? "Reliability 0/100 · human review required" : `Reliability ${score}/100`;
}

function automationLabel(item: KnowledgeItem): string {
  return item.autoResponseEligible ? "Automation eligible" : "Human review required";
}

function trustExplanation(item: KnowledgeItem): string {
  const score = typeof item.trustScore === "number" ? item.trustScore : "unknown";
  const failures = item.failedResolutions ?? 0;
  const successes = item.successfulResolutions ?? 0;
  if (item.governanceState === "challenged") return "This memory is challenged; automation is blocked until a human resolves the challenge.";
  if (item.trustScore === 0) return `Human validation is recorded, but reliability is ${score}/100 after ${failures} recorded failure${failures === 1 ? "" : "s"}. Human review is required before relying on this lesson.`;
  return `Human validation is recorded with ${successes} successful reuse${successes === 1 ? "" : "s"} and ${failures} correction/failure${failures === 1 ? "" : "s"}. Reliability is evidence-backed and remains separate from lifecycle and governance.`;
}

export function OrganizationalMemorySurface({ organizationId, knowledgeItems, darkMode, onRefresh }: OrganizationalMemorySurfaceProps) {
  const [entryOpen, setEntryOpen] = useState(false);
  const [source, setSource] = useState<OrganizationalSourceView | null>(null);
  const [sourceEvidence, setSourceEvidence] = useState<EvidenceRecordView[]>([]);
  const [prepared, setPrepared] = useState<PreparedOrganizationalLearning | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspection, setInspection] = useState<OrganizationalMemoryInspection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [sourceKind, setSourceKind] = useState("OPERATIONAL_EVENT");
  const [occurredAt, setOccurredAt] = useState(formatLocalDateTimeInput());
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [context, setContext] = useState("");
  const [evidenceType, setEvidenceType] = useState("observation");
  const [evidenceContent, setEvidenceContent] = useState("");
  const [validationRationale, setValidationRationale] = useState("");
  const [outcomeClass, setOutcomeClass] = useState<"SUCCESS" | "CORRECTION_REQUIRED" | "FAILURE">("SUCCESS");
  const [outcomeEvidence, setOutcomeEvidence] = useState("");
  const [outcomeSourceTitle, setOutcomeSourceTitle] = useState("");
  const [outcomeSourceObjectId, setOutcomeSourceObjectId] = useState("");
  const [requiredEdits, setRequiredEdits] = useState(false);
  const [challengeRationale, setChallengeRationale] = useState("");
  const [challengeEvidence, setChallengeEvidence] = useState("");
  const [reviewRationale, setReviewRationale] = useState("");
  const [reviewDisposition, setReviewDisposition] = useState<"REVALIDATED" | "SCOPE_UPDATED" | "DEPRECATED">("SCOPE_UPDATED");
  const [scopeNote, setScopeNote] = useState("");

  const selectedMemory = useMemo(() => knowledgeItems.find((item) => item.id === selectedId) ?? null, [knowledgeItems, selectedId]);

  useEffect(() => {
    void onRefresh();
    // The page hydrates the legacy knowledge view and this surface is also a
    // direct inspection entry point; refresh once on mount so a validated
    // memory committed immediately before navigation is visible here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  async function loadInspection(knowledgeId: string) {
    setBusy(true);
    setError("");
    try {
      setInspection(await requestJson<OrganizationalMemoryInspection>(`/api/organizations/${organizationId}/memory/knowledge/${knowledgeId}`));
      setSelectedId(knowledgeId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to inspect this memory.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshInspection() {
    if (!selectedId) return;
    await onRefresh();
    await loadInspection(selectedId);
  }

  async function createSource() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const nextSource = await requestJson<OrganizationalSourceView>(`/api/organizations/${organizationId}/memory/experiences`, {
        method: "POST",
        body: JSON.stringify({ title, sourceKind, occurredAt: serializeLocalDateTimeInput(occurredAt), description, location, context, idempotencyKey: randomKey("experience") })
      });
      setSource(nextSource);
      setSourceEvidence([]);
      setPrepared(null);
      setMessage("Organizational experience recorded. Add supporting evidence before preparing learning.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to record the organizational experience.");
    } finally {
      setBusy(false);
    }
  }

  async function addEvidence() {
    if (!source) return;
    setBusy(true);
    setError("");
    try {
      const evidence = await requestJson<EvidenceRecordView>(`/api/organizations/${organizationId}/memory/experiences/${source.id}/evidence`, {
        method: "POST",
        body: JSON.stringify({ evidenceType, content: evidenceContent, idempotencyKey: randomKey("evidence"), occurredAt: new Date().toISOString() })
      });
      setSourceEvidence((current) => current.some((item) => item.id === evidence.id) ? current : [...current, evidence]);
      setEvidenceContent("");
      setMessage("Evidence added to this Source.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to add evidence.");
    } finally {
      setBusy(false);
    }
  }

  async function prepareLearning() {
    if (!source) return;
    setBusy(true);
    setError("");
    try {
      const result = await requestJson<PreparedOrganizationalLearning>(`/api/organizations/${organizationId}/memory/experiences/${source.id}/prepare`, { method: "POST", body: "{}" });
      setPrepared(result);
      setValidationRationale("I reviewed the Source and Evidence and approve this reusable organizational lesson for this scope.");
      setMessage("Learning prepared for explicit human review. It is not trusted memory yet.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to prepare learning.");
    } finally {
      setBusy(false);
    }
  }

  async function validateLearning() {
    if (!source || !prepared) return;
    setBusy(true);
    setError("");
    try {
      const result = await requestJson<{ knowledgeItem: KnowledgeItem }>(`/api/organizations/${organizationId}/memory/experiences/${source.id}/validate`, {
        method: "POST",
        body: JSON.stringify({ candidateId: prepared.candidate.id, rationale: validationRationale, idempotencyKey: `validate:${prepared.candidate.id}` })
      });
      setPrepared(null);
      setEntryOpen(false);
      await onRefresh();
      await loadInspection(result.knowledgeItem.id);
      setMessage("Human validation committed. Organizational Memory is now inspectable.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Validation could not be committed.");
    } finally {
      setBusy(false);
    }
  }

  async function recordOutcome() {
    if (!inspection || !outcomeEvidence.trim() || !outcomeSourceTitle.trim() || !outcomeSourceObjectId.trim()) return;
    setBusy(true);
    setError("");
    try {
      const sourceObjectType = "reuse_event";
      const logicalParts = [
        organizationId,
        inspection.knowledgeItem.id,
        inspection.knowledgeItem.knowledgeVersions?.at(-1)?.versionId ?? "",
        "OPERATIONAL_EVENT",
        sourceObjectType,
        outcomeSourceObjectId,
        outcomeClass,
        requiredEdits ? "required-edits" : "no-required-edits",
        outcomeEvidence.trim()
      ];
      const logicalKey = stableKey("reuse-outcome", logicalParts);
      await requestJson(`/api/organizations/${organizationId}/memory/outcomes`, {
        method: "POST",
        body: JSON.stringify({
          knowledgeItemId: inspection.knowledgeItem.id,
          knowledgeVersionId: inspection.knowledgeItem.knowledgeVersions?.at(-1)?.versionId ?? null,
          expectedKnowledgeRevision: inspection.knowledgeItem.revision,
          classification: outcomeClass,
          requiredEdits,
          reuseMode: "human",
          idempotencyKey: logicalKey,
          source: { sourceKind: "OPERATIONAL_EVENT", sourceSystem: "oip.organizational_memory", sourceObjectType, sourceObjectId: outcomeSourceObjectId.trim(), metadata: { title: outcomeSourceTitle.trim() } },
          evidence: { evidenceType: "outcome", content: outcomeEvidence.trim(), evidenceRole: "reuse_outcome", idempotencyKey: `${logicalKey}:evidence` }
        })
      });
      setOutcomeEvidence("");
      setMessage("Reuse outcome recorded or replayed as the same durable logical event.");
      await refreshInspection();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Outcome could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  async function openChallenge() {
    if (!inspection) return;
    setBusy(true);
    setError("");
    try {
      await requestJson(`/api/organizations/${organizationId}/memory/challenges`, {
        method: "POST",
        body: JSON.stringify({
          knowledgeItemId: inspection.knowledgeItem.id,
          knowledgeVersionId: inspection.knowledgeItem.knowledgeVersions?.at(-1)?.versionId ?? null,
          expectedKnowledgeRevision: inspection.knowledgeItem.revision,
          rationale: challengeRationale,
          idempotencyKey: randomKey("challenge"),
          source: { sourceKind: "OPERATIONAL_EVENT", sourceSystem: "oip.organizational_memory", sourceObjectType: "challenge_event", sourceObjectId: randomKey("challenge-source") },
          evidence: { evidenceType: "outcome", content: challengeEvidence, evidenceRole: "challenge", idempotencyKey: randomKey("challenge-evidence") }
        })
      });
      setChallengeEvidence("");
      setChallengeRationale("");
      setMessage("Challenge opened. Automation authority is now fail-closed for this memory.");
      await refreshInspection();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Challenge could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  async function reviewChallenge(challenge: KnowledgeChallengeView) {
    if (!inspection) return;
    setBusy(true);
    setError("");
    try {
      await requestJson(`/api/organizations/${organizationId}/memory/challenges/${challenge.id}`, {
        method: "PATCH",
        body: JSON.stringify({ disposition: reviewDisposition, rationale: reviewRationale, expectedKnowledgeRevision: inspection.knowledgeItem.revision, ...(reviewDisposition === "SCOPE_UPDATED" ? { scopePatch: { scopeNote } } : {}) })
      });
      setReviewRationale("");
      setScopeNote("");
      setMessage(`Challenge reviewed as ${reviewDisposition}.`);
      await refreshInspection();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Challenge review could not be committed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className={`text-xs font-bold uppercase tracking-widest ${darkMode ? "text-blue-400" : "text-[#2563EB]"}`}>MEMORY CORE</span>
          <h2 className={`mt-1 text-2xl font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>Record organizational experience</h2>
          <p className={`mt-1 max-w-2xl text-sm ${muted(darkMode)}`}>Capture what happened and the evidence behind it. Learning remains pending until a human validates it.</p>
        </div>
        <button type="button" onClick={() => { setEntryOpen((value) => !value); setError(""); }} className="rounded-xl bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1d4ed8]">
          {entryOpen ? "Close entry" : "Add Organizational Experience"}
        </button>
      </div>

      {error && <div role="alert" className={`rounded-xl border px-4 py-3 text-sm ${darkMode ? "border-rose-700/50 bg-rose-900/20 text-rose-200" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{error}</div>}
      {message && <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${darkMode ? "border-emerald-700/50 bg-emerald-900/20 text-emerald-200" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{message}</div>}

      {entryOpen && (
        <div className={cardClass(darkMode)}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className={`text-xs font-bold uppercase tracking-wide ${darkMode ? "text-blue-400" : "text-[#2563EB]"}`}>Evidence-backed learning path</p>
              <p className={`mt-1 text-sm ${muted(darkMode)}`}>Source is the event. Evidence supports what happened. Neither is trusted memory by itself.</p>
            </div>
            {source && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${darkMode ? "bg-blue-900/40 text-blue-300" : "bg-blue-50 text-blue-700"}`}>{source.sourceKind}</span>}
          </div>

          {!source && (
            <div className="grid gap-4 md:grid-cols-2">
              <label><span className={labelClass(darkMode)}>Event title</span><input className={inputClass(darkMode)} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Warehouse scanner synchronization incident" /></label>
              <label><span className={labelClass(darkMode)}>Source type</span><select className={inputClass(darkMode)} value={sourceKind} onChange={(event) => setSourceKind(event.target.value)}>{sourceKinds.map((kind) => <option key={kind}>{kind}</option>)}</select></label>
              <label><span className={labelClass(darkMode)}>Occurred</span><input type="datetime-local" className={inputClass(darkMode)} value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></label>
              <label><span className={labelClass(darkMode)}>Location or context <span className="font-normal">(optional)</span></span><input className={inputClass(darkMode)} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Warehouse A" /></label>
              <label className="md:col-span-2"><span className={labelClass(darkMode)}>What happened</span><textarea className={`${inputClass(darkMode)} min-h-28`} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the organizational event without treating it as validated learning." /></label>
              <label className="md:col-span-2"><span className={labelClass(darkMode)}>Relevant context <span className="font-normal">(optional)</span></span><textarea className={`${inputClass(darkMode)} min-h-20`} value={context} onChange={(event) => setContext(event.target.value)} placeholder="Conditions, systems, or process context" /></label>
              <div className="md:col-span-2"><button type="button" disabled={busy} onClick={() => { void createSource(); }} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Record experience</button></div>
            </div>
          )}

          {source && (
            <div className="space-y-5">
              <div className={`rounded-xl border p-4 ${darkMode ? "border-[#2d3f52] bg-[#111827]" : "border-slate-200 bg-slate-50"}`}>
                <p className={`text-xs font-bold uppercase tracking-wide ${muted(darkMode)}`}>Source</p>
                <h3 className={`mt-1 text-lg font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>{sourceLabel(source)}</h3>
                <p className={`mt-1 text-sm ${muted(darkMode)}`}>{typeof source.metadata?.description === "string" ? source.metadata.description : "Organizational event"}</p>
                <p className={`mt-2 text-xs ${muted(darkMode)}`}>Occurred {source.occurredAt ? new Date(source.occurredAt).toLocaleString() : "unknown"} · Source identity retained separately from the lesson</p>
              </div>
              <div>
                <div className="flex items-center justify-between gap-3"><div><h3 className={`font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>Evidence</h3><p className={`text-xs ${muted(darkMode)}`}>What supports what we believe happened or learned.</p></div><span className={`text-xs font-semibold ${muted(darkMode)}`}>{sourceEvidence.length} item{sourceEvidence.length === 1 ? "" : "s"}</span></div>
                <div className="mt-3 space-y-2">{sourceEvidence.map((item) => <div key={item.id} className={`rounded-xl border p-3 ${darkMode ? "border-[#2d3f52] bg-[#111827]" : "border-slate-200 bg-white"}`}><div className="flex items-center justify-between gap-2"><span className={`text-xs font-semibold uppercase ${darkMode ? "text-blue-300" : "text-blue-700"}`}>{item.evidenceType.replaceAll("_", " ")}</span><span className={`text-[11px] ${muted(darkMode)}`}>{new Date(item.createdAt).toLocaleString()}</span></div><p className={`mt-1 text-sm ${darkMode ? "text-slate-200" : "text-slate-700"}`}>{item.content}</p></div>)}</div>
                <div className="mt-3 grid gap-2 md:grid-cols-[180px_1fr_auto]"><select className={inputClass(darkMode)} value={evidenceType} onChange={(event) => setEvidenceType(event.target.value)}>{evidenceTypes.map((type) => <option key={type}>{type}</option>)}</select><input className={inputClass(darkMode)} value={evidenceContent} onChange={(event) => setEvidenceContent(event.target.value)} placeholder="Add an observation, investigation finding, action, or confirmation" /><button type="button" disabled={busy || !evidenceContent.trim()} onClick={() => { void addEvidence(); }} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Add evidence</button></div>
              </div>
              <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={busy || sourceEvidence.length === 0} onClick={() => { void prepareLearning(); }} className="rounded-xl bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Prepare learning</button><span className={`text-xs ${muted(darkMode)}`}>Preparation is advisory; validation is a separate human action.</span></div>
              {prepared && <div className={`rounded-xl border p-4 ${darkMode ? "border-amber-700/50 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}><div className="flex flex-wrap items-center justify-between gap-2"><div><p className={`text-xs font-bold uppercase tracking-wide ${darkMode ? "text-amber-300" : "text-amber-700"}`}>Prepared for human validation</p><h3 className={`mt-1 font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>{prepared.candidate.proposedContent.canonicalProblemTitle}</h3></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${darkMode ? "bg-amber-900/40 text-amber-200" : "bg-white text-amber-800"}`}>Not trusted yet</span></div><p className={`mt-2 text-sm ${darkMode ? "text-slate-200" : "text-slate-700"}`}>{prepared.candidate.proposedContent.solution}</p><p className={`mt-2 text-xs ${muted(darkMode)}`}>{prepared.reflection.rationale}</p><label className="mt-4 block"><span className={labelClass(darkMode)}>Validation rationale</span><textarea className={`${inputClass(darkMode)} min-h-20`} value={validationRationale} onChange={(event) => setValidationRationale(event.target.value)} /></label><button type="button" disabled={busy || !validationRationale.trim()} onClick={() => { void validateLearning(); }} className="mt-3 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Validate learning</button></div>}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className={cardClass(darkMode)}>
          <div className="flex items-center justify-between gap-3"><div><h3 className={`font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>Organizational Memory</h3><p className={`mt-1 text-xs ${muted(darkMode)}`}>Validated lessons from Support or domain-neutral organizational events.</p></div><span className={`text-xs font-semibold ${muted(darkMode)}`}>{knowledgeItems.length} memor{knowledgeItems.length === 1 ? "y" : "ies"}</span></div>
          <div className="mt-4 space-y-2">{knowledgeItems.length === 0 && <p className={`rounded-xl border border-dashed p-4 text-sm ${muted(darkMode)}`}>No validated memory yet. Record an organizational experience or resolve a Support case.</p>}{knowledgeItems.map((item) => <button key={item.id} type="button" onClick={() => { void loadInspection(item.id); }} className={`block w-full rounded-xl border p-3 text-left transition-colors ${selectedId === item.id ? darkMode ? "border-blue-500 bg-blue-900/20" : "border-blue-300 bg-blue-50" : darkMode ? "border-[#2d3f52] hover:border-blue-500/50" : "border-slate-200 hover:border-blue-300"}`}><div className="flex items-start justify-between gap-3"><div><p className={`font-semibold ${darkMode ? "text-white" : "text-[#111827]"}`}>{item.canonicalProblemTitle ?? item.title}</p><p className={`mt-1 line-clamp-2 text-xs ${muted(darkMode)}`}>{item.problemSummary ?? item.problem}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${item.governanceState === "challenged" ? darkMode ? "bg-amber-900/40 text-amber-200" : "bg-amber-100 text-amber-800" : darkMode ? "bg-slate-800 text-slate-200" : "bg-slate-100 text-slate-700"}`}>{item.governanceState === "challenged" ? "Challenged · automation blocked" : reliabilityLabel(item)}</span></div><div className={`mt-2 flex flex-wrap gap-2 text-[11px] ${muted(darkMode)}`}><span>Lifecycle: {item.lifecycleState ?? "active"}</span><span>{automationLabel(item)}</span><span>v{item.knowledgeVersions?.length ?? 1}</span><span>{item.provenance?.validatedBy ? `Validated by ${item.provenance.validatedBy}` : "Validation recorded"}</span></div></button>)}</div>
        </div>

        <div className={cardClass(darkMode)}>
          {!inspection && <div className="flex min-h-52 items-center justify-center text-center"><div><p className={`text-sm font-semibold ${darkMode ? "text-white" : "text-[#111827]"}`}>Select a memory to inspect its trust story</p><p className={`mt-1 text-xs ${muted(darkMode)}`}>Source, Evidence, validation, Outcomes, Challenges, versions, and provenance appear here.</p></div></div>}
          {inspection && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-400">Memory detail</p>
                  <h3 className="mt-1 text-xl font-bold">{inspection.knowledgeItem.canonicalProblemTitle ?? inspection.knowledgeItem.title}</h3>
                  <p className={muted(darkMode)}>{inspection.knowledgeItem.problemSummary ?? inspection.knowledgeItem.problem}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                    {inspection.knowledgeItem.governanceState === "challenged" ? "Challenged · automation blocked" : reliabilityLabel(inspection.knowledgeItem)}
                  </span>
                  <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-200">Revision {inspection.knowledgeItem.revision ?? 1}</span>
                </div>
              </div>
              <div className="rounded-xl border border-[#2d3f52] bg-[#111827] p-4">
                <p className={muted(darkMode)}>Why trust this now</p>
                <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                  <p>Human validation: <strong>{inspection.knowledgeItem.provenance?.validatedBy ?? "recorded"}</strong></p>
                  <p>Reliability projection: <strong>{inspection.knowledgeItem.trustScore ?? "—"}/100</strong></p>
                  <p>Successful reuse: <strong>{inspection.knowledgeItem.successfulResolutions ?? 0}</strong></p>
                  <p>Corrections/failures: <strong>{inspection.knowledgeItem.failedResolutions ?? 0}</strong></p>
                  <p>Lifecycle: <strong>{inspection.knowledgeItem.lifecycleState ?? "active"}</strong></p>
                  <p>Governance: <strong>{inspection.knowledgeItem.governanceState === "challenged" ? "challenged" : "trusted"}</strong></p>
                  <p>Automation: <strong>{automationLabel(inspection.knowledgeItem)}</strong></p>
                  <p>Last validated: <strong>{inspection.knowledgeItem.lastValidated ?? inspection.knowledgeItem.approvedAt}</strong></p>
                </div>
                {inspection.knowledgeItem.scopeNote && <p className="mt-2 text-sm text-amber-200"><strong>Current scope:</strong> {inspection.knowledgeItem.scopeNote}</p>}
                <p className={`mt-2 text-xs ${muted(darkMode)}`}>{trustExplanation(inspection.knowledgeItem)}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className={muted(darkMode)}>Origin</p>
                  <div className="mt-2 rounded-xl border border-[#2d3f52] p-3 text-sm">
                    <p className="font-semibold">{sourceLabel(inspection.source)}</p>
                    <p className={`mt-1 text-xs ${muted(darkMode)}`}>{inspection.source?.sourceKind ?? "unknown source"} · {inspection.source?.sourceObjectType ?? "event"} · {inspection.source?.sourceObjectId ?? "identity unavailable"}</p>
                    <p className={`mt-1 text-xs ${muted(darkMode)}`}>{inspection.source?.occurredAt ? new Date(inspection.source.occurredAt).toLocaleString() : "timestamp unavailable"}</p>
                  </div>
                </div>
                <div>
                  <p className={muted(darkMode)}>Validation</p>
                  <div className="mt-2 rounded-xl border border-[#2d3f52] p-3 text-sm">
                    {inspection.history.validationRecords.map((record) => <div key={record.id}><p className="font-semibold">{record.decision} by {record.actor}</p><p className={`mt-1 text-xs ${muted(darkMode)}`}>{record.rationale} · {new Date(record.timestamp).toLocaleString()}</p></div>)}
                  </div>
                </div>
              </div>
              <div>
                <p className={muted(darkMode)}>Evidence</p>
                <div className="mt-2 space-y-2">
                  {inspection.evidence.length === 0 && <p className={muted(darkMode)}>No linked evidence found.</p>}
                  {inspection.evidence.map((link) => <div key={link.id} className="rounded-xl border border-[#2d3f52] p-3"><div className="flex justify-between gap-2"><span className="text-xs font-semibold uppercase text-blue-300">{link.relationship}</span><span className={muted(darkMode)}>{link.evidence.evidenceType}</span></div><p className="mt-1 text-sm">{link.evidence.content}</p></div>)}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between gap-3"><p className={muted(darkMode)}>Outcome history</p><span className={muted(darkMode)}>{inspection.outcomes.length} event{inspection.outcomes.length === 1 ? "" : "s"}</span></div>
                <div className="mt-2 space-y-2">
                  {inspection.outcomes.map((outcome) => <div key={outcome.id} className="rounded-xl border border-[#2d3f52] p-3">
                    <div className="flex justify-between gap-2"><span className="font-semibold">{outcomeLabel(outcome)}</span><span className={muted(darkMode)}>Trust {outcome.trustDelta == null ? "—" : outcome.trustDelta > 0 ? "+" + outcome.trustDelta : outcome.trustDelta}</span></div>
                    <p className="mt-1 text-sm"><strong>Source/work:</strong> {sourceLabel(outcome.source ?? null)} · {outcome.source?.sourceKind ?? "unknown"} · {outcome.source?.sourceObjectType ?? "event"} · {outcome.source?.sourceObjectId ?? "identity unavailable"}</p>
                    <p className="mt-1 text-sm"><strong>Evidence:</strong> {outcome.evidence?.content ?? "evidence unavailable"}</p>
                    <p className={muted(darkMode)}>{new Date(outcome.createdAt).toLocaleString()} · actor {outcome.actorId} · {outcome.classification} · trust effect {outcome.trustDelta == null ? "not recorded" : outcome.trustDelta > 0 ? "+" + outcome.trustDelta : outcome.trustDelta}</p>
                  </div>)}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between gap-3"><p className={muted(darkMode)}>Challenges and decisions</p><span className={muted(darkMode)}>{inspection.challenges.length}</span></div>
                <div className="mt-2 space-y-2">
                  {inspection.challenges.map((challenge) => <div key={challenge.id} className="rounded-xl border border-[#2d3f52] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{challenge.state}{challenge.disposition ? " · " + challenge.disposition : ""}</span><span className={muted(darkMode)}>{new Date(challenge.createdAt).toLocaleString()}</span></div>
                    <p className="mt-1 text-sm">{challenge.rationale}</p>
                    {challenge.state === "OPEN" && <div className="mt-3 grid gap-2 md:grid-cols-3"><select className={inputClass(darkMode)} value={reviewDisposition} onChange={(event) => setReviewDisposition(event.target.value as typeof reviewDisposition)}><option value="REVALIDATED">REVALIDATED</option><option value="SCOPE_UPDATED">SCOPE_UPDATED</option><option value="DEPRECATED">DEPRECATED</option></select><input className={inputClass(darkMode)} value={reviewRationale} onChange={(event) => setReviewRationale(event.target.value)} placeholder="Reviewer rationale" />{reviewDisposition === "SCOPE_UPDATED" && <input className={inputClass(darkMode)} value={scopeNote} onChange={(event) => setScopeNote(event.target.value)} placeholder="Narrowed scope note" />}<button type="button" disabled={busy || !reviewRationale.trim() || (reviewDisposition === "SCOPE_UPDATED" && !scopeNote.trim())} onClick={() => { void reviewChallenge(challenge); }} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Review challenge</button></div>}
                  </div>)}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-[#2d3f52] p-4">
                  <h4 className="font-semibold">Record reuse outcome</h4>
                  <label className={labelClass(darkMode)}>Source/work title or name<input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={outcomeSourceTitle} onChange={(event) => setOutcomeSourceTitle(event.target.value)} placeholder="Event B — warehouse scanning shift" /></label>
                  <label className={`mt-2 block ${labelClass(darkMode)}`}>Source/work identity<input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={outcomeSourceObjectId} onChange={(event) => setOutcomeSourceObjectId(event.target.value)} placeholder="event-b-warehouse-2026-08-24" /></label>
                  <p className={muted(darkMode)}>Type: OPERATIONAL_EVENT · reuse_event. Use a different identity for a genuinely separate event.</p>
                  <select className={`mt-3 ${inputClass(darkMode)}`} value={outcomeClass} onChange={(event) => setOutcomeClass(event.target.value as typeof outcomeClass)}><option value="SUCCESS">Worked</option><option value="CORRECTION_REQUIRED">Worked with correction</option><option value="FAILURE">Did not work</option></select>
                  <textarea className={`mt-2 ${inputClass(darkMode)} min-h-20`} value={outcomeEvidence} onChange={(event) => setOutcomeEvidence(event.target.value)} placeholder="What happened when this lesson was reused?" />
                  <label className={`mt-2 flex items-center gap-2 text-xs ${muted(darkMode)}`}><input type="checkbox" checked={requiredEdits} onChange={(event) => setRequiredEdits(event.target.checked)} /> Required correction/edit</label>
                  <button type="button" disabled={busy || !outcomeEvidence.trim() || !outcomeSourceTitle.trim() || !outcomeSourceObjectId.trim() || inspection.knowledgeItem.governanceState === "challenged"} onClick={() => { void recordOutcome(); }} className="mt-3 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Record outcome</button>
                </div>
                <div className="rounded-xl border border-[#2d3f52] p-4">
                  <h4 className="font-semibold">Challenge this memory</h4>
                  <textarea className={`mt-3 ${inputClass(darkMode)} min-h-20`} value={challengeRationale} onChange={(event) => setChallengeRationale(event.target.value)} placeholder="Why might this lesson need review?" />
                  <textarea className={`mt-2 ${inputClass(darkMode)} min-h-20`} value={challengeEvidence} onChange={(event) => setChallengeEvidence(event.target.value)} placeholder="Supporting evidence for the challenge" />
                  <button type="button" disabled={busy || !challengeRationale.trim() || !challengeEvidence.trim() || inspection.knowledgeItem.governanceState === "challenged"} onClick={() => { void openChallenge(); }} className="mt-3 rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Challenge memory</button>
                </div>
              </div>
              <div>
                <p className={muted(darkMode)}>Version and memory changes</p>
                <div className="mt-2 space-y-2">
                  {(inspection.knowledgeItem.knowledgeVersions ?? []).map((version) => <div key={version.versionId} className="rounded-xl border border-[#2d3f52] p-3 text-sm"><div className="flex justify-between gap-2"><span className="font-semibold">Version {version.version ?? "?"}</span><span className={muted(darkMode)}>{new Date(version.createdAt).toLocaleString()}</span></div><p className={muted(darkMode)}>{version.changeReason}</p></div>)}
                  {inspection.history.memoryChangeRecords.map((change) => <div key={change.id} className="rounded-xl border border-[#2d3f52] p-3 text-xs">Memory change: {change.changeType} · {new Date(change.timestamp).toLocaleString()}</div>)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
