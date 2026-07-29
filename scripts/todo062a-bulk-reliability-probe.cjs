/*
 * TODO-062A — Bulk Upload Analysis Pipeline Reliability probe.
 *
 * Read-only with respect to organizational memory: it exercises
 * analyzeBulkEntries() (which is pure analysis — no persistence) and never
 * commits a cluster. Every run captures a full progress trace with wall-clock
 * timestamps plus a per-AI-call ledger, so the reported "stuck at 99%" window
 * can be measured rather than assumed.
 *
 * Modes:
 *   --mode=instant    stub adapter, zero-latency. Isolates the progress
 *                     contract from provider latency.
 *   --mode=live       real AI adapter against the configured provider chain.
 *   --mode=hostile    stub adapter that reproduces controlled provider
 *                     failures (timeout, 500, 502, malformed, disconnect).
 *   --mode=hang       provider promise that NEVER settles. Proves the pipeline
 *                     still terminates via the per-call watchdog.
 *   --mode=cancel     aborts mid-run. Proves cancellation is honoured.
 *
 * --rows=N,N,...      dataset sizes to run (default 10,25,50,75,100).
 */
const fs = require("node:fs");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();

const { parseBulkUploadFile, analyzeBulkEntries } = require(path.join(root, "lib", "bulkUpload.ts"));

const DEMO = "profile-oip-developer-demo";
const FIXTURE = path.join(root, "tmp", "TODO-062-developer-bulk.csv");

function arg(name, fallback) {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const mode = arg("mode", "instant");
const rowSizes = arg("rows", "10,25,50,75,100").split(",").map((value) => Number(value.trim())).filter(Boolean);
const failureKind = arg("failure", "timeout");

// ---------------------------------------------------------------- stub tiers

function stubResult(ok, data, error) {
  return {
    ok,
    providerMode: "lmstudio",
    providerLabel: "LM Studio",
    model: "stub",
    latencyMs: 0,
    ...(ok ? { data } : { error })
  };
}

function instantProvider() {
  return {
    mode: "lmstudio",
    label: "Stub (instant)",
    async discriminateMatch() {
      return stubResult(true, { isDistinctFromMatch: false, confidence: "high", reasoning: "stub" });
    },
    async suggestCanonicalProblem(input) {
      return stubResult(true, { title: input.deterministicCanonicalProblem.title, confidence: 90, rationale: "stub" });
    },
    async analyzeTicket() { return stubResult(false, null, "unused"); },
    async suggestPatternName() { return stubResult(false, null, "unused"); },
    async enrichKnowledge() { return stubResult(false, null, "unused"); },
    async draftCustomerResponse() { return stubResult(false, null, "unused"); }
  };
}

/**
 * Reproduces the controlled provider failures required by Part F. "disconnect"
 * and "hang" are the interesting ones: they model an upstream that never
 * answers, which is exactly the shape a permanently-stuck run would have.
 */
function hostileProvider(kind) {
  const failures = {
    timeout: () => stubResult(false, null, "AI request timed out after 90000ms"),
    http500: () => stubResult(false, null, "HTTP 500: internal server error"),
    http502: () => stubResult(false, null, "HTTP 502: bad gateway"),
    malformed: () => stubResult(false, null, "AI response did not contain valid JSON"),
    truncated: () => stubResult(false, null, "AI output truncated before valid JSON"),
    disconnect: () => { throw new Error("socket hang up"); },
    hang: () => new Promise(() => {})
  };
  const fail = failures[kind] ?? failures.timeout;
  return {
    mode: "lmstudio",
    label: `Stub (hostile: ${kind})`,
    async discriminateMatch() { return fail(); },
    async suggestCanonicalProblem() { return fail(); },
    async analyzeTicket() { return fail(); },
    async suggestPatternName() { return fail(); },
    async enrichKnowledge() { return fail(); },
    async draftCustomerResponse() { return fail(); }
  };
}

/** Wraps any provider so every AI call is timed and recorded. */
function instrument(provider, ledger) {
  const wrapped = { mode: provider.mode, label: provider.label };
  for (const method of [
    "discriminateMatch",
    "suggestCanonicalProblem",
    "analyzeTicket",
    "suggestPatternName",
    "enrichKnowledge",
    "draftCustomerResponse"
  ]) {
    wrapped[method] = async (input) => {
      const startedAt = Date.now();
      try {
        const result = await provider[method](input);
        ledger.push({
          method,
          ok: !!result.ok,
          latencyMs: Date.now() - startedAt,
          providerLabel: result.providerLabel,
          error: result.error,
          attempts: result.diagnostics && result.diagnostics.attempts
            ? result.diagnostics.attempts.map((a) => `${a.label}:${a.status}`)
            : undefined
        });
        return result;
      } catch (error) {
        ledger.push({ method, ok: false, latencyMs: Date.now() - startedAt, threw: String(error) });
        throw error;
      }
    };
  }
  return wrapped;
}

// ------------------------------------------------------------------ analysis

function summarizeProgress(events, startedAt) {
  let worstGapMs = 0;
  let worstGapAfter = null;
  for (let i = 1; i < events.length; i += 1) {
    const gap = events[i].atMs - events[i - 1].atMs;
    if (gap > worstGapMs) {
      worstGapMs = gap;
      worstGapAfter = events[i - 1];
    }
  }
  const last = events[events.length - 1];
  const lastRowEvent = [...events].reverse().find((event) => event.currentLabel.startsWith("Analyzing"));
  return {
    events: events.length,
    firstPercent: events[0] ? events[0].percent : null,
    lastPercent: last ? last.percent : null,
    lastLabel: last ? last.currentLabel : null,
    reached100: !!last && last.percent === 100,
    // Wall clock spent after the final per-row event. Pre-fix this was one
    // unbroken silence (the symptom); post-fix the clustering phase reports
    // inside this window, so judge the symptom by worstGapMs instead — that is
    // the longest the UI can sit without any update at all.
    msAfterLastRowEvent: lastRowEvent ? (last ? last.atMs - lastRowEvent.atMs : Date.now() - startedAt - lastRowEvent.atMs) : null,
    lastRowLabel: lastRowEvent ? `${lastRowEvent.currentLabel} (${lastRowEvent.percent}%)` : null,
    worstGapMs,
    worstGapAfter: worstGapAfter ? `${worstGapAfter.currentLabel} (${worstGapAfter.percent}%)` : null,
    percentSequenceTail: events.slice(-6).map((event) => event.percent)
  };
}

async function runOnce(entries, provider, label, extra) {
  const persistence = require(path.join(root, "lib", "server", "persistenceService.ts"));
  const organizationProfile = await persistence.getOrganizationProfile(DEMO);
  const knowledgeItems = await persistence.loadKnowledge(DEMO);

  const ledger = [];
  const progressEvents = [];
  const startedAt = Date.now();
  const heapBefore = process.memoryUsage().heapUsed;

  const aiAdapter = {
    config: { mode: "lmstudio", baseUrl: "", model: "probe", timeoutMs: 30000, proxyPath: "/api/ai/chat" },
    provider: instrument(provider, ledger)
  };

  let result = null;
  let failure = null;
  let failureName = null;
  try {
    result = await analyzeBulkEntries({
      entries,
      organizationProfile,
      knowledgeItems,
      aiAdapter,
      ...(extra || {}),
      onProgress: (progress) => {
        progressEvents.push({ ...progress, atMs: Date.now() - startedAt });
        if (extra && extra.onProgressHook) extra.onProgressHook(progress);
      }
    });
  } catch (error) {
    failure = String(error && error.message ? error.message : error);
    failureName = error && error.name;
  }

  const elapsedMs = Date.now() - startedAt;
  const okCalls = ledger.filter((call) => call.ok).length;
  const latencies = ledger.map((call) => call.latencyMs).sort((a, b) => a - b);

  return {
    label,
    rows: entries.length,
    terminated: true,
    elapsedMs,
    failure,
    failureName,
    progress: summarizeProgress(progressEvents, startedAt),
    aiCalls: {
      total: ledger.length,
      ok: okCalls,
      failed: ledger.length - okCalls,
      byMethod: ledger.reduce((acc, call) => {
        acc[call.method] = (acc[call.method] ?? 0) + 1;
        return acc;
      }, {}),
      medianLatencyMs: latencies.length ? latencies[Math.floor(latencies.length / 2)] : 0,
      maxLatencyMs: latencies.length ? latencies[latencies.length - 1] : 0,
      sampleErrors: [...new Set(ledger.filter((c) => !c.ok).map((c) => c.error ?? c.threw))].slice(0, 4)
    },
    outcome: result
      ? {
          total: result.total,
          clusters: result.clusters.length,
          clustered: result.clusters.reduce((sum, cluster) => sum + cluster.count, 0),
          unclustered: result.unclustered.count,
          analysisMode: result.analysisMode,
          providerLabel: result.providerLabel
        }
      : null,
    heapDeltaMB: Number(((process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024).toFixed(1))
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  if (!fs.existsSync(FIXTURE)) {
    console.error(`Fixture missing: ${FIXTURE}. Run: node scripts/todo062-generate-fixture.cjs`);
    process.exit(1);
  }

  const parsed = parseBulkUploadFile("TODO-062-developer-bulk.csv", fs.readFileSync(FIXTURE, "utf8"));
  if (parsed.needsMapping) {
    console.error("Fixture unexpectedly requires column mapping.");
    process.exit(1);
  }

  const runs = [];
  for (const size of rowSizes) {
    const entries = parsed.entries.slice(0, size);
    let provider;
    let extra;

    if (mode === "live") {
      provider = require(path.join(root, "lib", "ai", "adapter.ts")).createAIAdapter().provider;
    } else if (mode === "hostile") {
      provider = hostileProvider(failureKind);
    } else if (mode === "hang") {
      // A provider that never settles is the only true "wait forever" shape.
      // A short watchdog keeps the probe quick while proving the mechanism.
      provider = hostileProvider("hang");
      extra = { aiCallWatchdogMs: 2000, aiBudgetMs: 6000 };
    } else if (mode === "cancel") {
      provider = instantProvider();
      const controller = new AbortController();
      extra = {
        signal: controller.signal,
        // Abort once the run is demonstrably underway.
        onProgressHook: (progress) => {
          if (progress.percent >= 20 && !controller.signal.aborted) controller.abort();
        }
      };
    } else {
      provider = instantProvider();
    }

    const run = await runOnce(
      entries,
      provider,
      `${mode}${mode === "hostile" ? `:${failureKind}` : ""}/${size}`,
      extra
    );
    runs.push(run);
    console.error(`[todo062a] ${run.label} done in ${run.elapsedMs}ms — reached100=${run.progress.reached100} worstGap=${run.progress.worstGapMs}ms`);
  }

  console.log(JSON.stringify({ mode, failureKind: mode === "hostile" ? failureKind : undefined, fixtureRows: parsed.entries.length, runs }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
