import { db } from "../../../db";

export type OwnedDailyQuest = { status: string; starts_on: string; ends_on: string; kind: "required" | "bonus"; day_index: number | null };
export type OwnedCompletion = { id: string };
export type OwnedWeeklyQuest = { completed_at: string | null; status: string };
export type OwnedMilestone = { completed_at: string | null; completed_by_weekly_quest_id: string | null };

export function findDailyQuest(userId: string, questId: string) {
  return db.prepare("SELECT q.kind,q.day_index,w.status,w.starts_on,w.ends_on FROM daily_quests q JOIN weeks w ON w.id=q.week_id WHERE q.id=? AND q.user_id=? AND w.user_id=?")
    .bind(questId, userId, userId).first<OwnedDailyQuest>();
}

export function findDailyCompletion(userId: string, questId: string, completedOn: string) {
  return db.prepare("SELECT id FROM daily_completions WHERE quest_id=? AND completed_on=? AND user_id=?")
    .bind(questId, completedOn, userId).first<OwnedCompletion>();
}

export function findWeeklyQuest(userId: string, questId: string) {
  return db.prepare("SELECT q.completed_at,w.status FROM weekly_quests q JOIN weeks w ON w.id=q.week_id WHERE q.id=? AND q.user_id=? AND w.user_id=?")
    .bind(questId, userId, userId).first<OwnedWeeklyQuest>();
}

export function findMilestone(userId: string, milestoneId: string) {
  return db.prepare("SELECT completed_at,completed_by_weekly_quest_id FROM milestones WHERE id=? AND user_id=?")
    .bind(milestoneId, userId).first<OwnedMilestone>();
}

export function deleteDailyCompletion(userId: string, completionId: string) {
  return db.prepare("DELETE FROM daily_completions WHERE id=? AND user_id=?").bind(completionId, userId);
}

export function updateWeeklyCompletion(userId: string, questId: string, completedAt: string | null) {
  return db.prepare("UPDATE weekly_quests SET completed_at=? WHERE id=? AND user_id=?").bind(completedAt, questId, userId);
}

export function updateMilestoneCompletion(userId: string, milestoneId: string, completedAt: string | null) {
  return db.prepare("UPDATE milestones SET completed_at=?,completed_by_weekly_quest_id=NULL WHERE id=? AND user_id=?").bind(completedAt, milestoneId, userId);
}

export function updateProfile(userId: string, displayName: string, timezone: string) {
  return db.prepare("UPDATE users SET display_name=?,timezone=? WHERE id=?").bind(displayName, timezone, userId);
}
