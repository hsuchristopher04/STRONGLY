import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { Pool } from "pg";
import { newDb } from "pg-mem";
import { saveWeekPlan, toggleMilestone, toggleWeeklyQuest, WeekPlanError } from "../app/api/campaign/week-plan-service";
import { validateWeekPlan } from "../app/api/campaign/week-planning";
import { closeDatabasePool, db, setDatabasePool } from "../db/index";

const userId = "user_a";
const weekId = "user_a_2026-08-02";
const now = "2026-08-05T15:00:00.000Z";

async function fixture() {
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = memory.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;
  setDatabasePool(pool);
  for (const migrationName of ["0000_azure_postgres.sql", "0001_prestige_system.sql", "0002_new_user_walkthrough.sql", "0003_weekly_milestone_provenance.sql", "0004_goal_lifecycle.sql", "0005_master_mode.sql", "0006_verified_email_change.sql"]) {
    await pool.query(await readFile(new URL(`../drizzle/${migrationName}`, import.meta.url), "utf8"));
  }
  await db.batch([
    db.prepare("INSERT INTO users (id,email,display_name,timezone,created_at) VALUES (?,?,?,?,?)").bind(userId, "a@example.com", "A", "America/New_York", now),
    db.prepare("INSERT INTO users (id,email,display_name,timezone,created_at) VALUES (?,?,?,?,?)").bind("user_b", "b@example.com", "B", "America/New_York", now),
    db.prepare("INSERT INTO weeks (id,user_id,starts_on,ends_on,status) VALUES (?,?,?,?,?)").bind(weekId, userId, "2026-08-02", "2026-08-08", "active"),
    db.prepare("INSERT INTO goals (id,user_id,title,description,status) VALUES (?,?,?,?,?)").bind("goal_a", userId, "Ship STRONGLY", "", "active"),
    db.prepare("INSERT INTO goals (id,user_id,title,description,status) VALUES (?,?,?,?,?)").bind("goal_b", "user_b", "Private", "", "active"),
    db.prepare("INSERT INTO milestones (id,goal_id,user_id,title,position) VALUES (?,?,?,?,?)").bind("milestone_auto", "goal_a", userId, "Complete launch checklist", 0),
    db.prepare("INSERT INTO milestones (id,goal_id,user_id,title,position,completed_at) VALUES (?,?,?,?,?,?)").bind("milestone_manual", "goal_a", userId, "Buy domain", 1, "2026-08-04T12:00:00.000Z"),
    db.prepare("INSERT INTO milestones (id,goal_id,user_id,title,position) VALUES (?,?,?,?,?)").bind("milestone_b", "goal_b", "user_b", "Private milestone", 0),
    db.prepare("INSERT INTO weekly_quests (id,week_id,user_id,milestone_id,title,position) VALUES (?,?,?,?,?,?)").bind("weekly_auto", weekId, userId, "milestone_auto", "Finish launch checklist", 0),
    db.prepare("INSERT INTO weekly_quests (id,week_id,user_id,milestone_id,title,position) VALUES (?,?,?,?,?,?)").bind("weekly_manual", weekId, userId, "milestone_manual", "Confirm domain", 1),
  ]);
}

async function milestone(id: string) {
  return db.prepare("SELECT completed_at,completed_by_weekly_quest_id FROM milestones WHERE id=?").bind(id).first<{ completed_at: string | null; completed_by_weekly_quest_id: string | null }>();
}

test.beforeEach(fixture);
test.afterEach(closeDatabasePool);

test("linked weekly quests never change milestone completion", async () => {
  const before = await milestone("milestone_auto");
  await toggleWeeklyQuest(userId, "weekly_auto", now);
  assert.deepEqual(await milestone("milestone_auto"), before);
  await toggleWeeklyQuest(userId, "weekly_auto", now);
  assert.deepEqual(await milestone("milestone_auto"), before);
  await toggleMilestone(userId, "milestone_auto", now);
  assert.deepEqual(await milestone("milestone_auto"), { completed_at: now, completed_by_weekly_quest_id: null });
});

test("milestones must be completed and reopened in sequence", async () => {
  await db.prepare("UPDATE milestones SET completed_at=NULL WHERE id=? AND user_id=?").bind("milestone_manual", userId).run();
  await assert.rejects(toggleMilestone(userId, "milestone_manual", now), (error) => error instanceof WeekPlanError && /earlier milestone/i.test(error.message));

  await toggleMilestone(userId, "milestone_auto", now);
  await toggleMilestone(userId, "milestone_manual", now);
  await assert.rejects(toggleMilestone(userId, "milestone_auto", now), (error) => error instanceof WeekPlanError && /later milestones/i.test(error.message));

  await toggleMilestone(userId, "milestone_manual", now);
  await toggleMilestone(userId, "milestone_auto", now);
  assert.deepEqual(await milestone("milestone_auto"), { completed_at: null, completed_by_weekly_quest_id: null });
});

test("reopening a weekly quest preserves a milestone that was already completed manually", async () => {
  const before = await milestone("milestone_manual");
  await toggleWeeklyQuest(userId, "weekly_manual", now);
  await toggleWeeklyQuest(userId, "weekly_manual", now);
  assert.deepEqual(await milestone("milestone_manual"), before);
});

test("Master Mode can correct both states only in the immediately previous campaign", async () => {
  await db.prepare("UPDATE weeks SET status='closed' WHERE id=? AND user_id=?").bind(weekId, userId).run();
  await assert.rejects(toggleWeeklyQuest(userId, "weekly_auto", now), (error) => error instanceof WeekPlanError && /Master Mode/i.test(error.message));
  await assert.rejects(toggleWeeklyQuest(userId, "weekly_auto", now, { masterMode: true, startsOn: "2026-07-26" }), (error) => error instanceof WeekPlanError);

  const permission = { masterMode: true, startsOn: "2026-08-02" };
  assert.deepEqual(await toggleWeeklyQuest(userId, "weekly_auto", now, permission), { completed: true });
  assert.deepEqual(await toggleWeeklyQuest(userId, "weekly_auto", now, permission), { completed: false });
});

test("planning persists owned milestone links and rejects another user's milestone", async () => {
  await db.prepare("DELETE FROM weekly_quests WHERE week_id=? AND user_id=?").bind(weekId, userId).run();
  const ownedPlan = validateWeekPlan({ startsOn: "2026-08-02", required: ["One", "Two", "Three"], bonus: [], weekly: [{ title: "Ship", milestoneId: "milestone_auto" }] }, "2026-08-05");
  await saveWeekPlan(userId, weekId, ownedPlan);
  const saved = await db.prepare("SELECT milestone_id FROM weekly_quests WHERE week_id=? AND user_id=?").bind(weekId, userId).first<{ milestone_id: string | null }>();
  assert.equal(saved?.milestone_id, "milestone_auto");

  const foreignPlan = validateWeekPlan({ startsOn: "2026-08-02", required: ["One", "Two", "Three"], bonus: [], weekly: [{ title: "Steal", milestoneId: "milestone_b" }] }, "2026-08-05");
  await assert.rejects(saveWeekPlan(userId, weekId, foreignPlan), (error) => error instanceof WeekPlanError && error.status === 400);
  assert.equal((await db.prepare("SELECT milestone_id FROM weekly_quests WHERE week_id=? AND user_id=?").bind(weekId, userId).first<{ milestone_id: string | null }>())?.milestone_id, "milestone_auto");
});

test("a milestone cannot be linked to multiple weekly quests in one campaign", () => {
  assert.throws(() => validateWeekPlan({
    startsOn: "2026-08-02", required: ["One", "Two", "Three"], bonus: [],
    weekly: [{ title: "First", milestoneId: "milestone_auto" }, { title: "Second", milestoneId: "milestone_auto" }],
  }, "2026-08-05"), /only be linked to one weekly quest/i);
});
