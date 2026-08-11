import { db } from "../../../../db";
import { digest, getAuthUser, normalizeEmail } from "../../../auth";

export async function POST(request: Request) {
  const auth = await getAuthUser();
  if (!auth) return Response.json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json().catch(() => null) as { email?: string; code?: string } | null;
  const newEmail = normalizeEmail(body?.email ?? "");
  const code = body?.code?.trim() ?? "";
  if (!newEmail || !/^\d{6}$/.test(code)) return Response.json({ error: "Enter the six-digit code." }, { status: 400 });
  const item = await db.prepare("SELECT id,code_hash,expires_at,attempts FROM email_change_codes WHERE user_id=? AND new_email=? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1")
    .bind(auth.id, newEmail).first<{ id: string; code_hash: string; expires_at: string; attempts: number }>();
  if (!item || item.attempts >= 5 || item.expires_at <= new Date().toISOString()) return Response.json({ error: "That code has expired. Request a new one." }, { status: 400 });
  if (await digest(`${item.id}:${code}`) !== item.code_hash) {
    await db.prepare("UPDATE email_change_codes SET attempts=attempts+1 WHERE id=? AND user_id=?").bind(item.id, auth.id).run();
    return Response.json({ error: "That code is incorrect." }, { status: 400 });
  }
  if (await db.prepare("SELECT id FROM users WHERE email=? AND id<>?").bind(newEmail, auth.id).first()) return Response.json({ error: "That email is already associated with another account." }, { status: 409 });
  const now = new Date().toISOString();
  await db.transaction(async (transaction) => {
    await transaction.prepare("UPDATE users SET email=? WHERE id=?").bind(newEmail, auth.id).run();
    await transaction.prepare("UPDATE email_change_codes SET consumed_at=? WHERE id=? AND user_id=?").bind(now, item.id, auth.id).run();
    await transaction.prepare("DELETE FROM email_change_codes WHERE user_id=? AND id<>?").bind(auth.id, item.id).run();
  });
  return Response.json({ ok: true, email: newEmail });
}
