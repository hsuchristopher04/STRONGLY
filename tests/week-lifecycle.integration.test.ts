import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { Pool } from "pg";
import { newDb } from "pg-mem";
import { DailyQuestError, toggleDailyQuest } from "../app/api/campaign/daily-quest-service";
import { ensureWeekLifecycle } from "../app/api/campaign/week-lifecycle";
import { closeDatabasePool, db, setDatabasePool } from "../db/index";

const now = "2026-08-03T14:00:00.000Z";

async function fixture() {
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = memory.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;
  setDatabasePool(pool);
  for (const migrationName of ["0000_azure_postgres.sql", "0001_prestige_system.sql", "0002_new_user_walkthrough.sql", "0003_weekly_milestone_provenance.sql", "0004_goal_lifecycle.sql", "0005_master_mode.sql", "0006_verified_email_change.sql"]) {
    await pool.query(await readFile(new URL(`../drizzle/${migrationName}`, import.meta.url), "utf8"));
  }
  await db.batch([
    db.prepare("INSERT INTO users (id,email,display_name,timezone,created_at) VALUES (?,?,?,?,?)").bind("user_a", "a@example.com", "A", "America/New_York", now),
    db.prepare("INSERT INTO weeks (id,user_id,starts_on,ends_on,status) VALUES (?,?,?,?,?)").bind("old_week", "user_a", "2026-07-26", "2026-08-01", "active"),
    db.prepare("INSERT INTO daily_quests (id,week_id,user_id,title,kind,position) VALUES (?,?,?,?,?,?)").bind("old_quest", "old_week", "user_a", "Archived quest", "required", 0),
    db.prepare("INSERT INTO daily_completions (id,quest_id,user_id,completed_on,completed_at) VALUES (?,?,?,?,?)").bind("old_completion", "old_quest", "user_a", "2026-07-31", "2026-07-31T14:00:00.000Z"),
    db.prepare("INSERT INTO weekly_quests (id,week_id,user_id,title,completed_at,position) VALUES (?,?,?,?,?,?)").bind("old_weekly", "old_week", "user_a", "Archived weekly", "2026-08-01T14:00:00.000Z", 0),
    db.prepare("INSERT INTO weeks (id,user_id,starts_on,ends_on,status) VALUES (?,?,?,?,?)").bind("user_a_2026-08-02", "user_a", "2026-08-02", "2026-08-08", "planning"),
    ...["Custom one", "Custom two", "Custom three"].map((title, position) => db.prepare("INSERT INTO daily_quests (id,week_id,user_id,title,kind,position) VALUES (?,?,?,?,?,?)").bind(`planned_${position}`, "user_a_2026-08-02", "user_a", title, "required", position)),
    db.prepare("INSERT INTO weekly_quests (id,week_id,user_id,title,position) VALUES (?,?,?,?,?)").bind("planned_weekly", "user_a_2026-08-02", "user_a", "Custom weekly", 0),
  ]);
}

test.beforeEach(fixture);
test.afterEach(closeDatabasePool);

test("rollover closes the expired week, promotes the planned week, and creates the next planning week", async () => {
  const campaign = await ensureWeekLifecycle("user_a", "2026-08-03");
  assert.deepEqual(campaign, {
    today: "2026-08-03", weekId: "user_a_2026-08-02", start: "2026-08-02", end: "2026-08-08",
    nextWeekId: "user_a_2026-08-09", nextStart: "2026-08-09", nextEnd: "2026-08-15",
  });
  const weeks = await db.prepare("SELECT starts_on,status FROM weeks WHERE user_id=? ORDER BY starts_on").bind("user_a").all<{ starts_on: string; status: string }>();
  assert.deepEqual(weeks.results, [
    { starts_on: "2026-07-26", status: "closed" },
    { starts_on: "2026-08-02", status: "active" },
    { starts_on: "2026-08-09", status: "planning" },
  ]);
});

test("rollover preserves planned quests and immutable historical records", async () => {
  await ensureWeekLifecycle("user_a", "2026-08-03");
  const planned = await db.prepare("SELECT title FROM daily_quests WHERE week_id=? ORDER BY position").bind("user_a_2026-08-02").all<{ title: string }>();
  assert.deepEqual(planned.results.map((quest) => quest.title), ["Custom one", "Custom two", "Custom three"]);
  assert.ok(await db.prepare("SELECT id FROM daily_completions WHERE id=?").bind("old_completion").first());
  assert.equal((await db.prepare("SELECT completed_at FROM weekly_quests WHERE id=?").bind("old_weekly").first<{ completed_at: string }>())?.completed_at, "2026-08-01T14:00:00.000Z");
  await assert.rejects(
    toggleDailyQuest({ userId: "user_a", questId: "old_quest", completedOn: "2026-07-31", now }),
    (error) => error instanceof DailyQuestError && error.status === 404,
  );
  assert.ok(await db.prepare("SELECT id FROM daily_completions WHERE id=?").bind("old_completion").first());
});

test("lifecycle processing is idempotent and maintains one active and one planning week", async () => {
  await ensureWeekLifecycle("user_a", "2026-08-03");
  await ensureWeekLifecycle("user_a", "2026-08-03");
  const counts = await db.prepare("SELECT status,COUNT(*) count FROM weeks WHERE user_id=? AND status IN ('active','planning') GROUP BY status ORDER BY status")
    .bind("user_a").all<{ status: string; count: number }>();
  assert.deepEqual(counts.results.map((row) => ({ status: row.status, count: Number(row.count) })), [
    { status: "active", count: 1 }, { status: "planning", count: 1 },
  ]);
});

test("an unplanned current week receives a valid starter campaign", async () => {
  await ensureWeekLifecycle("user_a", "2026-08-17");
  const current = await db.prepare("SELECT id,status FROM weeks WHERE user_id=? AND starts_on=?").bind("user_a", "2026-08-16").first<{ id: string; status: string }>();
  assert.equal(current?.status, "active");
  const daily = await db.prepare("SELECT kind,COUNT(*) count FROM daily_quests WHERE week_id=? GROUP BY kind").bind(current?.id).all<{ kind: string; count: number }>();
  assert.deepEqual(daily.results.map((row) => ({ kind: row.kind, count: Number(row.count) })), [{ kind: "required", count: 3 }]);
  const weekly = await db.prepare("SELECT COUNT(*) count FROM weekly_quests WHERE week_id=?").bind(current?.id).first<{ count: number }>();
  assert.equal(Number(weekly?.count ?? 0), 2);
});
