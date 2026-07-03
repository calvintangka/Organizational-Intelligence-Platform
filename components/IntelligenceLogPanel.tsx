"use client";

import { useState } from "react";
import { formatLogTime } from "@/lib/intelligenceLog";
import type { IntelligenceLogEntry } from "@/types/oip";

interface IntelligenceLogPanelProps {
  entries: IntelligenceLogEntry[];
}

export function IntelligenceLogPanel({ entries }: IntelligenceLogPanelProps) {
  const [open, setOpen] = useState(true);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-soft">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-5 text-left"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-signal">
            OIP Engine
          </span>
          <span className="font-semibold text-ink">Intelligence Log</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
            {entries.length} events
          </span>
        </div>
        <span className="text-slate-400 text-sm">{open ? "▲ collapse" : "▼ expand"}</span>
      </button>

      {open ? (
        <div className="border-t border-slate-100 px-5 pb-5">
          {entries.length === 0 ? (
            <p className="pt-4 text-sm text-slate-500">No events yet. Analyze a ticket to start the log.</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {entries.map((entry, index) => (
                <li key={entry.id} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-signal">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{entry.event}</p>
                    {entry.detail ? (
                      <p className="mt-0.5 text-xs leading-5 text-slate-500">{entry.detail}</p>
                    ) : null}
                    <p className="mt-0.5 font-mono text-xs text-slate-400">{formatLogTime(entry.timestamp)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </section>
  );
}
