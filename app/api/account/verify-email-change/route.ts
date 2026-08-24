import { db } from "../../../../db";
import { digest, getAuthUser, normalizeEmail } from "../../../auth";
import { consumeRateLimit, INVALID_CODE_MESSAGE, limited, noStoreJson, requestAddress } from "../../../auth-security";

export async function POST(request: Request) {
  const auth = await getAuthUser();
  if (!auth) return noStoreJson({ error: "Authentication required" }, { status: 401 });
  const body = await request.json().catch(() => null) as { email?: string; code?: string } | null;
  const newEmail = normalizeEmail(body?.email ?? "");
  const code = body?.code?.trim() ?? "";
  if (!newEmail || !/^\d{6}$/.test(code)) return noStoreJson({ error: "Enter the six-digit code." }, { status: 400 });
  const ipLimit = await consumeRateLimit({ scope: "email-change-attempt-ip", identifier: requestAddress(request), limit: 50, windowMs: 60 * 60_000, blockMs: 15 * 60_000 });
  if (!ipLimit.allowed) return limited(ipLimit.retryAfterSeconds, "Too many verification attempts. Please try again later.");
  const userLimit = await consumeRateLimit({ scope: "email-change-attempt-user", identifier: auth.id, limit: 10, windowMs: 15 * 60_000, blockMs: 15 * 60_000 });
  if (!userLimit.allowed) return limited(userLimit.retryAfterSeconds, "Too many verification attempts. Please try again later.");
  const item = await db.prepare("SELECT id,code_hash,expires_at,attempts FROM email_change_codes WHERE user_id=? AND new_email=? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1")
    .bind(auth.id, newEmail).first<{ id: string; code_hash: string; expires_at: string; attempts: number }>();
  if (!item || item.attempts >= 5 || item.expires_at <= new Date().toISOString()) return noStoreJson({ error: INVALID_CODE_MESSAGE }, { status: 400 });
  if (await digest(`${item.id}:${code}`) !== item.code_hash) {
    await db.prepare("UPDATE email_change_codes SET attempts=attempts+1 WHERE id=? AND user_id=?").bind(item.id, auth.id).run();
    return noStoreJson({ error: INVALID_CODE_MESSAGE }, { status: 400 });
  }
  if (await db.prepare("SELECT id FROM users WHERE email=? AND id<>?").bind(newEmail, auth.id).first()) return noStoreJson({ error: "That email address cannot be used." }, { status: 400 });
  const now = new Date().toISOString();
  await db.transaction(async (transaction) => {
    await transaction.prepare("UPDATE users SET email=? WHERE id=?").bind(newEmail, auth.id).run();
    await transaction.prepare("UPDATE email_change_codes SET consumed_at=? WHERE id=? AND user_id=?").bind(now, item.id, auth.id).run();
    await transaction.prepare("DELETE FROM email_change_codes WHERE user_id=? AND id<>?").bind(auth.id, item.id).run();
  });
  return noStoreJson({ ok: true, email: newEmail });
}
