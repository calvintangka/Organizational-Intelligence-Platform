import type { ExplainabilityStrength } from "@/types";

/** Intrinsic retrieval points are ordinal ranking evidence, not probabilities. */
export function relevanceStrengthForScore(score: number | null | undefined): ExplainabilityStrength {
  if (!score || score <= 0) return "None";
  if (score >= 70) return "Strong";
  if (score >= 55) return "Moderate";
  return "Weak";
}
