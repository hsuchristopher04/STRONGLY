import { db } from "../../../db";
import { addDays, weekBounds } from "./week-planning";

const starterRequired = ["Train for 30 minutes", "Plan tomorrow before 9 PM", "Read 20 pages"];
const starterWeekly = ["Finish portfolio case study", "Meal prep for next week"];

export async function ensureWeekLifecycle(userId: string, today: string) {
  const { start, end } = weekBounds(today);
  const weekId = `${userId}_${start}`;
  const nextStart = addDays(start, 7);
  const nextEnd = addDays(nextStart, 6);
  const nextWeekId = `${userId}_${nextStart}`;

  await db.transaction(async (transaction) => {
    const user = await transaction.prepare("SELECT id FROM users WHERE id=? FOR UPDATE").bind(userId).first<{ id: string }>();
    if (!user) throw new Error("User profile unavailable");

    await transaction.prepare("UPDATE weeks SET status='closed' WHERE user_id=? AND ends_on<? AND status<>'closed'")
      .bind(userId, today).run();
    await transaction.prepare("INSERT INTO weeks (id,user_id,starts_on,ends_on,status) VALUES (?,?,?,?, 'active') ON CONFLICT(user_id,starts_on) DO NOTHING")
      .bind(weekId, userId, start, end).run();
    await transaction.prepare("UPDATE weeks SET status='active',ends_on=? WHERE id=? AND user_id=? AND status<>'closed'")
      .bind(end, weekId, userId).run();
    await transaction.prepare("INSERT INTO weeks (id,user_id,starts_on,ends_on,status) VALUES (?,?,?,?,'planning') ON CONFLICT(user_id,starts_on) DO NOTHING")
      .bind(nextWeekId, userId, nextStart, nextEnd).run();

    const questCount = await transaction.prepare("SELECT COUNT(*) count FROM daily_quests WHERE week_id=? AND user_id=?")
      .bind(weekId, userId).first<{ count: number }>();
    if (Number(questCount?.count ?? 0) === 0) {
      for (const [position, title] of starterRequired.entries()) {
        await transaction.prepare("INSERT INTO daily_quests (id,week_id,user_id,title,kind,day_index,position) VALUES (?,?,?,?, 'required',NULL,?)")
          .bind(crypto.randomUUID(), weekId, userId, title, position).run();
      }
      for (const [position, title] of starterWeekly.entries()) {
        await transaction.prepare("INSERT INTO weekly_quests (id,week_id,user_id,title,position) VALUES (?,?,?,?,?)")
          .bind(crypto.randomUUID(), weekId, userId, title, position).run();
      }
    }
  });

  return { today, weekId, start, end, nextWeekId, nextStart, nextEnd };
}
