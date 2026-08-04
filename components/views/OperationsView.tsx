"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type OperationsSnapshot = {
  generatedAt: string;
  accessibleOrganizationCount: number;
  overview: Record<string, number | null | unknown>;
  workers: Array<Record<string, unknown>>;
  queues: Array<Record<string, unknown>>;
  jobs: Array<Record<string, unknown>>;
  providers: Array<Record<string, unknown>>;
  performance: Record<string, any>;
  failures: Array<Record<string, unknown>>;
  deadLetters: Array<Record<string, unknown>>;
};

function value(value: unknown, fallback = "—") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function formatDate(valueToFormat: unknown) {
  if (!valueToFormat) return "—";
  const date = new Date(String(valueToFormat));
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function tone(status: unknown) {
  const normalized = String(status ?? "").toLowerCase();
  if (["online", "succeeded", "success"].includes(normalized)) return "text-emerald-600 bg-emerald-50";
  if (["failed", "dead_lettered", "offline", "error"].includes(normalized)) return "text-rose-600 bg-rose-50";
  if (["running", "queued", "retry_scheduled", "stopping"].includes(normalized)) return "text-amber-700 bg-amber-50";
  return "text-slate-600 bg-slate-100";
}

export function OperationsView({ organizationId, darkMode, accentColor }: { organizationId: string; darkMode: boolean; accentColor: string }) {
  const [snapshot, setSnapshot] = useState<OperationsSnapshot | null>(null);
  const [selectedJob, setSelectedJob] = useState<Record<string, unknown> | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/operations?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as { data?: OperationsSnapshot; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Operations data could not be loaded.");
      setSnapshot(payload.data);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Operations data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, search, statusFilter, typeFilter]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, load]);

  const downloadDiagnostics = () => {
    if (!snapshot) return;
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `operations-diagnostics-${organizationId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const operate = async (jobId: string, action: "retry" | "cancel") => {
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/jobs/${encodeURIComponent(jobId)}/${action}`, { method: "POST" });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? `Unable to ${action} job.`);
      setMessage(`Job ${action} request accepted.`);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `Unable to ${action} job.`);
    }
  };

  const overview = snapshot?.overview ?? {};
  const cardItems = useMemo(() => [
    ["Online workers", overview.workersOnline], ["Queued", overview.queuedJobs], ["Running", overview.runningJobs], ["Retrying", overview.retryingJobs], ["Dead letters", overview.deadLetterJobs], ["Total jobs", overview.totalJobs]
  ], [overview]);
  const panel = darkMode ? "border-[#24344d] bg-[#111827]" : "border-slate-200 bg-white";
  const muted = darkMode ? "text-slate-400" : "text-slate-500";
  const heading = darkMode ? "text-white" : "text-[#111827]";

  return (
    <div className={`mx-auto max-w-[1500px] p-4 md:p-6 ${darkMode ? "text-slate-100" : "text-slate-800"}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: accentColor }}>Operations</p>
          <h1 className={`mt-2 text-3xl font-bold ${heading}`}>Worker monitoring</h1>
          <p className={`mt-1 text-sm ${muted}`}>Durable job health and operator-safe diagnostics for this organization.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${panel}`}><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} /> Poll 5s</label>
          <button type="button" onClick={() => void load()} className="rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ backgroundColor: accentColor }}>{loading ? "Refreshing…" : "Refresh"}</button>
          <button type="button" onClick={downloadDiagnostics} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${panel}`}>Export diagnostics</button>
        </div>
      </div>

      {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {message && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cardItems.map(([label, number]) => <div key={String(label)} className={`rounded-2xl border p-4 ${panel}`}><p className={`text-xs font-semibold ${muted}`}>{String(label)}</p><p className={`mt-2 text-2xl font-bold ${heading}`}>{value(number, "0")}</p></div>)}
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <section className={`rounded-2xl border p-5 ${panel}`}><h2 className={`font-bold ${heading}`}>Worker health</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className={muted}><tr><th className="pb-2">Worker</th><th className="pb-2">Status</th><th className="pb-2">Last heartbeat</th><th className="pb-2">Jobs</th></tr></thead><tbody>{(snapshot?.workers ?? []).map((worker) => <tr key={String(worker.workerId)} className="border-t border-slate-200/20"><td className="py-2 font-medium">{value(worker.workerId)}</td><td className="py-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${tone(worker.status)}`}>{value(worker.status)}</span></td><td className="py-2">{formatDate(worker.lastHeartbeatAt)}</td><td className="py-2">{value(worker.processedJobs, "0")}</td></tr>)}</tbody></table>{!snapshot?.workers.length && <p className={`pt-3 text-sm ${muted}`}>No persisted worker heartbeat has been observed.</p>}</div></section>
        <section className={`rounded-2xl border p-5 ${panel}`}><h2 className={`font-bold ${heading}`}>Queue overview</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{(snapshot?.queues ?? []).map((queue) => <div key={String(queue.type)} className="rounded-xl border border-slate-200/20 p-3"><p className="font-semibold">{value(queue.type)}</p><p className={`mt-2 text-xs ${muted}`}>Queued {value(queue.queued, "0")} · Running {value(queue.running, "0")} · Retrying {value(queue.retrying, "0")} · DLQ {value(queue.deadLettered, "0")}</p></div>)}</div>{!snapshot?.queues.length && <p className={`mt-3 text-sm ${muted}`}>No durable queues have recorded jobs.</p>}</section>
      </div>

      <section className={`mt-5 rounded-2xl border p-5 ${panel}`}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className={`font-bold ${heading}`}>Jobs</h2><p className={`mt-1 text-xs ${muted}`}>Safe metadata only. Payloads, ticket text, customer context, prompts, and chain-of-thought are excluded.</p></div><div className="flex flex-wrap gap-2"><input aria-label="Search jobs" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search id, request, correlation" className={`rounded-lg border px-3 py-2 text-sm ${darkMode ? "border-[#31445f] bg-[#0b1220]" : "border-slate-200 bg-white"}`} /><select aria-label="Filter by type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="">All types</option><option value="ticket.process">ticket.process</option><option value="bulk.analyze">bulk.analyze</option><option value="reflection.generate">reflection.generate</option><option value="pattern.discover">pattern.discover</option></select><select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="">All statuses</option><option value="queued">queued</option><option value="running">running</option><option value="succeeded">succeeded</option><option value="failed">failed</option><option value="dead_lettered">dead_lettered</option><option value="cancelled">cancelled</option></select></div></div>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className={muted}><tr><th className="pb-2">Job</th><th className="pb-2">Type</th><th className="pb-2">Status</th><th className="pb-2">Progress</th><th className="pb-2">Attempts</th><th className="pb-2">Created</th><th className="pb-2">Actions</th></tr></thead><tbody>{(snapshot?.jobs ?? []).map((job) => <tr key={String(job.id)} className="border-t border-slate-200/20"><td className="py-3"><button type="button" className="font-semibold hover:underline" onClick={() => setSelectedJob(job)}>{String(job.id).slice(0, 12)}…</button><p className={`text-xs ${muted}`}>{String(job.correlationId).slice(0, 18)}</p></td><td className="py-3">{value(job.type)}</td><td className="py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${tone(job.status)}`}>{value(job.status)}</span></td><td className="py-3">{value((job.progress as Record<string, unknown>)?.percent, "0")}%</td><td className="py-3">{value(job.attemptCount, "0")}/{value(job.maxAttempts, "0")}</td><td className="py-3">{formatDate(job.createdAt)}</td><td className="py-3"><div className="flex gap-2">{["failed", "dead_lettered"].includes(String(job.status)) && <button type="button" className="text-xs font-semibold text-blue-600" onClick={() => void operate(String(job.id), "retry")}>Retry</button>}{["queued", "running", "leased", "retry_scheduled", "cancellation_requested"].includes(String(job.status)) && <button type="button" className="text-xs font-semibold text-rose-600" onClick={() => void operate(String(job.id), "cancel")}>Cancel</button>}</div></td></tr>)}</tbody></table>{!snapshot?.jobs.length && <p className={`pt-3 text-sm ${muted}`}>No jobs match the current filters.</p>}</div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <section className={`rounded-2xl border p-5 ${panel}`}><h2 className={`font-bold ${heading}`}>Provider health</h2>{(snapshot?.providers ?? []).map((provider) => <div key={String(provider.provider)} className="mt-3 flex items-center justify-between text-sm"><span>{value(provider.provider)}</span><span className={muted}>{value(provider.sampleCount, "0")} samples · {value(provider.averageJobDurationMs, "unavailable")} ms observed job duration</span></div>)}{!snapshot?.providers.length && <p className={`mt-3 text-sm ${muted}`}>No provider samples are persisted yet.</p>}</section>
        <section className={`rounded-2xl border p-5 ${panel}`}><h2 className={`font-bold ${heading}`}>Performance</h2><p className={`mt-3 text-sm ${muted}`}>Queue wait: {value(snapshot?.performance.queueWait?.averageMs, "unavailable")} ms avg / {value(snapshot?.performance.queueWait?.p95Ms, "unavailable")} ms p95</p><p className={`mt-2 text-sm ${muted}`}>Runtime: {value(snapshot?.performance.runtime?.averageMs, "unavailable")} ms avg / {value(snapshot?.performance.runtime?.p95Ms, "unavailable")} ms p95</p><p className={`mt-3 text-xs ${muted}`}>Stage breakdown is unavailable until stage-level durable telemetry is persisted.</p></section>
        <section className={`rounded-2xl border p-5 ${panel}`}><h2 className={`font-bold ${heading}`}>Failures & dead letters</h2>{(snapshot?.failures ?? []).map((failure) => <p key={String(failure.errorClass)} className="mt-3 text-sm">{value(failure.errorClass)} <span className={muted}>({value(failure.count, "0")})</span></p>)}<p className="mt-3 text-sm font-semibold text-rose-600">Dead letters: {value(snapshot?.deadLetters.length, "0")}</p></section>
      </div>

      {selectedJob && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true"><div className={`max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border p-6 ${panel}`}><div className="flex items-start justify-between gap-4"><div><h2 className={`font-bold ${heading}`}>Job detail</h2><p className={`mt-1 text-xs ${muted}`}>{value(selectedJob.id)}</p></div><button type="button" onClick={() => setSelectedJob(null)} className={`rounded-lg border px-3 py-1 text-sm ${panel}`}>Close</button></div><dl className="mt-5 grid gap-3 sm:grid-cols-2">{[["Type", selectedJob.type], ["Status", selectedJob.status], ["Organization", selectedJob.organizationId], ["Request", selectedJob.requestId], ["Correlation", selectedJob.correlationId], ["Input digest", selectedJob.inputDigest], ["Worker", selectedJob.workerId], ["Error class", selectedJob.errorClass]].map(([label, item]) => <div key={String(label)}><dt className={`text-xs font-semibold ${muted}`}>{String(label)}</dt><dd className="mt-1 break-all text-sm">{value(item)}</dd></div>)}</dl><p className={`mt-5 text-xs ${muted}`}>Only digests, identifiers, status, timing, progress, and safe diagnostics are shown.</p></div></div>}
    </div>
  );
}
