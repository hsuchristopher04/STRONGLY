import { cookies } from "next/headers";
import { db } from "../db";

export type AuthUser = { id: string; email: string; displayName: string; fullName: string | null };
export const SESSION_COOKIE = "strongly_session";

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
  ]);
}

export async function getAuthUser(): Promise<AuthUser | null> {
  await ensureAuthTables();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await database().prepare("SELECT u.id,u.email,u.display_name FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?")
    .bind(await digest(token), new Date().toISOString()).first<{ id: string; email: string; display_name: string }>();
  return row ? { id: row.id, email: row.email, displayName: row.display_name, fullName: row.display_name } : null;
}

export async function createSession(userId: string) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 30 * 86_400_000);
  await database().prepare("INSERT INTO auth_sessions (id,user_id,token_hash,created_at,expires_at) VALUES (?,?,?,?,?)")
    .bind(crypto.randomUUID(), userId, await digest(token), createdAt.toISOString(), expiresAt.toISOString()).run();
  return { token, expiresAt };
}

export async function deleteSession(token: string | undefined) {
  if (token) await database().prepare("DELETE FROM auth_sessions WHERE token_hash=?").bind(await digest(token)).run();
}
