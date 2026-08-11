import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { Pool } from "pg";
import { newDb } from "pg-mem";
import { DailyQuestError, toggleDailyQuest } from "../app/api/campaign/daily-quest-service";
import { closeDatabasePool, db, setDatabasePool } from "../db/index";

const date = "2026-08-05";
const now = "2026-08-05T16:00:00.000Z";

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
    db.prepare("INSERT INTO users (id,email,display_name,timezone,created_at) VALUES (?,?,?,?,?)").bind("user_b", "b@example.com", "B", "America/New_York", now),
    db.prepare("INSERT INTO weeks (id,user_id,starts_on,ends_on,status) VALUES (?,?,?,?,?)").bind("week_a", "user_a", "2026-08-02", "2026-08-08", "active"),
    db.prepare("INSERT INTO weeks (id,user_id,starts_on,ends_on,status) VALUES (?,?,?,?,?)").bind("week_b", "user_b", "2026-08-02", "2026-08-08", "active"),
    ...["required_1", "required_2", "required_3"].map((id, position) => db.prepare("INSERT INTO daily_quests (id,week_id,user_id,title,kind,position) VALUES (?,?,?,?,?,?)").bind(id, "week_a", "user_a", id, "required", position)),
    ...["bonus_1", "bonus_2"].map((id, position) => db.prepare("INSERT INTO daily_quests (id,week_id,user_id,title,kind,day_index,position) VALUES (?,?,?,?,?,?,?)").bind(id, "week_a", "user_a", id, "bonus", 3, position)),
    db.prepare("INSERT INTO daily_quests (id,week_id,user_id,title,kind,position) VALUES (?,?,?,?,?,?)").bind("other_user_quest", "week_b", "user_b", "Private", "required", 0),
    db.prepare("INSERT INTO weeks (id,user_id,starts_on,ends_on,status) VALUES (?,?,?,?,?)").bind("closed_week", "user_a", "2026-07-26", "2026-08-01", "closed"),
    db.prepare("INSERT INTO daily_quests (id,week_id,user_id,title,kind,position) VALUES (?,?,?,?,?,?)").bind("closed_quest", "closed_week", "user_a", "Closed", "required", 0),
  ]);
}

async function points(userId = "user_a") {
  const row = await db.prepare("SELECT COALESCE(SUM(points),0) points FROM prestige_ledger WHERE user_id=?").bind(userId).first<{ points: number }>();
  return Number(row?.points ?? 0);
}

test.beforeEach(fixture);
test.afterEach(closeDatabasePool);

test("the full daily flow awards 3 points per quest and 10 only after every scheduled bonus", async () => {
  for (const questId of ["required_1", "required_2", "required_3"]) {
    const result = await toggleDailyQuest({ userId: "user_a", questId, completedOn: date, now });
    assert.equal(result.strong, false);
  }
  assert.equal(await points(), 9);

  const firstBonus = await toggleDailyQuest({ userId: "user_a", questId: "bonus_1", completedOn: date, now });
  assert.deepEqual({ strong: firstBonus.strong, bonusComplete: firstBonus.bonusComplete, bonusAssigned: firstBonus.bonusAssigned }, { strong: false, bonusComplete: 1, bonusAssigned: 2 });
  assert.equal(await points(), 12);

  const finalBonus = await toggleDailyQuest({ userId: "user_a", questId: "bonus_2", completedOn: date, now });
  assert.equal(finalBonus.strong, true);
  assert.equal(await points(), 25);
});

test("reopening and recompleting a qualifying quest reverses and restores rewards without duplication", async () => {
  for (const questId of ["required_1", "required_2", "required_3", "bonus_1", "bonus_2"]) {
    await toggleDailyQuest({ userId: "user_a", questId, completedOn: date, now });
  }
  assert.equal(await points(), 25);

  const reopened = await toggleDailyQuest({ userId: "user_a", questId: "bonus_2", completedOn: date, now });
  assert.equal(reopened.strong, false);
  assert.equal(await points(), 12);

  const restored = await toggleDailyQuest({ userId: "user_a", questId: "bonus_2", completedOn: date, now });
  assert.equal(restored.strong, true);
  assert.equal(await points(), 25);
  const strongLedger = await db.prepare("SELECT points FROM prestige_ledger WHERE user_id=? AND source_type='strong-day' ORDER BY created_at,id").bind("user_a").all<{ points: number }>();
  assert.deepEqual(strongLedger.results.map((entry) => entry.points).sort((a, b) => a - b), [-10, 10, 10]);
});

test("cross-user and closed-week daily mutations are rejected without changing data", async () => {
  await assert.rejects(
    toggleDailyQuest({ userId: "user_a", questId: "other_user_quest", completedOn: date, now }),
    (error) => error instanceof DailyQuestError && error.status === 404,
  );
  await assert.rejects(
    toggleDailyQuest({ userId: "user_a", questId: "closed_quest", completedOn: "2026-07-29", now }),
    (error) => error instanceof DailyQuestError && error.status === 404,
  );
  assert.equal(await points(), 0);
  assert.equal(await points("user_b"), 0);
  const completions = await db.prepare("SELECT COUNT(*) count FROM daily_completions").first<{ count: number }>();
  assert.equal(Number(completions?.count ?? 0), 0);
});

test("database transactions issue ROLLBACK instead of COMMIT when an operation fails", async () => {
  await closeDatabasePool();
  const commands: string[] = [];
  const client = {
    async query(source: string) {
      commands.push(source);
      if (source === "FAIL") throw new Error("forced failure");
      return { rows: [], rowCount: 0 };
    },
    release() { commands.push("RELEASE"); },
  };
  setDatabasePool({ connect: async () => client, end: async () => undefined } as unknown as Pool);
  await assert.rejects(db.transaction(async (transaction) => {
    await transaction.prepare("SUCCESS").run();
    await transaction.prepare("FAIL").run();
  }), /forced failure/);
  assert.deepEqual(commands, ["BEGIN", "SUCCESS", "FAIL", "ROLLBACK", "RELEASE"]);
});
