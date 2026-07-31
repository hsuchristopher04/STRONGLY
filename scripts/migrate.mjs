import { readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false } });
await client.connect();
try {
  const migration = await readFile(new URL("../drizzle/0000_azure_postgres.sql", import.meta.url), "utf8");
  await client.query("BEGIN");
  await client.query("CREATE TABLE IF NOT EXISTS strongly_migrations (name text PRIMARY KEY, applied_at text NOT NULL)");
  const applied = await client.query("SELECT 1 FROM strongly_migrations WHERE name=$1", ["0000_azure_postgres"]);
  if (applied.rowCount === 0) {
    await client.query(migration);
    await client.query("INSERT INTO strongly_migrations (name,applied_at) VALUES ($1,$2)", ["0000_azure_postgres", new Date().toISOString()]);
  }
  await client.query("COMMIT");
  console.log(applied.rowCount === 0 ? "STRONGLY PostgreSQL schema created." : "STRONGLY PostgreSQL schema is current.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
