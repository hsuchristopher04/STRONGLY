import { Pool, type PoolClient, type QueryResultRow } from "pg";

let pool: Pool | undefined;

function shouldUseSsl(connectionString: string) {
  if (process.env.DATABASE_SSL === "false") return false;
  if (process.env.DATABASE_SSL === "true") return true;
  try {
    const host = new URL(connectionString).hostname;
    return host !== "localhost" && host !== "127.0.0.1";
  } catch {
    return true;
  }
}

export function normalizePostgresUrl(connectionString: string) {
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  url.searchParams.delete("uselibpqcompat");
  return url.toString();
}

export function connectionPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  const connectionString = process.env.DATABASE_URL;
  if (connectionString.includes("your-server.postgres.database.azure.com") || connectionString.includes("replace-me")) {
    throw new Error("DATABASE_URL still contains example placeholders. Replace it in .env.local with your real PostgreSQL connection string.");
  }
  pool = new Pool({
    connectionString: normalizePostgresUrl(connectionString),
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: true } : false,
    max: 10,
    connectionTimeoutMillis: 10_000,
    application_name: "strongly",
  });
  return pool;
}

export function setDatabasePool(nextPool: Pool | undefined) {
  pool = nextPool;
}

export async function closeDatabasePool() {
  if (!pool) return;
  const current = pool;
  pool = undefined;
  await current.end();
}

function postgresPlaceholders(source: string) {
  let index = 0;
  return source.replace(/\?/g, () => `$${++index}`);
}

class Statement {
  private values: unknown[] = [];
  constructor(private readonly source: string, private readonly client?: PoolClient) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async execute(client?: PoolClient) {
    const executor = client ?? this.client ?? connectionPool();
    return executor.query(postgresPlaceholders(this.source), this.values);
  }

  async run() {
    const result = await this.execute();
    return { success: true, meta: { changes: result.rowCount ?? 0 } };
  }

  async first<T extends QueryResultRow>() {
    const result = await this.execute();
    return (result.rows[0] as T | undefined) ?? null;
  }

  async all<T extends QueryResultRow>() {
    const result = await this.execute();
    return { results: result.rows as T[] };
  }
}

export const db = {
  prepare(source: string) {
    return new Statement(source);
  },
  async batch(statements: Statement[]) {
    const client = await connectionPool().connect();
    try {
      await client.query("BEGIN");
      const results = [];
      for (const statement of statements) results.push(await statement.execute(client));
      await client.query("COMMIT");
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
  async transaction<T>(operation: (transaction: { prepare(source: string): Statement }) => Promise<T>) {
    const client = await connectionPool().connect();
    try {
      await client.query("BEGIN");
      const result = await operation({ prepare: (source: string) => new Statement(source, client) });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
};
