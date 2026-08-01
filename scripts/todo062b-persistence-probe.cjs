const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();
const { Client } = require("pg");
const persistence = require(`${root}/lib/server/persistenceService.ts`);

const ORG = "test-oip-regression";
const SIZES = [1, 10, 25, 50, 100];
const keys = SIZES.map((size) => `todo062b-probe-${size}`);

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const one = async (sql, params = []) => (await client.query(sql, params)).rows[0];
  const many = async (sql, params = []) => (await client.query(sql, params)).rows;
  const originalSequence = await one('select counter from ticket_sequences where "organizationId"=$1', [ORG]);
  const existing = await one('select count(*)::int as c from ticket_records where "organizationId"=$1 and "bulkUploadKey" = any($2)', [ORG, keys]);
  if (Number(existing.c) !== 0) throw new Error(`Refusing to reuse probe keys; ${existing.c} rows already exist.`);
  const results = [];
  try {
    for (const size of SIZES) {
      const uploadKey = `todo062b-probe-${size}`;
      const seeds = Array.from({ length: size }, (_, index) => ({
        uploadKey,
        entryId: `probe-${index + 1}`,
        rawMessage: `Disposable persistence probe ${size}/${index + 1}: ${"x".repeat(20)}`,
        subject: `Probe ${size}/${index + 1}`
      }));
      const firstStartedAt = Date.now();
      const first = await persistence.prepareBulkTicketRecords(ORG, seeds);
      const firstElapsedMs = Date.now() - firstStartedAt;
      const retryStartedAt = Date.now();
      const retry = await persistence.prepareBulkTicketRecords(ORG, seeds);
      const retryElapsedMs = Date.now() - retryStartedAt;
      const counts = await one('select count(*)::int as total,count(distinct "bulkEntryId")::int as distinct_entries from ticket_records where "organizationId"=$1 and "bulkUploadKey"=$2', [ORG, uploadKey]);
      results.push({ size, firstReturned: first.length, retryReturned: retry.length, persisted: Number(counts.total), distinctEntries: Number(counts.distinct_entries), firstElapsedMs, retryElapsedMs });
    }
    console.log(JSON.stringify({ organizationId: ORG, originalSequence: originalSequence ? Number(originalSequence.counter) : null, results }, null, 2));
  } finally {
    await client.query('delete from ticket_records where "organizationId"=$1 and "bulkUploadKey" = any($2)', [ORG, keys]);
    if (originalSequence) {
      await client.query('update ticket_sequences set counter=$1 where "organizationId"=$2', [originalSequence.counter, ORG]);
    } else {
      await client.query('delete from ticket_sequences where "organizationId"=$1', [ORG]);
    }
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
