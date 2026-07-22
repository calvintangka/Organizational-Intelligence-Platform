/* Idempotently grant the configured development user access to mature server orgs. */
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const email = process.env.AUTH_DEVELOPMENT_USER_EMAIL?.trim().toLowerCase();
const organizationIds = [
  "profile-maesa-tech",
  "profile-fastdrop-logistics",
  "profile-oip-developer-demo"
];

async function main() {
  if (!email) throw new Error("AUTH_DEVELOPMENT_USER_EMAIL must identify the existing development user.");
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const user = await db.query("SELECT id FROM users WHERE email = $1", [email]);
    if (user.rowCount !== 1) throw new Error(`Expected exactly one development user for ${email}.`);
    const result = await db.query(
      'INSERT INTO organization_memberships ("userId", "organizationId", role) SELECT $1, id, \'member\' FROM organizations WHERE id = ANY($2::text[]) ON CONFLICT ("userId", "organizationId") DO NOTHING',
      [user.rows[0].id, organizationIds]
    );
    console.log(`Development memberships ensured for ${email}; inserted ${result.rowCount ?? 0} row(s).`);
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
