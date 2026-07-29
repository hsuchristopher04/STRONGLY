import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { getChatGPTUser } from "../../chatgpt-auth";

type Action =
  | { type: "complete-daily"; questId: string; completedOn: string }
  | { type: "complete-weekly"; questId: string }
  | { type: "complete-milestone"; milestoneId: string }
  | { type: "purchase"; cosmeticId: string }
  | { type: "equip"; cosmeticId: string }
  | { type: "profile"; displayName: string; timezone: string };

async function identity() {
  const user = await getChatGPTUser();
  if (user) return user;
  const host = (await headers()).get("host") ?? "";
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    return { email: "hero@strongly.local", displayName: "Hero", fullName: "Hero" };
  }
  return null;
}

function userId(email: string) {
  return `user_${email.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
}

async function ensureUser(email: string, displayName: string) {
  const id = userId(email);
  await env.DB.prepare(
    `INSERT INTO users (id, email, display_name, timezone, equipped_theme, equipped_badge, created_at)
     VALUES (?, ?, ?, 'America/New_York', 'obsidian', 'founder', ?)
     ON CONFLICT(email) DO NOTHING`,
  ).bind(id, email, displayName, new Date().toISOString()).run();
  return id;
}

async function balance(id: string) {
  const row = await env.DB.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS balance FROM coin_ledger WHERE user_id = ?",
  ).bind(id).first<{ balance: number }>();
  return Number(row?.balance ?? 0);
}

export async function GET() {
  const auth = await identity();
  if (!auth) return Response.json({ error: "Authentication required" }, { status: 401 });
  const id = await ensureUser(auth.email, auth.displayName);
  const [profile, activeWeek, goals, cosmetics, owned, coins] = await Promise.all([
    env.DB.prepare("SELECT email, display_name, timezone, equipped_theme, equipped_badge FROM users WHERE id = ?").bind(id).first(),
    env.DB.prepare("SELECT * FROM weeks WHERE user_id = ? AND status IN ('planning','active') ORDER BY starts_on LIMIT 2").bind(id).all(),
    env.DB.prepare("SELECT * FROM goals WHERE user_id = ? AND status = 'active' ORDER BY target_date").bind(id).all(),
    env.DB.prepare("SELECT * FROM cosmetics ORDER BY kind, price").all(),
    env.DB.prepare("SELECT cosmetic_id FROM user_cosmetics WHERE user_id = ?").bind(id).all(),
    balance(id),
  ]);
  return Response.json({ profile, weeks: activeWeek.results, goals: goals.results, cosmetics: cosmetics.results, owned: owned.results, balance: coins });
}

export async function POST(request: Request) {
  const auth = await identity();
  if (!auth) return Response.json({ error: "Authentication required" }, { status: 401 });
  const id = await ensureUser(auth.email, auth.displayName);
  const action = await request.json() as Action;
  const now = new Date().toISOString();

  if (action.type === "profile") {
    if (!action.displayName.trim() || !action.timezone.includes("/")) return Response.json({ error: "Invalid profile" }, { status: 400 });
    await env.DB.prepare("UPDATE users SET display_name = ?, timezone = ? WHERE id = ?").bind(action.displayName.trim(), action.timezone, id).run();
  } else if (action.type === "complete-daily") {
    const quest = await env.DB.prepare(
      `SELECT q.id, q.reward, q.kind, w.status, w.starts_on, w.ends_on
       FROM daily_quests q JOIN weeks w ON w.id = q.week_id WHERE q.id = ? AND q.user_id = ?`,
    ).bind(action.questId, id).first<{ id: string; reward: number; kind: string; status: string; starts_on: string; ends_on: string }>();
    if (!quest || quest.status === "closed") return Response.json({ error: "Quest is unavailable" }, { status: 404 });
    const sourceId = `${action.questId}:${action.completedOn}`;
    const existing = await env.DB.prepare("SELECT id FROM daily_completions WHERE quest_id = ? AND completed_on = ?").bind(action.questId, action.completedOn).first();
    if (existing) {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM daily_completions WHERE quest_id = ? AND completed_on = ? AND user_id = ?").bind(action.questId, action.completedOn, id),
        env.DB.prepare("INSERT OR IGNORE INTO coin_ledger (id,user_id,amount,reason,source_type,source_id,created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), id, -quest.reward, "Quest reopened", "daily-reversal", sourceId, now),
      ]);
    } else {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO daily_completions (id,quest_id,user_id,completed_on,completed_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), action.questId, id, action.completedOn, now),
        env.DB.prepare("INSERT OR IGNORE INTO coin_ledger (id,user_id,amount,reason,source_type,source_id,created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), id, quest.reward, "Daily quest complete", "daily", sourceId, now),
      ]);
    }
  } else if (action.type === "complete-weekly") {
    const quest = await env.DB.prepare("SELECT q.reward,q.completed_at,w.status FROM weekly_quests q JOIN weeks w ON w.id=q.week_id WHERE q.id=? AND q.user_id=?").bind(action.questId, id).first<{ reward: number; completed_at: string | null; status: string }>();
    if (!quest || quest.status === "closed") return Response.json({ error: "Quest is unavailable" }, { status: 404 });
    const completing = !quest.completed_at;
    await env.DB.batch([
      env.DB.prepare("UPDATE weekly_quests SET completed_at=? WHERE id=? AND user_id=?").bind(completing ? now : null, action.questId, id),
      env.DB.prepare("INSERT OR IGNORE INTO coin_ledger (id,user_id,amount,reason,source_type,source_id,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), id, completing ? quest.reward : -quest.reward, completing ? "Weekly quest complete" : "Weekly quest reopened", completing ? "weekly" : "weekly-reversal", action.questId, now),
    ]);
  } else if (action.type === "complete-milestone") {
    const milestone = await env.DB.prepare("SELECT reward,completed_at FROM milestones WHERE id=? AND user_id=?").bind(action.milestoneId, id).first<{ reward: number; completed_at: string | null }>();
    if (!milestone) return Response.json({ error: "Milestone not found" }, { status: 404 });
    const completing = !milestone.completed_at;
    await env.DB.batch([
      env.DB.prepare("UPDATE milestones SET completed_at=? WHERE id=? AND user_id=?").bind(completing ? now : null, action.milestoneId, id),
      env.DB.prepare("INSERT OR IGNORE INTO coin_ledger (id,user_id,amount,reason,source_type,source_id,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), id, completing ? milestone.reward : -milestone.reward, completing ? "Milestone complete" : "Milestone reopened", completing ? "milestone" : "milestone-reversal", action.milestoneId, now),
    ]);
  } else if (action.type === "purchase") {
    const item = await env.DB.prepare("SELECT id,price FROM cosmetics WHERE id=?").bind(action.cosmeticId).first<{ id: string; price: number }>();
    if (!item) return Response.json({ error: "Cosmetic not found" }, { status: 404 });
    if (await balance(id) < item.price) return Response.json({ error: "Insufficient coins" }, { status: 409 });
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO user_cosmetics (user_id,cosmetic_id,purchased_at) VALUES (?,?,?)").bind(id, item.id, now),
      env.DB.prepare("INSERT OR IGNORE INTO coin_ledger (id,user_id,amount,reason,source_type,source_id,created_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(), id, -item.price, "Cosmetic purchased", "purchase", item.id, now),
    ]);
  } else if (action.type === "equip") {
    const item = await env.DB.prepare("SELECT c.id,c.kind FROM cosmetics c JOIN user_cosmetics u ON u.cosmetic_id=c.id WHERE c.id=? AND u.user_id=?").bind(action.cosmeticId, id).first<{ id: string; kind: string }>();
    if (!item) return Response.json({ error: "Cosmetic is not owned" }, { status: 403 });
    const column = item.kind === "theme" ? "equipped_theme" : "equipped_badge";
    await env.DB.prepare(`UPDATE users SET ${column}=? WHERE id=?`).bind(item.id, id).run();
  } else {
    return Response.json({ error: "Unknown action" }, { status: 400 });
  }

  return Response.json({ ok: true, balance: await balance(id) });
}
