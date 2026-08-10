"use client";

import { useEffect, useMemo, useState } from "react";
import type { KnowledgeItem, OrganizationProfile } from "@/types";

type ApiError = {
  code?: string;
  message?: string;
  resourceType?: string;
  resourceId?: string;
  expectedRevision?: number | null;
  currentRevision?: number;
  requestId?: string;
};

type ApiResult<T> = {
  data?: T;
  error?: ApiError;
  status: number;
  path: string;
  method: string;
};

type RequestEvidence = {
  method: string;
  path: string;
  status: number;
  code?: string;
  resourceType?: string;
  expectedRevision?: number | null;
  currentRevision?: number;
};

function isDisposableOrganization(profile: OrganizationProfile): boolean {
  return /rss-2\.8-final|knowledgeitem|acceptance/i.test(profile.name);
}

function cloneItem(item: KnowledgeItem): KnowledgeItem {
  return JSON.parse(JSON.stringify(item)) as KnowledgeItem;
}

export default function KnowledgeRevisionHarness() {
  const [organizations, setOrganizations] = useState<OrganizationProfile[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState<ApiError | null>(null);
  const [lastRequest, setLastRequest] = useState<RequestEvidence | null>(null);
  const [requestHistory, setRequestHistory] = useState<RequestEvidence[]>([]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  );
  const selectedOrganization = organizations.find((org) => org.id === organizationId) ?? null;

  async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
    const method = init?.method ?? "GET";
    let response: Response;
    let payload: { data?: T; error?: ApiError } = {};
    try {
      response = await fetch(path, { ...init, cache: "no-store", headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) } });
      payload = await response.json() as typeof payload;
    } catch {
      const evidence = { method, path, status: 0, code: "NETWORK_ERROR" } satisfies RequestEvidence;
      setLastRequest(evidence);
      setRequestHistory((current) => [...current.slice(-7), evidence]);
      return { status: 0, path, method, error: { code: "NETWORK_ERROR", message: "The acceptance API could not be reached." } };
    }
    const evidence: RequestEvidence = {
      method,
      path,
      status: response.status,
      ...(payload.error?.code ? { code: payload.error.code } : {}),
      ...(payload.error?.resourceType ? { resourceType: payload.error.resourceType } : {}),
      ...(payload.error?.expectedRevision !== undefined ? { expectedRevision: payload.error.expectedRevision } : {}),
      ...(payload.error?.currentRevision !== undefined ? { currentRevision: payload.error.currentRevision } : {})
    };
    setLastRequest(evidence);
    setRequestHistory((current) => [...current.slice(-7), evidence]);
    return { data: payload.data, error: payload.error, status: response.status, path, method };
  }

  async function loadOrganizations() {
    setLoading(true);
    const result = await request<OrganizationProfile[]>("/api/organizations");
    if (result.data) {
      const disposable = result.data.filter(isDisposableOrganization);
      setOrganizations(disposable);
      if (!organizationId && disposable[0]) setOrganizationId(disposable[0].id);
      setMessage(disposable.length ? "Select the disposable acceptance organization." : "No disposable acceptance organization is available.");
    } else {
      setMessage(result.error?.message ?? "Unable to load authorized organizations.");
    }
    setLoading(false);
  }

  async function loadKnowledge(nextOrganizationId: string, replaceDraft = true) {
    if (!nextOrganizationId) return;
    setLoading(true);
    const result = await request<KnowledgeItem[]>(`/api/organizations/${encodeURIComponent(nextOrganizationId)}/knowledge`);
    if (result.data) {
      setItems(result.data);
      const nextSelected = result.data.find((item) => item.id === selectedId) ?? result.data[0] ?? null;
      setSelectedId(nextSelected?.id ?? "");
      if (replaceDraft) setDraftTitle(nextSelected?.title ?? "");
      setMessage(nextSelected ? "KnowledgeItem loaded from the authorized organization." : "No KnowledgeItem is available in this organization.");
    } else {
      setMessage(result.error?.message ?? "Unable to load KnowledgeItems.");
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadOrganizations();
    // The acceptance page intentionally performs one initial authenticated load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (organizationId) void loadKnowledge(organizationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  useEffect(() => {
    if (selectedItem) setDraftTitle(selectedItem.title);
  }, [selectedItem?.id]);

  async function saveKnowledgeItem() {
    if (!organizationId || !selectedItem) return;
    setSaving(true);
    setConflict(null);
    setMessage("Saving through the authenticated KnowledgeItem API…");
    const changed = cloneItem({ ...selectedItem, title: draftTitle });
    const nextItems = items.map((item) => item.id === changed.id ? changed : item);
    const result = await request<{ saved: boolean }>(`/api/organizations/${encodeURIComponent(organizationId)}/knowledge`, {
      method: "PUT",
      body: JSON.stringify(nextItems)
    });
    if (result.status === 409 || result.error?.code === "REVISION_CONFLICT") {
      setConflict(result.error ?? { code: "REVISION_CONFLICT", message: "This item was updated elsewhere. Reload the latest version before saving again." });
      setMessage("This item was updated elsewhere. Reload the latest version before saving again.");
    } else if (result.data) {
      setMessage("KnowledgeItem saved successfully.");
      await loadKnowledge(organizationId);
    } else {
      setMessage(result.error?.message ?? "KnowledgeItem save failed.");
    }
    setSaving(false);
  }

  async function reloadLatest() {
    setConflict(null);
    setMessage("Reloading the latest KnowledgeItem from the server…");
    await loadKnowledge(organizationId);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Acceptance-only surface</p>
          <h1 className="mt-2 text-2xl font-bold">KnowledgeItem revision closure</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            This gated page uses the real authenticated organization Knowledge GET/PUT routes. It is intentionally absent unless the controlled operator sets <code>OIP_ENABLE_KNOWLEDGE_CONCURRENCY_HARNESS=1</code>.
          </p>
        </header>

        <section className="grid gap-4 rounded-2xl border border-slate-700 bg-slate-900 p-6 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-200">
            Disposable organization
            <select className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 font-normal" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
              <option value="">Select organization</option>
              {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-200">
            KnowledgeItem
            <select className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 font-normal" value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setConflict(null); }}>
              <option value="">Select item</option>
              {items.map((item) => <option key={item.id} value={item.id}>{item.title} (rev {item.revision ?? "?"})</option>)}
            </select>
          </label>
          <div className="md:col-span-2 rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-300" data-testid="harness-status" role="status">
            {loading ? "Loading…" : message}
          </div>
        </section>

        {selectedItem && (
          <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">{selectedOrganization?.name ?? organizationId}</p>
                <p className="mt-1 text-sm text-slate-300">KnowledgeItem ID <code data-testid="knowledge-id">{selectedItem.id}</code></p>
              </div>
              <p className="rounded-full bg-sky-950 px-3 py-1 text-sm font-semibold text-sky-200" data-testid="current-revision">Loaded revision {selectedItem.revision ?? "unknown"}</p>
            </div>
            <label className="mt-6 block text-sm font-semibold text-slate-200">
              Editable title
              <input data-testid="knowledge-title" className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 font-normal" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
            </label>
            <div className="mt-4 flex flex-wrap gap-3">
              <button data-testid="save-knowledge" type="button" disabled={saving || loading || !draftTitle.trim()} onClick={() => void saveKnowledgeItem()} className="rounded-lg bg-sky-500 px-4 py-2 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving…" : "Save KnowledgeItem"}</button>
              {conflict && <button data-testid="reload-latest" type="button" onClick={() => void reloadLatest()} className="rounded-lg bg-amber-400 px-4 py-2 font-semibold text-slate-950">Reload latest</button>}
            </div>
            {conflict && (
              <div data-testid="revision-conflict" className="mt-4 rounded-lg border border-amber-500/60 bg-amber-950/40 p-4 text-sm text-amber-100" role="alert">
                <p className="font-semibold">Updated elsewhere</p>
                <p className="mt-1">This item was updated elsewhere. Reload the latest version before saving again.</p>
                <details className="mt-3 text-xs text-amber-200/80"><summary>Safe diagnostic details</summary><pre className="mt-2 whitespace-pre-wrap">{JSON.stringify({ code: conflict.code, resourceType: conflict.resourceType, resourceId: conflict.resourceId, expectedRevision: conflict.expectedRevision, currentRevision: conflict.currentRevision }, null, 2)}</pre></details>
              </div>
            )}
          </section>
        )}

        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Targeted browser request evidence</h2>
          <p className="mt-2 text-xs text-slate-400">This is a diagnostic summary of the requests made by this page; it never exposes cookies or tokens.</p>
          {lastRequest && <p data-testid="last-request" className="mt-3 rounded-lg bg-slate-950 p-3 font-mono text-xs text-slate-200">{lastRequest.method} {lastRequest.path} → HTTP {lastRequest.status}{lastRequest.code ? ` · ${lastRequest.code}` : ""}{lastRequest.resourceType ? ` · resourceType=${lastRequest.resourceType}` : ""}</p>}
          <div className="mt-3 space-y-1 font-mono text-[11px] text-slate-400">
            {requestHistory.map((entry, index) => <p key={`${entry.method}-${entry.path}-${index}`}>{entry.method} {entry.path} → {entry.status}{entry.code ? ` ${entry.code}` : ""}{entry.currentRevision !== undefined ? ` currentRevision=${entry.currentRevision}` : ""}</p>)}
          </div>
        </section>
      </div>
    </main>
  );
}
