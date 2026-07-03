interface ResetDemoButtonProps {
  onResetSession: () => void;
  onResetOrganization: () => void;
}

export function ResetDemoButton({ onResetSession, onResetOrganization }: ResetDemoButtonProps) {
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onResetSession}
        className="rounded-2xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        Reset Session
      </button>
      <button
        type="button"
        onClick={() => {
          const confirmed =
            typeof window === "undefined" ||
            window.confirm(
              "Reset Organization will permanently delete all persisted Organizational Memory (knowledge, trust scores, and lifetime metrics) and reseed defaults. Continue?"
            );
          if (confirmed) onResetOrganization();
        }}
        className="rounded-2xl border border-red-200 bg-white px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50"
      >
        Reset Organization
      </button>
      <p className="max-w-[14rem] text-xs text-slate-400">
        Session reset clears the current workflow only. Organization reset wipes persisted memory.
      </p>
    </div>
  );
}
