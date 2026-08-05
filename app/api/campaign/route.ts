import { getAuthUser } from "../../auth";
import { db } from "../../../db";
import { deleteDailyCompletion, findDailyCompletion, findDailyQuest, findMilestone, findWeeklyQuest, updateMilestoneCompletion, updateProfile, updateWeeklyCompletion } from "./ownership-store";
import { addDays, localDate, validateWeekPlan, weekBounds, type WeekPlanInput } from "./week-planning";
import { DAILY_QUEST_POINTS, prestigeStatus } from "./prestige";

const env = { DB: db };

type Action =
  | { type: "toggle-daily"; questId: string; completedOn: string }
  | { type: "toggle-weekly"; questId: string }
  | { type: "toggle-milestone"; milestoneId: string }
  | { type: "profile"; displayName: string; timezone: string }
  | ({ type: "plan-week" } & WeekPlanInput);

type QuestRow = { id: string; title: string; kind: "required" | "bonus"; day_index: number | null; position: number; complete: number };
type WeeklyRow = { id: string; title: string; complete: number };
type MilestoneRow = { id: string; title: string; complete: number; position: number };

async function identity() {
  return getAuthUser();
}

function idFor(email: string) {
  return `user_${email.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
}

async function ensureUser(email: string, displayName: string) {
  const id = idFor(email);
  await env.DB.prepare(
    `INSERT INTO users (id,email,display_name,timezone,created_at)
     VALUES (?,?,?,'America/New_York',?)
     ON CONFLICT(email) DO NOTHING`,
  ).bind(id, email, displayName, new Date().toISOString()).run();
  return id;
}

async function seedAccount(userId: string, timezone: string) {
  const today = localDate(timezone);
  const { start, end } = weekBounds(today);
  const weekId = `${userId}_${start}`;
  const nextStart = addDays(start, 7);
  const nextEnd = addDays(nextStart, 6);
  const nextWeekId = `${userId}_${nextStart}`;
  const goalId = `${userId}_half_marathon`;
  await env.DB.batch([
    env.DB.prepare("UPDATE weeks SET status='closed' WHERE user_id=? AND ends_on<?").bind(userId, today),
    env.DB.prepare("INSERT INTO weeks (id,user_id,starts_on,ends_on,status) VALUES (?,?,?,?, 'active') ON CONFLICT DO NOTHING").bind(weekId, userId, start, end),
    env.DB.prepare("UPDATE weeks SET status='active',ends_on=? WHERE id=? AND user_id=?").bind(end, weekId, userId),
    env.DB.prepare("INSERT INTO weeks (id,user_id,starts_on,ends_on,status) VALUES (?,?,?,?,'planning') ON CONFLICT DO NOTHING").bind(nextWeekId, userId, nextStart, nextEnd),
    env.DB.prepare("INSERT INTO goals (id,user_id,title,description,target_date,status) VALUES (?,?,?,?,?,'active') ON CONFLICT DO NOTHING")
      .bind(goalId, userId, "Run my first half marathon", "Build endurance, stay consistent, and cross the finish line strong.", "2026-10-18"),
    ...[
      "Choose a training plan", "Run 5K without stopping", "Complete a 10K", "Finish a 10-mile run", "Race day",
    ].map((title, position) =>
      env.DB.prepare("INSERT INTO milestones (id,goal_id,user_id,title,position) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING")
        .bind(`${goalId}_${position}`, goalId, userId, title, position)),
  ]);

  const existing = await env.DB.prepare("SELECT COUNT(*) count FROM daily_quests WHERE week_id=? AND user_id=?").bind(weekId, userId).first<{ count: number }>();
  if (Number(existing?.count ?? 0) === 0) {
    await env.DB.batch([
      ...[
        ["Train for 30 minutes", "required", null, 0],
        ["Plan tomorrow before 9 PM", "required", null, 1],
        ["Read 20 pages", "required", null, 2],
        ["Drink 8 glasses of water", "bonus", new Date(`${today}T12:00:00Z`).getUTCDay(), 0],
        ["Take a 20 minute walk", "bonus", new Date(`${today}T12:00:00Z`).getUTCDay(), 1],
      ].map(([title, kind, day, position]) => env.DB.prepare("INSERT INTO daily_quests (id,week_id,user_id,title,kind,day_index,position) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), weekId, userId, title, kind, day, position)),
      ...["Finish portfolio case study", "Meal prep for next week"].map((title, position) => env.DB.prepare("INSERT INTO weekly_quests (id,week_id,user_id,title,position) VALUES (?,?,?,?,?)")
        .bind(crypto.randomUUID(), weekId, userId, title, position)),
    ]);
  }
  return { today, weekId, start, end, nextWeekId, nextStart, nextEnd };
}

async function prestigePoints(userId: string) {
  const row = await env.DB.prepare("SELECT COALESCE(SUM(points),0) AS points FROM prestige_ledger WHERE user_id=?")
    .bind(userId).first<{ points: number }>();
  return Number(row?.points ?? 0);
}

async function loadPlanner(userId: string, campaign: Awaited<ReturnType<typeof seedAccount>>) {
  const weekIds = [campaign.weekId, campaign.nextWeekId];
  const [weeks, daily, weekly, completions] = await Promise.all([
    env.DB.prepare("SELECT id,starts_on,ends_on,status FROM weeks WHERE user_id=? AND id IN (?,?) ORDER BY starts_on").bind(userId, ...weekIds).all<{ id: string; starts_on: string; ends_on: string; status: string }>(),
    env.DB.prepare("SELECT id,week_id,title,kind,day_index,position FROM daily_quests WHERE user_id=? AND week_id IN (?,?) ORDER BY kind DESC,day_index,position").bind(userId, ...weekIds).all<{ id: string; week_id: string; title: string; kind: "required" | "bonus"; day_index: number | null; position: number }>(),
    env.DB.prepare("SELECT id,week_id,title,position,completed_at FROM weekly_quests WHERE user_id=? AND week_id IN (?,?) ORDER BY position").bind(userId, ...weekIds).all<{ id: string; week_id: string; title: string; position: number; completed_at: string | null }>(),
    env.DB.prepare("SELECT c.completed_on,COUNT(*) count FROM daily_completions c JOIN daily_quests q ON q.id=c.quest_id WHERE c.user_id=? AND q.user_id=? AND q.kind='required' AND c.completed_on>=? AND c.completed_on<=? GROUP BY c.completed_on").bind(userId, userId, campaign.start, campaign.end).all<{ completed_on: string; count: number }>(),
  ]);
  return weeks.results.map((week) => ({
    id: week.id, startsOn: week.starts_on, endsOn: week.ends_on, status: week.status,
    required: daily.results.filter((quest) => quest.week_id === week.id && quest.kind === "required"),
    bonus: Array.from({ length: 7 }, (_, dayIndex) => ({ dayIndex, quests: daily.results.filter((quest) => quest.week_id === week.id && quest.kind === "bonus" && quest.day_index === dayIndex) })),
    weekly: weekly.results.filter((quest) => quest.week_id === week.id).map((quest) => ({ ...quest, complete: Boolean(quest.completed_at) })),
    days: Array.from({ length: 7 }, (_, dayIndex) => {
      const date = addDays(week.starts_on, dayIndex);
      const count = Number(completions.results.find((item) => item.completed_on === date)?.count ?? 0);
      return { dayIndex, date, requiredComplete: Math.min(count, 3), active: date === campaign.today };
    }),
  }));
}

async function loadHistory(userId: string, timezone: string, today: string) {
  const [weeks, dailyCompletions, weeklyQuests, ledger] = await Promise.all([
    env.DB.prepare("SELECT id,starts_on,ends_on FROM weeks WHERE user_id=? AND status='closed' ORDER BY starts_on DESC LIMIT 52")
      .bind(userId).all<{ id: string; starts_on: string; ends_on: string }>(),
    env.DB.prepare(
      `SELECT q.week_id,c.completed_on FROM daily_completions c
       JOIN daily_quests q ON q.id=c.quest_id AND q.user_id=c.user_id
       WHERE c.user_id=? AND q.kind='required'`,
    ).bind(userId).all<{ week_id: string; completed_on: string }>(),
    env.DB.prepare(
      `SELECT week_id,CASE WHEN completed_at IS NULL THEN 0 ELSE 1 END complete
       FROM weekly_quests WHERE user_id=?`,
    ).bind(userId).all<{ week_id: string; complete: number }>(),
    env.DB.prepare("SELECT points,created_at FROM prestige_ledger WHERE user_id=?")
      .bind(userId).all<{ points: number; created_at: string }>(),
  ]);

  const requiredByDate = new Map<string, number>();
  for (const completion of dailyCompletions.results) {
    requiredByDate.set(completion.completed_on, (requiredByDate.get(completion.completed_on) ?? 0) + 1);
  }
  const strongDates = [...requiredByDate.entries()]
    .filter(([, count]) => count === 3)
    .map(([date]) => date)
    .sort();
  const strongDateSet = new Set(strongDates);
  let streak = 0;
  let cursor = strongDateSet.has(today) ? today : addDays(today, -1);
  while (strongDateSet.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  const transactions = ledger.results.map((entry) => ({
    ...entry,
    localDay: localDate(timezone, new Date(entry.created_at)),
  }));
  const lifetimePoints = transactions.reduce((total, entry) => total + entry.points, 0);

  return {
    summary: { currentStreak: streak, strongDays: strongDates.length, lifetimePoints },
    weeks: weeks.results.map((week) => {
      const days = Array.from({ length: 7 }, (_, dayIndex) => {
        const date = addDays(week.starts_on, dayIndex);
        return { date, requiredComplete: Math.min(requiredByDate.get(date) ?? 0, 3), strong: strongDateSet.has(date) };
      });
      const assigned = weeklyQuests.results.filter((quest) => quest.week_id === week.id);
      const pointsEarned = transactions
        .filter((entry) => entry.localDay >= week.starts_on && entry.localDay <= week.ends_on)
        .reduce((total, entry) => total + entry.points, 0);
      const strongDays = days.filter((day) => day.strong).length;
      return {
        id: week.id,
        startsOn: week.starts_on,
        endsOn: week.ends_on,
        days,
        strongDays,
        weeklyCompleted: assigned.filter((quest) => Boolean(quest.complete)).length,
        weeklyAssigned: assigned.length,
        pointsEarned,
        rank: strongDays >= 6 ? "Legendary" : strongDays >= 5 ? "Strong" : strongDays >= 3 ? "Steady" : "Rebuilding",
      };
    }),
  };
}

async function loadState(userId: string) {
  const profile = await env.DB.prepare("SELECT email,display_name,timezone FROM users WHERE id=?")
    .bind(userId).first<{ email: string; display_name: string; timezone: string }>();
  if (!profile) throw new Error("Profile unavailable");
  const campaign = await seedAccount(userId, profile.timezone);
  const dayIndex = new Date(`${campaign.today}T12:00:00Z`).getUTCDay();
  const [daily, weekly, goals, milestones, points, planner, history] = await Promise.all([
    env.DB.prepare(
      `SELECT q.id,q.title,q.kind,CASE WHEN c.id IS NULL THEN 0 ELSE 1 END complete
       FROM daily_quests q LEFT JOIN daily_completions c ON c.quest_id=q.id AND c.completed_on=?
       WHERE q.week_id=? AND q.user_id=? AND (q.kind='required' OR q.day_index=?) ORDER BY q.kind DESC,q.position`,
    ).bind(campaign.today, campaign.weekId, userId, dayIndex).all<QuestRow>(),
    env.DB.prepare(
      `SELECT id,title,CASE WHEN completed_at IS NULL THEN 0 ELSE 1 END complete
       FROM weekly_quests WHERE week_id=? AND user_id=? ORDER BY position`,
    ).bind(campaign.weekId, userId).all<WeeklyRow>(),
    env.DB.prepare("SELECT id,title,description,target_date FROM goals WHERE user_id=? AND status='active' ORDER BY target_date").bind(userId).all(),
    env.DB.prepare(
      `SELECT id,goal_id,title,position,CASE WHEN completed_at IS NULL THEN 0 ELSE 1 END complete
       FROM milestones WHERE user_id=? ORDER BY goal_id,position`,
    ).bind(userId).all<MilestoneRow & { goal_id: string }>(),
    prestigePoints(userId),
    loadPlanner(userId, campaign),
    loadHistory(userId, profile.timezone, campaign.today),
  ]);
  return {
    profile: {
      email: profile.email, displayName: profile.display_name, timezone: profile.timezone,
    },
    campaign,
    daily: daily.results.map((q) => ({ ...q, complete: Boolean(q.complete) })),
    weekly: weekly.results.map((q) => ({ ...q, complete: Boolean(q.complete) })),
    goals: goals.results.map((goal) => ({
      ...goal,
      milestones: milestones.results.filter((item) => item.goal_id === (goal as { id: string }).id)
        .map((item) => ({ ...item, complete: Boolean(item.complete) })),
    })),
    prestige: prestigeStatus(points),
    planner,
    history,
  };
}

export async function GET() {
  try {
    const auth = await identity();
    if (!auth) return Response.json({ error: "Authentication required" }, { status: 401 });
    const id = await ensureUser(auth.email, auth.displayName);
    return Response.json(await loadState(id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load campaign" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await identity();
    if (!auth) return Response.json({ error: "Authentication required" }, { status: 401 });
    const userId = await ensureUser(auth.email, auth.displayName);
    const action = await request.json() as Action;
    const now = new Date().toISOString();

    if (action.type === "plan-week") {
      const profile = await env.DB.prepare("SELECT timezone FROM users WHERE id=?").bind(userId).first<{ timezone: string }>();
      const today = localDate(profile?.timezone ?? "America/New_York");
      const plan = validateWeekPlan(action, today);
      const bounds = weekBounds(plan.startsOn);
      const weekId = `${userId}_${plan.startsOn}`;
      const week = await env.DB.prepare("SELECT status FROM weeks WHERE id=? AND user_id=?").bind(weekId, userId).first<{ status: string }>();
      if (!week || week.status === "closed") return Response.json({ error: "This week can no longer be planned" }, { status: 409 });
      const activity = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM daily_completions WHERE user_id=? AND completed_on>=? AND completed_on<=?) + (SELECT COUNT(*) FROM weekly_quests WHERE user_id=? AND week_id=? AND completed_at IS NOT NULL) count")
        .bind(userId, bounds.start, bounds.end, userId, weekId).first<{ count: number }>();
      if (Number(activity?.count ?? 0) > 0) return Response.json({ error: "A week with completed quests cannot be replanned" }, { status: 409 });
      await env.DB.batch([
        env.DB.prepare("DELETE FROM weekly_quests WHERE week_id=? AND user_id=?").bind(weekId, userId),
        env.DB.prepare("DELETE FROM daily_quests WHERE week_id=? AND user_id=?").bind(weekId, userId),
        ...plan.required.map((title, position) => env.DB.prepare("INSERT INTO daily_quests (id,week_id,user_id,title,kind,day_index,position) VALUES (?,?,?,?, 'required',NULL,?)").bind(crypto.randomUUID(), weekId, userId, title, position)),
        ...plan.bonus.flatMap((day) => day.titles.map((title, position) => env.DB.prepare("INSERT INTO daily_quests (id,week_id,user_id,title,kind,day_index,position) VALUES (?,?,?,?, 'bonus',?,?)").bind(crypto.randomUUID(), weekId, userId, title, day.dayIndex, position))),
        ...plan.weekly.map((title, position) => env.DB.prepare("INSERT INTO weekly_quests (id,week_id,user_id,title,position) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), weekId, userId, title, position)),
      ]);
    } else if (action.type === "toggle-daily") {
      const quest = await findDailyQuest(userId, action.questId);
      if (!quest || quest.status === "closed") return Response.json({ error: "Quest is unavailable" }, { status: 404 });
      const timezone = await env.DB.prepare("SELECT timezone FROM users WHERE id=?").bind(userId).first<{ timezone: string }>();
      const today = localDate(timezone?.timezone ?? "America/New_York");
      const todayIndex = new Date(`${today}T12:00:00Z`).getUTCDay();
      if (action.completedOn !== today || (quest.kind === "bonus" && quest.day_index !== todayIndex)) return Response.json({ error: "Daily quests can only be changed on their scheduled local day" }, { status: 409 });
      const completion = await findDailyCompletion(userId, action.questId, action.completedOn);
      if (completion) {
        await env.DB.batch([
          deleteDailyCompletion(userId, completion.id),
          env.DB.prepare("INSERT INTO prestige_ledger (id,user_id,points,reason,source_type,source_id,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), userId, -DAILY_QUEST_POINTS, "Daily quest reopened", "daily-reversal", completion.id, now),
        ]);
      } else {
        const completionId = crypto.randomUUID();
        await env.DB.batch([
          env.DB.prepare("INSERT INTO daily_completions (id,quest_id,user_id,completed_on,completed_at) VALUES (?,?,?,?,?)")
            .bind(completionId, action.questId, userId, action.completedOn, now),
          env.DB.prepare("INSERT INTO prestige_ledger (id,user_id,points,reason,source_type,source_id,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), userId, DAILY_QUEST_POINTS, "Daily quest complete", "daily-award", completionId, now),
        ]);
      }
    } else if (action.type === "toggle-weekly") {
      const quest = await findWeeklyQuest(userId, action.questId);
      if (!quest || quest.status === "closed") return Response.json({ error: "Quest is unavailable" }, { status: 404 });
      const completing = !quest.completed_at;
      await updateWeeklyCompletion(userId, action.questId, completing ? now : null).run();
    } else if (action.type === "toggle-milestone") {
      const item = await findMilestone(userId, action.milestoneId);
      if (!item) return Response.json({ error: "Milestone not found" }, { status: 404 });
      const completing = !item.completed_at;
      await updateMilestoneCompletion(userId, action.milestoneId, completing ? now : null).run();
    } else if (action.type === "profile") {
      if (!action.displayName.trim() || !action.timezone.includes("/")) return Response.json({ error: "Invalid profile" }, { status: 400 });
      await updateProfile(userId, action.displayName.trim(), action.timezone).run();
    } else {
      return Response.json({ error: "Unknown action" }, { status: 400 });
    }
    return Response.json(await loadState(userId));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update campaign" }, { status: 500 });
  }
}
