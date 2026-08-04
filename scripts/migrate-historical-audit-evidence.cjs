/*
 * TODO-065 Historical Audit Evidence Migration.
 *
 * The default target is the accepted Developer Demo organization so the
 * required dry-run command is copy/pasteable. Confirmation is always explicit;
 * no write is possible from the default invocation.
 */
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();
const {
  runHistoricalAuditMigration
} = require(path.join(root, "lib", "server", "historicalAuditMigrationService.ts"));

const DEFAULT_ORGANIZATION = "profile-oip-developer-demo";

function argument(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((entry) => entry.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const dryRun = process.argv.includes("--dry-run") || !confirm;
  const json = process.argv.includes("--json");
  if (confirm && process.argv.includes("--dry-run")) throw new Error("Choose exactly one of --dry-run or --confirm.");
  const organizationId = argument("organization") || DEFAULT_ORGANIZATION;
  const result = await runHistoricalAuditMigration(organizationId, { confirm: !dryRun });
  const summary = {
    mode: result.mode,
    organizationId: result.organizationId,
    writesPerformed: result.writesPerformed,
    rowsChanged: result.rowsChanged,
    recordsInspected: result.inventory.recordsInspected,
    eligibleRecords: result.inventory.eligibleRecords,
    classificationCounts: result.inventory.classificationCounts,
    auditStates: result.inventory.auditStates,
    expectedRowCountChanges: result.inventory.expectedRowCountChanges,
    expectedUpdatedRows: result.inventory.expectedUpdatedRows,
    beforeDigest: result.inventory.beforeDigest,
    afterDigest: result.afterDigest,
    idempotentNoOp: result.idempotentNoOp,
    unresolvedFindings: result.inventory.findings.filter((finding) => finding.classification === "INCOMPLETE_BUT_PRESERVABLE" || finding.classification === "CONFLICTED").length,
    privacyReviewFindings: result.inventory.findings.filter((finding) => finding.classification === "DO_NOT_TOUCH").length
  };
  process.stdout.write(`${JSON.stringify(json ? result : summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`TODO-065 historical audit migration refused/failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
