import { getAuthUser } from "../../auth";
import { db } from "../../../db";

const env = { DB: db };

type Action =
  | { type: "toggle-daily"; questId: string; completedOn: string }
  | { type: "toggle-weekly"; questId: string }
  | { type: "toggle-milestone"; milestoneId: string }
  | { type: "purchase"; cosmeticId: string }
  | { type: "equip"; cosmeticId: string }
  | { type: "profile"; displayName: string; timezone: string };

type QuestRow = { id: string; title: string; reward: number; kind: "required" | "bonus"; complete: number };
type WeeklyRow = { id: string; title: string; reward: number; complete: number };
type MilestoneRow = { id: string; title: string; reward: number; complete: number; position: number };

const shop = [
  ["forest", "Emerald Keep", "theme", 500, "Deep forest tones and ancient gold."],
  ["royal", "Royal Vanguard", "theme", 750, "Regal plum with polished brass."],
  ["ember", "Emberforge", "theme", 1000, "Smoldering crimson and warm iron."],
  ["early", "Dawn Walker", "badge", 250, "For heroes who begin before sunrise."],
  ["steadfast", "The Steadfast", "badge", 400, "Awarded to the relentlessly consistent."],
] as const;

async function identity() {
  return getAuthUser();
}

function idFor(email: string) {
  return `user_${email.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
}

function localDate(timezone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function weekBounds(dateString: string) {
  const date = new Date(`${dateString}T12:00:00Z`);
  const start = new Date(date);
  start.setUTCDate(date.getUTCDate() - date.getUTCDay());
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

async function ensureUser(email: string, displayName: string) {
  const id = idFor(email);
  await env.DB.prepare(
    `INSERT INTO users (id,email,display_name,timezone,equipped_theme,equipped_badge,created_at)
     VALUES (?,?,?,'America/New_York','obsidian','founder',?)
     ON CONFLICT(email) DO NOTHING`,
  ).bind(id, email, displayName, new Date().toISOString()).run();
  return id;
}

async function seedAccount(userId: string, timezone: string) {
  const today = localDate(timezone);
  const { start, end } = weekBounds(today);
  const weekId = `${userId}_${start}`;
  const goalId = `${userId}_half_marathon`;
  const now = new Date().toISOString();

  const statements = [
    env.DB.prepare("INSERT INTO weeks (id,user_id,starts_on,ends_on,status) VALUES (?,?,?,?, 'active') ON CONFLICT DO NOTHING").bind(weekId, userId, start, end),
    ...[
      ["train", "Train for 30 minutes", "required", null, 10, 0],
      ["plan", "Plan tomorrow before 9 PM", "required", null, 10, 1],
      ["read", "Read 20 pages", "required", null, 10, 2],
      ["water", "Drink 8 glasses of water", "bonus", 3, 15, 0],
      ["walk", "Take a 20 minute walk", "bonus", 3, 15, 1],
    ].map(([key, title, kind, day, reward, position]) =>
      env.DB.prepare("INSERT INTO daily_quests (id,week_id,user_id,title,kind,day_index,reward,position) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING")
        .bind(`${weekId}_${key}`, weekId, userId, title, kind, day, reward, position)),
    ...[
      ["portfolio", "Finish portfolio case study"],
      ["mealprep", "Meal prep for next week"],
    ].map(([key, title], position) =>
      env.DB.prepare("INSERT INTO weekly_quests (id,week_id,user_id,title,reward,position) VALUES (?,?,?,?,100,?) ON CONFLICT DO NOTHING")
        .bind(`${weekId}_${key}`, weekId, userId, title, position)),
    env.DB.prepare("INSERT INTO goals (id,user_id,title,description,target_date,status) VALUES (?,?,?,?,?,'active') ON CONFLICT DO NOTHING")
      .bind(goalId, userId, "Run my first half marathon", "Build endurance, stay consistent, and cross the finish line strong.", "2026-10-18"),
    ...[
      "Choose a training plan", "Run 5K without stopping", "Complete a 10K", "Finish a 10-mile run", "Race day",
    ].map((title, position) =>
      env.DB.prepare("INSERT INTO milestones (id,goal_id,user_id,title,position,reward) VALUES (?,?,?,?,?,150) ON CONFLICT DO NOTHING")
        .bind(`${goalId}_${position}`, goalId, userId, title, position)),
    ...shop.map(([id, name, kind, price, description]) =>
      env.DB.prepare("INSERT INTO cosmetics (id,name,kind,price,description) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING")
        .bind(id, name, kind, price, description)),
    env.DB.prepare("INSERT INTO coin_ledger (id,user_id,amount,reason,source_type,source_id,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT DO NOTHING")
      .bind(`${userId}_welcome`, userId, 450, "Founding adventurer grant", "welcome", "welcome", now),
  ];
  await env.DB.batch(statements);
  return { today, weekId, start, end };
}

async function balance(userId: string) {
  const row = await env.DB.prepare("SELECT COALESCE(SUM(amount),0) AS balance FROM coin_ledger WHERE user_id=?")
    .bind(userId).first<{ balance: number }>();
  return Number(row?.balance ?? 0);
}

async function loadState(userId: string) {
  const profile = await env.DB.prepare("SELECT email,display_name,timezone,equipped_theme,equipped_badge FROM users WHERE id=?")
    .bind(userId).first<{ email: string; display_name: string; timezone: string; equipped_theme: string; equipped_badge: string }>();
  if (!profile) throw new Error("Profile unavailable");
  const campaign = await seedAccount(userId, profile.timezone);
  const [daily, weekly, goals, milestones, cosmetics, owned, coins] = await Promise.all([
    env.DB.prepare(
      `SELECT q.id,q.title,q.reward,q.kind,CASE WHEN c.id IS NULL THEN 0 ELSE 1 END complete
       FROM daily_quests q LEFT JOIN daily_completions c ON c.quest_id=q.id AND c.completed_on=?
       WHERE q.week_id=? ORDER BY q.kind DESC,q.position`,
    ).bind(campaign.today, campaign.weekId).all<QuestRow>(),
    env.DB.prepare(
      `SELECT id,title,reward,CASE WHEN completed_at IS NULL THEN 0 ELSE 1 END complete
       FROM weekly_quests WHERE week_id=? ORDER BY position`,
    ).bind(campaign.weekId).all<WeeklyRow>(),
    env.DB.prepare("SELECT id,title,description,target_date FROM goals WHERE user_id=? AND status='active' ORDER BY target_date").bind(userId).all(),
    env.DB.prepare(
      `SELECT id,goal_id,title,reward,position,CASE WHEN completed_at IS NULL THEN 0 ELSE 1 END complete
       FROM milestones WHERE user_id=? ORDER BY goal_id,position`,
    ).bind(userId).all<MilestoneRow & { goal_id: string }>(),
    env.DB.prepare("SELECT id,name,kind,price,description FROM cosmetics ORDER BY kind,price").all(),
    env.DB.prepare("SELECT cosmetic_id FROM user_cosmetics WHERE user_id=?").bind(userId).all<{ cosmetic_id: string }>(),
    balance(userId),
  ]);
  return {
    profile: {
      email: profile.email, displayName: profile.display_name, timezone: profile.timezone,
      equippedTheme: profile.equipped_theme, equippedBadge: profile.equipped_badge,
    },
    campaign,
    daily: daily.results.map((q) => ({ ...q, complete: Boolean(q.complete) })),
    weekly: weekly.results.map((q) => ({ ...q, complete: Boolean(q.complete) })),
    goals: goals.results.map((goal) => ({
      ...goal,
      milestones: milestones.results.filter((item) => item.goal_id === (goal as { id: string }).id)
        .map((item) => ({ ...item, complete: Boolean(item.complete) })),
    })),
    cosmetics: cosmetics.results,
    owned: ["obsidian", "founder", ...owned.results.map((item) => item.cosmetic_id)],
    balance: coins,
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

    if (action.type === "toggle-daily") {
      const quest = await env.DB.prepare(
        "SELECT q.reward,w.status FROM daily_quests q JOIN weeks w ON w.id=q.week_id WHERE q.id=? AND q.user_id=?",
      ).bind(action.questId, userId).first<{ reward: number; status: string }>();
      if (!quest || quest.status === "closed") return Response.json({ error: "Quest is unavailable" }, { status: 404 });
      const completion = await env.DB.prepare("SELECT id FROM daily_completions WHERE quest_id=? AND completed_on=? AND user_id=?")
        .bind(action.questId, action.completedOn, userId).first<{ id: string }>();
      if (completion) {
        await env.DB.batch([
          env.DB.prepare("DELETE FROM daily_completions WHERE id=? AND user_id=?").bind(completion.id, userId),
          env.DB.prepare("INSERT INTO coin_ledger (id,user_id,amount,reason,source_type,source_id,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), userId, -quest.reward, "Daily quest reopened", "daily-reversal", crypto.randomUUID(), now),
        ]);
      } else {
        const completionId = crypto.randomUUID();
        await env.DB.batch([
          env.DB.prepare("INSERT INTO daily_completions (id,quest_id,user_id,completed_on,completed_at) VALUES (?,?,?,?,?)")
            .bind(completionId, action.questId, userId, action.completedOn, now),
          env.DB.prepare("INSERT INTO coin_ledger (id,user_id,amount,reason,source_type,source_id,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), userId, quest.reward, "Daily quest complete", "daily", completionId, now),
        ]);
      }
      await reconcileStrongDay(userId, action.completedOn);
    } else if (action.type === "toggle-weekly") {
      const quest = await env.DB.prepare(
        "SELECT q.reward,q.completed_at,w.status FROM weekly_quests q JOIN weeks w ON w.id=q.week_id WHERE q.id=? AND q.user_id=?",
      ).bind(action.questId, userId).first<{ reward: number; completed_at: string | null; status: string }>();
      if (!quest || quest.status === "closed") return Response.json({ error: "Quest is unavailable" }, { status: 404 });
      const completing = !quest.completed_at;
      await env.DB.batch([
        env.DB.prepare("UPDATE weekly_quests SET completed_at=? WHERE id=? AND user_id=?").bind(completing ? now : null, action.questId, userId),
        env.DB.prepare("INSERT INTO coin_ledger (id,user_id,amount,reason,source_type,source_id,created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), userId, completing ? quest.reward : -quest.reward, completing ? "Weekly quest complete" : "Weekly quest reopened", "weekly-toggle", crypto.randomUUID(), now),
      ]);
    } else if (action.type === "toggle-milestone") {
      const item = await env.DB.prepare("SELECT reward,completed_at FROM milestones WHERE id=? AND user_id=?")
        .bind(action.milestoneId, userId).first<{ reward: number; completed_at: string | null }>();
      if (!item) return Response.json({ error: "Milestone not found" }, { status: 404 });
      const completing = !item.completed_at;
      await env.DB.batch([
        env.DB.prepare("UPDATE milestones SET completed_at=? WHERE id=? AND user_id=?").bind(completing ? now : null, action.milestoneId, userId),
        env.DB.prepare("INSERT INTO coin_ledger (id,user_id,amount,reason,source_type,source_id,created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), userId, completing ? item.reward : -item.reward, completing ? "Milestone complete" : "Milestone reopened", "milestone-toggle", crypto.randomUUID(), now),
      ]);
    } else if (action.type === "purchase") {
      const item = await env.DB.prepare("SELECT id,price FROM cosmetics WHERE id=?").bind(action.cosmeticId).first<{ id: string; price: number }>();
      if (!item) return Response.json({ error: "Cosmetic not found" }, { status: 404 });
      const alreadyOwned = await env.DB.prepare("SELECT 1 owned FROM user_cosmetics WHERE user_id=? AND cosmetic_id=?").bind(userId, item.id).first();
      if (alreadyOwned) return Response.json({ error: "Cosmetic already owned" }, { status: 409 });
      if (await balance(userId) < item.price) return Response.json({ error: "Insufficient coins" }, { status: 409 });
      await env.DB.batch([
        env.DB.prepare("INSERT INTO user_cosmetics (user_id,cosmetic_id,purchased_at) VALUES (?,?,?)").bind(userId, item.id, now),
        env.DB.prepare("INSERT INTO coin_ledger (id,user_id,amount,reason,source_type,source_id,created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), userId, -item.price, "Cosmetic purchased", "purchase", item.id, now),
      ]);
    } else if (action.type === "equip") {
      if (action.cosmeticId === "obsidian") {
        await env.DB.prepare("UPDATE users SET equipped_theme='obsidian' WHERE id=?").bind(userId).run();
      } else {
        const item = await env.DB.prepare(
          "SELECT c.id,c.kind FROM cosmetics c JOIN user_cosmetics u ON u.cosmetic_id=c.id WHERE c.id=? AND u.user_id=?",
        ).bind(action.cosmeticId, userId).first<{ id: string; kind: string }>();
        if (!item) return Response.json({ error: "Cosmetic is not owned" }, { status: 403 });
        const column = item.kind === "theme" ? "equipped_theme" : "equipped_badge";
        await env.DB.prepare(`UPDATE users SET ${column}=? WHERE id=?`).bind(item.id, userId).run();
      }
    } else if (action.type === "profile") {
      if (!action.displayName.trim() || !action.timezone.includes("/")) return Response.json({ error: "Invalid profile" }, { status: 400 });
      await env.DB.prepare("UPDATE users SET display_name=?,timezone=? WHERE id=?").bind(action.displayName.trim(), action.timezone, userId).run();
    } else {
      return Response.json({ error: "Unknown action" }, { status: 400 });
    }
    return Response.json(await loadState(userId));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update campaign" }, { status: 500 });
  }
}

async function reconcileStrongDay(userId: string, completedOn: string) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) total FROM daily_completions c JOIN daily_quests q ON q.id=c.quest_id
     WHERE c.user_id=? AND c.completed_on=? AND q.kind='required'`,
  ).bind(userId, completedOn).first<{ total: number }>();
  const sourceId = `${userId}:${completedOn}`;
  const awarded = await env.DB.prepare("SELECT COALESCE(SUM(amount),0) amount FROM coin_ledger WHERE user_id=? AND source_type='strong-day' AND source_id LIKE ?")
    .bind(userId, `${sourceId}:%`).first<{ amount: number }>();
  const shouldAward = Number(row?.total ?? 0) === 3;
  const hasAward = Number(awarded?.amount ?? 0) > 0;
  if (shouldAward !== hasAward) {
    await env.DB.prepare("INSERT INTO coin_ledger (id,user_id,amount,reason,source_type,source_id,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), userId, shouldAward ? 20 : -20, shouldAward ? "Strong Day complete" : "Strong Day reopened", "strong-day", `${sourceId}:${crypto.randomUUID()}`, new Date().toISOString()).run();
  }
}
