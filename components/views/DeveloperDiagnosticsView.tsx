"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DiagnosticsTestTarget,
  ProviderDiagnosticsSnapshot,
  ProviderHealthCheck,
  ProviderHealthEntry
} from "@/types/aiDiagnostics";

interface DeveloperDiagnosticsViewProps {
  darkMode: boolean;
  accentColor: string;
}

const TARGET_LABELS: Record<DiagnosticsTestTarget, string> = {
  deepseek: "Test DeepSeek",
  "openai-compatible": "Test OpenAI-compatible",
  lmstudio: "Test LM Studio",
  claude: "Test Claude",
  deterministic: "Test Deterministic",
  chain: "Test Entire Chain"
};

function formatTime(value?: string): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatLatency(value?: number): string {
  return typeof value === "number" ? `${value} ms` : "—";
}

function StatusBadge({ status, darkMode }: { status: string; darkMode: boolean }) {
  const good = ["healthy", "available", "success", "succeeded"].includes(status);
  const muted = ["configured", "idle", "skipped", "disabled"].includes(status);
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
      good
        ? darkMode ? "bg-emerald-900/40 text-emerald-300" : "bg-emerald-50 text-emerald-700"
        : muted
        ? darkMode ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"
        : darkMode ? "bg-red-900/40 text-red-300" : "bg-red-50 text-red-700"
    }`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function InfoCard({ label, value, darkMode }: { label: string; value: string; darkMode: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${darkMode ? "border-[#2d3f52] bg-[#1a2b3c]" : "border-slate-200 bg-white"}`}>
      <p className={`text-xs font-bold uppercase tracking-wide ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{label}</p>
      <p className={`mt-2 break-words text-lg font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>{value || "—"}</p>
    </div>
  );
}

function ProviderCard({ provider, darkMode, accentColor, busy, onTest }: {
  provider: ProviderHealthEntry;
  darkMode: boolean;
  accentColor: string;
  busy: DiagnosticsTestTarget | null;
  onTest: (target: DiagnosticsTestTarget) => void;
}) {
  const target = provider.id;
  return (
    <article data-testid={`ai-provider-${provider.id}`} className={`rounded-2xl border p-5 ${darkMode ? "border-[#2d3f52] bg-[#1a2b3c]" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className={`font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>{provider.label}</h3>
          <p className={`mt-1 text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{provider.model || "No model configured"}</p>
        </div>
        <StatusBadge status={provider.status} darkMode={darkMode} />
      </div>
      <dl className={`mt-5 grid grid-cols-2 gap-4 text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
        <div><dt className="text-xs text-slate-500">Configured</dt><dd className="mt-1 font-semibold">{provider.configured ? "Yes" : "No"}</dd></div>
        <div><dt className="text-xs text-slate-500">Latency</dt><dd className="mt-1 font-semibold">{formatLatency(provider.latencyMs)}</dd></div>
        <div><dt className="text-xs text-slate-500">Last checked</dt><dd className="mt-1 font-semibold">{formatTime(provider.lastCheckedAt)}</dd></div>
        <div><dt className="text-xs text-slate-500">Last success</dt><dd className="mt-1 font-semibold">{formatTime(provider.lastSuccessAt)}</dd></div>
      </dl>
      {provider.reason && <p className={`mt-4 rounded-xl px-3 py-2 text-xs ${darkMode ? "bg-red-950/30 text-red-200" : "bg-red-50 text-red-700"}`}>{provider.reason}</p>}
      <button
        type="button"
        data-testid={`ai-test-${provider.id}`}
        disabled={busy !== null}
        onClick={() => onTest(target)}
        style={{ borderColor: accentColor, color: accentColor }}
        className="mt-5 rounded-xl border px-3 py-2 text-xs font-bold transition-opacity disabled:cursor-wait disabled:opacity-50"
      >
        {busy === target ? "Testing…" : TARGET_LABELS[target]}
      </button>
    </article>
  );
}

function DiagnosticsTable({ checks, darkMode }: { checks: ProviderHealthCheck[]; darkMode: boolean }) {
  if (checks.length === 0) {
    return <p className={`text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>No health checks have run in this server session.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className={`min-w-full text-left text-xs ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
        <thead className={`${darkMode ? "text-slate-400" : "text-slate-500"}`}>
          <tr><th className="px-3 py-2 font-semibold">Provider</th><th className="px-3 py-2 font-semibold">Model</th><th className="px-3 py-2 font-semibold">Result</th><th className="px-3 py-2 font-semibold">Latency</th><th className="px-3 py-2 font-semibold">Retries</th><th className="px-3 py-2 font-semibold">Fallback path</th><th className="px-3 py-2 font-semibold">Time</th></tr>
        </thead>
        <tbody>
          {checks.map((check) => (
            <tr key={check.id} className={`border-t ${darkMode ? "border-[#2d3f52]" : "border-slate-100"}`}>
              <td className="px-3 py-3 font-semibold">{check.provider}</td>
              <td className="px-3 py-3">{check.model || "—"}</td>
              <td className="px-3 py-3"><StatusBadge status={check.result} darkMode={darkMode} /></td>
              <td className="px-3 py-3">{formatLatency(check.latencyMs)}</td>
              <td className="px-3 py-3">{check.retries}</td>
              <td className="px-3 py-3">{check.fallbackPath.join(" → ") || "—"}</td>
              <td className="whitespace-nowrap px-3 py-3">{formatTime(check.timestamp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DeveloperDiagnosticsView({ darkMode, accentColor }: DeveloperDiagnosticsViewProps) {
  const [snapshot, setSnapshot] = useState<ProviderDiagnosticsSnapshot | null>(null);
  const [busy, setBusy] = useState<DiagnosticsTestTarget | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/developer/ai/providers", { cache: "no-store" });
    const payload = await response.json() as { data?: ProviderDiagnosticsSnapshot; error?: { message?: string } };
    if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Diagnostics are unavailable.");
    setSnapshot(payload.data);
  }, []);

  useEffect(() => {
    void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Diagnostics are unavailable."));
  }, [load]);

  const test = useCallback(async (target: DiagnosticsTestTarget) => {
    setBusy(target);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/developer/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: target })
      });
      const payload = await response.json() as { data?: { snapshot?: ProviderDiagnosticsSnapshot }; error?: { message?: string } };
      if (!response.ok || !payload.data?.snapshot) throw new Error(payload.error?.message || "Diagnostics test failed.");
      setSnapshot(payload.data.snapshot);
      setMessage(`${TARGET_LABELS[target]} completed.`);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Diagnostics test failed.");
    } finally {
      setBusy(null);
    }
  }, []);

  const fallbackOrder = useMemo(() => snapshot?.fallbackOrder ?? [], [snapshot]);
  const providers = snapshot?.providers ?? [];
  const history = snapshot?.history ?? [];

  return (
    <div data-testid="ai-diagnostics-page" className="mx-auto max-w-7xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className={`text-sm font-bold uppercase tracking-[0.18em] ${darkMode ? "text-blue-300" : "text-blue-600"}`}>Developer</p>
          <h1 className={`mt-2 text-3xl font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>AI Provider Diagnostics</h1>
          <p className={`mt-2 max-w-2xl text-sm ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>Read-only health checks for provider routing, latency, fallback behavior, and operational status. These checks do not create tickets or touch business data.</p>
        </div>
        <button type="button" onClick={() => void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Diagnostics are unavailable."))} disabled={busy !== null} className={`rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${darkMode ? "border-[#2d3f52] text-slate-200 hover:bg-[#1e3048]" : "border-slate-300 text-slate-700 hover:bg-white"}`}>Refresh</button>
      </div>

      {error && <div role="alert" className={`mt-6 rounded-xl border px-4 py-3 text-sm ${darkMode ? "border-red-800/60 bg-red-950/30 text-red-200" : "border-red-200 bg-red-50 text-red-700"}`}>{error}</div>}
      {message && <div role="status" className={`mt-6 rounded-xl border px-4 py-3 text-sm ${darkMode ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-200" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{message}</div>}

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <InfoCard label="Current provider" value={snapshot?.currentProvider || "Loading…"} darkMode={darkMode} />
        <InfoCard label="Model" value={snapshot?.currentModel || "—"} darkMode={darkMode} />
        <InfoCard label="AI mode" value={snapshot?.aiMode || "—"} darkMode={darkMode} />
        <InfoCard label="Fallback order" value={fallbackOrder.join(" → ") || "Deterministic fallback"} darkMode={darkMode} />
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className={`text-xl font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>Provider health</h2><p className={`mt-1 text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Status is held in memory for this developer session; no database persistence is required.</p></div>
          <button type="button" data-testid="ai-test-chain" disabled={busy !== null} onClick={() => void test("chain")} style={{ backgroundColor: accentColor }} className="rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-sm disabled:cursor-wait disabled:opacity-50">{busy === "chain" ? "Testing chain…" : TARGET_LABELS.chain}</button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {providers.map((provider) => <ProviderCard key={provider.id} provider={provider} darkMode={darkMode} accentColor={accentColor} busy={busy} onTest={(target) => void test(target)} />)}
        </div>
      </section>

      <section className={`mt-8 rounded-2xl border p-5 ${darkMode ? "border-[#2d3f52] bg-[#1a2b3c]" : "border-slate-200 bg-white"}`}>
        <h2 className={`text-xl font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>Routing and latest diagnostics</h2>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {fallbackOrder.map((provider, index) => <span key={`${provider}-${index}`} className="flex items-center gap-2"><span className={`rounded-xl px-3 py-2 text-sm font-bold ${darkMode ? "bg-[#111827] text-slate-200" : "bg-slate-100 text-slate-700"}`}>{index + 1}. {provider}</span>{index < fallbackOrder.length - 1 && <span aria-hidden="true" className="text-slate-400">→</span>}</span>)}
        </div>
        <div className={`mt-5 rounded-xl border p-4 ${darkMode ? "border-[#2d3f52] bg-[#111827]" : "border-slate-100 bg-slate-50"}`}>
          <DiagnosticsTable checks={snapshot?.latest ? [snapshot.latest] : []} darkMode={darkMode} />
        </div>
      </section>

      <section className={`mt-8 rounded-2xl border p-5 ${darkMode ? "border-[#2d3f52] bg-[#1a2b3c]" : "border-slate-200 bg-white"}`}>
        <div className="flex items-end justify-between gap-3"><div><h2 className={`text-xl font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>Health-check history</h2><p className={`mt-1 text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Latest {Math.min(history.length, 25)} of 25 retained checks.</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${darkMode ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"}`}>{history.length} recorded</span></div>
        <div className="mt-4"><DiagnosticsTable checks={history} darkMode={darkMode} /></div>
      </section>
    </div>
  );
}
