/* TODO-025C deterministic, in-memory developer-demo simulator. No persistence imports. */
const path = require("node:path");
const { installProbeHarness } = require("../lib/probe-harness.cjs");
const { root } = installProbeHarness();
const { simulateDeveloperDemo } = require(path.join(root, "lib", "developerDemo", "simulator.ts"));

function requestedSeed(argv) {
  const seedArguments = argv.filter((argument) => argument.startsWith("--seed="));
  const unknown = argv.filter((argument) => !argument.startsWith("--seed="));
  if (unknown.length > 0 || seedArguments.length > 1) {
    throw new Error("Usage: npm run simulate:developer-demo -- [--seed=<deterministic-seed>]");
  }
  if (seedArguments.length === 0) return undefined;
  const seed = seedArguments[0].slice("--seed=".length);
  if (!seed.trim()) throw new Error("--seed must not be empty.");
  return seed;
}

function countByClass(arcs) {
  return arcs.reduce((counts, arc) => {
    counts[arc.arcClass] += 1;
    return counts;
  }, { HERO: 0, HIGH_FREQUENCY: 0, LONG_TAIL: 0 });
}

function trustDistribution(items) {
  return items.reduce((counts, item) => {
    const trust = item.trustScore ?? 0;
    if (trust >= 90) counts["90-100"] += 1;
    else if (trust >= 60) counts["60-89"] += 1;
    else if (trust >= 41) counts["41-59"] += 1;
    else if (trust >= 20) counts["20-40"] += 1;
    else counts.other += 1;
    return counts;
  }, { "90-100": 0, "60-89": 0, "41-59": 0, "20-40": 0, other: 0 });
}

function main() {
  const simulation = simulateDeveloperDemo(requestedSeed(process.argv.slice(2)));
  const knowledge = simulation.resources.knowledgeItems;
  console.log(JSON.stringify({
    organizationId: simulation.config.organizationId,
    seed: simulation.config.seed,
    digest: simulation.digest,
    history: { start: simulation.config.historyStart, end: simulation.config.historyEnd },
    arcs: { total: simulation.arcs.length, ...countByClass(simulation.arcs) },
    counts: {
      knowledgeItems: knowledge.length,
      lessons: knowledge.reduce((total, item) => total + (item.lessons?.length ?? 0), 0),
      tickets: simulation.resources.tickets.length,
      candidates: simulation.resources.candidates.length,
      validations: simulation.resources.validations.length,
      memoryChangeRecords: simulation.resources.memoryChanges.length,
      trustEvidenceIntents: simulation.resources.trustEvidenceIntents.length,
      knowledgeVersions: knowledge.reduce((total, item) => total + (item.knowledgeVersions?.length ?? 0), 0),
      actorsUsed: new Set([
        ...simulation.resources.tickets.map((ticket) => ticket.actorId),
        ...simulation.resources.validations.map((validation) => validation.actorId)
      ]).size
    },
    trustDistribution: trustDistribution(knowledge),
    ticketSequence: simulation.resources.ticketSequence.counter,
    representativeHeroArc: simulation.representativeHeroArc,
    integrity: simulation.integrity,
    persistenceWrites: 0
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
