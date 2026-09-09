const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { installProbeHarness } = require("./lib/probe-harness.cjs");

const { root } = installProbeHarness({ loadEnv: false });
const { OrganizationLogSaveQueue } = require(path.join(root, "lib", "persistence", "orgLogSaveQueue.ts"));
const pageSource = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
const persistenceServiceSource = fs.readFileSync(path.join(root, "lib", "server", "persistenceService.ts"), "utf8");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const queue = new OrganizationLogSaveQueue();
  const writes = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let synthetic500s = 0;

  function save(organizationId, label, delay, shouldFail = false) {
    return queue.enqueue(organizationId, async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      if (inFlight > 1) {
        synthetic500s += 1;
        inFlight -= 1;
        throw new Error("synthetic HTTP 500: overlapping snapshot transaction");
      }
      await wait(delay);
      if (shouldFail) {
        inFlight -= 1;
        throw new Error(`synthetic failure: ${label}`);
      }
      writes.push(`${organizationId}:${label}`);
      inFlight -= 1;
    });
  }

  const results = await Promise.allSettled([
    save("org-a", "first", 20),
    save("org-a", "second", 1),
    save("org-a", "third", 1)
  ]);
  assert.deepEqual(results.map((result) => result.status), ["fulfilled", "fulfilled", "fulfilled"]);
  assert.equal(maxInFlight, 1, "same-organization snapshots must never overlap");
  assert.equal(synthetic500s, 0, "serialized snapshots must avoid the reproduced overlap failure");
  assert.deepEqual(writes, ["org-a:first", "org-a:second", "org-a:third"]);

  // A failed save must not poison the organization's queue.
  const failed = await save("org-a", "failed", 1, true).then(() => false, () => true);
  assert.equal(failed, true);
  await save("org-a", "after-failure", 1);
  assert.equal(writes.at(-1), "org-a:after-failure");

  // Organizations are isolated: each has its own in-order chain.
  const isolatedOrder = [];
  await Promise.all([
    queue.enqueue("org-b", async () => {
      await wait(10);
      isolatedOrder.push("org-b");
    }),
    queue.enqueue("org-c", async () => {
      isolatedOrder.push("org-c");
    })
  ]);
  assert.deepEqual(isolatedOrder, ["org-c", "org-b"]);

  assert.match(pageSource, /OrganizationLogSaveQueue/);
  assert.match(pageSource, /enqueueOrgLogSave\(orgId, intelligenceLog, "save-organization-state-log"\)/);
  assert.match(pageSource, /enqueueOrgLogSave\(organizationProfile\.id, intelligenceLog, "save-log"\)/);
  assert.doesNotMatch(pageSource, /session\.saveOrgLog\(intelligenceLog\)/);
  assert.match(persistenceServiceSource, /export async function saveIntelligenceLog[\s\S]*?const organization = await requireOrganization\(organizationId\)/);

  console.log("OIP-V2-FIX-005 organization-log persistence regression: PASS");
  console.log("same-organization serialization: PASS");
  console.log("queue recovery after failed save: PASS");
  console.log("organization isolation: PASS");
  console.log("app integration coverage: PASS");
}

main().catch((error) => {
  console.error("OIP-V2-FIX-005 organization-log persistence regression: FAIL");
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
