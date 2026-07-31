import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const connectionString = process.env.DATABASE_URL;
const explicitSsl = process.env.DATABASE_SSL;
const localHost = ["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname);
const ssl = explicitSsl === "false" || (explicitSsl !== "true" && localHost) ? false : { rejectUnauthorized: false };
const client = new pg.Client({ connectionString, ssl, application_name: "strongly-migrations" });
const migrationsDirectory = new URL("../drizzle/", import.meta.url);

await client.connect();
try {
  await client.query("CREATE TABLE IF NOT EXISTS strongly_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at text NOT NULL)");
  const names = (await readdir(migrationsDirectory)).filter((name) => name.endsWith(".sql")).sort();
  for (const name of names) {
    const migration = await readFile(new URL(name, migrationsDirectory), "utf8");
    const checksum = createHash("sha256").update(migration).digest("hex");
    const applied = await client.query("SELECT checksum FROM strongly_migrations WHERE name=$1", [name]);
    if (applied.rowCount) {
      if (applied.rows[0].checksum !== checksum) throw new Error(`Applied migration ${name} has changed`);
      continue;
    }
    await client.query("BEGIN");
    try {
      await client.query(migration);
      await client.query("INSERT INTO strongly_migrations (name,checksum,applied_at) VALUES ($1,$2,$3)", [name, checksum, new Date().toISOString()]);
      await client.query("COMMIT");
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  console.log("STRONGLY PostgreSQL schema is current.");
} finally {
  await client.end();
}
