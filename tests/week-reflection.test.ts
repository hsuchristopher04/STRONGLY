import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { Pool } from "pg";
import { newDb } from "pg-mem";
import { saveWeekReflection, WeekPlanError } from "../app/api/campaign/week-plan-service";
import { closeDatabasePool, db, setDatabasePool } from "../db/index";

async function fixture() {
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = memory.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;
  setDatabasePool(pool);
  await pool.query(await readFile(new URL("../drizzle/0000_azure_postgres.sql", import.meta.url), "utf8"));
  await pool.query(await readFile(new URL("../drizzle/0007_weekly_reflections.sql", import.meta.url), "utf8"));
  await db.prepare("INSERT INTO users (id,email,display_name,timezone,created_at) VALUES (?,?,?,?,?)")
    .bind("user_a", "a@example.com", "A", "UTC", new Date().toISOString()).run();
  await db.batch([
    db.prepare("INSERT INTO weeks (id,user_id,starts_on,ends_on,status) VALUES (?,?,?,?,?)").bind("open", "user_a", "2026-08-09", "2026-08-15", "active"),
    db.prepare("INSERT INTO weeks (id,user_id,starts_on,ends_on,status) VALUES (?,?,?,?,?)").bind("upcoming", "user_a", "2026-08-16", "2026-08-22", "planning"),
    db.prepare("INSERT INTO weeks (id,user_id,starts_on,ends_on,status,reflection) VALUES (?,?,?,?,?,?)").bind("closed", "user_a", "2026-08-02", "2026-08-08", "closed", "Preserved note"),
    db.prepare("INSERT INTO weeks (id,user_id,starts_on,ends_on,status,reflection) VALUES (?,?,?,?,?,?)").bind("older", "user_a", "2026-07-26", "2026-08-01", "closed", "Older note"),
  ]);
}

test.beforeEach(fixture);
test.afterEach(closeDatabasePool);

test("saves a reflection only on the authenticated user's open week", async () => {
  await saveWeekReflection("user_a", "open", "A week worth remembering");
  const row = await db.prepare("SELECT reflection FROM weeks WHERE id=? AND user_id=?").bind("open", "user_a").first<{ reflection: string }>();
  assert.equal(row?.reflection, "A week worth remembering");
  await assert.rejects(saveWeekReflection("user_b", "open", "Intrusion"), (error) => error instanceof WeekPlanError && error.status === 404);
});

test("closed-week reflections remain immutable history", async () => {
  await assert.rejects(saveWeekReflection("user_a", "closed", "Rewrite history"), (error) => error instanceof WeekPlanError && /Master Mode/i.test(error.message));
  const row = await db.prepare("SELECT reflection FROM weeks WHERE id=?").bind("closed").first<{ reflection: string }>();
  assert.equal(row?.reflection, "Preserved note");
});

test("Master Mode can revise only the immediately previous week's reflection", async () => {
  const permission = { masterMode: true, startsOn: "2026-08-02" };
  await saveWeekReflection("user_a", "closed", "Corrected reflection", permission);
  assert.equal((await db.prepare("SELECT reflection FROM weeks WHERE id=?").bind("closed").first<{ reflection: string }>())?.reflection, "Corrected reflection");
  await assert.rejects(saveWeekReflection("user_a", "older", "Too far back", permission), (error) => error instanceof WeekPlanError && /previous campaign/i.test(error.message));
});

test("an empty previous-week reflection remains archived and can be added later", async () => {
  await db.prepare("UPDATE weeks SET reflection='' WHERE id=? AND user_id=?").bind("closed", "user_a").run();
  assert.equal((await db.prepare("SELECT reflection FROM weeks WHERE id=?").bind("closed").first<{ reflection: string }>())?.reflection, "");
  await saveWeekReflection("user_a", "closed", "Added after the week", { masterMode: true, startsOn: "2026-08-02" });
  assert.equal((await db.prepare("SELECT reflection FROM weeks WHERE id=?").bind("closed").first<{ reflection: string }>())?.reflection, "Added after the week");
});

test("upcoming planning weeks cannot receive reflections", async () => {
  await assert.rejects(saveWeekReflection("user_a", "upcoming", "Writing ahead"), (error) => error instanceof WeekPlanError && /current campaign/i.test(error.message));
  const row = await db.prepare("SELECT reflection FROM weeks WHERE id=?").bind("upcoming").first<{ reflection: string }>();
  assert.equal(row?.reflection, "");
});
