import { defineConfig } from "drizzle-kit";

function databaseUrl() {
  const value = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/strongly";
  const url = new URL(value);
  url.searchParams.delete("sslmode");
  url.searchParams.delete("uselibpqcompat");
  return url.toString();
}

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl(),
  },
});
