import { db } from "../../../../db";
import { digest, getAuthUser, normalizeEmail } from "../../../auth";
import { EmailDeliveryError, mayExposeDevelopmentCode, sendVerificationEmail } from "../../../auth-email";

export async function POST(request: Request) {
  const auth = await getAuthUser();
  if (!auth) return Response.json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json().catch(() => null) as { email?: string } | null;
  const newEmail = normalizeEmail(body?.email ?? "");
  if (!newEmail) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  if (newEmail === auth.email) return Response.json({ error: "That is already your account email." }, { status: 400 });
  if (await db.prepare("SELECT id FROM users WHERE email=? AND id<>?").bind(newEmail, auth.id).first()) return Response.json({ error: "That email is already associated with another account." }, { status: 409 });
  const recent = await db.prepare("SELECT created_at FROM email_change_codes WHERE user_id=? ORDER BY created_at DESC LIMIT 1").bind(auth.id).first<{ created_at: string }>();
  if (recent && Date.now() - new Date(recent.created_at).getTime() < 60_000) return Response.json({ error: "Wait a minute before requesting another code." }, { status: 429 });

  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  const id = crypto.randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 10 * 60_000);
  await db.prepare("INSERT INTO email_change_codes (id,user_id,new_email,code_hash,created_at,expires_at,attempts) VALUES (?,?,?,?,?,?,0)")
    .bind(id, auth.id, newEmail, await digest(`${id}:${code}`), createdAt.toISOString(), expiresAt.toISOString()).run();
  if (mayExposeDevelopmentCode(request.url)) return Response.json({ ok: true, devCode: code });
  try {
    await sendVerificationEmail({ to: newEmail, code, requestId: id, purpose: "email-change" });
    return Response.json({ ok: true });
  } catch (error) {
    await db.prepare("DELETE FROM email_change_codes WHERE id=? AND user_id=?").bind(id, auth.id).run();
    return Response.json({ error: error instanceof Error ? error.message : "We could not send the code." }, { status: error instanceof EmailDeliveryError ? error.status : 502 });
  }
}
