import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js developers commonly keep local secrets in .env.local. Load it first,
// then allow the standard .env file or process environment to provide values.
config({ path: ".env.local" });
config();

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
