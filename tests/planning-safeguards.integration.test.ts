import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { Pool } from "pg";
import { newDb } from "pg-mem";
import { saveWeekPlan, toggleWeeklyQuest, WeekPlanError } from "../app/api/campaign/week-plan-service";
import { validateWeekPlan } from "../app/api/campaign/week-planning";
import { closeDatabasePool, db, setDatabasePool } from "../db/index";

const userId = "user_a";
const weekId = "user_a_2026-08-02";
const plan = validateWeekPlan({
  startsOn: "2026-08-02",
  required: ["New one", "New two", "New three"],
  bonus: [{ dayIndex: 3, titles: ["New bonus"] }],
  weekly: ["New weekly"],
}, "2026-08-05");

async function fixture() {
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = memory.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;
  setDatabasePool(pool);
  for (const migrationName of ["0000_azure_postgres.sql", "0001_prestige_system.sql", "0002_new_user_walkthrough.sql", "0003_weekly_milestone_provenance.sql"]) {
    await pool.query(await readFile(new URL(`../drizzle/${migrationName}`, import.meta.url), "utf8"));
  }
  await db.batch([
    db.prepare("INSERT INTO users (id,email,display_name,timezone,created_at) VALUES (?,?,?,?,?)").bind(userId, "a@example.com", "A", "America/New_York", "now"),
    db.prepare("INSERT INTO weeks (id,user_id,starts_on,ends_on,status) VALUES (?,?,?,?,?)").bind(weekId, userId, "2026-08-02", "2026-08-08", "active"),
    ...["Old one", "Old two", "Old three"].map((title, position) => db.prepare("INSERT INTO daily_quests (id,week_id,user_id,title,kind,position) VALUES (?,?,?,?,?,?)").bind(`old_${position}`, weekId, userId, title, "required", position)),
    db.prepare("INSERT INTO weekly_quests (id,week_id,user_id,title,position) VALUES (?,?,?,?,?)").bind("old_weekly", weekId, userId, "Old weekly", 0),
  ]);
}

async function questTitles() {
  const daily = await db.prepare("SELECT title FROM daily_quests WHERE week_id=? ORDER BY kind,position").bind(weekId).all<{ title: string }>();
  const weekly = await db.prepare("SELECT title FROM weekly_quests WHERE week_id=? ORDER BY position").bind(weekId).all<{ title: string }>();
  return { daily: daily.results.map((quest) => quest.title), weekly: weekly.results.map((quest) => quest.title) };
}

test.beforeEach(fixture);
test.afterEach(closeDatabasePool);

test("an untouched current campaign can be safely replanned", async () => {
  await saveWeekPlan(userId, weekId, plan);
  assert.deepEqual(await questTitles(), { daily: ["New bonus", "New one", "New two", "New three"], weekly: ["New weekly"] });
});

test("daily progress locks planning without deleting or replacing quests", async () => {
  await db.prepare("INSERT INTO daily_completions (id,quest_id,user_id,completed_on,completed_at) VALUES (?,?,?,?,?)")
    .bind("completion", "old_0", userId, "2026-08-05", "now").run();
  const before = await questTitles();
  await assert.rejects(saveWeekPlan(userId, weekId, plan), (error) => error instanceof WeekPlanError && /completed quests/i.test(error.message));
  assert.deepEqual(await questTitles(), before);
  assert.ok(await db.prepare("SELECT id FROM daily_completions WHERE id=?").bind("completion").first());
});

test("weekly progress and closed campaigns cannot be replanned", async () => {
  await toggleWeeklyQuest(userId, "old_weekly", "now");
  await assert.rejects(saveWeekPlan(userId, weekId, plan), (error) => error instanceof WeekPlanError && /completed quests/i.test(error.message));
  await db.prepare("UPDATE weekly_quests SET completed_at=NULL WHERE id=? AND user_id=?").bind("old_weekly", userId).run();
  await db.prepare("UPDATE weeks SET status='closed' WHERE id=? AND user_id=?").bind(weekId, userId).run();
  await assert.rejects(saveWeekPlan(userId, weekId, plan), (error) => error instanceof WeekPlanError && /preserved in History/i.test(error.message));
  assert.deepEqual(await questTitles(), { daily: ["Old one", "Old two", "Old three"], weekly: ["Old weekly"] });
});
