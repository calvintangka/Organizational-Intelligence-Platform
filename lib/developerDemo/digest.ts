import { createHash } from "node:crypto";
import { stableStringify } from "@/lib/persistence/migrationExportDigest";
import type { DeveloperDemoSimulation } from "@/lib/developerDemo/types";

type SimulationDigestInput = Omit<DeveloperDemoSimulation, "digest" | "integrity">;

/** Integrity is independently derived and the digest itself is self-referential, so both are excluded. */
export function computeDeveloperDemoSimulationDigest(simulation: SimulationDigestInput): string {
  return createHash("sha256").update(stableStringify(simulation), "utf8").digest("hex");
}
