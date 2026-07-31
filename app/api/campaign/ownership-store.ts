import { db } from "../../../db";

export type OwnedDailyQuest = { reward: number; status: string };
export type OwnedCompletion = { id: string };
export type OwnedWeeklyQuest = { reward: number; completed_at: string | null; status: string };
export type OwnedMilestone = { reward: number; completed_at: string | null };
export type OwnedCosmetic = { id: string; kind: string };

export function findDailyQuest(userId: string, questId: string) {
  return db.prepare("SELECT q.reward,w.status FROM daily_quests q JOIN weeks w ON w.id=q.week_id WHERE q.id=? AND q.user_id=? AND w.user_id=?")
    .bind(questId, userId, userId).first<OwnedDailyQuest>();
}

export function findDailyCompletion(userId: string, questId: string, completedOn: string) {
  return db.prepare("SELECT id FROM daily_completions WHERE quest_id=? AND completed_on=? AND user_id=?")
    .bind(questId, completedOn, userId).first<OwnedCompletion>();
}

export function findWeeklyQuest(userId: string, questId: string) {
  return db.prepare("SELECT q.reward,q.completed_at,w.status FROM weekly_quests q JOIN weeks w ON w.id=q.week_id WHERE q.id=? AND q.user_id=? AND w.user_id=?")
    .bind(questId, userId, userId).first<OwnedWeeklyQuest>();
}

export function findMilestone(userId: string, milestoneId: string) {
  return db.prepare("SELECT reward,completed_at FROM milestones WHERE id=? AND user_id=?")
    .bind(milestoneId, userId).first<OwnedMilestone>();
}

export function findOwnedCosmetic(userId: string, cosmeticId: string) {
  return db.prepare("SELECT c.id,c.kind FROM cosmetics c JOIN user_cosmetics u ON u.cosmetic_id=c.id WHERE c.id=? AND u.user_id=?")
    .bind(cosmeticId, userId).first<OwnedCosmetic>();
}

export function deleteDailyCompletion(userId: string, completionId: string) {
  return db.prepare("DELETE FROM daily_completions WHERE id=? AND user_id=?").bind(completionId, userId);
}

export function updateWeeklyCompletion(userId: string, questId: string, completedAt: string | null) {
  return db.prepare("UPDATE weekly_quests SET completed_at=? WHERE id=? AND user_id=?").bind(completedAt, questId, userId);
}

export function updateMilestoneCompletion(userId: string, milestoneId: string, completedAt: string | null) {
  return db.prepare("UPDATE milestones SET completed_at=? WHERE id=? AND user_id=?").bind(completedAt, milestoneId, userId);
}

export function updateProfile(userId: string, displayName: string, timezone: string) {
  return db.prepare("UPDATE users SET display_name=?,timezone=? WHERE id=?").bind(displayName, timezone, userId);
}
