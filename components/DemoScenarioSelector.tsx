"use client";

import { useState } from "react";
import type { Ticket } from "@/types";

interface DemoScenarioSelectorProps {
  tickets: Ticket[];
  selectedTicketId: string;
  onSelectTicket: (ticketId: string) => void;
  onStart: () => void;
  onStartCustom: (text: string) => void;
}

export function DemoScenarioSelector({
  tickets,
  selectedTicketId,
  onSelectTicket,
  onStart,
  onStartCustom
}: DemoScenarioSelectorProps) {
  const [customText, setCustomText] = useState("");
  const [mode, setMode] = useState<"seed" | "custom">(tickets.length > 0 ? "seed" : "custom");

  function handleStartCustom() {
    if (customText.trim().length < 10) return;
    onStartCustom(customText.trim());
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-signal">
            OIP Engine
          </span>
        </div>
        <h2 className="mt-2 text-2xl font-bold text-ink">Start with a support ticket</h2>
        <p className="mt-2 text-slate-600">
          Describe a real support issue. The deterministic engine analyzes it, retrieves any matching organizational knowledge, and drafts a response — no AI call is made unless an optional advisory is configured.
        </p>
      </div>

      {tickets.length > 0 && (
        <div className="flex gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setMode("seed")}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              mode === "seed" ? "bg-white shadow-sm text-ink" : "text-slate-500 hover:text-ink"
            }`}
          >
            Use seeded ticket
          </button>
          <button
            type="button"
            onClick={() => setMode("custom")}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              mode === "custom" ? "bg-white shadow-sm text-ink" : "text-slate-500 hover:text-ink"
            }`}
          >
            Type custom ticket
          </button>
        </div>
      )}

      {mode === "seed" ? (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {tickets.slice(0, 4).map((ticket) => {
              const isSelected = ticket.id === selectedTicketId;
              return (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => onSelectTicket(ticket.id)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    isSelected
                      ? "border-memory bg-blue-50"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {ticket.category}
                  </span>
                  <span className="mt-1 block font-semibold text-ink">{ticket.subject}</span>
                  <span className="mt-2 line-clamp-2 block text-sm text-slate-600">{ticket.description}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => onStart()}
            className="mt-6 rounded-2xl bg-ink px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-slate-700"
          >
            Start demo loop
          </button>
        </>
      ) : (
        <div className="mt-5 space-y-4">
          <div>
            <label className="text-sm font-semibold text-slate-700" htmlFor="custom-ticket">
              Describe the support issue
            </label>
            <p className="mt-0.5 text-xs text-slate-500">
              Example: "I cannot log in to my account after changing my password yesterday."
            </p>
            <textarea
              id="custom-ticket"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Type the customer's support issue here..."
              rows={5}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-800 outline-none transition focus:border-memory focus:ring-4 focus:ring-blue-100"
            />
            <p className="mt-1 text-right text-xs text-slate-400">{customText.length} characters</p>
          </div>
          <div className="rounded-2xl border border-purple-100 bg-purple-50 p-3 text-xs text-purple-900">
            The OIP engine will analyze this text using deterministic rules — no AI call is made.
          </div>
          <button
            type="button"
            onClick={handleStartCustom}
            disabled={customText.trim().length < 10}
            className="rounded-2xl bg-ink px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Start with my ticket
          </button>
        </div>
      )}
    </section>
  );
}
