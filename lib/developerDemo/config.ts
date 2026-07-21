import { developerDemoProfile } from "@/data/developerDemoFoundation";
import type { DeveloperDemoSimulationConfig } from "@/lib/developerDemo/types";

export const DEFAULT_DEVELOPER_DEMO_SIMULATION_SEED = "oip-developer-demo-v1";

export function developerDemoSimulationConfig(
  seed = DEFAULT_DEVELOPER_DEMO_SIMULATION_SEED
): DeveloperDemoSimulationConfig {
  if (!seed.trim()) throw new Error("The developer-demo simulation seed must not be empty.");
  return {
    organizationId: "profile-oip-developer-demo",
    profile: developerDemoProfile,
    seed,
    rngAlgorithm: "xoshiro128ss-v1",
    contractVersion: 1,
    narrativeContentVersion: 1,
    historyStart: "2023-01-01T00:00:00.000Z",
    historyEnd: "2026-06-30T23:59:59.000Z",
    timeZone: "Asia/Jakarta",
    ticketPrefix: "OIP"
  };
}
