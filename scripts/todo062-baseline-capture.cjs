/*
 * TODO-062 Part A / Part M — mature-data baseline capture.
 *
 * Strictly read-only. Captures every counter and every content fingerprint the
 * pass criteria require, so the post-test comparison can prove not just that
 * counts are stable but that existing knowledge/lesson TEXT, canonical IDs,
 * trust, provenance and version lineage are byte-identical.
 *
 * Usage:
 *   node scripts/todo062-baseline-capture.cjs > docs/TODO-062-BASELINE-<phase>.json
 */
const crypto = require("node:crypto");
const path = require("node:path");

const { installProbeHarness } = require("./lib/probe-harness.cjs");
const { root } = installProbeHarness();
const { Client } = require("pg");

const DEMO = "profile-oip-developer-demo";

function sha(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const count = async (table) =>
      (await client.query(`select count(*)::int as c from ${table} where "organizationId"=$1`, [DEMO])).rows[0].c;

    const counts = {
      knowledgeItems: await count("knowledge_items"),
      knowledgeCandidates: await count("knowledge_candidates"),
      validationRecords: await count("validation_records"),
      memoryChangeRecords: await count("memory_change_records"),
      ticketRecords: await count("ticket_records"),
      trustEvidence: await count("trust_evidence"),
      emergingPatterns: await count("emerging_patterns"),
      intelligenceLog: await count("intelligence_log")
    };

    const knowledge = (
      await client.query(
        'select id,title,category,"canonicalProblemId","canonicalProblemTitle","trustScore",' +
          '"timesSeen","timesReused","humanReviewCount","sourceTicketId","createdAt","lastUpdatedAt",revision,content ' +
          'from knowledge_items where "organizationId"=$1 order by id',
        [DEMO]
      )
    ).rows;

    // Lessons live inside knowledge_items.content. Fingerprint each one so any
    // silent edit to mature lesson text shows up as a digest change.
    let lessonCount = 0;
    const knowledgeFingerprints = knowledge.map((item) => {
      const content = item.content || {};
      const lessons = Array.isArray(content.lessons) ? content.lessons : [];
      lessonCount += lessons.length;
      return {
        id: item.id,
        canonicalProblemId: item.canonicalProblemId,
        canonicalProblemTitle: item.canonicalProblemTitle,
        category: item.category,
        trustScore: item.trustScore,
        timesSeen: item.timesSeen,
        timesReused: item.timesReused,
        humanReviewCount: item.humanReviewCount,
        sourceTicketId: item.sourceTicketId,
        createdAt: item.createdAt,
        lastUpdatedAt: item.lastUpdatedAt,
        revision: item.revision,
        lessonCount: lessons.length,
        lessonIds: lessons.map((l) => l.id ?? null),
        // Full content digest: catches ANY text change anywhere in the item.
        contentDigest: sha(content),
        lessonTextDigest: sha(
          lessons.map((l) => [l.id, l.rootCause, l.solution, l.customerResponse, l.signals])
        ),
        versionLineage: (content.knowledgeVersions ?? []).map((v) => `${v.version}:${v.versionId}`)
      };
    });

    const metrics = (await client.query('select * from org_metrics where "organizationId"=$1', [DEMO])).rows[0] ?? null;
    const sequence = (await client.query('select * from ticket_sequences where "organizationId"=$1', [DEMO])).rows[0] ?? null;
    const organization = (
      await client.query("select id,name,industry,description,settings from organizations where id=$1", [DEMO])
    ).rows[0];

    const trustTotal = knowledge.reduce((sum, item) => sum + (item.trustScore ?? 0), 0);

    const patterns = (
      await client.query(
        'select id,title,status,"timesSeen","confidenceScore" from emerging_patterns where "organizationId"=$1 order by id',
        [DEMO]
      )
    ).rows;

    console.log(
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          organizationId: DEMO,
          counts,
          derived: { lessonCount, trustTotal, canonicalCount: new Set(knowledge.map((k) => k.canonicalProblemId)).size },
          ticketSequenceCounter: sequence ? sequence.counter : null,
          profileRevision: organization && organization.settings ? organization.settings._profileRevision ?? null : null,
          organizationSettingsDigest: sha(organization ? organization.settings : null),
          metricsDigest: sha(metrics),
          knowledgeFingerprints,
          patterns,
          // Single digest over every mature knowledge item — the fastest
          // "did anything at all change" check.
          matureMemoryDigest: sha(knowledgeFingerprints)
        },
        null,
        2
      )
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
