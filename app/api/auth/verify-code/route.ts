import { createSession, digest, ensureAuthTables, normalizeEmail, SESSION_COOKIE, userIdFor } from "../../../auth";
import { db } from "../../../../db";

const env = { DB: db };

export async function POST(request: Request) {
  await ensureAuthTables();
  const body = await request.json().catch(() => null) as { email?: string; code?: string } | null;
  const email = normalizeEmail(body?.email ?? "");
  const code = body?.code?.trim() ?? "";
  if (!email || !/^\d{6}$/.test(code)) return Response.json({ error: "Enter the six-digit code." }, { status: 400 });
  const item = await env.DB.prepare("SELECT id,code_hash,expires_at,attempts FROM auth_codes WHERE email=? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1")
    .bind(email).first<{ id: string; code_hash: string; expires_at: string; attempts: number }>();
  if (!item || item.attempts >= 5 || item.expires_at <= new Date().toISOString()) return Response.json({ error: "That code has expired. Request a new one." }, { status: 400 });
  if (await digest(`${item.id}:${code}`) !== item.code_hash) {
    await env.DB.prepare("UPDATE auth_codes SET attempts=attempts+1 WHERE id=?").bind(item.id).run();
    return Response.json({ error: "That code is incorrect." }, { status: 400 });
  }
  const proposedUserId = userIdFor(email);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id,email,display_name,timezone,created_at) VALUES (?,?,?,'America/New_York',?) ON CONFLICT(email) DO NOTHING").bind(proposedUserId, email, email.split("@")[0], now),
    env.DB.prepare("UPDATE auth_codes SET consumed_at=? WHERE id=?").bind(now, item.id),
  ]);
  const account = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first<{ id: string }>();
  if (!account) return Response.json({ error: "Unable to access that account." }, { status: 500 });
  const session = await createSession(account.id);
  const response = Response.json({ ok: true });
  response.headers.append("set-cookie", `${SESSION_COOKIE}=${session.token}; Path=/; HttpOnly; SameSite=Lax; Expires=${session.expiresAt.toUTCString()}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`);
  return response;
}
