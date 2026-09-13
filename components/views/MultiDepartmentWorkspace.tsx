"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AskResult, ExecutionPackage, ExecutionSession, OrganizationalSkill, OrganizationDomain, SkillCompositionResult, SkillStatus } from "@/types";
import type { KnowledgeItem } from "@/types/knowledge";

interface MultiDepartmentWorkspaceProps {
  organizationId: string;
  darkMode: boolean;
  variant: "ask" | "skills";
  knowledgeItems: KnowledgeItem[];
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => null) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(payload?.error?.message ?? `Request failed (${response.status}).`);
  return payload?.data as T;
}

function card(darkMode: boolean): string {
  return `rounded-2xl border p-5 ${darkMode ? "border-[#2d3f52] bg-[#1a2b3c]" : "border-slate-200 bg-white"}`;
}

function input(darkMode: boolean): string {
  return `w-full rounded-xl border px-3 py-2 text-sm outline-none ${darkMode ? "border-[#2d3f52] bg-[#111827] text-white" : "border-slate-200 bg-white text-[#111827]"}`;
}

function muted(darkMode: boolean): string { return darkMode ? "text-slate-400" : "text-slate-500"; }
function title(darkMode: boolean): string { return darkMode ? "text-white" : "text-[#111827]"; }
function pretty(value: unknown): string { return JSON.stringify(value, null, 2) ?? ""; }

function domainName(domains: OrganizationDomain[], id: string | null | undefined): string {
  return domains.find((domain) => domain.id === id)?.label ?? id ?? "Unscoped";
}

function currentVersion(skill: OrganizationalSkill) {
  return skill.currentVersionRecord ?? null;
}

function makeSkillDefinition(purpose: string) {
  return {
    purpose,
    requiredInputs: [],
    capabilities: ["memory.read"],
    permissions: ["document.draft", "memory.read"],
    tools: [],
    constraints: ["Use only the linked validated Memory scope.", "Escalate when required evidence is missing."],
    expectedOutput: "A bounded, reviewable organizational result.",
    escalationConditions: ["Required input or evidence is missing."]
  };
}

export function MultiDepartmentWorkspace({ organizationId, darkMode, variant, knowledgeItems }: MultiDepartmentWorkspaceProps) {
  const [domains, setDomains] = useState<OrganizationDomain[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [askQuery, setAskQuery] = useState("");
  const [askDomain, setAskDomain] = useState("");
  const [askSource, setAskSource] = useState<"auto" | "memory" | "current_data" | "combined">("auto");
  const [askResult, setAskResult] = useState<AskResult | null>(null);
  const [askBusy, setAskBusy] = useState(false);

  const [skills, setSkills] = useState<OrganizationalSkill[]>([]);
  const [skillQuery, setSkillQuery] = useState("");
  const [skillDomain, setSkillDomain] = useState("");
  const [skillStatus, setSkillStatus] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<OrganizationalSkill | null>(null);
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [composition, setComposition] = useState<SkillCompositionResult | null>(null);
  const [packageView, setPackageView] = useState<ExecutionPackage | null>(null);
  const [session, setSession] = useState<ExecutionSession | null>(null);
  const [resultText, setResultText] = useState('{"status":"sample result","reviewable":true}');
  const [reviewDecision, setReviewDecision] = useState("CORRECTED");
  const [reviewClassification, setReviewClassification] = useState("CORRECTION");
  const [reviewNotes, setReviewNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const [newDomain, setNewDomain] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [newPurpose, setNewPurpose] = useState("");
  const [newMemoryId, setNewMemoryId] = useState("");

  const selectedMemory = useMemo(() => knowledgeItems.find((item) => item.id === newMemoryId) ?? null, [knowledgeItems, newMemoryId]);

  async function loadDomains(): Promise<void> {
    const next = await requestJson<OrganizationDomain[]>(`/api/organizations/${organizationId}/domains`);
    setDomains(next);
    setNewDomain((current) => current || next.find((domain) => domain.key === "general")?.id || next[0]?.id || "");
  }

  async function loadSkills(): Promise<void> {
    const params = new URLSearchParams();
    if (skillQuery.trim()) params.set("query", skillQuery.trim());
    if (skillDomain) params.set("domainId", skillDomain);
    if (skillStatus) params.set("status", skillStatus);
    setSkills(await requestJson<OrganizationalSkill[]>(`/api/organizations/${organizationId}/skills?${params.toString()}`));
  }

  useEffect(() => {
    setError("");
    void loadDomains().catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to load Domains."));
    if (variant === "skills") void loadSkills().catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to load Skills."));
    // The workspace changes organization or surface deliberately; each surface
    // owns its small server-authoritative read set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, variant]);

  async function submitAsk(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!askQuery.trim() || askBusy) return;
    setAskBusy(true); setError(""); setMessage("");
    try {
      setAskResult(await requestJson<AskResult>(`/api/organizations/${organizationId}/ask`, { method: "POST", body: JSON.stringify({ query: askQuery, domainId: askDomain || undefined, requestedSource: askSource }) }));
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Ask could not be completed."); }
    finally { setAskBusy(false); }
  }

  async function createSkill(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!newDomain || !newKey.trim() || !newName.trim() || !newPurpose.trim()) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const created = await requestJson<OrganizationalSkill>(`/api/organizations/${organizationId}/skills`, {
        method: "POST",
        body: JSON.stringify({
          domainId: newDomain,
          key: newKey,
          name: newName,
          description: newPurpose,
          definition: makeSkillDefinition(newPurpose),
          riskLevel: "medium",
          executionPolicy: "HUMAN_APPROVAL_REQUIRED",
          humanReviewPolicy: "REQUIRED",
          scope: { level: "organization" },
          memoryLinks: selectedMemory ? [{ knowledgeItemId: selectedMemory.id, knowledgeRevision: selectedMemory.revision, relationship: "grounding" }] : []
        })
      });
      setSelectedSkill(created); setMessage("Skill created as Draft. Submit it for review before composition.");
      setNewKey(""); setNewName(""); setNewPurpose(""); setNewMemoryId("");
      await loadSkills();
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Skill creation failed."); }
    finally { setBusy(false); }
  }

  async function changeLifecycle(skill: OrganizationalSkill, nextStatus: SkillStatus): Promise<void> {
    setBusy(true); setError("");
    try {
      const updated = await requestJson<OrganizationalSkill>(`/api/organizations/${organizationId}/skills/${skill.id}/lifecycle`, { method: "POST", body: JSON.stringify({ status: nextStatus }) });
      setSelectedSkill(updated); await loadSkills();
      setMessage(`Skill is now ${nextStatus}.`);
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Skill lifecycle update failed."); }
    finally { setBusy(false); }
  }

  async function composeSkills(): Promise<void> {
    if (selectedVersions.length === 0) return;
    setBusy(true); setError("");
    try { setComposition(await requestJson<SkillCompositionResult>(`/api/organizations/${organizationId}/skills/compose`, { method: "POST", body: JSON.stringify({ skillVersionIds: selectedVersions, requestedTask: "Prepare a reviewable organizational report using the selected Skills." }) })); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Skill composition failed."); }
    finally { setBusy(false); }
  }

  async function createPackage(): Promise<void> {
    if (!composition) return;
    setBusy(true); setError("");
    try { setPackageView(await requestJson<ExecutionPackage>(`/api/organizations/${organizationId}/execution-packages`, { method: "POST", body: JSON.stringify({ skillVersionIds: composition.skillVersionIds, requestedTask: composition.requestedTask, idempotencyKey: `ui-package-${composition.skillVersionIds.join("-")}` }) })); setMessage("Immutable execution package prepared. OIP does not execute external tools."); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Execution package could not be prepared."); }
    finally { setBusy(false); }
  }

  async function submitResult(): Promise<void> {
    if (!packageView) return;
    setBusy(true); setError("");
    try {
      let result: unknown;
      try { result = JSON.parse(resultText); } catch { throw new Error("Result must be valid JSON."); }
      setSession(await requestJson<ExecutionSession>(`/api/organizations/${organizationId}/execution-packages/${packageView.id}/sessions`, { method: "POST", body: JSON.stringify({ executorType: "external_executor", result, idempotencyKey: `ui-result-${packageView.id}` }) }));
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Execution result intake failed."); }
    finally { setBusy(false); }
  }

  async function reviewResult(): Promise<void> {
    if (!session) return;
    setBusy(true); setError("");
    try { setSession((await requestJson<{ session: ExecutionSession }>(`/api/organizations/${organizationId}/execution-sessions/${session.id}/review`, { method: "POST", body: JSON.stringify({ decision: reviewDecision, outcomeClassification: reviewClassification, notes: reviewNotes || "Human reviewer recorded the execution outcome after inspecting the external result.", idempotencyKey: `ui-review-${session.id}` }) })).session); setMessage("Review recorded as Source and Evidence. Memory remains unchanged until a separate validation decision."); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Execution review failed."); }
    finally { setBusy(false); }
  }

  if (variant === "ask") {
    const context = askResult?.memoryContext;
    const matches = askResult?.memoryResult && typeof askResult.memoryResult === "object" && "matches" in askResult.memoryResult && Array.isArray(askResult.memoryResult.matches) ? askResult.memoryResult.matches as Array<{ item: KnowledgeItem; matchScore: number; matchReason: string }> : [];
    return (
      <section className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
        <div><span className="text-xs font-bold uppercase tracking-[0.2em] text-[#2563EB]">ORGANIZATIONAL INTELLIGENCE</span><h2 className={`mt-2 text-3xl font-bold ${title(darkMode)}`}>Ask Your Organization</h2><p className={`mt-2 max-w-3xl text-sm ${muted(darkMode)}`}>Ask for learned procedure and evidence-backed experience. Current company values remain separate and fail closed when no authorized provider is connected.</p></div>
        <form onSubmit={submitAsk} className={`${card(darkMode)} grid gap-4 md:grid-cols-[1fr_220px_180px_auto]`}>
          <label className="md:col-span-1"><span className={`mb-1 block text-xs font-semibold ${muted(darkMode)}`}>Question</span><input className={input(darkMode)} value={askQuery} onChange={(event) => setAskQuery(event.target.value)} placeholder="How does the company prepare its monthly financial report?" /></label>
          <label><span className={`mb-1 block text-xs font-semibold ${muted(darkMode)}`}>Domain</span><select className={input(darkMode)} value={askDomain} onChange={(event) => setAskDomain(event.target.value)}><option value="">All permitted Domains</option>{domains.map((domain) => <option key={domain.id} value={domain.id}>{domain.label}</option>)}</select></label>
          <label><span className={`mb-1 block text-xs font-semibold ${muted(darkMode)}`}>Source of truth</span><select className={input(darkMode)} value={askSource} onChange={(event) => setAskSource(event.target.value as typeof askSource)}><option value="auto">Auto route</option><option value="memory">Memory</option><option value="current_data">Current data</option><option value="combined">Combined</option></select></label>
          <button type="submit" disabled={askBusy || !askQuery.trim()} className="self-end rounded-xl bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{askBusy ? "Checking…" : "Ask"}</button>
        </form>
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        {askResult && <div className="space-y-5">
          <div className={card(darkMode)}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className={`text-xs font-bold uppercase tracking-wide ${muted(darkMode)}`}>Source-of-truth decision</p><p className={`mt-1 text-lg font-semibold ${title(darkMode)}`}>{askResult.state.replaceAll("_", " ")}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${askResult.state === "current_data_unavailable" ? "bg-amber-100 text-amber-800" : "bg-blue-50 text-blue-700"}`}>{askResult.source}</span></div><p className={`mt-3 text-sm ${muted(darkMode)}`}>{askResult.routingExplanation}</p>{askResult.warnings.map((warning) => <p key={warning} className="mt-2 text-sm text-amber-700">{warning}</p>)}</div>
          {askResult.answer && <div className={card(darkMode)}><p className={`text-xs font-bold uppercase tracking-wide ${muted(darkMode)}`}>Answer from validated Memory</p><p className={`mt-2 whitespace-pre-wrap text-base leading-7 ${title(darkMode)}`}>{askResult.answer}</p>{context && <div className={`mt-5 grid gap-4 border-t pt-4 text-sm ${darkMode ? "border-[#2d3f52]" : "border-slate-200"}`}><div><p className={`font-semibold ${title(darkMode)}`}>Source</p><p className={muted(darkMode)}>{String(context.source?.metadata?.title ?? context.source?.sourceObjectId ?? "Source recorded")}</p></div><div><p className={`font-semibold ${title(darkMode)}`}>Evidence</p><p className={muted(darkMode)}>{context.evidence.length} linked evidence record{context.evidence.length === 1 ? "" : "s"}</p></div><div><p className={`font-semibold ${title(darkMode)}`}>Validation</p><p className={muted(darkMode)}>{context.knowledgeItem.provenance?.validatedBy ?? "Human validation recorded"} · {context.knowledgeItem.provenance?.validatedAt ?? "date unavailable"}</p></div><div><p className={`font-semibold ${title(darkMode)}`}>Scope / reliability</p><p className={muted(darkMode)}>{context.knowledgeItem.scope ? pretty(context.knowledgeItem.scope) : "Domain scope"} · {context.knowledgeItem.trustScore ?? "—"}/100</p></div></div>}</div>}
          {matches.length > 0 && <div className="space-y-3"><p className={`text-sm font-semibold ${title(darkMode)}`}>Relevant Memory</p>{matches.map((match) => <div key={match.item.id} className={card(darkMode)}><div className="flex items-start justify-between gap-3"><div><p className={`font-semibold ${title(darkMode)}`}>{match.item.canonicalProblemTitle ?? match.item.title}</p><p className={`mt-1 text-xs ${muted(darkMode)}`}>{domainName(domains, match.item.domainId)} · revision {match.item.revision} · reliability {match.item.trustScore ?? "—"}/100</p></div><span className={`rounded-full px-2 py-1 text-xs ${match.item.governanceState === "challenged" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{match.matchScore}</span></div><p className={`mt-2 text-sm ${muted(darkMode)}`}>{match.matchReason}</p></div>)}</div>}
        </div>}
      </section>
    );
  }

  const validatedVersions = skills.map((skill) => ({ skill, version: currentVersion(skill) })).filter((entry) => entry.version?.status === "VALIDATED");
  return (
    <section className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
      <div><span className="text-xs font-bold uppercase tracking-[0.2em] text-[#2563EB]">GOVERNED CAPABILITIES</span><h2 className={`mt-2 text-3xl font-bold ${title(darkMode)}`}>Organizational Skills</h2><p className={`mt-2 max-w-3xl text-sm ${muted(darkMode)}`}>Skills are versioned capability contracts grounded in validated Memory. They are not prompts, agents, or autonomous executors.</p></div>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}{message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className={card(darkMode)}><div className="flex flex-wrap items-end gap-3"><label className="min-w-[220px] flex-1"><span className={`mb-1 block text-xs font-semibold ${muted(darkMode)}`}>Search Skills</span><input className={input(darkMode)} value={skillQuery} onChange={(event) => setSkillQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void loadSkills(); } }} placeholder="Financial reporting" /></label><label><span className={`mb-1 block text-xs font-semibold ${muted(darkMode)}`}>Domain</span><select className={input(darkMode)} value={skillDomain} onChange={(event) => { setSkillDomain(event.target.value); void loadSkills(); }}><option value="">All permitted</option>{domains.map((domain) => <option key={domain.id} value={domain.id}>{domain.label}</option>)}</select></label><label><span className={`mb-1 block text-xs font-semibold ${muted(darkMode)}`}>Status</span><select className={input(darkMode)} value={skillStatus} onChange={(event) => { setSkillStatus(event.target.value); void loadSkills(); }}><option value="">All</option><option>VALIDATED</option><option>DRAFT</option><option>READY_FOR_REVIEW</option><option>SUSPENDED</option></select></label><button type="button" onClick={() => { void loadSkills(); }} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold">Refresh</button></div><div className="mt-5 space-y-3">{skills.length === 0 && <p className={`rounded-xl border border-dashed p-4 text-sm ${muted(darkMode)}`}>No permitted Skills match this filter.</p>}{skills.map((skill) => { const version = currentVersion(skill); const checked = Boolean(version && selectedVersions.includes(version.id)); return <div key={skill.id} className={`rounded-xl border p-4 ${selectedSkill?.id === skill.id ? darkMode ? "border-blue-500" : "border-blue-300" : darkMode ? "border-[#2d3f52]" : "border-slate-200"}`}><div className="flex items-start gap-3"><input type="checkbox" disabled={!version || version.status !== "VALIDATED"} checked={checked} onChange={(event) => setSelectedVersions((current) => event.target.checked ? [...current, version!.id] : current.filter((id) => id !== version!.id))} className="mt-1" /><button type="button" onClick={() => setSelectedSkill(skill)} className="min-w-0 flex-1 text-left"><p className={`font-semibold ${title(darkMode)}`}>{skill.name}</p><p className={`mt-1 text-xs ${muted(darkMode)}`}>{domainName(domains, skill.domainId)} · {skill.status} · {version ? `v${version.version} ${version.status}` : "no version"}</p><p className={`mt-2 text-sm ${muted(darkMode)}`}>{skill.description}</p></button></div></div>; })}</div></div>
        <div className={card(darkMode)}><p className={`text-xs font-bold uppercase tracking-wide ${muted(darkMode)}`}>Create a governed draft</p><form onSubmit={createSkill} className="mt-4 space-y-3"><label><span className={`mb-1 block text-xs font-semibold ${muted(darkMode)}`}>Domain</span><select className={input(darkMode)} value={newDomain} onChange={(event) => setNewDomain(event.target.value)}>{domains.map((domain) => <option key={domain.id} value={domain.id}>{domain.label}</option>)}</select></label><label><span className={`mb-1 block text-xs font-semibold ${muted(darkMode)}`}>Stable key</span><input className={input(darkMode)} value={newKey} onChange={(event) => setNewKey(event.target.value)} placeholder="financial-reporting" /></label><label><span className={`mb-1 block text-xs font-semibold ${muted(darkMode)}`}>Name</span><input className={input(darkMode)} value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Financial Reporting" /></label><label><span className={`mb-1 block text-xs font-semibold ${muted(darkMode)}`}>Purpose</span><textarea className={`${input(darkMode)} min-h-20`} value={newPurpose} onChange={(event) => setNewPurpose(event.target.value)} placeholder="Prepare a reviewable report using the validated procedure." /></label><label><span className={`mb-1 block text-xs font-semibold ${muted(darkMode)}`}>Link validated Memory <span className="font-normal">(optional)</span></span><select className={input(darkMode)} value={newMemoryId} onChange={(event) => setNewMemoryId(event.target.value)}><option value="">No Memory link</option>{knowledgeItems.filter((item) => item.lifecycleState === "active" && item.governanceState !== "challenged").map((item) => <option key={item.id} value={item.id}>{item.title} · v{item.revision}</option>)}</select></label><button type="submit" disabled={busy || !newDomain} className="w-full rounded-xl bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Create Draft Skill"}</button></form></div>
      </div>
      {selectedSkill && <div className={card(darkMode)}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className={`text-xs font-bold uppercase tracking-wide ${muted(darkMode)}`}>Skill detail</p><h3 className={`mt-1 text-xl font-bold ${title(darkMode)}`}>{selectedSkill.name}</h3><p className={`mt-1 text-sm ${muted(darkMode)}`}>{selectedSkill.description} · {domainName(domains, selectedSkill.domainId)}</p></div><div className="flex flex-wrap gap-2">{selectedSkill.status === "DRAFT" && <button type="button" disabled={busy} onClick={() => { void changeLifecycle(selectedSkill, "READY_FOR_REVIEW"); }} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold">Submit for review</button>}{selectedSkill.status === "READY_FOR_REVIEW" && <button type="button" disabled={busy} onClick={() => { void changeLifecycle(selectedSkill, "VALIDATED"); }} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white">Validate Skill</button>}{selectedSkill.status === "VALIDATED" && <button type="button" disabled={busy} onClick={() => { void changeLifecycle(selectedSkill, "SUSPENDED"); }} className="rounded-xl border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800">Suspend</button>}</div></div>{selectedSkill.currentVersionRecord && <div className={`mt-4 grid gap-3 border-t pt-4 text-sm md:grid-cols-4 ${darkMode ? "border-[#2d3f52]" : "border-slate-200"}`}><div><p className={`font-semibold ${title(darkMode)}`}>Version</p><p className={muted(darkMode)}>v{selectedSkill.currentVersionRecord.version} · {selectedSkill.currentVersionRecord.status}</p></div><div><p className={`font-semibold ${title(darkMode)}`}>Risk</p><p className={muted(darkMode)}>{selectedSkill.currentVersionRecord.riskLevel}</p></div><div><p className={`font-semibold ${title(darkMode)}`}>Review policy</p><p className={muted(darkMode)}>{selectedSkill.currentVersionRecord.humanReviewPolicy}</p></div><div><p className={`font-semibold ${title(darkMode)}`}>Memory links</p><p className={muted(darkMode)}>{selectedSkill.currentVersionRecord.memoryLinks?.length ?? 0}</p></div></div>}</div>}
      <div className={card(darkMode)}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className={`text-xs font-bold uppercase tracking-wide ${muted(darkMode)}`}>Deterministic composition</p><p className={`mt-1 text-sm ${muted(darkMode)}`}>Select validated versions. Policy and scope intersections fail closed.</p></div><button type="button" disabled={busy || selectedVersions.length === 0} onClick={() => { void composeSkills(); }} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Compose selected</button></div>{composition && <div className="mt-4 grid gap-4 md:grid-cols-3"><div><p className={`font-semibold ${title(darkMode)}`}>Effective mode</p><p className={`mt-1 ${muted(darkMode)}`}>{composition.policy.mode}</p></div><div><p className={`font-semibold ${title(darkMode)}`}>Risk / review</p><p className={`mt-1 ${muted(darkMode)}`}>{composition.policy.riskLevel} · {composition.policy.humanReviewRequired ? "human review required" : "bounded"}</p></div><div><p className={`font-semibold ${title(darkMode)}`}>Permissions</p><p className={`mt-1 ${muted(darkMode)}`}>{composition.policy.permissions.join(", ") || "none"}</p></div><div className="md:col-span-3"><p className={`font-semibold ${title(darkMode)}`}>Required inputs / tools / warnings</p><p className={`mt-1 text-sm ${muted(darkMode)}`}>{composition.inputs.map((item) => item.key).join(", ") || "No required inputs"} · {composition.policy.tools.join(", ") || "No tools"} · {composition.policy.warnings.join(" ")}</p></div><button type="button" disabled={busy || composition.policy.mode === "ADVISORY"} onClick={() => { void createPackage(); }} className="rounded-xl border border-blue-300 px-4 py-2.5 text-sm font-semibold text-blue-700 md:col-span-3">Prepare immutable Execution Package</button></div>}</div>
      {packageView && <div className={card(darkMode)}><p className={`text-xs font-bold uppercase tracking-wide ${muted(darkMode)}`}>Execution Package</p><div className="mt-2 grid gap-3 text-sm md:grid-cols-4"><div><p className={`font-semibold ${title(darkMode)}`}>Digest</p><p className={`break-all ${muted(darkMode)}`}>{packageView.payloadDigest}</p></div><div><p className={`font-semibold ${title(darkMode)}`}>Policy</p><p className={muted(darkMode)}>{packageView.policy.mode}</p></div><div><p className={`font-semibold ${title(darkMode)}`}>Risk</p><p className={muted(darkMode)}>{packageView.riskLevel}</p></div><div><p className={`font-semibold ${title(darkMode)}`}>Review</p><p className={muted(darkMode)}>{packageView.humanReviewRequired ? "Required" : "Not required"}</p></div></div><details className="mt-4"><summary className={`cursor-pointer text-sm font-semibold ${title(darkMode)}`}>View redacted payload snapshot</summary><pre className={`mt-3 max-h-80 overflow-auto rounded-xl p-3 text-xs ${darkMode ? "bg-[#111827] text-slate-300" : "bg-slate-50 text-slate-700"}`}>{pretty(packageView.payload)}</pre></details><div className="mt-5 grid gap-4 md:grid-cols-2"><label><span className={`mb-1 block text-xs font-semibold ${muted(darkMode)}`}>External result intake (sanitized JSON)</span><textarea className={`${input(darkMode)} min-h-28`} value={resultText} onChange={(event) => setResultText(event.target.value)} /></label><button type="button" disabled={busy} onClick={() => { void submitResult(); }} className="self-end rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold">Receive external result</button></div></div>}
      {session && <div className={card(darkMode)}><p className={`text-xs font-bold uppercase tracking-wide ${muted(darkMode)}`}>Human review</p><p className={`mt-1 text-sm ${muted(darkMode)}`}>Session {session.id} · {session.status} · result digest {session.resultDigest}</p>{session.status === "RESULT_RECEIVED" ? <div className="mt-4 grid gap-3 md:grid-cols-4"><select className={input(darkMode)} value={reviewDecision} onChange={(event) => setReviewDecision(event.target.value)}><option>ACCEPTED</option><option>CORRECTED</option><option>REJECTED</option><option>UNRESOLVED</option></select><select className={input(darkMode)} value={reviewClassification} onChange={(event) => setReviewClassification(event.target.value)}><option>REINFORCEMENT</option><option>CORRECTION</option><option>CHALLENGE</option><option>NEW_LESSON</option><option>SCOPE_CHANGE</option><option>UNRESOLVED</option></select><input className={input(darkMode)} value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} placeholder="Review notes" /><button type="button" disabled={busy} onClick={() => { void reviewResult(); }} className="rounded-xl bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white">Record review</button></div> : <p className={`mt-3 text-sm ${muted(darkMode)}`}>Review recorded as Source {session.outcomeSourceId ?? "—"} and Evidence {session.outcomeEvidenceId ?? "—"}. Any correction is a candidate/challenge for later validation; original Memory remains unchanged.</p>}</div>}
    </section>
  );
}
