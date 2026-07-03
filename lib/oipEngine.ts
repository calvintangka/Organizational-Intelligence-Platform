/**
 * OIP Engine — deterministic pipeline orchestrator.
 *
 * Pipeline: Observe → Understand → Retrieve → Reason → Confidence → Draft
 *
 * Each step remains deterministic and authoritative.
 * The page can layer optional AI advice on top without changing OIP ownership.
 */

export { assessBusinessRelevance, observe, understand, buildReasoning, buildConfidence } from "@/lib/analyzer";
export { retrieveMemory } from "@/lib/memory";
export { draftResponse } from "@/lib/drafting";
export { createLogEntry, formatLogTime } from "@/lib/intelligenceLog";
