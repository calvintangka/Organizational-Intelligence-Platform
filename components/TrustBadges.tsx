import type { KnowledgeItem, TrustDecision } from "@/types";
import { evaluateTrust, AUTO_THRESHOLD } from "@/lib/trustEngine";

/** Decision badge: Human Required / Human Recommended / Auto Resolved-eligible. */
export function DecisionBadge({ decision, resolved = false }: { decision: TrustDecision; resolved?: boolean }) {
  if (decision === "auto_resolution") {
    return (
      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-trust">
        {resolved ? "Auto Resolved" : "Auto Resolution Eligible"}
      </span>
    );
  }
  if (decision === "human_recommended") {
    return (
      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
        Human Recommended
      </span>
    );
  }
  return (
    <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-800">
      Human Required
    </span>
  );
}

/** Maturity badge: Learning / Maturing / Production Knowledge. */
export function MaturityBadge({ score, threshold = AUTO_THRESHOLD }: { score: number; threshold?: number }) {
  const { maturity } = evaluateTrust({ trustScore: score } as KnowledgeItem, threshold);
  if (maturity === "Production Knowledge") {
    return (
      <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-signal">
        Production Knowledge
      </span>
    );
  }
  if (maturity === "Maturing") {
    return (
      <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-memory">
        Knowledge Maturing
      </span>
    );
  }
  return (
    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
      Learning
    </span>
  );
}

/** Small "Trust Increasing" / "Trust Decreasing" pill driven by a delta. */
export function TrustDeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return null;
  if (delta > 0) {
    return (
      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-trust">
        ▲ Trust Increasing +{delta}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-700">
      ▼ Trust {delta}
    </span>
  );
}

/** Compact trust meter showing the 0–100 score with the auto-resolution threshold marked. */
export function TrustMeter({ score, label = "Trust", threshold = AUTO_THRESHOLD }: { score: number; label?: string; threshold?: number }) {
  const color = score >= threshold ? "bg-trust" : score >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
        <span>{label}</span>
        <span className="text-ink">{score}/100</span>
      </div>
      <div className="relative mt-1 h-2 w-full rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${color} transition-all duration-500`} style={{ width: `${score}%` }} />
        {/* auto-resolution threshold marker */}
        <div className="absolute top-0 h-2 w-px bg-slate-400" style={{ left: `${threshold}%` }} title="Auto-resolution threshold" />
      </div>
    </div>
  );
}
