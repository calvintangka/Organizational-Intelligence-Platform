"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthorization } from "@/components/AuthorizationContext";

type GovernedAction = {
  id: string;
  actionType: string;
  targetId: string;
  status: string;
  riskLevel: string;
  reversibility: string;
  proposedPayload?: { label?: string };
  preparationReason?: string;
  policyDecision?: { failedRules?: string[]; evidenceSummary?: string[] };
  approvedByActorId?: string | null;
  executionJobId?: string | null;
  executedAt?: string | null;
  ledger?: Array<{ eventType: string; safeReason: string; createdAt: string }>;
};

export function GovernedActionsPanel({ organizationId, darkMode, accentColor }: { organizationId: string; darkMode: boolean; accentColor: string }) {
  const { can } = useAuthorization();
  const [actions, setActions] = useState<GovernedAction[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const panel = darkMode ? "border-[#24344d] bg-[#111827]" : "border-slate-200 bg-white";
  const muted = darkMode ? "text-slate-400" : "text-slate-500";
  const heading = darkMode ? "text-white" : "text-[#111827]";

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/governed-actions?limit=50`, { cache: "no-store" });
      const payload = await response.json() as { data?: GovernedAction[]; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Governed actions could not be loaded.");
      setActions(payload.data ?? []);
      setError("");
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Governed actions could not be loaded."); }
  }, [organizationId]);

  useEffect(() => { void load(); }, [load]);

  const decide = async (action: GovernedAction, decision: "approved" | "rejected") => {
    setBusy(action.id);
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/governed-actions/${encodeURIComponent(action.id)}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "The governed action decision failed.");
      await load();
    } catch (decisionError) { setError(decisionError instanceof Error ? decisionError.message : "The governed action decision failed."); }
    finally { setBusy(""); }
  };

  const requestReversal = async (action: GovernedAction) => {
    setBusy(action.id);
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/governed-actions/${encodeURIComponent(action.id)}/reverse`, { method: "POST" });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "The reversal request failed.");
      await load();
    } catch (reversalError) { setError(reversalError instanceof Error ? reversalError.message : "The reversal request failed."); }
    finally { setBusy(""); }
  };

  return <section className={`mt-5 rounded-2xl border p-5 ${panel}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className={`font-bold ${heading}`}>Governed actions</h2><p className={`mt-1 text-xs ${muted}`}>Human-approved, reversible ticket label actions. No customer messages or memory changes are performed.</p></div><button type="button" onClick={() => void load()} className="rounded-lg px-3 py-2 text-xs font-semibold text-white" style={{ backgroundColor: accentColor }}>Refresh</button></div>
    {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
    <div className="mt-4 space-y-3">{actions.map((action) => <div key={action.id} className="rounded-xl border border-slate-200/20 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{action.actionType} · {action.proposedPayload?.label ?? "label"}</p><p className={`mt-1 text-xs ${muted}`}>Ticket {action.targetId} · {action.riskLevel} risk · {action.reversibility}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{action.status}</span></div><p className={`mt-2 text-xs ${muted}`}>{action.preparationReason ?? "Deterministic governed action."}</p>{action.policyDecision?.failedRules?.length ? <p className="mt-1 text-xs text-rose-600">Policy failures: {action.policyDecision.failedRules.join(", ")}</p> : <p className={`mt-1 text-xs ${muted}`}>Policy checks passed; explicit approval required.</p>}<div className="mt-3 flex flex-wrap gap-2">{action.status === "awaiting_approval" && can("action.approve") && <><button type="button" disabled={busy === action.id} onClick={() => void decide(action, "approved")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Approve</button><button type="button" disabled={busy === action.id} onClick={() => void decide(action, "rejected")} className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Reject</button></>}{action.status === "succeeded" && action.actionType === "ticket.label.apply" && can("action.prepare") && <button type="button" disabled={busy === action.id} onClick={() => void requestReversal(action)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Request reversal</button>}</div></div>)}{!actions.length && <p className={`text-sm ${muted}`}>No governed actions have been prepared.</p>}</div>
  </section>;
}
