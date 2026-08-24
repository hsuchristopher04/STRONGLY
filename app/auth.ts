import { cookies } from "next/headers";
import { db } from "../db";

export type AuthUser = { id: string; email: string; displayName: string; fullName: string | null };
export const SESSION_COOKIE = "strongly_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function database() {
  return db;
}

export async function digest(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

export function userIdFor(email: string) {
  return `user_${email.replace(/[^a-z0-9]/g, "_")}`;
}

export async function ensureAuthTables() {
  const db = database();
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS auth_codes (id text PRIMARY KEY NOT NULL,email text NOT NULL,code_hash text NOT NULL,created_at text NOT NULL,expires_at text NOT NULL,consumed_at text,attempts integer DEFAULT 0 NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS auth_codes_email_created ON auth_codes (email,created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS auth_sessions (id text PRIMARY KEY NOT NULL,user_id text NOT NULL,token_hash text NOT NULL UNIQUE,created_at text NOT NULL,expires_at text NOT NULL,FOREIGN KEY (user_id) REFERENCES users(id))"),
    db.prepare("CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions (user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions (expires_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS auth_rate_limits (scope text NOT NULL,key_hash text NOT NULL,window_started_at text NOT NULL,attempts integer DEFAULT 0 NOT NULL,blocked_until text,updated_at text NOT NULL,PRIMARY KEY(scope,key_hash))"),
    db.prepare("CREATE INDEX IF NOT EXISTS auth_rate_limits_blocked ON auth_rate_limits (blocked_until)"),
  ]);
}

export async function getAuthUser(): Promise<AuthUser | null> {
  await ensureAuthTables();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = await digest(token);
  const currentTime = new Date();
  const now = currentTime.toISOString();
  const oldestAllowed = new Date(currentTime.getTime() - SESSION_TTL_SECONDS * 1000).toISOString();
  const row = await database().prepare("SELECT u.id,u.email,u.display_name FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND s.created_at>?")
    .bind(tokenHash, now, oldestAllowed).first<{ id: string; email: string; display_name: string }>();
  if (!row) await database().prepare("DELETE FROM auth_sessions WHERE token_hash=? AND (expires_at<=? OR created_at<=?)").bind(tokenHash, now, oldestAllowed).run();
  return row ? { id: row.id, email: row.email, displayName: row.display_name, fullName: row.display_name } : null;
}

export async function createSession(userId: string) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_SECONDS * 1000);
  await database().prepare("DELETE FROM auth_sessions WHERE expires_at<=?").bind(createdAt.toISOString()).run();
  await database().prepare("INSERT INTO auth_sessions (id,user_id,token_hash,created_at,expires_at) VALUES (?,?,?,?,?)")
    .bind(crypto.randomUUID(), userId, await digest(token), createdAt.toISOString(), expiresAt.toISOString()).run();
  return { token, expiresAt };
}

export function sessionCookie(token: string, expiresAt: Date, secure: boolean) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}; Expires=${expiresAt.toUTCString()}; Priority=High${secure ? "; Secure" : ""}`;
}

export function expiredSessionCookie(secure: boolean) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Priority=High${secure ? "; Secure" : ""}`;
}

export async function deleteSession(token: string | undefined) {
  if (token) await database().prepare("DELETE FROM auth_sessions WHERE token_hash=?").bind(await digest(token)).run();
}
