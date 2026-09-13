/* Disposable authenticated owner fixture for live migration HTTP probes. */
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { Client } = require("pg");

const scrypt = promisify(crypto.scrypt);

async function passwordHash(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

async function createMigrationHttpAuth(baseUrl, organizationIds, prefix) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the migration HTTP auth fixture.");

  const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
  const userId = `${prefix}-user-${suffix}`;
  const email = `${userId}@example.test`;
  const password = `${prefix}-${suffix}-safe-password!`;
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  try {
    await db.query(
      'insert into users (id,name,email,"passwordHash","activeOrganizationId","updatedAt") values ($1,$2,$3,$4,$5,current_timestamp)',
      [userId, `${prefix} Owner`, email, await passwordHash(password), organizationIds[0]]
    );
    for (const organizationId of organizationIds) {
      await db.query(
        'insert into organization_memberships ("userId","organizationId",role) values ($1,$2,\'owner\')',
        [userId, organizationId]
      );
      await db.query(
        'insert into organization_role_assignments (id,"organizationId","userId","roleId","assignedByUserId","updatedAt") select $1,$2,$3,id,$3,current_timestamp from rbac_roles where key=\'owner\'',
        [`${prefix}-assignment-${organizationId}-${suffix}`, organizationId, userId]
      );
    }

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const loginBody = await login.text();
    if (!login.ok) throw new Error(`Migration HTTP fixture login failed (${login.status}): ${loginBody.slice(0, 300)}`);
    const setCookie = login.headers.get("set-cookie");
    if (!setCookie) throw new Error("Migration HTTP fixture login did not return a session cookie.");

    return {
      cookie: setCookie.split(";", 1)[0],
      async cleanup() {
        await db.query('delete from users where id = $1', [userId]);
        await db.end();
      }
    };
  } catch (error) {
    await db.query('delete from users where id = $1', [userId]).catch(() => {});
    await db.end().catch(() => {});
    throw error;
  }
}

module.exports = { createMigrationHttpAuth };
