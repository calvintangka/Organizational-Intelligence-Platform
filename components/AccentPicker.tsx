"use client";

import { normalizeAccentColor } from "@/lib/organizationProfile";

export const ACCENT_SWATCHES = [
  "#2563EB", // blue
  "#0F766E", // teal
  "#7C3AED", // violet
  "#DB2777", // pink
  "#F59E0B", // amber
  "#DC2626", // red
  "#059669", // emerald
  "#0EA5E9", // sky
];

export function AccentPicker({
  value,
  onChange,
  darkMode,
}: {
  value: string;
  onChange: (hex: string) => void;
  darkMode: boolean;
}) {
  const current = normalizeAccentColor(value);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {ACCENT_SWATCHES.map((hex) => {
          const selected = current.toUpperCase() === hex.toUpperCase();
          return (
            <button
              key={hex}
              type="button"
              aria-label={`Accent ${hex}`}
              onClick={() => onChange(hex)}
              className={`h-7 w-7 rounded-full transition-transform hover:scale-110 ${selected ? "ring-2 ring-offset-2" : ""} ${darkMode ? "ring-offset-[#1a2b3c]" : "ring-offset-white"}`}
              style={{ backgroundColor: hex, ...(selected ? { boxShadow: `0 0 0 2px ${hex}` } : {}) }}
            />
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span
          className="h-6 w-6 flex-shrink-0 rounded-md border border-black/10"
          style={{ backgroundColor: current }}
        />
        <input
          value={current}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#2563EB"
          spellCheck={false}
          className={`w-28 rounded-lg border px-2 py-1 text-xs font-mono outline-none transition focus:ring-2 focus:ring-blue-200 ${darkMode ? "bg-[#111827] border-[#2d3f52] text-white" : "bg-white border-slate-200 text-[#111827]"}`}
        />
      </div>
    </div>
  );
}
