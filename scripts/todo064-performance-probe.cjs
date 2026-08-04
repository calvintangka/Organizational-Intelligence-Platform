/*
 * TODO-064: read-only performance instrumentation probe.
 *
 * This exercises the pure single-ticket stages and the production bulk analyzer
 * with deterministic AI disabled. It writes no organization, ticket, memory,
 * trust, lesson, or metrics data. Values are measured by lib/telemetry.ts.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness({ loadEnv: false });

const telemetry = require(path.join(root, "lib", "telemetry.ts"));
const { defaultOrganizationProfile } = require(path.join(root, "data", "seedOrganizationProfiles.ts"));
const { parseBulkUploadFile, analyzeBulkEntries } = require(path.join(root, "lib", "bulkUpload.ts"));
const { assessBusinessRelevanceForProfile, understandForProfile } = require(path.join(root, "lib", "analyzer.ts"));
const { classifyBusinessDomain } = require(path.join(root, "lib", "domainClassifier.ts"));
const { identifyCanonicalProblem } = require(path.join(root, "lib", "canonicalProblemEngine.ts"));
const { retrieveMemory } = require(path.join(root, "lib", "memory.ts"));
const { draftResponse } = require(path.join(root, "lib", "drafting.ts"));

telemetry.clearTelemetry();

function ticket(index) {
  return {
    id: `todo064-${index}`,
    customerName: "TODO-064 probe",
    subject: "Invoice shows a duplicate charge",
    description: "Our invoice contains a duplicate charge for the same subscription period.",
    category: "General",
    status: "new",
    createdAt: new Date().toISOString()
  };
}

function measureSingle(index) {
  const current = ticket(index);
  const text = `${current.subject} ${current.description}`;
  const relevance = telemetry.measureTelemetrySync("business_relevance", "pipeline", () => assessBusinessRelevanceForProfile(text, defaultOrganizationProfile), { unit: "tickets" });
  assert.equal(relevance.isRelevant, true);
  const domain = telemetry.measureTelemetrySync("domain_classification", "pipeline", () => classifyBusinessDomain(text, current.id, defaultOrganizationProfile), { unit: "tickets" });
  const understanding = telemetry.measureTelemetrySync("understanding", "pipeline", () => understandForProfile(current, defaultOrganizationProfile), { unit: "tickets" });
  const canonical = telemetry.measureTelemetrySync("canonical_selection", "pipeline", () => identifyCanonicalProblem(understanding, defaultOrganizationProfile), { unit: "tickets" });
  const matches = telemetry.measureTelemetrySync("memory_retrieval", "pipeline", () => retrieveMemory(understanding, [], new Set()), { unit: "tickets" });
  telemetry.measureTelemetrySync("ai_drafting", "pipeline", () => draftResponse(current, understanding, matches[0] ?? null, defaultOrganizationProfile, true), { unit: "requests" });
  return { category: understanding.category, domain: domain.primaryDomain, canonical: canonical.title };
}

function rows(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `csv-${index + 1}`,
    originalIndex: index,
    message: `Invoice shows a duplicate charge for subscription ${index + 1}`,
    sourceLabel: `probe row ${index + 1}`
  }));
}

const disabledAdapter = {
  config: { mode: "disabled" },
  provider: { label: "Disabled" }
};

async function measureBulk(count) {
  const content = ["message", ...rows(count).map((entry) => JSON.stringify(entry.message))].join("\n");
  const parsed = parseBulkUploadFile(`todo064-${count}.csv`, content);
  const result = await analyzeBulkEntries({
    entries: parsed.entries,
    organizationProfile: defaultOrganizationProfile,
    knowledgeItems: [],
    aiAdapter: disabledAdapter,
    aiBudgetMs: 1,
    aiCallWatchdogMs: 1
  });
  assert.equal(result.total, count);
  return result;
}

async function main() {
  const singleWorkloads = [1, 10, 50, 100];
  for (const count of singleWorkloads) {
    const startedAt = Date.now();
    for (let index = 0; index < count; index += 1) measureSingle(index);
    telemetry.recordTelemetryEvent({
      name: "stress_single_ticket",
      category: "pipeline",
      durationMs: Date.now() - startedAt,
      startedAt,
      endedAt: Date.now(),
      success: true,
      unit: "tickets",
      quantity: count,
      tags: { tickets: count }
    });
  }

  const bulkSizes = [1, 10, 25, 50, 100, 250, 500, 1000];
  for (const count of bulkSizes) await measureBulk(count);

  const snapshot = telemetry.getTelemetrySnapshot();
  console.log(JSON.stringify({
    verdict: "MEASURED",
    events: snapshot.events.length,
    summaries: snapshot.summaries.map((summary) => ({
      name: summary.name,
      category: summary.category,
      unit: summary.unit,
      tags: summary.tags,
      sampleCount: summary.sampleCount,
      averageMs: summary.averageMs,
      medianMs: summary.medianMs,
      p95Ms: summary.p95Ms,
      p99Ms: summary.p99Ms,
      standardDeviationMs: summary.standardDeviationMs,
      throughput: summary.throughput,
      successRate: summary.successRate,
      failureRate: summary.failureRate,
      timeoutRate: summary.timeoutRate,
      fallbackRate: summary.fallbackRate
    }))
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
