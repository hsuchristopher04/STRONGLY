import { createSession, digest, ensureAuthTables, normalizeEmail, sessionCookie, userIdFor } from "../../../auth";
import { db } from "../../../../db";
import { consumeRateLimit, INVALID_CODE_MESSAGE, limited, noStoreJson, requestAddress } from "../../../auth-security";

const env = { DB: db };

export async function POST(request: Request) {
  await ensureAuthTables();
  const body = await request.json().catch(() => null) as { email?: string; code?: string } | null;
  const email = normalizeEmail(body?.email ?? "");
  const code = body?.code?.trim() ?? "";
  if (!email || !/^\d{6}$/.test(code)) return noStoreJson({ error: "Enter a valid email address and six-digit code." }, { status: 400 });
  const ipLimit = await consumeRateLimit({ scope: "sign-in-attempt-ip", identifier: requestAddress(request), limit: 50, windowMs: 60 * 60_000, blockMs: 15 * 60_000 });
  if (!ipLimit.allowed) return limited(ipLimit.retryAfterSeconds, "Too many verification attempts. Please try again later.");
  const emailLimit = await consumeRateLimit({ scope: "sign-in-attempt-email", identifier: email, limit: 10, windowMs: 15 * 60_000, blockMs: 15 * 60_000 });
  if (!emailLimit.allowed) return limited(emailLimit.retryAfterSeconds, "Too many verification attempts. Please try again later.");
  const item = await env.DB.prepare("SELECT id,code_hash,expires_at,attempts FROM auth_codes WHERE email=? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1")
    .bind(email).first<{ id: string; code_hash: string; expires_at: string; attempts: number }>();
  if (!item || item.attempts >= 5 || item.expires_at <= new Date().toISOString()) return noStoreJson({ error: INVALID_CODE_MESSAGE }, { status: 400 });
  if (await digest(`${item.id}:${code}`) !== item.code_hash) {
    await env.DB.prepare("UPDATE auth_codes SET attempts=attempts+1 WHERE id=?").bind(item.id).run();
    return noStoreJson({ error: INVALID_CODE_MESSAGE }, { status: 400 });
  }
  const proposedUserId = userIdFor(email);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id,email,display_name,timezone,created_at) VALUES (?,?,?,'America/New_York',?) ON CONFLICT(email) DO NOTHING").bind(proposedUserId, email, email.split("@")[0], now),
    env.DB.prepare("UPDATE auth_codes SET consumed_at=? WHERE id=?").bind(now, item.id),
  ]);
  const account = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first<{ id: string }>();
  if (!account) return noStoreJson({ error: "We couldn't complete sign-in. Please request a new code." }, { status: 500 });
  const session = await createSession(account.id);
  const response = noStoreJson({ ok: true });
  response.headers.append("set-cookie", sessionCookie(session.token, session.expiresAt, new URL(request.url).protocol === "https:"));
  return response;
}
