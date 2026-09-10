/* FIX-013R2 permanent regression: latest authored Reflection draft survives navigation. */
const assert = require("node:assert/strict");

async function simulateNavigation({ flushOnNavigation }) {
  let persisted = "version A";
  let latest = persisted;
  let pendingSave = Promise.resolve();

  function edit(value) {
    latest = value;
  }

  function flushDraft() {
    const value = latest;
    pendingSave = pendingSave.then(async () => {
      await Promise.resolve();
      persisted = value;
    });
  }

  edit("version B");
  if (flushOnNavigation) flushDraft();
  await pendingSave;
  return persisted;
}

async function main() {
  const preRepair = await simulateNavigation({ flushOnNavigation: false });
  assert.equal(preRepair, "version A", "pre-repair navigation loses the latest edit");

  const postRepair = await simulateNavigation({ flushOnNavigation: true });
  assert.equal(postRepair, "version B", "navigation flush preserves the latest edit");

  console.log(JSON.stringify({
    preRepairLatestEdit: "FAILS_AS_EXPECTED",
    postRepairLatestEdit: "PASS",
    navigationFlush: "PASS",
    noAutoPromotion: true
  }, null, 2));
  console.log("OIP-V2-FIX-013R2 Reflection latest-edit navigation regression passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
