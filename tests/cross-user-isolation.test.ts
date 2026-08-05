import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { Pool } from "pg";
import { newDb } from "pg-mem";
import { closeDatabasePool, db, setDatabasePool } from "../db/index";
import {
  deleteDailyCompletion,
  findDailyCompletion,
  findDailyQuest,
  findMilestone,
  findWeeklyQuest,
  updateMilestoneCompletion,
  updateProfile,
  updateWeeklyCompletion,
} from "../app/api/campaign/ownership-store";

async function databaseFixture() {
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = memory.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;
  setDatabasePool(pool);
  const migrations = await Promise.all([
    readFile(new URL("../drizzle/0000_azure_postgres.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_prestige_system.sql", import.meta.url), "utf8"),
  ]);
  for (const migration of migrations) await pool.query(migration);
  await db.batch([
    db.prepare("INSERT INTO users (id,email,display_name,timezone,created_at) VALUES (?,?,?,?,?)").bind("user_a", "a@example.com", "A", "America/New_York", "now"),
    db.prepare("INSERT INTO users (id,email,display_name,timezone,created_at) VALUES (?,?,?,?,?)").bind("user_b", "b@example.com", "B", "America/Chicago", "now"),
    db.prepare("INSERT INTO weeks (id,user_id,starts_on,ends_on,status) VALUES (?,?,?,?,?)").bind("week_a", "user_a", "2026-07-26", "2026-08-01", "active"),
    db.prepare("INSERT INTO weeks (id,user_id,starts_on,ends_on,status) VALUES (?,?,?,?,?)").bind("week_b", "user_b", "2026-07-26", "2026-08-01", "active"),
    db.prepare("INSERT INTO daily_quests (id,week_id,user_id,title,kind,position) VALUES (?,?,?,?,?,?)").bind("daily_a", "week_a", "user_a", "A daily", "required", 0),
    db.prepare("INSERT INTO daily_quests (id,week_id,user_id,title,kind,position) VALUES (?,?,?,?,?,?)").bind("daily_b", "week_b", "user_b", "B daily", "required", 0),
    db.prepare("INSERT INTO daily_completions (id,quest_id,user_id,completed_on,completed_at) VALUES (?,?,?,?,?)").bind("completion_b", "daily_b", "user_b", "2026-07-31", "now"),
    db.prepare("INSERT INTO weekly_quests (id,week_id,user_id,title,position) VALUES (?,?,?,?,?)").bind("weekly_b", "week_b", "user_b", "B weekly", 0),
    db.prepare("INSERT INTO goals (id,user_id,title,description,status) VALUES (?,?,?,?,?)").bind("goal_b", "user_b", "B goal", "", "active"),
    db.prepare("INSERT INTO milestones (id,goal_id,user_id,title,position) VALUES (?,?,?,?,?)").bind("milestone_b", "goal_b", "user_b", "B milestone", 0),
  ]);
}

test.beforeEach(databaseFixture);
test.afterEach(closeDatabasePool);

test("ownership lookups reject every cross-user resource", async () => {
  assert.equal(await findDailyQuest("user_a", "daily_b"), null);
  assert.equal(await findDailyCompletion("user_a", "daily_b", "2026-07-31"), null);
  assert.equal(await findWeeklyQuest("user_a", "weekly_b"), null);
  assert.equal(await findMilestone("user_a", "milestone_b"), null);
  assert.ok(await findDailyQuest("user_b", "daily_b"));
  assert.ok(await findWeeklyQuest("user_b", "weekly_b"));
});

test("guarded writes cannot mutate another user's records", async () => {
  assert.equal((await deleteDailyCompletion("user_a", "completion_b").run()).meta.changes, 0);
  assert.equal((await updateWeeklyCompletion("user_a", "weekly_b", "hacked").run()).meta.changes, 0);
  assert.equal((await updateMilestoneCompletion("user_a", "milestone_b", "hacked").run()).meta.changes, 0);
  await updateProfile("user_a", "Changed A", "Europe/London").run();

  const completion = await db.prepare("SELECT id FROM daily_completions WHERE id=?").bind("completion_b").first();
  const weekly = await db.prepare("SELECT completed_at FROM weekly_quests WHERE id=?").bind("weekly_b").first<{ completed_at: string | null }>();
  const milestone = await db.prepare("SELECT completed_at FROM milestones WHERE id=?").bind("milestone_b").first<{ completed_at: string | null }>();
  const userB = await db.prepare("SELECT display_name,timezone FROM users WHERE id=?").bind("user_b").first<{ display_name: string; timezone: string }>();
  assert.ok(completion);
  assert.equal(weekly?.completed_at, null);
  assert.equal(milestone?.completed_at, null);
  assert.deepEqual(userB, { display_name: "B", timezone: "America/Chicago" });
});
