import { db } from "../../../db";
import { DAILY_QUEST_POINTS, qualifiesForStrongDay, STRONG_DAY_POINTS } from "./prestige";

type QuestRow = { kind: "required" | "bonus"; week_id: string; status: string };
type CountRow = { kind: "required" | "bonus"; count: number };

export class DailyQuestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function toggleDailyQuest(input: { userId: string; questId: string; completedOn: string; now: string }) {
  return db.transaction(async (transaction) => {
    const week = await transaction.prepare(
      `SELECT w.id,w.status FROM daily_quests q
       JOIN weeks w ON w.id=q.week_id AND w.user_id=q.user_id
       WHERE q.id=? AND q.user_id=? FOR UPDATE`,
    ).bind(input.questId, input.userId).first<{ id: string; status: string }>();
    if (!week || week.status === "closed") throw new DailyQuestError("Quest is unavailable", 404);

    const quest = await transaction.prepare("SELECT kind,week_id FROM daily_quests WHERE id=? AND user_id=?")
      .bind(input.questId, input.userId).first<QuestRow>();
    if (!quest) throw new DailyQuestError("Quest is unavailable", 404);

    const completion = await transaction.prepare("SELECT id FROM daily_completions WHERE quest_id=? AND completed_on=? AND user_id=?")
      .bind(input.questId, input.completedOn, input.userId).first<{ id: string }>();
    let completed: boolean;
    if (completion) {
      await transaction.prepare("DELETE FROM daily_completions WHERE id=? AND user_id=?").bind(completion.id, input.userId).run();
      await transaction.prepare("INSERT INTO prestige_ledger (id,user_id,points,reason,source_type,source_id,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), input.userId, -DAILY_QUEST_POINTS, "Daily quest reopened", "daily-reversal", completion.id, input.now).run();
      completed = false;
    } else {
      const completionId = crypto.randomUUID();
      await transaction.prepare("INSERT INTO daily_completions (id,quest_id,user_id,completed_on,completed_at) VALUES (?,?,?,?,?)")
        .bind(completionId, input.questId, input.userId, input.completedOn, input.now).run();
      await transaction.prepare("INSERT INTO prestige_ledger (id,user_id,points,reason,source_type,source_id,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), input.userId, DAILY_QUEST_POINTS, "Daily quest complete", "daily-award", completionId, input.now).run();
      completed = true;
    }

    const dayIndex = new Date(`${input.completedOn}T12:00:00Z`).getUTCDay();
    const [questCounts, completionCounts, strongLedger] = await Promise.all([
      transaction.prepare("SELECT kind,COUNT(*) count FROM daily_quests WHERE user_id=? AND week_id=? AND (kind='required' OR (kind='bonus' AND day_index=?)) GROUP BY kind")
        .bind(input.userId, quest.week_id, dayIndex).all<CountRow>(),
      transaction.prepare("SELECT q.kind,COUNT(*) count FROM daily_completions c JOIN daily_quests q ON q.id=c.quest_id AND q.user_id=c.user_id WHERE c.user_id=? AND q.week_id=? AND c.completed_on=? GROUP BY q.kind")
        .bind(input.userId, quest.week_id, input.completedOn).all<CountRow>(),
      transaction.prepare("SELECT COALESCE(SUM(points),0) points FROM prestige_ledger WHERE user_id=? AND source_type='strong-day' AND source_id LIKE ?")
        .bind(input.userId, `${input.completedOn}:%`).first<{ points: number }>(),
    ]);
    const requiredComplete = Number(completionCounts.results.find((row) => row.kind === "required")?.count ?? 0);
    const bonusComplete = Number(completionCounts.results.find((row) => row.kind === "bonus")?.count ?? 0);
    const bonusAssigned = Number(questCounts.results.find((row) => row.kind === "bonus")?.count ?? 0);
    const strong = qualifiesForStrongDay(requiredComplete, bonusAssigned, bonusComplete);
    const strongPoints = Number(strongLedger?.points ?? 0);

    if ((strong && strongPoints === 0) || (!strong && strongPoints > 0)) {
      await transaction.prepare("INSERT INTO prestige_ledger (id,user_id,points,reason,source_type,source_id,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), input.userId, strong ? STRONG_DAY_POINTS : -STRONG_DAY_POINTS, strong ? "Strong Day secured" : "Strong Day reopened", "strong-day", `${input.completedOn}:${crypto.randomUUID()}`, input.now).run();
    }

    return { completed, strong, requiredComplete, bonusAssigned, bonusComplete };
  });
}
