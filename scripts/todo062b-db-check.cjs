const { installProbeHarness } = require("./lib/probe-harness.cjs");
installProbeHarness();
const { Client } = require("pg");

async function main() {
  const org = "profile-oip-developer-demo";
  const uploadKey = process.argv[2] || "bulk-d5ccce9c";
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const one = async (sql, params = []) => (await client.query(sql, params)).rows[0];
    const many = async (sql, params = []) => (await client.query(sql, params)).rows;
    const result = {
      organizationId: org,
      uploadKey,
      counts: {
        tickets: Number((await one('select count(*)::int as c from ticket_records where "organizationId"=$1', [org])).c),
        bulkTickets: Number((await one('select count(*)::int as c from ticket_records where "organizationId"=$1 and "bulkUploadKey"=$2', [org, uploadKey])).c),
        distinctEntryIds: Number((await one('select count(distinct "bulkEntryId")::int as c from ticket_records where "organizationId"=$1 and "bulkUploadKey"=$2', [org, uploadKey])).c),
        duplicateKeys: Number((await one('select count(*)::int as c from (select "bulkUploadKey","bulkEntryId",count(*) from ticket_records where "organizationId"=$1 and "bulkUploadKey"=$2 group by 1,2 having count(*)>1) x', [org, uploadKey])).c),
        classified: Number((await one('select count(*)::int as c from ticket_records where "organizationId"=$1 and "bulkUploadKey"=$2 and classification is not null', [org, uploadKey])).c),
        clustered: Number((await one('select count(*)::int as c from ticket_records where "organizationId"=$1 and "bulkUploadKey"=$2 and "bulkClusterId" is not null', [org, uploadKey])).c),
        withRawMessage: Number((await one('select count(*)::int as c from ticket_records where "organizationId"=$1 and "bulkUploadKey"=$2 and "rawMessage" is not null', [org, uploadKey])).c)
      },
      statuses: await many('select status,count(*)::int as count from ticket_records where "organizationId"=$1 and "bulkUploadKey"=$2 group by status order by status', [org, uploadKey]),
      languages: await many('select classification->\'language\'->>\'detected\' as language,count(*)::int as count from ticket_records where "organizationId"=$1 and "bulkUploadKey"=$2 group by 1 order by 1', [org, uploadKey]),
      ticketRange: await many('select min("ticketId") as first,max("ticketId") as last from ticket_records where "organizationId"=$1 and "bulkUploadKey"=$2', [org, uploadKey]),
      sequence: await one('select counter from ticket_sequences where "organizationId"=$1', [org]),
      samples: await many('select id,"ticketId","bulkEntryId","bulkClusterId",status,"intakeMode",classification->>\'canonicalProblem\' as canonical from ticket_records where "organizationId"=$1 and "bulkUploadKey"=$2 order by id limit 5', [org, uploadKey]),
      allTicketIds: (await many('select "bulkEntryId","ticketId" from ticket_records where "organizationId"=$1 and "bulkUploadKey"=$2 order by "bulkEntryId"', [org, uploadKey])).map((row) => ({ entryId: row.bulkEntryId, ticketId: row.ticketId }))
    };
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
