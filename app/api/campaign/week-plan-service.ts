import { db } from "../../../db";
import type { validateWeekPlan } from "./week-planning";

export class WeekPlanError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}

export async function saveWeekPlan(userId: string, weekId: string, plan: ReturnType<typeof validateWeekPlan>) {
  await db.transaction(async (transaction) => {
    const week = await transaction.prepare("SELECT status FROM weeks WHERE id=? AND user_id=? FOR UPDATE")
      .bind(weekId, userId).first<{ status: string }>();
    if (!week || week.status === "closed") throw new WeekPlanError("This campaign is closed and preserved in History");

    const activity = await transaction.prepare(
      `SELECT
        (SELECT COUNT(*) FROM daily_completions c JOIN daily_quests q ON q.id=c.quest_id AND q.user_id=c.user_id WHERE c.user_id=? AND q.week_id=?) +
        (SELECT COUNT(*) FROM weekly_quests WHERE user_id=? AND week_id=? AND completed_at IS NOT NULL) count`,
    ).bind(userId, weekId, userId, weekId).first<{ count: number }>();
    if (Number(activity?.count ?? 0) > 0) {
      throw new WeekPlanError("Planning is locked while this campaign contains completed quests. Reopen them before changing the plan.");
    }

    for (const quest of plan.weekly) {
      if (!quest.milestoneId) continue;
      const milestone = await transaction.prepare("SELECT id FROM milestones WHERE id=? AND user_id=?")
        .bind(quest.milestoneId, userId).first<{ id: string }>();
      if (!milestone) throw new WeekPlanError("A linked milestone is unavailable", 400);
    }

    await transaction.prepare("DELETE FROM weekly_quests WHERE week_id=? AND user_id=?").bind(weekId, userId).run();
    await transaction.prepare("DELETE FROM daily_quests WHERE week_id=? AND user_id=?").bind(weekId, userId).run();
    for (const [position, title] of plan.required.entries()) {
      await transaction.prepare("INSERT INTO daily_quests (id,week_id,user_id,title,kind,day_index,position) VALUES (?,?,?,?, 'required',NULL,?)")
        .bind(crypto.randomUUID(), weekId, userId, title, position).run();
    }
    for (const day of plan.bonus) {
      for (const [position, title] of day.titles.entries()) {
        await transaction.prepare("INSERT INTO daily_quests (id,week_id,user_id,title,kind,day_index,position) VALUES (?,?,?,?, 'bonus',?,?)")
          .bind(crypto.randomUUID(), weekId, userId, title, day.dayIndex, position).run();
      }
    }
    for (const [position, quest] of plan.weekly.entries()) {
      await transaction.prepare("INSERT INTO weekly_quests (id,week_id,user_id,milestone_id,title,position) VALUES (?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), weekId, userId, quest.milestoneId, quest.title, position).run();
    }
  });
}

export async function toggleWeeklyQuest(userId: string, questId: string, now: string) {
  return db.transaction(async (transaction) => {
    const quest = await transaction.prepare(
      `SELECT q.completed_at,q.milestone_id,w.status FROM weekly_quests q
       JOIN weeks w ON w.id=q.week_id AND w.user_id=q.user_id
       WHERE q.id=? AND q.user_id=? FOR UPDATE`,
    ).bind(questId, userId).first<{ completed_at: string | null; milestone_id: string | null; status: string }>();
    if (!quest || quest.status === "closed") throw new WeekPlanError("Quest is unavailable", 404);
    const completedAt = quest.completed_at ? null : now;
    await transaction.prepare("UPDATE weekly_quests SET completed_at=? WHERE id=? AND user_id=?")
      .bind(completedAt, questId, userId).run();
    if (quest.milestone_id && completedAt) {
      await transaction.prepare(
        `UPDATE milestones SET
          completed_by_weekly_quest_id=CASE WHEN completed_at IS NULL THEN ? ELSE completed_by_weekly_quest_id END,
          completed_at=COALESCE(completed_at,?)
         WHERE id=? AND user_id=?`,
      ).bind(questId, now, quest.milestone_id, userId).run();
    } else if (quest.milestone_id) {
      await transaction.prepare("UPDATE milestones SET completed_at=NULL,completed_by_weekly_quest_id=NULL WHERE id=? AND user_id=? AND completed_by_weekly_quest_id=?")
        .bind(quest.milestone_id, userId, questId).run();
    }
    return { completed: Boolean(completedAt) };
  });
}

export async function toggleMilestone(userId: string, milestoneId: string, now: string) {
  return db.transaction(async (transaction) => {
    const milestone = await transaction.prepare("SELECT completed_at,completed_by_weekly_quest_id FROM milestones WHERE id=? AND user_id=? FOR UPDATE")
      .bind(milestoneId, userId).first<{ completed_at: string | null; completed_by_weekly_quest_id: string | null }>();
    if (!milestone) throw new WeekPlanError("Milestone not found", 404);
    if (milestone.completed_by_weekly_quest_id) throw new WeekPlanError("This milestone is completed by a linked weekly quest. Reopen that quest first.");
    const completedAt = milestone.completed_at ? null : now;
    await transaction.prepare("UPDATE milestones SET completed_at=?,completed_by_weekly_quest_id=NULL WHERE id=? AND user_id=?")
      .bind(completedAt, milestoneId, userId).run();
    return { completed: Boolean(completedAt) };
  });
}
