const { installProbeHarness } = require("./lib/probe-harness.cjs");
installProbeHarness();
const { Client } = require("pg");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const organizations = await client.query(
      "select id, name, industry, description, settings from organizations where name ilike $1 order by name",
      ["%Developer%"]
    );
    for (const organization of organizations.rows) {
      const id = organization.id;
      const queries = {
        knowledgeItems: ['select count(*)::int as count from knowledge_items where "organizationId"=$1', []],
        candidates: ['select count(*)::int as count from knowledge_candidates where "organizationId"=$1', []],
        validations: ['select count(*)::int as count from validation_records where "organizationId"=$1', []],
        memoryChanges: ['select count(*)::int as count from memory_change_records where "organizationId"=$1', []],
        tickets: ['select count(*)::int as count from ticket_records where "organizationId"=$1', []],
        trustEvidence: ['select count(*)::int as count from trust_evidence where "organizationId"=$1', []],
        emergingPatterns: ['select count(*)::int as count from emerging_patterns where "organizationId"=$1', []],
        intelligenceLog: ['select count(*)::int as count from intelligence_log where "organizationId"=$1', []],
        metrics: ['select * from org_metrics where "organizationId"=$1', []],
        ticketSequence: ['select * from ticket_sequences where "organizationId"=$1', []]
      };
      const counts = {};
      for (const [key, [sql, params]] of Object.entries(queries)) {
        counts[key] = (await client.query(sql, [id, ...params])).rows;
      }
      const knowledge = await client.query(
        'select id,title,category,"canonicalProblemTitle","trustScore","timesSeen","timesReused",content from knowledge_items where "organizationId"=$1 order by "createdAt" desc',
        [id]
      );
      console.log(JSON.stringify({
        organization: { id: organization.id, name: organization.name, industry: organization.industry, description: organization.description, settings: organization.settings },
        counts,
        knowledge: knowledge.rows.map((item) => ({ id: item.id, title: item.title, category: item.category, canonicalProblemTitle: item.canonicalProblemTitle, trustScore: item.trustScore, timesSeen: item.timesSeen, timesReused: item.timesReused }))
      }, null, 2));
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
