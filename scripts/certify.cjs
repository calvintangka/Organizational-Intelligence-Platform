/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const reportPath = process.env.CERTIFICATION_REPORT_PATH
  ? path.resolve(root, process.env.CERTIFICATION_REPORT_PATH)
  : path.join(root, "docs", "OIP-CERTIFICATION-REPORT.md");
const startedAt = new Date();
const args = new Set(process.argv.slice(2));
const requestedStage = process.argv.slice(2).find((arg) => arg.startsWith("--stage="))?.slice(8);
const releaseMode = args.has("--release") || process.env.CERTIFICATION_RELEASE_MODE === "1";
const maxOutput = Number(process.env.CERTIFICATION_MAX_OUTPUT || 3000);

const stageOrder = [
  "build",
  "regression",
  "benchmark",
  "live-acceptance",
  "async",
  "chaos",
  "security",
  "performance",
  "memory",
  "multi-tenant",
  "governed",
  "connectors",
  "explainability",
];

const script = (name, label = name) => ({ label, command: "npm.cmd", args: ["run", name] });

const stages = {
  build: [
    { label: "TypeScript", command: "npx.cmd", args: ["tsc", "--noEmit"] },
    { label: "Prisma schema validation", command: "npx.cmd", args: ["prisma", "validate"] },
    { label: "Prisma migration status", command: "npx.cmd", args: ["prisma", "migrate", "status"] },
    { label: "Production build", command: "npm.cmd", args: ["run", "build"] },
    { label: "Production dependency audit", command: "npm.cmd", args: ["audit", "--audit-level=high", "--omit=dev"] },
    { label: "Release working-tree cleanliness", command: "git-clean-check" },
  ],
  regression: [
    script("probe:todo058-multilingual"),
    script("probe:todo058b-language-neutral-retrieval"),
    script("probe:todo060-business-inquiry"),
    script("probe:todo061-business-memory"),
    script("probe:todo062d-reflection"),
    script("probe:todo064-performance"),
    script("probe:todo067-atomic-validation"),
    script("probe:todo068-ticket-application-service"),
    script("probe:todo069-learning-application-service"),
    script("probe:todo070-stateless-persistence"),
    script("probe:todo072-async-bulk"),
    script("probe:todo073-reflection-worker"),
    script("probe:todo074-pattern-worker"),
    script("probe:todo075-dashboard"),
    script("probe:todo076-connector-installation"),
    script("probe:todo078-rbac"),
    script("probe:todo019-action"),
    script("probe:bug008-retrieval"),
    script("probe:bug009-profile-conflict-recovery"),
    script("probe:bug010-profile-pipeline"),
    script("probe:todo080-intent-isolation"),
  ],
  benchmark: [{ label: "OIP Benchmark v1", command: "node", args: ["scripts/oip-benchmark-v1.cjs"] }],
  "live-acceptance": [{ label: "TODO-079 live acceptance", command: "npm.cmd", args: ["run", "acceptance:todo079"] }],
  async: [
    script("probe:todo018-async-foundation"),
    script("probe:todo072-worker-recovery"),
    script("probe:todo072-bulk-cancellation"),
    script("probe:todo072-bulk-parity"),
    script("probe:todo073-reflection-recovery"),
    script("probe:todo073-reflection-cancel"),
    script("probe:todo073-reflection-parity"),
    script("probe:todo074-pattern-recovery"),
    script("probe:todo074-pattern-concurrency"),
    script("probe:todo074-pattern-multilingual"),
    script("probe:todo075-worker-health"),
    script("probe:todo075-dead-letter"),
  ],
  chaos: [
    script("probe:todo038-claude-failover"),
    script("probe:todo046"),
    script("probe:bug008-semantic"),
    script("probe:todo072-worker-recovery"),
    script("probe:todo073-reflection-recovery"),
    script("probe:todo074-pattern-recovery"),
  ],
  security: [
    script("probe:todo078-rbac"),
    script("probe:todo076-webhook-security"),
    script("probe:todo019-action"),
    script("probe:todo080-intent-isolation"),
  ],
  performance: [
    script("probe:todo064-performance"),
    script("probe:todo075-performance"),
    script("probe:todo025h-scale-responsiveness"),
  ],
  "multi-tenant": [
    script("probe:membership-authorization"),
    script("probe:active-organization"),
    script("probe:organization-switching"),
    script("probe:todo070-stateless-persistence"),
    script("probe:todo076-connector-tenancy"),
  ],
  governed: [script("probe:todo019-action"), script("probe:todo078-rbac")],
  connectors: [
    script("probe:todo076-connector-installation"),
    script("probe:todo076-webhook-security"),
    script("probe:todo076-connector-idempotency"),
    script("probe:todo076-connector-worker"),
    script("probe:todo076-connector-mapping"),
    script("probe:todo076-connector-tenancy"),
  ],
  explainability: [
    script("probe:todo051-match-explainability"),
    script("probe:todo049-reporting-coherence"),
    script("probe:todo080-intent-isolation"),
  ],
};

const memoryTables = [
  ["knowledge_items", "createdAt", "lastUpdatedAt"],
  ["knowledge_candidates", "createdAt", "createdAt"],
  ["validation_records", "timestamp", "timestamp"],
  ["trust_evidence", "createdAt", "createdAt"],
  ["memory_change_records", "timestamp", "timestamp"],
  ["prepared_reflections", "createdAt", "updatedAt"],
  ["emerging_patterns", "firstSeenAt", "lastSeenAt"],
  ["governed_actions", "createdAt", "updatedAt"],
  ["action_ledger_entries", "createdAt", "createdAt"],
];

function truncate(value) {
  const text = String(value || "");
  return text.length > maxOutput ? `${text.slice(-maxOutput)}\n[output truncated]` : text;
}

function runCommand(spec) {
  if (spec.command === "git-clean-check") {
    const result = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
    const dirty = (result.stdout || "").trim();
    const ok = !releaseMode || !dirty;
    return {
      label: spec.label,
      command: "git status --porcelain",
      exitCode: ok ? 0 : 1,
      ok,
      skipped: !releaseMode,
      output: releaseMode ? (dirty || "clean") : "not enforced (use --release or CERTIFICATION_RELEASE_MODE=1)",
    };
  }

  const windowsShell = process.platform === "win32";
  const result = spawnSync(windowsShell ? [spec.command, ...spec.args].join(" ") : spec.command, windowsShell ? [] : spec.args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CI: "1", CERTIFICATION_RUN: "1" },
    maxBuffer: 10 * 1024 * 1024,
    shell: windowsShell,
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  return {
    label: spec.label,
    command: [spec.command, ...spec.args].join(" "),
    exitCode: typeof result.status === "number" ? result.status : 1,
    ok: result.status === 0,
    skipped: false,
    rawOutput: output,
    output: truncate(output),
  };
}

async function captureMemorySnapshot() {
  let Client;
  try {
    require("dotenv").config({ path: path.join(root, ".env.local") });
    require("dotenv").config({ path: path.join(root, ".env") });
    ({ Client } = require("pg"));
    if (!process.env.DATABASE_URL) return { available: false, reason: "DATABASE_URL is not configured" };
  } catch (error) {
    return { available: false, reason: error.message };
  }

  let client = new Client({ connectionString: process.env.DATABASE_URL, ssl: false });
  try {
    try {
      await client.connect();
    } catch (firstError) {
      await client.end().catch(() => undefined);
      client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
      await client.connect().catch(() => { throw firstError; });
    }
    const tables = {};
    for (const [table, created, updated] of memoryTables) {
      const result = await client.query(
        `SELECT COUNT(*)::int AS count, MIN("${created}") AS first, MAX("${updated}") AS last FROM "${table}"`,
      );
      tables[table] = result.rows[0];
    }
    return { available: true, tables };
  } catch (error) {
    return { available: false, reason: error.message };
  } finally {
    await client.end().catch(() => undefined);
  }
}

function snapshotsEqual(before, after) {
  if (!before?.available || !after?.available) return false;
  return JSON.stringify(before.tables) === JSON.stringify(after.tables);
}

function parseBenchmark(output) {
  const line = String(output || "").split(/\r?\n/).find((item) => item.startsWith("CERTIFICATION_BENCHMARK_SUMMARY="));
  if (!line) return null;
  try { return JSON.parse(line.slice("CERTIFICATION_BENCHMARK_SUMMARY=".length)); } catch { return null; }
}

function parseTodo079(output) {
  const line = String(output || "").split(/\r?\n/).find((item) => item.startsWith("TODO079_ACCEPTANCE_SUMMARY="));
  if (!line) return null;
  try { return JSON.parse(line.slice("TODO079_ACCEPTANCE_SUMMARY=".length)); } catch { return null; }
}

function gitValue(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return (result.stdout || "").trim() || "unavailable";
}

function runStage(name) {
  const commands = stages[name] || [];
  const result = { name, status: "passed", commands: [], startedAt: new Date().toISOString() };
  for (const spec of commands) {
    const commandResult = runCommand(spec);
    result.commands.push(commandResult);
    const marker = commandResult.skipped ? "SKIP" : commandResult.ok ? "PASS" : "FAIL";
    console.log(`[${marker}] ${name}: ${commandResult.label}`);
    if (!commandResult.ok && !commandResult.skipped) {
      result.status = "failed";
      break;
    }
  }
  result.finishedAt = new Date().toISOString();
  return result;
}

function chooseVerdict(results, benchmark, liveAcceptance, memory) {
  const failed = results.find((stage) => stage.status === "failed");
  if (failed?.name === "security") return "SECURITY_FAILURE";
  if (failed?.name === "regression") return "REGRESSION_FAILURE";
  if (failed?.name === "memory" || (memory.before.available && memory.after.available && !memory.integrity)) return "DATA_INTEGRITY_FAILURE";
  if (failed?.name === "performance") return "PERFORMANCE_FAILURE";
  if (failed?.name === "chaos") return "CHAOS_FAILURE";
  if (liveAcceptance && liveAcceptance.executionStatus !== "passed") return "LIVE_ACCEPTANCE_FAILURE";
  if (liveAcceptance && liveAcceptance.score < liveAcceptance.releaseThreshold) return "LIVE_ACCEPTANCE_BELOW_THRESHOLD";
  if (benchmark && benchmark.securityPct < 100) return "SECURITY_FAILURE";
  if (failed) return "NOT_CERTIFIED";
  if (memory.before.available && !memory.after.available) return "CERTIFIED_WITH_LIMITATIONS";
  return releaseMode ? "CERTIFIED" : "CERTIFIED_WITH_LIMITATIONS";
}

function renderReport({ results, memory, benchmark, liveAcceptance, start, end, currentStatus }) {
  const verdict = chooseVerdict(results, benchmark, liveAcceptance, memory);
  const limitations = [];
  if (!releaseMode) limitations.push("Release cleanliness was not enforced; rerun with --release before tagging.");
  if (!memory.before.available || !memory.after.available) limitations.push(`Memory snapshot unavailable: ${memory.after.reason || memory.before.reason}.`);
  if (benchmark && !benchmark.passed) limitations.push(`OIP Benchmark v1 scored ${benchmark.overallPct}% against the 95% threshold.`);
  if (liveAcceptance && liveAcceptance.score < liveAcceptance.releaseThreshold) limitations.push(`TODO-079 scored ${liveAcceptance.score}/${liveAcceptance.maxScore}; release threshold is ${liveAcceptance.releaseThreshold}/${liveAcceptance.maxScore}.`);
  const lines = [
    "# OIP Certification Report",
    "",
    `- Verdict: **${verdict}**`,
    `- Run started: ${start.toISOString()}`,
    `- Run finished: ${end.toISOString()}`,
    `- Release mode: ${releaseMode ? "yes" : "no"}`,
    `- HEAD: \`${gitValue(["rev-parse", "HEAD"])}\``,
    `- Exact tag: \`${gitValue(["describe", "--tags", "--exact-match"])}\``,
    `- Current branch: \`${gitValue(["branch", "--show-current"])}\``,
    "",
    "## Release Gate",
    "",
    "| Stage | Status | Checks |",
    "| --- | --- | --- |",
  ];
  for (const stage of results) {
    lines.push(`| ${stage.name} | ${stage.status.toUpperCase()} | ${stage.commands.length} command(s) |`);
  }
  if (currentStatus) lines.push(`| report | ${currentStatus.toUpperCase()} | artifact generated |`);
  lines.push("", "## Benchmark", "");
  lines.push(benchmark
    ? `OIP Benchmark v1: ${benchmark.passedChecks}/${benchmark.totalChecks} checks (${benchmark.overallPct}%), security ${benchmark.securityPct}%. Thresholds: overall ${benchmark.thresholdOverall}%, security ${benchmark.thresholdSecurity}%.`
    : "Benchmark summary was not produced.");
  lines.push("", "## TODO-079 Live Acceptance", "");
  lines.push(liveAcceptance
    ? `TODO-079: ${liveAcceptance.score}/${liveAcceptance.maxScore} across ${liveAcceptance.datasetCases} cases, repeated ${liveAcceptance.repeatCount} time(s); deterministic execution ${liveAcceptance.executionStatus}; threshold ${liveAcceptance.releaseThreshold}/${liveAcceptance.maxScore}.`
    : "TODO-079 acceptance summary was not produced.");
  lines.push("", "## Memory Integrity", "");
  lines.push(`- Before snapshot available: ${memory.before.available ? "yes" : "no"}`);
  lines.push(`- After snapshot available: ${memory.after.available ? "yes" : "no"}`);
  lines.push(`- Unexpected memory mutations: ${memory.integrity === true ? "0" : memory.integrity === false ? "detected or unavailable" : "not evaluated"}`);
  lines.push("", "## Command Evidence", "");
  for (const stage of results) {
    for (const command of stage.commands) {
      lines.push(`### ${stage.name}: ${command.label}`, "", `- Command: \`${command.command}\``, `- Exit code: ${command.exitCode}`, "", "```text", command.output || "(no output)", "```", "");
    }
  }
  lines.push("## Limitations", "", ...(limitations.length ? limitations.map((item) => `- ${item}`) : ["- None recorded."]), "", "## Recommendation", "", verdict === "CERTIFIED" ? "Proceed to the next release step after an independent review of this artifact." : "Do not promote or tag this run as certified; resolve the recorded failures and rerun the release-mode gate.", "");
  return { verdict, text: lines.join("\n") };
}

async function main() {
  const valid = !requestedStage || stageOrder.includes(requestedStage);
  if (!valid) throw new Error(`Unknown stage '${requestedStage}'. Valid stages: ${stageOrder.join(", ")}`);
  const selected = requestedStage ? [requestedStage] : stageOrder;
  const results = [];
  const memoryBefore = await captureMemorySnapshot();
  let benchmark = null;
  let liveAcceptance = null;

  for (const name of selected) {
    if (name === "regression" && args.has("--skip-regressions")) {
      results.push({ name, status: "skipped", commands: [], startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() });
      console.log(`[SKIP] ${name}: --skip-regressions`);
      continue;
    }
    const result = runStage(name);
    results.push(result);
    const benchmarkCommand = result.commands.find((command) => command.label === "OIP Benchmark v1");
    if (benchmarkCommand) benchmark = parseBenchmark(benchmarkCommand.rawOutput || benchmarkCommand.output);
    const liveAcceptanceCommand = result.commands.find((command) => command.label === "TODO-079 live acceptance");
    if (liveAcceptanceCommand) liveAcceptance = parseTodo079(liveAcceptanceCommand.rawOutput || liveAcceptanceCommand.output);
    if (result.status === "failed") {
      console.log(`[STOP] critical stage '${name}' failed; later stages were not run.`);
      break;
    }
  }

  const memoryAfter = await captureMemorySnapshot();
  const memory = {
    before: memoryBefore,
    after: memoryAfter,
    integrity: memoryBefore.available && memoryAfter.available ? snapshotsEqual(memoryBefore, memoryAfter) : null,
  };
  const end = new Date();
  const rendered = renderReport({ results, memory, benchmark, liveAcceptance, start: startedAt, end, currentStatus: "generated" });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, rendered.text, "utf8");
  console.log(`CERTIFICATION_VERDICT=${rendered.verdict}`);
  console.log(`CERTIFICATION_REPORT=${reportPath}`);
  process.exitCode = rendered.verdict === "CERTIFIED" || rendered.verdict === "CERTIFIED_WITH_LIMITATIONS" ? 0 : 1;
}

main().catch((error) => {
  const text = `# OIP Certification Report\n\n- Verdict: **NOT_CERTIFIED**\n- Runner error: ${error.stack || error.message}\n`;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, text, "utf8");
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
